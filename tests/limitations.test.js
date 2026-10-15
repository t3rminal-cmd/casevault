'use strict';
// v1.67: statute of limitations for narcotic charges (3 years from the Date of Occurrence).
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/limitations.js');

test('narcotic charges are recognised by statute or words; others are not', () => {
  for (const s of ['720 ILCS 570/401(c)(2)', '720 ILCS 550/5(d)', '720 ILCS 646/55(a)(2)(A)', '21 U.S.C. § 841(a)(1)', '21 USC 846']) assert.ok(L.isNarcoticCharge({ statute: s }), s);
  assert.ok(L.isNarcoticCharge({ statute: '', description: 'Possession of a Controlled Substance' }));
  assert.ok(!L.isNarcoticCharge({ statute: '720 ILCS 5/24-1', description: 'Unlawful Use of Weapons' }));
  assert.ok(!L.isNarcoticCharge(null));
});

test('3 years from the Draft Date of Occurrence, else the earliest arrest date', () => {
  assert.deepStrictEqual(L.compute({ date: '2026-03-15', charges: [{ statute: '720 ILCS 570/402(c)' }] }, null), { occurred: '2026-03-15', expires: '2029-03-15', months: 36 });
  const arrest = { arrestees: [{ date: '2025-06-02', charges: [{ statute: '21 U.S.C. § 841(a)(1)' }] }, { date: '2025-05-30', charges: [] }] };
  assert.deepStrictEqual(L.compute({ date: '' }, arrest), { occurred: '2025-05-30', expires: '2028-05-30', months: 36 });
  assert.strictEqual(L.compute({ date: '2026-01-01', charges: [{ statute: '720 ILCS 5/24-1' }] }, null), null, 'not narcotic');
  assert.strictEqual(L.compute({ charges: [{ statute: '720 ILCS 570/402(c)' }] }, null), null, 'no date');
  assert.strictEqual(L.addYears('2024-02-29', 3), '2027-03-01');
});

test('warning 5 days before, then expired; the count-down', () => {
  const sol = { occurred: '2023-10-08', expires: '2026-10-08' };
  assert.strictEqual(L.daysLeft(sol, '2026-10-03'), 5);
  assert.strictEqual(L.state(sol, '2026-10-02'), '');
  assert.strictEqual(L.state(sol, '2026-10-03'), 'warn');
  assert.strictEqual(L.state(sol, '2026-10-08'), 'warn');
  assert.strictEqual(L.state(sol, '2026-10-09'), 'expired');
  assert.strictEqual(L.countdown(((4 * 24 + 6) * 3600 + 12 * 60 + 30) * 1000), '4 Days 06:12:30 Left');
  assert.strictEqual(L.countdown(65 * 1000), '00:01:05 Left');
  assert.strictEqual(L.countdown(0), 'Expired');
});

test('v1.134: 18 months when every narcotic charge is a misdemeanor, else 3 years', () => {
  // By statute (720 ILCS 550/4(b) is Class B, 4(c) Class A), by the Type, or by the Class.
  assert.deepStrictEqual(L.compute({ date: '2026-03-15', charges: [{ statute: '720 ILCS 550/4(b)' }] }, null), { occurred: '2026-03-15', expires: '2027-09-15', months: 18 });
  const arrest = { arrestees: [{ date: '2025-08-31', charges: [{ statute: '720 ILCS 550/4(c)', level: 'Misdemeanor' }, { statute: '', description: 'Possession of cannabis', degree: 'Class B' }] }] };
  assert.deepStrictEqual(L.compute({ date: '' }, arrest), { occurred: '2025-08-31', expires: '2027-03-03', months: 18 }, '31 August + 18 months rolls into March');
  // One felony narcotic charge keeps 3 years; a misdemeanor that isn't a narcotic charge doesn't count.
  assert.strictEqual(L.compute({ date: '2026-03-15', charges: [{ statute: '720 ILCS 550/4(b)' }, { statute: '720 ILCS 570/402(c)' }] }, null).months, 36);
  assert.strictEqual(L.compute({ date: '2026-03-15', charges: [{ statute: '720 ILCS 570/402(c)' }, { statute: '720 ILCS 5/12-3', level: 'Misdemeanor' }] }, null).months, 36);
  // A charge whose class isn't known counts as a felony.
  assert.strictEqual(L.compute({ date: '2026-03-15', charges: [{ statute: '', description: 'Possession of cannabis' }] }, null).months, 36);
  assert.strictEqual(L.periodText({ months: 18 }), '18 months');
  assert.strictEqual(L.periodText({ months: 36 }), '3 years');
  assert.strictEqual(L.periodText({ occurred: '2026-01-01', expires: '2029-01-01' }), '3 years', 'an index entry from before v1.134');
});
