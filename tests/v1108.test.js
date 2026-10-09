// v1.108: confidential address, Federal Government victim, See DEA 6. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RF = require('../js/report-fields.js');

test('v1.108: Address of Occurrence offers the confidential address (v1.109: North and South)', () => {
  assert.deepStrictEqual(RF.PICKS.address, ['99 N Confidential Street', '99 S Confidential Street']);
});

test('v1.108: the Federal Government is a victim like the State (no Relation Code filled)', () => {
  assert.ok(RF.PICKS.victim.includes('Federal Government') && RF.PICKS.victim.includes('State of Illinois'));
  const d = RF.normalize({ victimsList: [{ name: 'Federal Government', officer: 'Jane Roe', race: 'White' }, { name: 'State of Illinois' }] });
  assert.ok(RF.isStateVictim('victimsList', d.victimsList[0]));
  assert.deepStrictEqual(RF.fieldsFor('victimsList', d.victimsList[0]).map(([k]) => k), ['name', 'relation', 'officer']);
  assert.strictEqual(d.victimsList[0].relation, '');
  assert.strictEqual(d.victimsList[1].relation, '024');
  assert.strictEqual(RF.itemLine('victimsList', d.victimsList[0]), 'Federal Government, Officer Name: Jane Roe');
});

test('v1.108: See DEA 6 fills Victims, Offenders, Charges, Evidence and the summary', () => {
  const d = RF.normalize({ offense: 'Delv: Synthetic', hidden: ['people', 'charges', 'evidence', 'summary', 'assignment'], offendersList: [{ name: 'John Doe' }], narrative: 'old text' });
  RF.seeDea6(d, 'EX-FED-1');
  assert.strictEqual(d.victimsList.length, 1);
  assert.strictEqual(d.victimsList[0].name, RF.SEE_DEA6);
  assert.strictEqual(d.offendersList[0].name, 'John Doe', 'an offender already entered is kept');
  assert.strictEqual(d.charges[0].description, 'See DEA 6 for further information');
  assert.strictEqual(d.evidenceNote, RF.SEE_DEA6);
  assert.strictEqual(d.evidence.length, 0, 'no exhibit number is used');
  assert.strictEqual(d.narrative, 'This report is for statistical purposes only. For further information see DEA 6 reports under Federal Case Number EX-FED-1. THIS CASE IS CLEAR/CLOSED.');
  assert.deepStrictEqual(d.hidden, ['assignment']);
  // The Offense Classification is not replaced by the DEA 6 words.
  RF.syncOffense(d);
  assert.strictEqual(d.offense, 'Delv: Synthetic');
  assert.match(RF.dea6Narrative(''), /under the Federal Case Number\./);
  // In the report text and the editable report.
  const md = RF.toMarkdown(d);
  assert.ok(md.includes('## Evidence Inventoried\n\nSee DEA 6 for further information'));
  assert.ok(md.includes('THIS CASE IS CLEAR/CLOSED.'));
  assert.ok(RF.asText(d).includes('Evidence: See DEA 6 for further information'));
  // Saved and read back.
  assert.strictEqual(RF.normalize(JSON.parse(JSON.stringify(d))).evidenceNote, RF.SEE_DEA6);
});

test('v1.108: the PDF prints the DEA 6 words and the summary', async () => {
  const PDF = require('../js/report-pdf.js');
  const d = RF.seeDea6(RF.normalize({}), 'EX-FED-1');
  const bytes = PDF.build(d, {});
  const s = Buffer.from(bytes).toString('latin1');
  for (const x of ['(See DEA 6 for further information)', '(EVIDENCE INVENTORIED:)']) assert.ok(s.includes(x), x);
});
