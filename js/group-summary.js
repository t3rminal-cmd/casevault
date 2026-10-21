/* CaseVault — Group Summary (v1.148): a Case Group's cases on one page, as a PDF.
 *
 * A Case Group (v1.146) keeps related independent cases together under a name. Its summary lists
 * each case: number, subject, status, date opened, its next deadline, and the charges from its
 * Arrest Report, with your letterhead. rows() is plain logic, so the tests run it under Node;
 * build() writes the PDF with the small writer in js/report-pdf.js.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const K = () => (isNode ? require('./closing.js') : root.CVClosing);
  const clean = (v) => String(v == null ? '' : v).trim();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean(iso)); return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ''; };

  /**
   * One row per case, in case number order. cases: [{ number, subject, status, opened,
   * nextDeadline: { date, title } }]; arrests: Map(case number or id -> arrest.json), looked up by id.
   */
  function rows(cases, arrests) {
    return (cases || []).map((c) => {
      const arrest = arrests && arrests.get(c.id);
      const charges = [];
      let arrested = 0;
      for (const raw of (arrest && arrest.arrestees) || []) {
        const a = K().normalizeArrestee(raw);
        if (!K().arresteeName(a)) continue;
        arrested += 1;
        for (const ch of a.charges) { const t = [clean(ch.statute), clean(ch.description)].filter(Boolean).join(' '); if (t && !charges.includes(t)) charges.push(t); }
      }
      const nd = c.nextDeadline && c.nextDeadline.date ? `${longDate(c.nextDeadline.date)}${c.nextDeadline.title ? ` · ${clean(c.nextDeadline.title)}` : ''}` : '';
      return { number: clean(c.number) || 'No case number', subject: clean(c.subject), status: clean(c.status) || 'Open', opened: longDate(c.opened), deadline: nd, charges, arrested };
    }).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }

  /** The PDF. name: the group's name; list: rows(); opts: { letterhead, printed }. */
  function build(name, list, opts = {}) {
    const R = P();
    const PAGE_W = R.PAGE_W; const PAGE_H = R.PAGE_H; const M = 40; const INNER = PAGE_W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = [];
    let ops = null; let y = 0;
    const text = (x, yy, t, size = 10, bold = false) => { if (t !== '' && t != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(t))} Tj ET`); };
    const fill = (x, yy, w, hh, gray) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re f 0 g`);
    const BOTTOM = M + 24;
    // Columns: case number | subject | status | opened | next deadline.
    const C = [0, 0.18, 0.46, 0.6, 0.78];
    const head = () => { fill(M, y - 12, INNER, 13, 0.94); ['Case Number', 'Subject', 'Status', 'Opened', 'Next Deadline'].forEach((t, i) => text(M + 4 + INNER * C[i], y - 9.5, t, 10, true)); y -= 16; };
    const newPage = (first) => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = PAGE_H - M;
      if (first) {
        y -= R.letterhead(ops, lh, M, y, INNER, 'helvetica');
        if (lh && lh.logo) pages[0].imgs.push(lh.logo.index);
        R.navy(ops, () => text(M, y - 18, 'CASE GROUP SUMMARY', 18, true));
        y -= 26;
        text(M, y - 11, clean(name), 12, true); y -= 18;
        text(M, y - 10, `${list.length} independent case${list.length === 1 ? '' : 's'} kept together (not an Operation)`, 10); y -= 20;
      } else { text(M, y - 10, `CASE GROUP SUMMARY (continued): ${clean(name)}`, 10, true); y -= 20; }
    };
    newPage(true);
    R.bandBox(ops, M, y - 18, INNER, 18); R.navy(ops, () => text(M + 6, y - 13.5, `CASES (${list.length})`, 12, true)); y -= 24;
    if (!list.length) { text(M + 4, y - 10, 'No cases in this group.', 10); y -= 16; }
    else {
      head();
      list.forEach((r, i) => {
        const subj = R.wrap(r.subject || '—', 10, INNER * 0.27, false);
        const dl = R.wrap(r.deadline || '—', 10, INNER * 0.21, false);
        const ch = r.charges.length ? R.wrap(`Charges: ${r.charges.join('; ')}`, 10, INNER - 8, false) : [];
        const hh = Math.max(subj.length, dl.length, 1) * 13 + ch.length * 12 + 4;
        if (y - hh < BOTTOM) { newPage(false); head(); }
        if (i % 2 === 1) fill(M, y - hh + 2, INNER, hh, 0.97);
        text(M + 4, y - 10, r.number, 10, true);
        subj.forEach((l, k) => text(M + 4 + INNER * C[1], y - 10 - k * 13, l, 10));
        text(M + 4 + INNER * C[2], y - 10, r.status, 10, r.status === 'Closed');
        text(M + 4 + INNER * C[3], y - 10, r.opened || '—', 10);
        dl.forEach((l, k) => text(M + 4 + INNER * C[4], y - 10 - k * 13, l, 10));
        const top = Math.max(subj.length, dl.length, 1) * 13;
        ch.forEach((l, k) => text(M + 4, y - 10 - top - k * 12, l, 10));
        y -= hh + 2;
      });
    }
    pages.forEach((pg, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      pg.ops.push(`BT /F1 8 Tf ${(PAGE_W / 2 - R.width(t, 8) / 2).toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(t)} Tj ET`);
      if (opts.printed) pg.ops.push(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(`Printed ${opts.printed}`)} Tj ET`);
    });
    return R.assemble(pages, { photos, title: `Case Group Summary ${clean(name)}`, face: 'helvetica' });
  }

  const api = { rows, build, longDate };
  if (isNode) module.exports = api;
  else root.CVGroupSummary = api;
})(this);
