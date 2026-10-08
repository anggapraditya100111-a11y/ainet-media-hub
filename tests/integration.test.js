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
  const assistantCookie = await login(baseUrl, 'asisten', 'Demo12345');
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
  const coordinatorPin = '24861357';
  result = await request(baseUrl, '/api/profile/approval-pin', { method: 'POST', body: { newPin: directorPin, confirmPin: directorPin } }, managementCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, '/api/profile/approval-pin', { method: 'POST', body: { newPin: coordinatorPin, confirmPin: coordinatorPin } }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  const assignments = await request(baseUrl, '/api/meta/assignments', {}, adminCookie);
  assert.deepEqual([...new Set(assignments.payload.users.map(user => user.role))].sort(), ['ASSISTANT_COORDINATOR', 'COORDINATOR', 'MANAGEMENT', 'UPLOADER']);
  assert.equal(assignments.payload.users.find(user => user.role === 'MANAGEMENT').approval_pin_set, 1);
  const vendorId = assignments.payload.vendors[0].id;
  const byRole = role => assignments.payload.users.find(user => user.role === role).id;

  result = await request(baseUrl, '/api/assistant-delegations', { method: 'POST', body: {
    assistantId: byRole('ASSISTANT_COORDINATOR'), permissions: ['CREATE_REQUEST', 'REVIEW_VENDOR'], active: true
  } }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, '/api/bootstrap', {}, assistantCookie);
  assert.deepEqual(result.payload.assistantDelegations[0].permissions.sort(), ['CREATE_REQUEST', 'REVIEW_VENDOR']);

  const delegatedRequest = await request(baseUrl, '/api/contents', { method: 'POST', body: {
    title: 'Permintaan oleh Asisten', brandId: 'brand-ainet', channelIds: ['channel-instagram'],
    contentType: 'SOCIAL_POST', brief: 'Permintaan atas delegasi Koordinator.', coordinatorId: byRole('COORDINATOR'), productionMode: 'INTERNAL'
  } }, assistantCookie);
  assert.equal(delegatedRequest.response.status, 201, JSON.stringify(delegatedRequest.payload));

  let instantForm = new FormData();
  instantForm.set('title', 'Video Instan Internal');
  instantForm.set('brandId', 'brand-ainet');
  instantForm.set('coordinatorId', byRole('COORDINATOR'));
  instantForm.append('channelIds', 'channel-youtube');
  instantForm.set('caption', 'Caption video instan.');
  instantForm.set('file', new Blob([Buffer.from('video-instan-v1')], { type: 'video/mp4' }), 'video-instan-v1.mp4');
  result = await request(baseUrl, '/api/instant-videos', { method: 'POST', body: instantForm }, assistantCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const instantId = result.payload.item.id;
  assert.equal(result.payload.item.workflow_type, 'INSTANT');
  assert.equal(result.payload.item.status, 'DRAFT_SUBMITTED');
  assert.match(result.payload.approvalUrl, /^\/approval\.html\?kind=coordinator&token=/);
  let coordinatorToken = new URL(result.payload.approvalUrl, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/contents/${instantId}/transition`, { method: 'POST', body: { toStatus: 'APPROVED' } }, assistantCookie);
  assert.equal(result.response.status, 403, 'Asisten tidak dapat menyetujui Video Instan sendiri');
  result = await request(baseUrl, `/api/contents/${instantId}/transition`, { method: 'POST', body: { toStatus: 'REVISION_REQUIRED', note: 'Perbaiki intro.' } }, coordinatorCookie);
  assert.equal(result.response.status, 409, 'Koordinator wajib menggunakan link dan PIN');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}`);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.content.caption, 'Caption video instan.');
  assert.deepEqual(result.payload.content.channels, ['YouTube']);
  assert.equal(result.payload.content.submitted_by_name, 'Asisten Koordinator');
  assert.equal(result.payload.files[0].mime_type, 'video/mp4');
  result = await request(baseUrl, result.payload.files[0].fileUrl);
  assert.equal(result.response.status, 200, 'Video pada link Koordinator dapat diputar tanpa login');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}/decision`, { method: 'POST', body: { decision: 'REVISION', note: 'Perbaiki intro.', pin: '00000000' } });
  assert.equal(result.response.status, 401, 'PIN yang salah ditolak saat keputusan dikirim');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}/decision`, { method: 'POST', body: { decision: 'REVISION', note: 'Perbaiki intro.', pin: coordinatorPin } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.status, 'REVISION_REQUIRED');
  instantForm = new FormData();
  instantForm.set('changeNote', 'Intro sudah diperbaiki.');
  instantForm.set('file', new Blob([Buffer.from('video-instan-v2')], { type: 'video/mp4' }), 'video-instan-v2.mp4');
  result = await request(baseUrl, `/api/instant-videos/${instantId}/revision`, { method: 'POST', body: instantForm }, assistantCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  assert.equal(result.payload.versionNumber, 2);
  coordinatorToken = new URL(result.payload.approvalUrl, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}/decision`, { method: 'POST', body: { decision: 'APPROVED', pin: coordinatorPin } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.status, 'APPROVED');
  result = await request(baseUrl, '/api/library?q=Video%20Instan%20Internal', {}, assistantCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.items.length, 1, 'konten yang disetujui otomatis masuk Media Library');
  assert.equal(result.payload.items[0].source_content_id, instantId);
  result = await request(baseUrl, `/api/contents/${instantId}/schedules`, { method: 'POST', body: { plans: [
    { channelId: 'channel-youtube', scheduledAt: '2026-10-01T10:00', uploaderId: byRole('ASSISTANT_COORDINATOR') }
  ] } }, coordinatorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  let instantSchedules = await request(baseUrl, `/api/contents/${instantId}/schedules`, {}, assistantCookie);
  assert.equal(instantSchedules.payload.items.length, 1);
  instantForm = new FormData();
  instantForm.set('platformUrl', 'https://example.test/video-instan');
  result = await request(baseUrl, `/api/schedules/${instantSchedules.payload.items[0].id}/publish`, { method: 'POST', body: instantForm }, assistantCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));

  const directorInstantForm = new FormData();
  directorInstantForm.set('title', 'Video Instan untuk Direksi');
  directorInstantForm.set('brandId', 'brand-ainet');
  directorInstantForm.set('coordinatorId', byRole('COORDINATOR'));
  directorInstantForm.append('channelIds', 'channel-instagram');
  directorInstantForm.set('file', new Blob([Buffer.from('video-instan-direksi')], { type: 'video/mp4' }), 'video-instan-direksi.mp4');
  result = await request(baseUrl, '/api/instant-videos', { method: 'POST', body: directorInstantForm }, assistantCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const directorInstantId = result.payload.item.id;
  coordinatorToken = new URL(result.payload.approvalUrl, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}/decision`, { method: 'POST', body: {
    decision: 'DIRECTOR', directorId: byRole('MANAGEMENT'), note: 'Mohon persetujuan Direksi.', pin: coordinatorPin
  } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.status, 'APPROVAL_PENDING');
  assert.match(result.payload.directorApprovalUrl, /^\/approval\.html\?token=/);
  const directorToken = new URL(result.payload.directorApprovalUrl, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/public/approvals/${directorToken}/unlock`, { method: 'POST', body: { pin: directorPin } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  const directorApprovalCookie = result.response.headers.get('set-cookie').split(';')[0];
  result = await request(baseUrl, `/api/public/approvals/${directorToken}/decision`, { method: 'POST', body: { decision: 'APPROVED', note: 'Disetujui.' } }, directorApprovalCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/contents/${directorInstantId}`, {}, assistantCookie);
  assert.equal(result.payload.item.status, 'APPROVED');
  result = await request(baseUrl, '/api/library?q=Video%20Instan%20untuk%20Direksi', {}, assistantCookie);
  assert.equal(result.payload.items[0].source_content_id, directorInstantId, 'approval Direksi juga otomatis membuat aset final');

  const vendorSimpleForm = new FormData();
  vendorSimpleForm.set('title', 'Foto Final dari Vendor');
  vendorSimpleForm.set('description', 'Dokumentasi layanan pelanggan.');
  vendorSimpleForm.set('brandId', 'brand-ainet');
  vendorSimpleForm.set('contentType', 'PHOTO');
  vendorSimpleForm.set('coordinatorId', byRole('COORDINATOR'));
  vendorSimpleForm.set('file', new Blob([Buffer.from('foto-final-vendor')], { type: 'image/jpeg' }), 'foto-final-vendor.jpg');
  result = await request(baseUrl, '/api/simple-contents', { method: 'POST', body: vendorSimpleForm }, vendorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  assert.equal(result.payload.item.production_mode, 'VENDOR');
  assert.equal(result.payload.item.vendor_id, vendorId);
  assert.deepEqual(result.payload.item.channels, [], 'channel boleh ditentukan kemudian');
  const vendorSimpleId = result.payload.item.id;
  coordinatorToken = new URL(result.payload.approvalUrl, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}`);
  assert.equal(result.payload.content.production_mode, 'VENDOR');
  assert.equal(result.payload.content.content_type, 'PHOTO');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}/decision`, { method: 'POST', body: { decision: 'APPROVED', pin: coordinatorPin } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, '/api/library?q=Foto%20Final%20dari%20Vendor', {}, vendorCookie);
  assert.equal(result.payload.items[0].source_content_id, vendorSimpleId);

  const vendorTaskForm = new FormData();
  vendorTaskForm.set('title', 'Video Tugas Singkat Vendor');
  vendorTaskForm.set('brandId', 'brand-ainet');
  vendorTaskForm.set('vendorId', vendorId);
  vendorTaskForm.set('instruction', 'Buat video vertikal 30 detik dengan pesan promo utama.');
  vendorTaskForm.set('dueDate', '2026-10-15');
  vendorTaskForm.set('referenceUrls', 'https://example.test/referensi-video');
  vendorTaskForm.set('referenceFile', new Blob([Buffer.from('%PDF-1.4 brief singkat')], { type: 'application/pdf' }), 'brief-singkat.pdf');
  result = await request(baseUrl, '/api/vendor-tasks', { method: 'POST', body: vendorTaskForm }, coordinatorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  assert.equal(result.payload.item.workflow_type, 'INSTANT');
  assert.equal(result.payload.item.production_mode, 'VENDOR');
  assert.equal(result.payload.item.status, 'IN_PRODUCTION');
  assert.equal(result.payload.item.vendor_id, vendorId);
  assert.deepEqual(result.payload.item.referenceUrls, ['https://example.test/referensi-video']);
  const vendorTaskId = result.payload.item.id;

  result = await request(baseUrl, `/api/contents/${vendorTaskId}`, {}, vendorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.collaborationFiles[0].phase, 'BRIEF');
  assert.equal(result.payload.collaborationFiles[0].original_name, 'brief-singkat.pdf');

  let vendorTaskResultForm = new FormData();
  vendorTaskResultForm.set('contentType', 'VIDEO');
  vendorTaskResultForm.set('caption', 'Promo AINET untuk pelanggan baru.');
  vendorTaskResultForm.set('hashtags', '#AINET');
  vendorTaskResultForm.set('callToAction', 'Hubungi kami sekarang.');
  vendorTaskResultForm.set('changeNote', 'Hasil final pertama.');
  vendorTaskResultForm.set('file', new Blob([Buffer.from('video-tugas-v1')], { type: 'video/mp4' }), 'video-tugas-v1.mp4');
  result = await request(baseUrl, `/api/vendor-tasks/${vendorTaskId}/result`, { method: 'POST', body: vendorTaskResultForm }, vendorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  assert.equal(result.payload.item.status, 'DRAFT_SUBMITTED');
  coordinatorToken = new URL(result.payload.approvalUrl, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}`);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.content.submitted_by_name, 'Kreator Vendor');
  assert.equal(result.payload.content.caption, 'Promo AINET untuk pelanggan baru.');
  assert.equal(result.payload.files[0].mime_type, 'video/mp4');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}/decision`, { method: 'POST', body: {
    decision: 'REVISION', note: 'Perjelas CTA pada penutup.', pin: coordinatorPin
  } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.status, 'REVISION_REQUIRED');

  vendorTaskResultForm = new FormData();
  vendorTaskResultForm.set('changeNote', 'CTA penutup sudah diperjelas.');
  vendorTaskResultForm.set('file', new Blob([Buffer.from('video-tugas-v2')], { type: 'video/mp4' }), 'video-tugas-v2.mp4');
  result = await request(baseUrl, `/api/simple-contents/${vendorTaskId}/revision`, { method: 'POST', body: vendorTaskResultForm }, vendorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  assert.equal(result.payload.versionNumber, 2);
  coordinatorToken = new URL(result.payload.approvalUrl, baseUrl).searchParams.get('token');
  result = await request(baseUrl, `/api/public/coordinator-approvals/${coordinatorToken}/decision`, { method: 'POST', body: { decision: 'APPROVED', pin: coordinatorPin } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.status, 'APPROVED');
  result = await request(baseUrl, '/api/library?q=Video%20Tugas%20Singkat%20Vendor', {}, vendorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.items[0].source_content_id, vendorTaskId);

  const created = await request(baseUrl, '/api/contents', { method: 'POST', body: {
    title: 'Video Edukasi AINET', brandId: 'brand-ainet', channelIds: ['channel-instagram', 'channel-tiktok'],
    contentType: 'REELS', brief: 'Video 30 detik dengan script edukasi.', vendorId, coordinatorId: byRole('COORDINATOR'),
    referenceUrls: 'https://www.instagram.com/contoh/\nhttps://example.test/referensi',
    vendorEditPermissions: ['brief', 'description', 'caption', 'hashtags', 'call_to_action', 'attachments']
  } }, adminCookie);
  assert.equal(created.response.status, 201, `${JSON.stringify(created.payload)}\n${stderr}`);
  const contentId = created.payload.item.id;

  result = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
  assert.deepEqual(result.payload.item.referenceUrls, ['https://www.instagram.com/contoh/', 'https://example.test/referensi']);
  const briefReferenceId = await chunkUpload(baseUrl, contentId, vendorCookie, 'referensi-vendor.pdf', '%PDF-1.4 referensi vendor', 'Referensi tambahan vendor.', 'BRIEF');
  assert.ok(briefReferenceId);
  result = await request(baseUrl, `/api/contents/${contentId}/vendor-edits`, { method: 'POST', body: { fieldName: 'brief', addedValue: 'Tambahkan penutup dengan nomor WhatsApp.' } }, vendorCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const vendorEditId = result.payload.id;
  result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'IN_PRODUCTION' } }, adminCookie);
  assert.equal(result.response.status, 409, 'produksi belum boleh dimulai ketika usulan Vendor masih menunggu review');
  result = await request(baseUrl, `/api/contents/${contentId}`, {}, vendorCookie);
  assert.equal(result.payload.item.brief, 'Video 30 detik dengan script edukasi.', 'usulan belum boleh langsung mengubah materi Koordinator');
  assert.equal(result.payload.vendorEdits[0].status, 'PENDING');
  result = await request(baseUrl, `/api/contents/${contentId}/vendor-description`, { method: 'PATCH', body: { description: 'hapus materi lama' } }, vendorCookie);
  assert.equal(result.response.status, 410, 'endpoint edit langsung lama harus dinonaktifkan');
  result = await request(baseUrl, `/api/contents/${contentId}/vendor-edits/${vendorEditId}/review`, { method: 'POST', body: { action: 'ACCEPT', note: 'Tambahan diterima.' } }, assistantCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.item.brief, 'Video 30 detik dengan script edukasi.\n\nTambahkan penutup dengan nomor WhatsApp.');
  result = await request(baseUrl, `/api/contents/${contentId}`, {}, adminCookie);
  assert.equal(result.payload.vendorEditAttributions.brief.vendorName, 'Studio Kreatif Nusantara');
  result = await request(baseUrl, `/api/contents/${contentId}/messages`, { method: 'POST', body: { phase: 'BRIEF', message: 'Draft script sudah disiapkan untuk dibahas.' } }, vendorCookie);
  assert.equal(result.response.status, 201);
  result = await request(baseUrl, `/api/contents/${contentId}/transition`, { method: 'POST', body: { toStatus: 'IN_PRODUCTION' } }, vendorCookie);
  assert.equal(result.response.status, 403, 'Vendor tidak boleh menyetujui mulai produksi sendiri');
  await transition(baseUrl, contentId, 'IN_PRODUCTION', adminCookie);
  result = await request(baseUrl, `/api/contents/${contentId}/vendor-edits`, { method: 'POST', body: { fieldName: 'caption', addedValue: 'Perubahan diam-diam setelah produksi.' } }, vendorCookie);
  assert.equal(result.response.status, 409, 'brief harus terkunci setelah Produksi dimulai');

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

  const trashCreated = await request(baseUrl, '/api/contents', { method: 'POST', body: {
    title: 'Konten Uji Sampah', brandId: 'brand-ainet', channelIds: ['channel-instagram'],
    contentType: 'SOCIAL_POST', brief: 'Konten khusus pengujian Sampah.',
    coordinatorId: byRole('COORDINATOR'), productionMode: 'INTERNAL'
  } }, adminCookie);
  assert.equal(trashCreated.response.status, 201, JSON.stringify(trashCreated.payload));
  const trashContentId = trashCreated.payload.item.id;

  result = await request(baseUrl, `/api/contents/${trashContentId}/trash`, {
    method: 'POST', body: { reason: 'Tidak berwenang.' }
  }, coordinatorCookie);
  assert.equal(result.response.status, 403, 'Koordinator tidak boleh menghapus data progres');
  result = await request(baseUrl, `/api/contents/${trashContentId}/trash`, {
    method: 'POST', body: { reason: '' }
  }, managementCookie);
  assert.equal(result.response.status, 400, 'alasan penghapusan wajib diisi');
  result = await request(baseUrl, `/api/contents/${trashContentId}/trash`, {
    method: 'POST', body: { reason: 'Data duplikat untuk pengujian.' }
  }, managementCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));

  result = await request(baseUrl, `/api/contents/${trashContentId}`, {}, adminCookie);
  assert.equal(result.response.status, 404, 'konten di Sampah tidak boleh tampil sebagai data aktif');
  const activeContents = await request(baseUrl, '/api/contents', {}, adminCookie);
  assert.equal(activeContents.payload.items.some(item => item.id === trashContentId), false);
  const trashContents = await request(baseUrl, '/api/contents/trash', {}, managementCookie);
  const trashedItem = trashContents.payload.items.find(item => item.id === trashContentId);
  assert.ok(trashedItem);
  assert.equal(trashedItem.delete_reason, 'Data duplikat untuk pengujian.');
  assert.ok(trashedItem.deleted_by_name);

  result = await request(baseUrl, `/api/contents/${trashContentId}/permanent`, { method: 'DELETE' }, managementCookie);
  assert.equal(result.response.status, 403, 'Direksi tidak boleh menghapus permanen');
  result = await request(baseUrl, `/api/contents/${trashContentId}/restore`, { method: 'POST' }, managementCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/contents/${trashContentId}`, {}, adminCookie);
  assert.equal(result.response.status, 200, 'konten yang dipulihkan harus kembali aktif');

  result = await request(baseUrl, `/api/contents/${trashContentId}/trash`, {
    method: 'POST', body: { reason: 'Uji masa retensi.' }
  }, adminCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, `/api/contents/${trashContentId}/permanent`, { method: 'DELETE' }, adminCookie);
  assert.equal(result.response.status, 409, 'Super Admin harus menunggu masa retensi 30 hari');

  const rawForm = new FormData();
  rawForm.set('title', 'Teknisi memasang ODP');
  rawForm.set('category', 'INFRASTRUCTURE');
  rawForm.set('brandId', 'brand-ainet');
  rawForm.set('capturedAt', '2026-09-29');
  rawForm.set('location', 'POP Pringsewu');
  rawForm.set('tags', 'teknisi, odp, instalasi');
  rawForm.set('description', 'Video mentah untuk bahan produksi konten edukasi.');
  rawForm.set('file', new Blob(['raw-video-test'], { type: 'video/mp4' }), 'teknisi-odp.mp4');
  const rawCreated = await request(baseUrl, '/api/raw-footage', { method: 'POST', body: rawForm }, coordinatorCookie);
  assert.equal(rawCreated.response.status, 201, JSON.stringify(rawCreated.payload));
  const rawFootageId = rawCreated.payload.id;

  const assistantRawForm = new FormData();
  assistantRawForm.set('title', 'Foto mentah internal Asisten');
  assistantRawForm.set('category', 'PHOTO_RAW');
  assistantRawForm.set('file', new Blob(['raw-photo-assistant'], { type: 'image/jpeg' }), 'internal-asisten.jpg');
  result = await request(baseUrl, '/api/raw-footage', { method: 'POST', body: assistantRawForm }, assistantCookie);
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  const assistantRawFootageId = result.payload.id;
  result = await request(baseUrl, `/api/raw-footage/${assistantRawFootageId}`, { method: 'PATCH', body: { title: 'Foto mentah internal diperbarui' } }, assistantCookie);
  assert.equal(result.response.status, 200, 'Asisten dapat mengubah metadata footage miliknya');
  result = await request(baseUrl, `/api/raw-footage/${rawFootageId}`, { method: 'PATCH', body: { title: 'Tidak boleh diubah' } }, assistantCookie);
  assert.equal(result.response.status, 403, 'Asisten tidak dapat mengubah footage milik pengguna lain');
  result = await request(baseUrl, `/api/raw-footage/${assistantRawFootageId}`, { method: 'PATCH', body: { status: 'ARCHIVED' } }, assistantCookie);
  assert.equal(result.response.status, 403, 'Asisten tidak dapat mengarsipkan footage');

  result = await request(baseUrl, '/api/raw-footage', {}, uploaderCookie);
  assert.equal(result.response.status, 403, 'Petugas Upload tidak memiliki menu Raw Footage');
  result = await request(baseUrl, '/api/raw-footage', {}, managementCookie);
  assert.equal(result.response.status, 200, 'Direksi dapat melihat Raw Footage');
  result = await request(baseUrl, '/api/raw-footage', {}, vendorCookie);
  assert.equal(result.payload.items.some(item => item.id === rawFootageId), false, 'Vendor belum dapat melihat footage yang belum ditautkan');

  result = await request(baseUrl, `/api/contents/${contentId}/raw-footage`, {
    method: 'POST', body: { footageIds: [rawFootageId] }
  }, coordinatorCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  result = await request(baseUrl, '/api/raw-footage', {}, vendorCookie);
  const linkedFootage = result.payload.items.find(item => item.id === rawFootageId);
  assert.ok(linkedFootage, 'Vendor dapat melihat footage yang ditautkan ke tugasnya');
  assert.equal(linkedFootage.mediaType, 'VIDEO');
  assert.deepEqual(linkedFootage.tags, ['teknisi', 'odp', 'instalasi']);
  result = await request(baseUrl, linkedFootage.fileUrl, {}, vendorCookie);
  assert.equal(result.response.status, 200, 'Vendor dapat membuka file mentah yang ditautkan');

  const uploaderDetail = await request(baseUrl, `/api/contents/${contentId}`, {}, uploaderCookie);
  assert.deepEqual(uploaderDetail.payload.rawFootage, [], 'Petugas Upload tidak melihat Raw Footage pada detail konten');
  result = await request(baseUrl, `/api/raw-footage/${rawFootageId}`, { method: 'DELETE' }, coordinatorCookie);
  assert.equal(result.response.status, 403, 'Koordinator tidak dapat menghapus permanen Raw Footage');
  result = await request(baseUrl, `/api/raw-footage/${rawFootageId}`, { method: 'PATCH', body: { status: 'ARCHIVED' } }, coordinatorCookie);
  assert.equal(result.response.status, 200);
  result = await request(baseUrl, `/api/raw-footage/${rawFootageId}`, {}, vendorCookie);
  assert.equal(result.response.status, 404, 'Vendor tidak dapat membuka footage yang sudah diarsipkan');
  result = await request(baseUrl, `/api/raw-footage/${rawFootageId}`, { method: 'DELETE' }, adminCookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
});
