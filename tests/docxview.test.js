// Word (.docx) preview and Word-to-Markdown conversion (js/docxview.js). Made-up content only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const V = require('../js/docxview.js');
const X = require('../js/drafts/docx.js');

const W = 'xmlns:w="urn:w"';
const doc = (body) => `<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`;
const p = (text, pPr = '', rPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// Read one entry from a zip, like the browser's unzipEntry().
function unzip(buf, wanted) {
  const b = Buffer.from(buf);
  let eocd = b.length - 22;
  while (b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let at = b.readUInt32LE(eocd + 16);
  for (let n = b.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = b.readUInt16LE(at + 10); const size = b.readUInt32LE(at + 20);
    const nameLen = b.readUInt16LE(at + 28); const extra = b.readUInt16LE(at + 30); const comment = b.readUInt16LE(at + 32);
    const local = b.readUInt32LE(at + 42); const name = b.toString('utf8', at + 46, at + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      const data = b.subarray(start, start + size);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    at += 46 + nameLen + extra + comment;
  }
  return null;
}

test('headings, bold/italic/underline, tabs and line breaks', () => {
  const blocks = V.parse(doc(
    p('AFFIDAVIT', '<w:pStyle w:val="Title"/>')
    + p('Probable cause', '<w:pStyle w:val="Heading1"/>')
    + '<w:p><w:r><w:t>I, </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Detective Casey Example</w:t></w:r><w:r><w:rPr><w:i/><w:u w:val="single"/></w:rPr><w:t>, state</w:t></w:r><w:r><w:tab/><w:t>A</w:t><w:br/><w:t>B</w:t></w:r></w:p>'
    + '<w:p><w:del><w:r><w:t>deleted words</w:t></w:r></w:del><w:ins><w:r><w:t>inserted words</w:t></w:r></w:ins></w:p>',
  ));
  assert.deepStrictEqual(blocks.map((b) => [b.type, b.level || null, V.plain(b.runs)]), [
    ['heading', 1, 'AFFIDAVIT'], ['heading', 1, 'Probable cause'], ['para', null, 'I, Detective Casey Example, state\tA\nB'], ['para', null, 'inserted words'],
  ]);
  assert.deepStrictEqual(blocks[2].runs.map((r) => [r.text, r.b, r.i, r.u]), [['I, ', false, false, false], ['Detective Casey Example', true, false, false], [', state', false, true, true], ['\tA\nB', false, false, false]]);
});

test('numbered and bulleted lists (numbering.xml), tables and page breaks', () => {
  const numbering = `<w:numbering ${W}>
    <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  const li = (t, id) => p(t, `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr>`);
  const blocks = V.parse(doc(li('First fact', 1) + li('Second fact', 1) + li('A bullet', 2)
    + '<w:tbl><w:tr><w:tc>' + p('Item') + '</w:tc><w:tc>' + p('Value') + '</w:tc></w:tr><w:tr><w:tc>' + p('2') + '</w:tc><w:tc>' + p('$2,540') + '</w:tc></w:tr></w:tbl>'
    + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + p('Page two')), numbering);
  assert.deepStrictEqual(blocks.slice(0, 3).map((b) => b.list.ordered), [true, true, false]);
  assert.strictEqual(blocks[3].type, 'table');
  assert.deepStrictEqual(blocks[3].rows.map((r) => r.map((c) => V.plain(c[0].runs))), [['Item', 'Value'], ['2', '$2,540']]);
  assert.ok(blocks.some((b) => b.type === 'break'));
  assert.strictEqual(V.toMarkdown(blocks), '1. First fact\n2. Second fact\n- A bullet\n\nItem | Value\n2 | $2,540\n\n---\n\nPage two\n');
});

test('Word to Markdown keeps {{placeholders}} and formatting (for templates)', () => {
  const blocks = V.parse(doc(p('Affidavit — {{case.title}}', '<w:pStyle w:val="Heading1"/>')
    + '<w:p><w:r><w:t xml:space="preserve">Case No. </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>{{case.number}}</w:t></w:r></w:p>'
    + p('I, {{affiant.name}}, being duly sworn, state:')));
  assert.strictEqual(V.toMarkdown(blocks), '# Affidavit — {{case.title}}\n\nCase No. **{{case.number}}**\n\nI, {{affiant.name}}, being duly sworn, state:\n');
});

test('a .docx written by CaseVault reads back with its structure', () => {
  const bytes = X.buildDocx('# AFFIDAVIT\n\nI, **Detective Casey Example**, state:\n\n1. On 03/14/2026 at 2140 hours...\n2. Officer Alex Sample observed...\n\n- a bullet', { title: 'Test' });
  const blocks = V.parse(unzip(bytes, 'word/document.xml'), unzip(bytes, 'word/numbering.xml') || '');
  const kinds = blocks.map((b) => (b.type === 'para' && b.list ? (b.list.ordered ? 'ol' : 'ul') : b.type));
  assert.deepStrictEqual(kinds, ['heading', 'para', 'ol', 'ol', 'ul']);
  assert.ok(blocks[1].runs.some((r) => r.b && r.text === 'Detective Casey Example'));
});
