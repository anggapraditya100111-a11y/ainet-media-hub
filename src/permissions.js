const ROLE_LABELS = Object.freeze({
  SUPER_ADMIN: 'Super Admin',
  COORDINATOR: 'Koordinator Media',
  VENDOR: 'Vendor / Kreator',
  REVIEWER: 'Reviewer',
  APPROVER: 'Approver',
  UPLOADER: 'Petugas Uploader',
  MANAGEMENT: 'Direksi / Manajemen'
});

const ROLE_PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ['*'],
  COORDINATOR: [
    'dashboard.view', 'calendar.view', 'content.view_all', 'content.create',
    'content.edit', 'content.assign', 'content.review', 'content.approve_regular',
    'content.schedule', 'library.view', 'library.download', 'library.manage',
    'vendor.view', 'vendor.manage', 'reports.view', 'notifications.view'
  ],
  VENDOR: [
    'dashboard.view', 'calendar.view', 'content.view_assigned', 'content.production',
    'content.upload_draft', 'library.view', 'library.download', 'notifications.view'
  ],
  REVIEWER: [
    'dashboard.view', 'calendar.view', 'content.view_all', 'content.review',
    'library.view', 'library.download', 'notifications.view'
  ],
  APPROVER: [
    'dashboard.view', 'calendar.view', 'content.view_all', 'content.approve_regular',
    'content.approve_sensitive', 'library.view', 'library.download', 'notifications.view'
  ],
  UPLOADER: [
    'dashboard.view', 'calendar.view', 'content.view_approved', 'content.publish',
    'library.view', 'library.download', 'notifications.view'
  ],
  MANAGEMENT: [
    'dashboard.executive', 'calendar.view', 'content.view_all', 'reports.view',
    'vendor.view', 'vendor.performance', 'library.view', 'library.download',
    'notifications.view'
  ]
});

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
}

function hasPermission(userOrRole, permission) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

module.exports = { ROLE_LABELS, ROLE_PERMISSIONS, permissionsForRole, hasPermission };
