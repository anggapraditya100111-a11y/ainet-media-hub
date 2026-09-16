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
    server.unref(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server berhenti dengan kode ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server tidak siap tepat waktu.');
}

async function request(baseUrl, url, options = {}, cookie = '') {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  let body;
  if (options.body instanceof FormData || Buffer.isBuffer(options.body)) body = options.body;
  else if (options.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(options.body); }
  const response = await fetch(`${baseUrl}${url}`, { method: options.method || 'GET', headers, body });
  const payload = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : await response.text();
  return { response, payload };
}

async function login(baseUrl, username, password) {
  const { response, payload } = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(response.status, 200, JSON.stringify(payload));
  return response.headers.get('set-cookie').split(';')[0];
}

async function transition(baseUrl, contentId, toStatus, cookie, note = '') {
  const result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus, note } }, cookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return result.payload.item;
}

async function chunkUpload(baseUrl, contentId, cookie, name, contents, message = '') {
  const buffer = Buffer.from(contents);
  let result = await request(baseUrl, `/api/contents/${contentId}/uploads/init`, { method: 'POST', body: {
    phase: 'PRODUCTION_RESULT', filename: name, mimeType: 'application/pdf', totalSize: buffer.length, message
  } }, cookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const upload = result.payload;
  result = await request(baseUrl, `/api/uploads/${upload.id}/chunks/0`, {
    method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: buffer
  }, cookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/uploads/${upload.id}/complete`, { method: 'POST', body: {} }, cookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  return result.payload.id;
}

test('alur v0.4.0: kolaborasi, approval PIN, dan publikasi multi-platform', { timeout: 30_000 }, async t => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'media-hub-v4-test-'));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_DIR: path.join(runtime, 'data'), UPLOAD_DIR: path.join(runtime, 'uploads'), BACKUP_DIR: path.join(runtime, 'backups'), APP_PEPPER: 'integration-test-pepper-media-hub-v4', INITIAL_ADMIN_PASSWORD: 'Admin12345', SEED_DEMO: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  t.after(() => { child.kill('SIGTERM'); fs.rmSync(runtime, { recursive: true, force: true }); });
  await waitForHealth(baseUrl, child);

  const adminCookie = await login(baseUrl, 'admin', 'Admin12345');
  const vendorCookie = await login(baseUrl, 'vendor', 'Demo12345');
  const uploaderCookie = await login(baseUrl, 'uploader', 'Demo12345');
  const assignments = await request(baseUrl, '/api/meta/assignments', {}, adminCookie);
  assert.deepEqual([...new Set(assignments.payload.users.map(user => user.role))].sort(), ['COORDINATOR', 'MANAGEMENT', 'UPLOADER']);
  const vendorId = assignments.payload.vendors[0].id;
  const byRole = role => assignments.payload.users.find(user => user.role === role).id;

  const created = await request(baseUrl, '/api/contents', { method: 'POST', body: {
    title: 'Video Edukasi AINET', brandId: 'brand-ainet', channelIds: ['channel-instagram', 'channel-tiktok'],
    contentType: 'REELS', brief: 'Video 30 detik dengan script edukasi.', vendorId, coordinatorId: byRole('COORDINATOR')
  } }, adminCookie);
  assert.equal(created.response.status, 201, `${JSON.stringify(created.payload)}\n${stderr}`);
  const contentId = created.payload.item.id;
  await transition(baseUrl, contentId, 'BRIEFED', adminCookie);
  await transition(baseUrl, contentId, 'ASSIGNED', adminCookie);

  let result = await request(baseUrl, `/api/contents/${contentId}/messages`, { method: 'POST', body: { phase: 'PRE_PRODUCTION', message: 'Draft script sudah disiapkan untuk dibahas.' } }, vendorCookie);
  assert.equal(result.response.status, 201);
  result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'IN_PRODUCTION' } }, vendorCookie);
  assert.equal(result.response.status, 403, 'Vendor tidak boleh menyetujui mulai produksi sendiri');
  await transition(baseUrl, contentId, 'IN_PRODUCTION', adminCookie);

  const firstFileId = await chunkUpload(baseUrl, contentId, vendorCookie, 'hasil-v1.pdf', '%PDF-1.4 hasil pertama', 'Hasil produksi versi pertama.');
  result = await request(baseUrl, `/api/contents/${contentId}`, {}, vendorCookie);
  assert.equal(result.payload.item.status, 'IN_PRODUCTION', 'Upload tidak mengubah status otomatis');
  result = await request(baseUrl, `/api/contents/${contentId}/submit-result`, { method: 'POST', body: { note: 'Mohon review hasil pertama.' } }, vendorCookie);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.item.status, 'DRAFT_SUBMITTED');

  const share = await request(baseUrl, `/api/contents/${contentId}/share-links`, { method: 'POST', body: { fileIds: [firstFileId] } }, adminCookie);
  assert.equal(share.response.status, 201);
  const shareToken = new URL(share.payload.url, baseUrl).searchParams.get('token');
  const publicShare = await request(baseUrl, `/api/public/shares/${shareToken}`);
  assert.equal(publicShare.response.status, 200);
  assert.equal(publicShare.payload.files.length, 1);
  assert.equal(Object.hasOwn(publicShare.payload.snapshot, 'budget'), false);

  const approval = await request(baseUrl, `/api/contents/${contentId}/director-approvals`, { method: 'POST', body: { directorId: byRole('MANAGEMENT'), fileIds: [firstFileId] } }, adminCookie);
  assert.equal(approval.response.status, 201, JSON.stringify(approval.payload));
  assert.match(approval.payload.pin, /^\d{8}$/);
  const approvalToken = new URL(approval.payload.url, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/public/approvals/${approvalToken}`);
  assert.equal(result.response.status, 401);
  const unlocked = await request(baseUrl, `/api/public/approvals/${approvalToken}/unlock`, { method: 'POST', body: { pin: approval.payload.pin } });
  assert.equal(unlocked.response.status, 200);
  const approvalCookie = unlocked.response.headers.get('set-cookie').split(';')[0];
  result = await request(baseUrl, `/api/public/approvals/${approvalToken}`, {}, approvalCookie);
  assert.equal(result.response.status, 200);
  assert.equal(Object.hasOwn(result.payload.content, 'pin_hash'), false);
  const ranged = await request(baseUrl, `/api/public/approvals/${approvalToken}/files/${firstFileId}`, { headers: { range: 'bytes=0-3' } }, approvalCookie);
  assert.equal(ranged.response.status, 206);
  result = await request(baseUrl, `/api/public/approvals/${approvalToken}/decision`, { method: 'POST', body: { decision: 'REVISION', note: 'Perbaiki bagian penutup.' } }, approvalCookie);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.status, 'REVISION_REQUIRED');

  await transition(baseUrl, contentId, 'IN_PRODUCTION', vendorCookie);
  const finalFileId = await chunkUpload(baseUrl, contentId, vendorCookie, 'hasil-final.pdf', '%PDF-1.4 hasil final', 'Revisi final.');
  result = await request(baseUrl, `/api/contents/${contentId}/submit-result`, { method: 'POST', body: { note: 'Revisi sudah selesai.' } }, vendorCookie);
  assert.equal(result.response.status, 200);
  const finalApproval = await request(baseUrl, `/api/contents/${contentId}/director-approvals`, { method: 'POST', body: { directorId: byRole('MANAGEMENT'), fileIds: [finalFileId] } }, adminCookie);
  assert.equal(finalApproval.response.status, 201, JSON.stringify(finalApproval.payload));
  const finalToken = new URL(finalApproval.payload.url, baseUrl).searchParams.get('token');
  const finalUnlock = await request(baseUrl, `/api/public/approvals/${finalToken}/unlock`, { method: 'POST', body: { pin: finalApproval.payload.pin } });
  const finalCookie = finalUnlock.response.headers.get('set-cookie').split(';')[0];
  result = await request(baseUrl, `/api/public/approvals/${finalToken}/decision`, { method: 'POST', body: { decision: 'APPROVED', note: 'Disetujui.' } }, finalCookie);
  assert.equal(result.payload.status, 'APPROVED');

  result = await request(baseUrl, `/api/contents/${contentId}/schedules`, { method: 'POST', body: { plans: [
    { channelId: 'channel-instagram', scheduledAt: '2026-09-20T10:00', uploaderId: byRole('UPLOADER') },
    { channelId: 'channel-tiktok', scheduledAt: '2026-09-20T11:00', uploaderId: byRole('UPLOADER') }
  ] } }, adminCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const schedules = await request(baseUrl, `/api/contents/${contentId}/schedules`, {}, uploaderCookie);
  assert.equal(schedules.payload.items.length, 2);
  for (let index = 0; index < schedules.payload.items.length; index += 1) {
    const form = new FormData(); form.set('platformUrl', `https://example.test/post-${index}`);
    result = await request(baseUrl, `/api/schedules/${schedules.payload.items[index].id}/publish`, { method: 'POST', body: form }, uploaderCookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
    const detail = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
    assert.equal(detail.payload.item.status, index === 0 ? 'SCHEDULED' : 'PUBLISHED');
  }
});
