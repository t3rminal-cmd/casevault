// Tests for spreadsheet reading (Excel/CSV) used by the preview and the checker.
// Fixtures are built in memory: the repo deliberately refuses to store .xlsx/.csv files.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('../vendor/sheetjs/xlsx.full.min.js');
const S = require('../js/checker/sheets.js');
const R = require('../js/checker/rules.js');

function makeXlsx() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Item', 'Description', 'Plate', 'Booked'],
    ['17', 'Blue Honda Civic', 'ABC-1284', '03/14/2026'],
    [],
    ['18', 'Two spent shell casings', '', '03/14/2026'],
  ]), 'Evidence');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[42, 'no header here'], ['<script>alert(1)</script>', 'x']]), 'Notes & misc');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

test('xlsx: sheets, real row numbers, header detection', () => {
  const sheets = S.parse(XLSX, new Uint8Array(makeXlsx()), 'evidence log.xlsx');
  assert.deepStrictEqual(sheets.map((s) => s.name), ['Evidence', 'Notes & misc']);
  assert.deepStrictEqual(sheets[0].rows.map((r) => r.row), [1, 2, 4], 'blank row 3 skipped, numbering kept');
  assert.strictEqual(sheets[0].columns, 4);
  assert.ok(S.headerOf(sheets[0]));
  assert.strictEqual(S.headerOf(sheets[1]), null, 'a numeric first row is not a header');
});

test('xlsx: one checker paragraph per row with sheet + row location', () => {
  const paras = S.paragraphs(S.parse(XLSX, new Uint8Array(makeXlsx()), 'evidence.xlsx'));
  assert.deepStrictEqual(paras.map((p) => p.text), [
    'Evidence row 2: Item=17; Description=Blue Honda Civic; Plate=ABC-1284; Booked=03/14/2026',
    'Evidence row 4: Item=18; Description=Two spent shell casings; Booked=03/14/2026',
    'Notes & misc row 1: col A=42; col B=no header here',
    'Notes & misc row 2: col A=<script>alert(1)</script>; col B=x',
  ]);
  assert.deepStrictEqual([paras[1].sheet, paras[1].row, paras[1].page], ['Evidence', 4, null]);
});

test('csv: raw values kept exactly (leading zeros, dates)', () => {
  const csv = 'Badge,Officer,Date\n0012,Maria Dias,03/14/2026\n0457,"Lee, Robert",2026-03-15\n';
  const sheets = S.parse(XLSX, csv, 'roster.csv');
  assert.strictEqual(sheets.length, 1);
  assert.deepStrictEqual(sheets[0].rows[1].cells, ['0012', 'Maria Dias', '03/14/2026']);
  assert.deepStrictEqual(sheets[0].rows[2].cells, ['0457', 'Lee, Robert', '2026-03-15']);
  const paras = S.paragraphs(sheets);
  assert.strictEqual(paras[0].text, 'Sheet1 row 2: Badge=0012; Officer=Maria Dias; Date=03/14/2026');
});

test('checker flags point at the sheet and row', () => {
  const sheetParas = S.paragraphs(S.parse(XLSX, new Uint8Array(makeXlsx()), 'evidence.xlsx'));
  const flags = R.compare([
    { name: 'Affidavit.docx', role: 'affidavit', paragraphs: [{ index: 0, page: 1, text: 'Officers seized a blue Honda Civic bearing license plate ABC-1234.' }] },
    { name: 'evidence.xlsx', role: 'report', paragraphs: sheetParas },
  ]);
  const plate = flags.find((f) => f.type === 'plate');
  assert.ok(plate, flags.map((f) => f.title).join('\n'));
  assert.strictEqual(plate.severity, 'High');
  assert.deepStrictEqual([plate.source.doc, plate.source.sheet, plate.source.row, plate.source.page], ['evidence.xlsx', 'Evidence', 2, null]);
});

test('columnLetter and isSheet', () => {
  assert.deepStrictEqual([0, 25, 26, 27, 701, 702].map(S.columnLetter), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.ok(S.isSheet('a.XLSX') && S.isSheet('b.xls') && S.isSheet('c.csv') && !S.isSheet('d.docx'));
});
