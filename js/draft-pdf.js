/* CaseVault — a report as a PDF (the report editor's PDF View, v1.31).
 *
 * Draws the report's Markdown in the same style as the Supplementary Report PDF: the title across
 * the top, each "## Heading" as a grey band, a two-line table (labels, then entries) as a row of
 * boxes like the form, other tables as grids, and paragraphs and lists as text. So a report made
 * with Create Report (on the Draft tab) prints like the form it came from, and any other report
 * prints cleanly too. Uses the PDF writer of js/report-pdf.js; nothing fetched, runs under Node.
 */
'use strict';

(function (root) {
  const P = () => (typeof module !== 'undefined' && module.exports ? require('./report-pdf.js') : root.CVReportPdf);

  /** Markdown -> blocks: { kind: 'title'|'band'|'heading'|'table'|'para'|'list'|'rule', … }. */
  function blocks(md) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      let m;
      if ((m = /^#\s+(.*)$/.exec(l))) { out.push({ kind: 'title', text: m[1].trim() }); continue; }
      if ((m = /^##\s+(.*)$/.exec(l))) { out.push({ kind: 'band', text: m[1].trim() }); continue; }
      if ((m = /^#{3,6}\s+(.*)$/.exec(l))) { out.push({ kind: 'heading', text: m[1].trim() }); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push({ kind: 'rule' }); continue; }
      if (/^\s*\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(cells(lines[i])); i++; }
        i--;
        out.push({ kind: 'table', rows });
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, '• ').replace(/^\s*(\d+[.)])\s+/, '$1 ')); i++; }
        i--;
        out.push({ kind: 'list', items });
        continue;
      }
      const para = [l];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(#|\||[-*+]\s|\d+[.)]\s|-{3,})/.test(lines[i + 1])) para.push(lines[++i]);
      out.push({ kind: 'para', text: para.join('\n') });
    }
    return out;
  }

  function layout(md, { agency = '', caseLabel = '', printed = '', title: titleIn = '' } = {}) {
    const { wrap, width, pdfString, plain, PAGE_W, PAGE_H, M } = P();
    const INNER = PAGE_W - 2 * M;
    const bs = blocks(md);
    const title = (titleIn || (bs.find((b) => b.kind === 'title') || {}).text || 'Report').toUpperCase();
    const clean = (s) => plain(String(s == null ? '' : s)).replace(/<br\s*\/?>/gi, '\n').trim();
    const pages = [];
    let ops = null; let y = 0;
    const text = (x, yy, s, size = 9, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(s)} Tj ET`); };
    const line = (x1, y1, x2, y2, w = 0.6) => ops.push(`${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    const rect = (x, yy, w, h, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const fill = (x, yy, w, h, gray = 0.9) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
    const newPage = () => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [] });
      y = PAGE_H - M;
      text(M, y - 10, agency || '', 9, true);
      const t = title.length > 60 ? `${title.slice(0, 57)}…` : title;
      text(PAGE_W / 2 - width(t, 13, true) / 2, y - 12, t, 13, true);
      y -= 20;
      line(M, y, PAGE_W - M, y, 1.2);
      y -= 6;
    };
    const ensure = (h) => { if (y - h < M + 18) newPage(); };
    newPage();

    // A row of boxes: labels small on top, the entries under them (the form's look).
    const boxRow = (labels, values) => {
      const w = INNER / labels.length;
      const ls = values.map((v) => wrap(clean(v), 9, w - 8));
      const h = Math.max(24, 13 + Math.max(...ls.map((l) => l.length)) * 10.5);
      ensure(h);
      labels.forEach((lab, i) => {
        const x = M + i * w;
        rect(x, y - h, w, h);
        text(x + 3, y - 7.5, clean(lab).toUpperCase().slice(0, 60), 6);
        ls[i].forEach((l, j) => text(x + 4, y - 17.5 - j * 10.5, l, 9));
      });
      y -= h;
    };
    // A grid: a shaded head row, then the rows; the head repeats on a new page.
    const grid = (rows) => {
      const n = Math.max(...rows.map((r) => r.length));
      const w = INNER / n;
      const head = () => {
        const hs = rows[0].map((c) => wrap(clean(c).toUpperCase(), 6.5, w - 6, true));
        const h = Math.max(13, 4 + Math.max(...hs.map((l) => l.length)) * 8);
        ensure(h + 15);
        for (let i = 0; i < n; i++) { fill(M + i * w, y - h, w, h, 0.95); rect(M + i * w, y - h, w, h); (hs[i] || []).forEach((l, j) => text(M + i * w + 3, y - 9 - j * 8, l, 6.5, true)); }
        y -= h;
      };
      head();
      for (const r of rows.slice(1)) {
        const cs = Array.from({ length: n }, (_, i) => wrap(clean(r[i] || ''), 9, w - 6));
        const h = Math.max(15, 5 + Math.max(...cs.map((l) => l.length)) * 11);
        if (y - h < M + 18) { newPage(); head(); }
        cs.forEach((ls, i) => { rect(M + i * w, y - h, w, h); ls.forEach((l, j) => text(M + i * w + 3, y - 10.5 - j * 11, l, 9)); });
        y -= h;
      }
    };
    const para = (s, size = 10, bold = false, indent = 0) => {
      for (const l of wrap(clean(s), size, INNER - 8 - indent, bold)) { ensure(size + 4); text(M + 4 + indent, y - size, l, size, bold); y -= size + 3; }
    };

    for (const b of bs) {
      if (b.kind === 'title') continue; // in the header
      if (b.kind === 'band') {
        ensure(40);
        y -= 4;
        fill(M, y - 13, INNER, 13, 0.88); rect(M, y - 13, INNER, 13);
        text(M + 4, y - 9.6, clean(b.text).toUpperCase(), 8, true);
        y -= 13;
      } else if (b.kind === 'heading') { y -= 4; para(b.text, 9, true); y -= 2; }
      else if (b.kind === 'rule') { ensure(8); line(M, y - 4, PAGE_W - M, y - 4, 0.4); y -= 8; }
      else if (b.kind === 'table' && b.rows.length) {
        if (b.rows.length === 2 && b.rows[0].length === b.rows[1].length && b.rows[0].length <= 6) boxRow(b.rows[0], b.rows[1]);
        else grid(b.rows);
        y -= 2;
      } else if (b.kind === 'list') { y -= 2; for (const it of b.items) para(it, 10, false, 6); y -= 4; }
      else if (b.kind === 'para') {
        // A line that is all bold (the report's list titles) is a small heading.
        if (/^\*\*[^*]+\*\*$/.test(b.text.trim())) { y -= 4; para(b.text, 7.5, true); continue; }
        y -= 3; para(b.text); y -= 5;
      }
    }

    pages.forEach((p, i) => {
      const f = `${caseLabel ? `${caseLabel}  ·  ` : ''}${printed ? `Printed ${printed}  ·  ` : ''}Page ${i + 1} of ${pages.length}`;
      p.ops.push(`BT /F1 7.5 Tf ${(PAGE_W - M - width(f, 7.5)).toFixed(2)} ${(M - 12).toFixed(2)} Td ${pdfString(f)} Tj ET`);
    });
    return pages;
  }

  /** -> Uint8Array: the report as a PDF. opts: { agency, caseLabel, printed, title } */
  const build = (md, opts = {}) => P().assemble(layout(md, opts), { title: opts.title || (blocks(md).find((b) => b.kind === 'title') || {}).text || 'Report' });

  const api = { build, layout, blocks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVDraftPdf = api;
})(this);
