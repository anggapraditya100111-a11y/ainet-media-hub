const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword, newId } = require('./security');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

for (const directory of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(directory, { recursive: true });
for (const directory of ['drafts', 'library', 'proofs', 'branding', 'collaboration', 'chunks']) {
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
      approval_pin_hash TEXT,
      approval_pin_salt TEXT,
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
      production_mode TEXT NOT NULL DEFAULT 'VENDOR' CHECK(production_mode IN ('VENDOR','INTERNAL')),
      status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','BRIEFED','ASSIGNED','IN_PRODUCTION','DRAFT_SUBMITTED','IN_REVIEW','REVISION_REQUIRED','APPROVAL_PENDING','APPROVED','SCHEDULED','PUBLISHED','CANCELLED')),
      priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
      due_date TEXT,
      publish_at TEXT,
      budget INTEGER NOT NULL DEFAULT 0,
      brief TEXT,
      caption TEXT,
      hashtags TEXT,
      call_to_action TEXT,
      reference_urls_json TEXT NOT NULL DEFAULT '[]',
      vendor_edit_permissions_json TEXT NOT NULL DEFAULT '[]',
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

    CREATE TABLE IF NOT EXISTS collaboration_messages (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('BRIEF','PRE_PRODUCTION','PRODUCTION_RESULT')),
      message TEXT,
      sender_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(sender_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_collaboration_messages ON collaboration_messages(content_id,created_at);

    CREATE TABLE IF NOT EXISTS collaboration_files (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      message_id TEXT,
      phase TEXT NOT NULL CHECK(phase IN ('BRIEF','PRE_PRODUCTION','PRODUCTION_RESULT')),
      version_number INTEGER NOT NULL DEFAULT 1,
      file_path TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(message_id) REFERENCES collaboration_messages(id) ON DELETE SET NULL,
      FOREIGN KEY(uploaded_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_collaboration_files ON collaboration_files(content_id,phase,version_number);

    CREATE TABLE IF NOT EXISTS vendor_content_edits (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      field_name TEXT NOT NULL CHECK(field_name IN ('brief','description','caption','hashtags','call_to_action')),
      base_value TEXT NOT NULL DEFAULT '',
      added_value TEXT NOT NULL,
      proposed_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')),
      vendor_user_id TEXT NOT NULL,
      reviewed_by TEXT,
      review_note TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(vendor_user_id) REFERENCES users(id),
      FOREIGN KEY(reviewed_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_content_edits ON vendor_content_edits(content_id,status,created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_content_edits_pending
      ON vendor_content_edits(content_id,field_name) WHERE status='PENDING';

    CREATE TABLE IF NOT EXISTS material_share_links (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      snapshot_json TEXT NOT NULL,
      attachment_ids_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      last_viewed_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_material_share_content ON material_share_links(content_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS director_approval_requests (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      director_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      link_token_ciphertext TEXT,
      attachment_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','APPROVED','REVISION','CANCELLED')),
      note TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      opened_at TEXT,
      decided_at TEXT,
      cancelled_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(director_id) REFERENCES users(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_director_approval_content ON director_approval_requests(content_id,status,created_at DESC);

    CREATE TABLE IF NOT EXISTS approval_access_sessions (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(request_id) REFERENCES director_approval_requests(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_approval_access_expiry ON approval_access_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS publication_schedules (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      uploader_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','PUBLISHED','CANCELLED')),
      platform_url TEXT,
      published_at TEXT,
      proof_path TEXT,
      proof_name TEXT,
      proof_mime TEXT,
      metrics_json TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(channel_id) REFERENCES channels(id),
      FOREIGN KEY(uploader_id) REFERENCES users(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_publication_schedules ON publication_schedules(content_id,status,scheduled_at);

    CREATE TABLE IF NOT EXISTS chunk_upload_sessions (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('BRIEF','PRE_PRODUCTION','PRODUCTION_RESULT')),
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      total_size INTEGER NOT NULL,
      chunk_size INTEGER NOT NULL,
      received_size INTEGER NOT NULL DEFAULT 0,
      next_chunk INTEGER NOT NULL DEFAULT 0,
      temp_path TEXT NOT NULL UNIQUE,
      message TEXT,
      created_by TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_chunk_upload_expiry ON chunk_upload_sessions(expires_at,status);

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
  migrateApprovalSecurityAndReferences();
  migrateWorkflowV4();

  seedBaseData();
  if (String(process.env.SEED_DEMO || '').toLowerCase() === 'true') seedDemoData();
}

function migrateApprovalSecurityAndReferences() {
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  if (!userColumns.has('approval_pin_hash')) db.exec('ALTER TABLE users ADD COLUMN approval_pin_hash TEXT');
  if (!userColumns.has('approval_pin_salt')) db.exec('ALTER TABLE users ADD COLUMN approval_pin_salt TEXT');

  const contentColumns = new Set(db.prepare('PRAGMA table_info(contents)').all().map(column => column.name));
  if (!contentColumns.has('reference_urls_json')) db.exec("ALTER TABLE contents ADD COLUMN reference_urls_json TEXT NOT NULL DEFAULT '[]'");
  if (!contentColumns.has('vendor_edit_permissions_json')) db.exec("ALTER TABLE contents ADD COLUMN vendor_edit_permissions_json TEXT NOT NULL DEFAULT '[]'");
  if (!contentColumns.has('production_mode')) db.exec("ALTER TABLE contents ADD COLUMN production_mode TEXT NOT NULL DEFAULT 'VENDOR' CHECK(production_mode IN ('VENDOR','INTERNAL'))");

  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_content_edits (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      field_name TEXT NOT NULL CHECK(field_name IN ('brief','description','caption','hashtags','call_to_action')),
      base_value TEXT NOT NULL DEFAULT '',
      added_value TEXT NOT NULL,
      proposed_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')),
      vendor_user_id TEXT NOT NULL,
      reviewed_by TEXT,
      review_note TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
      FOREIGN KEY(vendor_user_id) REFERENCES users(id),
      FOREIGN KEY(reviewed_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_content_edits ON vendor_content_edits(content_id,status,created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_content_edits_pending
      ON vendor_content_edits(content_id,field_name) WHERE status='PENDING';
  `);

  const approvalColumns = new Set(db.prepare('PRAGMA table_info(director_approval_requests)').all().map(column => column.name));
  if (!approvalColumns.has('link_token_ciphertext')) {
    db.exec('ALTER TABLE director_approval_requests ADD COLUMN link_token_ciphertext TEXT');
    const timestamp = nowIso();
    db.exec(`
      UPDATE director_approval_requests
      SET status='CANCELLED',cancelled_at='${timestamp}',note=COALESCE(note,'Dibatalkan saat migrasi ke PIN pribadi Direksi.')
      WHERE status='ACTIVE';
      UPDATE contents
      SET status='DRAFT_SUBMITTED',locked_at=NULL,updated_at='${timestamp}'
      WHERE status='APPROVAL_PENDING';
      DELETE FROM approval_access_sessions;
    `);
  }
}

function migrateWorkflowV4() {
  db.exec(`
    UPDATE users SET role='COORDINATOR',updated_at=datetime('now') WHERE role='REVIEWER';
    UPDATE users SET role='MANAGEMENT',updated_at=datetime('now') WHERE role='APPROVER';
    UPDATE contents SET status='DRAFT_SUBMITTED',updated_at=datetime('now') WHERE status='IN_REVIEW';
  `);
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
    ['Petugas Upload', 'uploader', 'UPLOADER', null],
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
    const uploader = db.prepare("SELECT id FROM users WHERE username='uploader'").get();
    const id = newId('cnt');
    db.prepare(`INSERT INTO contents(id,content_no,title,description,objective,audience,brand_id,campaign,category,content_type,approval_level,status,priority,due_date,publish_at,brief,coordinator_id,vendor_id,reviewer_id,approver_id,uploader_id,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, 'CNT-DEMO-001', 'Promo Internet Keluarga September', 'Konten edukasi dan promo AINET.',
      'Mendorong leads paket keluarga', 'Keluarga muda di area layanan', 'brand-ainet', 'September Ceria',
      'PROMOTION', 'CAROUSEL', 'REGULAR', 'IN_PRODUCTION', 'HIGH',
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      new Date(Date.now() + 5 * 86400000).toISOString(), 'Carousel 5 slide dengan CTA WhatsApp.',
      creator.id, vendor.id, null, null, uploader.id, creator.id, timestamp, timestamp
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
    approvalPinSet: Boolean(row.approval_pin_hash && row.approval_pin_salt),
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
  db.prepare('DELETE FROM approval_access_sessions WHERE expires_at<=?').run(nowIso());
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
