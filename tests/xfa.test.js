// Tests for XFA (LiveCycle) PDF forms. The PDFs are built in the test from made-up data.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const X = require('../js/checker/xfa.js');
const R = require('../js/checker/rules.js');
const { buildXfaPdf } = require('./helpers/xfa-pdf.js');

const EXPECTED = [
  'Report number: TEST-0001',
  'Reporting officer: Officer Alex Sample',
  'Date of incident: 03/14/2026',
  'Vehicle licence plate: ZZZ-0000',
  'Timeline row 1: Date=03/14/2026; Type=Arrival; Narrative=Officer Alex Sample arrived at 100 Example Street at 21:40.',
  'Timeline row 2: Date=03/14/2026; Type=Interview; Narrative=Witness Jordan Placeholder said they heard two shots & saw a person run north.',
  'Additional notes: First line. Second line.',
];

for (const layout of ['packets', 'single', 'objstm']) {
  test(`XFA extraction (${layout}): captions, form order, repeated rows, no images, no empty fields`, async () => {
    const packets = await X.readPackets(buildXfaPdf({ layout }));
    assert.ok(packets && packets.template && packets.datasets, 'template and datasets found');
    const paras = X.toParagraphs(packets);
    assert.deepStrictEqual(paras.map((p) => p.text), EXPECTED);
    assert.deepStrictEqual(paras.map((p) => p.page), EXPECTED.map(() => 1), 'location is page 1');
    assert.strictEqual(paras[4].field, 'Timeline row 1', 'rows carry their path for click-to-jump');
    assert.strictEqual(paras[1].field, 'Reporting officer');
    assert.ok(!paras.some((p) => /iVBOR/.test(p.text)), 'base64 image skipped');
  });
}

test('not XFA: ordinary PDFs return null', async () => {
  const plain = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  assert.strictEqual(await X.readPackets(plain), null);
  assert.strictEqual(await X.isXfa(plain), false);
});

test('encrypted XFA forms are recognised (and left to pdf.js)', async () => {
  await assert.rejects(X.readPackets(buildXfaPdf({ encrypt: true })), (e) => e.name === 'XfaEncryptedError');
  assert.strictEqual(await X.isXfa(buildXfaPdf({ encrypt: true })), true);
});

test('fallback captions: field names are made readable when the template has none', () => {
  const paras = X.toParagraphs({ template: '', datasets: '<xfa:datasets xmlns:xfa="x"><xfa:data><f><suspect_name>Test Person</suspect_name><vehicleColour>Blue</vehicleColour></f></xfa:data></xfa:datasets>' });
  assert.deepStrictEqual(paras.map((p) => p.text), ['Suspect name: Test Person', 'Vehicle Colour: Blue']);
});

test('the "Please wait" placeholder text is recognised as no usable text', () => {
  assert.ok(X.isPlaceholderText('Please wait... If this message is not eventually replaced by the proper contents of the document, your PDF viewer may not be able to display this type of document.'));
  assert.ok(X.isPlaceholderText('   '));
  assert.ok(!X.isPlaceholderText('On 03/14/2026 Officer Alex Sample responded.'));
});

test('XML parser: entities, CDATA, comments, prefixes, self-closing tags', () => {
  const root = X.parseXml('<?xml version="1.0"?><!-- c --><a:x k="1 &amp; 2"><b>T &lt;3 &#65;&#x42;</b><c/><d><![CDATA[<raw>]]></d></a:x>');
  const x = root.children[0];
  assert.deepStrictEqual([x.name, x.local, x.attrs.k], ['a:x', 'x', '1 & 2']);
  assert.deepStrictEqual(x.children.map((c) => c.local), ['b', 'c', 'd']);
  assert.strictEqual(x.children[0].children[0], 'T <3 AB');
  assert.strictEqual(x.children[2].children[0], '<raw>');
});

test('the checker compares XFA fields like any other text', async () => {
  const paras = X.toParagraphs(await X.readPackets(buildXfaPdf()));
  const flags = R.compare([
    { name: 'Affidavit.docx', role: 'affidavit', paragraphs: [{ index: 0, page: 1, text: 'Witness Jordan Placeholder said they heard three shots and saw a person run north.' }] },
    { name: 'Report.pdf', role: 'report', paragraphs: paras },
  ]);
  const count = flags.find((f) => f.type === 'count');
  assert.ok(count, flags.map((f) => f.title).join('\n'));
  assert.strictEqual(count.severity, 'High');
  assert.deepStrictEqual([count.source.doc, count.source.page, count.source.field], ['Report.pdf', 1, 'Timeline row 2']);
});
