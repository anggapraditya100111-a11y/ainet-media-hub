const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, assertTransition, TRANSITIONS } = require('../src/workflow');
const { hasPermission, permissionsForRole } = require('../src/permissions');

test('workflow mengikuti urutan produksi sampai publikasi', () => {
  const states = [
    'REQUESTED', 'BRIEFED', 'ASSIGNED', 'IN_PRODUCTION', 'DRAFT_SUBMITTED',
    'IN_REVIEW', 'APPROVAL_PENDING', 'APPROVED', 'SCHEDULED', 'PUBLISHED'
  ];
  for (let index = 0; index < states.length - 1; index += 1) {
    assert.equal(canTransition(states[index], states[index + 1]), true);
  }
  assert.deepEqual(TRANSITIONS.PUBLISHED, []);
});

test('workflow menolak lompatan tahap', () => {
  assert.equal(canTransition('REQUESTED', 'APPROVED'), false);
  assert.throws(() => assertTransition('IN_PRODUCTION', 'PUBLISHED'), /tidak diperbolehkan/);
});

test('vendor hanya memiliki izin produksi dan library baca', () => {
  assert.equal(hasPermission('VENDOR', 'content.upload_draft'), true);
  assert.equal(hasPermission('VENDOR', 'library.download'), true);
  assert.equal(hasPermission('VENDOR', 'content.approve_regular'), false);
  assert.equal(hasPermission('VENDOR', 'library.manage'), false);
});

test('super admin memiliki wildcard permission', () => {
  assert.deepEqual(permissionsForRole('SUPER_ADMIN'), ['*']);
  assert.equal(hasPermission('SUPER_ADMIN', 'anything.manage'), true);
});
