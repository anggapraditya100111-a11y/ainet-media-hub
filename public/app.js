const state = {
  user: null,
  permissions: new Set(),
  config: {},
  brands: [],
  channels: [],
  roleLabels: {},
  statusLabels: {},
  transitions: {},
  currentPage: 'dashboard',
  assignments: null
};

let popupLogin = null;

const $ = selector => document.querySelector(selector);
const page = $('#page');

function isAxindoIdUser(user) {
  const authSource = user?.authSource || user?.auth_source;
  return authSource === 'OIDC' || authSource === 'ACCESS';
}

const icons = {
  dashboard: '⌂', calendar: '▦', pipeline: '⌘', request: '＋', task: '✓',
  review: '◎', approval: '◆', upload: '↑', library: '▣', vendor: '◇',
  report: '▤', users: '♙', audit: '≡', settings: '⚙', backup: '↻', profile: '○',
  history: '↺', performance: '↗', progress: '◫'
};

const ROLE_MENUS = {
  SUPER_ADMIN: [
    ['Utama', 'dashboard', 'Dashboard', 'dashboard'], ['Utama', 'calendar', 'Kalender Konten', 'calendar'],
    ['Konten', 'pipeline', 'Pipeline Konten', 'pipeline'], ['Konten', 'requests', 'Permintaan Konten', 'request'],
    ['Konten', 'review-queue', 'Review Hasil', 'review'], ['Konten', 'approval-queue', 'Approval Direksi', 'approval'],
    ['Konten', 'ready', 'Siap Tayang', 'upload'], ['Sumber Daya', 'library', 'Media Library', 'library'],
    ['Sumber Daya', 'vendors', 'Vendor', 'vendor'], ['Analitik', 'reports', 'Laporan & Performa', 'report'],
    ['Administrasi', 'users', 'Pengguna & Akses', 'users'], ['Administrasi', 'audit', 'Audit Log', 'audit'],
    ['Administrasi', 'settings', 'Pengaturan', 'settings'], ['Administrasi', 'backups', 'Backup Data', 'backup'],
    ['Akun', 'profile', 'Profil & Password', 'profile']
  ],
  COORDINATOR: [
    ['Utama', 'dashboard', 'Dashboard', 'dashboard'], ['Utama', 'calendar', 'Kalender Konten', 'calendar'],
    ['Konten', 'pipeline', 'Pipeline Konten', 'pipeline'], ['Konten', 'requests', 'Permintaan Konten', 'request'],
    ['Konten', 'review-queue', 'Review Hasil', 'review'], ['Konten', 'approval-queue', 'Approval Direksi', 'approval'], ['Konten', 'ready', 'Siap Tayang', 'upload'],
    ['Sumber Daya', 'library', 'Media Library', 'library'], ['Sumber Daya', 'vendors', 'Vendor', 'vendor'],
    ['Analitik', 'reports', 'Laporan', 'report'], ['Akun', 'profile', 'Profil & Password', 'profile']
  ],
  VENDOR: [
    ['Utama', 'dashboard', 'Dashboard', 'dashboard'], ['Konten', 'my-tasks', 'Tugas Saya', 'task'],
    ['Konten', 'calendar', 'Jadwal', 'calendar'], ['Konten', 'revisions', 'Permintaan Revisi', 'review'],
    ['Sumber Daya', 'library', 'Media Library', 'library'], ['Riwayat', 'content-history', 'Riwayat Tugas', 'history'],
    ['Akun', 'profile', 'Profil', 'profile']
  ],
  UPLOADER: [
    ['Utama', 'dashboard', 'Dashboard', 'dashboard'], ['Konten', 'ready', 'Konten Siap Tayang', 'upload'],
    ['Konten', 'calendar', 'Jadwal Upload', 'calendar'], ['Riwayat', 'publication-history', 'Riwayat Publikasi', 'history'],
    ['Sumber Daya', 'library', 'Media Library', 'library'], ['Akun', 'profile', 'Profil', 'profile']
  ],
  MANAGEMENT: [
    ['Utama', 'dashboard', 'Dashboard Executive', 'dashboard'], ['Utama', 'calendar', 'Kalender', 'calendar'],
    ['Konten', 'approval-queue', 'Approval Saya', 'approval'], ['Konten', 'progress', 'Ringkasan Progres', 'progress'], ['Analitik', 'reports', 'Performa Konten', 'performance'],
    ['Analitik', 'vendors', 'Kinerja Vendor', 'vendor'], ['Sumber Daya', 'library', 'Media Library', 'library'],
    ['Akun', 'profile', 'Profil', 'profile']
  ]
};

const PAGE_META = {
  dashboard: ['Dashboard', 'Ringkasan kerja media'], calendar: ['Kalender Konten', 'Rencana publikasi'],
  pipeline: ['Pipeline Konten', 'Alur produksi end-to-end'], requests: ['Permintaan Konten', 'Ide dan brief'],
  'my-tasks': ['Tugas Saya', 'Produksi vendor'], revisions: ['Permintaan Revisi', 'Perbaikan yang harus dikerjakan'],
  'review-queue': ['Review Hasil', 'Pemeriksaan hasil produksi oleh Koordinator'], 'review-history': ['Riwayat Review', 'Jejak pemeriksaan'],
  'approval-queue': ['Approval Direksi', 'Persetujuan final melalui link dan PIN'], 'approval-history': ['Riwayat Persetujuan', 'Jejak keputusan'],
  ready: ['Konten Siap Tayang', 'Penjadwalan dan publikasi'], 'publication-history': ['Riwayat Publikasi', 'Bukti konten tayang'],
  'content-history': ['Riwayat Tugas', 'Arsip pekerjaan vendor'], progress: ['Ringkasan Progres', 'Pemantauan seluruh pekerjaan'],
  library: ['Media Library', 'Logo, brosur, template, foto, dan materi resmi'], vendors: ['Vendor', 'Mitra produksi konten'],
  reports: ['Laporan & Performa', 'Output, SLA, engagement, leads, dan biaya'], users: ['Pengguna & Akses', 'Role dan akun'],
  audit: ['Audit Log', 'Riwayat aktivitas sistem'], settings: ['Pengaturan', 'Branding dan konfigurasi'],
  backups: ['Backup Data', 'Salinan database sistem'], profile: ['Profil & Password', 'Keamanan akun']
};

document.addEventListener('DOMContentLoaded', init);
$('#login-form').addEventListener('submit', login);
$('#oidc-login-button').addEventListener('click', startAccessPopupLogin);
$('#local-login-toggle').addEventListener('click', () => setLocalLoginVisible(true));
$('#logout-button').addEventListener('click', logout);
$('#menu-toggle').addEventListener('click', () => document.body.classList.add('nav-open'));
$('#nav-close').addEventListener('click', closeNavigation);
$('#nav-backdrop').addEventListener('click', closeNavigation);
$('#theme-toggle').addEventListener('click', toggleTheme);
$('#notifications-button').addEventListener('click', showNotifications);
document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeModal));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
window.addEventListener('message', handlePopupLoginMessage);

async function init() {
  applySavedTheme();
  setLoading(true);
  try {
    const config = await api('/api/public/config');
    applyConfig(config);
    configureLogin(config.auth);
    const redirectedHandoff = await completeRedirectedAccessHandoff();
    await bootstrap();
    showApp();
    await openPage('dashboard');
    if (redirectedHandoff) {
      toast('Login AXINDO ID berhasil.');
      window.setTimeout(() => window.close(), 500);
    }
  } catch (error) {
    if (error.status !== 401) toast(error.message, true);
    showLogin();
  } finally {
    showSsoError();
    setLoading(false);
  }
}

async function api(url, options = {}) {
  const request = { method: options.method || 'GET', headers: { ...(options.headers || {}) }, credentials: 'same-origin' };
  if (options.body instanceof FormData) request.body = options.body;
  else if (options.body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, request);
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(payload?.error || `Permintaan gagal (${response.status}).`);
    error.status = response.status;
    if (response.status === 401) showLogin();
    throw error;
  }
  return payload;
}

async function login(event) {
  event.preventDefault();
  setLoading(true);
  try {
    await api('/api/auth/login', { method: 'POST', body: { username: $('#login-username').value, password: $('#login-password').value } });
    $('#login-password').value = '';
    await bootstrap();
    showApp();
    await openPage('dashboard');
  } catch (error) { toast(error.message, true); }
  finally { setLoading(false); }
}

async function logout() {
  setLoading(true);
  let result = null;
  try { result = await api('/api/auth/logout', { method: 'POST' }); } catch {}
  state.user = null;
  if (result?.logoutUrl) {
    window.location.assign(result.logoutUrl);
    return;
  }
  showLogin();
  setLoading(false);
}

function configureLogin(auth = {}) {
  const oidcEnabled = Boolean(auth.oidcEnabled);
  const oidcReady = Boolean(auth.accessHandoffReady);
  const localEnabled = auth.localLoginEnabled !== false;
  const oidcArea = $('#oidc-login');
  const oidcButton = $('#oidc-login-button');
  oidcArea.hidden = !oidcEnabled;
  oidcButton.classList.toggle('disabled', !oidcReady);
  oidcButton.setAttribute('aria-disabled', String(!oidcReady));
  oidcButton.disabled = !oidcReady;
  $('#local-login-toggle').hidden = !localEnabled;
  $('#local-login-note').hidden = !oidcEnabled;
  $('#login-description').textContent = oidcEnabled
    ? 'Pengguna internal masuk melalui popup AXINDO Access. Super Admin dan Vendor dapat memakai Login Personal.'
    : 'Gunakan username dan password akun yang diberikan.';
  $('#popup-login-status').textContent = oidcReady
    ? `Login aman melalui ${new URL(auth.accessPortalUrl || 'https://akses.axindo.my.id').hostname}.`
    : 'Konfigurasi AXINDO ID pada server belum lengkap.';
  setLocalLoginVisible(!oidcEnabled && localEnabled || oidcEnabled && !oidcReady && localEnabled);
}

function randomPopupChannel() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return `mh_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function randomPopupVerifier() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function popupCodeChallenge(verifier) {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function accessHandoffStorageKey(channel) {
  return `media-hub-handoff:${channel}`;
}

async function completeRedirectedAccessHandoff() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (params.get('access_handoff') !== '1') return null;

  const channel = String(params.get('channel') || '');
  const code = String(params.get('code') || '');
  const verifier = sessionStorage.getItem(accessHandoffStorageKey(channel)) || '';
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  if (!/^mh_[a-f0-9]{48}$/.test(channel)
    || !/^[a-zA-Z0-9_-]{40,200}$/.test(code)
    || !/^[a-zA-Z0-9_-]{43,128}$/.test(verifier)) {
    throw new Error('Kode login dari AXINDO Access tidak valid atau sudah kedaluwarsa.');
  }

  await api('/api/auth/access/complete', { method: 'POST', body: { code, verifier } });
  sessionStorage.removeItem(accessHandoffStorageKey(channel));
  return { channel };
}

async function startAccessPopupLogin() {
  const auth = state.config.auth || {};
  if (!auth.accessHandoffReady) return toast('Koneksi AXINDO Access pada server belum aktif.', true);
  if (popupLogin?.window && !popupLogin.window.closed) {
    popupLogin.window.focus();
    return;
  }

  const channel = randomPopupChannel();
  const verifier = randomPopupVerifier();
  sessionStorage.setItem(accessHandoffStorageKey(channel), verifier);
  const width = Math.min(470, Math.max(360, window.screen.availWidth - 24));
  const height = Math.min(760, Math.max(600, window.screen.availHeight - 48));
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const popup = window.open(
    'about:blank',
    channel,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
  if (!popup) {
    sessionStorage.removeItem(accessHandoffStorageKey(channel));
    return toast('Popup diblokir browser. Izinkan popup untuk Media Hub lalu coba kembali.', true);
  }

  popupLogin = {
    window: popup,
    channel,
    verifier,
    stage: 'preparing',
    accessOrigin: auth.accessPortalOrigin || new URL(auth.accessPortalUrl || 'https://akses.axindo.my.id').origin,
    monitor: window.setInterval(() => {
      const active = popupLogin;
      if (!active || !popup.closed) {
        if (active) active.closedAt = 0;
        return;
      }
      // AXINDO Access closes the popup after delivering its one-time code. Do
      // not cancel the in-flight backend exchange just because it is closed.
      if (active.stage === 'exchange') return;
      if (!active.closedAt) {
        active.closedAt = Date.now();
        return;
      }
      if (Date.now() - active.closedAt < 1500 || active.checkingSession) return;
      active.checkingSession = true;
      api('/api/bootstrap').then(() => finishPopupLogin(true)).catch(() => {
        if (popupLogin === active) finishPopupLogin(false, 'Popup login ditutup sebelum proses selesai.');
      });
    }, 250)
  };
  $('#oidc-login-button').disabled = true;
  $('#popup-login-status').textContent = 'Membuka AXINDO Access…';
  popup.focus();
  try {
    const accessUrl = new URL(auth.accessPortalPopupUrl || 'https://akses.axindo.my.id/handoff?handoff=media-hub');
    accessUrl.searchParams.set('handoff', 'media-hub');
    accessUrl.searchParams.set('channel', channel);
    accessUrl.searchParams.set('return_origin', window.location.origin);
    accessUrl.searchParams.set('code_challenge', await popupCodeChallenge(verifier));
    if (!popupLogin || popup.closed) return;
    popupLogin.stage = 'access';
    popup.location.replace(accessUrl.href);
    $('#popup-login-status').textContent = 'Menunggu login dari AXINDO Access…';
  } catch {
    finishPopupLogin(false, 'Popup AXINDO Access tidak dapat dibuka.');
  }
}

function handlePopupLoginMessage(event) {
  const active = popupLogin;
  if (!active || event.source !== active.window || event.data?.channel !== active.channel) return;

  if (active.stage === 'access') {
    if (event.origin !== active.accessOrigin || event.data?.type !== 'axindo-access-handoff') return;
    if (event.data.status !== 'success') return finishPopupLogin(false, event.data.message || 'Login AXINDO Access gagal.');
    if (!/^[a-zA-Z0-9_-]{40,200}$/.test(String(event.data.code || ''))) {
      return finishPopupLogin(false, 'Kode dari AXINDO Access tidak valid.');
    }
    active.stage = 'exchange';
    $('#popup-login-status').textContent = 'Membuat sesi Media Hub…';
    api('/api/auth/access/complete', {
      method: 'POST', body: { code: event.data.code, verifier: active.verifier }
    }).then(() => finishPopupLogin(true))
      .catch(error => finishPopupLogin(false, error.message || 'Login Media Hub gagal.'));
  }
}

async function finishPopupLogin(success, message = '') {
  const active = popupLogin;
  if (!active) return;
  popupLogin = null;
  window.clearInterval(active.monitor);
  sessionStorage.removeItem(accessHandoffStorageKey(active.channel));
  if (active.window && !active.window.closed) active.window.close();
  $('#oidc-login-button').disabled = !state.config.auth?.accessHandoffReady;

  if (!success) {
    $('#popup-login-status').textContent = 'Login belum berhasil. Silakan coba kembali.';
    if (message) toast(message, true);
    return;
  }

  setLoading(true);
  try {
    await bootstrap();
    showApp();
    await openPage('dashboard');
    toast('Login AXINDO ID berhasil.');
  } catch (error) {
    showLogin();
    toast(error.message || 'Sesi Media Hub belum terbentuk.', true);
  } finally {
    setLoading(false);
  }
}

function setLocalLoginVisible(visible) {
  const fields = $('#local-login-fields');
  const enabled = Boolean(visible);
  fields.hidden = !enabled;
  for (const input of fields.querySelectorAll('input')) {
    input.disabled = !enabled;
    input.required = enabled;
  }
  if (enabled && window.matchMedia('(min-width: 861px)').matches) $('#login-username').focus();
}

function showSsoError() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('sso_error');
  if (!code) return;
  const messages = {
    access_denied: 'Akun AXINDO ID belum memiliki grup akses Media Hub yang sesuai.',
    configuration: 'Konfigurasi AXINDO ID pada server belum lengkap.',
    provider_error: 'Login melalui AXINDO ID gagal. Silakan coba kembali atau hubungi administrator.'
  };
  url.searchParams.delete('sso_error');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  toast(messages[code] || messages.provider_error, true);
}

async function bootstrap() {
  const data = await api('/api/bootstrap');
  state.user = data.user;
  state.permissions = new Set(data.permissions || []);
  state.config = data.config;
  state.brands = data.brands || [];
  state.channels = data.channels || [];
  state.roleLabels = data.roleLabels || {};
  state.statusLabels = data.statusLabels || {};
  state.transitions = data.transitions || {};
  state.assignments = null;
  applyConfig(data.config);
  $('#user-name').textContent = state.user.name;
  $('#user-role').textContent = state.roleLabels[state.user.role] || state.user.role;
  $('#user-avatar').textContent = initials(state.user.name);
  $('#version-label').textContent = `Versi ${data.config.appVersion}`;
  updateNotificationCount(data.unreadNotifications);
  renderNavigation();
}

function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  closeNavigation();
  $('#mobile-navigation').innerHTML = '';
}

function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
}

function applyConfig(config = {}) {
  state.config = { ...state.config, ...config };
  document.title = state.config.appName || 'AXINDO Media Hub';
  document.documentElement.style.setProperty('--primary', state.config.primaryColor || '#2563eb');
  document.documentElement.style.setProperty('--secondary', state.config.secondaryColor || '#f97316');
  if (state.config.logoUrl) {
    $('#brand-mark').innerHTML = `<img src="${escapeHtml(state.config.logoUrl)}" alt="Logo">`;
  }
}

function renderNavigation() {
  const menu = ROLE_MENUS[state.user.role] || ROLE_MENUS.VENDOR;
  const groups = new Map();
  for (const item of menu) {
    if (!groups.has(item[0])) groups.set(item[0], []);
    groups.get(item[0]).push(item);
  }
  $('#navigation').innerHTML = [...groups.entries()].map(([group, items]) => `
    <section class="nav-group"><span class="nav-group-title">${escapeHtml(group)}</span>
      ${items.map(([, id, label, icon]) => `<button class="nav-btn ${state.currentPage === id ? 'active' : ''}" data-page="${id}">
        <span class="nav-icon">${icons[icon] || '•'}</span><span>${escapeHtml(label)}</span>
      </button>`).join('')}
    </section>`).join('');
  $('#navigation').querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => openPage(button.dataset.page)));
  renderMobileNavigation(menu);
}

function renderMobileNavigation(menu) {
  const primaryByRole = {
    SUPER_ADMIN: 'pipeline', COORDINATOR: 'pipeline', VENDOR: 'my-tasks', REVIEWER: 'review-queue',
    APPROVER: 'approval-queue', UPLOADER: 'ready', MANAGEMENT: 'reports'
  };
  const preferred = ['dashboard', primaryByRole[state.user.role], 'calendar', 'library'].filter(Boolean);
  const items = preferred.map(id => menu.find(item => item[1] === id)).filter(Boolean)
    .filter((item, index, all) => all.findIndex(candidate => candidate[1] === item[1]) === index);
  const shortLabels = {
    dashboard: 'Beranda', pipeline: 'Pipeline', 'my-tasks': 'Tugas', 'review-queue': 'Review',
    'approval-queue': 'Approval', ready: 'Tayang', reports: 'Laporan', calendar: 'Kalender', library: 'Library'
  };
  const nav = $('#mobile-navigation');
  nav.innerHTML = `${items.map(([, id, label, icon]) => `
    <button class="mobile-nav-btn ${state.currentPage === id ? 'active' : ''}" data-mobile-page="${id}">
      <span>${icons[icon] || '•'}</span><small>${shortLabels[id] || label}</small>
    </button>`).join('')}
    <button class="mobile-nav-btn" data-mobile-menu="true"><span>☰</span><small>Menu</small></button>`;
  nav.querySelectorAll('[data-mobile-page]').forEach(button => button.addEventListener('click', () => openPage(button.dataset.mobilePage)));
  nav.querySelector('[data-mobile-menu]')?.addEventListener('click', () => document.body.classList.add('nav-open'));
}

async function openPage(pageId) {
  state.currentPage = pageId;
  renderNavigation();
  closeNavigation();
  const [title, eyebrow] = PAGE_META[pageId] || [pageId, 'Media Hub'];
  $('#page-title').textContent = title;
  $('#page-eyebrow').textContent = eyebrow;
  setLoading(true);
  try {
    const renderer = {
      dashboard: renderDashboard, calendar: renderCalendar, pipeline: renderPipeline,
      requests: () => renderContentList({ title: 'Permintaan dan Produksi', description: 'Kelola seluruh konten dari permintaan hingga tayang.', create: true }),
      'my-tasks': () => renderContentList({ title: 'Tugas Saya', description: 'Konten aktif yang ditugaskan kepada vendor Anda.', statuses: activeStatuses() }),
      revisions: () => renderContentList({ title: 'Permintaan Revisi', description: 'Draft yang harus diperbaiki.', statuses: ['REVISION_REQUIRED'] }),
      'review-queue': () => renderContentList({ title: 'Review Hasil', description: 'Hasil akhir vendor yang menunggu keputusan Koordinator.', statuses: ['DRAFT_SUBMITTED', 'IN_REVIEW'] }),
      'review-history': () => renderContentList({ title: 'Riwayat Review', description: 'Konten yang sudah melewati pemeriksaan.', statuses: ['APPROVAL_PENDING', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REVISION_REQUIRED'] }),
      'approval-queue': () => renderContentList({ title: 'Approval Direksi', description: 'Konten yang sedang menunggu keputusan Direksi.', statuses: ['APPROVAL_PENDING'] }),
      'approval-history': () => renderContentList({ title: 'Riwayat Persetujuan', description: 'Keputusan approval sebelumnya.', statuses: ['APPROVED', 'SCHEDULED', 'PUBLISHED', 'REVISION_REQUIRED'] }),
      ready: () => renderContentList({ title: 'Siap Tayang', description: 'Konten disetujui untuk dijadwalkan dan dipublikasikan.', statuses: ['APPROVED', 'SCHEDULED'] }),
      'publication-history': () => renderContentList({ title: 'Riwayat Publikasi', description: 'Konten yang sudah tayang beserta bukti.', statuses: ['PUBLISHED'] }),
      'content-history': () => renderContentList({ title: 'Riwayat Tugas', description: 'Tugas yang sudah selesai atau dibatalkan.', statuses: ['PUBLISHED', 'CANCELLED'] }),
      progress: () => renderContentList({ title: 'Ringkasan Progres', description: 'Status seluruh pekerjaan media.' }),
      library: renderLibrary, vendors: renderVendors, reports: renderReports,
      users: renderUsers, audit: renderAudit, settings: renderSettings,
      backups: renderBackups, profile: renderProfile
    }[pageId];
    if (!renderer) throw new Error('Halaman belum tersedia.');
    await renderer();
  } catch (error) {
    page.innerHTML = errorState(error.message);
    toast(error.message, true);
  } finally { setLoading(false); }
}

function activeStatuses() {
  return ['REQUESTED', 'BRIEFED', 'ASSIGNED', 'IN_PRODUCTION', 'DRAFT_SUBMITTED', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVAL_PENDING', 'APPROVED', 'SCHEDULED'];
}

async function renderDashboard() {
  const data = await api('/api/dashboard');
  const metricCards = [
    ['Total Konten', data.metrics.total, 'pipeline', ''],
    ['Dalam Produksi', data.metrics.production, 'task', 'purple'],
    ['Review & Revisi', data.metrics.review, 'review', 'orange'],
    ['Menunggu Approval', data.metrics.approval, 'approval', 'orange'],
    ['Siap Tayang', data.metrics.ready, 'upload', 'green'],
    ['Terlambat', data.metrics.overdue, 'history', 'red']
  ];
  const maxPipeline = Math.max(1, ...data.pipeline.map(item => item.count));
  page.innerHTML = `
    <div class="page-head"><div><h2>Halo, ${escapeHtml(firstName(state.user.name))}</h2><p>${dashboardGreeting()}</p></div>
      ${has('content.create') ? '<button id="dashboard-create" class="btn btn-primary">＋ Buat Permintaan</button>' : ''}</div>
    ${state.user.mustChangePassword && !isAxindoIdUser(state.user) ? '<div class="notice warn" style="margin-bottom:16px">Password akun ini masih merupakan password awal. Ubah melalui menu Profil & Password.</div>' : ''}
    ${state.user.role === 'VENDOR' && !state.user.vendorId ? '<div class="notice warn" style="margin-bottom:16px">Akun Vendor Anda belum dipasangkan dengan data vendor. Hubungi Super Admin agar tugas produksi dapat ditampilkan.</div>' : ''}
    <div class="grid-3">${metricCards.map(([label, value, icon, tone]) => `<article class="card metric ${tone}"><div class="metric-icon">${icons[icon]}</div><span>${label}</span><strong>${number(value)}</strong></article>`).join('')}</div>
    <div class="grid-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h3>Komposisi Pipeline</h3><button class="btn btn-ghost btn-small" data-go="pipeline">Buka Pipeline</button></div><div class="card-body bar-chart">
        ${data.pipeline.length ? data.pipeline.map(item => `<div class="bar-row"><span>${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, item.count * 100 / maxPipeline)}%"></div></div><strong>${number(item.count)}</strong></div>`).join('') : emptyInline('Belum ada data')}
      </div></section>
      <section class="card"><div class="card-head"><h3>Deadline Terdekat</h3><button class="btn btn-ghost btn-small" data-go="calendar">Lihat Kalender</button></div><div class="card-body">
        ${data.upcoming.length ? `<div class="calendar-list">${data.upcoming.slice(0, 5).map(contentMiniRow).join('')}</div>` : emptyInline('Belum ada deadline aktif')}
      </div></section>
    </div>`;
  $('#dashboard-create')?.addEventListener('click', () => showContentForm());
  page.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => openPage(button.dataset.go)));
  bindContentOpeners(page);
}

function dashboardGreeting() {
  const messages = {
    SUPER_ADMIN: 'Pantau operasional konten, akses pengguna, aset, dan audit dari satu tempat.',
    COORDINATOR: 'Prioritaskan pekerjaan, arahkan vendor, dan jaga jadwal publikasi.',
    VENDOR: 'Lihat tugas produksi, referensi resmi, serta catatan revisi terbaru.',
    UPLOADER: 'Publikasikan hanya konten yang telah disetujui dan simpan bukti tayang.',
    MANAGEMENT: 'Buka approval yang ditugaskan atau lihat progres dan dampak konten.'
  };
  return messages[state.user.role] || 'Selamat bekerja.';
}

async function renderPipeline() {
  const data = await api('/api/contents?limit=250');
  const columns = [
    ['Perencanaan', ['REQUESTED', 'BRIEFED']],
    ['Produksi', ['ASSIGNED', 'IN_PRODUCTION']],
    ['Review', ['DRAFT_SUBMITTED', 'IN_REVIEW', 'REVISION_REQUIRED']],
    ['Persetujuan', ['APPROVAL_PENDING', 'APPROVED']],
    ['Publikasi', ['SCHEDULED', 'PUBLISHED']]
  ];
  page.innerHTML = `<div class="page-head"><div><h2>Pipeline Konten</h2><p>Status pekerjaan tersusun sesuai alur pada konsep Media Hub.</p></div>${has('content.create') ? '<button id="pipeline-create" class="btn btn-primary">＋ Buat Permintaan</button>' : ''}</div>
    <div class="pipeline">${columns.map(([title, statuses]) => {
      const items = data.items.filter(item => statuses.includes(item.status));
      return `<section class="pipeline-column"><div class="pipeline-head"><strong>${title}</strong><span>${items.length}</span></div>
        ${items.map(pipelineCard).join('') || emptyInline('Kosong')}</section>`;
    }).join('')}</div>`;
  $('#pipeline-create')?.addEventListener('click', () => showContentForm());
  bindContentOpeners(page);
}

async function renderContentList(options = {}) {
  const params = new URLSearchParams({ limit: '250' });
  if (options.statuses?.length) params.set('status', options.statuses.join(','));
  const data = await api(`/api/contents?${params}`);
  page.innerHTML = `
    <div class="page-head"><div><h2>${escapeHtml(options.title || 'Konten')}</h2><p>${escapeHtml(options.description || '')}</p></div>
      ${options.create && has('content.create') ? '<button id="content-create" class="btn btn-primary">＋ Buat Permintaan</button>' : ''}</div>
    <form id="content-filter" class="card toolbar">
      <label class="field search-field"><span>Cari</span><input name="q" placeholder="Nomor, judul, atau kampanye"></label>
      <label class="field"><span>Brand</span><select name="brandId"><option value="">Semua brand</option>${brandOptions()}</select></label>
      <label class="field"><span>Status</span><select name="status"><option value="">Semua status</option>${statusOptions(options.statuses)}</select></label>
      <button class="btn btn-ghost" type="submit">Terapkan</button>
    </form>
    <section id="content-results" class="card">${contentTable(data.items)}</section>`;
  $('#content-create')?.addEventListener('click', () => showContentForm());
  $('#content-filter').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      const query = new URLSearchParams({ limit: '250' });
      if (form.get('q')) query.set('q', form.get('q'));
      if (form.get('brandId')) query.set('brandId', form.get('brandId'));
      if (form.get('status')) query.set('status', form.get('status'));
      else if (options.statuses?.length) query.set('status', options.statuses.join(','));
      const result = await api(`/api/contents?${query}`);
      $('#content-results').innerHTML = contentTable(result.items);
      bindContentOpeners($('#content-results'));
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
  bindContentOpeners(page);
}

async function renderCalendar() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const from = dateInput(first);
  const to = dateInput(last);
  const data = await api(`/api/calendar?from=${from}&to=${to}`);
  page.innerHTML = `<div class="page-head"><div><h2>Kalender Konten</h2><p>Deadline dan jadwal publikasi dua bulan ke depan.</p></div></div>
    <form id="calendar-filter" class="card toolbar"><label class="field"><span>Dari</span><input type="date" name="from" value="${from}"></label><label class="field"><span>Sampai</span><input type="date" name="to" value="${to}"></label><button class="btn btn-primary" type="submit">Tampilkan</button></form>
    <section id="calendar-results" class="calendar-list">${calendarRows(data.items)}</section>`;
  $('#calendar-filter').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      const result = await api(`/api/calendar?from=${encodeURIComponent(form.get('from'))}&to=${encodeURIComponent(form.get('to'))}`);
      $('#calendar-results').innerHTML = calendarRows(result.items);
      bindContentOpeners($('#calendar-results'));
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
  bindContentOpeners(page);
}

async function loadAssignments() {
  if (!state.assignments) state.assignments = await api('/api/meta/assignments');
  return state.assignments;
}

async function showContentForm(existing = null) {
  try {
    const assignments = await loadAssignments();
    const selectedChannels = new Set(existing?.channelIds || []);
    const selectedVendorPermissions = new Set(existing?.vendorEditPermissions || []);
    openModal(existing ? 'Edit Konten' : 'Buat Permintaan Konten', `
      <form id="content-form">
        <section class="form-section"><h3>Identitas Konten</h3><div class="form-grid">
          <label class="field full"><span>Judul *</span><input name="title" maxlength="200" required value="${attr(existing?.title)}" placeholder="Contoh: Promo Internet Keluarga September"></label>
          <label class="field"><span>Brand *</span><select name="brandId" required><option value="">Pilih brand</option>${brandOptions(existing?.brand_id)}</select></label>
          <label class="field"><span>Kampanye</span><input name="campaign" maxlength="150" value="${attr(existing?.campaign)}" placeholder="Nama kampanye"></label>
          <label class="field"><span>Kategori</span><select name="category">${optionsHtml([
            ['EDUCATION','Edukasi'],['PROMOTION','Promosi'],['INFORMATION','Informasi'],['ENGAGEMENT','Engagement'],['CORPORATE','Korporat'],['EVENT','Event']
          ], existing?.category || 'EDUCATION')}</select></label>
          <label class="field"><span>Format</span><select name="contentType">${optionsHtml([
            ['SOCIAL_POST','Social Post'],['CAROUSEL','Carousel'],['REELS','Reels / Short Video'],['STORY','Story'],['LONG_VIDEO','Video Panjang'],['BANNER','Banner'],['ARTICLE','Artikel'],['WHATSAPP','WhatsApp Broadcast']
          ], existing?.content_type || 'SOCIAL_POST')}</select></label>
          <label class="field"><span>Prioritas</span><select name="priority">${optionsHtml([['LOW','Rendah'],['NORMAL','Normal'],['HIGH','Tinggi'],['URGENT','Mendesak']], existing?.priority || 'NORMAL')}</select></label>
          <label class="field"><span>Tingkat Persetujuan</span><select name="approvalLevel">${optionsHtml([['REGULAR','Rutin'],['SENSITIVE','Sensitif — harga, klaim, pernyataan']], existing?.approval_level || 'REGULAR')}</select></label>
          <div class="field full"><span>Channel *</span><div class="check-row">${state.channels.map(channel => `<label class="check"><input type="checkbox" name="channelIds" value="${attr(channel.id)}" ${selectedChannels.has(channel.id) ? 'checked' : ''}>${escapeHtml(channel.name)}</label>`).join('')}</div></div>
        </div></section>
        <section class="form-section"><h3>Tujuan & Brief</h3><div class="form-grid">
          <label class="field"><span>Tujuan</span><textarea name="objective" maxlength="1000" placeholder="Apa yang ingin dicapai?">${escapeHtml(existing?.objective || '')}</textarea></label>
          <label class="field"><span>Target Audiens</span><textarea name="audience" maxlength="1000" placeholder="Siapa audiens utama?">${escapeHtml(existing?.audience || '')}</textarea></label>
          <label class="field full"><span>Brief Produksi</span><textarea name="brief" maxlength="5000" placeholder="Pesan utama, struktur materi, referensi, batasan...">${escapeHtml(existing?.brief || '')}</textarea></label>
          <label class="field full"><span>Deskripsi</span><textarea name="description" maxlength="2000">${escapeHtml(existing?.description || '')}</textarea></label>
          <label class="field full"><span>Draft Caption</span><textarea name="caption" maxlength="5000">${escapeHtml(existing?.caption || '')}</textarea></label>
          <label class="field"><span>Hashtag</span><input name="hashtags" maxlength="1000" value="${attr(existing?.hashtags)}"></label>
          <label class="field"><span>Call to Action</span><input name="callToAction" maxlength="1000" value="${attr(existing?.call_to_action)}"></label>
        </div></section>
        <section class="form-section"><h3>Referensi Konten</h3><div class="form-grid">
          <label class="field full"><span>Link sosial media / web</span><textarea name="referenceUrls" maxlength="10000" placeholder="Satu link per baris, contoh:\nhttps://www.instagram.com/...\nhttps://contoh.com/artikel">${escapeHtml((existing?.referenceUrls || []).join('\n'))}</textarea><small>Maksimal 10 link HTTP/HTTPS.</small></label>
          <label class="field full"><span>Upload gambar, video, atau PDF</span><input type="file" name="referenceFiles" multiple accept="image/*,video/*,.pdf"><small>File disimpan sebagai lampiran Brief dan dapat dilihat vendor yang ditugaskan.</small></label>
        </div><div id="upload-progress" class="upload-progress" hidden><div><span></span></div><p>Menyiapkan upload referensi…</p></div></section>
        <section class="form-section"><h3>Akses Edit Vendor</h3>
          <div class="notice">Vendor hanya dapat menambahkan usulan. Tulisan Koordinator tidak dapat dihapus dan perubahan baru aktif setelah diterima Koordinator.</div>
          <div class="check-row" style="margin-top:14px">${[
            ['brief','Brief Produksi'],['description','Deskripsi'],['caption','Draft Caption'],['hashtags','Hashtag'],['call_to_action','Call to Action'],['attachments','Upload Lampiran Brief']
          ].map(([value, label]) => `<label class="check"><input type="checkbox" name="vendorEditPermissions" value="${value}" ${selectedVendorPermissions.has(value) ? 'checked' : ''}>${label}</label>`).join('')}</div>
        </section>
        <section class="form-section"><h3>Deadline & Penanggung Jawab</h3><div class="form-grid">
          <label class="field"><span>Deadline Produksi</span><input type="date" name="dueDate" value="${attr(existing?.due_date)}"></label>
          <label class="field"><span>Rencana Tayang</span><input type="datetime-local" name="publishAt" value="${attr(toLocalDateTime(existing?.publish_at))}"></label>
          <label class="field"><span>Anggaran Konten (Rp)</span><input type="number" min="0" step="1000" name="budget" value="${attr(existing?.budget || 0)}"></label>
          <label class="field"><span>Vendor</span><select name="vendorId"><option value="">Belum ditentukan</option>${assignments.vendors.map(v => `<option value="${attr(v.id)}" ${v.id === existing?.vendor_id ? 'selected' : ''}>${escapeHtml(v.name)}</option>`).join('')}</select></label>
          ${assignmentSelect('coordinatorId', 'Koordinator', 'COORDINATOR', existing?.coordinator_id, assignments.users)}
          <label class="field full"><span>Catatan Internal</span><textarea name="internalNotes" maxlength="2000">${escapeHtml(existing?.internal_notes || '')}</textarea></label>
        </div></section>
        <div class="form-actions"><button class="btn btn-ghost" type="button" data-close-modal>Batal</button><button class="btn btn-primary" type="submit">${existing ? 'Simpan Perubahan' : 'Buat Permintaan'}</button></div>
      </form>`, existing ? existing.content_no : 'Workflow terarah');
    $('#content-form').querySelector('[data-close-modal]').addEventListener('click', closeModal);
    $('#content-form').addEventListener('submit', async event => {
      event.preventDefault(); setLoading(true);
      try {
        const form = new FormData(event.currentTarget);
        const body = {};
        for (const [key, value] of form.entries()) if (!['channelIds', 'referenceFiles', 'vendorEditPermissions'].includes(key)) body[key] = value;
        body.channelIds = form.getAll('channelIds');
        body.vendorEditPermissions = form.getAll('vendorEditPermissions');
        if (!body.channelIds.length) throw new Error('Pilih minimal satu channel.');
        const result = await api(existing ? `/api/contents/${existing.id}` : '/api/contents', { method: existing ? 'PATCH' : 'POST', body });
        const contentId = existing?.id || result.item.id;
        const referenceFiles = form.getAll('referenceFiles').filter(file => file instanceof File && file.size);
        let uploadError = null;
        for (const file of referenceFiles) {
          try { await uploadCollaborativeFile(contentId, 'BRIEF', file, 'Referensi permintaan konten'); }
          catch (error) { uploadError = error; break; }
        }
        closeModal();
        toast(uploadError ? `Konten tersimpan, tetapi upload referensi gagal: ${uploadError.message}` : result.reopenedReview ? 'Perubahan disimpan dan review dibuka kembali.' : existing ? 'Konten diperbarui.' : 'Permintaan konten dibuat.', Boolean(uploadError));
        if (existing) await showContentDetail(existing.id); else if (referenceFiles.length) await showContentDetail(contentId); else await openPage(state.currentPage);
      } catch (error) { toast(error.message, true); }
      finally { setLoading(false); }
    });
  } catch (error) { toast(error.message, true); }
}

function assignmentSelect(name, label, role, selected, users) {
  const rows = users.filter(user => user.role === role);
  return `<label class="field"><span>${escapeHtml(label)}</span><select name="${name}"><option value="">Belum ditentukan</option>${rows.map(user => `<option value="${attr(user.id)}" ${user.id === selected ? 'selected' : ''}>${escapeHtml(user.name)}</option>`).join('')}</select></label>`;
}

async function showContentDetail(id) {
  setLoading(true);
  try {
    const data = await api(`/api/contents/${encodeURIComponent(id)}`);
    const item = data.item;
    const actions = contentActions(item);
    openModal('Detail Konten', `
      <section class="card detail-hero">
        <div class="actions"><span class="brand-chip" style="background:${safeColor(item.brand_color)}">${escapeHtml(item.brand_code)}</span>${statusHtml(item.status)}${priorityHtml(item.priority)}</div>
        <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content_no)} · ${escapeHtml(item.channels.join(', ') || 'Belum ada channel')}</p>
      </section>
      ${actions ? `<div class="actions" style="margin:16px 0">${actions}</div>` : ''}
      <div class="detail-grid">
        <div>
          <section class="card detail-section"><h3>Brief & Materi</h3>
            <dl class="detail-list">
              ${detailItem('Tujuan', item.objective)}${detailItem('Audiens', item.audience)}
              ${detailItem('Kampanye', item.campaign)}${detailItem('Format', labelize(item.content_type))}
              ${detailItem('Tingkat Persetujuan', item.approval_level === 'SENSITIVE' ? 'Sensitif' : 'Rutin')}${detailItem('Anggaran', rupiah(item.budget))}
            </dl>
            <h3 style="margin-top:20px">Brief Produksi</h3>${vendorEditBadge(data, 'brief')}<div class="rich-text muted">${escapeHtml(item.brief || 'Belum diisi.')}</div>
            <h3 style="margin-top:20px">Deskripsi Produksi</h3>${vendorEditBadge(data, 'description')}<div class="rich-text muted">${escapeHtml(item.description || 'Belum diisi.')}</div>
            <h3 style="margin-top:20px">Caption</h3>${vendorEditBadge(data, 'caption')}<div class="rich-text muted">${escapeHtml(item.caption || 'Belum diisi.')}</div>
            <h3 style="margin-top:20px">Hashtag</h3>${vendorEditBadge(data, 'hashtags')}<div class="rich-text muted">${escapeHtml(item.hashtags || 'Belum diisi.')}</div>
            <h3 style="margin-top:20px">Call to Action</h3>${vendorEditBadge(data, 'call_to_action')}<div class="rich-text muted">${escapeHtml(item.call_to_action || 'Belum diisi.')}</div>
          </section>
          ${vendorEditReviewSection(data.vendorEdits || [])}
          <section class="card detail-section" style="margin-top:16px"><div class="card-head"><h3>Diskusi Produksi</h3><button class="btn btn-primary btn-small" data-content-action="discuss">＋ Pesan / File</button></div>
            ${(data.discussions || []).length ? `<div class="discussion-list">${data.discussions.map(message => `<article class="discussion-item"><div class="avatar">${escapeHtml(message.sender_name.slice(0, 1))}</div><div><strong>${escapeHtml(message.sender_name)}</strong><span class="tag">${phaseLabel(message.phase)}</span><p>${escapeHtml(message.message || '')}</p><small>${dateTime(message.created_at)}</small></div></article>`).join('')}</div>` : emptyInline('Belum ada diskusi. Koordinator dan vendor dapat membahas script, storyboard, materi, serta revisi di sini.')}
          </section>
          <section class="card detail-section" style="margin-top:16px"><h3>Lampiran & Hasil Produksi</h3>
            ${(data.collaborationFiles || []).length ? `<div class="file-grid">${data.collaborationFiles.map(file => `<article class="file-card"><div class="file-icon">${fileIcon(file.mime_type)}</div><div><span class="tag">${phaseLabel(file.phase)} · v${file.version_number}</span><strong>${escapeHtml(file.original_name)}</strong><small>${fileSize(file.file_size)} · ${escapeHtml(file.uploaded_by_name)}</small></div><div class="actions"><a class="btn btn-ghost btn-small" href="${attr(file.fileUrl)}" target="_blank" rel="noopener">Buka</a><a class="btn btn-ghost btn-small" href="${attr(file.fileUrl)}?download=1">Unduh</a></div></article>`).join('')}</div>` : emptyInline('Belum ada lampiran brief, draft pra-produksi, atau hasil produksi.')}
          </section>
          <section class="card detail-section" style="margin-top:16px"><h3>Versi Lama</h3>
            ${data.versions.length ? `<div class="table-wrap"><table><thead><tr><th>Versi</th><th>Berkas</th><th>Pengirim</th><th>Waktu</th><th></th></tr></thead><tbody>${data.versions.map(version => `<tr><td>v${version.version_number}${version.is_approved ? ' ✓' : ''}</td><td><span class="cell-title truncate">${escapeHtml(version.original_name)}</span><span class="cell-meta">${fileSize(version.file_size)}</span></td><td>${escapeHtml(version.submitted_by_name)}</td><td>${dateTime(version.created_at)}</td><td><a class="btn btn-ghost btn-small" href="${attr(version.fileUrl)}" target="_blank" rel="noopener">Buka</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Tidak ada file dari versi aplikasi lama.</p>'}
          </section>
          <section class="card detail-section" style="margin-top:16px"><h3>Jadwal Platform</h3>
            ${(data.schedules || []).length ? `<div class="schedule-list">${data.schedules.map(schedule => {
              const mayEdit = schedule.status === 'SCHEDULED' && (state.user.role === 'COORDINATOR' || state.user.role === 'SUPER_ADMIN');
              const mayPublish = schedule.status === 'SCHEDULED' && (state.user.role === 'SUPER_ADMIN' || schedule.uploader_id === state.user.id);
              return `<article class="schedule-row"><div><strong>${escapeHtml(schedule.channel_name)}</strong><span>${dateTime(schedule.scheduled_at)} · ${escapeHtml(schedule.uploader_name)}</span></div>${statusHtml(schedule.status)}${mayEdit || mayPublish ? `<div class="actions">${mayEdit ? `<button class="btn btn-ghost btn-small" data-edit-schedule="${attr(schedule.id)}">Edit Jadwal</button>` : ''}${mayPublish ? `<button class="btn btn-success btn-small" data-publish-schedule="${attr(schedule.id)}">Catat Tayang</button>` : ''}</div>` : ''}${schedule.platform_url ? externalLink(schedule.platform_url) : ''}</article>`;
            }).join('')}</div>` : emptyInline('Jadwal dibuat setelah hasil disetujui.')}
          </section>
          <section class="card detail-section" style="margin-top:16px"><h3>Bukti Tayang</h3>
            ${data.proofs.length ? data.proofs.map(proof => `<div class="notice success" style="margin-bottom:10px"><strong>${escapeHtml(proof.channel_name || 'Publikasi')}</strong> · ${dateTime(proof.published_at)}<br>${externalLink(proof.platform_url)}${proof.fileUrl ? ` · <a href="${attr(proof.fileUrl)}" target="_blank" rel="noopener">Buka bukti</a>` : ''}<br><small>Reach ${number(proof.metrics.reach)} · Engagement ${number(proof.metrics.engagement)} · Leads ${number(proof.metrics.leads)}</small></div>`).join('') : emptyInline('Belum ada bukti tayang')}
          </section>
        </div>
        <div>
          <section class="card detail-section"><h3>Penugasan</h3><dl class="detail-list">
            ${detailItem('Vendor', item.vendor_name)}${detailItem('Koordinator', item.coordinator_name)}
            ${detailItem('Direksi Terpilih', item.approver_name)}${detailItem('Dibuat oleh', item.created_by_name)}
            ${detailItem('Deadline', dateOnly(item.due_date))}${detailItem('Rencana tayang', dateTime(item.publish_at))}
          </dl></section>
          <section class="card detail-section" style="margin-top:16px"><h3>Aset Referensi</h3>
            ${data.assets.length ? data.assets.map(asset => `<span class="tag" style="margin:0 5px 7px 0">${escapeHtml(asset.title)}</span>`).join('') : '<p class="muted">Belum ada aset ditautkan.</p>'}
            <h3 style="margin-top:18px">Link Referensi</h3>
            ${(item.referenceUrls || []).length ? `<div class="reference-list">${item.referenceUrls.map(referenceLink).join('')}</div>` : '<p class="muted">Belum ada link sosial media atau web.</p>'}
          </section>
          <section class="card detail-section" style="margin-top:16px"><h3>Approval Direksi</h3>
            ${(data.directorApprovals || []).length ? data.directorApprovals.map(approval => `<div class="approval-row"><div><strong>${escapeHtml(approval.director_name)}</strong><small>${dateTime(approval.created_at)}</small></div>${statusHtml(approval.status)}${approval.status === 'ACTIVE' && (state.user.role === 'COORDINATOR' || state.user.role === 'SUPER_ADMIN') ? `<div class="actions">${approval.url ? `<button class="btn btn-ghost btn-small" data-copy-approval="${attr(approval.url)}">Salin Link</button>` : ''}<button class="btn btn-danger btn-small" data-cancel-approval="${attr(approval.id)}">Batalkan</button></div>` : ''}</div>`).join('') : '<p class="muted">Belum pernah dikirim ke Direksi.</p>'}
          </section>
          <section class="card detail-section" style="margin-top:16px"><h3>Jejak Workflow</h3><div class="timeline">
            ${data.events.map(event => `<div class="timeline-item"><strong>${escapeHtml(state.statusLabels[event.to_status] || event.to_status)}</strong><p>${escapeHtml(event.actor_name)} · ${dateTime(event.created_at)}${event.note ? `<br>${escapeHtml(event.note)}` : ''}</p></div>`).join('')}
          </div></section>
        </div>
      </div>`, item.content_no);
    bindDetailActions(item, data);
  } catch (error) { toast(error.message, true); }
  finally { setLoading(false); }
}

function vendorFieldLabel(field) {
  return ({ brief: 'Brief Produksi', description: 'Deskripsi', caption: 'Draft Caption', hashtags: 'Hashtag', call_to_action: 'Call to Action' })[field] || labelize(field);
}

function vendorEditBadge(data, field) {
  const attribution = data.vendorEditAttributions?.[field];
  return attribution ? `<p class="vendor-edit-badge">Diedit oleh Vendor: ${escapeHtml(attribution.vendorName)}</p>` : '';
}

function vendorEditReviewSection(edits) {
  if (!edits.length) return '';
  const mayReview = state.user.role === 'COORDINATOR' || state.user.role === 'SUPER_ADMIN';
  return `<section class="card detail-section" style="margin-top:16px"><h3>Usulan Edit Vendor</h3><div class="vendor-edit-list">${edits.slice(0, 10).map(edit => `<article class="vendor-edit-row"><div class="card-head"><div><strong>${escapeHtml(vendorFieldLabel(edit.field_name))}</strong><small>${escapeHtml(edit.vendor_name)} · ${dateTime(edit.created_at)}</small></div>${statusHtml(edit.status)}</div><p>${escapeHtml(edit.added_value)}</p>${edit.review_note ? `<small>Catatan Koordinator: ${escapeHtml(edit.review_note)}</small>` : ''}${mayReview && edit.status === 'PENDING' ? `<div class="actions"><button class="btn btn-success btn-small" data-review-vendor-edit="${attr(edit.id)}" data-review-action="ACCEPT">Terima</button><button class="btn btn-danger btn-small" data-review-vendor-edit="${attr(edit.id)}" data-review-action="REJECT">Tolak</button></div>` : ''}</article>`).join('')}</div></section>`;
}

function contentActions(item) {
  const buttons = [];
  if (has('content.edit') && !['PUBLISHED', 'CANCELLED'].includes(item.status)) buttons.push(`<button class="btn btn-ghost" data-content-action="edit">Edit & Penugasan</button>`);
  if (has('content.edit') && !['PUBLISHED', 'CANCELLED'].includes(item.status)) buttons.push(`<button class="btn btn-ghost" data-content-action="assets">Aset Referensi</button>`);
  if ((has('content.discuss') || state.user.role === 'SUPER_ADMIN') && !['CANCELLED'].includes(item.status)) buttons.push(`<button class="btn btn-ghost" data-content-action="discuss">Diskusi & Upload</button>`);
  if ((state.user.role === 'COORDINATOR' || state.user.role === 'SUPER_ADMIN') && !['CANCELLED', 'PUBLISHED'].includes(item.status)) buttons.push(`<button class="btn btn-soft" data-content-action="share">Salin Link Ringkasan</button>`);
  if (state.user.role === 'VENDOR' && ['ASSIGNED', 'IN_PRODUCTION', 'REVISION_REQUIRED'].includes(item.status) && (item.vendorEditPermissions || []).some(permission => permission !== 'attachments')) buttons.push(`<button class="btn btn-ghost" data-content-action="vendor-edit">Usulkan Edit Materi</button>`);
  if (item.status === 'IN_PRODUCTION' && state.user.role === 'VENDOR') buttons.push(`<button class="btn btn-primary" data-content-action="submit-result">Kirim Hasil ke Koordinator</button>`);
  if (['DRAFT_SUBMITTED', 'IN_REVIEW'].includes(item.status) && (state.user.role === 'COORDINATOR' || state.user.role === 'SUPER_ADMIN')) buttons.push(`<button class="btn btn-primary" data-content-action="director">Kirim ke Direksi</button>`);
  if (item.status === 'APPROVED' && (has('content.schedule') || state.user.role === 'SUPER_ADMIN')) buttons.push(`<button class="btn btn-success" data-content-action="schedule">Buat Jadwal Platform</button>`);
  if (['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(item.status) && has('library.manage')) buttons.push(`<button class="btn btn-soft" data-content-action="promote">Jadikan Aset Resmi</button>`);
  for (const next of state.transitions[item.status] || []) {
    if (item.status === 'APPROVAL_PENDING') continue;
    if (['DRAFT_SUBMITTED', 'APPROVAL_PENDING', 'SCHEDULED', 'PUBLISHED'].includes(next)) continue;
    const permission = transitionPermission(item, next);
    if (!has(permission)) continue;
    buttons.push(`<button class="btn ${transitionTone(next)}" data-transition="${next}">${transitionLabel(next)}</button>`);
  }
  return buttons.join('');
}

function bindDetailActions(item, data = {}) {
  $('[data-content-action="edit"]')?.addEventListener('click', () => showContentForm(item));
  $('[data-content-action="vendor-edit"]')?.addEventListener('click', () => showVendorEditForm(item));
  document.querySelectorAll('[data-content-action="discuss"]').forEach(button => button.addEventListener('click', () => showDiscussionForm(item)));
  $('[data-content-action="share"]')?.addEventListener('click', () => showShareForm(item, data.collaborationFiles || []));
  $('[data-content-action="submit-result"]')?.addEventListener('click', () => submitProductionResult(item));
  $('[data-content-action="director"]')?.addEventListener('click', () => showDirectorApprovalForm(item, data.collaborationFiles || []));
  $('[data-content-action="schedule"]')?.addEventListener('click', () => showScheduleForm(item));
  $('[data-content-action="assets"]')?.addEventListener('click', () => showContentAssetsForm(item));
  $('[data-content-action="promote"]')?.addEventListener('click', () => showPromoteForm(item));
  document.querySelectorAll('[data-edit-schedule]').forEach(button => button.addEventListener('click', () => {
    const schedule = (data.schedules || []).find(row => row.id === button.dataset.editSchedule);
    if (schedule) showEditScheduleForm(item, schedule);
  }));
  document.querySelectorAll('[data-publish-schedule]').forEach(button => button.addEventListener('click', () => showSchedulePublicationForm(item, button.dataset.publishSchedule)));
  document.querySelectorAll('[data-cancel-approval]').forEach(button => button.addEventListener('click', () => cancelDirectorApproval(item, button.dataset.cancelApproval)));
  document.querySelectorAll('[data-copy-approval]').forEach(button => button.addEventListener('click', async () => {
    const url = new URL(button.dataset.copyApproval, window.location.origin).href;
    await navigator.clipboard.writeText(url);
    toast('Link approval disalin. PIN tetap hanya diketahui Direksi.');
  }));
  document.querySelectorAll('[data-review-vendor-edit]').forEach(button => button.addEventListener('click', async () => {
    const action = button.dataset.reviewAction;
    const note = window.prompt(action === 'ACCEPT' ? 'Catatan penerimaan (opsional):' : 'Alasan penolakan (opsional):', '');
    if (note == null) return;
    setLoading(true);
    try {
      await api(`/api/contents/${item.id}/vendor-edits/${button.dataset.reviewVendorEdit}/review`, { method: 'POST', body: { action, note } });
      toast(action === 'ACCEPT' ? 'Usulan vendor diterima.' : 'Usulan vendor ditolak.');
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  }));
  document.querySelectorAll('[data-transition]').forEach(button => button.addEventListener('click', () => showTransitionForm(item, button.dataset.transition)));
}

function showVendorEditForm(item) {
  const definitions = {
    brief: ['Brief Produksi', item.brief || '', 5000], description: ['Deskripsi', item.description || '', 2000],
    caption: ['Draft Caption', item.caption || '', 5000], hashtags: ['Hashtag', item.hashtags || '', 1000],
    call_to_action: ['Call to Action', item.call_to_action || '', 1000]
  };
  const allowed = (item.vendorEditPermissions || []).filter(permission => definitions[permission]);
  if (!allowed.length) return toast('Koordinator belum memberikan akses edit materi.', true);
  openModal('Usulkan Edit Materi', `<form id="vendor-edit-form">
    <div class="notice">Tulisan Koordinator tetap dipertahankan. Tambahan Anda dikirim sebagai usulan dan baru aktif setelah diterima Koordinator.</div>
    <label class="field" style="margin-top:16px"><span>Kolom yang diedit</span><select name="fieldName">${allowed.map(field => `<option value="${field}">${escapeHtml(definitions[field][0])}</option>`).join('')}</select></label>
    <div class="field" style="margin-top:14px"><span>Isi Koordinator — tidak dapat diubah</span><div id="vendor-edit-base" class="readonly-material"></div></div>
    <label class="field" style="margin-top:14px"><span>Tambahan / revisi dari Vendor *</span><textarea name="addedValue" required rows="7" placeholder="Tuliskan tambahan tanpa mengulang atau menghapus materi Koordinator"></textarea><small id="vendor-edit-limit"></small></label>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Kirim Usulan</button></div>
  </form>`, item.content_no);
  const formNode = $('#vendor-edit-form');
  const fieldNode = formNode.elements.fieldName;
  const refresh = () => {
    const definition = definitions[fieldNode.value];
    $('#vendor-edit-base').textContent = definition[1] || 'Belum ada tulisan Koordinator.';
    formNode.elements.addedValue.maxLength = Math.max(1, definition[2] - definition[1].length - (definition[1] ? 2 : 0));
    $('#vendor-edit-limit').textContent = `Maksimal tambahan ${number(formNode.elements.addedValue.maxLength)} karakter.`;
  };
  refresh();
  fieldNode.addEventListener('change', refresh);
  formNode.querySelector('[data-close-modal]').addEventListener('click', closeModal);
  formNode.addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      await api(`/api/contents/${item.id}/vendor-edits`, { method: 'POST', body: { fieldName: form.get('fieldName'), addedValue: form.get('addedValue') } });
      toast('Usulan edit dikirim kepada Koordinator.');
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function transitionPermission(item, next) {
  const map = {
    BRIEFED: 'content.edit', ASSIGNED: 'content.assign', IN_PRODUCTION: item.status === 'REVISION_REQUIRED' ? 'content.production' : 'content.approve_production',
    IN_REVIEW: 'content.review', REVISION_REQUIRED: 'content.review', APPROVAL_PENDING: 'content.review',
    APPROVED: 'content.review',
    SCHEDULED: 'content.schedule', CANCELLED: 'content.edit'
  };
  return map[next];
}

function transitionLabel(status) {
  return ({ BRIEFED: 'Brief Siap', ASSIGNED: 'Kirim ke Pra-Produksi', IN_PRODUCTION: 'Lanjut Produksi', IN_REVIEW: 'Mulai Review', REVISION_REQUIRED: 'Kirim Revisi', APPROVAL_PENDING: 'Kirim ke Direksi', APPROVED: 'Setujui Tanpa Direksi', SCHEDULED: 'Jadwalkan', CANCELLED: 'Batalkan' })[status] || (state.statusLabels[status] || status);
}

function transitionTone(status) {
  if (status === 'REVISION_REQUIRED' || status === 'CANCELLED') return 'btn-danger';
  if (status === 'APPROVED' || status === 'SCHEDULED') return 'btn-success';
  return 'btn-primary';
}

function showTransitionForm(item, toStatus) {
  const requiresNote = toStatus === 'REVISION_REQUIRED';
  openModal(transitionLabel(toStatus), `<form id="transition-form">
    <div class="notice ${requiresNote ? 'warn' : ''}">Status akan berubah dari <strong>${escapeHtml(item.statusLabel)}</strong> menjadi <strong>${escapeHtml(state.statusLabels[toStatus] || toStatus)}</strong>.</div>
    <label class="field" style="margin-top:16px"><span>${requiresNote ? 'Catatan revisi *' : 'Catatan keputusan'}</span><textarea name="note" maxlength="2000" ${requiresNote ? 'required' : ''} placeholder="Tuliskan catatan yang membantu tahap berikutnya"></textarea></label>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn ${transitionTone(toStatus)}">Konfirmasi</button></div>
  </form>`, item.content_no);
  $('#transition-form [data-close-modal]').addEventListener('click', closeModal);
  $('#transition-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const note = new FormData(event.currentTarget).get('note');
      await api(`/api/contents/${item.id}/transition`, { method: 'POST', body: { toStatus, note } });
      toast(`Status diperbarui menjadi ${state.statusLabels[toStatus] || toStatus}.`);
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function phaseLabel(phase) {
  return ({ BRIEF: 'Brief', PRE_PRODUCTION: 'Pra-Produksi', PRODUCTION_RESULT: 'Hasil Produksi' })[phase] || phase;
}

function fileIcon(mime = '') {
  if (mime.startsWith('image/')) return '▧';
  if (mime.startsWith('video/')) return '▶';
  if (mime.startsWith('audio/')) return '♫';
  if (mime === 'application/pdf') return 'PDF';
  return '⇩';
}

function defaultDiscussionPhase(item) {
  if (['REQUESTED', 'BRIEFED'].includes(item.status)) return 'BRIEF';
  if (['ASSIGNED'].includes(item.status)) return 'PRE_PRODUCTION';
  return 'PRODUCTION_RESULT';
}

function showDiscussionForm(item) {
  const phase = defaultDiscussionPhase(item);
  openModal('Diskusi & Upload', `<form id="discussion-form">
    <div class="notice">Pesan dan file tersimpan sesuai tahap. Upload file tidak akan mengubah status sebelum tombol proses berikutnya ditekan.</div>
    <div class="form-grid" style="margin-top:16px">
      <label class="field"><span>Tahap</span><select name="phase">${optionsHtml([
        ['BRIEF','Brief'],['PRE_PRODUCTION','Pra-Produksi / Script'],['PRODUCTION_RESULT','Hasil Produksi / Revisi']
      ], phase)}</select></label>
      <label class="field"><span>Lampiran (opsional)</span><input type="file" name="file" accept="image/*,video/*,audio/*,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></label>
      <label class="field full"><span>Pesan / Catatan</span><textarea name="message" maxlength="5000" placeholder="Bahas script, storyboard, isi materi, hasil, atau revisi..."></textarea></label>
    </div>
    <div id="upload-progress" class="upload-progress" hidden><div><span></span></div><p>Menyiapkan upload…</p></div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Kirim</button></div>
  </form>`, item.content_no);
  $('#discussion-form [data-close-modal]').addEventListener('click', closeModal);
  $('#discussion-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    const message = String(form.get('message') || '').trim();
    const selectedPhase = form.get('phase');
    if (!(file instanceof File) || !file.size) {
      if (!message) return toast('Isi pesan atau pilih file.', true);
      setLoading(true);
      try {
        await api(`/api/contents/${item.id}/messages`, { method: 'POST', body: { phase: selectedPhase, message } });
        toast('Pesan diskusi terkirim.');
        await showContentDetail(item.id);
      } catch (error) { toast(error.message, true); }
      finally { setLoading(false); }
      return;
    }
    try {
      event.currentTarget.querySelector('button[type="submit"]').disabled = true;
      await uploadCollaborativeFile(item.id, selectedPhase, file, message);
      toast('File berhasil diunggah. Status belum berubah.');
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
  });
}

async function uploadCollaborativeFile(contentId, phase, file, message) {
  const progress = $('#upload-progress');
  progress.hidden = false;
  const bar = progress.querySelector('span');
  const label = progress.querySelector('p');
  const session = await api(`/api/contents/${contentId}/uploads/init`, { method: 'POST', body: {
    phase, filename: file.name, mimeType: file.type || 'application/octet-stream', totalSize: file.size, message
  }});
  let offset = session.receivedSize || 0;
  let index = session.nextChunk || 0;
  try {
    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(offset + session.chunkSize, file.size));
      const response = await fetch(`/api/uploads/${session.id}/chunks/${index}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Upload terhenti.');
      offset = payload.receivedSize;
      index = payload.nextChunk;
      const percent = Math.min(100, Math.round(offset * 100 / file.size));
      bar.style.width = `${percent}%`;
      label.textContent = `Mengunggah ${percent}% · ${fileSize(offset)} dari ${fileSize(file.size)}`;
    }
    label.textContent = 'Menyimpan dan memverifikasi file…';
    return await api(`/api/uploads/${session.id}/complete`, { method: 'POST', body: {} });
  } catch (error) {
    await api(`/api/uploads/${session.id}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
}

function submitProductionResult(item) {
  openModal('Kirim Hasil ke Koordinator', `<form id="submit-result-form">
    <div class="notice warn">Pastikan hasil final sudah diunggah pada tahap <strong>Hasil Produksi</strong>. Setelah dikirim, Koordinator akan melakukan review.</div>
    <label class="field" style="margin-top:16px"><span>Catatan hasil</span><textarea name="note" maxlength="2000" placeholder="Versi final, perubahan terakhir, atau hal yang perlu diperiksa"></textarea></label>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Kirim untuk Review</button></div>
  </form>`, item.content_no);
  $('#submit-result-form [data-close-modal]').addEventListener('click', closeModal);
  $('#submit-result-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api(`/api/contents/${item.id}/submit-result`, { method: 'POST', body: { note: new FormData(event.currentTarget).get('note') } });
      toast('Hasil produksi dikirim ke Koordinator.');
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function shareFileChecks(files, phase = null) {
  const rows = phase ? files.filter(file => file.phase === phase) : files;
  return rows.map(file => `<label class="check file-check"><input type="checkbox" name="fileIds" value="${attr(file.id)}"><span><strong>${escapeHtml(file.original_name)}</strong><small>${phaseLabel(file.phase)} · ${fileSize(file.file_size)}</small></span></label>`).join('') || '<p class="muted">Belum ada file yang dapat dipilih.</p>';
}

async function showShareForm(item, files) {
  let history;
  try { history = (await api(`/api/contents/${item.id}/share-links`)).items; }
  catch (error) { return toast(error.message, true); }
  const linkStatus = link => link.revoked_at ? ['Dibatalkan', 'cancelled'] : new Date(link.expires_at) <= new Date() ? ['Kedaluwarsa', 'expired'] : ['Aktif', 'active'];
  openModal('Bagikan Ringkasan Materi', `<form id="share-form">
    <div class="notice">Link berisi snapshot judul, brief, script/caption, dan lampiran terpilih. Terbuka tanpa login selama tepat 12 jam; catatan internal dan anggaran tidak disertakan.</div>
    <div class="form-section" style="margin-top:16px"><h3>Lampiran yang ikut dibagikan</h3><div class="check-row">${shareFileChecks(files)}</div></div>
    <div class="form-section"><h3>Riwayat Link</h3><div class="schedule-list">${history.length ? history.map(link => { const status = linkStatus(link); return `<article class="schedule-row"><div><strong>Dibuat ${dateTime(link.created_at)}</strong><span>Berakhir ${dateTime(link.expires_at)} · ${number(link.view_count)} kali dibuka</span></div><span class="status ${status[1]}">${status[0]}</span>${status[1] === 'active' ? `<button type="button" class="btn btn-danger btn-small" data-revoke-share="${attr(link.id)}">Batalkan</button>` : ''}</article>`; }).join('') : '<p class="muted">Belum ada link ringkasan.</p>'}</div></div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Buat & Salin Link</button></div>
  </form>`, item.content_no);
  $('#share-form [data-close-modal]').addEventListener('click', closeModal);
  document.querySelectorAll('[data-revoke-share]').forEach(button => button.addEventListener('click', async () => {
    setLoading(true);
    try { await api(`/api/contents/${item.id}/share-links/${button.dataset.revokeShare}/revoke`, { method: 'POST', body: {} }); toast('Link ringkasan dibatalkan.'); await showShareForm(item, files); }
    catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  }));
  $('#share-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const fileIds = new FormData(event.currentTarget).getAll('fileIds');
      const result = await api(`/api/contents/${item.id}/share-links`, { method: 'POST', body: { fileIds } });
      const url = new URL(result.url, window.location.origin).href;
      if (navigator.share) await navigator.share({ title: item.title, text: `Ringkasan materi ${item.content_no}`, url }).catch(() => navigator.clipboard.writeText(url));
      else await navigator.clipboard.writeText(url);
      closeModal(); toast('Link ringkasan disalin. Berlaku 12 jam.');
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function showDirectorApprovalForm(item, files) {
  try {
    const assignments = await loadAssignments();
    const directors = assignments.users.filter(user => user.role === 'MANAGEMENT');
    const finalFiles = files.filter(file => file.phase === 'PRODUCTION_RESULT');
    openModal('Kirim Approval ke Direksi', `<form id="director-form">
      <div class="notice warn">Link tidak kedaluwarsa otomatis dan dapat dibatalkan Koordinator. PIN adalah PIN pribadi milik Direksi, tidak dibuat atau ditampilkan kepada Koordinator.</div>
      <label class="field" style="margin-top:16px"><span>Direksi yang dituju *</span><select name="directorId" required><option value="">Pilih satu Direksi</option>${directors.map(user => `<option value="${attr(user.id)}" ${user.approval_pin_set ? '' : 'disabled'}>${escapeHtml(user.name)}${user.approval_pin_set ? '' : ' — PIN belum dibuat'}</option>`).join('')}</select><small>Direksi menyiapkan PIN 8 digit dari menu Profil.</small></label>
      <div class="form-section" style="margin-top:16px"><h3>Versi final yang disetujui *</h3><div class="check-row">${shareFileChecks(finalFiles)}</div></div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Buat Link Approval</button></div>
    </form>`, item.content_no);
    $('#director-form [data-close-modal]').addEventListener('click', closeModal);
    $('#director-form').addEventListener('submit', async event => {
      event.preventDefault(); setLoading(true);
      try {
        const form = new FormData(event.currentTarget);
        const result = await api(`/api/contents/${item.id}/director-approvals`, { method: 'POST', body: { directorId: form.get('directorId'), fileIds: form.getAll('fileIds') } });
        const url = new URL(result.url, window.location.origin).href;
        openModal('Link Approval Siap', `<div class="approval-secret"><div class="success-mark">✓</div><h3>${escapeHtml(result.director)}</h3><p class="muted">Bagikan link ini kepada Direksi. Direksi membukanya memakai PIN approval pribadinya.</p><label class="field"><span>Link approval</span><input id="approval-url" readonly value="${attr(url)}"></label><div class="notice success" style="margin-top:14px">PIN tidak ditampilkan karena hanya dimiliki oleh akun Direksi.</div><div class="actions"><button class="btn btn-primary" id="copy-approval">Salin Link</button><button class="btn btn-ghost" data-close-modal>Tutup</button></div></div>`, item.content_no);
        $('#copy-approval').addEventListener('click', async () => { await navigator.clipboard.writeText(`${item.title}\n${url}`); toast('Link approval disalin.'); });
        $('#modal-body [data-close-modal]').addEventListener('click', () => showContentDetail(item.id));
      } catch (error) { toast(error.message, true); }
      finally { setLoading(false); }
    });
  } catch (error) { toast(error.message, true); }
}

async function cancelDirectorApproval(item, approvalId) {
  const note = window.prompt('Alasan pembatalan link approval (opsional):', '') ?? null;
  if (note == null) return;
  setLoading(true);
  try {
    await api(`/api/contents/${item.id}/director-approvals/${approvalId}/cancel`, { method: 'POST', body: { note } });
    toast('Link approval dibatalkan.');
    await showContentDetail(item.id);
  } catch (error) { toast(error.message, true); }
  finally { setLoading(false); }
}

async function showScheduleForm(item) {
  try {
    const assignments = await loadAssignments();
    const uploaders = assignments.users.filter(user => user.role === 'UPLOADER');
    openModal('Jadwal per Platform', `<form id="schedule-form">
      <div class="notice success">Setiap platform memiliki waktu, petugas, dan bukti tayang sendiri. Konten selesai hanya setelah seluruh jadwal dipublikasikan.</div>
      <div class="platform-plans">${state.channels.map(channel => `<article class="platform-plan"><label class="check"><input type="checkbox" data-plan-check value="${attr(channel.id)}"><strong>${escapeHtml(channel.name)}</strong></label><div class="form-grid"><label class="field"><span>Waktu tayang</span><input type="datetime-local" data-plan-time value="${attr(toLocalDateTime(item.publish_at || new Date().toISOString()))}"></label><label class="field"><span>Petugas upload</span><select data-plan-uploader><option value="">Pilih petugas</option>${uploaders.map(user => `<option value="${attr(user.id)}">${escapeHtml(user.name)}</option>`).join('')}</select></label></div></article>`).join('')}</div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-success">Simpan Jadwal</button></div>
    </form>`, item.content_no);
    $('#schedule-form [data-close-modal]').addEventListener('click', closeModal);
    $('#schedule-form').addEventListener('submit', async event => {
      event.preventDefault();
      const plans = [...event.currentTarget.querySelectorAll('.platform-plan')].filter(row => row.querySelector('[data-plan-check]').checked).map(row => ({
        channelId: row.querySelector('[data-plan-check]').value,
        scheduledAt: row.querySelector('[data-plan-time]').value,
        uploaderId: row.querySelector('[data-plan-uploader]').value
      }));
      setLoading(true);
      try {
        await api(`/api/contents/${item.id}/schedules`, { method: 'POST', body: { plans } });
        toast('Jadwal platform berhasil dibuat.');
        await showContentDetail(item.id);
      } catch (error) { toast(error.message, true); }
      finally { setLoading(false); }
    });
  } catch (error) { toast(error.message, true); }
}

async function showEditScheduleForm(item, schedule) {
  try {
    const assignments = await loadAssignments();
    const uploaders = assignments.users.filter(user => user.role === 'UPLOADER');
    openModal('Edit Jadwal Platform', `<form id="edit-schedule-form">
      <div class="notice">Platform <strong>${escapeHtml(schedule.channel_name)}</strong> tetap sama. Perubahan petugas dan waktu akan dicatat dalam audit.</div>
      <div class="form-grid" style="margin-top:16px">
        <label class="field"><span>Waktu tayang</span><input type="datetime-local" name="scheduledAt" required value="${attr(toLocalDateTime(schedule.scheduled_at))}"></label>
        <label class="field"><span>Petugas upload</span><select name="uploaderId" required><option value="">Pilih petugas</option>${uploaders.map(user => `<option value="${attr(user.id)}" ${user.id === schedule.uploader_id ? 'selected' : ''}>${escapeHtml(user.name)}</option>`).join('')}</select></label>
      </div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Perubahan</button></div>
    </form>`, item.content_no);
    $('#edit-schedule-form [data-close-modal]').addEventListener('click', () => showContentDetail(item.id));
    $('#edit-schedule-form').addEventListener('submit', async event => {
      event.preventDefault(); setLoading(true);
      try {
        const form = new FormData(event.currentTarget);
        await api(`/api/schedules/${schedule.id}`, { method: 'PATCH', body: {
          scheduledAt: form.get('scheduledAt'), uploaderId: form.get('uploaderId')
        } });
        toast('Jadwal dan petugas upload berhasil diperbarui.');
        await showContentDetail(item.id);
      } catch (error) { toast(error.message, true); }
      finally { setLoading(false); }
    });
  } catch (error) { toast(error.message, true); }
}

function showSchedulePublicationForm(item, scheduleId) {
  openModal('Catat Tayang Platform', `<form id="schedule-publication-form">
    <div class="notice success">Jadwal lain tetap aktif. Status konten menjadi Selesai Tayang setelah semua platform selesai.</div>
    <div class="form-grid" style="margin-top:16px"><label class="field full"><span>URL publikasi</span><input type="url" name="platformUrl" placeholder="https://..."></label><label class="field"><span>Waktu tayang</span><input type="datetime-local" name="publishedAt" value="${attr(toLocalDateTime(new Date().toISOString()))}"></label><label class="field"><span>Bukti</span><input type="file" name="file" accept="image/*,.pdf"></label><label class="field"><span>Reach</span><input type="number" min="0" name="reach" value="0"></label><label class="field"><span>Engagement</span><input type="number" min="0" name="engagement" value="0"></label></div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-success">Simpan Bukti</button></div>
  </form>`, item.content_no);
  $('#schedule-publication-form [data-close-modal]').addEventListener('click', closeModal);
  $('#schedule-publication-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api(`/api/schedules/${scheduleId}/publish`, { method: 'POST', body: new FormData(event.currentTarget) });
      toast('Bukti tayang platform disimpan.');
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function showDraftForm(item) {
  openModal('Upload Draft', `<form id="draft-form">
    <div class="notice">Berkas akan dicatat sebagai versi baru. Ukuran maksimal 50 MB.</div>
    <label class="field" style="margin-top:16px"><span>Berkas draft *</span><input type="file" name="file" required accept="image/*,video/*,audio/*,.pdf,.zip,.doc,.docx,.ppt,.pptx"></label>
    <label class="field" style="margin-top:14px"><span>Caption versi ini</span><textarea name="caption" maxlength="5000">${escapeHtml(item.caption || '')}</textarea></label>
    <label class="field" style="margin-top:14px"><span>Catatan perubahan</span><textarea name="changeNote" maxlength="1000" placeholder="Apa yang dibuat atau diperbaiki?"></textarea></label>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Kirim ke Review</button></div>
  </form>`, item.content_no);
  $('#draft-form [data-close-modal]').addEventListener('click', closeModal);
  $('#draft-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api(`/api/contents/${item.id}/version`, { method: 'POST', body: new FormData(event.currentTarget) });
      toast('Draft berhasil diunggah dan dikirim ke antrean review.');
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function showPublicationForm(item) {
  openModal('Catat Bukti Tayang', `<form id="publication-form">
    <div class="notice success">Setelah disimpan, konten dikunci sebagai Tayang. Jejak publikasi tetap tersimpan di audit.</div>
    <div class="form-grid" style="margin-top:16px">
      <label class="field"><span>Channel</span><select name="channelId"><option value="">Pilih channel</option>${state.channels.map(channel => `<option value="${attr(channel.id)}">${escapeHtml(channel.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Waktu Tayang</span><input type="datetime-local" name="publishedAt" value="${attr(toLocalDateTime(new Date().toISOString()))}"></label>
      <label class="field full"><span>URL Publikasi</span><input type="url" name="platformUrl" placeholder="https://..."></label>
      <label class="field full"><span>Screenshot / bukti</span><input type="file" name="file" accept="image/*,.pdf"></label>
      <label class="field"><span>Reach</span><input type="number" min="0" name="reach" value="0"></label>
      <label class="field"><span>Impressions</span><input type="number" min="0" name="impressions" value="0"></label>
      <label class="field"><span>Engagement</span><input type="number" min="0" name="engagement" value="0"></label>
      <label class="field"><span>Leads / PSB</span><input type="number" min="0" name="leads" value="0"></label>
      <label class="field full"><span>Catatan metrik</span><textarea name="metricsNotes" maxlength="1000"></textarea></label>
    </div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-success">Simpan & Tandai Tayang</button></div>
  </form>`, item.content_no);
  $('#publication-form [data-close-modal]').addEventListener('click', closeModal);
  $('#publication-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api(`/api/contents/${item.id}/publication`, { method: 'POST', body: new FormData(event.currentTarget) });
      toast('Bukti publikasi disimpan. Konten sudah berstatus Tayang.');
      await showContentDetail(item.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function showContentAssetsForm(item) {
  try {
    const data = await api('/api/library?status=ACTIVE');
    const detail = await api(`/api/contents/${item.id}`);
    const selected = new Set(detail.assets.map(asset => asset.id));
    openModal('Aset Referensi', `<form id="content-assets-form">
      <p class="muted">Pilih logo, brosur, template, foto, atau materi resmi yang harus digunakan vendor.</p>
      <div class="check-row" style="margin-top:16px">${data.items.map(asset => `<label class="check"><input type="checkbox" name="assetIds" value="${attr(asset.id)}" ${selected.has(asset.id) ? 'checked' : ''}><span><strong>${escapeHtml(asset.title)}</strong><br><small>${escapeHtml(categoryLabel(asset.category))} · ${escapeHtml(asset.code)}</small></span></label>`).join('') || emptyInline('Belum ada aset aktif')}</div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Referensi</button></div>
    </form>`, item.content_no);
    $('#content-assets-form [data-close-modal]').addEventListener('click', closeModal);
    $('#content-assets-form').addEventListener('submit', async event => {
      event.preventDefault(); setLoading(true);
      try {
        const assetIds = new FormData(event.currentTarget).getAll('assetIds');
        await api(`/api/contents/${item.id}/assets`, { method: 'POST', body: { assetIds } });
        toast('Aset referensi diperbarui.');
        await showContentDetail(item.id);
      } catch (error) { toast(error.message, true); }
      finally { setLoading(false); }
    });
  } catch (error) { toast(error.message, true); }
}

function showPromoteForm(item) {
  openModal('Jadikan Aset Resmi', `<form id="promote-form">
    <div class="notice success">Versi draft yang disetujui akan disalin ke Media Library sebagai aset resmi baru.</div>
    <div class="form-grid" style="margin-top:16px">
      <label class="field"><span>Nama aset</span><input name="title" maxlength="200" value="${attr(item.title)}"></label>
      <label class="field"><span>Kategori</span><select name="category">${categoryOptions('CAMPAIGN')}</select></label>
      <label class="field full"><span>Deskripsi</span><textarea name="description" maxlength="1000"></textarea></label>
    </div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Tambahkan ke Library</button></div>
  </form>`, item.content_no);
  $('#promote-form [data-close-modal]').addEventListener('click', closeModal);
  $('#promote-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      await api(`/api/contents/${item.id}/promote-to-library`, { method: 'POST', body: Object.fromEntries(form.entries()) });
      closeModal(); toast('Draft disetujui sudah ditambahkan sebagai aset resmi.');
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function renderLibrary() {
  const data = await api('/api/library');
  page.innerHTML = `<div class="page-head"><div><h2>Media Library</h2><p>Sumber resmi untuk seluruh pengguna, termasuk vendor. Aset kedaluwarsa tetap terlihat tetapi dikunci.</p></div>
    ${has('library.manage') ? '<button id="asset-create" class="btn btn-primary">＋ Tambah Aset</button>' : ''}</div>
    <form id="library-filter" class="card toolbar">
      <label class="field search-field"><span>Cari aset</span><input name="q" placeholder="Nama, kode, atau deskripsi"></label>
      <label class="field"><span>Kategori</span><select name="category"><option value="">Semua kategori</option>${categoryOptions()}</select></label>
      <label class="field"><span>Brand</span><select name="brandId"><option value="">Semua brand</option>${brandOptions()}</select></label>
      <label class="field"><span>Status</span><select name="status"><option value="">Semua status</option>${optionsHtml([['ACTIVE','Aktif'],['EXPIRED','Kedaluwarsa'],['ARCHIVED','Arsip']])}</select></label>
      <button class="btn btn-ghost" type="submit">Terapkan</button>
    </form>
    <section id="asset-results" class="asset-grid">${assetCards(data.items)}</section>`;
  $('#asset-create')?.addEventListener('click', showAssetForm);
  $('#library-filter').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      const query = new URLSearchParams();
      for (const key of ['q', 'category', 'brandId', 'status']) if (form.get(key)) query.set(key, form.get(key));
      const result = await api(`/api/library?${query}`);
      $('#asset-results').innerHTML = assetCards(result.items);
      bindAssetOpeners($('#asset-results'));
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
  bindAssetOpeners(page);
}

function assetCards(items) {
  if (!items.length) return `<div class="card" style="grid-column:1/-1">${emptyState('Media Library masih kosong', 'Tambahkan logo, brosur, template, foto, atau materi kampanye pertama.')}</div>`;
  return items.map(asset => `<article class="card asset-card" data-asset-id="${attr(asset.id)}">
    <div class="asset-preview">${assetIcon(asset)}</div><div class="card-body">
      <div class="actions"><span class="status ${statusClass(asset.status)}">${escapeHtml(assetStatusLabel(asset.status))}</span>${asset.brand_code ? `<span class="brand-chip" style="background:${brandColor(asset.brand_code)}">${escapeHtml(asset.brand_code)}</span>` : ''}</div>
      <h3>${escapeHtml(asset.title)}</h3><p>${escapeHtml(asset.description || categoryLabel(asset.category))}</p>
      <div class="asset-meta"><span>${escapeHtml(asset.code)} · v${asset.version_number || '-'}</span><span>${fileSize(asset.file_size)}</span></div>
    </div></article>`).join('');
}

function bindAssetOpeners(root) {
  root.querySelectorAll('[data-asset-id]').forEach(element => element.addEventListener('click', () => showAssetDetail(element.dataset.assetId)));
}

async function showAssetDetail(id) {
  setLoading(true);
  try {
    const data = await api(`/api/library/${id}`);
    const asset = data.item;
    openModal('Detail Aset', `<section class="card detail-hero">
      <div class="actions">${statusHtml(asset.status)}${asset.brand_code ? `<span class="brand-chip" style="background:${brandColor(asset.brand_code)}">${escapeHtml(asset.brand_code)}</span>` : ''}</div>
      <h3>${escapeHtml(asset.title)}</h3><p>${escapeHtml(asset.code)} · ${escapeHtml(categoryLabel(asset.category))}</p>
    </section>
    <div class="actions" style="margin:16px 0">
      ${asset.canDownload ? `<a class="btn btn-primary" href="${attr(asset.fileUrl)}?download=1">↓ Unduh Versi Aktif</a>` : '<span class="notice warn">Aset dikunci karena kedaluwarsa/diarsipkan.</span>'}
      ${has('library.manage') ? '<button class="btn btn-ghost" data-asset-action="version">Upload Versi Baru</button><button class="btn btn-ghost" data-asset-action="edit">Edit Metadata</button>' : ''}
      ${has('library.manage') && asset.status !== 'ACTIVE' ? '<button class="btn btn-success" data-asset-status="ACTIVE">Aktifkan</button>' : ''}
      ${has('library.manage') && asset.status === 'ACTIVE' ? '<button class="btn btn-danger" data-asset-status="EXPIRED">Tandai Kedaluwarsa</button>' : ''}
      ${has('library.manage') && asset.status !== 'ARCHIVED' ? '<button class="btn btn-ghost" data-asset-status="ARCHIVED">Arsipkan</button>' : ''}
    </div>
    <div class="grid-2"><section class="card detail-section"><h3>Informasi</h3><dl class="detail-list">
      ${detailItem('Kategori', categoryLabel(asset.category))}${detailItem('Brand', asset.brand_name)}
      ${detailItem('Berlaku mulai', dateOnly(asset.effective_from))}${detailItem('Kedaluwarsa', dateOnly(asset.expires_at))}
      ${detailItem('Pemilik', asset.owner_name)}${detailItem('Checksum', asset.checksum ? asset.checksum.slice(0, 14) + '…' : '-')}
    </dl><h3 style="margin-top:18px">Deskripsi</h3><p class="rich-text muted">${escapeHtml(asset.description || 'Tidak ada deskripsi.')}</p></section>
    <section class="card detail-section"><h3>Riwayat Versi</h3>${data.versions.length ? `<div class="timeline">${data.versions.map(version => `<div class="timeline-item"><strong>Versi ${version.version_number} · ${escapeHtml(version.original_name)}</strong><p>${escapeHtml(version.uploaded_by_name)} · ${dateTime(version.created_at)} · ${fileSize(version.file_size)}${version.fileUrl ? `<br><a href="${attr(version.fileUrl)}" target="_blank" rel="noopener">Buka berkas</a>` : ''}</p></div>`).join('')}</div>` : emptyInline('Belum ada versi')}</section></div>`, asset.code);
    $('[data-asset-action="version"]')?.addEventListener('click', () => showAssetVersionForm(asset));
    $('[data-asset-action="edit"]')?.addEventListener('click', () => showAssetMetadataForm(asset));
    document.querySelectorAll('[data-asset-status]').forEach(button => button.addEventListener('click', () => updateAssetStatus(asset.id, button.dataset.assetStatus)));
  } catch (error) { toast(error.message, true); }
  finally { setLoading(false); }
}

function showAssetForm() {
  openModal('Tambah Aset Media', `<form id="asset-form">
    <div class="form-grid">
      <label class="field full"><span>Nama aset *</span><input name="title" maxlength="200" required placeholder="Contoh: Logo AINET Horizontal"></label>
      <label class="field"><span>Kategori *</span><select name="category" required>${categoryOptions('BRAND_CENTER')}</select></label>
      <label class="field"><span>Brand</span><select name="brandId"><option value="">Umum / semua brand</option>${brandOptions()}</select></label>
      <label class="field"><span>Berlaku mulai</span><input type="date" name="effectiveFrom"></label>
      <label class="field"><span>Tanggal kedaluwarsa</span><input type="date" name="expiresAt"></label>
      <label class="field full"><span>Deskripsi / cara penggunaan</span><textarea name="description" maxlength="2000"></textarea></label>
      <label class="field full"><span>Berkas *</span><input type="file" name="file" required></label>
      <label class="field full"><span>Catatan versi</span><textarea name="notes" maxlength="1000" placeholder="Versi awal, format warna, atau catatan produksi"></textarea></label>
    </div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Aset</button></div>
  </form>`, 'Media Library');
  $('#asset-form [data-close-modal]').addEventListener('click', closeModal);
  $('#asset-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api('/api/library', { method: 'POST', body: new FormData(event.currentTarget) });
      closeModal(); toast('Aset baru tersedia untuk seluruh pengguna.'); await renderLibrary();
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function showAssetVersionForm(asset) {
  openModal('Upload Versi Baru', `<form id="asset-version-form"><div class="notice">Versi baru langsung menjadi versi aktif. Versi lama tetap tersimpan dalam riwayat.</div>
    <label class="field" style="margin-top:16px"><span>Berkas *</span><input type="file" name="file" required></label>
    <label class="field" style="margin-top:14px"><span>Catatan versi</span><textarea name="notes" maxlength="1000"></textarea></label>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Upload Versi</button></div></form>`, asset.code);
  $('#asset-version-form [data-close-modal]').addEventListener('click', closeModal);
  $('#asset-version-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api(`/api/library/${asset.id}/version`, { method: 'POST', body: new FormData(event.currentTarget) });
      toast('Versi aktif diperbarui.'); await showAssetDetail(asset.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function showAssetMetadataForm(asset) {
  openModal('Edit Metadata Aset', `<form id="asset-meta-form"><div class="form-grid">
    <label class="field full"><span>Nama aset *</span><input name="title" required maxlength="200" value="${attr(asset.title)}"></label>
    <label class="field"><span>Kategori</span><select name="category">${categoryOptions(asset.category)}</select></label>
    <label class="field"><span>Brand</span><select name="brandId"><option value="">Umum</option>${brandOptions(asset.brand_id)}</select></label>
    <label class="field"><span>Berlaku mulai</span><input type="date" name="effectiveFrom" value="${attr(asset.effective_from)}"></label>
    <label class="field"><span>Kedaluwarsa</span><input type="date" name="expiresAt" value="${attr(asset.expires_at)}"></label>
    <label class="field full"><span>Deskripsi</span><textarea name="description" maxlength="2000">${escapeHtml(asset.description || '')}</textarea></label>
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form>`, asset.code);
  $('#asset-meta-form [data-close-modal]').addEventListener('click', closeModal);
  $('#asset-meta-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api(`/api/library/${asset.id}`, { method: 'PATCH', body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
      toast('Metadata aset diperbarui.'); await showAssetDetail(asset.id);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function updateAssetStatus(id, status) {
  setLoading(true);
  try { await api(`/api/library/${id}`, { method: 'PATCH', body: { status } }); toast('Status aset diperbarui.'); await showAssetDetail(id); }
  catch (error) { toast(error.message, true); }
  finally { setLoading(false); }
}

async function renderVendors() {
  const data = await api('/api/vendors');
  page.innerHTML = `<div class="page-head"><div><h2>${state.user.role === 'MANAGEMENT' ? 'Kinerja Vendor' : 'Vendor'}</h2><p>Daftar mitra produksi, SLA, output, dan keterlambatan.</p></div>${has('vendor.manage') ? '<button id="vendor-create" class="btn btn-primary">＋ Tambah Vendor</button>' : ''}</div>
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Kontak</th><th>SLA</th><th>Ditugaskan</th><th>Tayang</th><th>Terlambat</th><th>Status</th></tr></thead><tbody>
      ${data.items.map(vendor => `<tr ${has('vendor.manage') ? `data-vendor-id="${attr(vendor.id)}"` : ''}><td><span class="cell-title">${escapeHtml(vendor.name)}</span><span class="cell-meta">${escapeHtml(vendor.notes || '')}</span></td><td>${escapeHtml(vendor.contact_name || '-')}<span class="cell-meta">${escapeHtml(vendor.email || vendor.phone || '')}</span></td><td>${vendor.sla_days} hari</td><td>${number(vendor.content_count)}</td><td>${number(vendor.published_count)}</td><td>${number(vendor.overdue_count)}</td><td>${statusHtml(vendor.status)}</td></tr>`).join('') || `<tr><td colspan="7">${emptyInline('Belum ada vendor')}</td></tr>`}
    </tbody></table></div></section>`;
  $('#vendor-create')?.addEventListener('click', () => showVendorForm());
  page.querySelectorAll('[data-vendor-id]').forEach(row => row.addEventListener('click', () => showVendorForm(data.items.find(v => v.id === row.dataset.vendorId))));
}

function showVendorForm(vendor = null) {
  openModal(vendor ? 'Edit Vendor' : 'Tambah Vendor', `<form id="vendor-form"><div class="form-grid">
    <label class="field full"><span>Nama vendor *</span><input name="name" required maxlength="200" value="${attr(vendor?.name)}"></label>
    <label class="field"><span>Nama kontak</span><input name="contactName" maxlength="150" value="${attr(vendor?.contact_name)}"></label>
    <label class="field"><span>Email</span><input type="email" name="email" maxlength="200" value="${attr(vendor?.email)}"></label>
    <label class="field"><span>Telepon</span><input name="phone" maxlength="50" value="${attr(vendor?.phone)}"></label>
    <label class="field"><span>SLA produksi (hari)</span><input type="number" min="1" max="60" name="slaDays" value="${attr(vendor?.sla_days || 3)}"></label>
    ${vendor ? `<label class="field"><span>Status</span><select name="status">${optionsHtml([['ACTIVE','Aktif'],['INACTIVE','Nonaktif']], vendor.status)}</select></label>` : ''}
    <label class="field full"><span>Catatan</span><textarea name="notes" maxlength="2000">${escapeHtml(vendor?.notes || '')}</textarea></label>
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Vendor</button></div></form>`, 'Mitra produksi');
  $('#vendor-form [data-close-modal]').addEventListener('click', closeModal);
  $('#vendor-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api(vendor ? `/api/vendors/${vendor.id}` : '/api/vendors', { method: vendor ? 'PATCH' : 'POST', body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
      closeModal(); state.assignments = null; toast('Data vendor disimpan.'); await renderVendors();
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function renderReports() {
  const now = new Date();
  const from = `${now.getFullYear()}-01-01`;
  const to = dateInput(now);
  const data = await api(`/api/reports/summary?from=${from}&to=${to}`);
  renderReportData(data);
}

function renderReportData(data) {
  const maxStatus = Math.max(1, ...data.byStatus.map(item => item.count));
  page.innerHTML = `<div class="page-head"><div><h2>Laporan & Performa</h2><p>Output konten, ketepatan waktu, SLA vendor, engagement, leads, dan efisiensi biaya.</p></div></div>
    <form id="report-filter" class="card toolbar"><label class="field"><span>Dari</span><input type="date" name="from" value="${attr(data.from)}"></label><label class="field"><span>Sampai</span><input type="date" name="to" value="${attr(data.to)}"></label><button class="btn btn-primary" type="submit">Terapkan</button></form>
    <div class="grid-4">
      ${reportMetric('Total Reach', number(data.metrics.reach), '↗')}${reportMetric('Engagement', number(data.metrics.engagement), '◎', 'orange')}
      ${reportMetric('Leads / PSB', number(data.metrics.leads), '◆', 'green')}${reportMetric('Biaya per Lead', rupiah(data.metrics.costPerLead), 'Rp', 'purple')}
    </div>
    <div class="grid-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h3>Output per Status</h3></div><div class="card-body bar-chart">${data.byStatus.map(item => `<div class="bar-row"><span>${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, item.count * 100 / maxStatus)}%"></div></div><strong>${number(item.count)}</strong></div>`).join('') || emptyInline('Belum ada data')}</div></section>
      <section class="card"><div class="card-head"><h3>Output per Brand</h3></div><div class="card-body">${data.byBrand.map(brand => `<div class="calendar-row" style="grid-template-columns:70px 1fr auto"><span class="brand-chip" style="background:${safeColor(brand.color)}">${escapeHtml(brand.code)}</span><div><strong>${escapeHtml(brand.name)}</strong><span class="cell-meta">${number(brand.published)} sudah tayang</span></div><strong>${number(brand.count)}</strong></div>`).join('')}</div></section>
    </div>
    <section class="card" style="margin-top:16px"><div class="card-head"><h3>SLA & Kinerja Vendor</h3></div><div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Ditugaskan</th><th>Tayang</th><th>Tepat Waktu</th><th>Revisi Aktif</th><th>Siklus Rata-rata</th></tr></thead><tbody>
      ${data.vendors.map(vendor => `<tr><td><span class="cell-title">${escapeHtml(vendor.name)}</span></td><td>${number(vendor.assigned)}</td><td>${number(vendor.published)}</td><td>${vendor.on_time_percent}%</td><td>${number(vendor.revisions)}</td><td>${vendor.avg_cycle_days || 0} hari</td></tr>`).join('') || `<tr><td colspan="6">${emptyInline('Belum ada data vendor')}</td></tr>`}
    </tbody></table></div></section>`;
  $('#report-filter').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      renderReportData(await api(`/api/reports/summary?from=${encodeURIComponent(form.get('from'))}&to=${encodeURIComponent(form.get('to'))}`));
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function reportMetric(label, value, icon, tone = '') {
  return `<article class="card metric ${tone}"><div class="metric-icon">${icon}</div><span>${label}</span><strong>${value}</strong></article>`;
}

async function renderUsers() {
  const [data, vendors] = await Promise.all([api('/api/users'), api('/api/vendors')]);
  const ssoEnabled = Boolean(state.config.auth?.oidcEnabled);
  page.innerHTML = `<div class="page-head"><div><h2>Pengguna & Akses</h2><p>${ssoEnabled ? 'Pengguna internal memakai AXINDO ID. Login Personal tersedia untuk Super Admin dan Vendor; setiap akun Vendor wajib dipasangkan ke data vendor.' : 'Role menjadi dasar menu dan hak akses. Vendor hanya dapat melihat tugas dari perusahaannya.'}</p></div><button id="user-create" class="btn btn-primary">＋ ${ssoEnabled ? 'Tambah Login Personal' : 'Tambah Pengguna'}</button></div>
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Pengguna</th><th>Sumber</th><th>Role</th><th>Vendor</th><th>Login Terakhir</th><th>Status</th></tr></thead><tbody>
      ${data.items.map(user => `<tr data-user-id="${attr(user.id)}"><td><span class="cell-title">${escapeHtml(user.name)}</span><span class="cell-meta">${escapeHtml(user.email || '@' + user.username)}${user.must_change_password && !isAxindoIdUser(user) ? ' · wajib ganti password' : ''}</span></td><td><span class="tag">${isAxindoIdUser(user) ? 'AXINDO ID' : 'Login Personal'}</span>${user.oidc_last_sync_at ? `<span class="cell-meta">Sinkron ${dateTime(user.oidc_last_sync_at)}</span>` : ''}</td><td>${escapeHtml(state.roleLabels[user.role] || user.role)}</td><td>${escapeHtml(user.vendor_name || '-')}</td><td>${dateTime(user.last_login)}</td><td>${statusHtml(user.active ? 'ACTIVE' : 'INACTIVE')}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  $('#user-create').addEventListener('click', () => showUserForm(null, vendors.items));
  page.querySelectorAll('[data-user-id]').forEach(row => row.addEventListener('click', () => showUserForm(data.items.find(user => user.id === row.dataset.userId), vendors.items)));
}

function showUserForm(user, vendors) {
  const axindoIdUser = isAxindoIdUser(user);
  const ssoEnabled = Boolean(state.config.auth?.oidcEnabled);
  const personalRoles = [
    ['SUPER_ADMIN', state.roleLabels.SUPER_ADMIN || 'Super Admin'],
    ['VENDOR', state.roleLabels.VENDOR || 'Vendor / Kreator']
  ];
  const currentIsLegacyLocal = user && !axindoIdUser && ssoEnabled && !personalRoles.some(([role]) => role === user.role);
  const roles = ssoEnabled && !axindoIdUser
    ? (currentIsLegacyLocal ? [[user.role, `${state.roleLabels[user.role] || user.role} (akun lokal lama)`], ...personalRoles] : personalRoles)
    : Object.entries(state.roleLabels);
  openModal(user ? 'Edit Pengguna' : (ssoEnabled ? 'Tambah Login Personal' : 'Tambah Pengguna'), `<form id="user-form"><div class="form-grid">
    <label class="field full"><span>Nama *</span><input name="name" required maxlength="200" value="${attr(user?.name)}" ${axindoIdUser ? 'disabled' : ''}></label>
    ${user ? `<label class="field"><span>Username</span><input value="${attr(user.username)}" disabled></label>` : '<label class="field"><span>Username *</span><input name="username" required minlength="3" maxlength="60" autocomplete="off"></label>'}
    ${axindoIdUser ? `<label class="field"><span>Role dari AXINDO ID</span><input value="${attr(state.roleLabels[user.role] || user.role)}" disabled><small>Ubah melalui grup pengguna di Authentik.</small></label>` : `<label class="field"><span>Role *</span><select name="role" required>${optionsHtml(roles, user?.role || (state.config.auth?.oidcEnabled ? 'SUPER_ADMIN' : 'COORDINATOR'))}</select></label>`}
    <label class="field"><span>Vendor (untuk role Vendor)</span><select name="vendorId"><option value="">Pilih vendor</option>${vendors.map(vendor => `<option value="${attr(vendor.id)}" ${vendor.id === user?.vendor_id ? 'selected' : ''}>${escapeHtml(vendor.name)}</option>`).join('')}</select></label>
    ${axindoIdUser ? '<div class="notice full">Password dikelola melalui AXINDO ID.</div>' : `<label class="field full"><span>${user ? 'Password baru (kosongkan bila tidak diubah)' : 'Password awal *'}</span><input type="password" name="password" ${user ? '' : 'required'} minlength="8" autocomplete="new-password"><small>Login Personal memakai username dan password. Minimal 8 karakter, mengandung huruf dan angka.</small></label>`}
    ${user ? `<label class="check full"><input type="checkbox" name="active" ${user.active ? 'checked' : ''}>Akun aktif</label>` : ''}
    </div><div class="form-actions"><button type="button" class="btn btn-ghost" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Pengguna</button></div></form>`, 'Administrasi akses');
  $('#user-form [data-close-modal]').addEventListener('click', closeModal);
  $('#user-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      const body = Object.fromEntries(form.entries());
      if (user) body.active = form.has('active');
      await api(user ? `/api/users/${user.id}` : '/api/users', { method: user ? 'PATCH' : 'POST', body });
      closeModal(); state.assignments = null; toast('Data pengguna disimpan.'); await renderUsers();
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function renderAudit() {
  const data = await api('/api/audit');
  page.innerHTML = `<div class="page-head"><div><h2>Audit Log</h2><p>Aktivitas penting tercatat bersama waktu, pelaku, entitas, alasan, serta perubahan data.</p></div></div>
    <form id="audit-filter" class="card toolbar"><label class="field search-field"><span>Cari</span><input name="q" placeholder="Aksi, entitas, pelaku, atau alasan"></label><label class="field"><span>Jenis entitas</span><select name="entityType"><option value="">Semua</option>${optionsHtml([['AUTH','Autentikasi'],['CONTENT','Konten'],['CONTENT_VERSION','Versi Draft'],['MEDIA_ASSET','Media Asset'],['PUBLICATION','Publikasi'],['USER','Pengguna'],['VENDOR','Vendor'],['SETTINGS','Pengaturan'],['BACKUP','Backup']])}</select></label><button class="btn btn-ghost" type="submit">Terapkan</button></form>
    <section id="audit-results" class="card">${auditTable(data.items)}</section>`;
  $('#audit-filter').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const form = new FormData(event.currentTarget); const query = new URLSearchParams();
      if (form.get('q')) query.set('q', form.get('q')); if (form.get('entityType')) query.set('entityType', form.get('entityType'));
      $('#audit-results').innerHTML = auditTable((await api(`/api/audit?${query}`)).items);
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

function auditTable(items) {
  return `<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Pelaku</th><th>Entitas</th><th>Aksi</th><th>Alasan / Ringkasan</th><th>IP</th></tr></thead><tbody>${items.map(row => `<tr><td>${dateTime(row.created_at)}</td><td>${escapeHtml(row.actor_name || 'Sistem')}</td><td><span class="tag">${escapeHtml(row.entity_type)}</span><span class="cell-meta">${escapeHtml(row.entity_id || '')}</span></td><td><span class="cell-title">${escapeHtml(labelize(row.action))}</span></td><td class="truncate">${escapeHtml(row.reason || summarizeChange(row.after))}</td><td>${escapeHtml(row.ip_address || '-')}</td></tr>`).join('') || `<tr><td colspan="6">${emptyInline('Belum ada audit log')}</td></tr>`}</tbody></table></div>`;
}

async function renderSettings() {
  const data = await api('/api/settings');
  const settings = data.settings;
  page.innerHTML = `<div class="page-head"><div><h2>Pengaturan</h2><p>Identitas aplikasi, warna brand, zona waktu, dan logo perusahaan.</p></div></div>
    <div class="grid-2"><form id="settings-form" class="card detail-section"><h3>Identitas & Tema</h3><div class="form-grid">
      <label class="field full"><span>Nama aplikasi</span><input name="appName" required value="${attr(settings.appName)}"></label>
      <label class="field full"><span>Nama perusahaan</span><input name="companyName" required value="${attr(settings.companyName)}"></label>
      <label class="field"><span>Warna AINET / utama</span><input type="color" name="primaryColor" value="${attr(settings.primaryColor)}"></label>
      <label class="field"><span>Warna IMAS / sekunder</span><input type="color" name="secondaryColor" value="${attr(settings.secondaryColor)}"></label>
      <label class="field full"><span>Zona waktu</span><input name="timezone" value="${attr(settings.timezone)}"></label>
      <label class="field full"><span>Batas upload kolaborasi (MB)</span><input type="number" min="10" max="2048" name="maxCollaborationUploadMb" value="${attr(settings.maxCollaborationUploadMb || 500)}"><small>Berlaku untuk lampiran brief, video, dan hasil produksi. Default 500 MB.</small></label>
    </div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Simpan Pengaturan</button></div></form>
    <form id="logo-form" class="card detail-section"><h3>Logo Perusahaan</h3>${settings.logoUrl ? `<div class="asset-preview"><img src="${attr(settings.logoUrl)}" alt="Logo saat ini" style="max-width:80%;max-height:90px"></div>` : '<div class="asset-preview">AM</div>'}<label class="field" style="margin-top:16px"><span>Logo baru (PNG/JPG/WebP)</span><input type="file" name="file" required accept="image/*"></label><button class="btn btn-ghost" style="margin-top:14px" type="submit">Upload Logo</button></form></div>`;
  $('#settings-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      const result = await api('/api/settings', { method: 'PATCH', body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
      applyConfig(result.settings); toast('Pengaturan disimpan.');
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
  $('#logo-form').addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try { const result = await api('/api/settings/logo', { method: 'POST', body: new FormData(event.currentTarget) }); state.config.logoUrl = `${result.logoUrl}?v=${Date.now()}`; applyConfig(state.config); toast('Logo diperbarui.'); await renderSettings(); }
    catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function renderBackups() {
  const data = await api('/api/backups');
  page.innerHTML = `<div class="page-head"><div><h2>Backup Data</h2><p>Backup manual menyimpan database, pengguna, workflow, Media Library metadata, audit, dan pengaturan. Folder upload tetap dicadangkan melalui script server.</p></div><button id="backup-create" class="btn btn-primary">＋ Buat Backup Database</button></div>
    <div class="notice warn" style="margin-bottom:16px">Untuk pemindahan server lengkap, jalankan <strong>./backup.sh</strong> agar database dan seluruh file upload masuk satu arsip.</div>
    <section class="card"><div class="table-wrap"><table><thead><tr><th>Nama Backup</th><th>Ukuran</th><th>Dibuat</th><th></th></tr></thead><tbody>${data.items.map(item => `<tr><td><span class="cell-title">${escapeHtml(item.name)}</span></td><td>${fileSize(item.size)}</td><td>${dateTime(item.createdAt)}</td><td><a class="btn btn-ghost btn-small" href="/api/backups/${encodeURIComponent(item.name)}">Unduh</a></td></tr>`).join('') || `<tr><td colspan="4">${emptyInline('Belum ada backup manual')}</td></tr>`}</tbody></table></div></section>`;
  $('#backup-create').addEventListener('click', async () => {
    setLoading(true);
    try { await api('/api/backups', { method: 'POST', body: {} }); toast('Backup database berhasil dibuat.'); await renderBackups(); }
    catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function renderProfile() {
  const usesAxindoId = isAxindoIdUser(state.user);
  const accountSecurity = usesAxindoId
    ? '<section class="card detail-section"><h3>Keamanan AXINDO ID</h3><div class="notice success">Akun ini masuk melalui Single Sign-On. Password, MFA, dan pemulihan akun dikelola terpusat di AXINDO ID.</div></section>'
    : '<form id="password-form" class="card detail-section"><h3>Ubah Password</h3><div class="field"><span>Password saat ini</span><input type="password" name="currentPassword" required autocomplete="current-password"></div><div class="field" style="margin-top:13px"><span>Password baru</span><input type="password" name="newPassword" required minlength="8" autocomplete="new-password"><small>Minimal 8 karakter, mengandung huruf dan angka.</small></div><button class="btn btn-primary" style="margin-top:16px" type="submit">Ubah Password</button></form>';
  const approvalPin = state.user.role === 'MANAGEMENT' ? `<form id="approval-pin-form" class="card detail-section"><h3>${state.user.approvalPinSet ? 'Ubah' : 'Buat'} PIN Approval</h3><div class="notice">PIN 8 digit ini milik pribadi Direksi dan digunakan pada semua link approval yang ditujukan kepada Anda. Koordinator tidak dapat melihatnya.</div>
    ${state.user.approvalPinSet ? '<div class="field" style="margin-top:13px"><span>PIN saat ini</span><input class="pin-profile-input" type="password" name="currentPin" required inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="off"></div>' : ''}
    <div class="field" style="margin-top:13px"><span>PIN baru</span><input class="pin-profile-input" type="password" name="newPin" required inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="new-password"><small>Tepat 8 angka. Jangan berikan PIN kepada Koordinator atau vendor.</small></div>
    <div class="field" style="margin-top:13px"><span>Ulangi PIN baru</span><input class="pin-profile-input" type="password" name="confirmPin" required inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="new-password"></div>
    <button class="btn btn-primary" style="margin-top:16px" type="submit">Simpan PIN Approval</button></form>` : '';
  page.innerHTML = `<div class="page-head"><div><h2>Profil & Password</h2><p>Kelola keamanan akun Anda.</p></div></div>
    <div class="grid-2"><section class="card detail-section"><h3>Informasi Akun</h3><dl class="detail-list">${detailItem('Nama', state.user.name)}${detailItem('Username', '@' + state.user.username)}${detailItem('Email', state.user.email || '-')}${detailItem('Sumber akun', usesAxindoId ? 'AXINDO ID' : 'Lokal')}${detailItem('Role', state.roleLabels[state.user.role] || state.user.role)}${detailItem('Login terakhir', dateTime(state.user.lastLogin))}</dl></section>
    ${accountSecurity}${approvalPin}</div>`;
  $('#password-form')?.addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try { await api('/api/profile/password', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget).entries()) }); event.currentTarget.reset(); state.user.mustChangePassword = false; toast('Password berhasil diubah.'); }
    catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
  $('#approval-pin-form')?.addEventListener('submit', async event => {
    event.preventDefault(); setLoading(true);
    try {
      await api('/api/profile/approval-pin', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
      state.user.approvalPinSet = true;
      toast('PIN approval berhasil disimpan.');
      await renderProfile();
    } catch (error) { toast(error.message, true); }
    finally { setLoading(false); }
  });
}

async function showNotifications() {
  setLoading(true);
  try {
    const data = await api('/api/notifications');
    openModal('Notifikasi', `<div class="actions" style="justify-content:flex-end;margin-bottom:12px"><button id="notification-read" class="btn btn-ghost btn-small">Tandai Semua Dibaca</button></div>
      <div class="calendar-list">${data.items.map(item => `<article class="calendar-row" data-notification-link="${attr(item.link)}" style="grid-template-columns:48px 1fr"><div class="avatar">${item.read_at ? '✓' : '•'}</div><div><strong>${escapeHtml(item.title)}</strong><p class="cell-meta">${escapeHtml(item.body || '')}</p><span class="cell-meta">${dateTime(item.created_at)}</span></div></article>`).join('') || emptyState('Tidak ada notifikasi', 'Pembaruan tugas, review, approval, dan publikasi akan tampil di sini.')}</div>`, `${data.unread} belum dibaca`);
    $('#notification-read').addEventListener('click', async () => { await api('/api/notifications/read', { method: 'POST', body: {} }); updateNotificationCount(0); closeModal(); toast('Semua notifikasi ditandai dibaca.'); });
    document.querySelectorAll('[data-notification-link]').forEach(item => item.addEventListener('click', () => {
      const match = String(item.dataset.notificationLink || '').match(/^\/contents\/(.+)$/);
      if (match) showContentDetail(match[1]);
    }));
  } catch (error) { toast(error.message, true); }
  finally { setLoading(false); }
}

function updateNotificationCount(count) {
  const element = $('#notification-count');
  const value = Number(count || 0);
  element.textContent = value > 99 ? '99+' : String(value);
  element.hidden = !value;
}

function contentTable(items) {
  if (!items.length) return emptyState('Belum ada konten', 'Data yang sesuai filter belum tersedia.');
  return `<div class="table-wrap"><table><thead><tr><th>Konten</th><th>Brand / Channel</th><th>Status</th><th>Vendor</th><th>Deadline</th><th>Prioritas</th></tr></thead><tbody>${items.map(item => `<tr data-content-id="${attr(item.id)}"><td><span class="cell-title truncate">${escapeHtml(item.title)}</span><span class="cell-meta">${escapeHtml(item.content_no)} · ${escapeHtml(item.campaign || labelize(item.content_type))}</span></td><td><span class="brand-chip" style="background:${safeColor(item.brand_color)}">${escapeHtml(item.brand_code)}</span><span class="cell-meta truncate">${escapeHtml(item.channels.join(', ') || '-')}</span></td><td>${statusHtml(item.status)}</td><td>${escapeHtml(item.vendor_name || '-')}</td><td>${dateOnly(item.due_date)}<span class="cell-meta">${item.publish_at ? 'Tayang ' + dateTime(item.publish_at) : ''}</span></td><td>${priorityHtml(item.priority)}</td></tr>`).join('')}</tbody></table></div>`;
}

function pipelineCard(item) {
  return `<article class="pipeline-card" data-content-id="${attr(item.id)}"><div class="actions"><span class="brand-chip" style="background:${safeColor(item.brand_color)}">${escapeHtml(item.brand_code)}</span>${priorityHtml(item.priority)}</div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.content_no)} · ${escapeHtml(item.vendor_name || 'Belum ada vendor')}</p><div class="pipeline-card-foot"><span>${statusHtml(item.status)}</span><span>${dateOnly(item.due_date)}</span></div></article>`;
}

function contentMiniRow(item) {
  const date = item.publish_at || item.due_date;
  const parsed = date ? new Date(date) : null;
  return `<article class="calendar-row" data-content-id="${attr(item.id)}"><div class="calendar-date"><strong>${parsed && !Number.isNaN(parsed) ? String(parsed.getDate()).padStart(2, '0') : '--'}</strong><span>${parsed && !Number.isNaN(parsed) ? parsed.toLocaleDateString('id-ID', { month: 'short' }) : 'TBD'}</span></div><div><strong>${escapeHtml(item.title)}</strong><p class="cell-meta">${escapeHtml(item.content_no)} · ${escapeHtml(item.vendor_name || 'Belum ditugaskan')}</p></div>${statusHtml(item.status)}</article>`;
}

function calendarRows(items) {
  return items.length ? items.map(contentMiniRow).join('') : `<div class="card">${emptyState('Jadwal kosong', 'Belum ada deadline atau rencana tayang pada periode ini.')}</div>`;
}

function bindContentOpeners(root) {
  root.querySelectorAll('[data-content-id]').forEach(element => element.addEventListener('click', event => {
    if (event.target.closest('a,button')) return;
    showContentDetail(element.dataset.contentId);
  }));
}

function openModal(title, body, eyebrow = 'Media Hub') {
  $('#modal-title').textContent = title;
  $('#modal-eyebrow').textContent = eyebrow;
  $('#modal-body').innerHTML = body;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modal').hidden = true;
  $('#modal-body').innerHTML = '';
  document.body.style.overflow = '';
}

function closeNavigation() { document.body.classList.remove('nav-open'); }
function setLoading(value) { $('#loading').hidden = !value; }

function toast(message, error = false) {
  const element = document.createElement('div');
  element.className = `toast${error ? ' error' : ''}`;
  element.textContent = message;
  $('#toast-region').appendChild(element);
  setTimeout(() => element.remove(), 4200);
}

function has(permission) {
  if (!permission) return false;
  return state.permissions.has('*') || state.permissions.has(permission);
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('media-hub-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

function applySavedTheme() {
  document.body.classList.toggle('dark', localStorage.getItem('media-hub-theme') === 'dark');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function attr(value) { return escapeHtml(value ?? ''); }
function firstName(value) { return String(value || 'Pengguna').trim().split(/\s+/)[0]; }
function initials(value) { return String(value || 'A').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function number(value) { return new Intl.NumberFormat('id-ID').format(Number(value || 0)); }
function rupiah(value) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function dateOnly(value) {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date) ? '-' : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function dateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date) ? '-' : date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function dateInput(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}
function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date)) return '';
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}
function fileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
function labelize(value) { return String(value || '-').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }
function statusClass(value) { return String(value || '').toLowerCase().replace(/_/g, '-'); }
function statusHtml(value) { return `<span class="status ${statusClass(value)}">${escapeHtml(state.statusLabels[value] || assetStatusLabel(value) || labelize(value))}</span>`; }
function priorityHtml(value) { return `<span class="priority ${statusClass(value)}">${escapeHtml(({ LOW: 'Rendah', NORMAL: 'Normal', HIGH: 'Tinggi', URGENT: 'Mendesak' })[value] || value)}</span>`; }
function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#2563eb'; }
function brandColor(code) { return code === 'IMAS' ? 'var(--secondary)' : 'var(--primary)'; }
function assetStatusLabel(value) { return ({ ACTIVE: 'Aktif', EXPIRED: 'Kedaluwarsa', ARCHIVED: 'Arsip', INACTIVE: 'Nonaktif' })[value] || labelize(value); }
function categoryLabel(value) { return ({ BRAND_CENTER: 'Brand Center', BROCHURE_PRODUCT: 'Brosur & Produk', CONTENT_TEMPLATE: 'Template Konten', PHOTO_VIDEO: 'Bank Foto / Video', CAMPAIGN: 'Materi Kampanye', ARCHIVE: 'Arsip' })[value] || labelize(value); }
function categoryOptions(selected = '') { return optionsHtml([['BRAND_CENTER','Brand Center'],['BROCHURE_PRODUCT','Brosur & Produk'],['CONTENT_TEMPLATE','Template Konten'],['PHOTO_VIDEO','Bank Foto / Video'],['CAMPAIGN','Materi Kampanye'],['ARCHIVE','Arsip']], selected); }
function brandOptions(selected = '') { return state.brands.map(brand => `<option value="${attr(brand.id)}" ${brand.id === selected ? 'selected' : ''}>${escapeHtml(brand.name)}</option>`).join(''); }
function statusOptions(allowed = null) {
  const values = allowed?.length ? allowed : Object.keys(state.statusLabels);
  return values.map(value => `<option value="${attr(value)}">${escapeHtml(state.statusLabels[value] || labelize(value))}</option>`).join('');
}
function optionsHtml(entries, selected = '') {
  return entries.map(([value, label]) => `<option value="${attr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}
function detailItem(label, value) { return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '-')}</dd></div>`; }
function emptyInline(message) { return `<p class="muted" style="margin:8px 0">${escapeHtml(message)}</p>`; }
function emptyState(title, description) { return `<div class="empty"><div class="empty-icon">◇</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`; }
function errorState(message) { return `<div class="card">${emptyState('Halaman tidak dapat dimuat', message)}</div>`; }
function summarizeChange(value) {
  if (!value || typeof value !== 'object') return '-';
  return Object.entries(value).slice(0, 3).map(([key, item]) => `${labelize(key)}: ${typeof item === 'object' ? 'data' : item}`).join(' · ');
}
function assetIcon(asset) {
  if (String(asset.mime_type || '').startsWith('image/')) return '▧';
  if (String(asset.mime_type || '').startsWith('video/')) return '▶';
  if (asset.category === 'BRAND_CENTER') return 'A';
  if (asset.category === 'BROCHURE_PRODUCT') return '▤';
  if (asset.category === 'CONTENT_TEMPLATE') return '▦';
  return '◇';
}
function externalLink(value) {
  if (!value) return 'Tanpa URL';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return escapeHtml(value);
    return `<a href="${attr(url.href)}" target="_blank" rel="noopener noreferrer">Buka publikasi</a>`;
  } catch { return escapeHtml(value); }
}

function referenceLink(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `<a class="reference-link" href="${attr(url.href)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(url.hostname)}</span><small>${escapeHtml(url.href)}</small></a>`;
  } catch { return ''; }
}
