/* CaseVault — chain of custody for each exhibit (v1.156).
 *
 * Every exhibit on the Write Report tab keeps a dated log of who had it: received, checked out, returned,
 * sent to the lab, taken to court, destroyed. Each entry: date, time, action, released by, received
 * by, purpose. The log prints as a PDF (one table per exhibit) with the report.
 * Plain logic over js/report-pdf.js's PDF writer, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  const ACTIONS = ['Received / Seized', 'Placed in Evidence', 'Checked Out', 'Returned', 'Sent to Lab', 'Returned from Lab', 'Taken to Court', 'Returned from Court', 'Released to Owner', 'Destroyed'];
  // After these the exhibit is out of the evidence room.
  const OUT = new Set(['Checked Out', 'Sent to Lab', 'Taken to Court']);
  const GONE = new Set(['Released to Owner', 'Destroyed']);

  /** A custody log cleaned up: entries with an action, oldest first. */
  function normalize(list) {
    return (Array.isArray(list) ? list : [])
      .map((x) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(String(x && x.date)) ? x.date : '', time: /^\d{2}:\d{2}$/.test(String(x && x.time)) ? x.time : '', action: clean(x && x.action), from: clean(x && x.from), to: clean(x && x.to), purpose: clean(x && x.purpose) }))
      .filter((x) => x.action)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }

  /** Where the exhibit is now: { state: 'in' | 'out' | 'gone' | 'none', last }. */
  function status(list) {
    const l = normalize(list);
    const last = l[l.length - 1];
    if (!last) return { state: 'none', last: null };
    return { state: GONE.has(last.action) ? 'gone' : OUT.has(last.action) ? 'out' : 'in', last };
  }

  /** data: { number (case), title, exhibits: [{ number, description, inventory, custody }], fmtDate };
   * opts: { letterhead, printed } -> Uint8Array (PDF) */
  function build(data, opts = {}) {
    const R = P();
    const fmt = data.fmtDate || ((d) => d);
    const W = R.PAGE_W; const H = R.PAGE_H; const M = 40; const IN = W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = []; let ops = null; let y = 0;
    const title = 'CHAIN OF CUSTODY';
    const text = (x, yy, s, size = 10, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(s))} Tj ET`); };
    const fill = (x, yy, w, hh, g) => ops.push(`${g} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re f 0 g`);
    const rect = (x, yy, w, hh, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re S`);
    const BOTTOM = M + 24;
    const newPage = () => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = H - M;
      if (pages.length === 1) {
        y -= R.letterhead(ops, lh, M, y, IN, 'helvetica'); if (lh && lh.logo) pages[0].imgs.push(lh.logo.index);
        R.navy(ops, () => text(M, y - 18, title, 18, true));
        if (data.number) {
          const bw = 170;
          fill(W - M - bw, y - 11, bw, 11, 0.88); rect(W - M - bw, y - 32, bw, 32, 0.9);
          text(W - M - bw + 4, y - 8.5, 'Case Number', 7.5, true);
          text(W - M - bw + 6, y - 26, clean(data.number), 12, true);
        }
        y -= 40;
        if (data.title) { text(M, y - 9, clean(data.title), 10); y -= 17; }
      } else { text(M, y - 10, `${title}${data.number ? ` · ${clean(data.number)}` : ''} (continued)`, 10, true); y -= 20; }
    };
    const ensure = (hh) => { if (y - hh < BOTTOM) newPage(); };
    // Columns: date/time, action, released by, received by, purpose.
    const cols = [[0, 78, 'DATE / TIME'], [78, 92, 'ACTION'], [170, 110, 'RELEASED BY'], [280, 110, 'RECEIVED BY'], [390, IN - 390, 'PURPOSE']];
    const head = () => { fill(M, y - 12, IN, 12, 0.88); rect(M, y - 12, IN, 12); for (const [x, , l] of cols) text(M + x + 3, y - 9, l, 6.5, true); y -= 12; };

    newPage();
    const exhibits = (data.exhibits || []).filter((e) => e && e.number != null);
    if (!exhibits.length) text(M, y - 10, 'No exhibits.', 10);
    for (const e of exhibits) {
      const log = normalize(e.custody);
      const desc = R.wrap(clean(e.description) || '—', 9, IN - 8, false).slice(0, 3);
      ensure(30 + desc.length * 11 + 12 + 14);
      R.bandBox(ops, M, y - 18, IN, 18);
      R.navy(ops, () => text(M + 6, y - 13.5, `EXHIBIT ${e.number}${e.inventory ? ` · INVENTORY ${clean(e.inventory)}` : ''}`, 11, true));
      y -= 22;
      for (const l of desc) { text(M + 4, y - 9, l, 9); y -= 11; }
      y -= 4;
      head();
      if (!log.length) { rect(M, y - 14, IN, 14, 0.3); text(M + 4, y - 10, 'No custody entries.', 8.5); y -= 14; }
      log.forEach((x, i) => {
        const cells = [[`${x.date ? fmt(x.date) : ''}${x.time ? ` ${x.time}` : ''}`], [x.action], [x.from], [x.to], [x.purpose]]
          .map(([s], j) => R.wrap(s || '', 8, cols[j][1] - 6, false).slice(0, 4));
        const hh = Math.max(1, ...cells.map((c) => c.length)) * 10 + 4;
        if (y - hh < BOTTOM) { newPage(); head(); }
        if (i % 2) fill(M, y - hh, IN, hh, 0.96);
        rect(M, y - hh, IN, hh, 0.3);
        cells.forEach((c, j) => c.forEach((l, k) => text(M + cols[j][0] + 3, y - 9 - k * 10, l, 8)));
        y -= hh;
      });
      y -= 14;
    }
    pages.forEach((p, i) => {
      const pg = `Page ${i + 1} of ${pages.length}`;
      p.ops.push(`BT /F1 8 Tf ${(W / 2 - R.width(pg, 8, false, 'helvetica') / 2).toFixed(2)} ${(M - 20).toFixed(2)} Td ${R.pdfString(pg)} Tj ET`);
      if (opts.printed) { const pr = `Printed ${opts.printed}`; p.ops.push(`BT /F1 7.5 Tf ${(W - M - R.width(pr, 7.5, false, 'helvetica')).toFixed(2)} ${(M - 20).toFixed(2)} Td ${R.pdfString(pr)} Tj ET`); }
    });
    return R.assemble(pages, { title: 'Chain of Custody', face: 'helvetica', photos });
  }

  const api = { ACTIONS, normalize, status, build };
  if (isNode) module.exports = api;
  else root.CVCustody = api;
})(this);
