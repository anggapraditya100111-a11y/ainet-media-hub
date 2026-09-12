const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'public', 'popup.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));

test('login utama memakai popup AXINDO Access dengan handoff yang diverifikasi', () => {
  assert.match(html, /Masuk melalui AXINDO Access/);
  assert.match(app, /window\.open\(/);
  assert.match(app, /\/handoff\?handoff=media-hub/);
  assert.match(app, /axindo-access-handoff/);
  assert.match(app, /\/api\/auth\/access\/complete/);
  assert.match(app, /code_challenge/);
  assert.match(app, /popupCodeChallenge/);
  assert.match(app, /event\.origin !== active\.accessOrigin/);
  assert.match(app, /event\.source !== active\.window/);
  assert.match(app, /event\.data\?\.channel !== active\.channel/);
  assert.match(app, /active\.stage === 'exchange'/);
  assert.match(app, /Date\.now\(\) - active\.closedAt < 1500/);
  assert.doesNotMatch(app, /active\.window\.location = handoffUrl/);
  assert.doesNotMatch(app, /access_token|id_token|client_secret/i);
});

test('mode mobile menyediakan pola aplikasi Android dan PWA', () => {
  assert.match(html, /id="mobile-navigation"/);
  assert.match(html, /manifest\.webmanifest\?v=0\.3\.3/);
  assert.match(app, /renderMobileNavigation/);
  assert.match(css, /\.mobile-navigation/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(display-mode: standalone\)/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
});
