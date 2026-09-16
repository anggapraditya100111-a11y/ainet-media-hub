const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const { db, UPLOAD_DIR, nowIso, getSetting, recordAudit, notifyUser } = require('./db');
const { newId, randomToken, hashToken, cleanText, safeFilename } = require('./security');

const PHASES = new Set(['BRIEF', 'PRE_PRODUCTION', 'PRODUCTION_RESULT']);
const PREVIEWABLE = /^(image|video|audio)\//;
const INLINE_TYPES = new Set(['application/pdf']);
const ALLOWED_UPLOAD = /^(image\/(?!svg\+xml)[a-z0-9.+-]+|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/(pdf|zip|x-zip-compressed|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/(plain|csv))$/i;

function json(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function absoluteUpload(relativePath) {
  const root = path.resolve(UPLOAD_DIR);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) return null;
  return absolute;
}

function checksumFile(filename) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filename, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes;
    while ((bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally { fs.closeSync(descriptor); }
  return hash.digest('hex');
}

function sendStoredFile(req, res, row, forceDownload = false) {
  const absolute = absoluteUpload(row.file_path || row.proof_path);
  if (!absolute || !fs.existsSync(absolute)) throw Object.assign(new Error('Berkas tidak ditemukan.'), { status: 404 });
  const stat = fs.statSync(absolute);
  const mime = row.mime_type || row.proof_mime || 'application/octet-stream';
  const name = safeFilename(row.original_name || row.proof_name || 'file');
  const inline = !forceDownload && (PREVIEWABLE.test(mime) || INLINE_TYPES.has(mime));
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', stat.size);
    return fs.createReadStream(absolute).pipe(res);
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return res.status(416).end();
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
  if (start > end || start >= stat.size) return res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  res.setHeader('Content-Length', end - start + 1);
  return fs.createReadStream(absolute, { start, end }).pipe(res);
}

function installWorkflowV4(app, options) {
  const { authRequired, getContent, ensurePermission, AppError, requestIp, maxUploadMb } = options;
  const configuredMaxUploadMb = () => Math.max(10, Math.min(2048, Number(getSetting('MAX_COLLAB_UPLOAD_MB', maxUploadMb)) || maxUploadMb));
  const chunkBytes = 4 * 1024 * 1024;
  for (const expired of db.prepare("SELECT id,temp_path FROM chunk_upload_sessions WHERE status='ACTIVE' AND expires_at<=?").all(nowIso())) {
    try { fs.unlinkSync(absoluteUpload(expired.temp_path)); } catch {}
    db.prepare("UPDATE chunk_upload_sessions SET status='CANCELLED' WHERE id=?").run(expired.id);
  }

  function isCoordinator(user) {
    return user.role === 'SUPER_ADMIN' || user.role === 'COORDINATOR';
  }

  function mayDiscuss(user, item) {
    return isCoordinator(user) || (user.role === 'VENDOR' && item.vendor_id === user.vendorId);
  }

  function assertDiscuss(user, item) {
    if (!mayDiscuss(user, item)) throw new AppError('Diskusi hanya untuk Koordinator dan vendor yang ditugaskan.', 403);
  }

  function fileRows(contentId) {
    return db.prepare(`SELECT cf.*,u.name AS uploaded_by_name FROM collaboration_files cf
      JOIN users u ON u.id=cf.uploaded_by WHERE cf.content_id=? ORDER BY cf.created_at DESC`).all(contentId)
      .map(row => ({ ...row, fileUrl: `/api/collaboration/files/${row.id}`, previewable: PREVIEWABLE.test(row.mime_type) || INLINE_TYPES.has(row.mime_type) }));
  }

  function invalidateApproval(contentId, actorId, reason) {
    const active = db.prepare("SELECT id FROM director_approval_requests WHERE content_id=? AND status='ACTIVE'").all(contentId);
    if (!active.length) return;
    db.prepare("UPDATE director_approval_requests SET status='CANCELLED',cancelled_at=?,note=COALESCE(note,?) WHERE content_id=? AND status='ACTIVE'")
      .run(nowIso(), reason, contentId);
    db.prepare("UPDATE contents SET status='DRAFT_SUBMITTED',locked_at=NULL,updated_at=? WHERE id=? AND status='APPROVAL_PENDING'").run(nowIso(), contentId);
    for (const item of active) db.prepare('DELETE FROM approval_access_sessions WHERE request_id=?').run(item.id);
    db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
      VALUES(?,?,'APPROVAL_PENDING','DRAFT_SUBMITTED','APPROVAL_AUTO_CANCEL',?,?,?)`).run(newId('evt'), contentId, reason, actorId, nowIso());
    recordAudit({ actorId, entityType: 'DIRECTOR_APPROVAL', entityId: contentId, action: 'AUTO_CANCEL', reason });
  }

  app.get('/api/contents/:id/collaboration', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      assertDiscuss(req.user, item);
      const messages = db.prepare(`SELECT cm.*,u.name AS sender_name,u.role AS sender_role FROM collaboration_messages cm
        JOIN users u ON u.id=cm.sender_id WHERE cm.content_id=? ORDER BY cm.created_at`).all(item.id);
      res.json({ messages, files: fileRows(item.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/contents/:id/messages', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      assertDiscuss(req.user, item);
      const phase = String(req.body.phase || 'PRE_PRODUCTION');
      if (!PHASES.has(phase)) throw new AppError('Tahap diskusi tidak valid.');
      const message = cleanText(req.body.message, 5000);
      if (!message) throw new AppError('Pesan diskusi wajib diisi.');
      const id = newId('msg');
      db.prepare('INSERT INTO collaboration_messages(id,content_id,phase,message,sender_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, item.id, phase, message, req.user.id, nowIso());
      recordAudit({ actorId: req.user.id, entityType: 'COLLABORATION', entityId: id, action: 'MESSAGE', after: { contentId: item.id, phase }, ip: requestIp(req) });
      if (req.user.role === 'VENDOR') notifyUser(item.coordinator_id, 'VENDOR_MESSAGE', `Pesan vendor ${item.content_no}`, message.slice(0, 180), `/contents/${item.id}`);
      else if (item.vendor_id) {
        for (const user of db.prepare("SELECT id FROM users WHERE vendor_id=? AND role='VENDOR' AND active=1").all(item.vendor_id)) notifyUser(user.id, 'COORDINATOR_MESSAGE', `Pesan koordinator ${item.content_no}`, message.slice(0, 180), `/contents/${item.id}`);
      }
      res.status(201).json({ id });
    } catch (error) { next(error); }
  });

  app.post('/api/contents/:id/uploads/init', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      assertDiscuss(req.user, item);
      const phase = String(req.body.phase || 'PRE_PRODUCTION');
      if (!PHASES.has(phase)) throw new AppError('Tahap berkas tidak valid.');
      if (req.user.role === 'VENDOR' && phase === 'BRIEF') throw new AppError('Lampiran brief hanya dapat ditambah Koordinator.', 403);
      if (req.user.role === 'VENDOR' && phase === 'PRE_PRODUCTION' && item.status !== 'ASSIGNED') throw new AppError('Draft pra-produksi diunggah saat tahap Pra-Produksi.', 409);
      if (req.user.role === 'VENDOR' && phase === 'PRODUCTION_RESULT' && item.status !== 'IN_PRODUCTION') throw new AppError('Hasil produksi diunggah saat tahap Produksi.', 409);
      const totalSize = Number(req.body.totalSize || 0);
      const activeMaxUploadMb = configuredMaxUploadMb();
      const maxBytes = activeMaxUploadMb * 1024 * 1024;
      if (!Number.isSafeInteger(totalSize) || totalSize < 1 || totalSize > maxBytes) throw new AppError(`Ukuran berkas maksimal ${activeMaxUploadMb} MB.`, 413);
      const originalName = safeFilename(req.body.filename);
      const mimeType = cleanText(req.body.mimeType || 'application/octet-stream', 200);
      if (!ALLOWED_UPLOAD.test(mimeType)) throw new AppError('Jenis berkas tidak didukung. Gunakan gambar, video, audio, PDF, Office, ZIP, atau teks.');
      const id = newId('upl');
      const tempPath = path.join('chunks', `${id}.part`);
      fs.writeFileSync(absoluteUpload(tempPath), Buffer.alloc(0), { flag: 'wx' });
      const timestamp = nowIso();
      db.prepare(`INSERT INTO chunk_upload_sessions(id,content_id,phase,original_name,mime_type,total_size,chunk_size,temp_path,message,created_by,expires_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, item.id, phase, originalName, mimeType, totalSize, chunkBytes, tempPath,
        cleanText(req.body.message, 2000), req.user.id, new Date(Date.now() + 24 * 3600000).toISOString(), timestamp);
      res.status(201).json({ id, chunkSize: chunkBytes, nextChunk: 0, receivedSize: 0 });
    } catch (error) { next(error); }
  });

  app.get('/api/uploads/:id', authRequired, (req, res, next) => {
    try {
      const upload = db.prepare('SELECT * FROM chunk_upload_sessions WHERE id=?').get(req.params.id);
      if (!upload || upload.created_by !== req.user.id || upload.status !== 'ACTIVE') throw new AppError('Sesi upload tidak ditemukan.', 404);
      res.json({ id: upload.id, chunkSize: upload.chunk_size, nextChunk: upload.next_chunk, receivedSize: upload.received_size, totalSize: upload.total_size });
    } catch (error) { next(error); }
  });

  app.put('/api/uploads/:id/chunks/:index', authRequired, express.raw({ type: 'application/octet-stream', limit: '5mb' }), (req, res, next) => {
    try {
      const upload = db.prepare('SELECT * FROM chunk_upload_sessions WHERE id=?').get(req.params.id);
      if (!upload || upload.created_by !== req.user.id || upload.status !== 'ACTIVE') throw new AppError('Sesi upload tidak ditemukan.', 404);
      if (upload.expires_at <= nowIso()) throw new AppError('Sesi upload sudah kedaluwarsa.', 410);
      const index = Number(req.params.index);
      if (index !== upload.next_chunk) throw new AppError(`Lanjutkan dari potongan ${upload.next_chunk}.`, 409);
      if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > upload.chunk_size) throw new AppError('Potongan berkas tidak valid.');
      if (upload.received_size + req.body.length > upload.total_size) throw new AppError('Ukuran upload melebihi deklarasi.', 409);
      fs.appendFileSync(absoluteUpload(upload.temp_path), req.body);
      db.prepare('UPDATE chunk_upload_sessions SET received_size=received_size+?,next_chunk=next_chunk+1 WHERE id=?').run(req.body.length, upload.id);
      res.json({ nextChunk: index + 1, receivedSize: upload.received_size + req.body.length });
    } catch (error) { next(error); }
  });

  app.post('/api/uploads/:id/complete', authRequired, (req, res, next) => {
    try {
      const upload = db.prepare('SELECT * FROM chunk_upload_sessions WHERE id=?').get(req.params.id);
      if (!upload || upload.created_by !== req.user.id || upload.status !== 'ACTIVE') throw new AppError('Sesi upload tidak ditemukan.', 404);
      if (upload.received_size !== upload.total_size) throw new AppError('Upload belum lengkap.', 409);
      const source = absoluteUpload(upload.temp_path);
      const extension = path.extname(upload.original_name).replace(/[^.a-z0-9]/gi, '').slice(0, 12);
      const relativePath = path.join('collaboration', `${crypto.randomUUID()}${extension}`);
      const destination = absoluteUpload(relativePath);
      const fileChecksum = checksumFile(source);
      const fileId = newId('cfl');
      const messageId = upload.message ? newId('msg') : null;
      const version = Number(db.prepare('SELECT COALESCE(MAX(version_number),0)+1 AS n FROM collaboration_files WHERE content_id=? AND phase=?').get(upload.content_id, upload.phase).n);
      const timestamp = nowIso();
      fs.renameSync(source, destination);
      try {
        db.transaction(() => {
          if (messageId) db.prepare('INSERT INTO collaboration_messages(id,content_id,phase,message,sender_id,created_at) VALUES(?,?,?,?,?,?)')
            .run(messageId, upload.content_id, upload.phase, upload.message, req.user.id, timestamp);
          db.prepare(`INSERT INTO collaboration_files(id,content_id,message_id,phase,version_number,file_path,original_name,mime_type,file_size,checksum,uploaded_by,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(fileId, upload.content_id, messageId, upload.phase, version, relativePath, upload.original_name,
            upload.mime_type, upload.total_size, fileChecksum, req.user.id, timestamp);
          db.prepare("UPDATE chunk_upload_sessions SET status='COMPLETED' WHERE id=?").run(upload.id);
          invalidateApproval(upload.content_id, req.user.id, 'Berkas berubah setelah link approval dibuat.');
          recordAudit({ actorId: req.user.id, entityType: 'COLLABORATION_FILE', entityId: fileId, action: 'UPLOAD', after: { contentId: upload.content_id, phase: upload.phase, version }, ip: requestIp(req) });
        })();
      } catch (error) {
        try { fs.renameSync(destination, source); } catch {}
        throw error;
      }
      res.status(201).json({ id: fileId, version });
    } catch (error) { next(error); }
  });

  app.delete('/api/uploads/:id', authRequired, (req, res, next) => {
    try {
      const upload = db.prepare('SELECT * FROM chunk_upload_sessions WHERE id=?').get(req.params.id);
      if (!upload || upload.created_by !== req.user.id) throw new AppError('Sesi upload tidak ditemukan.', 404);
      try { fs.unlinkSync(absoluteUpload(upload.temp_path)); } catch {}
      db.prepare("UPDATE chunk_upload_sessions SET status='CANCELLED' WHERE id=?").run(upload.id);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.get('/api/collaboration/files/:id', authRequired, (req, res, next) => {
    try {
      const row = db.prepare('SELECT * FROM collaboration_files WHERE id=?').get(req.params.id);
      if (!row) throw new AppError('Berkas tidak ditemukan.', 404);
      getContent(row.content_id, req.user);
      return sendStoredFile(req, res, row, req.query.download === '1');
    } catch (error) { next(error); }
  });

  app.post('/api/contents/:id/submit-result', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      if (req.user.role !== 'VENDOR' || item.vendor_id !== req.user.vendorId) throw new AppError('Hanya vendor yang ditugaskan dapat mengirim hasil.', 403);
      if (item.status !== 'IN_PRODUCTION') throw new AppError('Hasil hanya dapat dikirim saat tahap Produksi.', 409);
      const productionStartedAt = db.prepare("SELECT created_at FROM workflow_events WHERE content_id=? AND to_status='IN_PRODUCTION' ORDER BY created_at DESC LIMIT 1").get(item.id)?.created_at || '';
      if (!db.prepare("SELECT id FROM collaboration_files WHERE content_id=? AND phase='PRODUCTION_RESULT' AND created_at>=? LIMIT 1").get(item.id, productionStartedAt)) throw new AppError('Upload minimal satu hasil produksi baru untuk siklus ini.', 409);
      const note = cleanText(req.body.note, 2000);
      const timestamp = nowIso();
      db.transaction(() => {
        db.prepare("UPDATE contents SET status='DRAFT_SUBMITTED',updated_at=? WHERE id=?").run(timestamp, item.id);
        db.prepare("INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at) VALUES(?,?,?,'DRAFT_SUBMITTED','SUBMIT_RESULT',?,?,?)")
          .run(newId('evt'), item.id, item.status, note, req.user.id, timestamp);
        recordAudit({ actorId: req.user.id, entityType: 'CONTENT', entityId: item.id, action: 'SUBMIT_RESULT', reason: note, ip: requestIp(req) });
      })();
      notifyUser(item.coordinator_id, 'RESULT_SUBMITTED', `Hasil ${item.content_no} siap direview`, item.title, `/contents/${item.id}`);
      res.json({ item: getContent(item.id, req.user) });
    } catch (error) { next(error); }
  });

  app.get('/api/contents/:id/share-links', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      if (!isCoordinator(req.user)) throw new AppError('Hanya Koordinator yang dapat mengelola link ringkasan.', 403);
      const rows = db.prepare('SELECT id,expires_at,revoked_at,last_viewed_at,view_count,created_at FROM material_share_links WHERE content_id=? ORDER BY created_at DESC').all(item.id);
      res.json({ items: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/contents/:id/share-links', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      if (!isCoordinator(req.user)) throw new AppError('Hanya Koordinator yang dapat membagikan ringkasan.', 403);
      const requested = Array.isArray(req.body.fileIds) ? req.body.fileIds.map(String) : [];
      const allowed = new Set(db.prepare('SELECT id FROM collaboration_files WHERE content_id=?').all(item.id).map(row => row.id));
      const fileIds = requested.filter(id => allowed.has(id));
      const snapshot = {
        contentNo: item.content_no, title: item.title, description: item.description, objective: item.objective,
        audience: item.audience, brand: item.brand_name, campaign: item.campaign, contentType: item.content_type,
        brief: item.brief, caption: item.caption, hashtags: item.hashtags, callToAction: item.call_to_action,
        createdAt: nowIso()
      };
      const token = randomToken(32);
      const id = newId('shr');
      const expiresAt = new Date(Date.now() + 12 * 3600000).toISOString();
      db.prepare(`INSERT INTO material_share_links(id,content_id,token_hash,snapshot_json,attachment_ids_json,expires_at,created_by,created_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(id, item.id, hashToken('MATERIAL_SHARE', token), JSON.stringify(snapshot), JSON.stringify(fileIds), expiresAt, req.user.id, nowIso());
      recordAudit({ actorId: req.user.id, entityType: 'MATERIAL_SHARE', entityId: id, action: 'CREATE', after: { contentId: item.id, expiresAt, fileIds }, ip: requestIp(req) });
      res.status(201).json({ id, url: `/share.html?token=${token}`, expiresAt });
    } catch (error) { next(error); }
  });

  app.post('/api/contents/:id/share-links/:linkId/revoke', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      if (!isCoordinator(req.user)) throw new AppError('Hanya Koordinator yang dapat membatalkan link.', 403);
      const result = db.prepare('UPDATE material_share_links SET revoked_at=? WHERE id=? AND content_id=? AND revoked_at IS NULL').run(nowIso(), req.params.linkId, item.id);
      if (!result.changes) throw new AppError('Link tidak ditemukan atau sudah dibatalkan.', 404);
      recordAudit({ actorId: req.user.id, entityType: 'MATERIAL_SHARE', entityId: req.params.linkId, action: 'REVOKE', ip: requestIp(req) });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  function publicShare(token) {
    return db.prepare('SELECT * FROM material_share_links WHERE token_hash=?').get(hashToken('MATERIAL_SHARE', token));
  }

  app.get('/api/public/shares/:token', (req, res, next) => {
    try {
      const row = publicShare(req.params.token);
      if (!row || row.revoked_at || row.expires_at <= nowIso()) throw new AppError('Link ringkasan tidak berlaku.', 410);
      const ids = json(row.attachment_ids_json);
      const files = ids.length ? db.prepare(`SELECT id,original_name,mime_type,file_size,phase FROM collaboration_files WHERE content_id=? AND id IN (${ids.map(() => '?').join(',')})`).all(row.content_id, ...ids) : [];
      db.prepare('UPDATE material_share_links SET view_count=view_count+1,last_viewed_at=? WHERE id=?').run(nowIso(), row.id);
      res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow');
      res.json({ snapshot: json(row.snapshot_json, {}), expiresAt: row.expires_at, files: files.map(file => ({ ...file, fileUrl: `/api/public/shares/${req.params.token}/files/${file.id}` })) });
    } catch (error) { next(error); }
  });

  app.get('/api/public/shares/:token/files/:fileId', (req, res, next) => {
    try {
      const share = publicShare(req.params.token);
      if (!share || share.revoked_at || share.expires_at <= nowIso()) throw new AppError('Link ringkasan tidak berlaku.', 410);
      if (!json(share.attachment_ids_json).includes(req.params.fileId)) throw new AppError('Berkas tidak dibagikan.', 404);
      const file = db.prepare('SELECT * FROM collaboration_files WHERE id=? AND content_id=?').get(req.params.fileId, share.content_id);
      if (!file) throw new AppError('Berkas tidak ditemukan.', 404);
      res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow');
      return sendStoredFile(req, res, file, req.query.download === '1');
    } catch (error) { next(error); }
  });

  app.get('/api/contents/:id/director-approvals', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      if (!isCoordinator(req.user)) throw new AppError('Hanya Koordinator yang dapat melihat approval.', 403);
      const rows = db.prepare(`SELECT dar.id,dar.status,dar.note,dar.attempt_count,dar.locked_at,dar.opened_at,dar.decided_at,dar.cancelled_at,dar.created_at,u.name AS director_name
        FROM director_approval_requests dar JOIN users u ON u.id=dar.director_id WHERE dar.content_id=? ORDER BY dar.created_at DESC`).all(item.id);
      res.json({ items: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/contents/:id/director-approvals', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      ensurePermission(req.user, 'content.request_director_approval');
      if (!['DRAFT_SUBMITTED', 'IN_REVIEW'].includes(item.status)) throw new AppError('Konten harus berada di Review Koordinator.', 409);
      const director = db.prepare("SELECT id,name FROM users WHERE id=? AND role='MANAGEMENT' AND active=1").get(String(req.body.directorId || ''));
      if (!director) throw new AppError('Pilih satu Direksi aktif.');
      const requested = Array.isArray(req.body.fileIds) ? req.body.fileIds.map(String) : [];
      const available = new Set(db.prepare("SELECT id FROM collaboration_files WHERE content_id=? AND phase='PRODUCTION_RESULT'").all(item.id).map(row => row.id));
      const fileIds = requested.filter(id => available.has(id));
      if (!fileIds.length) throw new AppError('Pilih minimal satu hasil final untuk approval.');
      const token = randomToken(32);
      const pin = String(crypto.randomInt(0, 100000000)).padStart(8, '0');
      const id = newId('aprq');
      const timestamp = nowIso();
      db.transaction(() => {
        invalidateApproval(item.id, req.user.id, 'Diganti dengan permintaan approval baru.');
        db.prepare(`INSERT INTO director_approval_requests(id,content_id,director_id,token_hash,pin_hash,attachment_ids_json,created_by,created_at)
          VALUES(?,?,?,?,?,?,?,?)`).run(id, item.id, director.id, hashToken('DIRECTOR_LINK', token), hashToken('DIRECTOR_PIN', `${id}|${pin}`), JSON.stringify(fileIds), req.user.id, timestamp);
        db.prepare("UPDATE contents SET status='APPROVAL_PENDING',approver_id=?,updated_at=? WHERE id=?").run(director.id, timestamp, item.id);
        db.prepare("INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at) VALUES(?,?,?,'APPROVAL_PENDING','REQUEST_DIRECTOR_APPROVAL',?,?,?)")
          .run(newId('evt'), item.id, item.status, `Direksi: ${director.name}`, req.user.id, timestamp);
        recordAudit({ actorId: req.user.id, entityType: 'DIRECTOR_APPROVAL', entityId: id, action: 'CREATE', after: { contentId: item.id, directorId: director.id, fileIds }, ip: requestIp(req) });
      })();
      notifyUser(director.id, 'DIRECTOR_APPROVAL', `Approval ${item.content_no}`, item.title, `/contents/${item.id}`);
      res.status(201).json({ id, url: `/approval.html?token=${token}`, pin, director: director.name });
    } catch (error) { next(error); }
  });

  app.post('/api/contents/:id/director-approvals/:approvalId/cancel', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      if (!isCoordinator(req.user)) throw new AppError('Hanya Koordinator yang dapat membatalkan approval.', 403);
      const approval = db.prepare("SELECT id FROM director_approval_requests WHERE id=? AND content_id=? AND status='ACTIVE'").get(req.params.approvalId, item.id);
      if (!approval) throw new AppError('Approval aktif tidak ditemukan.', 404);
      const timestamp = nowIso();
      db.transaction(() => {
        db.prepare("UPDATE director_approval_requests SET status='CANCELLED',cancelled_at=?,note=? WHERE id=?").run(timestamp, cleanText(req.body.note, 1000), approval.id);
        db.prepare('DELETE FROM approval_access_sessions WHERE request_id=?').run(approval.id);
        if (item.status === 'APPROVAL_PENDING') db.prepare("UPDATE contents SET status='DRAFT_SUBMITTED',updated_at=? WHERE id=?").run(timestamp, item.id);
        db.prepare(`INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at)
          VALUES(?,?,'APPROVAL_PENDING','DRAFT_SUBMITTED','CANCEL_DIRECTOR_APPROVAL',?,?,?)`).run(newId('evt'), item.id, cleanText(req.body.note, 1000), req.user.id, timestamp);
        recordAudit({ actorId: req.user.id, entityType: 'DIRECTOR_APPROVAL', entityId: approval.id, action: 'CANCEL', reason: cleanText(req.body.note, 1000), ip: requestIp(req) });
      })();
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  function approvalByToken(token) {
    return db.prepare(`SELECT dar.*,c.content_no,c.title,c.description,c.objective,c.audience,c.brief,c.caption,c.hashtags,c.call_to_action,c.status AS content_status,
      c.coordinator_id,c.vendor_id,b.name AS brand_name,u.name AS director_name,u.active AS director_active FROM director_approval_requests dar
      JOIN contents c ON c.id=dar.content_id JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=dar.director_id
      WHERE dar.token_hash=?`).get(hashToken('DIRECTOR_LINK', token));
  }

  function approvalSession(req, approval) {
    const raw = req.cookies?.mh_approval;
    if (!raw) return false;
    return Boolean(db.prepare('SELECT id FROM approval_access_sessions WHERE request_id=? AND token_hash=? AND expires_at>?').get(approval.id, hashToken('APPROVAL_SESSION', raw), nowIso()));
  }

  app.get('/api/public/approvals/:token', (req, res, next) => {
    try {
      const approval = approvalByToken(req.params.token);
      if (!approval) throw new AppError('Link approval tidak ditemukan.', 404);
      if (approval.status !== 'ACTIVE' || !approval.director_active) throw new AppError('Link approval sudah tidak aktif.', 410);
      if (!approvalSession(req, approval)) return res.status(401).json({ requiresPin: true, locked: Boolean(approval.locked_at), director: approval.director_name });
      const ids = json(approval.attachment_ids_json);
      const files = ids.length ? db.prepare(`SELECT id,original_name,mime_type,file_size,phase,version_number FROM collaboration_files WHERE content_id=? AND id IN (${ids.map(() => '?').join(',')})`).all(approval.content_id, ...ids) : [];
      res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow');
      res.json({ content: {
        id: approval.id, content_no: approval.content_no, title: approval.title, description: approval.description,
        objective: approval.objective, audience: approval.audience, brief: approval.brief, caption: approval.caption,
        hashtags: approval.hashtags, call_to_action: approval.call_to_action, brand_name: approval.brand_name,
        director_name: approval.director_name
      }, files: files.map(file => ({ ...file, fileUrl: `/api/public/approvals/${req.params.token}/files/${file.id}` })) });
    } catch (error) { next(error); }
  });

  app.post('/api/public/approvals/:token/unlock', (req, res, next) => {
    try {
      const approval = approvalByToken(req.params.token);
      if (!approval || approval.status !== 'ACTIVE' || !approval.director_active) throw new AppError('Link approval sudah tidak aktif.', 410);
      if (approval.locked_at || approval.attempt_count >= 5) throw new AppError('PIN terkunci. Hubungi Koordinator.', 423);
      const supplied = hashToken('DIRECTOR_PIN', `${approval.id}|${String(req.body.pin || '')}`);
      if (supplied !== approval.pin_hash) {
        const attempts = approval.attempt_count + 1;
        db.prepare('UPDATE director_approval_requests SET attempt_count=?,locked_at=? WHERE id=?').run(attempts, attempts >= 5 ? nowIso() : null, approval.id);
        recordAudit({ actorId: approval.director_id, entityType: 'DIRECTOR_APPROVAL', entityId: approval.id, action: 'PIN_FAILED', after: { attempts }, ip: requestIp(req) });
        throw new AppError(attempts >= 5 ? 'PIN terkunci. Hubungi Koordinator.' : `PIN salah. Sisa percobaan ${5 - attempts}.`, attempts >= 5 ? 423 : 401);
      }
      const session = randomToken(32);
      const timestamp = nowIso();
      db.prepare('INSERT INTO approval_access_sessions(id,request_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
        .run(newId('aps'), approval.id, hashToken('APPROVAL_SESSION', session), new Date(Date.now() + 2 * 3600000).toISOString(), timestamp);
      db.prepare('UPDATE director_approval_requests SET opened_at=COALESCE(opened_at,?) WHERE id=?').run(timestamp, approval.id);
      recordAudit({ actorId: approval.director_id, entityType: 'DIRECTOR_APPROVAL', entityId: approval.id, action: 'OPEN', ip: requestIp(req) });
      res.cookie('mh_approval', session, { httpOnly: true, secure: options.cookieSecure, sameSite: 'strict', maxAge: 2 * 3600000, path: '/api/public/approvals' });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.get('/api/public/approvals/:token/files/:fileId', (req, res, next) => {
    try {
      const approval = approvalByToken(req.params.token);
      if (!approval || approval.status !== 'ACTIVE' || !approvalSession(req, approval)) throw new AppError('Akses approval tidak berlaku.', 401);
      if (!json(approval.attachment_ids_json).includes(req.params.fileId)) throw new AppError('Berkas tidak termasuk approval.', 404);
      const file = db.prepare('SELECT * FROM collaboration_files WHERE id=? AND content_id=?').get(req.params.fileId, approval.content_id);
      if (!file) throw new AppError('Berkas tidak ditemukan.', 404);
      res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow');
      return sendStoredFile(req, res, file, req.query.download === '1');
    } catch (error) { next(error); }
  });

  app.post('/api/public/approvals/:token/decision', (req, res, next) => {
    try {
      const approval = approvalByToken(req.params.token);
      if (!approval || approval.status !== 'ACTIVE' || !approvalSession(req, approval)) throw new AppError('Akses approval tidak berlaku.', 401);
      const decision = String(req.body.decision || '');
      if (!['APPROVED', 'REVISION'].includes(decision)) throw new AppError('Keputusan tidak valid.');
      const note = cleanText(req.body.note, 2000);
      if (decision === 'REVISION' && !note) throw new AppError('Catatan revisi wajib diisi.');
      const timestamp = nowIso();
      const status = decision === 'APPROVED' ? 'APPROVED' : 'REVISION_REQUIRED';
      db.transaction(() => {
        db.prepare('UPDATE director_approval_requests SET status=?,note=?,decided_at=? WHERE id=?').run(decision, note, timestamp, approval.id);
        db.prepare('DELETE FROM approval_access_sessions WHERE request_id=?').run(approval.id);
        db.prepare('UPDATE contents SET status=?,locked_at=?,updated_at=? WHERE id=?').run(status, decision === 'APPROVED' ? timestamp : null, timestamp, approval.content_id);
        db.prepare('INSERT INTO approvals(id,content_id,version_id,decision,note,approver_id,created_at) VALUES(?,?,NULL,?,?,?,?)')
          .run(newId('apr'), approval.content_id, decision, note, approval.director_id, timestamp);
        db.prepare('INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(newId('evt'), approval.content_id, 'APPROVAL_PENDING', status, 'DIRECTOR_DECISION', note, approval.director_id, timestamp);
        recordAudit({ actorId: approval.director_id, entityType: 'DIRECTOR_APPROVAL', entityId: approval.id, action: decision, reason: note, ip: requestIp(req) });
      })();
      notifyUser(approval.created_by, decision === 'APPROVED' ? 'DIRECTOR_APPROVED' : 'DIRECTOR_REVISION', `${approval.content_no} ${decision === 'APPROVED' ? 'disetujui Direksi' : 'diminta revisi'}`, note || approval.title, `/contents/${approval.content_id}`);
      if (approval.coordinator_id !== approval.created_by) notifyUser(approval.coordinator_id, decision === 'APPROVED' ? 'DIRECTOR_APPROVED' : 'DIRECTOR_REVISION', `${approval.content_no} ${decision === 'APPROVED' ? 'disetujui Direksi' : 'diminta revisi'}`, note || approval.title, `/contents/${approval.content_id}`);
      if (decision === 'REVISION' && approval.vendor_id) {
        for (const user of db.prepare("SELECT id FROM users WHERE vendor_id=? AND role='VENDOR' AND active=1").all(approval.vendor_id)) {
          notifyUser(user.id, 'DIRECTOR_REVISION', `Revisi Direksi ${approval.content_no}`, note, `/contents/${approval.content_id}`);
        }
      }
      res.json({ ok: true, status });
    } catch (error) { next(error); }
  });

  const proofStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'proofs')),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).replace(/[^.a-z0-9]/gi, '').slice(0, 12)}`)
  });
  const proofUpload = multer({
    storage: proofStorage,
    limits: { fileSize: Math.min(maxUploadMb * 1024 * 1024, 100 * 1024 * 1024), files: 1 },
    fileFilter: (_req, file, callback) => callback(['application/pdf'].includes(file.mimetype) || (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') ? null : new AppError('Bukti tayang harus berupa gambar atau PDF.'), ['application/pdf'].includes(file.mimetype) || (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml'))
  });

  app.post('/api/contents/:id/schedules', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      ensurePermission(req.user, 'content.schedule');
      if (item.status !== 'APPROVED') throw new AppError('Konten harus disetujui sebelum dijadwalkan.', 409);
      const plans = Array.isArray(req.body.plans) ? req.body.plans : [];
      if (!plans.length) throw new AppError('Minimal satu jadwal platform wajib dibuat.');
      const timestamp = nowIso();
      db.transaction(() => {
        for (const plan of plans) {
          const channel = db.prepare('SELECT id FROM channels WHERE id=? AND active=1').get(String(plan.channelId || ''));
          const uploader = db.prepare("SELECT id FROM users WHERE id=? AND role='UPLOADER' AND active=1").get(String(plan.uploaderId || ''));
          if (!channel || !uploader || !String(plan.scheduledAt || '').trim()) throw new AppError('Platform, waktu, dan petugas upload wajib valid.');
          db.prepare(`INSERT INTO publication_schedules(id,content_id,channel_id,scheduled_at,uploader_id,created_by,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?)`).run(newId('sch'), item.id, channel.id, cleanText(plan.scheduledAt, 40), uploader.id, req.user.id, timestamp, timestamp);
          notifyUser(uploader.id, 'UPLOAD_ASSIGNED', `Jadwal ${item.content_no}`, `${item.title} · ${plan.scheduledAt}`, `/contents/${item.id}`);
        }
        const firstPlan = plans.slice().sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))[0];
        db.prepare("UPDATE contents SET status='SCHEDULED',publish_at=?,uploader_id=?,updated_at=? WHERE id=?")
          .run(cleanText(firstPlan.scheduledAt, 40), String(firstPlan.uploaderId), timestamp, item.id);
        db.prepare("INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at) VALUES(?,?,?,'SCHEDULED','CREATE_SCHEDULES',?,?,?)")
          .run(newId('evt'), item.id, item.status, `${plans.length} platform`, req.user.id, timestamp);
        recordAudit({ actorId: req.user.id, entityType: 'PUBLICATION_SCHEDULE', entityId: item.id, action: 'CREATE', after: { plans }, ip: requestIp(req) });
      })();
      res.status(201).json({ ok: true });
    } catch (error) { next(error); }
  });

  app.get('/api/contents/:id/schedules', authRequired, (req, res, next) => {
    try {
      const item = getContent(req.params.id, req.user);
      const rows = db.prepare(`SELECT ps.*,ch.name AS channel_name,u.name AS uploader_name FROM publication_schedules ps
        JOIN channels ch ON ch.id=ps.channel_id JOIN users u ON u.id=ps.uploader_id WHERE ps.content_id=? ORDER BY ps.scheduled_at`).all(item.id);
      res.json({ items: rows.map(row => ({ ...row, proofUrl: row.proof_path ? `/api/schedules/${row.id}/proof` : '' })) });
    } catch (error) { next(error); }
  });

  app.post('/api/schedules/:id/publish', authRequired, proofUpload.single('file'), (req, res, next) => {
    try {
      const schedule = db.prepare('SELECT * FROM publication_schedules WHERE id=?').get(req.params.id);
      if (!schedule) throw new AppError('Jadwal tidak ditemukan.', 404);
      const item = getContent(schedule.content_id, req.user);
      if (req.user.role !== 'SUPER_ADMIN' && (req.user.role !== 'UPLOADER' || schedule.uploader_id !== req.user.id)) throw new AppError('Jadwal ini bukan tugas Anda.', 403);
      if (schedule.status !== 'SCHEDULED') throw new AppError('Jadwal sudah diproses.', 409);
      const platformUrl = cleanText(req.body.platformUrl, 1000);
      if (!platformUrl && !req.file) throw new AppError('URL atau bukti tayang wajib diisi.');
      const timestamp = nowIso();
      const proofPath = req.file ? path.join('proofs', req.file.filename) : null;
      const metrics = { reach: Number(req.body.reach || 0), impressions: Number(req.body.impressions || 0), engagement: Number(req.body.engagement || 0), leads: Number(req.body.leads || 0), notes: cleanText(req.body.metricsNotes, 1000) };
      db.transaction(() => {
        db.prepare(`UPDATE publication_schedules SET status='PUBLISHED',platform_url=?,published_at=?,proof_path=?,proof_name=?,proof_mime=?,metrics_json=?,updated_at=? WHERE id=?`)
          .run(platformUrl || null, cleanText(req.body.publishedAt, 40) || timestamp, proofPath, req.file ? safeFilename(req.file.originalname) : null, req.file?.mimetype || null, JSON.stringify(metrics), timestamp, schedule.id);
        db.prepare(`INSERT INTO publication_proofs(id,content_id,channel_id,platform_url,published_at,file_path,original_name,mime_type,metrics_json,uploader_id,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(newId('prf'), item.id, schedule.channel_id, platformUrl || null, cleanText(req.body.publishedAt, 40) || timestamp, proofPath,
          req.file ? safeFilename(req.file.originalname) : null, req.file?.mimetype || null, JSON.stringify(metrics), req.user.id, timestamp);
        const remaining = Number(db.prepare("SELECT COUNT(*) AS n FROM publication_schedules WHERE content_id=? AND status='SCHEDULED'").get(item.id).n);
        if (!remaining) {
          db.prepare("UPDATE contents SET status='PUBLISHED',locked_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, item.id);
          db.prepare("INSERT INTO workflow_events(id,content_id,from_status,to_status,action,note,actor_id,created_at) VALUES(?,?,'SCHEDULED','PUBLISHED','ALL_PLATFORMS_PUBLISHED',?,?,?)")
            .run(newId('evt'), item.id, 'Semua platform selesai', req.user.id, timestamp);
        }
        recordAudit({ actorId: req.user.id, entityType: 'PUBLICATION_SCHEDULE', entityId: schedule.id, action: 'PUBLISH', after: { platformUrl }, ip: requestIp(req) });
      })();
      notifyUser(item.coordinator_id, 'PLATFORM_PUBLISHED', `${item.content_no} tayang`, platformUrl || item.title, `/contents/${item.id}`);
      res.json({ ok: true });
    } catch (error) {
      if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
      next(error);
    }
  });

  app.get('/api/schedules/:id/proof', authRequired, (req, res, next) => {
    try {
      const row = db.prepare('SELECT * FROM publication_schedules WHERE id=?').get(req.params.id);
      if (!row || !row.proof_path) throw new AppError('Bukti tidak ditemukan.', 404);
      getContent(row.content_id, req.user);
      return sendStoredFile(req, res, row, req.query.download === '1');
    } catch (error) { next(error); }
  });
}

module.exports = { installWorkflowV4 };
