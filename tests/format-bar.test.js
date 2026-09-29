// The Notes/Drafts formatting bar's text edits (js/format-bar.js), the Markdown preview's tables and
// underline (js/markdown.js), and the Word export's tables and underline (js/drafts/docx.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/format-bar.js');
const M = require('../js/markdown.js');
const D = require('../js/drafts/draft-core.js');

test('bold, italic and underline wrap the selection, and unwrap it again', () => {
  const t = 'The officer saw the car.';
  const b = F.wrap(t, 4, 11, '**');
  assert.deepStrictEqual(b, { text: 'The **officer** saw the car.', start: 6, end: 13 });
  assert.strictEqual(F.wrap(b.text, b.start, b.end, '**').text, t, 'toggles off around the selection');
  assert.strictEqual(F.wrap(b.text, 4, 15, '**').text, t, 'toggles off when the markers are selected');
  assert.strictEqual(F.wrap(t, 4, 12, '++').text, 'The ++officer++ saw the car.', 'the trailing space stays outside');
  assert.deepStrictEqual(F.wrap('ab', 1, 1, '*'), { text: 'a*text*b', start: 2, end: 6 }, 'nothing selected: a placeholder');
});

test('headings and lists on the selected lines, toggled', () => {
  const t = 'one\ntwo\n\nthree';
  const n = F.prefixLines(t, 0, 7, 'number');
  assert.strictEqual(n.text, '1. one\n2. two\n\nthree');
  assert.strictEqual(F.prefixLines(n.text, 0, n.end, 'number').text, t);
  assert.strictEqual(F.prefixLines(t, 5, 5, 'bullet').text, 'one\n- two\n\nthree');
  assert.strictEqual(F.prefixLines('- one', 0, 0, 'heading').text, '## one', 'a heading replaces the list marker');
});

test('tables: inserted on their own lines, shown in the preview, exported to Word', () => {
  assert.strictEqual(F.tableMarkdown(3, 2), '| Column 1 | Column 2 |\n| --- | --- |\n|   |   |\n|   |   |');
  const r = F.insertTable('Before', 6, 6, 2, 2);
  assert.strictEqual(r.text, 'Before\n\n| Column 1 | Column 2 |\n| --- | --- |\n|   |   |\n\n');
  assert.strictEqual(r.text.slice(r.start, r.end), 'Column 1');
  const html = M.render('| Item | Qty |\n| --- | ---: |\n| **Cocaine** | 28 g |\n| <b>x</b> | a\\|b |');
  assert.match(html, /<table class="md-table"><thead><tr><th>Item<\/th><th class="al-right">Qty<\/th><\/tr><\/thead>/);
  assert.match(html, /<td><strong>Cocaine<\/strong><\/td>/);
  assert.match(html, /<td>&lt;b&gt;x&lt;\/b&gt;<\/td><td class="al-right">a\|b<\/td>/, 'escaped; \\| is a pipe');
  assert.doesNotMatch(html, /style=/, 'no inline styles (the CSP blocks them)');
  assert.strictEqual(M.render('++under++'), '<p><u>under</u></p>');
  assert.strictEqual(D.stripMarkdown('++u++ and\n| a | b |\n|---|---|\n| 1 | 2 |'), 'u and\na   b\n\n1   2');
});

test('Word export: underline runs and a real table', () => {
  const X = require('../js/drafts/docx.js');
  const zlib = require('node:zlib');
  const bytes = X.buildDocx('Text ++under++.\n\n| A | B |\n|---|---|\n| 1 | 2 |', { title: 'T' });
  const buf = Buffer.from(bytes);
  // stored zip: find word/document.xml
  const i = buf.indexOf('word/document.xml');
  const xml = buf.toString('utf8', i, i + 20000);
  assert.match(xml, /<w:u w:val="single"\/><\/w:rPr><w:t xml:space="preserve">under<\/w:t>/);
  assert.match(xml, /<w:tbl>.*<w:tblHeader\/>.*<w:t xml:space="preserve">A<\/w:t>.*<w:t xml:space="preserve">2<\/w:t>.*<\/w:tbl>/s);
  assert.ok(zlib);
});

test('Tab indents, Shift+Tab outdents, one line or several', () => {
  const F = require('../js/format-bar.js');
  assert.deepStrictEqual(F.indent('ab', 1, 1), { text: 'a\tb', start: 2, end: 2 });
  const two = 'one\ntwo\nthree';
  const r = F.indent(two, 0, 7);
  assert.strictEqual(r.text, '\tone\n\ttwo\nthree');
  assert.strictEqual(F.indent(r.text, r.start, r.end, true).text, two);
  assert.strictEqual(F.indent('\tx', 2, 2, true).text, 'x');
  assert.strictEqual(F.indent('    x', 5, 5, true).text, 'x', 'four spaces count as one indent');
  assert.strictEqual(F.indent('x', 1, 1, true).text, 'x', 'nothing to take off');
});
