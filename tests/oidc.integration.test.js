const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server berhenti dengan kode ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server tidak siap tepat waktu.');
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function jwt(privateKey, kid, claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

async function requestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

function cookie(response, name) {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0] || '';
}

test('login OIDC membuat akun, role, sesi, dan logout AXINDO ID', { timeout: 30_000 }, async t => {
  const providerPort = await freePort();
  const appPort = await freePort();
  const issuer = `http://127.0.0.1:${providerPort}/application/o/media-hub/`;
  const appUrl = `http://127.0.0.1:${appPort}`;
  const callbackUrl = `${appUrl}/api/auth/oidc/callback`;
  const clientId = 'media-hub-test';
  const clientSecret = 'test-client-secret';
  const kid = 'test-key';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };
  const codes = new Map();

  const provider = http.createServer(async (req, res) => {
    const url = new URL(req.url, issuer);
    if (url.pathname.includes('.well-known/openid-configuration')) {
      return json(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}authorize/`,
        token_endpoint: `${issuer}token/`,
        userinfo_endpoint: `${issuer}userinfo/`,
        jwks_uri: `${issuer}jwks/`,
        end_session_endpoint: `${issuer}logout/`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile', 'email']
      });
    }
    if (url.pathname.endsWith('/authorize/')) {
      const code = crypto.randomBytes(16).toString('hex');
      codes.set(code, {
        nonce: url.searchParams.get('nonce'),
        challenge: url.searchParams.get('code_challenge'),
        redirectUri: url.searchParams.get('redirect_uri')
      });
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      redirect.searchParams.set('code', code);
      redirect.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { location: redirect.href });
      return res.end();
    }
    if (url.pathname.endsWith('/token/')) {
      const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
      const separator = auth.indexOf(':');
      assert.equal(decodeURIComponent(auth.slice(0, separator)), clientId);
      assert.equal(decodeURIComponent(auth.slice(separator + 1)), clientSecret);
      const body = new URLSearchParams(await requestBody(req));
      const stored = codes.get(body.get('code'));
      assert.ok(stored);
      assert.equal(body.get('redirect_uri'), stored.redirectUri);
      const actualChallenge = crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url');
      assert.equal(actualChallenge, stored.challenge);
      const now = Math.floor(Date.now() / 1000);
      return json(res, 200, {
        access_token: 'access-token', token_type: 'Bearer', expires_in: 300,
        id_token: jwt(privateKey, kid, {
          iss: issuer, sub: 'authentik-user-123', aud: clientId, iat: now, exp: now + 300,
          nonce: stored.nonce, email: 'media@axindo.my.id', email_verified: true,
          name: 'Koordinator Media', preferred_username: 'media'
        })
      });
    }
    if (url.pathname.endsWith('/userinfo/')) {
      assert.equal(req.headers.authorization, 'Bearer access-token');
      return json(res, 200, {
        sub: 'authentik-user-123', email: 'media@axindo.my.id', email_verified: true,
        name: 'Koordinator Media', preferred_username: 'media', groups: ['Tim Media']
      });
    }
    if (url.pathname.endsWith('/jwks/')) return json(res, 200, { keys: [publicJwk] });
    if (url.pathname.endsWith('/logout/')) {
      const target = url.searchParams.get('post_logout_redirect_uri') || appUrl;
      res.writeHead(302, { location: target });
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => provider.listen(providerPort, '127.0.0.1', resolve));

  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'media-hub-oidc-test-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(appPort),
      DATA_DIR: path.join(runtime, 'data'),
      UPLOAD_DIR: path.join(runtime, 'uploads'),
      BACKUP_DIR: path.join(runtime, 'backups'),
      APP_PEPPER: 'integration-test-pepper-oidc-media-hub-2026',
      INITIAL_ADMIN_PASSWORD: 'Admin12345',
      SEED_DEMO: 'true',
      OIDC_ENABLED: 'true',
      OIDC_ALLOW_INSECURE: 'true',
      OIDC_ISSUER_URL: issuer,
      OIDC_CLIENT_ID: clientId,
      OIDC_CLIENT_SECRET: clientSecret,
      OIDC_REDIRECT_URI: callbackUrl,
      OIDC_POST_LOGOUT_REDIRECT_URI: `${appUrl}/`,
      OIDC_ROLE_MAPPING_JSON: JSON.stringify({ 'Tim Media': 'COORDINATOR' })
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise(resolve => provider.close(resolve));
    fs.rmSync(runtime, { recursive: true, force: true });
  });
  await waitForHealth(appUrl, child);

  const publicConfig = await fetch(`${appUrl}/api/public/config`).then(response => response.json());
  assert.equal(publicConfig.auth.oidcEnabled, true);
  assert.equal(publicConfig.auth.oidcReady, true);
  assert.equal(publicConfig.auth.localLoginEnabled, true);
  assert.deepEqual(publicConfig.auth.localPersonalRoles, ['SUPER_ADMIN', 'VENDOR']);

  const start = await fetch(`${appUrl}/api/auth/oidc/start`, { redirect: 'manual' });
  assert.equal(start.status, 302, stderr);
  const stateCookie = cookie(start, 'mh_oidc_state');
  assert.ok(stateCookie);
  const authorize = await fetch(start.headers.get('location'), { redirect: 'manual' });
  assert.equal(authorize.status, 302);
  const callback = await fetch(authorize.headers.get('location'), {
    redirect: 'manual', headers: { cookie: stateCookie }
  });
  assert.equal(callback.status, 303, stderr);
  assert.equal(callback.headers.get('location'), '/');
  const sessionCookie = cookie(callback, 'mh_session');
  assert.ok(sessionCookie);

  const bootstrapResponse = await fetch(`${appUrl}/api/bootstrap`, { headers: { cookie: sessionCookie } });
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrapResponse.status, 200, JSON.stringify(bootstrap));
  assert.equal(bootstrap.user.email, 'media@axindo.my.id');
  assert.equal(bootstrap.user.authSource, 'OIDC');
  assert.equal(bootstrap.user.role, 'COORDINATOR');

  const vendorLogin = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'vendor', password: 'Demo12345' })
  });
  assert.equal(vendorLogin.status, 200);
  const reviewerLogin = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'reviewer', password: 'Demo12345' })
  });
  assert.equal(reviewerLogin.status, 401);
  const adminLogin = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin12345' })
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = cookie(adminLogin, 'mh_session');
  assert.ok(adminCookie);

  const vendorListResponse = await fetch(`${appUrl}/api/vendors`, { headers: { cookie: adminCookie } });
  const vendorList = await vendorListResponse.json();
  assert.equal(vendorListResponse.status, 200);
  assert.ok(vendorList.items[0]?.id);
  const personalVendorResponse = await fetch(`${appUrl}/api/users`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Vendor Personal', username: 'vendorpersonal', password: 'Vendor12345',
      role: 'VENDOR', vendorId: vendorList.items[0].id
    })
  });
  assert.equal(personalVendorResponse.status, 201, await personalVendorResponse.text());
  const personalVendorLogin = await fetch(`${appUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'vendorpersonal', password: 'Vendor12345' })
  });
  assert.equal(personalVendorLogin.status, 200);

  const localCoordinatorResponse = await fetch(`${appUrl}/api/users`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Koordinator Lokal', username: 'koordinatorlokal', password: 'Koordinator12345',
      role: 'COORDINATOR'
    })
  });
  assert.equal(localCoordinatorResponse.status, 400);

  const logoutResponse = await fetch(`${appUrl}/api/auth/logout`, {
    method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json' }, body: '{}'
  });
  const logout = await logoutResponse.json();
  assert.equal(logoutResponse.status, 200);
  assert.equal(new URL(logout.logoutUrl).origin, new URL(issuer).origin);
});
