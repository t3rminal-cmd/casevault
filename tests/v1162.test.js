// v1.162: Consistency Checker: nicknames, known aliases and name context; address formatting;
// weights; totals that don't add up; the Timeline buys (Buy Summary); a confidence on every flag;
// the AI prompt, its confidence and its time limits. All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/checker/nlp.js');
const R = require('../js/checker/rules.js');
const A = require('../js/checker/ai.js');

const doc = (name, role, ...paras) => ({ id: name, name, role, paragraphs: paras.map((text, index) => ({ index, page: 1, text })) });
const ofType = (flags, t) => flags.filter((f) => f.type === t);

test('nicknames: the same first name, and different names', () => {
  assert.ok(T.sameFirstName('Bill', 'william'));
  assert.ok(T.sameFirstName('rick', 'rich')); // both Richard
  assert.ok(T.sameFirstName('alex', 'alexandra') && T.sameFirstName('alex', 'alexander'));
  assert.ok(T.sameFirstName('beto', 'roberto'));
  assert.ok(!T.sameFirstName('john', 'jane'));
  assert.ok(!T.sameFirstName('alexander', 'alexandra')); // only the nickname is shared
});

test('known aliases: one person per line, words of 2+ letters, no repeats', () => {
  assert.deepStrictEqual(T.parseAliases('Ricky Poe, Rick Poe aka Little R\nJane Roe / Janie\nSolo'), [['ricky', 'poe', 'rick', 'little'], ['jane', 'roe', 'janie']]);
  assert.deepStrictEqual(T.parseAliases(''), []);
});

test('names: nicknames and aliases are not flagged; context tells one person from two', () => {
  const flags = R.compare([
    doc('Affidavit', 'affidavit', 'Officer Mary Poez met Jon Doe and Bill Roe on March 3, 2026.', 'Det. Rick Poe spoke with Ricky Poe.'),
    doc('Report', 'report', 'Officer Mary Poes met Joan Roe and William Roe on 03/03/2026.', 'Rich Poe was present.'),
  ], { aliases: T.parseAliases('Ricky Poe, Rick Poe') });
  const names = ofType(flags, 'name');
  assert.deepStrictEqual(names.map((f) => f.title), ['Name spelled differently: "Poez" vs "Poes"']);
  assert.strictEqual(names[0].confidence, 'High'); // same first name (Mary) on both sides
  // Without a first name on one side, the same spelling difference is only Medium.
  const solo = ofType(R.compare([doc('A', 'affidavit', 'We met Ofc. Poez there.'), doc('R', 'report', 'Officer Mary Poes was there.')]), 'name');
  assert.strictEqual(solo.length, 1);
  assert.strictEqual(solo[0].confidence, 'Medium');
});

test('addresses: abbreviations, ordinals, directions, units and punctuation read the same', () => {
  const n = T.normalizeAddress;
  assert.strictEqual(n('1420 N. Fifth Avenue, Apt. #3-B'), '1420 n 5th ave #3b');
  assert.strictEqual(n('1420 North 5th Ave #3B'), '1420 n 5th ave #3b');
  assert.strictEqual(n('55 W. Mount Vernon St., Suite 200'), n('55 West Mt Vernon Street Ste. 200'));
  assert.strictEqual(n('12 North Ave'), '12 n ave'); // "North" as the street's name stays
  const flags = R.compare([
    doc('Affidavit', 'affidavit', 'The buy took place at 1420 N. Fifth Avenue, Apt. #3-B on March 3, 2026.'),
    doc('Report', 'report', 'On 03/03/2026 the buy took place at 1420 North 5th Ave #3B.'),
  ]);
  assert.deepStrictEqual(ofType(flags, 'address'), []);
  // A different house number on the same street is still a mismatch.
  const diff = ofType(R.compare([
    doc('Affidavit', 'affidavit', 'The buy took place at 1420 Oak Street on March 3, 2026.'),
    doc('Report', 'report', 'On 03/03/2026 the buy took place at 1240 Oak St.'),
  ]), 'address');
  assert.strictEqual(diff.length, 1);
});

test('weights: read in grams; units convert; 1% rounding is not a difference', () => {
  const w = (s) => R.extractFacts(s).filter((f) => f.type === 'weight').map((f) => f.value);
  assert.deepStrictEqual(w('He sold 28.5 grams, then 1 oz, then 2 kilos and 500 mg.'), ['28.5', '28.35', '2000', '0.5']);
  const flags = R.compare([
    doc('Affidavit', 'affidavit', 'On March 3, 2026, the UC bought 1 oz of cocaine from John Doe.'),
    doc('Report', 'report', 'On 03/03/2026 the UC bought 28.3 grams of cocaine from John Doe.'),
  ]);
  assert.deepStrictEqual(ofType(flags, 'weight'), []);
  const off = ofType(R.compare([
    doc('Affidavit', 'affidavit', 'On March 3, 2026, the UC bought 3.5 grams of cocaine from John Doe.'),
    doc('Report', 'report', 'On 03/03/2026 the UC bought 7 grams of cocaine from John Doe.'),
  ]), 'weight');
  assert.strictEqual(off.length, 1);
});

test('totals: a stated total against the amounts or weights listed with it', () => {
  const flags = R.compare([
    doc('Affidavit', 'affidavit',
      'The UC paid $200 on March 1, $300 on March 8 and $500 on March 15, 2026, for a total of $1,100.',
      'He bought 3.5 grams. He then bought 7 grams. In all, 10 grams were bought.',
      'The UC paid $40 each for 3 bags, a total of $120.',
      'The UC paid $250 and $250, a total of $500.'),
    doc('Report', 'report', 'Buys were made on 3/1/2026, 3/8/2026 and 3/15/2026.'),
  ]);
  const totals = ofType(flags, 'total');
  assert.strictEqual(totals.length, 2);
  assert.match(totals[0].title, /"\$1,100" but the amounts listed add up to \$1,000/);
  assert.strictEqual(totals[0].confidence, 'High'); // all in one sentence
  assert.match(totals[1].title, /"10 grams" but the weights listed add up to 10\.5 grams/);
  assert.strictEqual(totals[1].confidence, 'Medium'); // amounts in the sentences before
  assert.match(totals[0].detail, /\$200 \+ \$300 \+ \$500 = \$1,000, not \$1,100/);
});

test('buys: each Timeline buy and the Buy Summary totals against the documents', () => {
  const buys = [
    { date: '2026-03-01', suspect: 'John Doe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' },
    { date: '2026-03-08', suspect: 'John Doe', drug: 'Cocaine', qty: '7', unit: 'g', paid: '500' },
    { date: '2026-03-10', suspect: 'Jane Roe', drug: 'Heroin', qty: '1', unit: 'g', paid: '100' },
  ];
  const flags = R.compare([
    doc('Affidavit', 'affidavit',
      'On March 1, 2026, the UC bought 3.5 grams of cocaine from John Doe for $250.',
      'On March 8, 2026, the UC bought 7 grams from John Doe for $500.',
      'In total the UC paid $700 to John Doe for the buys.',
      'In total the UC paid $900 for the buys.'),
    doc('Report', 'report', 'Buys took place on 03/01/2026 and 03/08/2026.'),
  ], { buys });
  const b = ofType(flags, 'buy');
  assert.deepStrictEqual(b.map((f) => f.title), [
    'Buy on 2026-03-01: "$250" but the Timeline says $200 was paid',
    'Total paid "$900" doesn\'t match the Timeline\'s Buy Summary ($800)',
  ]);
  assert.ok(b.every((f) => f.sourceLabel === 'Timeline Buy Summary' && f.source === null));
  // $700 is John Doe's buys, so it is not flagged; nothing about the 3/8 buy either.
  assert.strictEqual(R.buyGrams({ qty: '1', unit: 'oz' }), 28.3495);
  assert.strictEqual(R.buyGrams({ qty: '3', unit: 'pills' }), null);
});

test('every rule flag has a confidence', () => {
  const flags = R.compare([
    doc('Affidavit', 'affidavit', 'On March 14, 2026, at 9:40 PM, Officer Mary Poez saw plate ABC-1234 at 1420 Oak Street.', 'The suspect paid $300 on June 2, 2026.'),
    doc('Report', 'report', 'On 03/14/2026 at 2145 hours Officer Mary Poes saw plate ABC-1243 at 1420 Oak St.'),
  ]);
  assert.ok(flags.length >= 3);
  for (const f of flags) assert.ok(['High', 'Medium', 'Low'].includes(f.confidence), f.title);
  const notFound = flags.filter((f) => /not found/.test(f.title));
  assert.ok(notFound.length && notFound.every((f) => f.confidence === 'Low'));
});

test('AI: the prompt names what is not a contradiction; aliases go with the statement; confidence is read', () => {
  assert.match(A.SYSTEM, /NOT contradictions/);
  assert.match(A.SYSTEM, /St \/ Street/);
  assert.match(A.SYSTEM, /9:40 PM \/ 2140 hours/);
  assert.match(A.SYSTEM, /"confidence"/);
  const p = A.userPrompt({ text: 'Rick Poe sold the drugs.' }, [{ docName: 'Report', text: 'Ricky Poe sold.' }], [['ricky', 'poe', 'rick']]);
  assert.match(p, /KNOWN ALIASES[\s\S]*ricky poe rick/);
  assert.strictEqual(A.parseAnswer('{"verdict":"contradicted","passage":1,"quote":"x","explanation":"y","confidence":"high"}').confidence, 'High');
  assert.strictEqual(A.parseAnswer('{"verdict":"supported","passage":1,"quote":"x","explanation":"y"}').confidence, 'Medium');
});

const longDocs = () => [
  { name: 'Affidavit', role: 'affidavit', docIndex: 0, paragraphs: [{ index: 0, page: 1, text: Array.from({ length: 6 }, (_, i) => `On March ${i + 1}, 2026, the undercover officer met John Doe near the Example City park and bought cocaine.`).join(' ') }] },
  { name: 'Report', role: 'report', docIndex: 1, paragraphs: [{ index: 0, page: 1, text: 'On March 1, 2026, the undercover officer met John Doe near the Example City park and bought cocaine.' }] },
];

test('AI: two answers in a row over the time limit stop the review ("slow"); rules stand', async () => {
  // A fake engine that never answers until it is aborted.
  const fetchImpl = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const r = await A.review({ docs: longDocs(), engine: { base: 'http://127.0.0.1:11434', model: 'm' }, fetchImpl, timeoutMs: 30 });
  assert.strictEqual(r.complete, false);
  assert.strictEqual(r.stopped, 'slow');
  assert.strictEqual(r.stats.errors, 2);
});

test('AI: the time budget stops a review that would run too long ("time")', async () => {
  let clock = 0;
  const fetchImpl = async () => { clock += 1000; return { ok: true, json: async () => ({ message: { content: '{"verdict":"not_found","passage":0,"quote":"","explanation":"","confidence":"low"}' } }) }; };
  const r = await A.review({ docs: longDocs(), engine: { base: 'http://127.0.0.1:11434', model: 'm' }, fetchImpl, budgetMs: 2500, now: () => clock });
  assert.strictEqual(r.stopped, 'time');
  assert.ok(r.stats.reviewed >= 1 && r.stats.reviewed < 6);
});

test('AI: a contradiction the rules also flagged gets High confidence', async () => {
  const docs = [
    { name: 'Affidavit', role: 'affidavit', docIndex: 0, paragraphs: [{ index: 0, page: 1, text: 'On March 1, 2026, the undercover officer met John Doe at the Example City park at 9:40 PM.' }] },
    { name: 'Report', role: 'report', docIndex: 1, paragraphs: [{ index: 0, page: 1, text: 'On March 1, 2026, the undercover officer met John Doe at the Example City park at 10:40 PM.' }] },
  ];
  const quote = 'On March 1, 2026, the undercover officer met John Doe at the Example City park at 10:40 PM.';
  const fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify({ verdict: 'contradicted', passage: 1, quote, explanation: 'The time differs.', confidence: 'medium' }) } }) });
  const plain = await A.review({ docs, engine: { base: 'x', model: 'm' }, fetchImpl });
  assert.strictEqual(plain.flags[0].confidence, 'Medium');
  const ruleFlags = [{ statement: { docIndex: 0, start: 0 } }];
  const agreed = await A.review({ docs, engine: { base: 'x', model: 'm' }, fetchImpl, ruleFlags });
  assert.strictEqual(agreed.flags[0].confidence, 'High');
});

test('a stated total is compared with totals only, never with one amount elsewhere', () => {
  const flags = R.compare([
    doc('Affidavit', 'affidavit', 'On March 3, 2026, the UC paid $200, $300 and $500, a total of $1,000.'),
    doc('Report', 'report', 'On 03/03/2026 the UC paid $200 for the first buy.'),
  ]);
  assert.deepStrictEqual(flags.filter((f) => /mismatch/.test(f.title)).map((f) => f.title), []);
  const two = R.compare([
    doc('Affidavit', 'affidavit', 'In all, the UC paid a total of $1,000 on March 3, 2026.'),
    doc('Report', 'report', 'On March 3, 2026, the UC paid a total of $1,100.'),
  ]);
  assert.ok(two.some((f) => f.type === 'money' && /mismatch: "\$1,000" vs "\$1,100"/.test(f.title)));
});
