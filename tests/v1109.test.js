// v1.109: 99 S Confidential Street, See DEA 6 entries with one box, no doubles in the narcotics
// list. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RF = require('../js/report-fields.js');
const R = require('../js/report-pdf.js');
const RD = require('../js/reference/ref-data.js');

test('v1.109: the address list is 99 N and 99 S Confidential Street', () => {
  assert.deepStrictEqual(RF.PICKS.address, ['99 N Confidential Street', '99 S Confidential Street']);
});

test('v1.109: a See DEA 6 offender, victim or charge has only that box', () => {
  const SEE = RF.SEE_DEA6;
  const d = RF.normalize({ offendersList: [{ name: SEE }, { name: 'John Doe' }], victimsList: [{ name: SEE }], charges: [{ statute: SEE }, { statute: '720 ILCS 570/402', description: 'Possession' }] });
  assert.deepStrictEqual(RF.fieldsFor('offendersList', d.offendersList[0]).map(([k]) => k), ['name']);
  assert.ok(RF.fieldsFor('offendersList', d.offendersList[1]).length > 5, 'a real offender keeps every box');
  assert.deepStrictEqual(RF.fieldsFor('victimsList', d.victimsList[0]).map(([k]) => k), ['name']);
  assert.strictEqual(d.charges[0].statute, '');
  assert.strictEqual(d.charges[0].description, SEE, 'typed as the statute, it moves to the description');
  assert.deepStrictEqual(RF.fieldsFor('charges', d.charges[0]).map(([k]) => k), ['description']);
  assert.deepStrictEqual(RF.fieldsFor('charges', d.charges[1]).map(([k]) => k), ['statute', 'description']);
  assert.ok(RF.isSeeDea6('offendersList', { name: 'see dea 6 for further information ' }));
  assert.strictEqual(RF.itemLine('offendersList', d.offendersList[0]), SEE);
  // The PDF: the offender is one line, the charge has no blank statute line.
  const pdf = Buffer.from(R.build(RF.seeDea6(RF.normalize({}), 'FJ-1'), {})).toString('latin1');
  assert.ok(pdf.includes(`(${SEE})`));
  assert.ok(!pdf.includes(`(Name: ${SEE})`), 'no "Name:" label in front of it');
});

test('v1.109: the narcotics list has no doubles (Cannabis is Marijuana, Cocaine is Cocaine (Powder)…)', () => {
  const values = RF.narcoticChoices(RD.NARCOTIC_DATA).map((x) => x.value);
  assert.ok(values.includes('Marijuana (Domestic)'));
  for (const gone of ['Cannabis', 'Cocaine', 'Crack Cocaine', 'Heroin', 'MDMA / Ecstasy', 'Oxycodone', 'Hydrocodone']) assert.ok(!values.includes(gone), gone);
  for (const kept of ['PCP', 'Other Controlled Substance', 'Fentanyl', 'Psilocybin']) assert.ok(values.includes(kept), kept);
  assert.strictEqual(new Set(values).size, values.length);
});
