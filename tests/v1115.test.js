// v1.115: several case numbers closed by arrest with the arrest report on one RD. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const K = require('../js/closing.js');

test('v1.115: case numbers without arrest details point to the RD that has them', () => {
  const a = K.emptyArrest();
  assert.strictEqual(K.arrestReady(a), false);
  Object.assign(a.arrestees[0], { firstName: 'John', lastName: 'DOE' });
  assert.strictEqual(K.arrestReady(a), false, 'a name without a charge is not enough');
  a.arrestees[0].charges[0].statute = '720 ILCS 570/402(c)';
  assert.strictEqual(K.arrestReady(a), true);
  const picked = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const ready = new Set(['c']);
  assert.deepStrictEqual(K.arrestCoverage(picked, ready, ''), { missing: [{ id: 'a' }, { id: 'b' }], ok: false, refFor: [] });
  assert.deepStrictEqual(K.arrestCoverage(picked, ready, 'c'), { missing: [{ id: 'a' }, { id: 'b' }], ok: true, refFor: ['a', 'b'] });
  assert.strictEqual(K.arrestCoverage(picked, ready, 'b').ok, false, 'the RD must have the arrest report');
  // The RD can be one not closed now (closed earlier).
  assert.deepStrictEqual(K.arrestCoverage([{ id: 'a' }], new Set(['z']), 'z').refFor, ['a']);
  assert.strictEqual(K.arrestCoverage([{ id: 'c' }], ready, '').ok, true);
  assert.strictEqual(K.closureContext({ disposition: 'arrest', arrestRef: { id: 'c', number: 'EX-203' } })['closure.arrestRd'], 'EX-203');
});
