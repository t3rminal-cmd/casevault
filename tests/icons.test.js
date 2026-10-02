// Every icon the app asks for exists in js/icons-data.js (a missing one would draw nothing).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ICONS = require('../js/icons-data.js');
const { COLOR } = require('../js/icons.js').CVIcons; // v1.51: colour pictures

const root = path.join(__dirname, '..');
const files = ['index.html', ...['js', 'js/checker', 'js/drafts', 'js/secure', 'js/reference', 'js/ai'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.js') && f !== 'icons-data.js').map((f) => `${d}/${f}`))];

test('icon data is well formed', () => {
  assert.ok(Object.keys(ICONS).length > 50);
  for (const [name, els] of Object.entries(ICONS)) {
    assert.ok(Array.isArray(els) && els.length, name);
    for (const [tag, attrs] of els) { assert.match(tag, /^(path|circle|rect|ellipse)$/); assert.strictEqual(typeof attrs, 'object'); }
  }
});

test('every icon name used in the app exists', () => {
  const used = new Map();
  const add = (name, file) => { if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) used.set(name, file); };
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/\bicon:\s*'([^']+)'/g)) add(m[1], f);
    for (const m of src.matchAll(/data-icon="([^"]+)"/g)) add(m[1], f);
    for (const m of src.matchAll(/(?:\bI|\bicon)\(([^()]*)\)/g)) {
      // Skip the options ({ cls: 'x', label: 'y' }) and the conditions (st === 'x') in the call.
      const args = m[1].replace(/\b(cls|label):\s*'[^']*'/g, '').replace(/[=!]==?\s*'[^']*'/g, '');
      for (const s of args.matchAll(/'([^']+)'/g)) add(s[1], f);
    }
    for (const m of src.matchAll(/_ICONS\s*=\s*\{([\s\S]*?)\};/g)) for (const s of m[1].matchAll(/:\s*'([^']+)'/g)) add(s[1], f);
  }
  assert.ok(used.size > 40, `found ${used.size} icon names`);
  const missing = [...used].filter(([n]) => !ICONS[n] && !COLOR[n]).map(([n, f]) => `${n} (${f})`);
  assert.deepStrictEqual(missing, []);
});

test('v1.51: every colour icon has its picture, and every picture is used', () => {
  const dir = path.join(root, 'icons', 'color');
  const pics = new Set(fs.readdirSync(dir).map((f) => f.replace(/\.png$/, '')));
  const named = new Set(Object.values(COLOR));
  assert.deepStrictEqual([...named].filter((f) => !pics.has(f)), [], 'missing pictures');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.deepStrictEqual([...pics].filter((f) => !sw.includes(`./icons/color/${f}.png`)), [], 'not cached by the service worker');
});
