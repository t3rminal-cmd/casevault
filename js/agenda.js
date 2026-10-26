/* CaseVault — the Deadline Calendar and the Weekly Summary (v1.156).
 *
 * Calendar: every dated Timeline event of the open cases (deadlines, court dates, buys, arrests,
 * events) and each statute of limitations, by day, for a month view.
 * Weekly Summary: per case, what changed in a week (the Case History) and what was on its Timeline,
 * printable as a PDF.
 * Plain logic (and the PDF over js/report-pdf.js), so the tests run it under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoOf(d); };
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  /** The calendar's items between from and to (inclusive, YYYY-MM-DD), soonest first.
   * cases: index entries; timelines: Map caseId -> { events }; opts.kinds: Set of kinds to keep
   * (deadline, court, buy, arrest, event, sol); opts.showDone keeps finished deadlines. */
  function collect(cases, timelines, from, to, opts = {}) {
    const keep = (k) => !opts.kinds || opts.kinds.has(k);
    const out = [];
    for (const c of cases || []) {
      const base = { caseId: c.id, number: c.number || '', subject: c.subjectLabel || c.subject || '' };
      const tl = timelines && timelines.get(c.id);
      for (const ev of (tl && tl.events) || []) {
        const kind = ev.kind || 'event';
        if (!DAY.test(String(ev.date || '')) || ev.date < from || ev.date > to || !keep(kind)) continue;
        if (ev.done && !opts.showDone) continue;
        out.push({ ...base, date: ev.date, time: ev.time || '', title: clean(ev.title) || 'Untitled', kind, done: !!ev.done });
      }
      const sol = c.sol && c.sol.expires;
      if (sol && DAY.test(sol) && sol >= from && sol <= to && keep('sol') && c.status !== 'Closed') out.push({ ...base, date: sol, time: '', title: 'Statute of limitations expires', kind: 'sol', done: false });
    }
    return out.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')) || a.number.localeCompare(b.number));
  }

  /** items grouped by day: Map YYYY-MM-DD -> items. */
  function byDay(items) {
    const m = new Map();
    for (const it of items) { if (!m.has(it.date)) m.set(it.date, []); m.get(it.date).push(it); }
    return m;
  }

  /** The Monday of the week of iso. */
  function weekStart(iso) {
    const d = new Date(`${iso}T12:00:00`);
    const back = (d.getDay() + 6) % 7;
    return addDays(iso, -back);
  }

  /** What happened in the week starting `start` (a Monday): per case, the Case History entries
   * (changes and notes) made that week and the Timeline events dated that week.
   * fulls: Map caseId -> the case (with activity); timelines: Map caseId -> { events }.
   * dayOf turns a timestamp into its local YYYY-MM-DD. -> { start, end, cases: [...], totals } */
  function weekly(entries, fulls, timelines, start, dayOf = (at) => isoOf(new Date(at))) {
    const end = addDays(start, 6);
    const rows = [];
    for (const e of entries || []) {
      const c = (fulls && fulls.get(e.id)) || e;
      const changes = (Array.isArray(c.activity) ? c.activity : [])
        .filter((a) => a && a.at && a.what)
        .map((a) => ({ day: dayOf(a.at), at: a.at, what: clean(a.what), note: !!a.note }))
        .filter((a) => a.day >= start && a.day <= end)
        .sort((a, b) => a.at.localeCompare(b.at));
      const tl = timelines && timelines.get(e.id);
      const events = ((tl && tl.events) || [])
        .filter((ev) => DAY.test(String(ev.date || '')) && ev.date >= start && ev.date <= end)
        .map((ev) => ({ date: ev.date, time: ev.time || '', title: clean(ev.title) || 'Untitled', kind: ev.kind || 'event', done: !!ev.done }))
        .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
      const opened = e.opened && e.opened >= start && e.opened <= end;
      const closed = e.closed && e.closed >= start && e.closed <= end;
      if (!changes.length && !events.length && !opened && !closed) continue;
      rows.push({ caseId: e.id, number: e.number || '', subject: e.subjectLabel || clean(e.subject), status: e.status || '', opened: !!opened, closed: !!closed, changes, events });
    }
    rows.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    return {
      start, end, cases: rows,
      totals: { cases: rows.length, changes: rows.reduce((n, r) => n + r.changes.length, 0), notes: rows.reduce((n, r) => n + r.changes.filter((x) => x.note).length, 0), events: rows.reduce((n, r) => n + r.events.length, 0), opened: rows.filter((r) => r.opened).length, closed: rows.filter((r) => r.closed).length },
    };
  }

  /** The Weekly Summary as a PDF. s: weekly(); opts: { fmtDate, letterhead, printed, kindLabel } */
  function weeklyPdf(s, opts = {}) {
    const R = P();
    const fmt = opts.fmtDate || ((d) => d);
    const kindLabel = opts.kindLabel || ((k) => k);
    const W = R.PAGE_W; const H = R.PAGE_H; const M = 40; const IN = W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = []; let ops = null; let y = 0;
    const title = 'WEEKLY SUMMARY';
    const text = (x, yy, t, size = 10, bold = false) => { if (t !== '' && t != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(t))} Tj ET`); };
    const BOTTOM = M + 24;
    const newPage = () => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = H - M;
      if (pages.length === 1) {
        y -= R.letterhead(ops, lh, M, y, IN, 'helvetica'); if (lh && lh.logo) pages[0].imgs.push(lh.logo.index);
        R.navy(ops, () => text(M, y - 18, title, 18, true));
        y -= 30;
        text(M, y - 10, `${fmt(s.start)} to ${fmt(s.end)}`, 11, true); y -= 16;
        const t = s.totals;
        text(M, y - 10, `${t.cases} case${t.cases === 1 ? '' : 's'} with activity · ${t.changes} change${t.changes === 1 ? '' : 's'} (${t.notes} note${t.notes === 1 ? '' : 's'}) · ${t.events} Timeline item${t.events === 1 ? '' : 's'} · ${t.opened} opened · ${t.closed} closed`, 9);
        y -= 22;
      } else { text(M, y - 10, `${title} · ${fmt(s.start)} to ${fmt(s.end)} (continued)`, 10, true); y -= 20; }
    };
    const ensure = (hh) => { if (y - hh < BOTTOM) newPage(); };
    const line = (t, size = 9, indent = 10, bold = false) => {
      for (const l of R.wrap(t, size, IN - indent - 4, bold)) { ensure(size + 3); text(M + indent, y - size, l, size, bold); y -= size + 3; }
    };
    newPage();
    if (!s.cases.length) line('Nothing changed on any case this week.', 10, 4);
    for (const r of s.cases) {
      ensure(60);
      R.bandBox(ops, M, y - 18, IN, 18);
      R.navy(ops, () => text(M + 6, y - 13.5, `${r.number || 'No case number'}${r.subject ? ` · ${r.subject}` : ''}`, 11, true));
      if (r.status) text(W - M - 6 - R.width(r.status, 9, false, 'helvetica'), y - 13, r.status, 9);
      y -= 24;
      if (r.opened) line('Opened this week.', 9, 6, true);
      if (r.closed) line('Closed this week.', 9, 6, true);
      if (r.events.length) {
        line('Timeline', 9, 6, true);
        for (const ev of r.events) line(`${fmt(ev.date)}${ev.time ? ` ${ev.time}` : ''} · ${kindLabel(ev.kind)} · ${ev.title}${ev.done ? ' (done)' : ''}`);
      }
      if (r.changes.length) {
        line('Changes and Notes', 9, 6, true);
        for (const ch of r.changes) line(`${fmt(ch.day)} · ${ch.note ? 'Note: ' : ''}${ch.what}`);
      }
      y -= 8;
    }
    pages.forEach((p, i) => {
      const pg = `Page ${i + 1} of ${pages.length}`;
      p.ops.push(`BT /F1 8 Tf ${(W / 2 - R.width(pg, 8, false, 'helvetica') / 2).toFixed(2)} ${(M - 20).toFixed(2)} Td ${R.pdfString(pg)} Tj ET`);
      if (opts.printed) { const pr = `Printed ${opts.printed}`; p.ops.push(`BT /F1 7.5 Tf ${(W - M - R.width(pr, 7.5, false, 'helvetica')).toFixed(2)} ${(M - 20).toFixed(2)} Td ${R.pdfString(pr)} Tj ET`); }
    });
    return R.assemble(pages, { title: `Weekly Summary ${s.start}`, face: 'helvetica', photos });
  }

  const api = { collect, byDay, weekStart, weekly, weeklyPdf, addDays };
  if (isNode) module.exports = api;
  else root.CVAgenda = api;
})(this);
