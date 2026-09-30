'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/report-fields.js');
const P = require('../js/report-pdf.js');

test('Report Fields: exhibit numbers count on across cases and are never reused', () => {
  assert.strictEqual(F.nextExhibit([]), 1);
  assert.strictEqual(F.nextExhibit([1, 2, 3]), 4);
  assert.strictEqual(F.nextExhibit([1, '7', 0, 'N-12']), 13, 'numbers from other cases and a kept "last given" count too');
});

test('Report Fields: labels are Title Case without parentheses', () => {
  for (const [, label] of F.FIELDS) {
    assert.doesNotMatch(label, /[()]/, label);
    assert.match(label, /^[A-Z0-9]/, label);
  }
});

test('Report Fields: saves from before v1.20 are brought up to date', () => {
  const d = F.normalize({ schema: 1, offense: 'X', evidence: [{ number: 1, description: 'old', type: 'Narcotic' }, { number: 2, type: 'Recording (audio/video)' }] });
  assert.deepStrictEqual(d.evidence.map((e) => e.type), ['Narcotics', 'Video/Audio']);
  assert.strictEqual(d.evidence[0].inventory, '');
  assert.strictEqual(d.victimVerified, false);
  assert.strictEqual(d.schema, 2);
});

test('Report Fields: placeholders, AI text and a report made from them', () => {
  const d = { ...F.empty(), caseNumber: 'JH123456', offense: 'Delivery of a controlled substance', ucr: '2012 Delv: Cocaine', date: '2026-03-14', fire: 'No', method: 'On View', victimVerified: true,
    evidence: [{ number: 5, inventory: '14000001', description: '3 bags of white powder', type: 'Narcotics', drug: 'Cocaine', weight: '12.4 g' }, { number: 6, type: 'Currency', drug: 'ignored', description: '$300' }],
    narrative: 'On 03.14.2026 TFO Sample purchased…' };
  const ctx = F.context(d);
  assert.strictEqual(ctx['report.ucr'], '2012 Delv: Cocaine');
  assert.strictEqual(ctx['report.date'], '03.14.2026');
  assert.strictEqual(ctx['report.victimVerified'], 'Yes');
  assert.strictEqual(ctx['report.evidence'], 'Exhibit 5, Inventory 14000001: Narcotics, Cocaine, 12.4 g. 3 bags of white powder\nExhibit 6: Currency. $300');
  const t = F.asText(d);
  assert.match(t, /Offense Classification \/ Last Report: Delivery/);
  assert.doesNotMatch(t, /Beat Assigned/, 'empty fields are left out');
  const md = F.toMarkdown(d, 'Supplementary Report');
  assert.match(md, /\| IUCR Code \| 2012 Delv: Cocaine \|/);
  assert.match(md, /\| 5 \| 14000001 \| Narcotics \| Cocaine \| 12\.4 g \| 3 bags of white powder \|/);
  assert.match(md, /\| 6 \|  \| Currency \|  \|  \| \$300 \|/, 'narcotic type and weight only for narcotics');
  assert.match(md, /## Summary of Investigation\n\nOn 03\.14\.2026/);
  assert.ok(F.PLACEHOLDERS.includes('report.narrative'));
});

test('Report PDF: a valid PDF with the fields, signature fields and page numbers', () => {
  const d = { ...F.empty(), caseNumber: 'JH123456', offense: 'Delivery (cocaine)', status: '3 - C/C', victimVerified: true,
    evidence: [{ number: 1, inventory: '14000001', type: 'Narcotics', drug: 'Cocaine', weight: '12.4 g', description: 'Three bags. '.repeat(40) }],
    narrative: `**Bold** start. “Quoted” – dash.\n\n${'Surveillance continued. '.repeat(400)}` };
  const bytes = P.build(d, { agency: 'Example Police Department', caseLabel: 'Operation Example · Case JH123456', printed: '03.15.2026' });
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.7'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\(Example Police Department\)/);
  assert.match(s, /\(Delivery \\\(cocaine\\\)\)/, 'parentheses are escaped');
  assert.match(s, /\\223Quoted\\224 \\226 dash/, 'curly quotes and dashes in WinAnsi');
  assert.doesNotMatch(s, /\*\*Bold/, 'Markdown marks are taken off');
  const pages = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.ok(pages >= 3, `long summary flows onto more pages (${pages})`);
  assert.match(s, new RegExp(`Page ${pages} of ${pages}`));
  assert.strictEqual((s.match(/\/FT \/Sig/g) || []).length, 4, 'four signature fields');
  // Every xref offset points at its object.
  const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
  const table = s.slice(xref).split('\n').slice(3).filter((l) => /^\d{10} 00000 n/.test(l));
  table.forEach((l, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, Number(l.slice(0, 10))), `object ${i + 1}`));
});

test('Report PDF: wrapping keeps lines inside the width and breaks long words', () => {
  const lines = P.wrap('A '.repeat(100) + 'X'.repeat(300), 9, 200);
  for (const l of lines) assert.ok(P.width(l, 9) <= 200.01, l);
  assert.ok(lines.join('').includes('XXXX'));
});
