// Reference data and logic (js/reference/): values, codes, the AI's reference text, and quick links.
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

test('reference data has no phone numbers or people (public repo)', () => {
  const src = require('fs').readFileSync(require.resolve('../js/reference/ref-data.js'), 'utf8');
  // Phone numbers like 555-0142 or (312) 555-0142 (weight ranges such as 500-2000 g are fine).
  assert.doesNotMatch(src.replace(/\b\d+-\d+ ?g(rms)?\b/gi, ''), /\b\d{3}[-.]\d{4}\b|\(\d{3}\)\s*\d{3}/);
  assert.doesNotMatch(src, /\bPAX\b/);
});

test('Library, behavior and reference text reach the AI in their places, within the window', () => {
  const [sys, user] = CP.draftMessages({
    type: 'dea6', caseObj: { title: 'Made-up case', fileNumber: 'F-1', number: '00123' },
    behavior: 'Write in the style of a DEA-6 Report of Investigation.',
    examples: [{ title: 'DEA-6 sample', text: 'DETAILS\n1. On January 2, 2020, SA EXAMPLE met Pat SAMPLE.' }],
    directives: [{ title: 'Directive 12', text: 'Evidence must be sealed within 24 hours.' }],
    references: [{ title: 'Narcotics street values', text: R.narcoticsText() }],
    numCtx: 8192,
  });
  assert.match(sys.content, /HOW TO WRITE\nWrite in the style of a DEA-6 Report of Investigation\./);
  assert.match(sys.content, /Their names, dates, places, numbers and events belong to other cases/);
  assert.match(user.content, /File number: F-1\nCase number: 00123/);
  const order = ['## Directives to follow', '## Writing examples', '## Reference material'].map((hd) => user.content.indexOf(hd));
  assert.ok(order.every((x) => x > 0) && order[0] < order[1] && order[1] < order[2], 'directives, then examples, then references');
  assert.match(user.content, /### DEA-6 sample\nDETAILS/);
  assert.match(user.content, /Write a first draft of: DEA 6 - Report of Investigation\./);
  const huge = CP.draftMessages({ examples: [{ title: 'A', text: 'x'.repeat(90000) }, { title: 'B', text: 'y'.repeat(90000) }], numCtx: 4096 })[1].content;
  assert.ok(huge.length < 12000, `library text is capped (${huge.length})`);
  assert.ok(huge.includes('### A') && huge.includes('### B'), 'both examples get a share');
  assert.doesNotMatch(CP.draftMessages({})[1].content, /Writing examples|Directives to follow|Reference material/);
  assert.doesNotMatch(CP.draftMessages({})[0].content, /HOW TO WRITE/);
});

test('quick links: tabs, hiding, edits, custom links, and only web addresses', () => {
  const LK = require('../js/reference/links.js');
  const all = LK.linksOf({});
  assert.deepStrictEqual(all.filter((l) => l.tab === 'reference').map((l) => l.name), ['Location Codes', 'Common UCR', 'Narcotic Calculator']);
  assert.deepStrictEqual(all.filter((l) => l.tab === 'osint').map((l) => l.name), ['MaxMind IP', 'Fingerprint.io']);
  assert.deepStrictEqual(all.filter((l) => l.tab === 'leo').map((l) => l.name), ['Accurint', 'Kodex Portal', 'Chicago HIDTA']);
  for (const l of all) if (l.url) assert.match(l.url, /^https:\/\//, l.name);
  const s = LK.linksOf({ hidden: ['osint-fingerprint'], edits: { 'leo-chicago-hidta': { url: 'portal.example.org/login' } }, custom: [{ id: 'c1', tab: 'leo', name: 'My portal', url: 'https://example.org' }, { id: 'c2', tab: 'reference', name: 'x', url: 'https://example.org' }] });
  assert.ok(s.find((l) => l.id === 'osint-fingerprint').hidden);
  assert.strictEqual(s.find((l) => l.id === 'leo-chicago-hidta').url, 'https://portal.example.org/login');
  assert.deepStrictEqual(s.filter((l) => l.custom).map((l) => [l.tab, l.name]), [['leo', 'My portal']], 'custom links only in OSINT and LEO');
  assert.strictEqual(LK.cleanUrl('javascript:alert(1)'), null);
  assert.strictEqual(LK.cleanUrl('file:///C:/x'), null);
  assert.strictEqual(LK.cleanUrl(''), '');
  assert.strictEqual(LK.cleanUrl('http://example.org'), 'http://example.org/');
});
