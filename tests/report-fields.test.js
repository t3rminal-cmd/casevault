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
  assert.strictEqual(d.schema, 3);
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

test('Report Fields v1.21: lists, parts left out, and v1.20 single entries moved into the lists', () => {
  const d = F.normalize({ schema: 2, victimName: 'State of Illinois', offenderName: 'DOE, John', offenderRelation: 'X', charges: '720 ILCS 570/401', gangAffiliation: 'Latin Kings', vehicle: '2015 Honda', impound: 'Towed' });
  assert.strictEqual(d.victimsList[0].name, 'State of Illinois');
  assert.deepStrictEqual([d.offendersList[0].name, d.offendersList[0].relation], ['DOE, John', 'X']);
  assert.strictEqual(d.charges[0].description, '720 ILCS 570/401');
  assert.strictEqual(d.gangs[0].name, 'Latin Kings');
  assert.strictEqual(d.vehicles[0].notes, '2015 Honda; Towed');
  assert.ok(!('victimName' in d) && !('vehicle' in d));
  assert.strictEqual(F.normalize(d).victimsList.length, 1, 'normalizing twice does not add again');
  d.offendersList[0].dob = '1990-01-02';
  assert.match(F.itemLine('offendersList', d.offendersList[0]), /^DOE, John, Relation Code: X, Date of Birth: 01\.02\.1990/);
  d.hidden = ['people'];
  assert.doesNotMatch(F.asText(d), /Offender:/);
  assert.doesNotMatch(F.toMarkdown(d), /Victims and Offenders/);
  assert.ok(F.PICKS.gang.includes('Gangster Disciples') && F.PICKS.victim.includes('State of Illinois'));
});

test('Report PDF: exhibit photos on Exhibit Attachments pages; hidden parts left out', () => {
  // A tiny valid JPEG is not needed: the writer only wraps the bytes.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const d = F.normalize({ evidence: [{ number: 1, type: 'Narcotics', photos: ['a.jpg'] }], hidden: ['assignment'], offendersList: [{ name: 'DOE, John' }] });
  const s = Buffer.from(P.build(d, { photos: [{ jpeg, w: 800, h: 600, caption: 'Exhibit 1' }, { jpeg, w: 600, h: 800, caption: 'Exhibit 1' }] })).toString('latin1');
  assert.match(s, /\/Subtype \/Image \/Width 800 \/Height 600/);
  assert.match(s, /\(EXHIBIT ATTACHMENTS\)/);
  assert.match(s, /\/XObject << \/Im0 \d+ 0 R \/Im1 \d+ 0 R >>/, 'both photos on one page');
  assert.doesNotMatch(s, /\(ASSIGNMENT\)/);
  assert.match(s, /\(DOE, John\)/);
  const noEvidence = Buffer.from(P.build({ ...d, hidden: ['evidence'] }, { photos: [{ jpeg, w: 10, h: 10 }] })).toString('latin1');
  assert.doesNotMatch(noEvidence, /EXHIBIT ATTACHMENTS|\/Subtype \/Image/, 'no evidence part, no photo pages');
});
