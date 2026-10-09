// v1.110: the IUCR codes are written out, and the code picked fills Offense Classification.
// Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RF = require('../js/report-fields.js');
const RD = require('../js/reference/ref-data.js');

const desc = (code) => RD.UCR_CODES.flatMap((g) => g.codes).find(([c]) => c === code)[1];

test('v1.110: the IUCR codes are written out', () => {
  assert.strictEqual(desc('2015'), 'Manufacture and Delivery: Hallucinogen');
  assert.strictEqual(desc('2025'), 'Possession: Hallucinogen');
  assert.strictEqual(desc('1811'), 'Possession: Cannabis, 30 Grams or Less');
  assert.strictEqual(desc('2018'), 'Manufacture and Delivery: Synthetic Drug');
  assert.strictEqual(desc('2091'), 'Forfeited Property: Narcotics');
  assert.strictEqual(desc('051A'), 'Aggravated Assault: Handgun');
  assert.strictEqual(desc('141A'), 'Unlawful Use of a Weapon: Handgun');
  const all = RD.UCR_CODES.flatMap((g) => g.codes.map(([, d]) => d)).join('\n');
  assert.doesNotMatch(all, /Delv|Poss:|Agg:|UUW|grms|Forfiet/);
});

test('v1.110: an IUCR description in Offense Classification stays when charges are entered', () => {
  const charges = [{ statute: '720 ILCS 570/401(e)', description: 'Manufacture/Delivery of a Controlled Substance - LSD (Hallucinogen), other amount' }];
  const fromUcr = RF.normalize({ ucr: '2015', offense: desc('2015'), offenseFrom: 'ucr', charges });
  assert.strictEqual(fromUcr.offense, 'Manufacture and Delivery: Hallucinogen');
  // Without the IUCR pick, the charge's wording is used (as before).
  const typed = RF.normalize({ ucr: '2015', offense: 'something typed', charges });
  assert.strictEqual(typed.offense, charges[0].description);
  // In the PDF.
  const pdf = Buffer.from(require('../js/report-pdf.js').build(fromUcr, {})).toString('latin1');
  assert.ok(pdf.includes('(Manufacture and Delivery: Hallucinogen)'));
});

test('v1.110: a Draft form with the old short IUCR wording gets the written-out wording', () => {
  const a = RF.normalize({ ucr: '2015', offense: 'Delv: Hallucinogens' });
  assert.ok(RF.updateOldUcr(a));
  assert.strictEqual(a.offense, 'Manufacture and Delivery: Hallucinogen');
  assert.strictEqual(a.offenseFrom, 'ucr');
  // No code entered: a wording only one code had is still updated.
  const b = RF.normalize({ offense: 'Poss: Cannabis 30 grms or less' });
  assert.ok(RF.updateOldUcr(b));
  assert.strictEqual(b.offense, 'Possession: Cannabis, 30 Grams or Less');
  // A wording two codes shared: the IUCR code decides; without one it is left alone.
  const c = RF.normalize({ ucr: '041A', offense: 'Agg: Handgun' });
  RF.updateOldUcr(c);
  assert.strictEqual(c.offense, 'Aggravated Battery: Handgun');
  const e = RF.normalize({ offense: 'Agg: Handgun' });
  assert.ok(!RF.updateOldUcr(e));
  assert.strictEqual(e.offense, 'Agg: Handgun');
  // Anything typed by hand, or a charge's wording, is left as it is.
  const f = RF.normalize({ ucr: '2015', offense: 'Delivery of LSD (my words)' });
  assert.ok(!RF.updateOldUcr(f));
  assert.strictEqual(f.offense, 'Delivery of LSD (my words)');
  // Every old wording maps to the current list.
  const now = new Set(RD.UCR_CODES.flatMap((g) => g.codes.map(([, d]) => d)));
  for (const w of ['Delv: Synthetic Drugs', 'UUW: Handgun', 'Forfiet Property: Narcotics', 'Agg: Arson']) {
    const g = { offense: w }; RF.updateOldUcr(g); assert.ok(now.has(g.offense), `${w} -> ${g.offense}`);
  }
});
