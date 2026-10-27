// v1.158: the privacy screen marks itself "locked" in the browser while it is on (no case data),
// so a refresh brings it back; the PIN clears the mark.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/privacy.js');

const env = (record, marks) => ({ show() {}, hide() {}, getTitle: () => 'CaseVault', setTitle() {}, getIcon: () => null, setIcon() {}, getPinRecord: () => record, remember: (on) => marks.push(on) });

test('lock keeps the mark; only the right PIN clears it', async () => {
  const record = await P.makePinRecord('2468', 1000);
  const marks = [];
  const c = P.createController(env(record, marks));
  c.lock();
  assert.deepStrictEqual(marks, [true]);
  assert.strictEqual((await c.unlock('1111')).ok, false);
  assert.deepStrictEqual(marks, [true], 'a wrong PIN leaves the mark');
  assert.strictEqual((await c.unlock('2468')).ok, true);
  assert.deepStrictEqual(marks, [true, false]);
});

test('without a browser store the lock still works', () => {
  const c = P.createController({ ...env(null, []), remember: () => { throw new Error('blocked'); } });
  assert.strictEqual(c.lock(), true);
  assert.strictEqual(c.locked, true);
  assert.strictEqual(P.wasLocked(), false); // no localStorage under Node
});

test('the app covers again, before drawing anything, when the vault opens after a refresh', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const i = app.indexOf('if (window.CVPrivacy && CVPrivacy.wasLocked()) CVPrivacy.lock();');
  assert.ok(i > 0);
  assert.ok(i < app.indexOf('renderCaseList();\n    route();', i), 'before the case list and the page are drawn');
});
