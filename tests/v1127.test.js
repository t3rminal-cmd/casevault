// v1.127: one icon style. Every icon the program names has a colour picture, except the small
// controls (chevrons, the drag grip, the ⋮ menu), which stay plain shapes on purpose.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONTROLS = new Set(['chevron-down', 'chevron-up', 'chevron-left', 'chevron-right', 'grip-vertical', 'three-dots-vertical']);

test('every icon used in the app has a colour version (controls aside), and its file exists', () => {
  global.window = {}; const root = {}; // icons.js attaches CVIcons to `this`
  const src = fs.readFileSync(path.join(ROOT, 'js/icons.js'), 'utf8');
  new Function(src).call(root);
  const { COLOR } = root.CVIcons;
  const files = execSync('git ls-files js index.html', { cwd: ROOT }).toString().trim().split('\n').filter((f) => /\.(js|html)$/.test(f) && !f.includes('icons-data'));
  const used = new Set();
  for (const f of files) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const re of [/\bI\('([a-z0-9-]+)'/g, /\bicon:\s*'([a-z0-9-]+)'/g, /data-icon="([a-z0-9-]+)"/g, /\.icon\('([a-z0-9-]+)'/g]) for (const m of t.matchAll(re)) used.add(m[1]);
  }
  const plain = [...used].filter((n) => !COLOR[n] && !CONTROLS.has(n));
  assert.deepStrictEqual(plain, [], `icons drawn as plain shapes: ${plain.join(', ')}`);
  const missing = [...new Set(Object.values(COLOR))].filter((f) => !fs.existsSync(path.join(ROOT, 'icons/color', `${f}.png`)));
  assert.deepStrictEqual(missing, [], `colour icons without a file: ${missing.join(', ')}`);
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const f of ['list-numbered', 'hash', 'marshal-star']) assert.ok(sw.includes(`./icons/color/${f}.png`), `${f} is cached for offline use`);
});
