// v1.170: the Lab report, "Use this value", Case Facts, Explain this flag and the evidence list
// in the discovery index and receipt. All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/checker/rules.js');
const A = require('../js/checker/ai.js');
const F = require('../js/drafts/draft-facts.js');
const D = require('../js/discovery-core.js');
const Rc = require('../js/discovery-receipt.js');
const doc = (name, text, role = 'report') => ({ name, role, paragraphs: [{ index: 0, page: 1, text }] });

test('lab report: found by its name; a different drug, a heavier lab weight, a number no report gives', () => {
  assert.strictEqual(R.kindFromName('ISP Crime Lab Results.pdf'), 'lab');
  assert.strictEqual(R.reportKind(doc('Results.txt', 'LABORATORY REPORT. Controlled substance analysis.')), 'lab');
  const docs = [
    doc('Buy 1.txt', 'On 03/04/2026 the UC bought 3.5 grams of suspect crack cocaine, inventoried under Inventory #12345678. Also 2 grams of cannabis under Inventory #22345678.'),
    doc('Surveillance 1.txt', 'On 03/04/2026 surveillance saw the UC. Inventory #12345678 and #22345678.'),
    doc('Lab Results.txt', 'Item Inventory #12345678 contained heroin, net weight 3.1 grams. Item Inventory #22345678 contained cannabis, 2.9 grams. Item Inventory #33333333 contained fentanyl.'),
  ];
  const t = R.compare(docs).map((f) => [f.severity, f.title]);
  assert.ok(t.some(([s, x]) => s === 'High' && /Drug differs for inventory 12345678: the lab found heroin; Buy 1\.txt says cocaine/.test(x)), JSON.stringify(t));
  assert.ok(t.some(([s, x]) => s === 'Medium' && /Lab weight "2\.9 grams" is more than the field weight "2 grams"/.test(x)));
  assert.ok(t.some(([, x]) => /33333333 in the Lab report is in no other report/.test(x)));
  assert.ok(!t.some(([, x]) => /^Weight mismatch/.test(x)), 'net and field weights are not a plain mismatch');
  // Crack and cocaine are one drug; a lighter lab weight is normal.
  const ok = R.compare([docs[0], doc('Lab Results.txt', 'Inventory #12345678: cocaine, 3.2 grams net.')]);
  assert.deepStrictEqual(ok.filter((f) => /Drug differs|Lab weight/.test(f.title)), []);
  // Chosen on the Checks tab.
  assert.ok(R.compare([docs[0], doc('Report Z.txt', 'Inventory #12345678 contained heroin.')], { kinds: { 'Report Z.txt': 'lab' } }).some((f) => /Drug differs/.test(f.title)));
});

test('a mismatch carries its fix; applyFix changes it in the right sentence only', () => {
  const flags = R.compare([doc('Draft', 'On 03/04/2026 the UC paid $250 to Mary Poez.', 'affidavit'), doc('Buy 1.txt', 'On 03/04/2026 the UC paid $200 to Mary Poes.')]);
  assert.deepStrictEqual(flags.find((f) => f.type === 'money').fix, { from: '$250', to: '$200' });
  assert.deepStrictEqual(flags.find((f) => f.type === 'name').fix, { from: 'Poez', to: 'Poes' });
  const md = 'The UC paid **$250** on March 4.\n\nLater the CI said $250 was owed for the next buy.';
  assert.strictEqual(F.applyFix(md, 'Later the CI said $250 was owed for the next buy.', { from: '$250', to: '$200' }), 'The UC paid **$250** on March 4.\n\nLater the CI said $200 was owed for the next buy.');
  assert.strictEqual(F.applyFix(md, 'The UC paid $250 on March 4.', { from: '$250', to: '$200' }), 'The UC paid **$200** on March 4.\n\nLater the CI said $250 was owed for the next buy.');
  assert.strictEqual(F.applyFix(md, 'x', { from: '$999', to: '$1' }), null);
});

test('Case Facts: a report\'s facts, each once, dates first', () => {
  const facts = F.factsOf([{ text: 'On 03/04/2026 at 1:15 PM the UC paid $200 for 3.5 grams. Plate EXA1234. Inventory #12345678 and Inventory #12345678.' }]);
  assert.deepStrictEqual(facts.map((x) => x.type), ['date', 'time', 'money', 'weight', 'plate', 'inventory']);
  assert.strictEqual(facts.find((x) => x.type === 'inventory').text, 'Inventory #12345678');
});

test('Explain this flag: the prompt, a suggestion kept only when it is a rewording', async () => {
  const flag = { title: 'Amount mismatch: "$250" vs "$200"', detail: 'Draft says $250; Buy 1 says $200.', statement: { doc: 'Draft', text: 'The UC paid $250 to Mary Poe.' }, source: { doc: 'Buy 1.txt', text: 'The UC paid $200 to Mary Poe.' } };
  assert.match(A.explainPrompt(flag), /SENTENCE \(Draft\): The UC paid \$250/);
  const reply = (obj) => async () => ({ ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify(obj) } }), text: async () => '' });
  const engine = { base: 'http://127.0.0.1:11434', model: 'example:7b' };
  const a = await A.explainFlag({ flag, engine, fetchImpl: reply({ explanation: 'The amounts differ.', suggestion: 'The UC paid $200 to Mary Poe.' }) });
  assert.deepStrictEqual(a, { explanation: 'The amounts differ.', suggestion: 'The UC paid $200 to Mary Poe.' });
  const b = await A.explainFlag({ flag, engine, fetchImpl: reply({ explanation: 'x', suggestion: 'Something else entirely about weather.' }) });
  assert.strictEqual(b.suggestion, '');
  await assert.rejects(A.explainFlag({ flag, engine, fetchImpl: reply({ explanation: '', suggestion: '' }) }));
});

test('discovery: the exhibits and inventory numbers in the index and on the receipt', () => {
  const md = D.indexMarkdown({ items: [], prefix: 'EX', batesFirst: 1, batesLast: 1, produced: '2026-10-29', evidence: [{ number: 1, inventory: '12345678', description: 'Cocaine, 3.5 g' }] });
  assert.match(md, /## Evidence \(Inventory Numbers\)\n\n\| Exhibit \| Inventory Number \| Description \|/);
  assert.match(md, /\| 1 \| 12345678 \| Cocaine, 3\.5 g \|/);
  assert.ok(!/Evidence \(Inventory/.test(D.indexMarkdown({ items: [], prefix: 'EX', batesFirst: 1, batesLast: 1, produced: '2026-10-29' })));
  const pdf = Buffer.from(Rc.build({ items: [{ path: 'a.pdf', batesFirst: 1, batesLast: 1, sha256: 'ab'.repeat(32) }], prefix: 'EX', evidence: [{ number: 1, inventory: '12345678', description: 'Cocaine' }] }, { caseLabel: 'Case EX-100' })).toString('latin1');
  assert.ok(pdf.includes('EVIDENCE \\(INVENTORY NUMBERS\\)') && pdf.includes('(12345678)'), 'the section and the number (PDF text escapes brackets)');
});
