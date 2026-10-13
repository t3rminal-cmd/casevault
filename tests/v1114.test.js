// v1.114: arrest charges' class and type, victims by RD number, properties. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const K = require('../js/closing.js');

test('v1.114: a charge brings its class and type', () => {
  assert.deepStrictEqual(K.chargeClass('720 ILCS 570/402(c)'), { degree: 'Class 4', level: 'Felony' });
  assert.deepStrictEqual(K.chargeClass('720 ILCS 570/401(a)(2)(A)'), { degree: 'Class X', level: 'Felony' });
  assert.deepStrictEqual(K.chargeClass('720 ILCS 646/60(b)(1)'), { degree: 'Class 3', level: 'Felony' });
  assert.deepStrictEqual(K.chargeClass('720 ILCS 550/4(c)'), { degree: 'Class A', level: 'Misdemeanor' });
  assert.deepStrictEqual(K.chargeClass('21 U.S.C. § 841(a)(1)'), { degree: '', level: 'Felony' });
  assert.deepStrictEqual(K.chargeClass('21 U.S.C. § 844'), { degree: 'Federal misdemeanor', level: 'Misdemeanor' });
  assert.deepStrictEqual(K.chargeClass('720 ILCS 570/405.1'), { degree: '', level: 'Felony' });
  assert.deepStrictEqual(K.chargeClass('Example Code 1.01'), { degree: '', level: '' });
  assert.strictEqual(K.typeOfClass('Class B'), 'Misdemeanor');
  assert.strictEqual(K.typeOfClass('Class 2'), 'Felony');
  assert.strictEqual(K.typeOfClass('something typed'), '');
  const ch = K.withClass({ ...K.emptyCharge(), degree: 'Class X', level: 'Felony', victim: 'Jane Roe' }, '720 ILCS 550/4(c)', 'Possession of Cannabis, 30 to 100 grams');
  assert.deepStrictEqual([ch.degree, ch.level, ch.victim, ch.counts], ['Class A', 'Misdemeanor', 'Jane Roe', '1']);
  // Every Illinois code in the list has at least its Type.
  const RD = require('../js/reference/ref-data.js');
  for (const g of RD.CHARGES) for (const [st] of g.codes) if (!/24-1$/.test(st)) assert.ok(K.chargeClass(st).level, st);
});

test('v1.114: the victims on the reports with the arrestee\'s RD number', () => {
  const forms = [
    { rdNumber: 'EX-100', title: 'Draft tab', victimsList: [{ name: 'Jane Roe' }, { name: 'See DEA 6 for further information' }] },
    { rdNumber: 'ex 100', title: 'Report A', victimsList: [{ name: 'Rick Poe' }, { name: 'JANE ROE' }] },
    { rdNumber: 'EX-999', title: 'Report B', victimsList: [{ name: 'Mary Poe' }] },
  ];
  const v = K.victimChoices(forms, 'EX-100', [{ role: 'Victim', name: 'Ann Doe' }, { role: 'Witness', name: 'Tom Roe' }]);
  assert.deepStrictEqual(v.map((x) => x.name), ['Jane Roe', 'Rick Poe', 'Ann Doe', 'State of Illinois']);
  assert.strictEqual(v[1].hint, 'Report A, RD ex 100');
  assert.deepStrictEqual(K.victimChoices(forms, '', []).map((x) => x.name), ['State of Illinois']);
});

test('v1.114: properties with inventory numbers', () => {
  assert.deepStrictEqual(K.PROPERTY_KINDS, ['Prisoner Personal Property', 'Prisoner Jewelry', 'Prisoner Money', 'Prisoner Other']);
  const a = K.normalizeArrestee({ property: 'Old text', properties: [{ inventory: '7000001', description: 'Prisoner Money' }, { description: 'Prisoner Jewelry' }] });
  assert.strictEqual(a.properties.length, 2);
  assert.deepStrictEqual(K.normalizeArrestee({}).properties, []);
  const ctx = K.arrestContext({ arrestees: [a] });
  assert.strictEqual(ctx['arrest.property'], 'Inv. 7000001, Prisoner Money\nPrisoner Jewelry\nOld text');
});
