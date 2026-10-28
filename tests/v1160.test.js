// v1.160: the Timeline Paid box as money, the CLOSED count, and the drop-down lists that follow
// their box when the window scrolls. All data is synthetic.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const O = require('../js/operation.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Paid: money while typed, cents when the box is left', () => {
  assert.strictEqual(O.moneyTyped('1234.5'), '$1,234.5');
  assert.strictEqual(O.moneyTyped('1234.5', true), '$1,234.50');
  assert.strictEqual(O.moneyTyped('$1,234,567'), '$1,234,567');
  assert.strictEqual(O.moneyTyped('40', true), '$40.00');
  assert.strictEqual(O.moneyTyped('1.2.3.4'), '$1.23');
  assert.strictEqual(O.moneyTyped('007'), '$7');
  assert.strictEqual(O.moneyTyped('.5', true), '$0.50');
  assert.strictEqual(O.moneyTyped('abc'), '');
  assert.strictEqual(O.moneyTyped('', true), '');
  assert.strictEqual(O.money(Number('1234.50')), '$1,234.50');
});

test('CLOSED count (no icon since v1.161), and lists that move with their box', () => {
  assert.match(read('js/app.js'), /countBadge\(n, 'op-count closed-count'/); // v1.165: through countBadge
  assert.match(read('js/select.js'), /function place\(\)/);
  assert.match(read('js/combo.js'), /function place\(\)/);
  assert.match(read('css/app.css'), /\.locker-acts \{ display: grid;/);
});
