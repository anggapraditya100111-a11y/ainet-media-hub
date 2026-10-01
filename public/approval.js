const root = document.querySelector('#approval-content');
const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const coordinatorMode = params.get('kind') === 'coordinator';
const endpoint = coordinatorMode ? '/api/public/coordinator-approvals' : '/api/public/approvals';
const roleLabel = coordinatorMode ? 'Koordinator' : 'Direksi';
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

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
  root.innerHTML = `<section class="card hero"><p class="eyebrow">${esc(content.content_no)} · ${esc(content.brand_name)}</p><h1>${esc(content.title)}</h1><p>Ditujukan kepada ${esc(recipient)}</p></section>
    <section class="card"><h2>Ringkasan Final</h2>
      ${coordinatorMode ? '' : `<div class="detail-grid"><div><span>Tujuan</span><p>${esc(content.objective || '-')}</p></div><div><span>Audiens</span><p>${esc(content.audience || '-')}</p></div></div><h3>Brief / Script</h3><p class="rich">${esc(content.brief || '-')}</p><h3>Deskripsi</h3><p class="rich">${esc(content.description || '-')}</p>`}
      <h3>Caption / Isi Materi</h3><p class="rich">${esc(content.caption || '-')}</p>
      <div class="detail-grid"><div><span>Hashtag</span><p class="rich">${esc(content.hashtags || '-')}</p></div><div><span>CTA</span><p class="rich">${esc(content.call_to_action || '-')}</p></div></div>
    </section>
    ${data.files.map((file, index) => `<section class="card"><div class="media" data-media-wrap="${index}">${media(file)}<div class="media-meta"><div><strong>${esc(file.original_name)}</strong><small>Versi ${file.version_number}</small></div><div class="actions">${String(file.mime_type || '').startsWith('video/') ? `<button class="btn btn-ghost" type="button" data-fullscreen="${index}">Layar Penuh</button>` : ''}<a class="btn btn-ghost" href="${esc(file.fileUrl)}?download=1">Unduh</a></div></div></div></section>`).join('')}
    <section class="card"><h2>Keputusan ${roleLabel}</h2><form id="decision-form" class="decision">
      <textarea name="note" maxlength="2000" placeholder="Catatan keputusan. Wajib diisi jika meminta revisi."></textarea>
      ${coordinatorMode ? `<label class="field"><span>Direksi tujuan (jika diteruskan)</span><select name="directorId"><option value="">Pilih Direksi</option>${directors}</select></label>` : ''}
      <div class="actions"><button class="btn btn-danger" type="submit" name="decision" value="REVISION">Minta Revisi</button>${coordinatorMode ? '<button class="btn" type="submit" name="decision" value="DIRECTOR">Teruskan ke Direksi</button>' : ''}<button class="btn btn-success" type="submit" name="decision" value="APPROVED">Setujui</button></div>
      <p id="decision-error" class="notice error" hidden></p></form></section>`;
  document.querySelector('#decision-form').addEventListener('submit', decide);
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
  const errorNode = document.querySelector('#decision-error');
  if (decision === 'REVISION' && !String(note).trim()) {
    errorNode.hidden = false; errorNode.textContent = 'Catatan revisi wajib diisi.'; return;
  }
  if (decision === 'DIRECTOR' && !directorId) {
    errorNode.hidden = false; errorNode.textContent = 'Pilih Direksi tujuan.'; return;
  }
  submitter.disabled = true;
  try {
    const result = await request(`${endpoint}/${encodeURIComponent(token)}/decision`, { method: 'POST', body: { decision, note, directorId } });
    const message = decision === 'APPROVED' ? 'Konten disetujui dan dapat dijadwalkan.' : decision === 'REVISION' ? 'Permintaan revisi sudah dikirim.' : `Konten diteruskan kepada ${result.directorName}.`;
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
