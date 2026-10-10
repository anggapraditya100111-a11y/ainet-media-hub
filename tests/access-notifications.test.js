const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createAccessNotificationRelay, categoryFor } = require('../src/access-notifications');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, oidc_subject TEXT, active INTEGER NOT NULL);
    CREATE TABLE notifications (id TEXT PRIMARY KEY);
    CREATE TABLE access_notification_outbox (
      id TEXT PRIMARY KEY, notification_id TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL, last_error TEXT, created_at TEXT NOT NULL, sent_at TEXT
    );
  `);
  return db;
}

test('relay mengantrikan event workflow untuk subject AXINDO ID dan mengirim idempoten', async () => {
  const db = database();
  db.prepare('INSERT INTO users(id,oidc_subject,active) VALUES(?,?,1)').run('usr-1', 'subject-1');
  db.prepare('INSERT INTO notifications(id) VALUES(?)').run('ntf-1');
  const requests = [];
  const relay = createAccessNotificationRelay({
    db,
    nowIso: () => new Date().toISOString(),
    env: {
      ACCESS_NOTIFICATION_ENABLED: 'true',
      ACCESS_NOTIFICATION_TOKEN: 'x'.repeat(64),
      ACCESS_NOTIFICATION_INTERNAL_URL: 'http://access-manager:8096',
      PUBLIC_APP_URL: 'https://mediahub.axindo.my.id'
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 201 };
    }
  });
  assert.equal(relay.enqueue({
    id: 'ntf-1', userId: 'usr-1', type: 'RESULT_SUBMITTED',
    title: 'Hasil siap direview', body: 'CNT-001', link: '/contents/cnt-1'
  }), true);
  assert.equal(relay.enqueue({
    id: 'ntf-1', userId: 'usr-1', type: 'RESULT_SUBMITTED',
    title: 'Hasil siap direview', body: 'CNT-001', link: '/contents/cnt-1'
  }), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM access_notification_outbox').get().count, 1);
  await relay.drain();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://access-manager:8096/api/internal/notifications');
  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.recipients, ['subject-1']);
  assert.equal(payload.category, 'REVIEW');
  assert.equal(payload.targetUrl, 'https://mediahub.axindo.my.id/contents/cnt-1');
  assert.equal(db.prepare('SELECT status FROM access_notification_outbox').get().status, 'SENT');
  relay.stop();
});

test('relay melewati vendor personal dan event yang tidak dipilih', () => {
  const db = database();
  db.prepare('INSERT INTO users(id,oidc_subject,active) VALUES(?,?,1)').run('vendor', null);
  db.prepare('INSERT INTO notifications(id) VALUES(?)').run('ntf-vendor');
  const relay = createAccessNotificationRelay({
    db, nowIso: () => new Date().toISOString(),
    env: { ACCESS_NOTIFICATION_ENABLED: 'true', ACCESS_NOTIFICATION_TOKEN: 'x'.repeat(64) },
    fetchImpl: async () => ({ ok: true, status: 201 })
  });
  assert.equal(relay.enqueue({ id: 'ntf-vendor', userId: 'vendor', type: 'RESULT_SUBMITTED', title: 'Hasil' }), false);
  assert.equal(relay.enqueue({ id: 'ntf-vendor', userId: 'vendor', type: 'VENDOR_MESSAGE', title: 'Pesan' }), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM access_notification_outbox').get().count, 0);
  relay.stop();
});

test('kategori event tugas, review, dan publikasi konsisten', () => {
  assert.equal(categoryFor('UPLOAD_ASSIGNED'), 'TASK');
  assert.equal(categoryFor('RESULT_SUBMITTED'), 'REVIEW');
  assert.equal(categoryFor('PLATFORM_PUBLISHED'), 'PUBLISH');
});
