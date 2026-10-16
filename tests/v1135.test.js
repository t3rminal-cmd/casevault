// v1.135: SOL notices at 90 and 30 days, 550/4(b) subsequent offense, phone call time, what an
// Arrest Report leaves empty, AI suggestions per PC. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/limitations.js');
const K = require('../js/closing.js');
const R = require('../js/reference/ref-data.js');
const HW = require('../js/ai/hardware.js');

test('v1.135: SOL notice 90 and 30 days before; the last 5 days stay the red warning', () => {
  const sol = { occurred: '2025-04-01', expires: '2026-10-01' };
  assert.strictEqual(L.notice(sol, '2026-06-01'), '', '122 days: nothing yet');
  assert.strictEqual(L.notice(sol, '2026-07-03'), 'notice', '90 days');
  assert.strictEqual(L.notice(sol, '2026-09-01'), 'soon', '30 days');
  assert.strictEqual(L.notice(sol, '2026-09-26'), '', '5 days: the warning instead');
  assert.strictEqual(L.state(sol, '2026-09-26'), 'warn');
});

test('v1.135: 550/4(b) subsequent offense is Class A; first offense stays Class B', () => {
  const poss = R.CHARGES.find((g) => g.key === 'il-possession').codes;
  assert.deepStrictEqual(poss[1], ['720 ILCS 550/4(b)', 'Possession of Cannabis, 10 to 30 grams, subsequent offense']);
  assert.deepStrictEqual(K.chargeClass('720 ILCS 550/4(b)', 'Possession of Cannabis, 10 to 30 grams, subsequent offense'), { degree: 'Class A', level: 'Misdemeanor' });
  assert.deepStrictEqual(K.chargeClass('720 ILCS 550/4(b)', 'Possession of Cannabis, 10 to 30 grams, first offense'), { degree: 'Class B', level: 'Misdemeanor' });
  assert.strictEqual(K.withClass(K.emptyCharge(), '720 ILCS 550/4(b)', 'Possession of Cannabis, 10 to 30 grams, subsequent offense').degree, 'Class A');
  // Still a misdemeanor for the statute of limitations: 18 months.
  assert.strictEqual(L.compute({ date: '2026-01-10', charges: [{ statute: '720 ILCS 550/4(b)', description: 'Possession of Cannabis, 10 to 30 grams, subsequent offense' }] }, null).months, 18);
});

test('v1.135: a phone call has its time, in {{arrest.phoneCalls}} too', () => {
  const a = { ...K.emptyArrestee(), firstName: 'John', lastName: 'Doe', phoneCalls: [{ name: 'Jane Doe', relationship: 'Mother', phone: '(312) 555-0100', time: '14:05' }] };
  assert.strictEqual(K.arrestContext({ arrestees: [a] })['arrest.phoneCalls'], 'Jane Doe (Mother), (312) 555-0100, at 14:05');
});

test('v1.135: what an Arrest Report still leaves empty', () => {
  const empty = K.arrestGaps({ arrestees: [K.emptyArrestee()] });
  assert.strictEqual(empty.length, 1);
  assert.strictEqual(empty[0].who, 'Arrestee 1');
  for (const w of ['name', 'a charge', 'arrest date', 'Miranda', 'narcotics', 'warrant', 'vehicle', 'phone call', 'narrative', 'arresting officer']) assert.ok(empty[0].missing.some((m) => m.includes(w)), w);
  const full = { ...K.emptyArrestee(), firstName: 'John', lastName: 'Doe', date: '2026-10-01', time: '13:00', miranda: 'Given and waived', mirandaTime: '13:10',
    charges: [{ ...K.emptyCharge(), statute: '720 ILCS 550/4(b)', description: 'Possession of Cannabis' }], noNarcotics: true, noWarrant: true, noVehicle: true, refusedCall: true,
    narrative: 'Made-up narrative.', arrestingOfficer: 'P.O. Example' };
  assert.deepStrictEqual(K.arrestGaps({ arrestees: [full] }), []);
  assert.deepStrictEqual(K.arrestGaps({ arrestees: [{ ...full, mirandaTime: '' }] })[0].missing, ['the Miranda time']);
});

test('v1.135: AI suggestions as you type start off on a PC without a graphics card for the AI', () => {
  assert.strictEqual(HW.suggestionsOn({ gpu: 'integrated' }), false);
  assert.strictEqual(HW.suggestionsOn({ measured: { gpuShare: 0.1 } }), false);
  assert.strictEqual(HW.suggestionsOn({ gpu: 'dedicated' }), true);
  assert.strictEqual(HW.suggestionsOn({}), true, 'nothing known: on');
  assert.strictEqual(HW.suggestionsOn({ gpu: 'integrated', suggestions: true }), true, 'this PC chose on');
  assert.strictEqual(HW.suggestionsOn({ gpu: 'dedicated', suggestions: false }), false, 'this PC chose off');
  assert.strictEqual(HW.suggestionsOn({ gpu: 'dedicated' }, false), false, 'the vault setting from before');
});
