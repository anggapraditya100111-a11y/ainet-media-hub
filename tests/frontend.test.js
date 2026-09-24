const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'public', 'popup.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));

test('login utama memakai popup AXINDO Access dengan handoff yang diverifikasi', () => {
  assert.match(html, /Masuk melalui AXINDO Access/);
  assert.match(app, /window\.open\(/);
  assert.match(app, /\/handoff\?handoff=media-hub/);
  assert.match(app, /axindo-access-handoff/);
  assert.match(app, /\/api\/auth\/access\/complete/);
  assert.match(app, /code_challenge/);
  assert.match(app, /popupCodeChallenge/);
  assert.match(app, /event\.origin !== active\.accessOrigin/);
  assert.match(app, /event\.source !== active\.window/);
  assert.match(app, /event\.data\?\.channel !== active\.channel/);
  assert.match(app, /active\.stage === 'exchange'/);
  assert.match(app, /Date\.now\(\) - active\.closedAt < 1500/);
  assert.match(app, /completeRedirectedAccessHandoff/);
  assert.match(app, /media-hub-handoff:/);
  assert.match(app, /api\('\/api\/bootstrap'\)\.then\(\(\) => finishPopupLogin\(true\)\)/);
  assert.doesNotMatch(app, /active\.window\.location = handoffUrl/);
  assert.doesNotMatch(app, /access_token|id_token|client_secret/i);
});

test('akun AXINDO ID dari OIDC maupun AXINDO Access tidak mendapat form ubah password', () => {
  assert.match(app, /function isAxindoIdUser\(user\)/);
  assert.match(app, /authSource === 'OIDC' \|\| authSource === 'ACCESS'/);
  assert.match(app, /const usesAxindoId = isAxindoIdUser\(state\.user\)/);
  assert.match(app, /const accountSecurity = usesAxindoId/);
  assert.match(app, /\$\('#password-form'\)\?\.addEventListener/);
});

test('PIN approval hanya dikelola Direksi dan koordinator hanya menyalin link', () => {
  assert.match(app, /id="approval-pin-form"/);
  assert.match(app, /PIN approval pribadi/);
  assert.match(app, /data-copy-approval/);
  assert.match(app, />Salin Link</);
  assert.doesNotMatch(app, /Salin Link \+ PIN|id="approval-pin"/);
});

test('permintaan konten menerima URL dan file referensi', () => {
  assert.match(app, /name="referenceUrls"/);
  assert.match(app, /name="referenceFiles" multiple/);
  assert.match(app, /uploadCollaborativeFile\(contentId, 'BRIEF'/);
});

test('akses edit vendor diatur per kolom dan diproses sebagai usulan', () => {
  assert.match(app, /name="vendorEditPermissions"/);
  assert.match(app, /data-content-action="vendor-edit">Usulkan Edit Materi/);
  assert.match(app, /function showVendorEditForm\(item\)/);
  assert.match(app, /\/vendor-edits/);
  assert.match(app, /Tulisan Koordinator tetap dipertahankan/);
  assert.match(app, /Diedit oleh Vendor/);
  assert.match(app, /data-review-vendor-edit/);
});

test('koordinator dapat menambah channel serta mengubah jadwal dan petugas sebelum tayang', () => {
  assert.match(app, /data-edit-schedule/);
  assert.match(app, /data-content-action="add-schedule"/);
  assert.match(app, /function showEditScheduleForm\(item, schedule/);
  assert.match(app, /Edit Jadwal Platform/);
  assert.match(app, /Tambah Channel Upload/);
  assert.match(app, /name="channelId"/);
  assert.match(app, /method: 'PATCH'/);
  assert.match(app, /Channel, jadwal, dan petugas upload berhasil diperbarui/);
});

test('produksi internal melewati vendor dan diselesaikan oleh koordinator', () => {
  assert.match(app, /name="productionMode"/);
  assert.match(app, /Produksi Internal oleh Koordinator/);
  assert.match(app, /id="vendor-access-section"/);
  assert.match(app, /id="vendor-assignment-field"/);
  assert.match(app, /Selesaikan Produksi Internal/);
  assert.match(app, /Mulai Produksi Internal/);
  assert.match(app, /byProductionMode/);
});

test('Vendor membuat usulan brief dan Koordinator memberi keputusan', () => {
  assert.match(app, /Buat Usulan Konten/);
  assert.match(app, /vendor-brief\/submit/);
  assert.match(app, /vendor-brief\/review/);
  assert.match(app, /Setujui Brief/);
  assert.match(app, /Minta Revisi/);
  assert.match(app, /Tolak Usulan/);
  assert.match(app, /Review Brief Vendor/);
});

test('mode mobile menyediakan pola aplikasi Android dan PWA', () => {
  assert.match(html, /id="mobile-navigation"/);
  assert.match(html, /manifest\.webmanifest\?v=0\.6\.0/);
  assert.match(app, /renderMobileNavigation/);
  assert.match(css, /\.mobile-navigation/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(display-mode: standalone\)/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
});

test('logout menawarkan keluar lokal atau AXINDO pada desktop dan mobile', () => {
  assert.match(html, /id="logout-button"/);
  assert.match(app, /Keluar dari AXINDO/);
  assert.match(app, /Keluar dari aplikasi ini saja/);
  assert.match(app, /body: \{ scope \}/);
  assert.match(css, /\.logout-choice/);
});

test('workflow kolaborasi v0.4.0 tersedia di desktop dan mobile', () => {
  assert.match(app, /Diskusi & Upload/);
  assert.match(app, /uploadCollaborativeFile/);
  assert.match(app, /Kirim Hasil ke Koordinator/);
  assert.match(app, /Kirim Approval ke Direksi/);
  assert.match(app, /Jadwal per Platform/);
  assert.match(css, /\.discussion-list/);
  assert.match(css, /\.upload-progress/);
});
