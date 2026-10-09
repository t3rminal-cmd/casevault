// v1.104: a PDF can be attached to an exhibit as well as photos.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ui = read('js/report-fields-ui.js');

test('v1.104: the exhibit picker takes PDFs, and every page of one goes into the report', () => {
  assert.match(ui, /const PICK_ACCEPT = 'image\/\*,application\/pdf,\.pdf'/);
  assert.equal((ui.match(/accept: PICK_ACCEPT/g) || []).length, 2, 'exhibits and additional exhibits');
  assert.match(ui, /async function pdfJpegs/);
  assert.match(ui, /page \$\{k \+ 1\} of \$\{n\}/, 'captions name the page');
  assert.match(ui, /Add Photos or PDF/);
});

test('v1.104: an additional exhibit counts its PDFs apart from its images', () => {
  const F = require('../js/report-fields.js');
  const line = (photos) => F.extraLine({ number: 1, kind: 'photos', title: '', description: '', photos, photoLabels: [] });
  assert.match(line(['a.jpg', 'b.jpg']), /\(2 images\)$/);
  assert.match(line(['a.jpg', 'lab.pdf']), /\(1 image, 1 PDF\)$/);
  assert.match(line(['lab.pdf']), /\(1 PDF\)$/);
  assert.match(line([]), /\(0 images\)$/);
});
