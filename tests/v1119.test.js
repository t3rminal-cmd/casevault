// v1.119: buys on the timeline and their summary, the Timeline PDF, the person view, copying an
// arrestee and a Mission's closing progress. Made-up people only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const O = require('../js/operation.js');
const K = require('../js/closing.js');
const P = require('../js/person-view.js');
const T = require('../js/timeline-pdf.js');

const rows = () => O.mergeEvents([{ caseId: 'a', number: 'EX-1', events: [
  { date: '2026-01-02', kind: 'buy', title: 'Buy 1', suspect: 'John Doe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' },
  { date: '2026-01-09', kind: 'buy', title: 'Buy 2', suspect: 'john  doe', drug: 'Cocaine', qty: '7', unit: 'g', paid: '$1,000.50' },
  { date: '2026-01-05', kind: 'buy', title: 'Buy 3', suspect: '', drug: 'Heroin', qty: '1', paid: '90' },
  { date: '2026-01-06', kind: 'event', title: 'Surveillance', suspect: 'Rick Poe' },
] }]);

test('buySummary groups buys by suspect with totals; unnamed buys last', () => {
  const g = O.buySummary(rows());
  assert.deepStrictEqual(g.map((x) => [x.name, x.buys.length, x.paid]), [['John Doe', 2, 1200.5], ['No suspect named', 1, 90]]);
  assert.deepStrictEqual(g[0].drugs, [{ drug: 'Cocaine', amounts: [{ unit: 'g', qty: 10.5 }] }]);
  assert.ok(O.isColor(g[0].color));
  assert.strictEqual(O.buyLine({ drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }), 'Cocaine · 3.5 g · $200');
  assert.strictEqual(O.money(1200.5), '$1,200.50');
});

test('the Timeline PDF lists the events and the buy summary', () => {
  const s = Buffer.from(T.build({ title: 'Timeline', number: 'OP-1', rows: rows(), fmtDate: (d) => d })).toString('latin1');
  assert.ok(s.startsWith('%PDF'));
  for (const w of ['TIMELINE', 'Surveillance', 'BUY SUMMARY', 'No suspect named', 'Cocaine 10.5 g']) assert.ok(s.includes(w), w);
  const only = Buffer.from(T.build({ title: 'Buy Summary', rows: rows(), timeline: false })).toString('latin1');
  assert.ok(!only.includes('Surveillance') && only.includes('BUY SUMMARY'));
});

test('appearances finds a person as subject, suspect, arrestee or on a timeline, and other spellings', () => {
  const r = P.appearances('John Doe', [
    { id: 'a', number: 'EX-1', subject: 'DOE, John', suspects: [{ name: 'Jon Doe', role: 'Primary' }] },
    { id: 'b', number: 'EX-2', subject: 'Jane Roe', people: ['John Doe'] },
    { id: 'c', number: 'EX-3', subject: 'Rick Poe' },
    { id: 'd', number: 'EX-4', subject: 'Mary Poe' },
  ], { c: { events: [{ date: '2026-01-01', title: 'Buy', suspect: 'john doe' }] } });
  assert.deepStrictEqual(r.rows.map((x) => [x.c.number, x.roles.join('+')]), [['EX-1', 'Subject+Primary'], ['EX-2', 'Arrestee'], ['EX-3', 'On the timeline']]);
  assert.deepStrictEqual(r.variants, ['Jon Doe']);
});

test('copyArrestee keeps the person and sets this RD; charges and property stay behind', () => {
  const src = { ...K.emptyArrestee(), firstName: 'John', lastName: 'Doe', dob: '1990-01-02', rdNumber: 'EX-1', charges: [{ ...K.emptyCharge(), statute: '720 ILCS 570/401' }], properties: [{ inventory: '7000001', description: 'Prisoner Money' }], narrative: 'Made up.' };
  const a = K.copyArrestee(src, 'EX-2');
  assert.strictEqual(a.firstName, 'John'); assert.strictEqual(a.dob, '1990-01-02'); assert.strictEqual(a.rdNumber, 'EX-2');
  assert.deepStrictEqual(a.properties, []); assert.strictEqual(a.narrative, ''); assert.ok(!K.chargesText(a.charges));
});

test('missionProgress says what each case number needs to close', () => {
  const ready = { arrestees: [{ firstName: 'John', lastName: 'Doe', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] };
  const p = K.missionProgress([
    { id: 'a', number: 'EX-1', status: 'Open' }, { id: 'b', number: 'EX-2', status: 'Open' },
    { id: 'c', number: 'EX-3', status: 'Closed', closure: { arrestRef: { number: 'EX-2' } } }, { id: 'd', number: 'EX-4', archived: true },
  ], new Map([['b', ready]]));
  assert.deepStrictEqual([p.done, p.total], [2, 4]);
  assert.deepStrictEqual([...p.rows.values()].map((r) => r.state), ['ref', 'ready', 'closed', 'archived']);
  assert.strictEqual(K.missionProgress([{ id: 'a', number: 'EX-1', status: 'Open' }], new Map()).rows.get('a').state, 'open');
});
