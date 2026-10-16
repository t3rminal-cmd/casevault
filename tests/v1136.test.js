// v1.136: Year Summary: counts from the case index and the Arrest Reports, and its PDF. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Y = require('../js/year-summary.js');
const K = require('../js/closing.js');

const entries = [
  { id: 'a', number: 'EX-1', opened: '2026-01-05', closed: '2026-06-01', archived: '' },
  { id: 'b', number: 'EX-2', opened: '2025-11-20', closed: '2026-02-10', archived: '2026-03-01' },
  { id: 'c', number: 'EX-3', opened: '2026-09-09', closed: '', archived: '' },
];
const person = (first, date, charges, narcotics = [], extra = {}) => ({ ...K.emptyArrestee(), firstName: first, lastName: 'Doe', date, charges, narcotics, ...extra });
const arrests = new Map([
  ['a', { arrestees: [
    person('John', '2026-01-07', [{ ...K.emptyCharge(), statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance', level: 'Felony' }],
      [{ drug: 'Cocaine', amount: '12.5', unit: 'g' }, { drug: 'cocaine', amount: '2.5', unit: 'g' }]),
    person('Jane', '2026-01-20', [{ ...K.emptyCharge(), statute: '720 ILCS 550/4(b)', description: 'Possession of Cannabis, 10 to 30 grams, first offense' }],
      [{ drug: 'Cannabis', amount: '20', unit: 'g' }]),
  ] }],
  ['b', { arrestees: [person('Rick', '2025-12-30', [{ ...K.emptyCharge(), statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance' }])] }],
  ['c', { arrestees: [person('Mary', '2026-09-10', [{ ...K.emptyCharge(), statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance', counts: '2' }], [{ drug: 'Heroin', amount: '1', unit: 'g' }], { noNarcotics: true })] }],
]);

test('v1.136: cases opened, closed and archived in the year', () => {
  const s = Y.compute('2026', entries, arrests);
  assert.deepStrictEqual([s.opened, s.closed, s.archived], [['EX-1', 'EX-3'], ['EX-1', 'EX-2'], ['EX-2']]);
});

test('v1.136: arrests by month, charges by type, the most common, narcotics added up', () => {
  const s = Y.compute('2026', entries, arrests);
  assert.strictEqual(s.arrests, 3, 'the arrest in December 2025 is not counted');
  assert.deepStrictEqual(s.byMonth, [2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
  assert.deepStrictEqual(s.charges, { total: 3, felony: 2, misdemeanor: 1, other: 0 }, '402(c) without a Type is a felony by its statute; 550/4(b) a misdemeanor');
  assert.deepStrictEqual(s.topCharges[0], ['720 ILCS 570/402(c) Possession of a Controlled Substance', 3], 'counts of 2 add up');
  // Cocaine 12.5 + 2.5 (the same narcotic, any capitals); the heroin is left out (No narcotics recovered ticked).
  assert.deepStrictEqual(s.narcotics.map((n) => [n.drug, n.total, n.unit, n.count]), [['Cannabis', 20, 'g', 1], ['Cocaine', 15, 'g', 2]]);
});

test('v1.136: the years offered; the PDF', () => {
  assert.deepStrictEqual(Y.years(entries, arrests, '2026'), ['2026', '2025']);
  const pdf = Buffer.from(Y.build(Y.compute('2026', entries, arrests), { printed: 'October 16, 2026' })).toString('latin1');
  assert.ok(pdf.startsWith('%PDF'));
  for (const w of ['YEAR SUMMARY 2026', 'CASES', 'ARRESTS', 'CHARGES', 'NARCOTICS RECOVERED', 'Cocaine', 'EX-1']) assert.ok(pdf.includes(w), w);
});
