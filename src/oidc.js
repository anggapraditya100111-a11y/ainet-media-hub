const { cleanUsername } = require('./security');

const VALID_ROLES = new Set([
  'SUPER_ADMIN', 'COORDINATOR', 'VENDOR', 'REVIEWER',
  'APPROVER', 'UPLOADER', 'MANAGEMENT'
]);

const ROLE_PRECEDENCE = [
  'SUPER_ADMIN', 'COORDINATOR', 'APPROVER', 'REVIEWER',
  'UPLOADER', 'MANAGEMENT', 'VENDOR'
];

const DEFAULT_ROLE_MAPPING = Object.freeze({
  'AXINDO - MEDIA HUB - SUPER ADMIN': 'SUPER_ADMIN',
  'AXINDO - MEDIA HUB - KOORDINATOR': 'COORDINATOR',
  'AXINDO - MEDIA HUB - VENDOR': 'VENDOR',
  'AXINDO - MEDIA HUB - REVIEWER': 'REVIEWER',
  'AXINDO - MEDIA HUB - APPROVER': 'APPROVER',
  'AXINDO - MEDIA HUB - UPLOADER': 'UPLOADER',
  'AXINDO - MEDIA HUB - MANAGEMENT': 'MANAGEMENT',
  'AXINDO - DIREKSI': 'MANAGEMENT'
});

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizedIssuer(value) {
  const url = new URL(String(value || '').trim());
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

function parseRoleMapping(value) {
  if (!String(value || '').trim()) return { ...DEFAULT_ROLE_MAPPING };
  const parsed = JSON.parse(String(value));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('OIDC_ROLE_MAPPING_JSON harus berupa objek JSON.');
  }

  const mapping = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (VALID_ROLES.has(key) && Array.isArray(item)) {
      for (const group of item) {
        if (String(group || '').trim()) mapping[String(group).trim()] = key;
      }
      continue;
    }
    const role = String(item || '').trim().toUpperCase();
    if (!VALID_ROLES.has(role)) throw new Error(`Role OIDC tidak valid untuk grup ${key}.`);
    if (String(key || '').trim()) mapping[String(key).trim()] = role;
  }
  return mapping;
}

function parseAllowedDomains(value) {
  return String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

function oidcSettings(env = process.env) {
  const requested = enabled(env.OIDC_ENABLED);
  const settings = {
    enabled: requested,
    issuer: String(env.OIDC_ISSUER_URL || '').trim(),
    clientId: String(env.OIDC_CLIENT_ID || '').trim(),
    clientSecret: String(env.OIDC_CLIENT_SECRET || ''),
    redirectUri: String(env.OIDC_REDIRECT_URI || '').trim(),
    postLogoutRedirectUri: String(env.OIDC_POST_LOGOUT_REDIRECT_URI || '').trim(),
    scopes: String(env.OIDC_SCOPES || 'openid profile email').trim(),
    allowedEmailDomains: parseAllowedDomains(env.OIDC_ALLOWED_EMAIL_DOMAINS),
    autoProvision: env.OIDC_AUTO_PROVISION == null ? true : enabled(env.OIDC_AUTO_PROVISION),
    localSuperAdminEnabled: env.LOCAL_SUPER_ADMIN_ENABLED == null ? true : enabled(env.LOCAL_SUPER_ADMIN_ENABLED),
    allowInsecure: enabled(env.OIDC_ALLOW_INSECURE),
    roleMapping: {},
    errors: []
  };

  try { settings.roleMapping = parseRoleMapping(env.OIDC_ROLE_MAPPING_JSON); }
  catch (error) { settings.errors.push(error.message); }

  if (requested) {
    for (const [key, label] of [
      ['issuer', 'OIDC_ISSUER_URL'], ['clientId', 'OIDC_CLIENT_ID'],
      ['clientSecret', 'OIDC_CLIENT_SECRET'], ['redirectUri', 'OIDC_REDIRECT_URI']
    ]) {
      if (!settings[key]) settings.errors.push(`${label} belum diisi.`);
    }
    try {
      if (settings.issuer) settings.issuer = normalizedIssuer(settings.issuer);
      if (settings.redirectUri) new URL(settings.redirectUri);
      if (settings.postLogoutRedirectUri) new URL(settings.postLogoutRedirectUri);
    } catch {
      settings.errors.push('URL konfigurasi OIDC tidak valid.');
    }
    if (!settings.scopes.split(/\s+/).includes('openid')) settings.errors.push('OIDC_SCOPES wajib memuat openid.');
  }
  settings.ready = requested && settings.errors.length === 0;

  if (!settings.postLogoutRedirectUri && settings.redirectUri) {
    const redirect = new URL(settings.redirectUri);
    settings.postLogoutRedirectUri = `${redirect.origin}/`;
  }
  return settings;
}

function groupsFromClaims(claims = {}) {
  const candidates = [claims.groups, claims.ak_groups, claims.group, claims.roles];
  const groups = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) groups.push(...candidate);
    else if (typeof candidate === 'string') {
      const value = candidate.trim();
      if (!value) continue;
      if (value.startsWith('[')) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) groups.push(...parsed);
          else groups.push(value);
        } catch { groups.push(...value.split(',')); }
      } else groups.push(...value.split(','));
    }
  }
  return [...new Set(groups.map(group => String(group || '').trim()).filter(Boolean))];
}

function roleForGroups(groups, mapping = DEFAULT_ROLE_MAPPING) {
  const normalized = new Map(Object.entries(mapping).map(([group, role]) => [group.trim().toLowerCase(), role]));
  const roles = new Set(groups.map(group => normalized.get(String(group).trim().toLowerCase())).filter(Boolean));
  return ROLE_PRECEDENCE.find(role => roles.has(role)) || null;
}

function identityFromClaims(claims = {}) {
  const email = String(claims.email || '').trim().toLowerCase().slice(0, 254);
  const suggestedUsername = cleanUsername(claims.preferred_username || email.split('@')[0] || claims.nickname || '');
  return {
    subject: String(claims.sub || '').trim().slice(0, 500),
    email,
    emailVerified: claims.email_verified === true,
    name: String(claims.name || claims.display_name || suggestedUsername || email).trim().slice(0, 200),
    suggestedUsername
  };
}

function emailAllowed(email, domains) {
  if (!domains.length) return true;
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  return domains.includes(domain);
}

function safeReturnTo(value) {
  const candidate = String(value || '/').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '/';
  try {
    const parsed = new URL(candidate, 'https://media-hub.invalid');
    return parsed.origin === 'https://media-hub.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/';
  } catch { return '/'; }
}

module.exports = {
  DEFAULT_ROLE_MAPPING, VALID_ROLES, oidcSettings, parseRoleMapping,
  groupsFromClaims, roleForGroups, identityFromClaims, emailAllowed, safeReturnTo
};
