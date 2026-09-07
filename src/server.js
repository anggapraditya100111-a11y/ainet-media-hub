const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');

const {
  db, UPLOAD_DIR, BACKUP_DIR, nowIso, getSetting, setSetting, nextContentNumber,
  publicUser, recordAudit, notifyUser, notifyRole, cleanupExpiredSessions,
  createDatabaseBackup, listDatabaseBackups
} = require('./db');
const {
  newId, randomToken, hashToken, hashPassword, verifyPassword, assertPassword,
  cleanText, cleanUsername, safeFilename, checksum
} = require('./security');
const { ROLE_LABELS, permissionsForRole, hasPermission } = require('./permissions');
const { STATUS_LABELS, TRANSITIONS, TRANSITION_PERMISSION, assertTransition } = require('./workflow');

const APP_VERSION = '0.1.1';
const PORT = Number(process.env.PORT || 8094);
const COOKIE_NAME = 'mh_session';
const SESSION_HOURS = Math.max(1, Math.min(168, Number(process.env.SESSION_HOURS || 12) || 12));
const MAX_UPLOAD_MB = Math.max(1, Math.min(250, Number(process.env.MAX_UPLOAD_MB || 50) || 50));
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function toBoolean(value) {
  return value === true || ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function toInteger(value, fallback = 0) {
  const result = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(result) ? result : fallback;
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null || value === '') return [];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function requiredText(value, label, max = 500) {
  const text = cleanText(value, max);
  if (!text) throw new AppError(`${label} wajib diisi.`);
  return text;
}

function requestIp(req) {
  return cleanText(req.ip || req.socket?.remoteAddress || '', 100);
}

function jsonObject(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function settingsPayload() {
  return {
    appName: getSetting('APP_NAME', 'AXINDO Media Hub'),
    companyName: getSetting('COMPANY_NAME', 'PT Axindo Infinitas Network'),
    timezone: getSetting('TIMEZONE', 'Asia/Jakarta'),
    primaryColor: getSetting('THEME_PRIMARY', '#2563eb'),
    secondaryColor: getSetting('THEME_SECONDARY', '#f97316'),
    logoUrl: getSetting('LOGO_PATH') ? '/api/branding/logo' : '',
    appVersion: APP_VERSION
  };
}

function createUploader(folder, options = {}) {
  const directory = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(directory, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, directory),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  });
  const allowed = options.imagesOnly
    ? mime => String(mime).startsWith('image/')
    : mime => /^(image|video|audio)\//.test(String(mime)) || [
      'application/pdf', 'application/zip', 'application/x-zip-compressed',
      'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ].includes(String(mime));
  return multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => callback(allowed(file.mimetype) ? null : new AppError('Jenis berkas tidak didukung.'), allowed(file.mimetype))
  });
}

const draftUpload = createUploader('drafts');
const libraryUpload = createUploader('library');
const proofUpload = createUploader('proofs');
const logoUpload = createUploader('branding', { imagesOnly: true });

function removeUpload(file) {
  if (!file?.path) return;
  try { fs.unlinkSync(file.path); } catch {}
}

function serializeContent(row) {
  if (!row) return null;
  return {
    ...row,
    budget: Number(row.budget || 0),
    channels: row.channel_names ? String(row.channel_names).split('||').filter(Boolean) : [],
    channelIds: row.channel_ids ? String(row.channel_ids).split('||').filter(Boolean) : [],
    statusLabel: STATUS_LABELS[row.status] || row.status,
    versionCount: Number(row.version_count || 0),
    proofCount: Number(row.proof_count || 0)
  };
}

const CONTENT_SELECT = `
  SELECT c.*, b.code AS brand_code, b.name AS brand_name, b.color AS brand_color,
    v.name AS vendor_name, creator.name AS created_by_name,
    coordinator.name AS coordinator_name, reviewer.name AS reviewer_name,
    approver.name AS approver_name, uploader.name AS uploader_name,
    (SELECT group_concat(ch.name, '||') FROM content_channels cc JOIN channels ch ON ch.id=cc.channel_id WHERE cc.content_id=c.id) AS channel_names,
    (SELECT group_concat(cc.channel_id, '||') FROM content_channels cc WHERE cc.content_id=c.id) AS channel_ids,
    (SELECT COUNT(*) FROM content_versions cv WHERE cv.content_id=c.id) AS version_count,
    (SELECT COUNT(*) FROM publication_proofs pp WHERE pp.content_id=c.id) AS proof_count
  FROM contents c
  JOIN brands b ON b.id=c.brand_id
  LEFT JOIN vendors v ON v.id=c.vendor_id
  LEFT JOIN users creator ON creator.id=c.created_by
  LEFT JOIN users coordinator ON coordinator.id=c.coordinator_id
  LEFT JOIN users reviewer ON reviewer.id=c.reviewer_id
  LEFT JOIN users approver ON approver.id=c.approver_id
  LEFT JOIN users uploader ON uploader.id=c.uploader_id`;

function contentVisibility(user, alias = 'c') {
  if (hasPermission(user, 'content.view_all') || user.role === 'SUPER_ADMIN') return { sql: '1=1', params: [] };
  if (user.role === 'VENDOR') return { sql: `${alias}.vendor_id=?`, params: [user.vendorId || '__none__'] };
  if (user.role === 'UPLOADER') return { sql: `${alias}.status IN ('APPROVED','SCHEDULED','PUBLISHED')`, params: [] };
  return { sql: `${alias}.created_by=?`, params: [user.id] };
}

function getContent(id, user) {
  const visibility = contentVisibility(user);
  const row = db.prepare(`${CONTENT_SELECT} WHERE c.id=? AND ${visibility.sql}`).get(id, ...visibility.params);
  if (!row) throw new AppError('Konten tidak ditemukan atau tidak dapat diakses.', 404);
  return serializeContent(row);
}

function ensurePermission(user, permission) {
  if (!hasPermission(user, permission)) throw new AppError('Anda tidak memiliki hak akses untuk tindakan ini.', 403);
}

function latestVersion(contentId) {
  return db.prepare('SELECT * FROM content_versions WHERE content_id=? ORDER BY version_number DESC LIMIT 1').get(contentId);
}

function notifyVendor(vendorId, type, title, body, link) {
  if (!vendorId) return;
  for (const row of db.prepare("SELECT id FROM users WHERE vendor_id=? AND role='VENDOR' AND active=1").all(vendorId)) {
    notifyUser(row.id, type, title, body, link);
  }
}

const app = express();
if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      frameSrc: ["'self'", 'blob:'],
      upgradeInsecureRequests: COOKIE_SECURE ? [] : null
    }
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
    if (fetchSite === 'cross-site') return next(new AppError('Permintaan lintas situs ditolak.', 403));
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Terlalu banyak percobaan login. Coba kembali satu menit lagi.' }
});

function authenticate(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  const tokenHash = hashToken('SESSION', token);
  const row = db.prepare(`SELECT s.id AS session_id,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).get(tokenHash, nowIso());
  if (!row) return next();
  req.user = publicUser(row);
  req.sessionId = row.session_id;
  db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(nowIso(), row.session_id);
  next();
}

function authRequired(req, _res, next) {
  if (!req.user) return next(new AppError('Sesi berakhir. Silakan login kembali.', 401));
  next();
}

function permissionRequired(permission) {
  return (req, _res, next) => {
    try { ensurePermission(req.user, permission); next(); } catch (error) { next(error); }
  };
}

app.use(authenticate);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ainet-media-hub', version: APP_VERSION, time: nowIso() });
});

app.get('/api/public/config', (_req, res) => res.json(settingsPayload()));

app.post('/api/auth/login', loginLimiter, (req, res, next) => {
  try {
    cleanupExpiredSessions();
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || '');
    const user = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      recordAudit({ entityType: 'AUTH', action: 'LOGIN_FAILED', reason: username, ip: requestIp(req) });
      throw new AppError('Username atau password salah.', 401);
    }
    const token = randomToken();
    const timestamp = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
    db.prepare('INSERT INTO sessions(id,token_hash,user_id,expires_at,last_seen,created_at) VALUES(?,?,?,?,?,?)')
      .run(newId('ses'), hashToken('SESSION', token), user.id, expiresAt, timestamp, timestamp);
    db.prepare('UPDATE users SET last_login=?,updated_at=? WHERE id=?').run(timestamp, timestamp, user.id);
    recordAudit({ actorId: user.id, entityType: 'AUTH', entityId: user.id, action: 'LOGIN', ip: requestIp(req) });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict',
      maxAge: SESSION_HOURS * 3600000, path: '/'
    });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', authRequired, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id=?').run(req.sessionId);
  recordAudit({ actorId: req.user.id, entityType: 'AUTH', entityId: req.user.id, action: 'LOGOUT', ip: requestIp(req) });
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/bootstrap', authRequired, (req, res) => {
  const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user.id).count;
  res.json({
    user: req.user,
    permissions: permissionsForRole(req.user.role),
    roleLabels: ROLE_LABELS,
    statusLabels: STATUS_LABELS,
    transitions: TRANSITIONS,
    config: settingsPayload(),
    brands: db.prepare('SELECT * FROM brands WHERE active=1 ORDER BY name').all(),
    channels: db.prepare('SELECT * FROM channels WHERE active=1 ORDER BY name').all(),
    unreadNotifications: Number(unread || 0)
  });
});

app.post('/api/profile/password', authRequired, (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!verifyPassword(String(req.body.currentPassword || ''), row.password_salt, row.password_hash)) {
      throw new AppError('Password saat ini salah.', 401);
    }
    assertPassword(req.body.newPassword);
    const credentials = hashPassword(String(req.body.newPassword));
    const timestamp = nowIso();
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=0,updated_at=? WHERE id=?')
        .run(credentials.hash, credentials.salt, timestamp, req.user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(req.user.id, req.sessionId);
      recordAudit({ actorId: req.user.id, entityType: 'USER', entityId: req.user.id, action: 'PASSWORD_CHANGED', ip: requestIp(req) });
    })();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/dashboard', authRequired, (req, res) => {
  const visibility = contentVisibility(req.user);
  const metrics = db.prepare(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status IN ('REQUESTED','BRIEFED','ASSIGNED','IN_PRODUCTION') THEN 1 ELSE 0 END) AS production,
    SUM(CASE WHEN status IN ('DRAFT_SUBMITTED','IN_REVIEW','REVISION_REQUIRED') THEN 1 ELSE 0 END) AS review,
    SUM(CASE WHEN status='APPROVAL_PENDING' THEN 1 ELSE 0 END) AS approval,
    SUM(CASE WHEN status IN ('APPROVED','SCHEDULED') THEN 1 ELSE 0 END) AS ready,
    SUM(CASE WHEN status='PUBLISHED' THEN 1 ELSE 0 END) AS published,
    SUM(CASE WHEN due_date<date('now') AND status NOT IN ('PUBLISHED','CANCELLED') THEN 1 ELSE 0 END) AS overdue
    FROM contents c WHERE ${visibility.sql}`).get(...visibility.params);
  const pipeline = db.prepare(`SELECT status,COUNT(*) AS count FROM contents c WHERE ${visibility.sql} GROUP BY status`).all(...visibility.params);
  const upcoming = db.prepare(`${CONTENT_SELECT} WHERE ${visibility.sql} AND c.status NOT IN ('PUBLISHED','CANCELLED')
    ORDER BY CASE WHEN c.due_date IS NULL THEN 1 ELSE 0 END,c.due_date ASC LIMIT 8`).all(...visibility.params).map(serializeContent);
  const publishedThisMonth = db.prepare(`SELECT COUNT(*) AS count FROM contents c WHERE ${visibility.sql}
    AND c.status='PUBLISHED' AND substr(c.locked_at,1,7)=substr(date('now'),1,7)`).get(...visibility.params).count;
  res.json({
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number(value || 0)])),
    pipeline: pipeline.map(row => ({ ...row, count: Number(row.count), label: STATUS_LABELS[row.status] || row.status })),
    upcoming,
    publishedThisMonth: Number(publishedThisMonth || 0)
  });
});

app.get('/api/contents', authRequired, (req, res) => {
  const visibility = contentVisibility(req.user);
  const conditions = [visibility.sql];
  const params = [...visibility.params];
  const statuses = arrayValue(req.query.status);
  if (statuses.length) {
    conditions.push(`c.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (req.query.brandId) { conditions.push('c.brand_id=?'); params.push(String(req.query.brandId)); }
  if (req.query.vendorId) { conditions.push('c.vendor_id=?'); params.push(String(req.query.vendorId)); }
  if (req.query.from) { conditions.push("COALESCE(c.publish_at,c.due_date||'T00:00:00')>=?"); params.push(String(req.query.from)); }
  if (req.query.to) { conditions.push("COALESCE(c.publish_at,c.due_date||'T23:59:59')<=?"); params.push(String(req.query.to)); }
  if (req.query.q) {
    conditions.push('(c.title LIKE ? OR c.content_no LIKE ? OR c.campaign LIKE ?)');
    const query = `%${cleanText(req.query.q, 100)}%`;
    params.push(query, query, query);
  }
  const limit = Math.max(1, Math.min(250, toInteger(req.query.limit, 100)));
  const rows = db.prepare(`${CONTENT_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY c.updated_at DESC LIMIT ?`)
    .all(...params, limit).map(serializeContent);
  res.json({ items: rows });
});

app.post('/api/contents', authRequired, permissionRequired('content.create'), (req, res, next) => {
  try {
    const id = newId('cnt');
    const timestamp = nowIso();
    const channelIds = arrayValue(req.body.channelIds);
    const payload = {
      id,
      contentNo: nextContentNumber(),
      title: requiredText(req.body.title, 'Judul', 200),
      description: cleanText(req.body.description, 2000),
      objective: cleanText(req.body.objective, 1000),
      audience: cleanText(req.body.audience, 1000),
      brandId: requiredText(req.body.brandId, 'Brand', 100),
      campaign: cleanText(req.body.campaign, 150),
      category: cleanText(req.body.category || 'EDUCATION', 50),
      contentType: cleanText(req.body.contentType || 'SOCIAL_POST', 50),
      approvalLevel: String(req.body.approvalLevel || 'REGULAR') === 'SENSITIVE' ? 'SENSITIVE' : 'REGULAR',
      priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(req.body.priority) ? req.body.priority : 'NORMAL',
      dueDate: cleanText(req.body.dueDate, 20) || null,
      publishAt: cleanText(req.body.publishAt, 40) || null,
      budget: Math.max(0, toInteger(req.body.budget)),
      brief: cleanText(req.body.brief, 5000),
      caption: cleanText(req.body.caption, 5000),
      hashtags: cleanText(req.body.hashtags, 1000),
      callToAction: cleanText(req.body.callToAction, 1000),
      internalNotes: cleanText(req.body.internalNotes, 2000),
      coordinatorId: cleanText(req.body.coordinatorId, 100) || req.user.id,
      vendorId: cleanText(req.body.vendorId, 100) || null,
      reviewerId: cleanText(req.body.reviewerId, 100) || null,
      approverId: cleanText(req.body.approverId, 100) || null,
      uploaderId: cleanText(req.body.uploaderId, 100) || null
    };
    db.transaction(() => {
      db.prepare(`INSERT INTO contents(id,content_no,title,description,objective,audience,brand_id,campaign,category,content_type,approval_level,status,priority,due_date,publish_at,budget,brief,caption,hashtags,call_to_action,internal_notes,coordinator_id,vendor_id,reviewer_id,approver_id,uploader_id,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'REQUESTED',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        payload.id, payload.contentNo, payload.title, payload.description, payload.objective, payload.audience,
        payload.brandId, payload.campaign, payload.category, payload.contentType, payload.approvalLevel,
        payload.priority, payload.dueDate, payload.publishAt, payload.budget, payload.brief, payload.caption,
        payload.hashtags, payload.callToAction, payload.internalNotes, payload.coordinatorId, payload.vendorId,
        payload.reviewerId, payload.approverId, payload.uploaderId, req.user.id, timestamp, timestamp
      );
      for (const channelId of channelIds) {
        db.prepare('INSERT OR IGNORE INTO content_channels(content_id,channel_id) VALUES(?,?)').run(id, channelId);
      }
      db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
        VALUES(?,?,NULL,'REQUESTED','CREATE',?,?,?)`).run(newId('evt'), id, 'Permintaan konten dibuat', req.user.id, timestamp);
      recordAudit({ actorId: req.user.id, entityType: 'CONTENT', entityId: id, action: 'CREATE', after: payload, ip: requestIp(req) });
    })();
    notifyRole('COORDINATOR', 'CONTENT_CREATED', `Permintaan baru ${payload.contentNo}`, payload.title, `/contents/${id}`);
    res.status(201).json({ item: getContent(id, req.user) });
  } catch (error) { next(error); }
});

app.get('/api/contents/:id', authRequired, (req, res) => {
  const item = getContent(req.params.id, req.user);
  const versions = db.prepare(`SELECT cv.*,u.name AS submitted_by_name FROM content_versions cv
    JOIN users u ON u.id=cv.submitted_by WHERE cv.content_id=? ORDER BY cv.version_number DESC`).all(item.id)
    .map(row => ({ ...row, fileUrl: `/api/files/drafts/${path.basename(row.file_path)}` }));
  const events = db.prepare(`SELECT we.*,u.name AS actor_name FROM workflow_events we JOIN users u ON u.id=we.actor_id
    WHERE we.content_id=? ORDER BY we.created_at DESC`).all(item.id);
  const proofs = db.prepare(`SELECT pp.*,u.name AS uploader_name,ch.name AS channel_name FROM publication_proofs pp
    JOIN users u ON u.id=pp.uploader_id LEFT JOIN channels ch ON ch.id=pp.channel_id
    WHERE pp.content_id=? ORDER BY pp.published_at DESC`).all(item.id)
    .map(row => ({ ...row, metrics: jsonObject(row.metrics_json), fileUrl: row.file_path ? `/api/files/proofs/${path.basename(row.file_path)}` : '' }));
  const assets = db.prepare(`SELECT ma.id,ma.code,ma.title,ma.category,ma.status FROM content_assets ca
    JOIN media_assets ma ON ma.id=ca.asset_id WHERE ca.content_id=? ORDER BY ma.title`).all(item.id);
  res.json({ item, versions, events, proofs, assets });
});

app.patch('/api/contents/:id', authRequired, permissionRequired('content.edit'), (req, res, next) => {
  try {
    const current = getContent(req.params.id, req.user);
    if (['PUBLISHED', 'CANCELLED'].includes(current.status)) throw new AppError('Konten yang tayang atau dibatalkan tidak dapat diedit.', 409);
    const allowed = {
      title: ['title', 200], description: ['description', 2000], objective: ['objective', 1000],
      audience: ['audience', 1000], brandId: ['brand_id', 100], campaign: ['campaign', 150],
      category: ['category', 50], contentType: ['content_type', 50], approvalLevel: ['approval_level', 20],
      priority: ['priority', 20], dueDate: ['due_date', 20], publishAt: ['publish_at', 40],
      brief: ['brief', 5000], caption: ['caption', 5000], hashtags: ['hashtags', 1000],
      callToAction: ['call_to_action', 1000], internalNotes: ['internal_notes', 2000],
      coordinatorId: ['coordinator_id', 100], vendorId: ['vendor_id', 100], reviewerId: ['reviewer_id', 100],
      approverId: ['approver_id', 100], uploaderId: ['uploader_id', 100]
    };
    const sets = [];
    const values = [];
    let substantiveChange = false;
    for (const [input, [column, max]] of Object.entries(allowed)) {
      if (!Object.hasOwn(req.body, input)) continue;
      let value = cleanText(req.body[input], max) || null;
      if (input === 'title') value = requiredText(req.body[input], 'Judul', max);
      if (input === 'approvalLevel' && !['REGULAR', 'SENSITIVE'].includes(value)) throw new AppError('Tingkat persetujuan tidak valid.');
      if (input === 'priority' && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(value)) throw new AppError('Prioritas tidak valid.');
      sets.push(`${column}=?`); values.push(value);
      if (['title', 'description', 'objective', 'audience', 'brandId', 'brief', 'caption', 'hashtags', 'callToAction'].includes(input)) substantiveChange = true;
    }
    if (Object.hasOwn(req.body, 'budget')) { sets.push('budget=?'); values.push(Math.max(0, toInteger(req.body.budget))); }
    if (!sets.length && !Object.hasOwn(req.body, 'channelIds')) throw new AppError('Tidak ada perubahan yang dikirim.');
    const timestamp = nowIso();
    const reopen = substantiveChange && ['APPROVED', 'SCHEDULED'].includes(current.status);
    db.transaction(() => {
      if (sets.length) {
        sets.push('updated_at=?'); values.push(timestamp);
        if (reopen) { sets.push("status='DRAFT_SUBMITTED'", 'locked_at=NULL'); }
        db.prepare(`UPDATE contents SET ${sets.join(',')} WHERE id=?`).run(...values, current.id);
      }
      if (Object.hasOwn(req.body, 'channelIds')) {
        db.prepare('DELETE FROM content_channels WHERE content_id=?').run(current.id);
        for (const channelId of arrayValue(req.body.channelIds)) {
          db.prepare('INSERT OR IGNORE INTO content_channels(content_id,channel_id) VALUES(?,?)').run(current.id, channelId);
        }
      }
      if (reopen) {
        db.prepare('UPDATE content_versions SET is_approved=0 WHERE content_id=?').run(current.id);
        db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
          VALUES(?,?,?,?,?,?,?,?)`).run(newId('evt'), current.id, current.status, 'DRAFT_SUBMITTED', 'REOPEN_AFTER_EDIT', 'Perubahan setelah persetujuan; review dibuka kembali.', req.user.id, timestamp);
      }
      recordAudit({ actorId: req.user.id, entityType: 'CONTENT', entityId: current.id, action: reopen ? 'EDIT_REOPEN_REVIEW' : 'UPDATE', before: current, after: req.body, ip: requestIp(req) });
    })();
    res.json({ item: getContent(current.id, req.user), reopenedReview: reopen });
  } catch (error) { next(error); }
});

app.post('/api/contents/:id/version', authRequired, draftUpload.single('file'), (req, res, next) => {
  try {
    const item = getContent(req.params.id, req.user);
    if (!req.file) throw new AppError('Berkas draft wajib dipilih.');
    if (!hasPermission(req.user, 'content.upload_draft') && req.user.role !== 'SUPER_ADMIN') throw new AppError('Anda tidak dapat mengunggah draft.', 403);
    if (req.user.role === 'VENDOR' && item.vendor_id !== req.user.vendorId) throw new AppError('Tugas ini tidak diberikan kepada vendor Anda.', 403);
    if (item.status !== 'IN_PRODUCTION') throw new AppError('Draft hanya dapat dikirim ketika konten berstatus Produksi.', 409);
    const versionNumber = Number(db.prepare('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM content_versions WHERE content_id=?').get(item.id).next);
    const versionId = newId('ver');
    const timestamp = nowIso();
    const relativePath = path.join('drafts', req.file.filename);
    db.transaction(() => {
      db.prepare(`INSERT INTO content_versions(id,content_id,version_number,file_path,original_name,mime_type,file_size,caption,change_note,submitted_by,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
        versionId, item.id, versionNumber, relativePath, safeFilename(req.file.originalname), req.file.mimetype,
        req.file.size, cleanText(req.body.caption, 5000), cleanText(req.body.changeNote, 1000), req.user.id, timestamp
      );
      db.prepare("UPDATE contents SET status='DRAFT_SUBMITTED',caption=COALESCE(NULLIF(?,''),caption),updated_at=? WHERE id=?")
        .run(cleanText(req.body.caption, 5000), timestamp, item.id);
      db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(newId('evt'), item.id, item.status, 'DRAFT_SUBMITTED', 'UPLOAD_DRAFT', `Versi ${versionNumber}: ${cleanText(req.body.changeNote, 500)}`, req.user.id, timestamp);
      recordAudit({ actorId: req.user.id, entityType: 'CONTENT_VERSION', entityId: versionId, action: 'UPLOAD', after: { contentId: item.id, versionNumber, originalName: req.file.originalname, size: req.file.size }, ip: requestIp(req) });
    })();
    if (item.reviewer_id) notifyUser(item.reviewer_id, 'DRAFT_SUBMITTED', `Draft ${item.content_no} siap direview`, item.title, `/contents/${item.id}`);
    else notifyRole('REVIEWER', 'DRAFT_SUBMITTED', `Draft ${item.content_no} siap direview`, item.title, `/contents/${item.id}`);
    res.status(201).json({ item: getContent(item.id, req.user), versionNumber });
  } catch (error) { removeUpload(req.file); next(error); }
});

app.post('/api/contents/:id/transition', authRequired, (req, res, next) => {
  try {
    const item = getContent(req.params.id, req.user);
    const toStatus = String(req.body.toStatus || '');
    assertTransition(item.status, toStatus);
    if (toStatus === 'DRAFT_SUBMITTED') throw new AppError('Gunakan menu Upload Draft untuk mengirim versi.', 409);
    if (toStatus === 'PUBLISHED') throw new AppError('Gunakan menu Bukti Tayang untuk menandai konten sebagai tayang.', 409);
    let permission = TRANSITION_PERMISSION[toStatus];
    if (toStatus === 'REVISION_REQUIRED' && item.status === 'APPROVAL_PENDING') {
      permission = item.approval_level === 'SENSITIVE' ? 'content.approve_sensitive' : 'content.approve_regular';
    }
    if (toStatus === 'APPROVED' && item.approval_level === 'SENSITIVE') permission = 'content.approve_sensitive';
    ensurePermission(req.user, permission);
    if (req.user.role === 'VENDOR' && item.vendor_id !== req.user.vendorId) throw new AppError('Tugas ini tidak diberikan kepada vendor Anda.', 403);
    if (toStatus === 'ASSIGNED' && !item.vendor_id) throw new AppError('Pilih vendor sebelum menugaskan konten.', 409);
    if (['IN_REVIEW', 'APPROVAL_PENDING', 'APPROVED'].includes(toStatus) && !latestVersion(item.id)) throw new AppError('Draft belum tersedia.', 409);
    if (toStatus === 'SCHEDULED' && !item.publish_at) throw new AppError('Tanggal dan waktu tayang wajib diisi sebelum penjadwalan.', 409);
    const note = cleanText(req.body.note, 2000);
    if (toStatus === 'REVISION_REQUIRED' && !note) throw new AppError('Catatan revisi wajib diisi.');
    const timestamp = nowIso();
    const version = latestVersion(item.id);
    db.transaction(() => {
      db.prepare('UPDATE contents SET status=?,locked_at=?,updated_at=? WHERE id=?')
        .run(toStatus, toStatus === 'PUBLISHED' ? timestamp : null, timestamp, item.id);
      db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(newId('evt'), item.id, item.status, toStatus, 'TRANSITION', note, req.user.id, timestamp);
      if (['DRAFT_SUBMITTED', 'IN_REVIEW'].includes(item.status) && ['REVISION_REQUIRED', 'APPROVAL_PENDING'].includes(toStatus)) {
        db.prepare('INSERT INTO reviews(id,content_id,version_id,decision,note,reviewer_id,created_at) VALUES(?,?,?,?,?,?,?)')
          .run(newId('rev'), item.id, version?.id || null, toStatus === 'APPROVAL_PENDING' ? 'PASS' : 'REVISION', note, req.user.id, timestamp);
      }
      if (item.status === 'APPROVAL_PENDING' && ['APPROVED', 'REVISION_REQUIRED'].includes(toStatus)) {
        db.prepare('INSERT INTO approvals(id,content_id,version_id,decision,note,approver_id,created_at) VALUES(?,?,?,?,?,?,?)')
          .run(newId('apr'), item.id, version?.id || null, toStatus === 'APPROVED' ? 'APPROVED' : 'REVISION', note, req.user.id, timestamp);
        if (toStatus === 'APPROVED' && version) db.prepare('UPDATE content_versions SET is_approved=1 WHERE id=?').run(version.id);
      }
      recordAudit({ actorId: req.user.id, entityType: 'CONTENT', entityId: item.id, action: `STATUS_${toStatus}`, before: { status: item.status }, after: { status: toStatus }, reason: note, ip: requestIp(req) });
    })();

    const link = `/contents/${item.id}`;
    if (toStatus === 'ASSIGNED') notifyVendor(item.vendor_id, 'TASK_ASSIGNED', `Tugas baru ${item.content_no}`, item.title, link);
    if (toStatus === 'REVISION_REQUIRED') notifyVendor(item.vendor_id, 'REVISION_REQUIRED', `Revisi ${item.content_no}`, note, link);
    if (toStatus === 'APPROVAL_PENDING') {
      if (item.approver_id) notifyUser(item.approver_id, 'APPROVAL_PENDING', `Persetujuan ${item.content_no}`, item.title, link);
      else notifyRole('APPROVER', 'APPROVAL_PENDING', `Persetujuan ${item.content_no}`, item.title, link);
    }
    if (toStatus === 'APPROVED') {
      if (item.coordinator_id) notifyUser(item.coordinator_id, 'CONTENT_APPROVED', `${item.content_no} disetujui`, item.title, link);
      if (item.uploader_id) notifyUser(item.uploader_id, 'READY_TO_PUBLISH', `${item.content_no} siap tayang`, item.title, link);
      else notifyRole('UPLOADER', 'READY_TO_PUBLISH', `${item.content_no} siap tayang`, item.title, link);
    }
    if (toStatus === 'SCHEDULED') {
      if (item.uploader_id) notifyUser(item.uploader_id, 'CONTENT_SCHEDULED', `${item.content_no} dijadwalkan`, item.publish_at, link);
    }
    res.json({ item: getContent(item.id, req.user) });
  } catch (error) { next(error); }
});

app.post('/api/contents/:id/publication', authRequired, permissionRequired('content.publish'), proofUpload.single('file'), (req, res, next) => {
  try {
    const item = getContent(req.params.id, req.user);
    if (item.status !== 'SCHEDULED') throw new AppError('Konten harus berstatus Terjadwal sebelum bukti tayang dicatat.', 409);
    const platformUrl = cleanText(req.body.platformUrl, 1000);
    if (!req.file && !platformUrl) throw new AppError('Tautan publikasi atau berkas bukti wajib diisi.');
    const timestamp = nowIso();
    const proofId = newId('prf');
    const relativePath = req.file ? path.join('proofs', req.file.filename) : null;
    const metrics = {
      reach: Math.max(0, toInteger(req.body.reach)),
      impressions: Math.max(0, toInteger(req.body.impressions)),
      engagement: Math.max(0, toInteger(req.body.engagement)),
      leads: Math.max(0, toInteger(req.body.leads)),
      notes: cleanText(req.body.metricsNotes, 1000)
    };
    db.transaction(() => {
      db.prepare(`INSERT INTO publication_proofs(id,content_id,channel_id,platform_url,published_at,file_path,original_name,mime_type,metrics_json,uploader_id,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
        proofId, item.id, cleanText(req.body.channelId, 100) || null, platformUrl || null,
        cleanText(req.body.publishedAt, 40) || timestamp, relativePath,
        req.file ? safeFilename(req.file.originalname) : null, req.file?.mimetype || null,
        JSON.stringify(metrics), req.user.id, timestamp
      );
      db.prepare("UPDATE contents SET status='PUBLISHED',locked_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, item.id);
      db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
        VALUES(?,?,?,'PUBLISHED','PUBLICATION_PROOF',?,?,?)`).run(newId('evt'), item.id, item.status, platformUrl, req.user.id, timestamp);
      recordAudit({ actorId: req.user.id, entityType: 'PUBLICATION', entityId: proofId, action: 'CREATE', after: { contentId: item.id, platformUrl, metrics }, ip: requestIp(req) });
    })();
    notifyUser(item.coordinator_id, 'PUBLISHED', `${item.content_no} sudah tayang`, platformUrl || item.title, `/contents/${item.id}`);
    res.status(201).json({ item: getContent(item.id, req.user), proofId });
  } catch (error) { removeUpload(req.file); next(error); }
});

app.get('/api/calendar', authRequired, permissionRequired('calendar.view'), (req, res) => {
  const visibility = contentVisibility(req.user);
  const from = cleanText(req.query.from, 30) || new Date().toISOString().slice(0, 8) + '01';
  const to = cleanText(req.query.to, 30) || new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare(`${CONTENT_SELECT} WHERE ${visibility.sql}
    AND COALESCE(substr(c.publish_at,1,10),c.due_date) BETWEEN ? AND ?
    ORDER BY COALESCE(c.publish_at,c.due_date)`).all(...visibility.params, from, to).map(serializeContent);
  res.json({ items: rows, from, to });
});

function nextAssetCode() {
  const period = new Date().toISOString().slice(0, 7).replace('-', '');
  const key = `ASSET-${period}`;
  const current = db.prepare('SELECT last_value FROM sequences WHERE sequence_key=?').get(key)?.last_value || 0;
  const next = current + 1;
  db.prepare(`INSERT INTO sequences(sequence_key,last_value) VALUES(?,?)
    ON CONFLICT(sequence_key) DO UPDATE SET last_value=excluded.last_value`).run(key, next);
  return `AST-${period}-${String(next).padStart(4, '0')}`;
}

function serializeAsset(row, user) {
  const canDownload = hasPermission(user, 'library.download') && (row.status === 'ACTIVE' || hasPermission(user, 'library.manage'));
  return {
    ...row,
    version_number: Number(row.version_number || 0),
    file_size: Number(row.file_size || 0),
    canDownload,
    fileUrl: canDownload && row.file_path ? `/api/files/library/${path.basename(row.file_path)}` : ''
  };
}

app.get('/api/library', authRequired, permissionRequired('library.view'), (req, res) => {
  db.prepare("UPDATE media_assets SET status='EXPIRED',updated_at=? WHERE status='ACTIVE' AND expires_at IS NOT NULL AND expires_at<date('now')").run(nowIso());
  const conditions = ['1=1'];
  const params = [];
  if (req.query.category) { conditions.push('ma.category=?'); params.push(String(req.query.category)); }
  if (req.query.brandId) { conditions.push('ma.brand_id=?'); params.push(String(req.query.brandId)); }
  if (req.query.status) { conditions.push('ma.status=?'); params.push(String(req.query.status)); }
  if (req.query.q) {
    conditions.push('(ma.title LIKE ? OR ma.code LIKE ? OR ma.description LIKE ?)');
    const query = `%${cleanText(req.query.q, 100)}%`;
    params.push(query, query, query);
  }
  const rows = db.prepare(`SELECT ma.*,b.code AS brand_code,b.name AS brand_name,u.name AS owner_name,
    mav.version_number,mav.file_path,mav.original_name,mav.mime_type,mav.file_size,mav.checksum,mav.notes AS version_notes,mav.created_at AS version_created_at
    FROM media_assets ma
    LEFT JOIN brands b ON b.id=ma.brand_id
    JOIN users u ON u.id=ma.owner_id
    LEFT JOIN media_asset_versions mav ON mav.id=ma.active_version_id
    WHERE ${conditions.join(' AND ')} ORDER BY CASE ma.status WHEN 'ACTIVE' THEN 0 WHEN 'EXPIRED' THEN 1 ELSE 2 END,ma.updated_at DESC`)
    .all(...params).map(row => serializeAsset(row, req.user));
  res.json({ items: rows });
});

app.get('/api/library/:id', authRequired, permissionRequired('library.view'), (req, res, next) => {
  try {
    const row = db.prepare(`SELECT ma.*,b.code AS brand_code,b.name AS brand_name,u.name AS owner_name,
      mav.version_number,mav.file_path,mav.original_name,mav.mime_type,mav.file_size,mav.checksum,mav.notes AS version_notes,mav.created_at AS version_created_at
      FROM media_assets ma LEFT JOIN brands b ON b.id=ma.brand_id JOIN users u ON u.id=ma.owner_id
      LEFT JOIN media_asset_versions mav ON mav.id=ma.active_version_id WHERE ma.id=?`).get(req.params.id);
    if (!row) throw new AppError('Aset tidak ditemukan.', 404);
    const versions = db.prepare(`SELECT mav.*,u.name AS uploaded_by_name FROM media_asset_versions mav
      JOIN users u ON u.id=mav.uploaded_by WHERE mav.asset_id=? ORDER BY mav.version_number DESC`).all(row.id)
      .map(version => ({
        ...version,
        canDownload: row.status === 'ACTIVE' || hasPermission(req.user, 'library.manage'),
        fileUrl: row.status === 'ACTIVE' || hasPermission(req.user, 'library.manage') ? `/api/files/library/${path.basename(version.file_path)}` : ''
      }));
    res.json({ item: serializeAsset(row, req.user), versions });
  } catch (error) { next(error); }
});

app.post('/api/library', authRequired, permissionRequired('library.manage'), libraryUpload.single('file'), (req, res, next) => {
  try {
    if (!req.file) throw new AppError('Berkas aset wajib dipilih.');
    const categories = ['BRAND_CENTER', 'BROCHURE_PRODUCT', 'CONTENT_TEMPLATE', 'PHOTO_VIDEO', 'CAMPAIGN', 'ARCHIVE'];
    const category = String(req.body.category || 'BRAND_CENTER');
    if (!categories.includes(category)) throw new AppError('Kategori aset tidak valid.');
    const assetId = newId('ast');
    const versionId = newId('av');
    const timestamp = nowIso();
    const relativePath = path.join('library', req.file.filename);
    const digest = checksum(fs.readFileSync(req.file.path));
    const payload = {
      code: nextAssetCode(), title: requiredText(req.body.title, 'Nama aset', 200),
      description: cleanText(req.body.description, 2000), category,
      brandId: cleanText(req.body.brandId, 100) || null,
      effectiveFrom: cleanText(req.body.effectiveFrom, 20) || null,
      expiresAt: cleanText(req.body.expiresAt, 20) || null
    };
    db.transaction(() => {
      db.prepare(`INSERT INTO media_assets(id,code,title,description,category,brand_id,status,active_version_id,effective_from,expires_at,owner_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?)`).run(
        assetId, payload.code, payload.title, payload.description, payload.category, payload.brandId,
        versionId, payload.effectiveFrom, payload.expiresAt, req.user.id, timestamp, timestamp
      );
      db.prepare(`INSERT INTO media_asset_versions(id,asset_id,version_number,file_path,original_name,mime_type,file_size,checksum,notes,uploaded_by,created_at)
        VALUES(?,?,1,?,?,?,?,?,?,?,?)`).run(
        versionId, assetId, relativePath, safeFilename(req.file.originalname), req.file.mimetype,
        req.file.size, digest, cleanText(req.body.notes, 1000), req.user.id, timestamp
      );
      recordAudit({ actorId: req.user.id, entityType: 'MEDIA_ASSET', entityId: assetId, action: 'CREATE', after: payload, ip: requestIp(req) });
    })();
    res.status(201).json({ id: assetId, code: payload.code });
  } catch (error) { removeUpload(req.file); next(error); }
});

app.post('/api/library/:id/version', authRequired, permissionRequired('library.manage'), libraryUpload.single('file'), (req, res, next) => {
  try {
    const asset = db.prepare('SELECT * FROM media_assets WHERE id=?').get(req.params.id);
    if (!asset) throw new AppError('Aset tidak ditemukan.', 404);
    if (!req.file) throw new AppError('Berkas versi baru wajib dipilih.');
    const versionNumber = Number(db.prepare('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM media_asset_versions WHERE asset_id=?').get(asset.id).next);
    const versionId = newId('av');
    const timestamp = nowIso();
    const relativePath = path.join('library', req.file.filename);
    const digest = checksum(fs.readFileSync(req.file.path));
    db.transaction(() => {
      db.prepare(`INSERT INTO media_asset_versions(id,asset_id,version_number,file_path,original_name,mime_type,file_size,checksum,notes,uploaded_by,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
        versionId, asset.id, versionNumber, relativePath, safeFilename(req.file.originalname), req.file.mimetype,
        req.file.size, digest, cleanText(req.body.notes, 1000), req.user.id, timestamp
      );
      db.prepare("UPDATE media_assets SET active_version_id=?,status='ACTIVE',updated_at=? WHERE id=?").run(versionId, timestamp, asset.id);
      recordAudit({ actorId: req.user.id, entityType: 'MEDIA_ASSET', entityId: asset.id, action: 'NEW_VERSION', before: { activeVersionId: asset.active_version_id }, after: { activeVersionId: versionId, versionNumber }, ip: requestIp(req) });
    })();
    res.status(201).json({ id: asset.id, versionNumber });
  } catch (error) { removeUpload(req.file); next(error); }
});

app.patch('/api/library/:id', authRequired, permissionRequired('library.manage'), (req, res, next) => {
  try {
    const asset = db.prepare('SELECT * FROM media_assets WHERE id=?').get(req.params.id);
    if (!asset) throw new AppError('Aset tidak ditemukan.', 404);
    const sets = [];
    const values = [];
    const fields = { title: ['title', 200], description: ['description', 2000], category: ['category', 50], brandId: ['brand_id', 100], effectiveFrom: ['effective_from', 20], expiresAt: ['expires_at', 20] };
    for (const [input, [column, max]] of Object.entries(fields)) {
      if (!Object.hasOwn(req.body, input)) continue;
      sets.push(`${column}=?`); values.push(cleanText(req.body[input], max) || null);
    }
    if (Object.hasOwn(req.body, 'status')) {
      const status = String(req.body.status);
      if (!['ACTIVE', 'EXPIRED', 'ARCHIVED'].includes(status)) throw new AppError('Status aset tidak valid.');
      sets.push('status=?'); values.push(status);
    }
    if (!sets.length) throw new AppError('Tidak ada perubahan yang dikirim.');
    sets.push('updated_at=?'); values.push(nowIso(), asset.id);
    db.prepare(`UPDATE media_assets SET ${sets.join(',')} WHERE id=?`).run(...values);
    const updated = db.prepare('SELECT * FROM media_assets WHERE id=?').get(asset.id);
    recordAudit({ actorId: req.user.id, entityType: 'MEDIA_ASSET', entityId: asset.id, action: 'UPDATE', before: asset, after: updated, ip: requestIp(req) });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/contents/:id/assets', authRequired, permissionRequired('content.edit'), (req, res, next) => {
  try {
    const item = getContent(req.params.id, req.user);
    const assetIds = arrayValue(req.body.assetIds);
    db.transaction(() => {
      db.prepare('DELETE FROM content_assets WHERE content_id=?').run(item.id);
      for (const assetId of assetIds) {
        const asset = db.prepare("SELECT id FROM media_assets WHERE id=? AND status='ACTIVE'").get(assetId);
        if (!asset) throw new AppError('Salah satu aset tidak aktif atau tidak ditemukan.');
        db.prepare('INSERT INTO content_assets(content_id,asset_id) VALUES(?,?)').run(item.id, assetId);
      }
      recordAudit({ actorId: req.user.id, entityType: 'CONTENT', entityId: item.id, action: 'LINK_ASSETS', after: { assetIds }, ip: requestIp(req) });
    })();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/contents/:id/promote-to-library', authRequired, permissionRequired('library.manage'), (req, res, next) => {
  try {
    const item = getContent(req.params.id, req.user);
    if (!['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(item.status)) throw new AppError('Hanya draft yang sudah disetujui yang dapat dijadikan aset resmi.', 409);
    const version = db.prepare('SELECT * FROM content_versions WHERE content_id=? AND is_approved=1 ORDER BY version_number DESC LIMIT 1').get(item.id);
    if (!version) throw new AppError('Versi yang disetujui tidak ditemukan.', 409);
    const source = path.join(UPLOAD_DIR, version.file_path);
    if (!fs.existsSync(source)) throw new AppError('Berkas sumber tidak ditemukan.', 404);
    const filename = `${crypto.randomUUID()}${path.extname(version.original_name).toLowerCase()}`;
    const destination = path.join(UPLOAD_DIR, 'library', filename);
    fs.copyFileSync(source, destination);
    const assetId = newId('ast');
    const versionId = newId('av');
    const timestamp = nowIso();
    const category = ['BRAND_CENTER', 'BROCHURE_PRODUCT', 'CONTENT_TEMPLATE', 'PHOTO_VIDEO', 'CAMPAIGN', 'ARCHIVE'].includes(req.body.category) ? req.body.category : 'CAMPAIGN';
    db.transaction(() => {
      db.prepare(`INSERT INTO media_assets(id,code,title,description,category,brand_id,status,active_version_id,owner_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?,?)`).run(
        assetId, nextAssetCode(), cleanText(req.body.title, 200) || item.title,
        `Dipromosikan dari ${item.content_no}. ${cleanText(req.body.description, 1000)}`.trim(), category,
        item.brand_id, versionId, req.user.id, timestamp, timestamp
      );
      db.prepare(`INSERT INTO media_asset_versions(id,asset_id,version_number,file_path,original_name,mime_type,file_size,checksum,notes,uploaded_by,created_at)
        VALUES(?,?,1,?,?,?,?,?,?,?,?)`).run(
        versionId, assetId, path.join('library', filename), version.original_name, version.mime_type,
        version.file_size, checksum(fs.readFileSync(destination)), `Sumber: ${item.content_no} versi ${version.version_number}`,
        req.user.id, timestamp
      );
      recordAudit({ actorId: req.user.id, entityType: 'MEDIA_ASSET', entityId: assetId, action: 'PROMOTE_APPROVED_DRAFT', after: { contentId: item.id, contentVersionId: version.id }, ip: requestIp(req) });
    })();
    res.status(201).json({ id: assetId });
  } catch (error) { next(error); }
});

app.get('/api/files/:kind/:filename', authRequired, (req, res, next) => {
  try {
    const kind = String(req.params.kind);
    if (!['drafts', 'library', 'proofs'].includes(kind)) throw new AppError('Jenis berkas tidak valid.', 404);
    const filename = path.basename(String(req.params.filename));
    if (filename !== req.params.filename) throw new AppError('Nama berkas tidak valid.', 400);
    let row;
    if (kind === 'library') {
      ensurePermission(req.user, 'library.download');
      row = db.prepare(`SELECT mav.file_path,mav.original_name,mav.mime_type,ma.status FROM media_asset_versions mav
        JOIN media_assets ma ON ma.id=mav.asset_id WHERE mav.file_path=?`).get(path.join(kind, filename));
      if (!row) throw new AppError('Berkas tidak ditemukan.', 404);
      if (row.status !== 'ACTIVE' && !hasPermission(req.user, 'library.manage')) throw new AppError('Aset kedaluwarsa atau diarsipkan dan tidak dapat diunduh.', 403);
    } else if (kind === 'drafts') {
      row = db.prepare(`SELECT cv.file_path,cv.original_name,cv.mime_type,c.id AS content_id FROM content_versions cv
        JOIN contents c ON c.id=cv.content_id WHERE cv.file_path=?`).get(path.join(kind, filename));
      if (!row) throw new AppError('Berkas tidak ditemukan.', 404);
      getContent(row.content_id, req.user);
    } else {
      row = db.prepare(`SELECT pp.file_path,pp.original_name,pp.mime_type,c.id AS content_id FROM publication_proofs pp
        JOIN contents c ON c.id=pp.content_id WHERE pp.file_path=?`).get(path.join(kind, filename));
      if (!row) throw new AppError('Berkas tidak ditemukan.', 404);
      getContent(row.content_id, req.user);
    }
    const absolute = path.join(UPLOAD_DIR, row.file_path);
    if (!absolute.startsWith(path.resolve(UPLOAD_DIR)) || !fs.existsSync(absolute)) throw new AppError('Berkas tidak ditemukan.', 404);
    res.type(row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${toBoolean(req.query.download) ? 'attachment' : 'inline'}; filename="${safeFilename(row.original_name)}"`);
    res.sendFile(path.resolve(absolute));
  } catch (error) { next(error); }
});

app.get('/api/meta/assignments', authRequired, (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'content.create') && !hasPermission(req.user, 'content.edit') && req.user.role !== 'SUPER_ADMIN') {
      throw new AppError('Anda tidak dapat melihat daftar penugasan.', 403);
    }
    const users = db.prepare(`SELECT id,name,username,role,active FROM users
      WHERE active=1 AND role IN ('COORDINATOR','REVIEWER','APPROVER','UPLOADER') ORDER BY role,name`).all();
    const vendors = db.prepare("SELECT * FROM vendors WHERE status='ACTIVE' ORDER BY name").all();
    res.json({ users, vendors });
  } catch (error) { next(error); }
});

app.get('/api/vendors', authRequired, (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'vendor.view') && !hasPermission(req.user, 'vendor.manage') && req.user.role !== 'SUPER_ADMIN') throw new AppError('Anda tidak dapat melihat data vendor.', 403);
    const rows = db.prepare(`SELECT v.*,
      COUNT(c.id) AS content_count,
      SUM(CASE WHEN c.status='PUBLISHED' THEN 1 ELSE 0 END) AS published_count,
      SUM(CASE WHEN c.due_date<date('now') AND c.status NOT IN ('PUBLISHED','CANCELLED') THEN 1 ELSE 0 END) AS overdue_count
      FROM vendors v LEFT JOIN contents c ON c.vendor_id=v.id GROUP BY v.id ORDER BY v.status,v.name`).all()
      .map(row => ({ ...row, content_count: Number(row.content_count || 0), published_count: Number(row.published_count || 0), overdue_count: Number(row.overdue_count || 0) }));
    res.json({ items: rows });
  } catch (error) { next(error); }
});

app.post('/api/vendors', authRequired, permissionRequired('vendor.manage'), (req, res, next) => {
  try {
    const id = newId('vnd');
    const timestamp = nowIso();
    const payload = {
      name: requiredText(req.body.name, 'Nama vendor', 200),
      contactName: cleanText(req.body.contactName, 150), email: cleanText(req.body.email, 200),
      phone: cleanText(req.body.phone, 50), slaDays: Math.max(1, Math.min(60, toInteger(req.body.slaDays, 3))),
      notes: cleanText(req.body.notes, 2000)
    };
    db.prepare(`INSERT INTO vendors(id,name,contact_name,email,phone,status,sla_days,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?)`).run(id, payload.name, payload.contactName, payload.email, payload.phone, payload.slaDays, payload.notes, timestamp, timestamp);
    recordAudit({ actorId: req.user.id, entityType: 'VENDOR', entityId: id, action: 'CREATE', after: payload, ip: requestIp(req) });
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

app.patch('/api/vendors/:id', authRequired, permissionRequired('vendor.manage'), (req, res, next) => {
  try {
    const vendor = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id);
    if (!vendor) throw new AppError('Vendor tidak ditemukan.', 404);
    const sets = [];
    const values = [];
    const fields = { name: ['name', 200], contactName: ['contact_name', 150], email: ['email', 200], phone: ['phone', 50], notes: ['notes', 2000] };
    for (const [input, [column, max]] of Object.entries(fields)) {
      if (!Object.hasOwn(req.body, input)) continue;
      sets.push(`${column}=?`); values.push(cleanText(req.body[input], max) || null);
    }
    if (Object.hasOwn(req.body, 'slaDays')) { sets.push('sla_days=?'); values.push(Math.max(1, Math.min(60, toInteger(req.body.slaDays, 3)))); }
    if (Object.hasOwn(req.body, 'status')) {
      const status = String(req.body.status);
      if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new AppError('Status vendor tidak valid.');
      sets.push('status=?'); values.push(status);
    }
    if (!sets.length) throw new AppError('Tidak ada perubahan yang dikirim.');
    sets.push('updated_at=?'); values.push(nowIso(), vendor.id);
    db.prepare(`UPDATE vendors SET ${sets.join(',')} WHERE id=?`).run(...values);
    recordAudit({ actorId: req.user.id, entityType: 'VENDOR', entityId: vendor.id, action: 'UPDATE', before: vendor, after: req.body, ip: requestIp(req) });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/users', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Menu pengguna hanya untuk Super Admin.', 403);
    const rows = db.prepare(`SELECT u.id,u.name,u.username,u.role,u.vendor_id,u.active,u.must_change_password,u.last_login,u.created_at,u.updated_at,v.name AS vendor_name
      FROM users u LEFT JOIN vendors v ON v.id=u.vendor_id ORDER BY u.active DESC,u.name`).all();
    res.json({ items: rows.map(row => ({ ...row, active: Boolean(row.active), must_change_password: Boolean(row.must_change_password) })) });
  } catch (error) { next(error); }
});

app.post('/api/users', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Menu pengguna hanya untuk Super Admin.', 403);
    const role = String(req.body.role || '');
    if (!Object.hasOwn(ROLE_LABELS, role)) throw new AppError('Role tidak valid.');
    const username = cleanUsername(req.body.username);
    if (username.length < 3) throw new AppError('Username minimal 3 karakter.');
    const password = String(req.body.password || '');
    assertPassword(password);
    const credentials = hashPassword(password);
    const id = newId('usr');
    const timestamp = nowIso();
    const vendorId = role === 'VENDOR' ? requiredText(req.body.vendorId, 'Vendor', 100) : null;
    db.prepare(`INSERT INTO users(id,name,username,password_hash,password_salt,role,vendor_id,active,must_change_password,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,1,1,?,?)`).run(
      id, requiredText(req.body.name, 'Nama pengguna', 200), username, credentials.hash, credentials.salt,
      role, vendorId, timestamp, timestamp
    );
    recordAudit({ actorId: req.user.id, entityType: 'USER', entityId: id, action: 'CREATE', after: { name: req.body.name, username, role, vendorId }, ip: requestIp(req) });
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

app.patch('/api/users/:id', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Menu pengguna hanya untuk Super Admin.', 403);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) throw new AppError('Pengguna tidak ditemukan.', 404);
    const sets = [];
    const values = [];
    if (Object.hasOwn(req.body, 'name')) { sets.push('name=?'); values.push(requiredText(req.body.name, 'Nama', 200)); }
    if (Object.hasOwn(req.body, 'role')) {
      const role = String(req.body.role);
      if (!Object.hasOwn(ROLE_LABELS, role)) throw new AppError('Role tidak valid.');
      if (user.id === req.user.id && role !== 'SUPER_ADMIN') throw new AppError('Anda tidak dapat menurunkan role akun sendiri.');
      sets.push('role=?'); values.push(role);
    }
    if (Object.hasOwn(req.body, 'vendorId')) { sets.push('vendor_id=?'); values.push(cleanText(req.body.vendorId, 100) || null); }
    if (Object.hasOwn(req.body, 'active')) {
      const active = toBoolean(req.body.active) ? 1 : 0;
      if (user.id === req.user.id && !active) throw new AppError('Anda tidak dapat menonaktifkan akun sendiri.');
      if (!active && user.role === 'SUPER_ADMIN') {
        const adminCount = Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='SUPER_ADMIN' AND active=1").get().count);
        if (adminCount <= 1) throw new AppError('Super Admin aktif terakhir tidak dapat dinonaktifkan.');
      }
      sets.push('active=?'); values.push(active);
    }
    if (Object.hasOwn(req.body, 'password') && String(req.body.password || '')) {
      assertPassword(req.body.password);
      const credentials = hashPassword(String(req.body.password));
      sets.push('password_hash=?', 'password_salt=?', 'must_change_password=1');
      values.push(credentials.hash, credentials.salt);
    }
    if (!sets.length) throw new AppError('Tidak ada perubahan yang dikirim.');
    sets.push('updated_at=?'); values.push(nowIso(), user.id);
    db.transaction(() => {
      db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...values);
      db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(user.id, user.id === req.user.id ? req.sessionId : '');
      recordAudit({ actorId: req.user.id, entityType: 'USER', entityId: user.id, action: 'UPDATE', before: publicUser(user), after: req.body, ip: requestIp(req) });
    })();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/reports/summary', authRequired, permissionRequired('reports.view'), (req, res) => {
  const from = cleanText(req.query.from, 20) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = cleanText(req.query.to, 20) || new Date().toISOString().slice(0, 10);
  const byStatus = db.prepare(`SELECT status,COUNT(*) AS count FROM contents
    WHERE date(created_at) BETWEEN ? AND ? GROUP BY status ORDER BY count DESC`).all(from, to)
    .map(row => ({ status: row.status, label: STATUS_LABELS[row.status] || row.status, count: Number(row.count) }));
  const byBrand = db.prepare(`SELECT b.code,b.name,b.color,COUNT(c.id) AS count,
    SUM(CASE WHEN c.status='PUBLISHED' THEN 1 ELSE 0 END) AS published
    FROM brands b LEFT JOIN contents c ON c.brand_id=b.id AND date(c.created_at) BETWEEN ? AND ?
    GROUP BY b.id ORDER BY count DESC`).all(from, to)
    .map(row => ({ ...row, count: Number(row.count || 0), published: Number(row.published || 0) }));
  const vendors = db.prepare(`SELECT v.id,v.name,COUNT(c.id) AS assigned,
    SUM(CASE WHEN c.status='PUBLISHED' THEN 1 ELSE 0 END) AS published,
    SUM(CASE WHEN c.status='PUBLISHED' AND (c.due_date IS NULL OR date(c.locked_at)<=c.due_date) THEN 1 ELSE 0 END) AS on_time,
    SUM(CASE WHEN c.status='REVISION_REQUIRED' THEN 1 ELSE 0 END) AS revisions,
    ROUND(AVG(CASE WHEN c.status='PUBLISHED' THEN julianday(c.locked_at)-julianday(c.created_at) END),1) AS avg_cycle_days
    FROM vendors v LEFT JOIN contents c ON c.vendor_id=v.id AND date(c.created_at) BETWEEN ? AND ?
    GROUP BY v.id ORDER BY published DESC,assigned DESC`).all(from, to).map(row => ({
      ...row, assigned: Number(row.assigned || 0), published: Number(row.published || 0),
      on_time: Number(row.on_time || 0), revisions: Number(row.revisions || 0), avg_cycle_days: Number(row.avg_cycle_days || 0),
      on_time_percent: Number(row.published || 0) ? Math.round(Number(row.on_time || 0) * 100 / Number(row.published)) : 0
    }));
  const performance = db.prepare(`SELECT
    COALESCE(SUM(CAST(json_extract(metrics_json,'$.reach') AS INTEGER)),0) AS reach,
    COALESCE(SUM(CAST(json_extract(metrics_json,'$.impressions') AS INTEGER)),0) AS impressions,
    COALESCE(SUM(CAST(json_extract(metrics_json,'$.engagement') AS INTEGER)),0) AS engagement,
    COALESCE(SUM(CAST(json_extract(metrics_json,'$.leads') AS INTEGER)),0) AS leads
    FROM publication_proofs WHERE date(published_at) BETWEEN ? AND ?`).get(from, to);
  const budget = db.prepare(`SELECT COALESCE(SUM(budget),0) AS total FROM contents WHERE date(created_at) BETWEEN ? AND ?`).get(from, to).total;
  const metrics = Object.fromEntries(Object.entries(performance).map(([key, value]) => [key, Number(value || 0)]));
  metrics.budget = Number(budget || 0);
  metrics.costPerLead = metrics.leads ? Math.round(metrics.budget / metrics.leads) : 0;
  res.json({ from, to, byStatus, byBrand, vendors, metrics });
});

app.get('/api/notifications', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({ items: rows, unread: rows.filter(row => !row.read_at).length });
});

app.post('/api/notifications/read', authRequired, (req, res) => {
  const ids = arrayValue(req.body.ids);
  if (ids.length) {
    const statement = db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?');
    db.transaction(() => { for (const id of ids) statement.run(nowIso(), id, req.user.id); })();
  } else {
    db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(nowIso(), req.user.id);
  }
  res.json({ ok: true });
});

app.get('/api/audit', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Audit log hanya untuk Super Admin.', 403);
    const params = [];
    const conditions = ['1=1'];
    if (req.query.entityType) { conditions.push('a.entity_type=?'); params.push(String(req.query.entityType)); }
    if (req.query.q) {
      conditions.push('(a.action LIKE ? OR a.entity_id LIKE ? OR a.reason LIKE ? OR u.name LIKE ?)');
      const query = `%${cleanText(req.query.q, 100)}%`; params.push(query, query, query, query);
    }
    const rows = db.prepare(`SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
      WHERE ${conditions.join(' AND ')} ORDER BY a.created_at DESC LIMIT 500`).all(...params)
      .map(row => ({ ...row, before: jsonObject(row.before_json, null), after: jsonObject(row.after_json, null) }));
    res.json({ items: rows });
  } catch (error) { next(error); }
});

app.get('/api/settings', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Pengaturan hanya untuk Super Admin.', 403);
    res.json({ settings: settingsPayload() });
  } catch (error) { next(error); }
});

app.patch('/api/settings', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Pengaturan hanya untuk Super Admin.', 403);
    const before = settingsPayload();
    const changes = {
      APP_NAME: req.body.appName,
      COMPANY_NAME: req.body.companyName,
      TIMEZONE: req.body.timezone,
      THEME_PRIMARY: req.body.primaryColor,
      THEME_SECONDARY: req.body.secondaryColor
    };
    if (changes.THEME_PRIMARY && !/^#[0-9a-f]{6}$/i.test(changes.THEME_PRIMARY)) throw new AppError('Warna utama tidak valid.');
    if (changes.THEME_SECONDARY && !/^#[0-9a-f]{6}$/i.test(changes.THEME_SECONDARY)) throw new AppError('Warna sekunder tidak valid.');
    for (const [key, value] of Object.entries(changes)) if (value != null && String(value).trim()) setSetting(key, cleanText(value, 200), req.user.id);
    recordAudit({ actorId: req.user.id, entityType: 'SETTINGS', action: 'UPDATE', before, after: settingsPayload(), ip: requestIp(req) });
    res.json({ settings: settingsPayload() });
  } catch (error) { next(error); }
});

app.post('/api/settings/logo', authRequired, logoUpload.single('file'), (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Pengaturan hanya untuk Super Admin.', 403);
    if (!req.file) throw new AppError('File logo wajib dipilih.');
    const previous = getSetting('LOGO_PATH');
    setSetting('LOGO_PATH', path.join('branding', req.file.filename), req.user.id);
    if (previous) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, previous)); } catch {}
    }
    recordAudit({ actorId: req.user.id, entityType: 'SETTINGS', action: 'LOGO_UPDATE', after: { originalName: req.file.originalname }, ip: requestIp(req) });
    res.json({ logoUrl: '/api/branding/logo' });
  } catch (error) { removeUpload(req.file); next(error); }
});

app.get('/api/branding/logo', (req, res, next) => {
  try {
    const logoPath = getSetting('LOGO_PATH');
    if (!logoPath) throw new AppError('Logo belum diatur.', 404);
    const absolute = path.resolve(UPLOAD_DIR, logoPath);
    if (!absolute.startsWith(path.resolve(UPLOAD_DIR)) || !fs.existsSync(absolute)) throw new AppError('Logo tidak ditemukan.', 404);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(absolute);
  } catch (error) { next(error); }
});

app.get('/api/backups', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Backup hanya untuk Super Admin.', 403);
    res.json({ items: listDatabaseBackups() });
  } catch (error) { next(error); }
});

app.post('/api/backups', authRequired, asyncRoute(async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Backup hanya untuk Super Admin.', 403);
  const destination = await createDatabaseBackup('manual');
  recordAudit({ actorId: req.user.id, entityType: 'BACKUP', action: 'CREATE', after: { name: path.basename(destination) }, ip: requestIp(req) });
  res.status(201).json({ name: path.basename(destination) });
}));

app.get('/api/backups/:name', authRequired, (req, res, next) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') throw new AppError('Backup hanya untuk Super Admin.', 403);
    const name = path.basename(String(req.params.name));
    if (!/^media-hub-.*\.sqlite$/.test(name)) throw new AppError('Nama backup tidak valid.');
    const file = path.resolve(BACKUP_DIR, name);
    if (!file.startsWith(path.resolve(BACKUP_DIR)) || !fs.existsSync(file)) throw new AppError('Backup tidak ditemukan.', 404);
    recordAudit({ actorId: req.user.id, entityType: 'BACKUP', action: 'DOWNLOAD', after: { name }, ip: requestIp(req) });
    res.download(file, name);
  } catch (error) { next(error); }
});

const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir, {
  etag: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=3600, must-revalidate');
  }
}));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(publicDir, 'index.html'));
  next(new AppError('Endpoint tidak ditemukan.', 404));
});

app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Ukuran berkas maksimal ${MAX_UPLOAD_MB} MB.` });
  }
  const status = Number(error.status || error.statusCode || 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Terjadi kesalahan pada server.' : error.message });
});

let server;
if (require.main === module) {
  cleanupExpiredSessions();
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`AXINDO Media Hub ${APP_VERSION} aktif pada port ${PORT}`);
  });
}

module.exports = { app, APP_VERSION, PORT, server };
