const STATUSES = Object.freeze([
  'REQUESTED', 'BRIEFED', 'ASSIGNED', 'IN_PRODUCTION', 'DRAFT_SUBMITTED',
  'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVAL_PENDING', 'APPROVED',
  'SCHEDULED', 'PUBLISHED', 'CANCELLED'
]);

const STATUS_LABELS = Object.freeze({
  REQUESTED: 'Permintaan', BRIEFED: 'Brief', ASSIGNED: 'Ditugaskan',
  IN_PRODUCTION: 'Produksi', DRAFT_SUBMITTED: 'Draft Terkirim',
  IN_REVIEW: 'Review', REVISION_REQUIRED: 'Perlu Revisi',
  APPROVAL_PENDING: 'Menunggu Persetujuan', APPROVED: 'Disetujui',
  SCHEDULED: 'Terjadwal', PUBLISHED: 'Tayang', CANCELLED: 'Dibatalkan'
});

const TRANSITIONS = Object.freeze({
  REQUESTED: ['BRIEFED', 'CANCELLED'],
  BRIEFED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['DRAFT_SUBMITTED', 'CANCELLED'],
  DRAFT_SUBMITTED: ['IN_REVIEW', 'REVISION_REQUIRED'],
  IN_REVIEW: ['REVISION_REQUIRED', 'APPROVAL_PENDING'],
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
  IN_PRODUCTION: 'content.production',
  DRAFT_SUBMITTED: 'content.upload_draft',
  IN_REVIEW: 'content.review',
  REVISION_REQUIRED: 'content.review',
  APPROVAL_PENDING: 'content.review',
  APPROVED: 'content.approve_regular',
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
