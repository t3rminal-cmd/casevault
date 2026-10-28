// v1.165: certificate groups, the AI keep-loaded choice, the AI skipping statements the rules
// already settled, and the folder counts. All data is synthetic (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../js/training.js');
const A = require('../js/checker/ai.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('certificate groups: in their order, ungrouped last; names merged regardless of capitals', () => {
  const files = ['a', 'b', 'c', 'd', 'e'].map((b) => ({ base: `${b}.pdf` }));
  const meta = { 'a.pdf': { group: 'CPR' }, 'c.pdf': { group: 'Firearms' }, 'd.pdf': { group: 'cpr' }, '.order': ['c.pdf', 'a.pdf'] };
  const g = T.grouped(T.ordered(files, meta), meta);
  assert.deepStrictEqual(g.map((x) => [x.group, x.files.map((f) => f.base)]), [['Firearms', ['c.pdf']], ['CPR', ['a.pdf', 'd.pdf']], ['', ['b.pdf', 'e.pdf']]]);
  assert.deepStrictEqual(T.groupNames(meta), ['CPR', 'Firearms']);
  // No group anywhere: one group, the cards as before.
  assert.deepStrictEqual(T.grouped(files, {}).map((x) => x.group), ['']);
  // A certificate without a group keeps the old shape (no group key).
  assert.deepStrictEqual(T.normalize({ course: 'X' }), { course: 'X', provider: '', date: '', expires: '', hours: '' });
  assert.strictEqual(T.normalize({ group: '  Firearms  ' }).group, 'Firearms');
});

test('AI keep-loaded: the choice on this PC; "Unload When Done" stays loaded during a task', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    assert.strictEqual(A.keepChoice(), '10m');
    A.setKeepChoice('2m');
    assert.strictEqual(A.keepAlive(), '2m');
    assert.strictEqual(A.keepMs(), 120e3);
    A.setKeepChoice('0');
    assert.strictEqual(A.keepChoice(), '0');
    assert.strictEqual(A.keepAlive(), '2m'); // between the requests of one check
    A.setKeepChoice('10m');
    assert.ok(!store.has('cv-ai-keep'), 'the default is not stored');
    store.set('cv-ai-keep', 'nonsense');
    assert.strictEqual(A.keepChoice(), '10m');
  } finally { delete globalThis.localStorage; }
});

const docs = (aff, rep) => [
  { name: 'Affidavit', role: 'affidavit', docIndex: 0, paragraphs: [{ index: 0, page: 1, text: aff }] },
  { name: 'Report', role: 'report', docIndex: 1, paragraphs: [{ index: 0, page: 1, text: rep }] },
];

test('AI quick review: a statement the rules surely flagged, or a report repeats word for word, is not sent', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ message: { content: '{"verdict":"not_found","passage":0,"quote":"","explanation":"","confidence":"low"}' } }) }; };
  const aff = 'On March 1, 2026, the undercover officer met John Doe near the Example City park and bought cocaine. The officer then drove John Doe north on Example Avenue to the station.';
  const rep = 'On march 1, 2026 the undercover officer met John Doe near the Example City park, and bought cocaine! The officer then drove John Doe south on Example Avenue to the station.';
  const r = await A.review({ docs: docs(aff, rep), engine: { base: 'x', model: 'm' }, fetchImpl });
  assert.strictEqual(r.stats.skipped, 1); // the first sentence: same words
  assert.strictEqual(r.stats.supported, 1);
  assert.strictEqual(calls, 1); // "north" / "south": one word changed, so it still goes to the AI
  // A statement the rules flagged as a sure mismatch is not sent either.
  calls = 0;
  const ruleFlags = [{ layer: 'rules', severity: 'High', confidence: 'High', statement: { docIndex: 0, start: aff.indexOf('The officer') } }];
  const r2 = await A.review({ docs: docs(aff, rep), engine: { base: 'x', model: 'm' }, fetchImpl, ruleFlags });
  assert.strictEqual(calls, 0);
  assert.strictEqual(r2.stats.skipped, 2);
  // quick: false sends everything, as before.
  calls = 0;
  await A.review({ docs: docs(aff, rep), engine: { base: 'x', model: 'm' }, fetchImpl, ruleFlags, quick: false });
  assert.strictEqual(calls, 2);
});

test('folder counts from 0 everywhere; no + in the case list', () => {
  const app = read('js/app.js');
  assert.match(app, /const countBadge = \(n, cls = 'op-folder-count', what = 'case'\)/);
  assert.ok(!/length > 1 \? h\('span', \{ class: 'op-folder-count' \}/.test(app), 'no tile hides a count of 1');
  assert.ok(!/class: 'icon-btn mission-add/.test(app) && !/general-add/.test(app), 'no + buttons in the case list');
});
