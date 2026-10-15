// v1.126: the theme's navy on every PDF: navy titles and section bands in a light navy tint with a navy
// edge, label boxes still light grey. Made-up data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/report-pdf.js');
const T = require('../js/timeline-pdf.js');
const A = require('../js/arrest-pdf.js');
const K = require('../js/closing.js');
const D = require('../js/draft-pdf.js');
const O = require('../js/operation.js');

const latin = (b) => Buffer.from(b).toString('latin1');
const NAVY = `${R.NAVY} rg`; const TINT = `${R.NAVY_TINT} rg`;

test('the shared colours are the theme navy (#1f3a5f) and its light tint (#e4eaf2)', () => {
  assert.strictEqual(R.NAVY, '0.122 0.227 0.373');
  assert.strictEqual(R.NAVY_TINT, '0.894 0.918 0.949');
  const ops = []; R.bandBox(ops, 10, 20, 100, 12); R.navy(ops, () => ops.push('BT ET'));
  assert.ok(ops[0].startsWith(TINT) && ops[0].includes(`${R.NAVY} RG`) && ops[0].endsWith('0 G 0 g'), 'the band resets to black after');
  assert.deepStrictEqual(ops.slice(1), [NAVY, 'BT ET', '0 g']);
});

test('every PDF type draws its title and section bands in navy', () => {
  const rows = O.mergeEvents([{ caseId: 'a', number: 'EX-1', events: [{ date: '2026-01-02', kind: 'buy', title: 'Buy 1', suspect: 'John Doe', drug: 'Cocaine', qty: '1', unit: 'g', paid: '50' }] }]);
  const a = K.emptyArrest(); Object.assign(a.arrestees[0], { firstName: 'John', lastName: 'Doe', bookingNumber: '00000001' });
  const pdfs = {
    report: latin(R.build({}, { agency: 'Example City Police' })),
    timeline: latin(T.build({ title: 'Timeline', number: 'OP-1', rows })),
    arrest: latin(A.build(a, { agency: 'Example City Police' })),
    draft: latin(D.build('# Report\n\n## Synopsis\n\nJohn Doe met Rick Poe in Example City.', { agency: 'Example City Police' })),
  };
  for (const [k, s] of Object.entries(pdfs)) {
    assert.ok(s.includes(NAVY), `${k}: navy text`);
    assert.ok(s.includes(TINT), `${k}: a navy-tinted band`);
  }
  assert.ok(pdfs.report.includes('0.9 g'), 'the report keeps its grey label boxes');
});
