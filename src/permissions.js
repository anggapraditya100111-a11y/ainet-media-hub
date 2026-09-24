const ROLE_LABELS = Object.freeze({
  SUPER_ADMIN: 'Super Admin',
  COORDINATOR: 'Koordinator Media',
  VENDOR: 'Vendor / Kreator',
  UPLOADER: 'Petugas Upload',
  MANAGEMENT: 'Direksi'
});

const ROLE_PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ['*'],
  COORDINATOR: [
    'dashboard.view', 'calendar.view', 'content.view_all', 'content.create',
    'content.edit', 'content.assign', 'content.discuss', 'content.review',
    'content.approve_production', 'content.request_director_approval', 'content.schedule',
    'library.view', 'library.download', 'library.manage',
    'vendor.view', 'vendor.manage', 'reports.view', 'notifications.view'
  ],
  VENDOR: [
    'dashboard.view', 'calendar.view', 'content.view_assigned', 'content.create', 'content.production',
    'content.upload_draft', 'content.discuss', 'library.view', 'library.download', 'notifications.view'
  ],
  UPLOADER: [
    'dashboard.view', 'calendar.view', 'content.view_approved', 'content.publish',
    'library.view', 'library.download', 'notifications.view'
  ],
  MANAGEMENT: [
    'dashboard.executive', 'calendar.view', 'content.view_all', 'content.director_approve', 'reports.view',
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
