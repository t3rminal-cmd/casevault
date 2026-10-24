/* CaseVault — the Timeline PDF and the Buy Summary (v1.119).
 *
 * The events shown on a timeline (a suspect filter keeps only theirs), each with its suspect's colour
 * as a square beside it, then the buys grouped by suspect with what was bought and paid and the
 * totals. The letterhead on top when there is one. Helvetica, letter size, written with the small PDF
 * writer in js/report-pdf.js; runs under Node for the tests.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const O = () => (isNode ? require('./operation.js') : root.CVOperation);
  const clean = (v) => String(v == null ? '' : v).trim();
  const rgb = (hex) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? [1, 2, 3].map((i) => (parseInt(m[i], 16) / 255).toFixed(3)).join(' ') : ''; };

  /** data: { title, number, subtitle, rows (mergeEvents output, already filtered), fmtDate, timeline: true,
   * summary: true }; opts: { letterhead, printed } */
  function build(data, opts = {}) {
    const R = P();
    const Op = O();
    const rows = data.rows || [];
    const fmt = data.fmtDate || ((d) => d);
    const colors = Op.suspectColors(rows);
    const PAGE_W = R.PAGE_W; const PAGE_H = R.PAGE_H; const M = 40; const INNER = PAGE_W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = [];
    const title = clean(data.title) || 'TIMELINE';
    let ops = null; let y = 0;
    const text = (x, yy, s, size = 10, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(s))} Tj ET`); };
    const fill = (x, yy, w, hh, gray) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re f 0 g`);
    const swatch = (x, yy, s, hex) => { const c = rgb(hex); if (c) ops.push(`${c} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${s} ${s} re f 0 g`); };
    const rect = (x, yy, w, hh, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re S`);
    const BOTTOM = M + 24;
    const newPage = () => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = PAGE_H - M;
      if (pages.length === 1) {
        { y -= R.letterhead(ops, lh, M, y, INNER, 'helvetica'); if (lh && lh.logo) pages[0].imgs.push(lh.logo.index); }
        R.navy(ops, () => text(M, y - 18, title.toUpperCase(), 18, true));
        if (data.number) {
          const bw = 170;
          fill(PAGE_W - M - bw, y - 11, bw, 11, 0.88);
          rect(PAGE_W - M - bw, y - 32, bw, 32, 0.9);
          text(PAGE_W - M - bw + 4, y - 8.5, data.numberLabel || 'Number', 7.5, true);
          text(PAGE_W - M - bw + 6, y - 26, clean(data.number), 12, true);
        }
        y -= 40;
        if (data.subtitle) { for (const l of R.wrap(clean(data.subtitle), 10, INNER, false)) { text(M, y - 9, l, 10); y -= 13; } y -= 4; }
      } else {
        text(M, y - 10, `${title.toUpperCase()}${data.number ? ` · ${data.number}` : ''} (continued)`, 10, true);
        y -= 20;
      }
    };
    const ensure = (hh) => { if (y - hh < BOTTOM) newPage(); };
    const band = (label) => {
      ensure(40);
      R.bandBox(ops, M, y - 18, INNER, 18);
      R.navy(ops, () => text(M + 6, y - 13.5, label, 12, true));
      y -= 24;
    };
    const para = (s, size = 10) => { for (const line of R.wrap(clean(s), size, INNER - 8, false)) { ensure(size + 3); text(M + 4, y - size, line, size); y -= size + 3; } };

    newPage();

    if (data.timeline !== false) {
      band(`EVENTS (${rows.length})`);
      if (!rows.length) para('No events.');
      // v1.141: the suspect in a column of its own on the right, so the names line up; with
      // data.group, each suspect's events together under their name.
      const SUS = 120; const EV_X = 150; const EV_W = INNER - EV_X - SUS - 12;
      const hasSuspect = rows.some(({ ev }) => clean(ev.suspect));
      const evW = hasSuspect ? EV_W : INNER - EV_X;
      const eventRow = ({ ev, number }) => {
        const when = `${ev.date ? fmt(ev.date) : 'No date'}${ev.time ? ` ${ev.time}` : ''}`;
        const kind = ev.kind === 'deadline' ? (ev.done ? 'Deadline, done' : 'Deadline') : ev.kind === 'buy' ? 'Buy' : ev.kind === 'arrest' ? 'ARREST' : ev.kind === 'court' ? 'Court' : '';
        const head = [clean(ev.title) || 'Event', kind ? `[${kind}]` : ''].filter(Boolean).join(' ');
        const sub = [number && data.many ? `Case ${number}` : '', ev.kind === 'buy' ? Op.buyLine(ev) : '', clean(ev.note)].filter(Boolean).join(' · ');
        const lines = R.wrap(head, 10, evW, true);
        const subs = sub ? R.wrap(sub, 10, evW, false) : [];
        const who = hasSuspect && clean(ev.suspect) && !data.group ? R.wrap(clean(ev.suspect), 10, SUS - 8, true) : [];
        const hh = Math.max(lines.length * 13 + subs.length * 12, who.length * 12) + 5;
        ensure(hh);
        // v1.142: an arrest has a red square and a red rule beside it, whatever the suspect's colour.
        if (ev.kind === 'arrest') { swatch(M + 1, y - 11, 10, '#b42318'); ops.push(`0.706 0.137 0.094 RG 2 w ${(M + EV_X - 6).toFixed(2)} ${(y - hh + 4).toFixed(2)} m ${(M + EV_X - 6).toFixed(2)} ${(y - 1).toFixed(2)} l S 0 G`); } else swatch(M + 2, y - 10, 8, Op.eventColor(ev, colors));
        text(M + 16, y - 9, when, 10, true);
        lines.forEach((l, n) => text(M + EV_X, y - 9.5 - n * 13, l, 10, true));
        subs.forEach((l, n) => text(M + EV_X, y - 9.5 - lines.length * 13 - n * 12, l, 10));
        who.forEach((l, n) => text(M + INNER - SUS + 4, y - 9 - n * 12, l, 10, true));
        y -= hh;
      };
      if (rows.length && hasSuspect && !data.group) {
        fill(M, y - 12, INNER, 12, 0.9);
        text(M + 16, y - 9, 'Date', 10, true); text(M + EV_X, y - 9, 'Event', 10, true); text(M + INNER - SUS + 4, y - 9, 'Suspect', 10, true);
        y -= 15;
      }
      if (data.group) {
        for (const g of Op.suspectGroups(rows)) {
          ensure(40);
          y -= 2;
          swatch(M + 2, y - 10, 9, g.color);
          text(M + 16, y - 10, g.name, 12, true);
          const n = `${g.rows.length} event${g.rows.length === 1 ? '' : 's'}`;
          text(PAGE_W - M - R.width(n, 10, true), y - 10, n, 10, true);
          y -= 14;
          ops.push(`0.5 w ${M.toFixed(2)} ${(y - 1).toFixed(2)} m ${(M + INNER).toFixed(2)} ${(y - 1).toFixed(2)} l S`);
          y -= 4;
          g.rows.forEach(eventRow);
          y -= 6;
        }
      } else rows.forEach(eventRow);
      y -= 6;
    }

    if (data.summary !== false) {
      const groups = Op.buySummary(rows);
      band(`BUY SUMMARY (${groups.reduce((n, g) => n + g.buys.length, 0)} BUYS)`);
      if (!groups.length) para('No buys on this timeline. A buy is an event with the Type "Buy".');
      const cols = [[0, 'Date'], [92, 'Case'], [170, 'Narcotic'], [320, 'Amount'], [420, 'Paid']];
      for (const g of groups) {
        ensure(52);
        y -= 2;
        swatch(M + 2, y - 10, 9, g.color);
        text(M + 16, y - 10, g.name, 12, true);
        const sum = `${g.buys.length} buy${g.buys.length === 1 ? '' : 's'} · ${Op.money(g.paid)} paid`;
        text(PAGE_W - M - R.width(sum, 10, true), y - 10, sum, 10, true);
        y -= 16;
        fill(M, y - 12, INNER, 12, 0.9);
        cols.forEach(([x, k]) => text(M + 4 + x, y - 9, k, 10, true));
        y -= 14;
        for (const b of g.buys) {
          ensure(13);
          const cells = [b.date ? fmt(b.date) : '', b.number, b.drug || '—', b.qty ? `${b.qty} ${b.unit}` : '—', b.paid ? Op.money(b.paid) : '—'];
          cols.forEach(([x], i) => text(M + 4 + x, y - 9, R.wrap(cells[i], 10, (cols[i + 1] ? cols[i + 1][0] : INNER) - x - 8, false)[0] || '', 10));
          y -= 13;
        }
        const totals = g.drugs.map((d) => `${d.drug} ${d.amounts.map((a) => `${a.qty} ${a.unit}`).join(' + ')}`).join('; ');
        ensure(14);
        ops.push(`0.5 w ${M.toFixed(2)} ${(y - 1).toFixed(2)} m ${(M + INNER).toFixed(2)} ${(y - 1).toFixed(2)} l S`);
        text(M + 4, y - 11, 'Total', 10, true);
        if (totals) R.wrap(totals, 10, 300, true).slice(0, 1).forEach((l) => text(M + 4 + 170, y - 11, l, 10, true));
        text(M + 4 + 420, y - 11, Op.money(g.paid), 10, true);
        y -= 20;
      }
    }

    pages.forEach((pg, i) => {
      const s = `Page ${i + 1} of ${pages.length}`;
      pg.ops.push(`BT /F1 8 Tf ${(PAGE_W / 2 - R.width(s, 8) / 2).toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(s)} Tj ET`);
      if (opts.printed) pg.ops.push(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(`Printed ${opts.printed}`)} Tj ET`);
    });
    return R.assemble(pages, { photos, title: `${title} ${clean(data.number)}`.trim(), face: 'helvetica' });
  }

  const api = { build };
  if (isNode) module.exports = api;
  else root.CVTimelinePdf = api;
})(this);
