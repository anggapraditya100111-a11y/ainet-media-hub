const root = document.querySelector('#approval-content');
const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const coordinatorMode = params.get('kind') === 'coordinator';
const endpoint = coordinatorMode ? '/api/public/coordinator-approvals' : '/api/public/approvals';
const roleLabel = coordinatorMode ? 'Koordinator' : 'Direksi';
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const formatDate = value => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-';
const formatSize = value => Number(value || 0) >= 1048576 ? `${(Number(value) / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(Number(value || 0) / 1024))} KB`;

async function request(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Permintaan gagal.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function pinView(data = {}) {
  const recipient = data.recipient || data.director || roleLabel;
  root.innerHTML = `<section class="card pin-card"><p class="eyebrow">Approval ${roleLabel}</p><h1>Masukkan PIN</h1>
    <p class="muted">${esc(recipient)}, masukkan PIN approval pribadi 8 digit yang Anda buat dari menu Profil Media Hub.</p>
    ${data.locked ? `<div class="notice error">PIN terkunci. Masuk ke Media Hub dan atur ulang PIN melalui menu Profil.</div>` :
    `<form id="pin-form"><input class="pin-input" name="pin" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="one-time-code" required placeholder="••••••••"><button class="btn" type="submit">Buka Approval</button></form><p id="pin-error" class="notice error" hidden></p>`}</section>`;
  document.querySelector('#pin-form')?.addEventListener('submit', unlock);
}

async function unlock(event) {
  event.preventDefault();
  const errorNode = document.querySelector('#pin-error');
  try {
    await request(`${endpoint}/${encodeURIComponent(token)}/unlock`, { method: 'POST', body: { pin: new FormData(event.currentTarget).get('pin') } });
    await load();
  } catch (error) {
    errorNode.hidden = false;
    errorNode.textContent = error.message;
  }
}

function media(file) {
  const url = esc(file.fileUrl);
  const type = file.mime_type || '';
  if (type.startsWith('image/')) return `<img src="${url}" alt="${esc(file.original_name)}">`;
  if (type.startsWith('video/')) return `<video controls playsinline preload="metadata" src="${url}"></video>`;
  if (type.startsWith('audio/')) return `<audio controls preload="metadata" src="${url}"></audio>`;
  if (type === 'application/pdf') return `<iframe src="${url}" title="${esc(file.original_name)}"></iframe>`;
  return '<div class="notice">Pratinjau tidak tersedia. Unduh file untuk membukanya.</div>';
}

function approvalView(data) {
  const content = data.content;
  const recipient = coordinatorMode ? content.coordinator_name : content.director_name;
  const directors = (data.directors || []).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  const mediaSections = data.files.map((file, index) => `<section class="card"><div class="media" data-media-wrap="${index}">${media(file)}<div class="media-meta"><div><strong>${esc(file.original_name)}</strong><small>${file.file_role === 'COVER' ? 'Cover Media Sosial' : file.file_role === 'ATTACHMENT' ? 'Lampiran Koordinator' : 'File Utama'} · Versi ${file.version_number} · ${formatSize(file.file_size)}</small></div><div class="actions">${String(file.mime_type || '').startsWith('video/') ? `<button class="btn btn-ghost" type="button" data-fullscreen="${index}">Layar Penuh</button>` : ''}<a class="btn btn-ghost" href="${esc(file.fileUrl)}?download=1">Unduh</a></div></div></div></section>`).join('');
  const decisionSection = coordinatorMode && data.locked
    ? '<section class="card"><h2>Keputusan Koordinator</h2><div class="notice error">PIN terkunci setelah lima percobaan. Atur ulang PIN melalui menu Profil Media Hub untuk membuka kembali keputusan.</div></section>'
    : `<section class="card"><h2>Keputusan ${roleLabel}</h2><form id="decision-form" class="decision">
      ${coordinatorMode ? '<label class="field"><span>PIN persetujuan Koordinator *</span><input class="pin-input decision-pin" type="password" name="pin" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="one-time-code" required placeholder="••••••••"><small>PIN hanya digunakan untuk mengesahkan keputusan.</small></label>' : ''}
      <textarea name="note" maxlength="2000" placeholder="Catatan keputusan. Wajib diisi jika meminta revisi."></textarea>
      ${coordinatorMode ? `<label class="field"><span>Direksi tujuan (jika diteruskan)</span><select name="directorId"><option value="">Pilih Direksi</option>${directors}</select></label>` : ''}
      <div class="actions"><button class="btn btn-danger" type="submit" name="decision" value="REVISION">Minta Revisi</button>${coordinatorMode ? '<button class="btn" type="submit" name="decision" value="DIRECTOR">Teruskan ke Direksi</button>' : ''}<button class="btn btn-success" type="submit" name="decision" value="APPROVED">Setujui</button></div>
      <p id="decision-error" class="notice error" hidden></p></form></section>`;
  root.innerHTML = `<section class="card hero"><p class="eyebrow">${esc(content.content_no)} · ${esc(content.brand_name)}</p><h1>${esc(content.title)}</h1><p>Ditujukan kepada ${esc(recipient)}</p></section>
    ${mediaSections}
    <section class="card"><h2>Ringkasan Final</h2>
      ${coordinatorMode ? `<div class="detail-grid"><div><span>Sumber</span><p>${content.production_mode === 'VENDOR' ? 'Produksi Vendor' : 'Produksi Internal'}</p></div><div><span>Jenis</span><p>${esc(content.content_type || '-')}</p></div><div><span>Channel</span><p>${esc((content.channels || []).join(', ') || 'Belum ditentukan')}</p></div><div><span>Rencana Tayang</span><p>${esc(formatDate(content.publish_at))}</p></div><div><span>Pengunggah</span><p>${esc(content.submitted_by_name || '-')}</p></div><div><span>Tanggal Dikirim</span><p>${esc(formatDate(content.created_at))}</p></div></div><h3>Keterangan</h3><p class="rich">${esc(content.description || '-')}</p>` : `<div class="detail-grid"><div><span>Tujuan</span><p>${esc(content.objective || '-')}</p></div><div><span>Audiens</span><p>${esc(content.audience || '-')}</p></div></div><h3>Brief / Script</h3><p class="rich">${esc(content.brief || '-')}</p><h3>Deskripsi</h3><p class="rich">${esc(content.description || '-')}</p>`}
      <h3>Caption / Isi Materi</h3><p class="rich">${esc(content.caption || '-')}</p>
      <div class="detail-grid"><div><span>Hashtag</span><p class="rich">${esc(content.hashtags || '-')}</p></div><div><span>${content.review_note != null ? 'Note (Catatan)' : 'CTA'}</span><p class="rich">${esc(content.review_note ?? content.call_to_action ?? '-')}</p></div></div>
    </section>
    ${decisionSection}`;
  document.querySelector('#decision-form')?.addEventListener('submit', decide);
  document.querySelectorAll('[data-fullscreen]').forEach(button => button.addEventListener('click', async () => {
    const video = document.querySelector(`[data-media-wrap="${button.dataset.fullscreen}"] video`);
    if (video?.requestFullscreen) await video.requestFullscreen();
    else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
  }));
}

async function decide(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const decision = submitter?.value;
  const values = new FormData(event.currentTarget);
  const note = values.get('note');
  const directorId = values.get('directorId');
  const pin = values.get('pin');
  const errorNode = document.querySelector('#decision-error');
  if (coordinatorMode && !/^\d{8}$/.test(String(pin || ''))) {
    errorNode.hidden = false; errorNode.textContent = 'Masukkan PIN Koordinator tepat 8 digit.'; return;
  }
  if (decision === 'REVISION' && !String(note).trim()) {
    errorNode.hidden = false; errorNode.textContent = 'Catatan revisi wajib diisi.'; return;
  }
  if (decision === 'DIRECTOR' && !directorId) {
    errorNode.hidden = false; errorNode.textContent = 'Pilih Direksi tujuan.'; return;
  }
  submitter.disabled = true;
  try {
    const result = await request(`${endpoint}/${encodeURIComponent(token)}/decision`, { method: 'POST', body: { decision, note, directorId, pin } });
    const message = decision === 'APPROVED' ? 'Konten disetujui, masuk Media Library, dan dapat dijadwalkan.' : decision === 'REVISION' ? 'Permintaan revisi sudah dikirim.' : `Konten diteruskan kepada ${result.directorName}.`;
    root.innerHTML = `<section class="card pin-card"><div class="notice success"><strong>Keputusan tersimpan</strong><br>${esc(message)}</div>${result.directorApprovalUrl ? `<p class="muted">Salin link berikut untuk dikirim kepada Direksi.</p><button id="copy-director-link" class="btn" type="button">Salin Link Approval Direksi</button>` : ''}</section>`;
    document.querySelector('#copy-director-link')?.addEventListener('click', async event => {
      await navigator.clipboard.writeText(new URL(result.directorApprovalUrl, location.origin).href);
      event.currentTarget.textContent = 'Link Tersalin';
    });
  } catch (error) {
    submitter.disabled = false; errorNode.hidden = false; errorNode.textContent = error.message;
  }
}

async function load() {
  try {
    const data = await request(`${endpoint}/${encodeURIComponent(token)}`);
    approvalView(data);
  } catch (error) {
    if (error.status === 401) return pinView(error.data);
    root.innerHTML = `<section class="card"><div class="notice error"><strong>Approval tidak dapat dibuka</strong><br>${esc(error.message)}</div></section>`;
  }
}

document.title = `Approval ${roleLabel} · AXINDO Media Hub`;
document.querySelector('.secure').textContent = `Approval ${roleLabel} · PIN terlindungi`;
load();
