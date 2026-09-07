const test = require('node:test');
const assert = require('node:assert/strict');
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

async function request(baseUrl, url, options = {}, cookie = '') {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  if (options.body && !(options.body instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${url}`, {
    method: options.method || 'GET',
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : await response.text();
  return { response, payload };
}

async function login(baseUrl, username, password) {
  const { response, payload } = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(response.status, 200, JSON.stringify(payload));
  return response.headers.get('set-cookie').split(';')[0];
}

test('alur konten lengkap dan akses Media Library', { timeout: 30_000 }, async t => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'media-hub-test-'));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: path.join(runtime, 'data'),
      UPLOAD_DIR: path.join(runtime, 'uploads'),
      BACKUP_DIR: path.join(runtime, 'backups'),
      APP_PEPPER: 'integration-test-pepper-media-hub-2026',
      INITIAL_ADMIN_PASSWORD: 'Admin12345',
      SEED_DEMO: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(runtime, { recursive: true, force: true });
  });
  await waitForHealth(baseUrl, child);

  const loginPage = await fetch(`${baseUrl}/`);
  assert.equal(loginPage.status, 200);
  assert.equal(loginPage.headers.get('content-security-policy').includes('upgrade-insecure-requests'), false);

  const adminCookie = await login(baseUrl, 'admin', 'Admin12345');
  const vendorCookie = await login(baseUrl, 'vendor', 'Demo12345');
  const reviewerCookie = await login(baseUrl, 'reviewer', 'Demo12345');
  const approverCookie = await login(baseUrl, 'approver', 'Demo12345');
  const uploaderCookie = await login(baseUrl, 'uploader', 'Demo12345');

  const assignments = await request(baseUrl, '/api/meta/assignments', {}, adminCookie);
  assert.equal(assignments.response.status, 200);
  const vendorId = assignments.payload.vendors[0].id;
  const byRole = role => assignments.payload.users.find(user => user.role === role).id;

  const created = await request(baseUrl, '/api/contents', {
    method: 'POST',
    body: {
      title: 'Konten Integrasi AINET', brandId: 'brand-ainet', channelIds: ['channel-instagram'],
      contentType: 'CAROUSEL', category: 'EDUCATION', approvalLevel: 'REGULAR', priority: 'HIGH',
      brief: 'Carousel lima slide sesuai brand guideline.', vendorId,
      coordinatorId: byRole('COORDINATOR'), reviewerId: byRole('REVIEWER'),
      approverId: byRole('APPROVER'), uploaderId: byRole('UPLOADER'),
      dueDate: '2026-09-10', publishAt: '2026-09-11T09:00:00.000Z'
    }
  }, adminCookie);
  assert.equal(created.response.status, 201, `${JSON.stringify(created.payload)}\n${stderr}`);
  const contentId = created.payload.item.id;

  for (const toStatus of ['BRIEFED', 'ASSIGNED']) {
    const result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus } }, adminCookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  }
  let result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'IN_PRODUCTION' } }, vendorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));

  const draftForm = new FormData();
  draftForm.set('file', new Blob(['%PDF-1.4 integration draft'], { type: 'application/pdf' }), 'draft-v1.pdf');
  draftForm.set('caption', 'Internet stabil untuk keluarga.');
  draftForm.set('changeNote', 'Versi pertama.');
  result = await request(baseUrl, `/api/contents/${contentId}/version`, { method: 'POST', body: draftForm }, vendorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  assert.equal(result.payload.item.status, 'DRAFT_SUBMITTED');

  result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'IN_REVIEW' } }, reviewerCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'APPROVAL_PENDING', note: 'Visual dan caption sesuai.' } }, reviewerCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'APPROVED', note: 'Disetujui.' } }, approverCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'SCHEDULED' } }, adminCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));

  const publication = new FormData();
  publication.set('channelId', 'channel-instagram');
  publication.set('platformUrl', 'https://example.test/konten-ainet');
  publication.set('publishedAt', '2026-09-11T09:00:00.000Z');
  publication.set('reach', '1200');
  publication.set('engagement', '84');
  publication.set('leads', '9');
  result = await request(baseUrl, `/api/contents/${contentId}/publication`, { method: 'POST', body: publication }, uploaderCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  assert.equal(result.payload.item.status, 'PUBLISHED');

  const assetForm = new FormData();
  assetForm.set('title', 'Brand Guideline AINET');
  assetForm.set('category', 'BRAND_CENTER');
  assetForm.set('brandId', 'brand-ainet');
  assetForm.set('file', new Blob(['%PDF-1.4 brand guideline'], { type: 'application/pdf' }), 'brand-guideline.pdf');
  const asset = await request(baseUrl, '/api/library', { method: 'POST', body: assetForm }, adminCookie);
  assert.equal(asset.response.status, 201, JSON.stringify(asset.payload));
  const vendorLibrary = await request(baseUrl, '/api/library?status=ACTIVE', {}, vendorCookie);
  assert.equal(vendorLibrary.response.status, 200);
  assert.equal(vendorLibrary.payload.items.some(item => item.id === asset.payload.id && item.canDownload), true);

  const locked = await request(baseUrl, `/api/library/${asset.payload.id}`, { method: 'PATCH', body: { status: 'EXPIRED' } }, adminCookie);
  assert.equal(locked.response.status, 200);
  const lockedForVendor = await request(baseUrl, `/api/library/${asset.payload.id}`, {}, vendorCookie);
  assert.equal(lockedForVendor.payload.item.canDownload, false);
  const forbiddenUsers = await request(baseUrl, '/api/users', {}, vendorCookie);
  assert.equal(forbiddenUsers.response.status, 403);

  const report = await request(baseUrl, '/api/reports/summary?from=2026-01-01&to=2026-12-31', {}, adminCookie);
  assert.equal(report.response.status, 200);
  assert.equal(report.payload.metrics.leads >= 9, true);
});
