// Reference data and logic (js/reference/): values, complaint forms, SFST, DUI flow, codes, AI text.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/reference/reference.js');
const RD = require('../js/reference/ref-data.js');
const CP = require('../js/drafts/copilot.js');

test('street values: the calculator, estimates and verify marks', () => {
  const r = R.streetValue('Cocaine (Powder)', 28, 'gram');
  assert.deepStrictEqual([r.ok, r.value, r.text], [true, 3500, '$3,500.00']);
  assert.match(r.line, /^Cocaine \(Powder\), 28 grams: approximate street value \$3,500\.00 \(HIDTA 2022, \$125\.00 per gram\)\.$/);
  assert.match(R.streetValue('Heroin (Tan)', 1, 'pound').text, /estimate: gram price × 454/);
  assert.match(R.streetValue('Methamphetamine', 2, 'gram').text, /needs verification/);
  assert.strictEqual(R.streetValue('Adderall', 3, 'gram').ok, false);
  assert.match(R.streetValue('Adderall', 3, 'gram').error, /Try: pill/);
  assert.strictEqual(R.streetValue('Cocaine (Powder)', 0, 'gram').ok, false);
  const chart = R.valueChart();
  assert.deepStrictEqual(chart.map((g) => g.category), RD.NARCOTIC_CATEGORIES);
  assert.strictEqual(chart.flatMap((g) => g.rows).length, Object.keys(RD.NARCOTIC_DATA).length);
  assert.ok(chart.find((g) => g.category === 'Heroin').rows[0].cells.pound.estimate);
});

test('complaint forms: list, file names, weights and charges', () => {
  const all = R.complaintList();
  assert.strictEqual(all.length, 55);
  assert.strictEqual(new Set(all.map((c) => c.file)).size, all.length);
  for (const c of all) assert.match(c.file, /^(possession|delivery|other)\/[\w.+-]+\.pdf$/, c.file);
  assert.strictEqual(R.complaintByFileName('C:\\Downloads\\poss_402-c_heroin_00-15grms.PDF').cite, '570/402(c)');
  assert.strictEqual(R.complaintByFileName('nope.pdf'), null);
  assert.deepStrictEqual(R.findComplaints({ drugKey: 'cocaine', grams: 20, kind: 'possession' }).map((c) => c.cite), ['570/402(a)(2)(A)']);
  assert.deepStrictEqual(R.findComplaints({ drugKey: 'cocaine', grams: 100, kind: 'possession' }).map((c) => c.range), ['100-400 g']);
  assert.deepStrictEqual(R.findComplaints({ drugKey: 'heroin', grams: 0.5, kind: 'delivery' }).map((c) => c.cite), ['570/401(d)(i)']);
  assert.strictEqual(R.gramsOf('2 oz'), 56.699);
  assert.strictEqual(R.gramsOf('1.5 kg'), 1500);
  assert.strictEqual(R.drugKeyOf('Possession of crack cocaine'), 'cocaine');
  assert.strictEqual(R.drugKeyOf('PWID methamphetamine'), 'methamphetamine');
  const s = R.suggestComplaints([
    { statute: '720 ILCS 570/402(c)', description: 'Possession of a controlled substance (heroin)' },
    { statute: '', description: 'Delivery of cocaine, 3.2 g' },
    { statute: 'TEST 9.99', description: 'Resisting' },
  ]);
  assert.deepStrictEqual(s.map((c) => c.file), ['possession/POSS_402-C_Heroin_00-15grms.pdf', 'delivery/DELV_401-C-2_Cocaine_01-15grms.pdf']);
});

test('SFST: clues add up against the decision points', () => {
  const st = { hgn: { clues: { '0-left': true, '0-right': true, '1-left': true, '2-right': true } }, wat: { clues: { 1: true } }, ols: { cantPerform: true } };
  const sc = R.sfstScores(st);
  assert.deepStrictEqual(sc.map((x) => [x.key, x.clues, x.over]), [['hgn', 4, true], ['wat', 1, false], ['ols', 0, false]]);
  assert.strictEqual(sc[2].text, 'Could not perform the test.');
  const md = R.sfstMarkdown({ ...st, alternate: { 'Alphabet test': 'Fail' }, pbt: '0.112' }, { officer: 'Officer Alex Sample', date: '2026-09-29' });
  assert.match(md, /- \*\*Officer:\*\* Officer Alex Sample/);
  assert.match(md, /- Lack of smooth pursuit: left \[x\], right \[x\]/);
  assert.match(md, /\*\*Score:\*\* 4 of 6 clues; decision point 4: at or above the decision point\./);
  assert.match(md, /- \[x\] Starts too soon/);
  assert.match(md, /- Alphabet test: Fail\n- PBT result: 0\.112/);
});

test('DUI flow: the answers choose the path', () => {
  assert.deepStrictEqual(R.duiPath({}), ['p1', 'p2', 'p3']);
  assert.deepStrictEqual(R.duiPath({ pc: 'No' }), ['p1', 'p2', 'p3', 'end-release']);
  assert.deepStrictEqual(R.duiPath({ pc: 'Yes', submits: 'No' }), ['p1', 'p2', 'p3', 'p4', 'p5', 'p8']);
  assert.deepStrictEqual(R.duiPath({ pc: 'Yes', submits: 'Yes', bac: '0.08 or above' }), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8']);
  assert.deepStrictEqual(R.duiPath({ pc: 'Yes', submits: 'Yes', bac: 'Under 0.08' }), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  const md = R.duiMarkdown({ stopTime: '23:05', pc: 'No' }, { caseNo: 'TEST-1' });
  assert.match(md, /- \*\*RD \/ Case #:\*\* TEST-1/);
  assert.match(md, /- Time of stop: 23:05/);
  assert.match(md, /\*\*No probable cause: issue a citation, post bond, or release\.\*\*/);
  assert.doesNotMatch(md, /Phase IV/);
});

test('codes: search by code or words, and category filter', () => {
  const hand = R.searchCodes(RD.UCR_CODES, 'agg handgun').flatMap((g) => g.codes.map((c) => c[0]));
  assert.ok(hand.includes('051A') && hand.includes('041A'));
  assert.deepStrictEqual(R.searchCodes(RD.UCR_CODES, '051').flatMap((g) => g.codes.map((c) => c[0])), ['051A', '051B']);
  assert.strictEqual(R.searchCodes(RD.LOCATION_CODES, '', 'medical').length, 1);
  assert.deepStrictEqual(R.searchCodes(RD.LOCATION_CODES, 'zzzz'), []);
  for (const list of [RD.UCR_CODES, RD.LOCATION_CODES]) {
    const codes = list.flatMap((g) => g.codes.map((c) => c[0]));
    assert.ok(codes.every((c) => /^[0-9A-Z]{3,4}$/.test(c)), 'codes look like codes');
  }
});

test('reference material goes to the AI as wording, not facts, and fits the window', () => {
  const refs = [{ title: 'Complaint form: Possession', text: 'IN THE CIRCUIT COURT OF COOK COUNTY ... 720 ILCS 570/402(c)' }, { title: 'Narcotics street values', text: R.narcoticsText() }];
  const [sys, user] = CP.draftMessages({ type: 'complaint', caseObj: { title: 'Made-up case' }, references: refs, numCtx: 8192 });
  assert.match(sys.content, /never treat it as facts about this case/);
  assert.match(user.content, /## Reference material \(forms and lists to follow for wording, statutes and codes; NOT facts of this case\)\n### Complaint form: Possession\nIN THE CIRCUIT COURT/);
  assert.match(user.content, /Write a first draft of: Criminal complaint\./);
  assert.match(R.narcoticsText(), /- Cocaine \(Powder\): \$125\.00\/gram, \$1,200\.00\/ounce/);
  const huge = CP.draftMessages({ references: [{ title: 'Big', text: 'x'.repeat(100000) }], numCtx: 4096 })[1].content;
  assert.ok(huge.length < 12000, `references are capped (${huge.length})`);
  assert.doesNotMatch(CP.draftMessages({})[1].content, /Reference material/);
});

test('reference data has no phone numbers or people (public repo)', () => {
  const src = require('fs').readFileSync(require.resolve('../js/reference/ref-data.js'), 'utf8');
  // Phone numbers like 555-0142 or (312) 555-0142 (weight ranges such as 500-2000 g are fine).
  assert.doesNotMatch(src.replace(/\b\d+-\d+ ?g(rms)?\b/gi, ''), /\b\d{3}[-.]\d{4}\b|\(\d{3}\)\s*\d{3}/);
  assert.doesNotMatch(src, /\bPAX\b/);
});
