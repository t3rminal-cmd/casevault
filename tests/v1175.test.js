// v1.175: Suspect Search (arrests, police interactions, the kinds of arrest) and the Rolodex.
// All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/person-view.js');
const R = require('../js/rolodex.js');

const cases = [
  { id: 'a', number: 'EX-1', subject: 'Rick Poe', status: 'Closed', suspects: [{ name: 'Rick Poe', dob: '1990-01-02', info: { gender: 'Male', irNumber: '1234567' } }] },
  { id: 'b', number: 'EX-2', subject: 'Ann Roe', status: 'Open', suspects: [{ name: 'Ann Roe' }] },
];
const arrests = {
  a: { arrestees: [{ firstName: 'Rick', lastName: 'Poe', dob: '1990-01-02', sex: 'Male', bookingNumber: '99887766', date: '2026-04-01', time: '21:40', location: '100 Example Street',
    charges: [{ statute: '720 ILCS 570/401(c)(2)', description: 'Manufacture/delivery of cocaine' }, { statute: '720 ILCS 5/24-1.6', description: 'Aggravated unlawful use of a weapon' }], narcotics: [] }] },
  b: { arrestees: [{ firstName: 'Rick', lastName: 'Poe', date: '2025-06-10', charges: [{ statute: '720 ILCS 5/12-3', description: 'Battery' }] }, { firstName: 'Ann', lastName: 'Roe', date: '2026-02-02', charges: [{ description: '' }] }] },
};

test('the kinds of arrest from a charge\'s statute or words', () => {
  assert.deepStrictEqual(P.chargeKinds({ statute: '720 ILCS 570/402' }), ['narcotics']);
  assert.deepStrictEqual(P.chargeKinds({ statute: '720 ILCS 5/12-3.05', description: 'Aggravated battery' }), ['battery']);
  assert.deepStrictEqual(P.chargeKinds({ statute: '430 ILCS 65/2' }), ['firearms']);
  assert.deepStrictEqual(P.chargeKinds('UUW - felon', 'possession of cannabis', 'domestic battery'), ['narcotics', 'battery', 'firearms']);
  assert.deepStrictEqual(P.chargeKinds({ statute: '625 ILCS 5/6-303', description: 'Driving while license suspended' }), []);
});

test('a person\'s arrests on every case, oldest first, with what they were for', () => {
  const arr = P.arrestsOf('Rick Poe', cases, arrests);
  assert.deepStrictEqual(arr.map((x) => [x.c.number, x.date, x.kinds]), [['EX-2', '2025-06-10', ['battery']], ['EX-1', '2026-04-01', ['narcotics', 'firearms']]]);
  assert.strictEqual(arr[1].charges.length, 2);
});

test('police interactions: arrests and the Timeline events naming them, an arrest on both shown once', () => {
  const arr = P.arrestsOf('Rick Poe', cases, arrests);
  const rows = [{ c: cases[0], events: [{ kind: 'buy', date: '2026-03-04', title: 'Buy 1', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }, { kind: 'arrest', date: '2026-04-01', title: 'Arrest of Rick Poe' }] }];
  const life = P.interactions(rows, arr);
  assert.deepStrictEqual(life.map((x) => [x.date, x.kind]), [['2025-06-10', 'arrest'], ['2026-03-04', 'buy'], ['2026-04-01', 'arrest']]);
  assert.deepStrictEqual(life[1].kinds, ['narcotics']);
});

test('what is known of the person, and Suspect Search over everyone (closed cases too)', () => {
  assert.deepStrictEqual(P.profileOf('Rick Poe', cases, arrests), { dob: '1990-01-02', gender: 'Male', ir: '1234567', cb: '99887766', race: '' });
  const all = P.everyone(cases, arrests);
  const rick = all.find((x) => x.name === 'Rick Poe');
  assert.deepStrictEqual([rick.numbers, rick.arrests, rick.kinds, rick.ir], [['EX-1', 'EX-2'], 2, ['narcotics', 'battery', 'firearms'], '1234567']);
  assert.ok(all.some((x) => x.name === 'Ann Roe'));
});

test('the Rolodex: kinds, search, suggestions, and a case\'s contact remembered once', () => {
  let r = R.remember([], { kind: 'ASA', name: 'Ann Roe', agency: 'Example County State\'s Attorney', email: 'ann.roe@example.com' });
  assert.ok(r.added);
  r = R.remember(r.list, { kind: 'ASA', name: 'ann roe', phone: '555-0100' });
  assert.deepStrictEqual([r.added, r.changed, r.list.length, r.list[0].phone], [false, 1, 1, '555-0100']);
  const list = R.sorted([...r.list, { kind: 'AUSA', name: 'John Doe' }, { kind: 'Other Police', name: 'Det. Poe', agency: 'Example City PD' }, { kind: 'Bogus', name: 'Jane Poe' }, { kind: 'ASA', name: '' }]);
  assert.deepStrictEqual(list.map((x) => `${x.kind}:${x.name}`), ['ASA:Ann Roe', 'AUSA:John Doe', 'Other Police:Det. Poe', 'Other:Jane Poe']);
  assert.deepStrictEqual(R.find(list, 'example city').map((x) => x.name), ['Det. Poe']);
  assert.deepStrictEqual(R.comboItems(list, ['ASA', 'AUSA']).map((x) => `${x.value} | ${x.hint}`), ['Ann Roe | ASA · Example County State\'s Attorney', 'John Doe | AUSA']);
});
