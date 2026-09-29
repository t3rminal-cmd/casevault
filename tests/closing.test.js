// Case status rules, closing a case and arrest details (js/closing.js). Made-up people only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/closing.js');
const D = require('../js/drafts/draft-core.js');

const sampleArrest = () => {
  const a = C.emptyArrest();
  Object.assign(a.arrestees[0], {
    firstName: 'Jordan', lastName: 'Placeholder', dob: '1990-04-02', sex: 'Male', race: 'Test', height: '5\'10"', weight: '170 lb', hair: 'Brown', eyes: 'Blue',
    date: '2026-03-14', time: '23:05', location: 'Sample Street', type: 'On-view', arrestingOfficer: 'Officer Alex Sample', bookingNumber: 'B-0001', facility: 'Example County Jail', bond: '$5,000',
    charges: [
      { statute: 'TEST 1.01', description: 'Possession of a controlled substance', level: 'Felony', degree: '3rd degree', counts: '1' },
      { statute: 'TEST 2.02', description: 'Discharge of a firearm', level: 'Misdemeanor', degree: 'Class A', counts: '2' },
      { statute: '', description: '', level: '', degree: '', counts: '1' },
    ],
  });
  return a;
};

test('status help and dispositions are complete', () => {
  for (const s of ['Open', 'Pending', 'Closed', 'Archived']) assert.ok(C.STATUS_HELP[s].startsWith(s), s);
  assert.deepStrictEqual(C.DISPOSITIONS.map((d) => d.key), ['arrest', 'exceptional', 'unfounded', 'inactive', 'referred', 'other']);
  assert.ok(C.disposition('exceptional').reasons.includes('Prosecution declined'));
  assert.strictEqual(C.disposition('nope'), null);
});

test('arrest details become {{arrest.*}} template values', () => {
  const ctx = C.arrestContext(sampleArrest());
  assert.strictEqual(ctx['arrest.name'], 'Jordan Placeholder');
  assert.strictEqual(ctx['arrest.dob'], '04/02/1990');
  assert.strictEqual(ctx['arrest.date'], '03/14/2026');
  assert.strictEqual(ctx['arrest.time'], '23:05');
  assert.strictEqual(ctx['arrest.description'], 'Male, Test, 5\'10", 170 lb, Brown hair, Blue eyes');
  assert.strictEqual(ctx['arrest.charges'], '1. TEST 1.01 — Possession of a controlled substance (Felony, 3rd degree)\n2. TEST 2.02 — Discharge of a firearm (Misdemeanor, Class A; 2 counts)');
  assert.strictEqual(ctx['arrest.1.name'], 'Jordan Placeholder');
  assert.strictEqual(ctx['arrest.count'], '1');
  // Filled into a template; empty fields still ask to be confirmed.
  const out = D.fillTemplate('{{arrest.name}}, DOB {{arrest.dob}}, booked {{arrest.bookingNumber}} at {{arrest.facility}}. Miranda: {{arrest.miranda}}.\n{{arrest.charges}}', D.templateContext({}, new Date(2026, 8, 29), null, ctx));
  assert.strictEqual(out, 'Jordan Placeholder, DOB 04/02/1990, booked B-0001 at Example County Jail. Miranda: [CONFIRM: arrest.miranda].\n1. TEST 1.01 — Possession of a controlled substance (Felony, 3rd degree)\n2. TEST 2.02 — Discharge of a firearm (Misdemeanor, Class A; 2 counts)');
});

test('closure values and the close checklist', () => {
  assert.deepStrictEqual(C.closureContext({ disposition: 'exceptional', reason: 'Prosecution declined', date: '2026-09-29', note: 'DA letter in Email.' }),
    { 'closure.disposition': 'Exceptionally cleared', 'closure.reason': 'Prosecution declined', 'closure.date': '09/29/2026', 'closure.note': 'DA letter in Email.' });
  const list = C.closeChecklist({
    timeline: { events: [{ kind: 'deadline', title: 'File affidavit', done: false }, { kind: 'deadline', title: 'Old', done: true }, { kind: 'event', title: 'Arrest' }] },
    checks: [{ open: 2 }, { open: 1 }],
    drafts: [{ title: 'Affidavit', confirm: 3 }, { title: 'Memo', confirm: 0 }],
  });
  assert.deepStrictEqual(list.map((x) => x.kind), ['deadlines', 'flags', 'confirm']);
  assert.match(list[0].text, /1 open deadline on the timeline: File affidavit/);
  assert.match(list[1].text, /3 consistency check flags are still open/);
  assert.match(list[2].text, /"Affidavit" \(3\)/);
  assert.deepStrictEqual(C.closeChecklist({}), []);
});

test('Pending follow-up deadline, and arrestees for the privacy scan', () => {
  const e = C.followUpEvent('Lab results', 'item 1', '2026-10-06', 'x1');
  assert.deepStrictEqual([e.kind, e.date, e.title, e.done], ['deadline', '2026-10-06', 'Follow up: Lab results — item 1', false]);
  assert.deepStrictEqual(C.peopleOf(sampleArrest()), ['Jordan Placeholder']);
});
