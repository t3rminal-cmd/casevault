// v1.145: the Password Manager keeps a password's old values when it is changed, and its rows can be
// arranged by hand or A to Z. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/secure/locker-core.js');

test('a changed password goes into its history, newest first', () => {
  const before = L.normalizeData({ passwords: [{ id: 'a1', site: 'Example Mail', username: 'jdoe', password: 'Old-1' }] }).passwords[0];
  assert.deepStrictEqual(before.history, []);
  const after = L.withHistory(before, { ...before, password: 'New-2' }, '2026-10-20');
  assert.deepStrictEqual(after.history, [{ password: 'Old-1', changed: '2026-10-20' }]);
  const again = L.withHistory(after, { ...after, password: 'Newest-3' }, '2026-11-01');
  assert.deepStrictEqual(again.history.map((x) => x.password), ['New-2', 'Old-1']);
  // Saving without a new password adds nothing.
  assert.strictEqual(L.withHistory(again, { ...again, notes: 'x' }, '2026-11-02').history.length, 2);
  // History kept by normalizeData (and only real entries, 20 at most).
  const many = Array.from({ length: 25 }, (_, i) => ({ password: `P${i}`, changed: '2026-01-01' }));
  const n = L.normalizeData({ passwords: [{ id: 'b', site: 'S', history: [...many, { password: '' }, null, { password: 'Q', changed: 'soon' }] }] }).passwords[0];
  assert.strictEqual(n.history.length, L.HISTORY_MAX);
  assert.strictEqual(L.normalizeData({ passwords: [{ id: 'c', history: [{ password: 'Q', changed: 'soon' }] }] }).passwords[0].history[0].changed, '');
  // Covert accounts have passwords too; aliases do not keep a history.
  assert.ok(Array.isArray(L.normalizeData({ accounts: [{ id: 'd', platform: 'Example Chat' }] }).accounts[0].history));
  assert.strictEqual(L.normalizeData({ aliases: [{ id: 'e', alias: 'Ricky' }] }).aliases[0].history, undefined);
});

test('rows move up and down and sort A to Z', () => {
  const rows = [{ id: '1', site: 'Zeta' }, { id: '2', site: 'alpha' }, { id: '3', site: 'Mid' }];
  assert.deepStrictEqual(L.moveRow(rows, '3', -1).map((r) => r.id), ['1', '3', '2']);
  assert.deepStrictEqual(L.moveRow(rows, '1', -1).map((r) => r.id), ['1', '2', '3']);
  assert.deepStrictEqual(L.moveRow(rows, '3', 1).map((r) => r.id), ['1', '2', '3']);
  assert.deepStrictEqual(L.sortRows('passwords', rows).map((r) => r.site), ['alpha', 'Mid', 'Zeta']);
  assert.deepStrictEqual(rows.map((r) => r.id), ['1', '2', '3'], 'the original list is not changed');
});
