function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizedBaseUrl(value, fallback) {
  try {
    const url = new URL(String(value || fallback).trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    url.pathname = url.pathname.replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch { return fallback; }
}

function categoryFor(type) {
  if (/UPLOAD|SCHEDULE|READY_TO_PUBLISH/.test(type)) return 'TASK';
  if (/REVIEW|RESULT|REVISION/.test(type)) return 'REVIEW';
  if (/PUBLISH/.test(type)) return 'PUBLISH';
  return 'ANNOUNCEMENT';
}

function retryAt(attempts) {
  const delays = [5_000, 30_000, 120_000, 600_000, 3_600_000];
  return new Date(Date.now() + delays[Math.min(Math.max(0, attempts - 1), delays.length - 1)]).toISOString();
}

function createAccessNotificationRelay({ db, nowIso, fetchImpl = fetch, env = process.env }) {
  const token = String(env.ACCESS_NOTIFICATION_TOKEN || '').trim();
  const active = enabled(env.ACCESS_NOTIFICATION_ENABLED) && token.length >= 32;
  const accessBase = normalizedBaseUrl(env.ACCESS_NOTIFICATION_INTERNAL_URL || env.ACCESS_PORTAL_INTERNAL_URL, 'http://host.docker.internal:8096');
  const endpoint = `${accessBase}/api/internal/notifications`;
  const publicBase = normalizedBaseUrl(env.PUBLIC_APP_URL, 'https://mediahub.axindo.my.id');
  const allowedTypes = new Set(String(env.ACCESS_NOTIFICATION_TYPES || [
    'RESULT_SUBMITTED', 'SIMPLE_VENDOR_RESULT', 'SIMPLE_CONTENT_RESUBMITTED',
    'UPLOAD_ASSIGNED', 'UPLOAD_RESCHEDULED', 'READY_TO_PUBLISH', 'CONTENT_SCHEDULED'
  ].join(',')).split(',').map(value => value.trim().toUpperCase()).filter(Boolean));
  let running = false;
  let timer = null;
  let immediate = null;

  function targetUrl(link) {
    try { return new URL(String(link || '/'), `${publicBase}/`).href; }
    catch { return publicBase; }
  }

  function enqueue(notification) {
    if (!active || !allowedTypes.has(String(notification.type || '').toUpperCase())) return false;
    const user = db.prepare('SELECT oidc_subject,active FROM users WHERE id=?').get(notification.userId);
    if (!user?.oidc_subject || !user.active) return false;
    const payload = {
      applicationSlug: 'media-hub',
      eventId: `media-hub:${notification.id}`,
      recipients: [String(user.oidc_subject)],
      category: categoryFor(String(notification.type || '').toUpperCase()),
      title: String(notification.title || '').slice(0, 160),
      body: String(notification.body || '').slice(0, 1000),
      targetUrl: targetUrl(notification.link)
    };
    db.prepare(`INSERT OR IGNORE INTO access_notification_outbox(
      id,notification_id,payload_json,status,next_attempt_at,created_at
    ) VALUES(?,?,?,'PENDING',?,?)`).run(
      `outbox-${notification.id}`, notification.id, JSON.stringify(payload), nowIso(), nowIso()
    );
    schedule();
    return true;
  }

  async function deliver(row) {
    db.prepare("UPDATE access_notification_outbox SET status='SENDING',attempts=attempts+1 WHERE id=?")
      .run(row.id);
    let status = 0;
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-axindo-notification': '1',
          authorization: `Bearer ${token}`
        },
        body: row.payload_json,
        signal: AbortSignal.timeout(15_000)
      });
      status = response.status;
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      db.prepare("UPDATE access_notification_outbox SET status='SENT',sent_at=?,last_error=NULL WHERE id=?")
        .run(nowIso(), row.id);
      return true;
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const reason = status ? `HTTP_${status}` : String(error?.name || 'NETWORK_ERROR').slice(0, 80);
      db.prepare(`UPDATE access_notification_outbox
        SET status='PENDING',next_attempt_at=?,last_error=? WHERE id=?`)
        .run(retryAt(attempts), reason, row.id);
      return false;
    }
  }

  async function drain() {
    if (!active || running) return;
    running = true;
    try {
      const rows = db.prepare(`SELECT * FROM access_notification_outbox
        WHERE status='PENDING' AND next_attempt_at<=?
        ORDER BY created_at LIMIT 20`).all(nowIso());
      for (const row of rows) await deliver(row);
    } finally { running = false; }
  }

  function schedule() {
    if (!active || immediate) return;
    immediate = setImmediate(() => {
      immediate = null;
      drain().catch(() => null);
    });
    immediate.unref?.();
  }

  function start() {
    if (!active || timer) return;
    db.prepare("UPDATE access_notification_outbox SET status='PENDING',next_attempt_at=? WHERE status='SENDING'")
      .run(nowIso());
    schedule();
    timer = setInterval(() => drain().catch(() => null), 30_000);
    timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    if (immediate) clearImmediate(immediate);
    timer = null;
    immediate = null;
  }

  return { active, endpoint, enqueue, drain, start, stop };
}

module.exports = { createAccessNotificationRelay, categoryFor, retryAt };
