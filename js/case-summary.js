/* CaseVault — the Case Summary PDF (v1.85): one page (more if it needs) for a supervisor.
 *
 * The department letterhead on top (when there is one), CASE SUMMARY and the case number, the
 * case's facts (subject, Mission, status, dates, disposition), the arrestees with their charges,
 * the exhibits from the Draft tab, the timeline and the case history. Helvetica, letter size,
 * written with the small PDF writer in js/report-pdf.js; runs under Node for the tests.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const K = () => (isNode ? require('./closing.js') : root.CVClosing);
  const F = () => (isNode ? require('./report-fields.js') : root.CVReportFields);
  const clean = (v) => String(v == null ? '' : v).trim();

  /** data: { c, op, arrest, fields, timeline, history, fmtDate }; opts: { letterhead, printed } */
  function build(data, opts = {}) {
    const R = P();
    const { c = {}, op = null, arrest = null, fields = null, timeline = null, history = [] } = data;
    const fmt = data.fmtDate || ((d) => d);
    const PAGE_W = R.PAGE_W; const PAGE_H = R.PAGE_H; const M = 40; const INNER = PAGE_W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = [];
    let ops = null; let y = 0;
    const text = (x, yy, s, size = 10, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(s))} Tj ET`); };
    const fill = (x, yy, w, hh, gray) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re f 0 g`);
    const rect = (x, yy, w, hh, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re S`);
    const BOTTOM = M + 24;

    const newPage = () => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = PAGE_H - M;
      if (pages.length === 1) {
        if (lh) { y -= R.letterhead(ops, lh, M, y, INNER, 'helvetica'); if (lh.logo) pages[0].imgs.push(lh.logo.index); }
        text(M, y - 18, 'CASE SUMMARY', 18, true);
        const bw = 170;
        fill(PAGE_W - M - bw, y - 11, bw, 11, 0.88);
        rect(PAGE_W - M - bw, y - 32, bw, 32, 0.9);
        text(PAGE_W - M - bw + 4, y - 8.5, 'Case Number', 7.5, true);
        text(PAGE_W - M - bw + 6, y - 26, clean(c.number) || 'None', 12, true);
        y -= 42;
      } else {
        text(M, y - 10, `CASE SUMMARY${c.number ? ` · ${c.number}` : ''} (continued)`, 9, true);
        y -= 20;
      }
    };
    const ensure = (hh) => { if (y - hh < BOTTOM) newPage(); };
    const band = (label) => {
      ensure(40);
      fill(M, y - 15, INNER, 15, 0.82);
      rect(M, y - 15, INNER, 15, 0.6);
      text(M + 6, y - 11, label, 9.5, true);
      y -= 21;
    };
    const para = (s, { size = 9.5, bold = false, indent = 0, gap = 2 } = {}) => {
      for (const line of R.wrap(clean(s), size, INNER - indent - 8, bold)) { ensure(size + 3); text(M + 4 + indent, y - size, line, size, bold); y -= size + 3; }
      y -= gap;
    };

    newPage();

    // The case's facts: two columns of label / value.
    const d = c.closure && K().disposition(c.closure.disposition);
    const facts = [
      ['Subject', clean(c.subject) || 'Not named'],
      ['Mission', op ? [op.number, op.name].filter(Boolean).join(' ') : 'Independent case'],
      ['Status', clean(c.status) || 'Open'],
      ['File Number', clean(c.fileNumber)],
      ['Opened', c.dates && c.dates.opened ? fmt(c.dates.opened) : ''],
      ['Closed', c.dates && c.dates.closed ? fmt(c.dates.closed) : ''],
      ['Disposition', d ? `${d.label}${c.closure.reason ? ` (${c.closure.reason})` : ''}` : ''],
      ['Closed By', c.closure ? clean(c.closure.closedBy) : ''],
      c.status === 'Pending' && c.pending ? ['Waiting On', `${clean(c.pending.reason)}${c.pending.detail ? ` (${clean(c.pending.detail)})` : ''}${c.pending.followUp ? `, follow up ${fmt(c.pending.followUp)}` : ''}`] : null,
      c.archiveReason ? ['Archived', clean(c.archiveReason)] : null,
    ].filter(Boolean);
    band('CASE');
    const colW = INNER / 2;
    for (let i = 0; i < facts.length; i += 2) {
      const pair = facts.slice(i, i + 2);
      const lines = pair.map(([, v]) => R.wrap(v || '—', 9.5, colW - 92, false));
      const rowH = Math.max(...lines.map((l) => l.length)) * 12.5 + 5;
      ensure(rowH);
      pair.forEach(([k], j) => {
        const x = M + j * colW;
        fill(x + 84, y - rowH + 2, colW - 90, rowH - 3, 0.94);
        text(x + 4, y - 11.5, `${k}:`, 8.5, true);
        lines[j].forEach((l, n) => text(x + 88, y - 11.5 - n * 12.5, l, 9.5));
      });
      y -= rowH;
    }
    if (c.closure && clean(c.closure.note)) { y -= 2; para(`Closing note: ${c.closure.note}`, { size: 9 }); }
    y -= 6;

    // Arrestees and their charges.
    const people = ((arrest && arrest.arrestees) || []).filter((a) => K().arresteeName(a));
    band(`ARRESTEES AND CHARGES (${people.length})`);
    if (!people.length) para('No arrestees entered.', { size: 9.5 });
    for (const a of people) {
      para(K().arresteeName(a), { size: 10, bold: true, gap: 0 });
      const charges = K().chargesText(a.charges);
      if (charges) charges.split('\n').forEach((l) => para(l, { size: 9, indent: 10, gap: 0 }));
      else para('No charges entered.', { size: 9, indent: 10, gap: 0 });
      y -= 4;
    }
    y -= 4;

    // Exhibits (the Draft tab's evidence).
    const ex = fields ? (F().normalize(fields).evidence || []) : [];
    band(`EXHIBITS (${ex.length})`);
    if (!ex.length) para('No exhibits entered on the Draft tab.', { size: 9.5 });
    for (const e of ex) para(F().exhibitLine(e), { size: 9, gap: 0 });
    y -= 6;

    // Timeline.
    const events = ((timeline && timeline.events) || []).slice().sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));
    band(`TIMELINE (${events.length})`);
    if (!events.length) para('No timeline events.', { size: 9.5 });
    for (const ev of events) {
      const when = `${ev.date ? fmt(ev.date) : 'No date'}${ev.time ? ` ${ev.time}` : ''}`;
      const tag = ev.kind === 'deadline' ? (ev.done ? ' [deadline, done]' : ' [deadline]') : '';
      const lines = R.wrap(`${clean(ev.title) || 'Event'}${tag}`, 9, INNER - 150, false);
      ensure(lines.length * 12 + 2);
      text(M + 4, y - 9, when, 8.5, true);
      lines.forEach((l, n) => text(M + 140, y - 9 - n * 12, l, 9));
      y -= lines.length * 12 + 2;
    }
    y -= 6;

    // Case history.
    band(`CASE HISTORY (${history.length})`);
    if (!history.length) para('Nothing recorded.', { size: 9.5 });
    for (const r of history) {
      const t = r.at ? new Date(r.at) : null;
      const p2 = (n) => String(n).padStart(2, '0');
      const when = t && !Number.isNaN(t.getTime()) ? `${fmt(`${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`)} ${p2(t.getHours())}${p2(t.getMinutes())}` : r.day ? fmt(r.day) : '';
      const lines = R.wrap(clean(r.what), 9, INNER - 150, false);
      ensure(lines.length * 12 + 2);
      text(M + 4, y - 9, when, 8.5, true);
      lines.forEach((l, n) => text(M + 140, y - 9 - n * 12, l, 9));
      y -= lines.length * 12 + 2;
    }

    pages.forEach((pg, i) => {
      const s = `Page ${i + 1} of ${pages.length}`;
      pg.ops.push(`BT /F1 8 Tf ${(PAGE_W / 2 - R.width(s, 8) / 2).toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(s)} Tj ET`);
      if (opts.printed) pg.ops.push(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(`Printed ${opts.printed}`)} Tj ET`);
      if (c.number) pg.ops.push(`BT /F1 7.5 Tf ${(PAGE_W - M - R.width(`Case ${c.number}`, 7.5)).toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(`Case ${c.number}`)} Tj ET`);
    });
    return R.assemble(pages, { photos, title: `Case Summary ${clean(c.number)}`.trim(), face: 'helvetica' });
  }

  const api = { build };
  if (isNode) module.exports = api;
  else root.CVCaseSummary = api;
})(this);
