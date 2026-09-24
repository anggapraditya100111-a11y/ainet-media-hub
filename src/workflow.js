const STATUSES = Object.freeze([
  'REQUESTED', 'BRIEFED', 'ASSIGNED', 'IN_PRODUCTION', 'DRAFT_SUBMITTED',
  'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVAL_PENDING', 'APPROVED',
  'SCHEDULED', 'PUBLISHED', 'CANCELLED'
]);

const STATUS_LABELS = Object.freeze({
  REQUESTED: 'Brief & Diskusi', BRIEFED: 'Brief & Diskusi', ASSIGNED: 'Brief & Diskusi',
  IN_PRODUCTION: 'Produksi', DRAFT_SUBMITTED: 'Review Koordinator',
  IN_REVIEW: 'Review Koordinator', REVISION_REQUIRED: 'Revisi Produksi',
  APPROVAL_PENDING: 'Approval Direksi', APPROVED: 'Disetujui',
  SCHEDULED: 'Terjadwal', PUBLISHED: 'Selesai Tayang', CANCELLED: 'Dibatalkan'
});

const TRANSITIONS = Object.freeze({
  REQUESTED: ['BRIEFED', 'IN_PRODUCTION', 'CANCELLED'],
  BRIEFED: ['ASSIGNED', 'IN_PRODUCTION', 'CANCELLED'],
  ASSIGNED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['DRAFT_SUBMITTED', 'CANCELLED'],
  DRAFT_SUBMITTED: ['REVISION_REQUIRED', 'APPROVAL_PENDING', 'APPROVED'],
  IN_REVIEW: ['REVISION_REQUIRED', 'APPROVAL_PENDING', 'APPROVED'],
  REVISION_REQUIRED: ['IN_PRODUCTION', 'CANCELLED'],
  APPROVAL_PENDING: ['APPROVED', 'REVISION_REQUIRED'],
  APPROVED: ['SCHEDULED', 'REVISION_REQUIRED'],
  SCHEDULED: ['PUBLISHED', 'REVISION_REQUIRED'],
  PUBLISHED: [],
  CANCELLED: []
});

const TRANSITION_PERMISSION = Object.freeze({
  BRIEFED: 'content.edit',
  ASSIGNED: 'content.assign',
  IN_PRODUCTION: 'content.approve_production',
  DRAFT_SUBMITTED: 'content.upload_draft',
  IN_REVIEW: 'content.review',
  REVISION_REQUIRED: 'content.review',
  APPROVAL_PENDING: 'content.review',
  APPROVED: 'content.review',
  SCHEDULED: 'content.schedule',
  PUBLISHED: 'content.publish',
  CANCELLED: 'content.edit'
});

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

function assertTransition(from, to) {
  if (!STATUSES.includes(to) || !canTransition(from, to)) {
    const error = new Error(`Perubahan status ${STATUS_LABELS[from] || from} ke ${STATUS_LABELS[to] || to} tidak diperbolehkan.`);
    error.status = 409;
    throw error;
  }
}

module.exports = { STATUSES, STATUS_LABELS, TRANSITIONS, TRANSITION_PERMISSION, canTransition, assertTransition };
