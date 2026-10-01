const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, assertTransition, TRANSITIONS } = require('../src/workflow');
const { hasPermission, permissionsForRole } = require('../src/permissions');

test('workflow mengikuti urutan produksi sampai publikasi', () => {
  const states = ['REQUESTED', 'BRIEFED', 'ASSIGNED', 'IN_PRODUCTION', 'DRAFT_SUBMITTED', 'APPROVAL_PENDING', 'APPROVED', 'SCHEDULED', 'PUBLISHED'];
  for (let index = 0; index < states.length - 1; index += 1) {
    assert.equal(canTransition(states[index], states[index + 1]), true);
  }
  assert.deepEqual(TRANSITIONS.PUBLISHED, []);
});

test('workflow menolak lompatan tahap', () => {
  assert.equal(canTransition('REQUESTED', 'APPROVED'), false);
  assert.throws(() => assertTransition('IN_PRODUCTION', 'PUBLISHED'), /tidak diperbolehkan/);
});

test('brief dan diskusi dapat langsung memulai produksi', () => {
  assert.equal(canTransition('REQUESTED', 'IN_PRODUCTION'), true);
});

test('produksi internal dapat dimulai langsung setelah brief siap', () => {
  assert.equal(canTransition('BRIEFED', 'IN_PRODUCTION'), true);
});

test('vendor hanya memiliki izin produksi dan library baca', () => {
  assert.equal(hasPermission('VENDOR', 'content.create'), true);
  assert.equal(hasPermission('VENDOR', 'content.upload_draft'), true);
  assert.equal(hasPermission('VENDOR', 'library.download'), true);
  assert.equal(hasPermission('VENDOR', 'content.approve_production'), false);
  assert.equal(hasPermission('VENDOR', 'library.manage'), false);
});

test('super admin memiliki wildcard permission', () => {
  assert.deepEqual(permissionsForRole('SUPER_ADMIN'), ['*']);
  assert.equal(hasPermission('SUPER_ADMIN', 'anything.manage'), true);
});

test('Asisten Koordinator memiliki Video Instan dan dapat menjadi petugas upload tanpa hak approval global', () => {
  assert.equal(hasPermission('ASSISTANT_COORDINATOR', 'content.instant_create'), true);
  assert.equal(hasPermission('ASSISTANT_COORDINATOR', 'content.publish'), true);
  assert.equal(hasPermission('ASSISTANT_COORDINATOR', 'content.review'), false);
  assert.equal(hasPermission('ASSISTANT_COORDINATOR', 'content.schedule'), false);
  assert.equal(hasPermission('ASSISTANT_COORDINATOR', 'footage.upload'), true);
  assert.equal(hasPermission('ASSISTANT_COORDINATOR', 'footage.manage'), false);
});

test('hanya Super Admin dan Direksi memiliki akses pengelolaan Sampah', () => {
  assert.equal(hasPermission('SUPER_ADMIN', 'content.trash'), true);
  assert.equal(hasPermission('MANAGEMENT', 'content.trash'), true);
  assert.equal(hasPermission('COORDINATOR', 'content.trash'), false);
  assert.equal(hasPermission('VENDOR', 'content.trash'), false);
  assert.equal(hasPermission('UPLOADER', 'content.trash'), false);
});

test('akses Raw Footage dibedakan dari Media Library', () => {
  assert.equal(hasPermission('SUPER_ADMIN', 'footage.manage'), true);
  assert.equal(hasPermission('COORDINATOR', 'footage.manage'), true);
  assert.equal(hasPermission('VENDOR', 'footage.view'), true);
  assert.equal(hasPermission('VENDOR', 'footage.download'), true);
  assert.equal(hasPermission('VENDOR', 'footage.manage'), false);
  assert.equal(hasPermission('MANAGEMENT', 'footage.view'), true);
  assert.equal(hasPermission('UPLOADER', 'footage.view'), false);
});
