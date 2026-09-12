(() => {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') === 'success' ? 'success' : 'error';
  const channel = params.get('channel') || '';
  const message = params.get('message') || (status === 'success'
    ? 'Login berhasil. Media Hub sedang dibuka.'
    : 'Login belum berhasil. Silakan tutup popup dan coba kembali.');

  document.getElementById('popup-title').textContent = status === 'success' ? 'Login berhasil' : 'Login belum berhasil';
  document.getElementById('popup-message').textContent = message;
  document.body.classList.toggle('popup-error', status !== 'success');

  if (window.opener && window.opener !== window) {
    window.opener.postMessage({ type: 'media-hub-auth', status, message, channel }, window.location.origin);
  }
  if (status === 'success') window.setTimeout(() => window.close(), 700);
})();
