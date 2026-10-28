// v1.168: inventory numbers, Buy and Surveillance reports in pairs, the AI's comparison of their
// narratives, and a suspect filled in from the same person on a Mission's case.
// All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/checker/rules.js');
const A = require('../js/checker/ai.js');
const P = require('../js/person-view.js');

const doc = (name, text, role = 'report') => ({ name, role, paragraphs: [{ index: 0, page: 1, text }] });

test('inventory numbers: one, a list, "Inv. #", and never read as counts or other numbers', () => {
  const facts = R.extractFacts('Inventory #12345678 and Inv. Nos. 22345678, 22345679 and 22345680 were recovered; Inventory Number: 3334445.');
  assert.deepStrictEqual(facts.filter((f) => f.type === 'inventory').map((f) => f.value), ['12345678', '22345678', '22345679', '22345680', '3334445']);
  assert.ok(!facts.some((f) => f.type === 'count' || f.type === 'number'));
  assert.strictEqual(R.TYPE_LABEL.inventory, 'Inventory number');
});

test('report kinds from file names and from the first lines', () => {
  assert.strictEqual(R.kindFromName('Buy 2.pdf'), 'buy');
  assert.strictEqual(R.kindFromName('2026-00123 Controlled Purchase.docx'), 'buy');
  assert.strictEqual(R.kindFromName('SURV-2 Report.pdf'), 'surveillance');
  assert.strictEqual(R.kindFromName('Surveillance Buy 2.pdf'), 'surveillance');
  assert.strictEqual(R.kindFromName('Affidavit.pdf'), '');
  assert.strictEqual(R.reportKind(doc('Report A.txt', 'SURVEILLANCE REPORT. On 03/04/2026 …')), 'surveillance');
});

test('pairs: by the number in the name and the date; one of each is a pair', () => {
  const docs = [doc('Buy 1.txt', 'On 03/04/2026 the UC paid $200.'), doc('Buy 2.txt', 'On 03/11/2026 the UC paid $300.'),
    doc('Surv 2.txt', 'On 03/11/2026 surveillance saw the buy.'), doc('Surveillance 1.txt', 'On 03/04/2026 surveillance saw the buy.')];
  assert.deepStrictEqual(R.pairReports(docs).map((p) => [p.buy, p.surv]), [[0, 3], [1, 2]]);
  assert.deepStrictEqual(R.pairReports([doc('Buy.txt', 'x'), doc('Surveillance.txt', 'y')]).map((p) => [p.buy, p.surv]), [[0, 1]]);
  assert.deepStrictEqual(R.pairReports([doc('Buy 1.txt', 'x'), doc('Report.txt', 'y')]), []);
});

test('pairs: inventory numbers must match; a typo is one flag; two buys are not compared with each other', () => {
  const docs = [
    doc('Buy 1.txt', 'On 03/04/2026 the UC paid $200. The narcotics were inventoried under Inventory #12345678 and #12345679.'),
    doc('Surveillance 1.txt', 'On 03/04/2026 surveillance saw the UC. Inventory #12345687 was recorded.'),
    doc('Buy 2.txt', 'On 03/11/2026 the UC paid $300. Inventory #55512345.'),
    doc('Surv 2.txt', 'On 03/11/2026 the UC paid $300. Inventory #55512345.'),
  ];
  const flags = R.compare(docs);
  const t = flags.map((f) => f.title);
  assert.strictEqual(t.filter((x) => /Inventory number mismatch: "12345678" vs "12345687"/.test(x)).length, 1);
  assert.ok(t.some((x) => /Inventory number 12345679 is not in the Surveillance report/.test(x)));
  assert.ok(!t.some((x) => /12345679.*12345687|12345687.*12345679/.test(x)), 'one number is matched once');
  assert.ok(!t.some((x) => /\$200.*\$300|\$300.*\$200/.test(x)), `two different buys are not a mismatch: ${t}`);
  assert.ok(!t.some((x) => /55512345/.test(x)), 'the second pair agrees');
  const low = flags.find((f) => /Amount "\$200" is not in the Surveillance report/.test(f.title));
  assert.ok(low && low.severity === 'Low' && low.sourceLabel === 'Surveillance 1.txt');
});

test('an affidavit is still checked against every report, inventory numbers too', () => {
  const flags = R.compare([doc('Affidavit.txt', 'The narcotics were inventoried under Inventory #12345678.', 'affidavit'), doc('Buy 1.txt', 'Inventoried under Inventory #12345679.'), doc('Surveillance 1.txt', 'Inventory #12345679.')]);
  assert.ok(flags.some((f) => f.type === 'inventory' && /mismatch: "12345678" vs "12345679"/.test(f.title)));
});

test('AI: the prompt carries both narratives, cut to fit; answers need both quotes word for word', async () => {
  const buy = { name: 'Buy 1.txt', docIndex: 0, paragraphs: [{ index: 0, page: 1, text: 'Rick Poe arrived in a blue sedan with plate EXA1234. The UC paid $200.' }] };
  const surv = { name: 'Surveillance 1.txt', docIndex: 1, paragraphs: [{ index: 0, page: 1, text: 'Rick Poe arrived on foot from the north.' }] };
  const pr = A.pairPrompt(buy, surv, [['Rick', 'Ricky']], 4096);
  assert.match(pr.text, /BUY REPORT \(Buy 1\.txt\):\nRick Poe arrived in a blue sedan/);
  assert.match(pr.text, /SURVEILLANCE REPORT \(Surveillance 1\.txt\):\nRick Poe arrived on foot/);
  assert.match(pr.text, /KNOWN ALIASES/);
  assert.strictEqual(pr.cut, false);
  const long = { ...buy, paragraphs: [{ index: 0, page: 1, text: 'The UC waited. '.repeat(2000) }] };
  const cut = A.pairPrompt(long, surv, [], 4096);
  assert.ok(cut.cut && cut.text.length < 14000 && /arrived on foot/.test(cut.text), 'a long report is cut, the short one kept whole');
  const answer = { issues: [
    { buy_quote: 'Rick Poe arrived in a blue sedan with plate EXA1234.', surveillance_quote: 'Rick Poe arrived on foot from the north.', explanation: 'Car or on foot.', confidence: 'high' },
    { buy_quote: 'Rick Poe left in a red truck.', surveillance_quote: 'Rick Poe arrived on foot from the north.', explanation: 'Made up.', confidence: 'low' },
  ] };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify(answer) } }), text: async () => '' });
  const out = await A.comparePair({ buy, surv, engine: { base: 'http://127.0.0.1:11434', model: 'example:7b', numCtx: 4096 }, fetchImpl });
  assert.strictEqual(out.flags.length, 1);
  assert.deepStrictEqual(out.stats, { issues: 2, kept: 1, discarded: 1 });
  const f = out.flags[0];
  assert.strictEqual(f.type, 'narrative');
  assert.strictEqual(f.confidence, 'High');
  assert.strictEqual(f.statement.doc, 'Buy 1.txt');
  assert.strictEqual(f.source.doc, 'Surveillance 1.txt');
  assert.strictEqual(f.source.text, 'Rick Poe arrived on foot from the north.');
  assert.deepStrictEqual(A.parsePair('not json'), null);
});

test('suspects: the same person on a Mission case comes first, and fills in only the empty boxes', () => {
  const mine = { id: 'ind', suspects: [] };
  const cases = [
    mine,
    { id: 'a', number: 'EX-300', suspects: [{ name: 'Rick Poe', dob: '' }] },
    { id: 'm', number: 'EX-200', operationId: 'op1', suspects: [{ name: 'Rick Poe', dob: '1990-01-02', residence: '100 Example Street', info: { hair: 'Brown', height: '5 ft 10 in' } }] },
  ];
  const hits = P.duplicates({ name: 'Rick Poe' }, cases, mine);
  assert.deepStrictEqual(hits.map((x) => x.c.number), ['EX-200', 'EX-300']);
  assert.strictEqual(hits[0].filled, 4);
  const s = { name: 'Rick Poe', dob: '', residence: 'Typed Here', info: { hair: '' } };
  assert.strictEqual(P.fillFrom(s, hits[0].suspect), 3);
  assert.deepStrictEqual(s, { name: 'Rick Poe', dob: '1990-01-02', residence: 'Typed Here', info: { hair: 'Brown', height: '5 ft 10 in' } });
  assert.strictEqual(P.fillFrom(s, hits[0].suspect), 0);
});
