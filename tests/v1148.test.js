// v1.148: Case Group Summary rows and PDF; Secure Locker password age, reminder and Last Contact.
// Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/group-summary.js');
const L = require('../js/secure/locker-core.js');

test('group summary rows: one per case, charges from the Arrest Report, number order', () => {
  const cases = [
    { id: 'b', number: 'EX-200', subject: 'Jane Roe', status: 'Open', opened: '2026-02-01', nextDeadline: { date: '2026-11-03', title: 'Lab report due' } },
    { id: 'a', number: 'EX-100', subject: 'John Doe', status: 'Closed', opened: '2026-01-05' },
  ];
  const arrests = new Map([['a', { schema: 2, arrestees: [{ firstName: 'John', lastName: 'Doe', date: '2026-03-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery of a controlled substance' }] }] }]]);
  const rows = G.rows(cases, arrests);
  assert.deepStrictEqual(rows.map((r) => r.number), ['EX-100', 'EX-200']);
  assert.strictEqual(rows[0].arrested, 1);
  assert.ok(/570\/401 Delivery/.test(rows[0].charges[0]));
  assert.strictEqual(rows[1].deadline, 'November 3, 2026 · Lab report due');
  assert.strictEqual(rows[1].opened, 'February 1, 2026');
  const pdf = Buffer.from(G.build('Doe Family', rows, { printed: 'October 21, 2026' })).toString('latin1');
  assert.ok(pdf.startsWith('%PDF'));
  assert.ok(/CASE GROUP SUMMARY/.test(pdf) && /Doe Family/.test(pdf) && /EX-100/.test(pdf));
});

test('password age: set when new or changed, kept otherwise; the reminder marks old ones', () => {
  const fresh = L.withHistory({}, { id: 'a', site: 'S', password: 'One-1', history: [] }, '2026-01-01');
  assert.strictEqual(fresh.changed, '2026-01-01');
  const kept = L.withHistory(fresh, { ...fresh, notes: 'x' }, '2026-06-01');
  assert.strictEqual(kept.changed, '2026-01-01');
  const changed = L.withHistory(kept, { ...kept, password: 'Two-2' }, '2026-06-01');
  assert.strictEqual(changed.changed, '2026-06-01');
  assert.strictEqual(L.daysBetween('2026-01-01', '2026-06-01'), 151);
  assert.strictEqual(L.isStale(fresh, 90, '2026-06-01'), true);
  assert.strictEqual(L.isStale(fresh, 0, '2026-06-01'), false);
  assert.strictEqual(L.isStale({ changed: '' }, 90, '2026-06-01'), false);
  const d = L.normalizeData({ pwRemind: 180, passwords: [{ id: 'p', changed: '2026-01-01' }, { id: 'q', changed: 'soon' }], files: [{ id: 'abcdefgh12', name: 'CI-1.pdf', lastContact: '2026-10-01' }, { id: 'abcdefgh13', lastContact: 'x' }] });
  assert.strictEqual(d.pwRemind, 180);
  assert.deepStrictEqual(d.passwords.map((p) => p.changed), ['2026-01-01', '']);
  assert.deepStrictEqual(d.files.map((f) => f.lastContact), ['2026-10-01', '']);
  assert.strictEqual(L.normalizeData({ pwRemind: 45 }).pwRemind, 0);
});
