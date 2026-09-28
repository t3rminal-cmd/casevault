// The self-test's own documents and expectations must hold, or the self-test would cry wolf.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/selftest.js');
const R = require('../js/checker/rules.js');
const P = require('../js/secure/pii.js');
const X = require('../js/checker/xfa.js');

test('the mini case has exactly the planted errors the self-test expects', () => {
  const flags = R.compare([
    { name: 'Affidavit', role: 'affidavit', paragraphs: [{ index: 0, page: 1, text: S.MINI_CASE.affidavit }] },
    { name: 'Report', role: 'report', paragraphs: [{ index: 0, page: 1, text: S.MINI_CASE.report }] },
  ]);
  const high = [...new Set(flags.filter((f) => f.severity === 'High').map((f) => f.type))].sort();
  assert.deepStrictEqual(high, [...S.EXPECT].sort(), flags.map((f) => f.title).join('\n'));
  assert.ok(!flags.some((f) => f.type === 'address'), 'Ave. and Avenue match');
});

test('the privacy sample hides every secret', () => {
  const known = P.knownTerms({ affiant: { name: 'Detective Casey Example', email: 'casey.example@agency.example' } });
  const r = P.redact(S.PII_TEXT, P.scan(S.PII_TEXT, { known }));
  for (const s of S.PII_SECRETS) assert.ok(!r.text.includes(s), `${s} hidden in: ${r.text}`);
});

test('the built-in PDFs are well formed and the XFA one is read', async () => {
  const pdf = S.buildPdf({ text: 'Hello (world)' });
  const txt = new TextDecoder().decode(pdf);
  assert.match(txt, /^%PDF-1\.7/);
  const xref = Number(/startxref\n(\d+)/.exec(txt)[1]);
  assert.strictEqual(txt.slice(xref, xref + 4), 'xref', 'startxref points at the xref table');
  for (const m of txt.matchAll(/^(\d{10}) 00000 n $/gm)) assert.match(txt.slice(Number(m[1])), /^\d+ 0 obj/);
  const packets = await X.readPackets(S.buildPdf({ text: 'Please wait...', xfa: S.XFA }));
  assert.deepStrictEqual(X.toParagraphs(packets).map((p) => p.text), ['Case number: 2026-00123', 'Reporting officer: Officer Alex Sample']);
});
