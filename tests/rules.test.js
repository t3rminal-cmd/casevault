// Unit tests for the rule-based checker. Run: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/checker/nlp.js');
const R = require('../js/checker/rules.js');

const facts = (s, type) => R.extractFacts(s).filter((f) => !type || f.type === type).map((f) => f.value);
const doc = (name, role, ...paras) => ({ id: name, name, role, paragraphs: paras.map((text, index) => ({ index, page: 1, text })) });

test('sentences: abbreviations and initials do not split', () => {
  const s = T.sentences('Ofc. J. Diaz arrived at approx. 9:40 p.m. on Mar. 3. He spoke to Mr. Lee. Done!');
  assert.deepStrictEqual(s.map((x) => x.text), ['Ofc. J. Diaz arrived at approx. 9:40 p.m. on Mar. 3.', 'He spoke to Mr. Lee.', 'Done!']);
});

test('dates in many formats normalize to ISO', () => {
  assert.deepStrictEqual(facts('On 03/14/2026 and 2026-03-15 and March 16, 2026 and 17 March 2026 and the 18th day of March, 2026.', 'date'),
    ['2026-03-15', '2026-03-14', '2026-03-16', '2026-03-17', '2026-03-18']);
  assert.deepStrictEqual(facts('It happened on Mar. 14th.', 'date'), ['XXXX-03-14']);
  assert.deepStrictEqual(facts('Dated 3/14/26.', 'date'), ['2026-03-14']);
  assert.deepStrictEqual(facts('You may 5 times ask.', 'date'), []);
});

test('times: 12h and 24h normalize to the same value', () => {
  assert.deepStrictEqual(facts('At 9 pm and noon.', 'time'), ['21:00', '12:00']);
  const v = new Set(facts('At 9:40 PM, 9:40p.m., 21:40, 2140 hours.', 'time'));
  assert.deepStrictEqual([...v], ['21:40']);
  assert.deepStrictEqual(facts('At 12:15 am.', 'time'), ['00:15']);
});

test('phones, money, plates, numbers, addresses, counts', () => {
  assert.deepStrictEqual(facts('Call (555) 123-4567 or 555.123.4567.', 'phone'), ['5551234567', '5551234567']);
  assert.deepStrictEqual(facts('He took $1,250.50 and 300 dollars.', 'money'), ['125050', '30000']);
  assert.deepStrictEqual(facts('A blue Honda with Texas license plate ABC-1234 was seen.', 'plate'), ['ABC1234']);
  assert.deepStrictEqual(facts('The registration of the car was expired.', 'plate'), []);
  assert.deepStrictEqual(facts('See Report #26-4481 and Case No. 2026-00123.', 'number'), ['26-4481', '2026-00123']);
  assert.deepStrictEqual(facts('He lives at 1420 Oak Street, Apt 3B.', 'address'), ['1420 oak st #3b']);
  assert.deepStrictEqual(facts('He lives at 1420 Oak St.', 'address'), ['1420 oak st']);
  assert.deepStrictEqual(R.extractFacts('I heard three loud shots and found 2 spent casings.').filter((f) => f.type === 'count').map((f) => `${f.value} ${f.key}`),
    ['3 shot', '2 casing']);
  assert.deepStrictEqual(facts('One of the men ran.', 'count'), []);
});

test('names: titled and capitalised sequences', () => {
  assert.deepStrictEqual(facts('Officer Maria Diaz spoke with the victim, John Smith.', 'name'), ['maria', 'diaz', 'john', 'smith']);
  assert.ok(R.isNameVariant('diaz', 'dias'));
  assert.ok(R.isNameVariant('katherine', 'catherine'));
  assert.ok(!R.isNameVariant('smith', 'smiths'));
  assert.ok(!R.isNameVariant('john', 'jane'));
});

test('compare: flags mismatches, supports matches, lists unsupported facts', () => {
  const flags = R.compare([
    doc('Affidavit.docx', 'affidavit',
      'On March 14, 2026, at approximately 9:40 PM, Officer Maria Diaz responded to 1420 Oak Street.',
      'Ofc. Diaz observed a blue Honda bearing license plate ABC-1234.',
      'The suspect fired three shots at the victim.',
      'Your affiant was sworn on 2026-09-01.'),
    doc('Report 26-4481.pdf', 'report',
      'On 03/14/2026 at 2140 hours Officer Maria Dias responded to 1420 Oak St.',
      'Officer Dias observed a blue Honda, plate ABC-1284.',
      'Witnesses heard two shots fired at the victim.'),
    doc('Supplement.pdf', 'report',
      'On March 15, 2026 at 21:40 Officer Dias responded to 1420 Oak Street.',
      'The suspect fired two shots at the victim.'),
  ]);
  const titles = flags.map((f) => `${f.severity} ${f.title}`);
  assert.ok(titles.includes('High Name spelled differently: "Diaz" vs "Dias"'), titles.join('\n'));
  assert.ok(titles.includes('High Licence plate mismatch: "ABC-1234" vs "ABC-1284"'), titles.join('\n'));
  assert.ok(titles.some((t) => /^High Count mismatch: "three shots" vs "two shots/.test(t)), titles.join('\n'));
  assert.ok(titles.some((t) => /^High Date mismatch: "03\/14\/2026" vs "March 15, 2026"/.test(t)), titles.join('\n'));
  assert.ok(titles.some((t) => /^Low Date not found in the reports: "2026-09-01"/.test(t)), titles.join('\n'));
  // 9:40 PM == 2140 hours == 21:40 -> no time flag
  assert.ok(!titles.some((t) => /Time/.test(t)), titles.join('\n'));
  // Address 1420 Oak Street == 1420 Oak St -> no address flag
  assert.ok(!titles.some((t) => /Address/.test(t)), titles.join('\n'));
  // Every flag points at real text
  for (const f of flags) {
    assert.ok(f.statement.text.length > 0);
    if (f.statement.highlight) assert.ok(f.statement.highlight[1] > f.statement.highlight[0]);
  }
});

test('findVerbatim ignores whitespace and typographic differences only', () => {
  const src = 'Officer Diaz stated: “I saw   the\nsuspect run—fast.”';
  assert.ok(T.findVerbatim(src, 'I saw the suspect run-fast.'));
  assert.strictEqual(T.findVerbatim(src, 'I saw the suspect walk'), null);
  const at = T.findVerbatim(src, 'saw the suspect');
  assert.strictEqual(src.slice(at.start, at.end), 'saw   the\nsuspect');
});

test('BM25 index finds the relevant passage', () => {
  const idx = T.createIndex([{ id: 1, text: 'The weather was clear.' }, { id: 2, text: 'Diaz observed the Honda plate.' }, { id: 3, text: 'Shots were fired near the store.' }]);
  assert.strictEqual(idx.search('What did Diaz observe about the Honda?')[0].id, 2);
});
