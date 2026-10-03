'use strict';
// v1.69: month prediction in date boxes, suspect -> offender fields, photo OCR filtering.
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/formats.js');
const RF = require('../js/report-fields.js');

test('a month is predicted from its first letters', () => {
  assert.strictEqual(F.predictMonth('sep'), 'September');
  assert.strictEqual(F.predictMonth('J'), 'January');
  assert.strictEqual(F.predictMonth('xyz'), '');
  assert.strictEqual(F.monthOf('dec'), 'December');
  assert.strictEqual(F.monthOf('de'), '');
  assert.strictEqual(F.parseDate('September 30, 2026'), '2026-09-30');
});

test('offenders have the suspect fields, and Hair Style', () => {
  const keys = RF.LISTS.offendersList.fields.map((f) => f[0]);
  for (const k of ['hairStyle', 'irNumber', 'fbiNumber', 'idocNumber', 'clothing']) assert.ok(keys.includes(k), k);
  assert.ok(RF.PICKS.hairStyle.includes('Dreadlocks'));
  assert.ok(RF.DRUG_TYPES.includes('Adderall'));
});

test('a suspect copied to Offenders brings record numbers, hair style and moniker', () => {
  const d = RF.normalize({});
  RF.suspectToOffender(d, { name: 'John Doe', info: { hairStyle: 'Braids', irNumber: '555', moniker: 'JD' } }, '2026-01-01');
  const o = d.offendersList[0];
  assert.strictEqual(o.hairStyle, 'Braids');
  assert.strictEqual(o.irNumber, '555');
  assert.deepStrictEqual(o.socials, [{ name: 'JD', app: '' }]);
  RF.suspectToOffender(d, { name: 'John Doe', info: { moniker: 'jd' } }, '2026-01-01');
  assert.strictEqual(d.offendersList[0].socials.length, 1);
});

test('photo OCR keeps only confident lines with real words', () => {
  global.self = global;
  const X = (() => { const root = {}; const src = require('fs').readFileSync(require('path').join(__dirname, '../js/checker/extract.js'), 'utf8'); new Function('root', src.replace(/\}\)\(this\);\s*$/, '})(root);'))(root); return root.CVExtract; })();
  const data = { blocks: [{ paragraphs: [{ lines: [
    { text: 'Meet me at 5 on Main St', confidence: 91 },
    { text: '~ ;: |/ \\ ,,', confidence: 80 },
    { text: 'BLURRED WORDS', confidence: 30 },
  ] }] }] };
  assert.strictEqual(X.photoText(data), 'Meet me at 5 on Main St');
  assert.strictEqual(X.photoText({ blocks: [], text: 'noise', confidence: 20 }), '');
});
