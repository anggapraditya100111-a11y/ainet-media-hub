const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { execFileSync, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');

test('API galeri membatasi daftar, menghasilkan WebP, dan mewarisi izin media', { timeout: 20_000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'media-hub-gallery-test-'));
  Object.assign(process.env, {
    DATA_DIR: path.join(temp, 'data'), UPLOAD_DIR: path.join(temp, 'uploads'), BACKUP_DIR: path.join(temp, 'backups'),
    APP_PEPPER: randomBytes(24).toString('hex'), INITIAL_ADMIN_PASSWORD: 'GalleryTest123',
    SEED_DEMO: 'true', OIDC_ENABLED: 'false', ACCESS_NOTIFICATION_ENABLED: 'false', COOKIE_SECURE: 'false'
  });
  const { db, UPLOAD_DIR, nowIso } = require('../src/db');
  const { app } = require('../src/server');
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  async function login(username, password) {
    const response = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
    });
    assert.equal(response.status, 200);
    await response.text();
    return response.headers.get('set-cookie').split(';')[0];
  }

  const admin = await login('admin', 'GalleryTest123');
  const vendor = await login('vendor', 'Demo12345');
  const get = (url, cookie = admin, headers = {}) => fetch(base + url, {
    cache: 'force-cache',
    headers: { ...headers, ...(cookie && { cookie }) }
  });

  const owner = db.prepare("SELECT id FROM users WHERE role='SUPER_ADMIN'").get().id;
  const stamp = nowIso();
  const asset = db.prepare("INSERT INTO media_assets(id,code,title,category,status,owner_id,created_at,updated_at) VALUES(?,?,?,'PHOTO_VIDEO',?,?,?,?)");
  const version = db.prepare("INSERT INTO media_asset_versions(id,asset_id,version_number,file_path,original_name,mime_type,file_size,checksum,cover_file_path,uploaded_by,created_at) VALUES(?,?,1,?,?,'video/mp4',1,'sample',?,?,?)");
  const setActive = db.prepare('UPDATE media_assets SET active_version_id=? WHERE id=?');
  const raw = db.prepare("INSERT INTO raw_footage(id,code,title,category,file_path,original_name,mime_type,file_size,checksum,uploaded_by,created_at,updated_at) VALUES(?,?,?,'VIDEO_RAW',?,?,'video/mp4',1,'sample',?,?,?)");
  db.transaction(() => {
    for (let i = 0; i < 55; i++) {
      const assetId = `asset-${i}`;
      const versionId = `version-${i}`;
      asset.run(assetId, `LIB-${i}`, `Fixture Media ${i}`, i === 1 ? 'ARCHIVED' : 'ACTIVE', owner, stamp, stamp);
      version.run(versionId, assetId, `library/video-${i}.mp4`, `video-${i}.mp4`, i === 0 ? 'library/cover.png' : null, owner, stamp);
      setActive.run(versionId, assetId);
      raw.run(`raw-${i}`, `RAW-${i}`, `Fixture Raw ${i}`, `raw-footage/video-${i}.mp4`, `video-${i}.mp4`, owner, stamp, stamp);
    }
  })();

  for (const endpoint of ['/api/library', '/api/raw-footage']) {
    const allIds = new Set();
    for (const [page, count, next] of [[1, 24, true], [2, 24, true], [3, 7, false]]) {
      const response = await get(`${endpoint}?q=Fixture&page=${page}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.pagination, { page, pageSize: 24, hasNext: next });
      assert.equal(data.items.length, count);
      for (const item of data.items) {
        assert.ok(item.thumbnailUrl.endsWith('/thumbnail'));
        assert.ok(!allIds.has(item.id), 'ties in updated_at must not repeat assets across pages');
        allIds.add(item.id);
      }
    }
    assert.equal((await (await get(`${endpoint}?view=picker&status=ACTIVE`)).json()).items.length, endpoint.endsWith('library') ? 54 : 55);
  }
  assert.equal((await get('/api/library/asset-0/thumbnail', '')).status, 401);
  assert.equal((await get('/api/library/asset-1/thumbnail', vendor)).status, 404);
  assert.equal((await get('/api/raw-footage/raw-0/thumbnail', vendor)).status, 404);
  assert.equal((await get('/api/raw-footage/raw-54/thumbnail')).status, 404, 'thumbnail missing must not serve the original');

  await t.test('FFmpeg membuat WebP kecil untuk cover dan video, lalu memakai cache', {
    skip: spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0
  }, async () => {
    const cover = path.join(UPLOAD_DIR, 'library', 'cover.png');
    const video = path.join(UPLOAD_DIR, 'raw-footage', 'video-0.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=480x640', '-frames:v', '1', '-threads', '1', '-update', '1', cover]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=640x480', '-frames:v', '2', '-c:v', 'mpeg4', '-threads', '1', video]);
    for (const [url, source] of [['/api/library/asset-0/thumbnail', cover], ['/api/raw-footage/raw-0/thumbnail', video]]) {
      const response = await get(url);
      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      assert.equal(response.headers.get('cache-control'), 'private, no-cache');
      const buffer = Buffer.from(await response.arrayBuffer());
      assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
      assert.ok(buffer.byteLength < 192 * 1024);
      const cached = `${source}.thumb-v1.webp`;
      const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', cached]);
      const [{ width, height }] = JSON.parse(probe).streams;
      assert.equal(Math.max(width, height), 384);
      assert.equal(width > height, source === video);
      assert.equal((await get(url, admin, { 'If-None-Match': response.headers.get('etag') })).status, 304);
    }
    assert.equal((await get('/api/library/asset-0/thumbnail', vendor)).status, 200);
    db.prepare("UPDATE media_assets SET status='ARCHIVED' WHERE id='asset-0'").run();
    assert.equal((await get('/api/library/asset-0/thumbnail', vendor)).status, 404, 'cache tidak membuka akses pada thumbnail arsip');
  });
});
