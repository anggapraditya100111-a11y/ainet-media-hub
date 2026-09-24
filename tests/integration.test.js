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

async function chunkUpload(baseUrl, contentId, cookie, name, contents, message = '', phase = 'PRODUCTION_RESULT') {
  const buffer = Buffer.from(contents);
  let result = await request(baseUrl, `/api/contents/${contentId}/uploads/init`, { method: 'POST', body: {
    phase, filename: name, mimeType: 'application/pdf', totalSize: buffer.length, message
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
  const coordinatorCookie = await login(baseUrl, 'koordinator', 'Demo12345');
  const vendorCookie = await login(baseUrl, 'vendor', 'Demo12345');
  const uploaderCookie = await login(baseUrl, 'uploader', 'Demo12345');
  const managementCookie = await login(baseUrl, 'manajemen', 'Demo12345');
  let result = await request(baseUrl, '/api/users', { method: 'POST', body: {
    name: 'Petugas Upload Kedua', username: 'uploader2', password: 'Demo12345', role: 'UPLOADER'
  } }, adminCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const secondUploaderId = result.payload.id;
  const secondUploaderCookie = await login(baseUrl, 'uploader2', 'Demo12345');
  const directorPin = '77258816';
  result = await request(baseUrl, '/api/profile/approval-pin', { method: 'POST', body: { newPin: directorPin, confirmPin: directorPin } }, managementCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  const assignments = await request(baseUrl, '/api/meta/assignments', {}, adminCookie);
  assert.deepEqual([...new Set(assignments.payload.users.map(user => user.role))].sort(), ['COORDINATOR', 'MANAGEMENT', 'UPLOADER']);
  assert.equal(assignments.payload.users.find(user => user.role === 'MANAGEMENT').approval_pin_set, 1);
  const vendorId = assignments.payload.vendors[0].id;
  const byRole = role => assignments.payload.users.find(user => user.role === role).id;

  const created = await request(baseUrl, '/api/contents', { method: 'POST', body: {
    title: 'Video Edukasi AINET', brandId: 'brand-ainet', channelIds: ['channel-instagram', 'channel-tiktok'],
    contentType: 'REELS', brief: 'Video 30 detik dengan script edukasi.', vendorId, coordinatorId: byRole('COORDINATOR'),
    referenceUrls: 'https://www.instagram.com/contoh/\nhttps://example.test/referensi',
    vendorEditPermissions: ['brief', 'description', 'caption', 'hashtags', 'call_to_action', 'attachments']
  } }, adminCookie);
  assert.equal(created.response.status, 201, `${JSON.stringify(created.payload)}\n${stderr}`);
  const contentId = created.payload.item.id;
  await transition(baseUrl, contentId, 'BRIEFED', adminCookie);
  await transition(baseUrl, contentId, 'ASSIGNED', adminCookie);

  result = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
  assert.deepEqual(result.payload.item.referenceUrls, ['https://www.instagram.com/contoh/', 'https://example.test/referensi']);
  const briefReferenceId = await chunkUpload(baseUrl, contentId, vendorCookie, 'referensi-vendor.pdf', '%PDF-1.4 referensi vendor', 'Referensi tambahan vendor.', 'BRIEF');
  assert.ok(briefReferenceId);
  result = await request(baseUrl, `/api/contents/${contentId}/vendor-edits`, { method: 'POST', body: { fieldName: 'brief', addedValue: 'Tambahkan penutup dengan nomor WhatsApp.' } }, vendorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const vendorEditId = result.payload.id;
  result = await request(baseUrl, `/api/contents/${contentId}`, {}, vendorCookie);
  assert.equal(result.payload.item.brief, 'Video 30 detik dengan script edukasi.', 'usulan belum boleh langsung mengubah materi Koordinator');
  assert.equal(result.payload.vendorEdits[0].status, 'PENDING');
  result = await request(baseUrl, `/api/contents/${contentId}/vendor-description`, { method: 'PATCH', body: { description: 'hapus materi lama' } }, vendorCookie);
  assert.equal(result.response.status, 410, 'endpoint edit langsung lama harus dinonaktifkan');
  result = await request(baseUrl, `/api/contents/${contentId}/vendor-edits/${vendorEditId}/review`, { method: 'POST', body: { action: 'ACCEPT', note: 'Tambahan diterima.' } }, adminCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.brief, 'Video 30 detik dengan script edukasi.\n\nTambahkan penutup dengan nomor WhatsApp.');
  result = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
  assert.equal(result.payload.vendorEditAttributions.brief.vendorName, 'Studio Kreatif Nusantara');
  result = await request(baseUrl, `/api/contents/${contentId}/messages`, { method: 'POST', body: { phase: 'PRE_PRODUCTION', message: 'Draft script sudah disiapkan untuk dibahas.' } }, vendorCookie);
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
  assert.equal(Object.hasOwn(approval.payload, 'pin'), false, 'PIN Direksi tidak boleh dikirim ke Koordinator');
  const approvalToken = new URL(approval.payload.url, baseUrl).searchParams.get('token');
  const approvalHistory = await request(baseUrl, `/api/contents/${contentId}/director-approvals`, {}, adminCookie);
  assert.equal(approvalHistory.payload.items[0].url, approval.payload.url);
  result = await request(baseUrl, `/api/public/approvals/${approvalToken}`);
  assert.equal(result.response.status, 401);
  const unlocked = await request(baseUrl, `/api/public/approvals/${approvalToken}/unlock`, { method: 'POST', body: { pin: directorPin } });
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
  const finalUnlock = await request(baseUrl, `/api/public/approvals/${finalToken}/unlock`, { method: 'POST', body: { pin: directorPin } });
  const finalCookie = finalUnlock.response.headers.get('set-cookie').split(';')[0];
  result = await request(baseUrl, `/api/public/approvals/${finalToken}/decision`, { method: 'POST', body: { decision: 'APPROVED', note: 'Disetujui.' } }, finalCookie);
  assert.equal(result.payload.status, 'APPROVED');

  result = await request(baseUrl, `/api/contents/${contentId}/schedules`, { method: 'POST', body: { plans: [
    { channelId: 'channel-instagram', scheduledAt: '2026-09-20T10:00', uploaderId: byRole('UPLOADER') },
    { channelId: 'channel-tiktok', scheduledAt: '2026-09-20T11:00', uploaderId: byRole('UPLOADER') }
  ] } }, adminCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  let schedules = await request(baseUrl, `/api/contents/${contentId}/schedules`, {}, uploaderCookie);
  assert.equal(schedules.payload.items.length, 2);
  result = await request(baseUrl, `/api/contents/${contentId}/schedules`, { method: 'POST', body: { plans: [
    { channelId: 'channel-facebook', scheduledAt: '2026-09-20T12:00', uploaderId: byRole('UPLOADER') }
  ] } }, coordinatorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/contents/${contentId}/schedules`, { method: 'POST', body: { plans: [
    { channelId: 'channel-tiktok', scheduledAt: '2026-09-20T13:00', uploaderId: byRole('UPLOADER') }
  ] } }, coordinatorCookie);
  assert.equal(result.response.status, 409, 'channel yang sudah dijadwalkan tidak boleh diduplikasi');
  schedules = await request(baseUrl, `/api/contents/${contentId}/schedules`, {}, uploaderCookie);
  assert.equal(schedules.payload.items.length, 3, 'koordinator dapat menambahkan channel setelah jadwal dikirim');
  const reassignedSchedule = schedules.payload.items[0];
  result = await request(baseUrl, `/api/schedules/${reassignedSchedule.id}`, { method: 'PATCH', body: {
    channelId: 'channel-website', scheduledAt: '2026-09-21T09:30', uploaderId: secondUploaderId
  } }, vendorCookie);
  assert.equal(result.response.status, 403, 'vendor tidak boleh mengubah jadwal');
  result = await request(baseUrl, `/api/schedules/${reassignedSchedule.id}`, { method: 'PATCH', body: {
    channelId: 'channel-website', scheduledAt: '2026-09-21T09:30', uploaderId: secondUploaderId
  } }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.channel_id, 'channel-website');
  assert.equal(result.payload.item.scheduled_at, '2026-09-21T09:30');
  assert.equal(result.payload.item.uploader_id, secondUploaderId);
  schedules = await request(baseUrl, `/api/contents/${contentId}/schedules`, {}, adminCookie);
  assert.equal(schedules.payload.items.find(row => row.id === reassignedSchedule.id).channel_name, 'Website / Banner');
  assert.equal(schedules.payload.items.find(row => row.id === reassignedSchedule.id).uploader_name, 'Petugas Upload Kedua');
  result = await request(baseUrl, `/api/schedules/${reassignedSchedule.id}`, { method: 'PATCH', body: {
    channelId: 'channel-tiktok', scheduledAt: '2026-09-21T09:30', uploaderId: secondUploaderId
  } }, coordinatorCookie);
  assert.equal(result.response.status, 409, 'jadwal tidak boleh dipindahkan ke channel yang sudah digunakan');
  let detail = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
  assert.ok(detail.payload.item.channelIds.includes('channel-website'));
  assert.equal(detail.payload.item.channelIds.includes('channel-instagram'), false, 'channel lama dilepas setelah jadwal dipindahkan');

  let form = new FormData(); form.set('platformUrl', 'https://example.test/post-reassigned');
  result = await request(baseUrl, `/api/schedules/${reassignedSchedule.id}/publish`, { method: 'POST', body: form }, uploaderCookie);
  assert.equal(result.response.status, 403, 'petugas lama tidak boleh menerbitkan jadwal yang dialihkan');
  form = new FormData(); form.set('platformUrl', 'https://example.test/post-reassigned');
  result = await request(baseUrl, `/api/schedules/${reassignedSchedule.id}/publish`, { method: 'POST', body: form }, secondUploaderCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/schedules/${reassignedSchedule.id}`, { method: 'PATCH', body: {
    channelId: 'channel-website', scheduledAt: '2026-09-22T09:30', uploaderId: secondUploaderId
  } }, coordinatorCookie);
  assert.equal(result.response.status, 409, 'jadwal yang sudah tayang harus terkunci');
  detail = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
  assert.equal(detail.payload.item.status, 'SCHEDULED');

  const remainingSchedules = schedules.payload.items.filter(row => row.id !== reassignedSchedule.id);
  for (let index = 0; index < remainingSchedules.length; index += 1) {
    form = new FormData(); form.set('platformUrl', `https://example.test/post-remaining-${index}`);
    result = await request(baseUrl, `/api/schedules/${remainingSchedules[index].id}/publish`, { method: 'POST', body: form }, uploaderCookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
    detail = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
    assert.equal(detail.payload.item.status, index === remainingSchedules.length - 1 ? 'PUBLISHED' : 'SCHEDULED');
  }

  const internalCreated = await request(baseUrl, '/api/contents', { method: 'POST', body: {
    title: 'Konten Internal Koordinator', brandId: 'brand-ainet', channelIds: ['channel-instagram'],
    contentType: 'SOCIAL_POST', brief: 'Materi dibuat langsung oleh Koordinator.',
    coordinatorId: byRole('COORDINATOR'), productionMode: 'INTERNAL', vendorId,
    vendorEditPermissions: ['brief', 'attachments']
  } }, adminCookie);
  assert.equal(internalCreated.response.status, 201, JSON.stringify(internalCreated.payload));
  const internalId = internalCreated.payload.item.id;
  assert.equal(internalCreated.payload.item.production_mode, 'INTERNAL');
  assert.equal(internalCreated.payload.item.vendor_id, null);
  assert.deepEqual(internalCreated.payload.item.vendorEditPermissions, []);
  await transition(baseUrl, internalId, 'BRIEFED', coordinatorCookie);
  result = await request(baseUrl, `/api/contents/${internalId}/transition`, { method: 'POST', body: { toStatus: 'ASSIGNED' } }, coordinatorCookie);
  assert.equal(result.response.status, 409, 'produksi internal tidak boleh dikirim ke Vendor');
  await transition(baseUrl, internalId, 'IN_PRODUCTION', coordinatorCookie);
  result = await request(baseUrl, `/api/contents/${internalId}`, {}, vendorCookie);
  assert.equal(result.response.status, 404, 'konten internal tidak boleh terlihat oleh Vendor');
  result = await request(baseUrl, `/api/contents/${internalId}`, { method: 'PATCH', body: { productionMode: 'VENDOR' } }, coordinatorCookie);
  assert.equal(result.response.status, 409, 'metode produksi terkunci setelah produksi dimulai');
  const internalFileId = await chunkUpload(baseUrl, internalId, coordinatorCookie, 'hasil-internal.pdf', '%PDF-1.4 hasil internal', 'Hasil produksi internal.');
  assert.ok(internalFileId);
  result = await request(baseUrl, `/api/contents/${internalId}/submit-result`, { method: 'POST', body: { note: 'Produksi internal selesai.' } }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.status, 'DRAFT_SUBMITTED');
  result = await request(baseUrl, `/api/contents/${internalId}/transition`, { method: 'POST', body: { toStatus: 'APPROVED', note: 'Disetujui Koordinator.' } }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.status, 'APPROVED');
  const report = await request(baseUrl, '/api/reports/summary?from=2026-01-01&to=2026-12-31', {}, adminCookie);
  assert.equal(report.response.status, 200, JSON.stringify(report.payload));
  assert.ok(report.payload.byProductionMode.some(row => row.mode === 'INTERNAL' && row.count >= 1));

  const vendorProposal = await request(baseUrl, '/api/contents', { method: 'POST', body: {
    title: 'Ide Konten dari Vendor', brandId: 'brand-ainet', channelIds: ['channel-tiktok'],
    contentType: 'REELS', objective: 'Meningkatkan engagement.', audience: 'Keluarga muda.',
    brief: 'Video singkat dengan alur edukasi dan penutup CTA.', caption: 'Internet lancar untuk keluarga.',
    hashtags: '#AINET', callToAction: 'Cek jangkauan sekarang.', coordinatorId: byRole('COORDINATOR'),
    productionMode: 'VENDOR', vendorId: 'vendor-yang-tidak-valid'
  } }, vendorCookie);
  assert.equal(vendorProposal.response.status, 201, JSON.stringify(vendorProposal.payload));
  const proposalId = vendorProposal.payload.item.id;
  assert.equal(vendorProposal.payload.item.proposal_origin, 'VENDOR');
  assert.equal(vendorProposal.payload.item.brief_review_status, 'DRAFT');
  assert.equal(vendorProposal.payload.item.vendor_id, vendorId, 'Vendor harus otomatis mengikuti akun pembuat');
  await chunkUpload(baseUrl, proposalId, vendorCookie, 'referensi-usulan.pdf', '%PDF-1.4 referensi usulan', 'Referensi ide Vendor.', 'BRIEF');

  result = await request(baseUrl, `/api/contents/${proposalId}/transition`, { method: 'POST', body: { toStatus: 'BRIEFED' } }, coordinatorCookie);
  assert.equal(result.response.status, 409, 'usulan Vendor wajib melalui review brief');
  result = await request(baseUrl, `/api/contents/${proposalId}/vendor-brief/submit`, { method: 'POST', body: {} }, vendorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.brief_review_status, 'SUBMITTED');
  result = await request(baseUrl, `/api/contents/${proposalId}/vendor-brief`, { method: 'PATCH', body: { brief: 'Edit saat direview.' } }, vendorCookie);
  assert.equal(result.response.status, 409, 'brief harus terkunci selama review');

  result = await request(baseUrl, `/api/contents/${proposalId}/vendor-brief/review`, {
    method: 'POST', body: { decision: 'REVISION', note: 'Tambahkan penjelasan manfaat utama.' }
  }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.brief_review_status, 'REVISION');
  result = await request(baseUrl, `/api/contents/${proposalId}/vendor-brief`, {
    method: 'PATCH', body: { brief: 'Video edukasi dengan tiga manfaat utama dan penutup CTA.', channelIds: ['channel-tiktok'] }
  }, vendorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  await request(baseUrl, `/api/contents/${proposalId}/vendor-brief/submit`, { method: 'POST', body: {} }, vendorCookie);

  result = await request(baseUrl, `/api/contents/${proposalId}`, { method: 'PATCH', body: { brief: 'Diubah Koordinator.' } }, coordinatorCookie);
  assert.equal(result.response.status, 403, 'Koordinator tidak boleh mengubah materi usulan Vendor');
  result = await request(baseUrl, `/api/contents/${proposalId}/vendor-brief/review`, {
    method: 'POST', body: { decision: 'APPROVED', note: 'Konsep sesuai.' }
  }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.status, 'IN_PRODUCTION', 'brief disetujui langsung membuka Produksi Vendor');
  assert.equal(result.payload.item.brief_review_status, 'APPROVED');
  const proposalDetail = await request(baseUrl, `/api/contents/${proposalId}`, {}, coordinatorCookie);
  assert.equal(proposalDetail.response.status, 200);
  assert.equal(proposalDetail.payload.briefVersions.length, 2);
  assert.equal(proposalDetail.payload.briefVersions[0].decision, 'APPROVED');
  assert.equal(proposalDetail.payload.briefVersions[1].decision, 'REVISION');
});
