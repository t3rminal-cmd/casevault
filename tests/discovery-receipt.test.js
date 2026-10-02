// v1.55: the discovery receipt PDF: what was produced, the acknowledgment, three signature lines.
// Everything here is made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DR = require('../js/discovery-receipt.js');

const entry = {
  produced: '2026-10-02', producedTo: 'ASA Example', prefix: 'DISC', batesFirst: 1, batesLast: 5, folder: 'Discovery 2026-10-02 (DISC-000001 - DISC-000005)',
  items: [{ path: 'Case Report/2026-EX-1-report.pdf', batesFirst: 1, batesLast: 4, pages: 4, sha256: 'ab'.repeat(32) }, { path: 'Recordings/Audio/call.wav', batesFirst: 5, batesLast: 5, pages: 1, sha256: 'cd'.repeat(32) }],
};

test('the receipt holds the production, the items, the acknowledgment and the signature lines', () => {
  const bytes = DR.build(entry, { caseLabel: 'Case EX-1 · John Doe', officer: 'P.O. Sample', agency: 'Example City P.D.', medium: 'USB drive', sizeText: '2.1 MB', printed: 'October 2, 2026' });
  const s = Buffer.from(bytes).toString('latin1');
  assert.match(s, /^%PDF-1\.7/);
  for (const t of ['DISCOVERY RECEIPT', 'EXAMPLE CITY P.D.', 'DISC-000001 to DISC-000005', 'ASA Example', 'P.O. Sample', 'DATE OF RECEIPT', 'TIME OF RECEIPT', 'RECEIVED BY', 'TURNED OVER BY', 'WITNESS', 'ACKNOWLEDGMENT OF RECEIPT', '2026-EX-1-report.pdf', 'DISC-000001-000004', 'abababab']) assert.match(s, new RegExp(t), t);
  assert.match(s, /\/BaseFont \/Courier/);
  // A valid xref: every offset points at its object.
  const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
  const offs = s.slice(xref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
  offs.forEach((o, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1}`));
});

test('a long list goes over more pages', () => {
  const many = { ...entry, items: Array.from({ length: 80 }, (_, i) => ({ path: `Other/file-${i}.txt`, batesFirst: i + 1, batesLast: i + 1, pages: 1, sha256: 'ef'.repeat(32) })) };
  assert.ok(DR.layout(many, { caseLabel: 'Case EX-1' }).length >= 2);
});
