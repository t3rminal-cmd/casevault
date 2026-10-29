// v1.174: suspects of closed cases are not suggested; the New Case search of the known suspects.
// All data is synthetic (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/person-view.js');

const cases = [
  { id: 'a', number: 'EX-1', status: 'Open', suspects: [{ name: 'Rick Poe', dob: '1990-01-02', info: { gender: 'Male' } }] },
  { id: 'b', number: 'EX-2', status: 'Open', operationId: 'op1', suspects: [{ name: 'Rick Poe', dob: '', info: { irNumber: '1234567' } }, { name: 'Unknown', notIdentified: true }] },
  { id: 'c', number: 'EX-3', status: 'Closed', suspects: [{ name: 'Jane Roe', dob: '1985-05-05' }] },
  { id: 'd', number: 'EX-4', status: 'Open', archived: true, suspects: [{ name: 'Ann Doe' }] },
];

test('closed and archived cases: their suspects are not suggested', () => {
  assert.ok(P.isClosedCase(cases[2]) && P.isClosedCase(cases[3]) && P.isClosedCase({ status: 'Archived' }) && !P.isClosedCase(cases[0]));
  const names = P.suspectsOf(cases).map((x) => x.name);
  assert.deepStrictEqual(names, ['Rick Poe']);
});

test('known suspects: one per name, the details joined from each open case', () => {
  const [x] = P.suspectsOf(cases);
  assert.deepStrictEqual([x.name, x.dob, x.gender, x.ir, x.numbers], ['Rick Poe', '1990-01-02', 'Male', '1234567', ['EX-2', 'EX-1']]);
  assert.strictEqual(P.suspectsOf(cases, { id: 'a' })[0].dob, '', 'the case being edited is left out');
});

test('the search: every word typed, in the name, date of birth or IR number', () => {
  const list = P.suspectsOf(cases);
  assert.strictEqual(P.searchSuspects(list, 'poe').length, 1);
  assert.strictEqual(P.searchSuspects(list, 'rick 1990').length, 1);
  assert.strictEqual(P.searchSuspects(list, '1234567').length, 1);
  assert.strictEqual(P.searchSuspects(list, 'roe').length, 0);
  assert.strictEqual(P.searchSuspects(list, '  ').length, 0);
});
