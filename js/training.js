/* CaseVault — Training (v1.140): the certificates in Other Files → Training, with their details.
 *
 * Each certificate file can have a course name, who gave it, the date completed, hours and an
 * expiry date, kept with the vault in Training\.training.json (hidden from the file list):
 * { "<file name>": { course, provider, date, hours, expires } }. From those this file makes:
 *   rows()       the certificates with their details, newest first;
 *   notice()     'expired' / 'soon' (30 days) / 'notice' (90 days) for a certificate that expires;
 *   paragraph()  the "Training & Experience" paragraph for affidavits ({{training}});
 *   context()    the {{training…}} placeholders for Drafts;
 *   build()      the Training Record PDF (a list with total hours, then the certificates).
 * Plain logic, so the tests run it under Node; build() uses the PDF writer in js/report-pdf.js.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const clean = (v) => String(v == null ? '' : v).trim();
  const isoOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(clean(d));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso)); return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ''; };
  const FIELDS = ['course', 'provider', 'date', 'hours', 'expires'];

  /** One certificate's details, cleaned: dates as YYYY-MM-DD or '', hours as a number string. */
  function normalize(d) {
    const x = d && typeof d === 'object' ? d : {};
    const hrs = parseFloat(String(x.hours == null ? '' : x.hours).replace(/,/g, ''));
    return {
      course: clean(x.course).slice(0, 200), provider: clean(x.provider).slice(0, 200),
      date: isoOk(x.date) ? clean(x.date) : '', expires: isoOk(x.expires) ? clean(x.expires) : '',
      hours: Number.isFinite(hrs) && hrs > 0 ? String(Math.round(hrs * 100) / 100) : '',
    };
  }
  /** The course name shown: the one typed, or the file's name without its extension. */
  const courseOf = (file, d) => clean(d && d.course) || String(file || '').replace(/\.[^.]+$/, '');

  /** files: [{ base, … }] from the Training folder; meta: the .training.json object. Newest first. */
  function rows(files, meta) {
    const m = meta && typeof meta === 'object' ? meta : {};
    return (files || []).map((f) => { const d = normalize(m[f.base]); return { file: f.base, ...d, course: courseOf(f.base, d) }; })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.course.localeCompare(b.course));
  }

  const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
  /** Days from today to the expiry date (negative once expired), or null. */
  function daysLeft(row, today) { return row && isoOk(row.expires) && isoOk(today) ? dayNum(row.expires) - dayNum(today) : null; }
  /** 'expired', 'soon' (within 30 days), 'notice' (within 90 days) or ''. */
  function notice(row, today) {
    const n = daysLeft(row, today);
    if (n == null) return '';
    return n < 0 ? 'expired' : n <= 30 ? 'soon' : n <= 90 ? 'notice' : '';
  }
  /** The certificates that need renewing (expired or within 90 days), soonest first. */
  const renewals = (list, today) => list.filter((r) => notice(r, today)).sort((a, b) => a.expires.localeCompare(b.expires));

  const totalHours = (list) => Math.round(list.reduce((t, r) => t + (parseFloat(r.hours) || 0), 0) * 100) / 100;
  const hoursText = (n) => `${n} hour${Number(n) === 1 ? '' : 's'}`;
  /** One certificate as a line: "Basic Narcotics Course, Example Academy, March 4, 2026, 40 hours". */
  const line = (r) => [r.course, r.provider, longDate(r.date), r.hours ? hoursText(r.hours) : ''].filter(Boolean).join(', ');

  /**
   * The "Training & Experience" paragraph for an affidavit, oldest course first, e.g.
   * "Your Affiant has completed the following training: Basic Narcotics Course (Example Academy,
   *  March 4, 2026, 40 hours); …. In total, your Affiant has completed 56 hours of training."
   * Empty when there are no certificates.
   */
  function paragraph(list, { who = 'Your Affiant' } = {}) {
    const items = [...(list || [])].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    if (!items.length) return '';
    const parts = items.map((r) => { const inner = [r.provider, longDate(r.date), r.hours ? hoursText(r.hours) : ''].filter(Boolean).join(', '); return inner ? `${r.course} (${inner})` : r.course; });
    const total = totalHours(items);
    const lower = who.charAt(0).toLowerCase() + who.slice(1);
    return `${who} has completed the following training: ${parts.join('; ')}.${total ? ` In total, ${lower} has completed ${hoursText(total)} of training.` : ''}`;
  }

  /** {{training}}, {{training.list}}, {{training.hours}}, {{training.count}} for Drafts. */
  function context(list) {
    const l = list || [];
    return { training: paragraph(l), 'training.list': [...l].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).map(line).join('\n'), 'training.hours': l.length ? String(totalHours(l)) : '', 'training.count': l.length ? String(l.length) : '' };
  }
  const PLACEHOLDERS = ['training', 'training.list', 'training.hours', 'training.count'];

  /**
   * The Training Record PDF. list: rows(); opts: { letterhead, printed, name, today, attachments:
   * [{ jpeg, w, h, caption }] } — the certificates' pages, each on a page of its own after the list.
   */
  function build(list, opts = {}) {
    const R = P();
    const PAGE_W = R.PAGE_W; const PAGE_H = R.PAGE_H; const M = 40; const INNER = PAGE_W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = [];
    let ops = null; let y = 0;
    const text = (x, yy, t, size = 10, bold = false) => { if (t !== '' && t != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(t))} Tj ET`); };
    const fill = (x, yy, w, hh, gray) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re f 0 g`);
    const BOTTOM = M + 24;
    const newPage = (first) => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = PAGE_H - M;
      if (first) {
        { y -= R.letterhead(ops, lh, M, y, INNER, 'helvetica'); if (lh && lh.logo) pages[0].imgs.push(lh.logo.index); }
        R.navy(ops, () => text(M, y - 18, 'TRAINING RECORD', 18, true));
        y -= 26;
        if (clean(opts.name)) { text(M, y - 10, clean(opts.name), 11, true); y -= 16; }
        y -= 6;
      } else { text(M, y - 10, 'TRAINING RECORD (continued)', 9, true); y -= 20; }
    };
    const ensure = (hh) => { if (y - hh < BOTTOM) newPage(false); };
    const band = (label) => { ensure(40); R.bandBox(ops, M, y - 15, INNER, 15); R.navy(ops, () => text(M + 6, y - 11, label, 9.5, true)); y -= 21; };
    // Columns: course (and provider under it) | completed | hours | expires.
    const C = [0, 0.5, 0.68, 0.78];
    const head = () => { fill(M, y - 12, INNER, 13, 0.94); ['Course', 'Completed', 'Hours', 'Expires'].forEach((t, i) => text(M + 4 + INNER * C[i], y - 9.5, t, 9, true)); y -= 16; };

    newPage(true);
    const total = totalHours(list);
    band(`COURSES (${list.length})${total ? ` · ${hoursText(total)}` : ''}`);
    if (!list.length) { text(M + 4, y - 10, 'No certificates in Training yet.', 9.5); y -= 16; }
    else {
      head();
      list.forEach((r, i) => {
        const cl = R.wrap(r.course, 9, INNER * 0.5, true);
        const pl = r.provider ? R.wrap(r.provider, 8, INNER * 0.5, false) : [];
        const st = notice(r, opts.today || '');
        const hh = Math.max(cl.length * 11 + pl.length * 10, st === 'expired' ? 21 : 0) + 4;
        if (y - hh < BOTTOM) { newPage(false); head(); }
        if (i % 2 === 1) fill(M, y - hh + 2, INNER, hh, 0.97);
        cl.forEach((l, k) => text(M + 4, y - 9.5 - k * 11, l, 9, true));
        pl.forEach((l, k) => text(M + 4, y - 9.5 - cl.length * 11 - k * 10, l, 8));
        text(M + 4 + INNER * C[1], y - 9.5, longDate(r.date) || '—', 9);
        text(M + 4 + INNER * C[2], y - 9.5, r.hours || '—', 9);
        text(M + 4 + INNER * C[3], y - 9.5, r.expires ? longDate(r.expires) : '—', 9, st === 'expired');
        if (st === 'expired') text(M + 4 + INNER * C[3], y - 19.5, 'EXPIRED', 8, true);
        y -= hh + 2;
      });
      if (total) { ensure(18); fill(M, y - 12, INNER, 13, 0.94); text(M + 4, y - 9.5, 'Total hours', 9, true); text(M + 4 + INNER * C[2], y - 9.5, String(total), 9, true); y -= 18; }
    }
    // The certificates, one page each, as large as fits under their caption.
    for (const a of opts.attachments || []) {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      const p = { ...a, index: photos.length }; photos.push(p);
      text(M, PAGE_H - M - 10, clean(a.caption), 10, true);
      const boxW = INNER; const boxH = PAGE_H - 2 * M - 40;
      const k = Math.min(boxW / a.w, boxH / a.h);
      const w = a.w * k; const hh = a.h * k;
      ops.push(`q ${w.toFixed(2)} 0 0 ${hh.toFixed(2)} ${(M + (boxW - w) / 2).toFixed(2)} ${(M + 16 + (boxH - hh) / 2).toFixed(2)} cm /Im${p.index} Do Q`);
      pages[pages.length - 1].imgs.push(p.index);
    }
    pages.forEach((pg, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      pg.ops.push(`BT /F1 8 Tf ${(PAGE_W / 2 - R.width(t, 8) / 2).toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(t)} Tj ET`);
      if (opts.printed) pg.ops.push(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(`Printed ${opts.printed}`)} Tj ET`);
    });
    return R.assemble(pages, { photos, title: 'Training Record', face: 'helvetica' });
  }

  const api = { FIELDS, PLACEHOLDERS, normalize, rows, courseOf, daysLeft, notice, renewals, totalHours, line, paragraph, context, build, longDate };
  if (isNode) module.exports = api;
  else root.CVTraining = api;
})(this);
