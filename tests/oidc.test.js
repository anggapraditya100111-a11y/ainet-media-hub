const test = require('node:test');
const assert = require('node:assert/strict');

const {
  oidcSettings, parseRoleMapping, groupsFromClaims, roleForGroups,
  identityFromClaims, emailAllowed, safeReturnTo
} = require('../src/oidc');

test('konfigurasi OIDC wajib lengkap saat diaktifkan', () => {
  const incomplete = oidcSettings({ OIDC_ENABLED: 'true' });
  assert.equal(incomplete.enabled, true);
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.errors.length >= 4, true);

  const complete = oidcSettings({
    OIDC_ENABLED: 'true',
    OIDC_ISSUER_URL: 'https://sso.axindo.my.id/application/o/axindo-media-hub',
    OIDC_CLIENT_ID: 'client-id',
    OIDC_CLIENT_SECRET: 'client-secret',
    OIDC_REDIRECT_URI: 'https://media.axindo.my.id/api/auth/oidc/callback'
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.issuer, 'https://sso.axindo.my.id/application/o/axindo-media-hub/');
  assert.equal(complete.postLogoutRedirectUri, 'https://media.axindo.my.id/');
});

test('grup Authentik dipetakan dengan role paling berwenang', () => {
  const mapping = parseRoleMapping(JSON.stringify({
    COORDINATOR: ['Tim Media'],
    APPROVER: ['Penyetuju'],
    'Vendor Eksternal': 'VENDOR'
  }));
  const groups = groupsFromClaims({ groups: ['Penyetuju', 'Tim Media'], ak_groups: 'Vendor Eksternal' });
  assert.deepEqual(groups, ['Penyetuju', 'Tim Media', 'Vendor Eksternal']);
  assert.equal(roleForGroups(groups, mapping), 'COORDINATOR');
  assert.equal(roleForGroups(['Tidak Dikenal'], mapping), null);
});

test('identitas dan return URL dibersihkan', () => {
  const identity = identityFromClaims({
    sub: 'abc-123', email: ' User@AXINDO.MY.ID ', preferred_username: 'User Media', name: 'User Media'
  });
  assert.equal(identity.email, 'user@axindo.my.id');
  assert.equal(identity.suggestedUsername, 'usermedia');
  assert.equal(emailAllowed(identity.email, ['axindo.my.id']), true);
  assert.equal(emailAllowed(identity.email, ['example.com']), false);
  assert.equal(safeReturnTo('/calendar?month=9'), '/calendar?month=9');
  assert.equal(safeReturnTo('//evil.example'), '/');
  assert.equal(safeReturnTo('https://evil.example'), '/');
});
