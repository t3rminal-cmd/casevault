// v1.95: Offense Classification is always a charge's exact Statute Description, older drafts too.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RF = require('../js/report-fields.js');
const R = require('../js/report-pdf.js');

const C1 = 'Manufacture/Delivery of Cannabis, 10 to 30 grams';
const C2 = 'Possession of Cannabis';

test('v1.95: an older draft with other wording takes the first charge\'s Statute Description', () => {
  const d = RF.normalize({ offense: 'Delv: Synthetic Drugs', charges: [{ statute: '720 ILCS 550/5(c)', description: C1 }, { description: C2 }] });
  assert.strictEqual(d.offense, C1);
  assert.strictEqual(RF.normalize({ offense: 'my own words', charges: [{ description: C1 }] }).offense, C1);
  assert.strictEqual(RF.normalize({ offense: C2, charges: [{ description: C1 }, { description: C2 }] }).offense, C2, 'another charge\'s wording is kept');
  assert.strictEqual(RF.normalize({ offense: 'free text' }).offense, 'free text', 'no charges: as typed');
  assert.strictEqual(RF.normalize({ offense: 'free text', charges: [{ description: C1 }], hidden: ['charges'] }).offense, 'free text', 'charges ticked off: as typed');
  const pdf = Buffer.from(R.build({ offense: 'Delv: Synthetic Drugs', charges: [{ description: C1 }] }, {})).toString('latin1');
  assert.ok(pdf.includes(`(${C1})`) && !pdf.includes('Delv: Synthetic'), 'the PDF prints the charge wording');
});
