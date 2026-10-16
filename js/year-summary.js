/* CaseVault — Year Summary (v1.136): a year at a glance, on screen and as a PDF.
 *
 * Counted from what CaseVault already has: the case index (opened, closed and archived dates) and
 * each case's Arrest Report (arrestees with their arrest date, charges and recovered narcotics).
 * Cases opened, closed and archived in the year; arrests by month; charges by type with the most
 * common ones; narcotics recovered, added up by narcotic and unit. compute() is plain logic, so the
 * tests run it under Node; build() writes the PDF with the small writer in js/report-pdf.js.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const K = () => (isNode ? require('./closing.js') : root.CVClosing);
  const clean = (v) => String(v == null ? '' : v).trim();
  const inYear = (d, y) => clean(d).slice(0, 4) === String(y);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Years that have anything to count, newest first (the current year always). */
  function years(entries, arrests, thisYear) {
    const set = new Set([String(thisYear)]);
    for (const e of entries || []) for (const d of [e.opened, e.closed, e.archived]) if (/^\d{4}/.test(clean(d))) set.add(clean(d).slice(0, 4));
    for (const a of arrests ? arrests.values() : []) for (const p of (a && a.arrestees) || []) if (/^\d{4}/.test(clean(p.date))) set.add(clean(p.date).slice(0, 4));
    return [...set].sort((a, b) => b.localeCompare(a));
  }

  /**
   * entries: case index entries { id, number, opened, closed, archived }; arrests: Map(case id ->
   * arrest.json). -> { year, opened, closed, archived (case numbers), arrests, byMonth[12],
   * charges { total, felony, misdemeanor, other }, topCharges [[label, n]], narcotics
   * [{ drug, unit, total, count }] }
   */
  function compute(year, entries, arrests) {
    const list = entries || [];
    const nums = (pick) => list.filter(pick).map((e) => clean(e.number) || 'No case number').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const out = {
      year: String(year),
      opened: nums((e) => inYear(e.opened, year)),
      closed: nums((e) => inYear(e.closed, year)),
      archived: nums((e) => inYear(e.archived, year)),
      arrests: 0, byMonth: Array(12).fill(0),
      charges: { total: 0, felony: 0, misdemeanor: 0, other: 0 }, topCharges: [], narcotics: [],
    };
    const top = new Map(); const narc = new Map();
    for (const e of list) {
      const arrest = arrests && arrests.get(e.id);
      for (const raw of (arrest && arrest.arrestees) || []) {
        const a = K().normalizeArrestee(raw);
        if (!K().arresteeName(a) || !inYear(a.date, year)) continue;
        out.arrests += 1;
        out.byMonth[Number(clean(a.date).slice(5, 7)) - 1] += 1;
        for (const ch of a.charges.filter((x) => clean(x.statute) || clean(x.description))) {
          out.charges.total += 1;
          const level = clean(ch.level) || K().chargeClass(ch.statute, ch.description).level;
          if (level === 'Felony') out.charges.felony += 1; else if (level === 'Misdemeanor') out.charges.misdemeanor += 1; else out.charges.other += 1;
          const label = [clean(ch.statute), clean(ch.description)].filter(Boolean).join(' ');
          top.set(label, (top.get(label) || 0) + Math.max(1, Number(ch.counts) || 1));
        }
        if (a.noNarcotics) continue;
        for (const n of a.narcotics.filter(K().itemFilled)) {
          const drug = clean(n.drug) || 'Not named'; const unit = clean(n.unit);
          const key = `${drug.toLowerCase()}|${unit}`;
          const cur = narc.get(key) || { drug, unit, total: 0, count: 0 };
          const amt = parseFloat(String(n.amount).replace(/,/g, ''));
          if (Number.isFinite(amt)) cur.total += amt;
          cur.count += 1;
          narc.set(key, cur);
        }
      }
    }
    out.topCharges = [...top.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    out.narcotics = [...narc.values()].map((n) => ({ ...n, total: Math.round(n.total * 1000) / 1000 })).sort((a, b) => a.drug.localeCompare(b.drug) || a.unit.localeCompare(b.unit));
    return out;
  }

  /** The PDF. s: compute()'s result; opts: { letterhead, printed, agency } */
  function build(s, opts = {}) {
    const R = P();
    const PAGE_W = R.PAGE_W; const PAGE_H = R.PAGE_H; const M = 40; const INNER = PAGE_W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = [];
    let ops = null; let y = 0;
    const text = (x, yy, t, size = 10, bold = false) => { if (t !== '' && t != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(t))} Tj ET`); };
    const fill = (x, yy, w, hh, gray) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re f 0 g`);
    const BOTTOM = M + 24;
    const newPage = () => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = PAGE_H - M;
      if (pages.length === 1) {
        if (lh) { y -= R.letterhead(ops, lh, M, y, INNER, 'helvetica'); if (lh.logo) pages[0].imgs.push(lh.logo.index); }
        R.navy(ops, () => text(M, y - 18, `YEAR SUMMARY ${s.year}`, 18, true));
        y -= 34;
      } else { text(M, y - 10, `YEAR SUMMARY ${s.year} (continued)`, 9, true); y -= 20; }
    };
    const ensure = (hh) => { if (y - hh < BOTTOM) newPage(); };
    const band = (label) => { ensure(40); R.bandBox(ops, M, y - 15, INNER, 15); R.navy(ops, () => text(M + 6, y - 11, label, 9.5, true)); y -= 21; };
    const row = (cells, cols, { bold = false, shade = false } = {}) => {
      ensure(14);
      if (shade) fill(M, y - 12, INNER, 13, 0.94);
      cells.forEach((v, i) => text(M + 4 + INNER * cols[i], y - 9.5, v, 9, bold));
      y -= 14;
    };
    const para = (t, size = 9.5) => { for (const line of R.wrap(clean(t), size, INNER - 8, false)) { ensure(size + 3); text(M + 4, y - size, line, size); y -= size + 3; } y -= 2; };

    newPage();
    band('CASES');
    const C3 = [0, 0.3, 0.42];
    row(['', 'Count', 'Case numbers'], C3, { bold: true });
    for (const [label, list] of [['Opened', s.opened], ['Closed', s.closed], ['Archived', s.archived]]) {
      const lines = R.wrap(list.join(', ') || '—', 9, INNER * 0.56, false);
      ensure(lines.length * 12 + 2);
      fill(M, y - 12, INNER, 13, 0.94);
      text(M + 4, y - 9.5, label, 9, true); text(M + 4 + INNER * 0.3, y - 9.5, String(list.length), 9, true);
      lines.forEach((l, n) => text(M + 4 + INNER * 0.42, y - 9.5 - n * 12, l, 9));
      y -= lines.length * 12 + 4;
    }
    y -= 6;
    band(`ARRESTS (${s.arrests})`);
    const C12 = MONTHS.map((_, i) => i / 12);
    row(MONTHS, C12, { bold: true, shade: true });
    row(s.byMonth.map(String), C12);
    y -= 6;
    band(`CHARGES (${s.charges.total})`);
    row(['Felony', String(s.charges.felony), 'Misdemeanor', String(s.charges.misdemeanor), 'Other / unknown', String(s.charges.other)], [0, 0.14, 0.24, 0.42, 0.52, 0.74], { bold: true, shade: true });
    y -= 2;
    if (s.topCharges.length) {
      row(['Most common charges', 'Counts'], [0, 0.88], { bold: true });
      s.topCharges.forEach(([label, n], i) => {
        const lines = R.wrap(label, 9, INNER * 0.84, false);
        ensure(lines.length * 12 + 2);
        if (i % 2 === 0) fill(M, y - 12 - (lines.length - 1) * 12, INNER, lines.length * 12 + 1, 0.96);
        lines.forEach((l, k) => text(M + 4, y - 9.5 - k * 12, l, 9));
        text(M + 4 + INNER * 0.88, y - 9.5, String(n), 9, true);
        y -= lines.length * 12 + 2;
      });
    } else para('No charges entered on Arrest Reports this year.');
    y -= 6;
    band(`NARCOTICS RECOVERED (${s.narcotics.reduce((t, n) => t + n.count, 0)} entries)`);
    if (s.narcotics.length) {
      const CN = [0, 0.5, 0.72];
      row(['Narcotic', 'Total', 'Entries'], CN, { bold: true });
      s.narcotics.forEach((n, i) => row([n.drug, `${n.total || '—'}${n.unit ? ` ${n.unit}` : ''}`, String(n.count)], CN, { shade: i % 2 === 0 }));
    } else para('No narcotics entered on Arrest Reports this year.');
    y -= 4;
    para('Counted from the case index (dates opened, closed and archived) and the Arrest Reports (arrest date, charges, recovered narcotics). Cases in Recently Deleted are not counted.', 7.5);

    pages.forEach((pg, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      pg.ops.push(`BT /F1 8 Tf ${(PAGE_W / 2 - R.width(t, 8) / 2).toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(t)} Tj ET`);
      if (opts.printed) pg.ops.push(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(`Printed ${opts.printed}`)} Tj ET`);
    });
    return R.assemble(pages, { photos, title: `Year Summary ${s.year}`, face: 'helvetica' });
  }

  const api = { compute, build, years, MONTHS };
  if (isNode) module.exports = api;
  else root.CVYearSummary = api;
})(this);
