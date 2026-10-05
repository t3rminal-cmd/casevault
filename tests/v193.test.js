// v1.93: the State of Illinois as victim has Relation Code 024. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RF = require('../js/report-fields.js');
const R = require('../js/report-pdf.js');

const text = (bytes) => Buffer.from(bytes).toString('latin1');

test('v1.93: a State of Illinois victim gets Relation Code 024, shown on screen and on the PDF', () => {
  const d = RF.normalize({ victimsList: [{ name: 'State of Illinois', officer: 'Jane Roe' }, { name: 'John Doe', relation: '11' }] });
  assert.strictEqual(d.victimsList[0].relation, '024');
  assert.strictEqual(d.victimsList[1].relation, '11', 'other victims keep their own code');
  assert.deepStrictEqual(RF.fieldsFor('victimsList', d.victimsList[0]).map(([k]) => k), ['name', 'relation', 'officer']);
  const kept = RF.normalize({ victimsList: [{ name: 'State of Illinois', relation: '025' }] });
  assert.strictEqual(kept.victimsList[0].relation, '025', 'a code you typed is kept');
  const pdf = text(R.build(d, {}));
  for (const s of ['(State of Illinois)', '(Relation Code: 024)', '(Officer Name: Jane Roe)']) assert.ok(pdf.includes(s), s);
});
