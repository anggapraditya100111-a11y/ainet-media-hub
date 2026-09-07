const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, assertPassword, cleanText, safeFilename } = require('../src/security');

test('password di-hash dan diverifikasi dengan scrypt', () => {
  const credentials = hashPassword('Rahasia123');
  assert.notEqual(credentials.hash, 'Rahasia123');
  assert.equal(verifyPassword('Rahasia123', credentials.salt, credentials.hash), true);
  assert.equal(verifyPassword('Salah123', credentials.salt, credentials.hash), false);
});

test('password lemah ditolak', () => {
  assert.throws(() => assertPassword('pendek'), /minimal 8 karakter/);
  assert.throws(() => assertPassword('tanpaangka'), /huruf serta angka/);
});

test('teks dan nama file dibersihkan', () => {
  assert.equal(cleanText('  <script>halo</script>  '), 'scripthalo/script');
  assert.equal(safeFilename('../../Brosur Produk 2026.pdf'), 'Brosur-Produk-2026.pdf');
});
