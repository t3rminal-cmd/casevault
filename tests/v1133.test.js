// v1.133: Arrest Report phone calls (who, relationship, number; or refused) and the charge
// 720 ILCS 550/4(b), possession of cannabis 10 to 30 grams, first offense. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const K = require('../js/closing.js');
const R = require('../js/reference/ref-data.js');

test('v1.133: 550/4(b) is in the charge list as a Class B misdemeanor', () => {
  const poss = R.CHARGES.find((g) => g.key === 'il-possession').codes;
  assert.deepStrictEqual(poss[0], ['720 ILCS 550/4(b)', 'Possession of Cannabis, 10 to 30 grams, first offense']);
  assert.deepStrictEqual(K.chargeClass('720 ILCS 550/4(b)'), { degree: 'Class B', level: 'Misdemeanor' });
  assert.deepStrictEqual(K.chargeClass('720 ILCS 550/4(c)'), { degree: 'Class A', level: 'Misdemeanor' });
});

test('v1.133: an arrestee has phone calls and a refused-call tick, old ones too', () => {
  const a = K.emptyArrestee();
  assert.deepStrictEqual([a.phoneCalls, a.refusedCall], [[], false]);
  assert.deepStrictEqual(K.emptyItem('phoneCalls'), { name: '', relationship: '', phone: '' });
  const old = K.normalizeArrestee({ firstName: 'John', lastName: 'Doe' }); // saved before v1.133
  assert.deepStrictEqual([old.phoneCalls, old.refusedCall], [[], false]);
});

test('v1.133: {{arrest.phoneCalls}} lists the calls, or says the call was refused', () => {
  const a = { ...K.emptyArrestee(), firstName: 'John', lastName: 'Doe', phoneCalls: [
    { name: 'Jane Doe', relationship: 'Mother', phone: '(312) 555-0100' }, { name: '', relationship: '', phone: '' }, { name: 'Rick Poe', relationship: '', phone: '(312) 555-0199' }] };
  assert.strictEqual(K.arrestContext({ arrestees: [a] })['arrest.phoneCalls'], 'Jane Doe (Mother), (312) 555-0100\nRick Poe, (312) 555-0199');
  assert.strictEqual(K.arrestContext({ arrestees: [{ ...a, refusedCall: true }] })['arrest.phoneCalls'], 'Refused phone call');
});
