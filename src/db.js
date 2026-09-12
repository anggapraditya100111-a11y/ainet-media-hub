const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword, newId } = require('./security');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

for (const directory of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(directory, { recursive: true });
for (const directory of ['drafts', 'library', 'proofs', 'branding']) {
  fs.mkdirSync(path.join(UPLOAD_DIR, directory), { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'media-hub.sqlite');
const db = new DatabaseSync(DB_PATH, { timeout: 5000 });
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.transaction = function transaction(handler) {
  return (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = handler(...args);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  };
};

function nowIso() {
  return new Date().toISOString();
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
      sla_days INTEGER NOT NULL DEFAULT 3,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','COORDINATOR','VENDOR','REVIEWER','APPROVER','UPLOADER','MANAGEMENT')),
      vendor_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(vendor_id) REFERENCES vendors(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS oidc_login_attempts (
      state_hash TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      nonce TEXT NOT NULL,
      return_to TEXT NOT NULL DEFAULT '/',
      mode TEXT NOT NULL DEFAULT 'redirect',
      popup_channel TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_oidc_attempts_expiry ON oidc_login_attempts(expires_at);

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      content_no TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      objective TEXT,
      audience TEXT,
      brand_id TEXT NOT NULL,
      campaign TEXT,
      category TEXT NOT NULL DEFAULT 'EDUCATION',
      content_type TEXT NOT NULL DEFAULT 'SOCIAL_POST',
      approval_level TEXT NOT NULL DEFAULT 'REGULAR' CHECK(approval_level IN ('REGULAR','SENSITIVE')),
      status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','BRIEFED','ASSIGNED','IN_PRODUCTION','DRAFT_SUBMITTED','IN_REVIEW','REVISION_REQUIRED','APPROVAL_PENDING','APPROVED','SCHEDULED','PUBLISHED','CANCELLED')),
      priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
      due_date TEXT,
      publish_at TEXT,
      budget INTEGER NOT NULL DEFAULT 0,
      brief TEXT,
      caption TEXT,
      hashtags TEXT,
      call_to_action TEXT,
      internal_notes TEXT,
      coordinator_id TEXT,
      vendor_id TEXT,
      reviewer_id TEXT,
      approver_id TEXT,
      uploader_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      locked_at TEXT,
      FOREIGN KEY(brand_id) REFERENCES brands(id),
      FOREIGN KEY(coordinator_id) REFERENCES users(id),
      FOREIGN KEY(vendor_id) REFERENCES vendors(id),
      FOREIGN KEY(reviewer_id) REFERENCES users(id),
      FOREIGN KEY(approver_id) REFERENCES users(id),
      FOREIGN KEY(uploader_id) REFERENCES users(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contents_due ON contents(due_date);
    CREATE INDEX IF NOT EXISTS idx_contents_vendor ON contents(vendor_id, status);

    CREATE TABLE IF NOT EXISTS content_channels (
      content_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      PRIMARY KEY(content_id, channel_id),
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(channel_id) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS content_versions (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      caption TEXT,
      change_note TEXT,
      submitted_by TEXT NOT NULL,
      is_approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(content_id, version_number),
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(submitted_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS workflow_events (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      action TEXT NOT NULL,
      note TEXT,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_content ON workflow_events(content_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      version_id TEXT,
      decision TEXT NOT NULL CHECK(decision IN ('PASS','REVISION')),
      note TEXT,
      reviewer_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(version_id) REFERENCES content_versions(id),
      FOREIGN KEY(reviewer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      version_id TEXT,
      decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REVISION')),
      note TEXT,
      approver_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(version_id) REFERENCES content_versions(id),
      FOREIGN KEY(approver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS publication_proofs (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      channel_id TEXT,
      platform_url TEXT,
      published_at TEXT NOT NULL,
      file_path TEXT,
      original_name TEXT,
      mime_type TEXT,
      metrics_json TEXT,
      uploader_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(channel_id) REFERENCES channels(id),
      FOREIGN KEY(uploader_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL CHECK(category IN ('BRAND_CENTER','BROCHURE_PRODUCT','CONTENT_TEMPLATE','PHOTO_VIDEO','CAMPAIGN','ARCHIVE')),
      brand_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','ARCHIVED')),
      active_version_id TEXT,
      effective_from TEXT,
      expires_at TEXT,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(brand_id) REFERENCES brands(id),
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_assets_category ON media_assets(category, status);

    CREATE TABLE IF NOT EXISTS media_asset_versions (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      notes TEXT,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(asset_id, version_number),
      FOREIGN KEY(asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,
      FOREIGN KEY(uploaded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS content_assets (
      content_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      PRIMARY KEY(content_id, asset_id),
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(asset_id) REFERENCES media_assets(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      reason TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(actor_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS sequences (
      sequence_key TEXT PRIMARY KEY,
      last_value INTEGER NOT NULL
    );
  `);

  migrateUsersForOidc();
  migrateOidcAttemptsForPopup();

  seedBaseData();
  if (String(process.env.SEED_DEMO || '').toLowerCase() === 'true') seedDemoData();
}

function migrateOidcAttemptsForPopup() {
  const columns = new Set(db.prepare('PRAGMA table_info(oidc_login_attempts)').all().map(column => column.name));
  if (!columns.has('mode')) db.exec("ALTER TABLE oidc_login_attempts ADD COLUMN mode TEXT NOT NULL DEFAULT 'redirect'");
  if (!columns.has('popup_channel')) db.exec('ALTER TABLE oidc_login_attempts ADD COLUMN popup_channel TEXT');
}

function migrateUsersForOidc() {
  const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  const additions = [
    ['email', 'TEXT'],
    ['auth_source', "TEXT NOT NULL DEFAULT 'LOCAL'"],
    ['oidc_issuer', 'TEXT'],
    ['oidc_subject', 'TEXT'],
    ['oidc_groups_json', 'TEXT'],
    ['oidc_last_sync_at', 'TEXT']
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_identity
      ON users(oidc_issuer,oidc_subject)
      WHERE oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
}

function setSetting(key, value, actorId = null) {
  db.prepare(`INSERT INTO settings(key,value,updated_by,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .run(String(key), String(value ?? ''), actorId, nowIso());
}

function getSetting(key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(String(key))?.value ?? fallback;
}

function seedBaseData() {
  const timestamp = nowIso();
  const baseSettings = {
    APP_NAME: process.env.DEFAULT_APP_NAME || 'AXINDO Media Hub',
    COMPANY_NAME: process.env.DEFAULT_COMPANY_NAME || 'PT Axindo Infinitas Network',
    TIMEZONE: 'Asia/Jakarta',
    THEME_PRIMARY: '#2563eb',
    THEME_SECONDARY: '#f97316',
    LOGO_PATH: ''
  };
  for (const [key, value] of Object.entries(baseSettings)) {
    db.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key, value, timestamp);
  }

  const brands = [
    ['brand-ainet', 'AINET', 'AINET', '#2563eb'],
    ['brand-imas', 'IMAS', 'IMAS', '#f97316']
  ];
  for (const brand of brands) {
    db.prepare('INSERT OR IGNORE INTO brands(id,code,name,color,created_at) VALUES(?,?,?,?,?)').run(...brand, timestamp);
  }

  const channels = [
    ['channel-instagram', 'INSTAGRAM', 'Instagram'],
    ['channel-tiktok', 'TIKTOK', 'TikTok'],
    ['channel-facebook', 'FACEBOOK', 'Facebook'],
    ['channel-youtube', 'YOUTUBE', 'YouTube'],
    ['channel-whatsapp', 'WHATSAPP', 'WhatsApp Broadcast'],
    ['channel-website', 'WEBSITE', 'Website / Banner']
  ];
  for (const channel of channels) {
    db.prepare('INSERT OR IGNORE INTO channels(id,code,name,created_at) VALUES(?,?,?,?)').run(...channel, timestamp);
  }

  if (!db.prepare("SELECT id FROM users WHERE role='SUPER_ADMIN' LIMIT 1").get()) {
    const password = process.env.INITIAL_ADMIN_PASSWORD || 'Admin12345';
    const credentials = hashPassword(password);
    db.prepare(`INSERT INTO users(id,name,username,password_hash,password_salt,role,active,must_change_password,created_at,updated_at)
      VALUES(?,?,?,?,?,'SUPER_ADMIN',1,1,?,?)`).run(
      newId('usr'), process.env.INITIAL_ADMIN_NAME || 'Administrator',
      process.env.INITIAL_ADMIN_USERNAME || 'admin', credentials.hash, credentials.salt, timestamp, timestamp
    );
  }
}

function seedDemoData() {
  const timestamp = nowIso();
  let vendor = db.prepare("SELECT * FROM vendors WHERE name='Studio Kreatif Nusantara'").get();
  if (!vendor) {
    const id = newId('vnd');
    db.prepare(`INSERT INTO vendors(id,name,contact_name,email,phone,status,sla_days,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,'ACTIVE',3,?,?,?)`).run(id, 'Studio Kreatif Nusantara', 'Raka', 'vendor@example.test', '0800000000', 'Vendor demo', timestamp, timestamp);
    vendor = { id };
  }

  const demoUsers = [
    ['Koordinator Media', 'koordinator', 'COORDINATOR', null],
    ['Kreator Vendor', 'vendor', 'VENDOR', vendor.id],
    ['Reviewer Konten', 'reviewer', 'REVIEWER', null],
    ['Approver Konten', 'approver', 'APPROVER', null],
    ['Petugas Uploader', 'uploader', 'UPLOADER', null],
    ['Direksi', 'manajemen', 'MANAGEMENT', null]
  ];
  for (const [name, username, role, vendorId] of demoUsers) {
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) continue;
    const credentials = hashPassword('Demo12345');
    db.prepare(`INSERT INTO users(id,name,username,password_hash,password_salt,role,vendor_id,active,must_change_password,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,1,0,?,?)`).run(newId('usr'), name, username, credentials.hash, credentials.salt, role, vendorId, timestamp, timestamp);
  }

  if (!db.prepare('SELECT id FROM contents LIMIT 1').get()) {
    const creator = db.prepare("SELECT id FROM users WHERE username='koordinator'").get();
    const reviewer = db.prepare("SELECT id FROM users WHERE username='reviewer'").get();
    const approver = db.prepare("SELECT id FROM users WHERE username='approver'").get();
    const uploader = db.prepare("SELECT id FROM users WHERE username='uploader'").get();
    const id = newId('cnt');
    db.prepare(`INSERT INTO contents(id,content_no,title,description,objective,audience,brand_id,campaign,category,content_type,approval_level,status,priority,due_date,publish_at,brief,coordinator_id,vendor_id,reviewer_id,approver_id,uploader_id,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, 'CNT-DEMO-001', 'Promo Internet Keluarga September', 'Konten edukasi dan promo AINET.',
      'Mendorong leads paket keluarga', 'Keluarga muda di area layanan', 'brand-ainet', 'September Ceria',
      'PROMOTION', 'CAROUSEL', 'REGULAR', 'IN_PRODUCTION', 'HIGH',
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      new Date(Date.now() + 5 * 86400000).toISOString(), 'Carousel 5 slide dengan CTA WhatsApp.',
      creator.id, vendor.id, reviewer.id, approver.id, uploader.id, creator.id, timestamp, timestamp
    );
    db.prepare('INSERT INTO content_channels(content_id,channel_id) VALUES(?,?)').run(id, 'channel-instagram');
    db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
      VALUES(?,?,NULL,'IN_PRODUCTION','SEEDED','Data contoh awal',?,?)`).run(newId('evt'), id, creator.id, timestamp);
  }
}

function nextContentNumber() {
  const period = new Date().toISOString().slice(0, 7).replace('-', '');
  const key = `CONTENT-${period}`;
  const current = db.prepare('SELECT last_value FROM sequences WHERE sequence_key=?').get(key)?.last_value || 0;
  const next = current + 1;
  db.prepare(`INSERT INTO sequences(sequence_key,last_value) VALUES(?,?)
    ON CONFLICT(sequence_key) DO UPDATE SET last_value=excluded.last_value`).run(key, next);
  return `CNT-${period}-${String(next).padStart(4, '0')}`;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, username: row.username, email: row.email || null, role: row.role,
    vendorId: row.vendor_id || null, active: Boolean(row.active),
    authSource: row.auth_source || 'LOCAL',
    mustChangePassword: Boolean(row.must_change_password), lastLogin: row.last_login || null,
    oidcLastSyncAt: row.oidc_last_sync_at || null
  };
}

function recordAudit({ actorId = null, entityType, entityId = null, action, before = null, after = null, reason = null, ip = null }) {
  db.prepare(`INSERT INTO audit_logs(id,actor_id,entity_type,entity_id,action,before_json,after_json,reason,ip_address,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      newId('aud'), actorId, entityType, entityId, action,
      before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after),
      reason, ip, nowIso()
    );
}

function notifyUser(userId, type, title, body = '', link = '') {
  if (!userId) return;
  db.prepare(`INSERT INTO notifications(id,user_id,type,title,body,link,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(newId('ntf'), userId, type, title, body, link, nowIso());
}

function notifyRole(role, type, title, body = '', link = '') {
  const users = db.prepare('SELECT id FROM users WHERE role=? AND active=1').all(role);
  for (const user of users) notifyUser(user.id, type, title, body, link);
}

function cleanupExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(nowIso());
  db.prepare('DELETE FROM oidc_login_attempts WHERE expires_at<=?').run(nowIso());
}

async function createDatabaseBackup(label = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const safeLabel = String(label).replace(/[^a-z0-9_-]/gi, '-').slice(0, 30) || 'manual';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(BACKUP_DIR, `media-hub-${safeLabel}-${stamp}.sqlite`);
  const escaped = destination.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  return destination;
}

function listDatabaseBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => /^media-hub-.*\.sqlite$/.test(name))
    .map(name => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

initDatabase();

module.exports = {
  db, DB_PATH, DATA_DIR, UPLOAD_DIR, BACKUP_DIR, nowIso, getSetting, setSetting,
  nextContentNumber, publicUser, recordAudit, notifyUser, notifyRole,
  cleanupExpiredSessions, createDatabaseBackup, listDatabaseBackups
};
