// v1.169: Buy and Surveillance pairs chosen by hand, inventory numbers against the evidence list,
// and a past check that went out of date. All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/checker/rules.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const doc = (name, text, role = 'report') => ({ name, role, paragraphs: [{ index: 0, page: 1, text }] });

test('pairs by hand: a kind over the name, a Surveillance report chosen, or Not Paired', () => {
  const docs = [doc('Report A.txt', 'On 03/04/2026 Inventory #12345678.'), doc('Surv 1.txt', 'On 03/04/2026 Inventory #12345678.'), doc('Surv 2.txt', 'On 03/05/2026 Inventory #99999999.')];
  assert.deepStrictEqual(R.pairReports(docs), [], 'no Buy report by its name');
  assert.deepStrictEqual(R.pairReports(docs, { kinds: { 'Report A.txt': 'buy' } }).map((p) => [p.buy, p.surv]), [[0, 1]]);
  const hand = R.pairReports(docs, { kinds: { 'Report A.txt': 'buy' }, fixed: { 'Report A.txt': 'Surv 2.txt' } });
  assert.deepStrictEqual(hand.map((p) => [p.buy, p.surv, p.why]), [[0, 2, 'paired by hand']]);
  assert.deepStrictEqual(R.pairReports(docs, { kinds: { 'Report A.txt': 'buy' }, fixed: { 'Report A.txt': '' } }), []);
  assert.deepStrictEqual(R.pairReports([doc('Buy 1.txt', 'x'), doc('Surv 1.txt', 'y')], { kinds: { 'Surv 1.txt': 'other' } }), []);
});

test('inventory numbers against the evidence list: a typo, one missing from the list, one in no document', () => {
  const docs = [doc('Buy 1.txt', 'Inventoried under Inventory #12345678 and #22222222 and #77777777.')];
  const evidence = [{ number: 1, inventory: '12345678' }, { number: 2, inventory: '22222232' }, { number: 3, inventory: '55555555', description: 'US currency' }, { number: 4, inventory: '' }];
  const t = R.compare(docs, { evidence }).map((f) => [f.severity, f.title, f.sourceLabel || '']);
  assert.ok(t.some(([s, x]) => s === 'High' && /"22222222" vs Exhibit 2's 22222232/.test(x)), JSON.stringify(t));
  assert.ok(t.some(([s, x]) => s === 'Medium' && /77777777 is not on the evidence list/.test(x)));
  assert.ok(t.some(([s, x, src]) => s === 'Low' && /Exhibit 3 \(Inventory 55555555\)/.test(x) && src === 'Not in the documents checked'));
  assert.ok(!t.some(([, x]) => /12345678/.test(x)), 'a listed number is fine');
  assert.deepStrictEqual(R.compare(docs, { evidence: [] }).filter((f) => f.type === 'inventory'), [], 'no list: nothing about it');
});

test('a past check knows its documents (to tell when one changed); export is checked first', () => {
  assert.match(read('js/vault.js'), /documents: \(c\.documents \|\| \[\]\)\.map/);
  const ui = read('js/drafts/drafts-ui.js');
  assert.strictEqual((ui.match(/CVChecks\.confirmExport\(c, \{ slug, title: meta\.title, text: ta\.value/g) || []).length, 3, 'Export, PDF View and Word View');
});

test('sidebar: no X on a closed case with an arrest; the folder name unfolds it', () => {
  const app = read('js/app.js');
  assert.ok(!/closed-arrest/.test(app) && !/closed-arrest/.test(read('css/app.css')));
  assert.match(app, /function alignFolderHeads\(list\)/);
  assert.strictEqual((app.match(/onArrow\(e, e\.currentTarget\)/g) || []).length, 3);
  assert.ok(!/brand-vault/.test(read('index.html')), 'no logo at the top left');
});
