const crypto = require('node:crypto');

const APP_PEPPER = String(process.env.APP_PEPPER || 'change-this-pepper-before-production');

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(purpose, token) {
  return crypto.createHmac('sha256', APP_PEPPER).update(`${purpose}|${token}`).digest('base64url');
}

function assertPassword(password) {
  const value = String(password || '');
  if (value.length < 8 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    const error = new Error('Password minimal 8 karakter dan harus memuat huruf serta angka.');
    error.status = 400;
    throw error;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  assertPassword(password);
  return {
    salt,
    hash: crypto.scryptSync(`${password}|${APP_PEPPER}`, salt, 64).toString('base64url')
  };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = Buffer.from(crypto.scryptSync(`${password}|${APP_PEPPER}`, salt, 64).toString('base64url'));
  const expected = Buffer.from(String(expectedHash));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function cleanText(value, max = 1000) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}

function cleanUsername(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60);
}

function safeFilename(value) {
  const raw = String(value || 'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return raw.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 100) || 'file';
}

function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  newId, randomToken, hashToken, assertPassword, hashPassword, verifyPassword,
  cleanText, cleanUsername, safeFilename, checksum
};
