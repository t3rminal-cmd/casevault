/* CaseVault — spreadsheets (.xlsx, .xls, .ods, .csv) via the bundled SheetJS library.
 *
 * Used by the file preview (one table per sheet) and by the consistency checker, which gets one
 * "paragraph" per row: "Sheet1 row 5: Name=Maria Diaz; Date=03/14/2026", with the sheet name and
 * row number kept as the location so click-to-jump works.
 *
 * SheetJS is loaded lazily from vendor/sheetjs/ the first time a spreadsheet is opened.
 * The parsing functions take the library as an argument, so they also run under Node for tests.
 */
'use strict';

(function (root) {
  const MAX_ROWS = 5000;   // per sheet, for the checker and the preview
  const MAX_COLS = 200;
  const SHEET_EXT = new Set(['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'tsv']);

  const extOf = (name) => (String(name).includes('.') ? String(name).split('.').pop().toLowerCase() : '');
  const isSheet = (name) => SHEET_EXT.has(extOf(name));

  /* ---------------- loading the library (browser only) ---------------- */

  let loading = null;
  function load() {
    if (root.XLSX) return Promise.resolve(root.XLSX);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = new URL('vendor/sheetjs/xlsx.full.min.js', document.baseURI).href;
        s.onload = () => (root.XLSX ? resolve(root.XLSX) : reject(new Error('The spreadsheet reader did not load.')));
        s.onerror = () => reject(new Error('Could not load the spreadsheet reader (vendor/sheetjs).'));
        document.head.append(s);
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  /* ---------------- parsing ---------------- */

  /**
   * Parse a workbook into plain string cells.
   * data: ArrayBuffer/Uint8Array for binary formats; for CSV/TSV pass the decoded text.
   * Returns [{ name, rows: [{ row, cells: [string] }], columns, truncated }]
   * `row` is the real 1-based row number in the sheet, so locations match what Excel shows.
   */
  function parse(XLSX, data, fileName) {
    const ext = extOf(fileName);
    const text = ext === 'csv' || ext === 'tsv';
    const wb = XLSX.read(data, {
      type: text ? 'string' : 'array',
      raw: text,              // CSV: keep "0012" and "03/14/2026" exactly as written
      dense: true,
      cellFormula: false,     // read values only; formulas are never evaluated
      cellHTML: false,
      sheetRows: MAX_ROWS + 1,
      FS: ext === 'tsv' ? '\t' : undefined,
    });
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) return { name, rows: [], columns: 0, truncated: false };
      const range = XLSX.utils.decode_range(ws['!ref']);
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true });
      const rows = [];
      let columns = 0;
      grid.forEach((cells, i) => {
        const clean = cells.slice(0, MAX_COLS).map((v) => String(v ?? '').replace(/\s+/g, ' ').trim());
        while (clean.length && clean[clean.length - 1] === '') clean.pop();
        if (!clean.length) return;
        columns = Math.max(columns, clean.length);
        rows.push({ row: range.s.r + i + 1, cells: clean });
      });
      return { name, rows, columns, truncated: range.e.r - range.s.r + 1 > MAX_ROWS, startCol: range.s.c };
    });
  }

  function columnLetter(n) {
    let s = '';
    for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  // A first row of text labels (no numbers, at least two cells) is treated as the header row.
  function headerOf(sheet) {
    const first = sheet.rows[0];
    if (!first || sheet.rows.length < 2) return null;
    const filled = first.cells.filter(Boolean);
    if (filled.length < 2 || filled.some((v) => /^[\d.,$%\-/: ]+$/.test(v))) return null;
    return first;
  }

  /** One paragraph per row for the checker. */
  function paragraphs(sheets) {
    const out = [];
    for (const sheet of sheets) {
      const header = headerOf(sheet);
      for (const r of sheet.rows) {
        if (r === header) continue;
        const pairs = [];
        r.cells.forEach((v, c) => {
          if (!v) return;
          const label = header && header.cells[c] ? header.cells[c] : `col ${columnLetter((sheet.startCol || 0) + c)}`;
          pairs.push(`${label}=${v}`);
        });
        if (!pairs.length) continue;
        out.push({ index: out.length, page: null, sheet: sheet.name, row: r.row, text: `${sheet.name} row ${r.row}: ${pairs.join('; ')}` });
      }
    }
    return out;
  }

  /** Read a File/Blob into sheets, loading SheetJS on first use (browser). */
  async function read(file, fileName) {
    const XLSX = await load();
    const ext = extOf(fileName);
    const data = ext === 'csv' || ext === 'tsv' ? await file.text() : new Uint8Array(await file.arrayBuffer());
    return parse(XLSX, data, fileName);
  }

  const api = { MAX_ROWS, isSheet, load, parse, paragraphs, read, columnLetter, headerOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVSheets = api;
})(this);
