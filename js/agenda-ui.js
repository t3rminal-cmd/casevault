/* CaseVault — Deadline Calendar and Weekly Summary windows (v1.156), loaded the first time either
 * is opened. The logic is in js/agenda.js.
 */
'use strict';

(function (root) {
  let ui = null;
  const A = () => root.CVAgenda;
  const KINDS = [['deadline', 'Deadlines'], ['court', 'Court'], ['sol', 'Statute of Limitations'], ['buy', 'Buys'], ['arrest', 'Arrests'], ['event', 'Events']];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const kindName = (k) => (k === 'sol' ? 'Statute of Limitations' : CVOperation.kindLabel(k));
  const subjOf = (c) => CVOperation.subjectLabel(c && c.subject) || '';

  /** Reads what is asked of each case, 8 at a time. */
  async function readAll(cases, read) {
    const out = new Map();
    for (let i = 0; i < cases.length; i += 8) {
      await Promise.all(cases.slice(i, i + 8).map(async (c) => { try { out.set(c.id, await read(c)); } catch (err) { if (FS.isDisconnectError(err)) throw err; } }));
    }
    return out;
  }
  const isOpen = (c) => c.location !== 'archive' && c.status !== 'Closed';
  let kindsOn = null;

  /** Deadline Calendar: a month of every open case's dated Timeline items and statutes of limitations. */
  async function calendar() {
    const { h, openDialog, fmtDate } = ui;
    const I = ui.icon;
    const cases = (Vault.data.cases || []).filter(isOpen).map((c) => ({ ...c, subjectLabel: subjOf(c) }));
    let timelines;
    try { timelines = await readAll(cases, (c) => Vault.getTimeline(c.id)); } catch { return ui.onDriveLost(); }
    if (!kindsOn) kindsOn = new Set(['deadline', 'court', 'sol', 'buy', 'arrest']);
    const now = Vault.localDay();
    let year = Number(now.slice(0, 4)); let month = Number(now.slice(5, 7)) - 1;
    let picked = now;
    return openDialog((close) => {
      const title = h('h2', { class: 'cal-title' });
      const grid = h('div', { class: 'cal-grid', role: 'grid' });
      const dayList = h('div', { class: 'cal-day-list' });
      const open = (it) => { close(); ui.go(it.caseId, 'timeline'); };
      const itemBtn = (it, long) => h('button', { type: 'button', class: `cal-item kind-${it.kind}${it.done ? ' done' : ''}`, title: `${it.number} · ${kindName(it.kind)}: ${it.title}${it.time ? ` at ${it.time}` : ''}`, onclick: (e) => { e.stopPropagation(); open(it); } },
        long ? `${it.time ? `${it.time} ` : ''}${kindName(it.kind)}: ${it.title}` : `${it.number || '—'} ${it.kind === 'sol' ? 'SOL' : it.title}`,
        long ? h('span', { class: 'cal-item-case' }, `${it.number || 'No case number'}${it.subject ? ` · ${it.subject}` : ''}`) : null);
      const chips = h('div', { class: 'cal-kinds', role: 'group', 'aria-label': 'Show' }, KINDS.map(([k, label]) => {
        const b = h('button', { type: 'button', class: `btn small cal-kind kind-${k}${kindsOn.has(k) ? ' on' : ''}`, 'aria-pressed': String(kindsOn.has(k)), onclick: () => {
          if (kindsOn.has(k)) kindsOn.delete(k); else kindsOn.add(k);
          b.classList.toggle('on', kindsOn.has(k)); b.setAttribute('aria-pressed', String(kindsOn.has(k)));
          draw();
        } }, label);
        return b;
      }));
      const draw = () => {
        title.textContent = `${MONTHS[month]} ${year}`;
        const cells = CVFormat.monthGrid(year, month);
        const items = A().collect(cases, timelines, cells[0].iso, cells[cells.length - 1].iso, { kinds: kindsOn });
        const days = A().byDay(items);
        grid.replaceChildren(...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => h('div', { class: 'cal-dow muted small', role: 'columnheader' }, d)),
          ...cells.map((cell) => {
            const list = days.get(cell.iso) || [];
            return h('div', { class: `cal-cell${cell.inMonth ? '' : ' other'}${cell.iso === now ? ' today' : ''}${cell.iso === picked ? ' picked' : ''}${list.some((x) => x.kind === 'deadline' || x.kind === 'sol') ? ' has-due' : ''}`, role: 'gridcell', tabindex: '0', 'aria-label': `${fmtDate(cell.iso)}: ${list.length} item${list.length === 1 ? '' : 's'}`,
              onclick: () => { picked = cell.iso; draw(); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picked = cell.iso; draw(); } } },
            h('span', { class: 'cal-num' }, String(cell.day)),
            ...list.slice(0, 3).map((it) => itemBtn(it, false)),
            list.length > 3 ? h('span', { class: 'cal-more muted small' }, `+${list.length - 3} more`) : null);
          }));
        const sel = days.get(picked) || [];
        dayList.replaceChildren(h('h3', { class: 'cal-day-head' }, fmtDate(picked)), sel.length ? h('div', { class: 'cal-day-items' }, sel.map((it) => itemBtn(it, true))) : h('p', { class: 'muted small' }, 'Nothing on this day.'));
      };
      const step = (n) => { month += n; if (month < 0) { month = 11; year -= 1; } if (month > 11) { month = 0; year += 1; } draw(); };
      draw();
      return h('div', { class: 'cal-view' },
        h('div', { class: 'cal-head' },
          h('button', { class: 'icon-btn', type: 'button', title: 'Previous month', onclick: () => step(-1) }, I('chevron-left'), h('span', { class: 'sr-only' }, 'Previous month')),
          title,
          h('button', { class: 'icon-btn', type: 'button', title: 'Next month', onclick: () => step(1) }, I('chevron-right'), h('span', { class: 'sr-only' }, 'Next month')),
          h('button', { class: 'btn small', type: 'button', onclick: () => { year = Number(now.slice(0, 4)); month = Number(now.slice(5, 7)) - 1; picked = now; draw(); } }, 'Today'),
          h('span', { class: 'spacer' })),
        chips,
        h('p', { class: 'muted small' }, `The dated items on the Timelines of your ${cases.length} open case${cases.length === 1 ? '' : 's'}, and each statute of limitations. Click an item to open its Timeline.`),
        h('div', { class: 'cal-body' }, grid, dayList),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Close')));
    });
  }

  /** Weekly Summary: what changed on each case in a week, printable. */
  async function weekly() {
    const { h, openDialog, fmtDate } = ui;
    const I = ui.icon;
    const entries = (Vault.data.cases || []).map((c) => ({ ...c, subjectLabel: subjOf(c) }));
    let fulls; let timelines;
    try {
      fulls = await readAll(entries, (c) => Vault.getCase(c.id));
      timelines = await readAll(entries, (c) => Vault.getTimeline(c.id));
    } catch { return ui.onDriveLost(); }
    let start = A().weekStart(Vault.localDay());
    const dayOf = (at) => Vault.localDay(new Date(at));
    return openDialog((close) => {
      const title = h('h2', { class: 'wk-title' });
      const body = h('div', { class: 'wk-body' });
      let s = null;
      const draw = () => {
        s = A().weekly(entries, fulls, timelines, start, dayOf);
        title.textContent = `Weekly Summary: ${fmtDate(s.start)} to ${fmtDate(s.end)}`;
        const t = s.totals;
        body.replaceChildren(
          h('p', { class: 'wk-totals' }, `${t.cases} case${t.cases === 1 ? '' : 's'} with activity · ${t.changes} change${t.changes === 1 ? '' : 's'} (${t.notes} note${t.notes === 1 ? '' : 's'}) · ${t.events} Timeline item${t.events === 1 ? '' : 's'} · ${t.opened} opened · ${t.closed} closed`),
          ...(s.cases.length ? s.cases.map((r) => h('section', { class: 'wk-case' },
            h('div', { class: 'wk-case-head' },
              h('button', { class: 'linklike wk-case-link', type: 'button', onclick: () => { close(); ui.go(r.caseId); } }, `${r.number || 'No case number'}${r.subject ? ` · ${r.subject}` : ''}`),
              h('span', { class: 'spacer' }), r.status ? h('span', { class: 'muted small' }, r.status) : null),
            r.opened ? h('p', { class: 'wk-flag small' }, 'Opened this week.') : null,
            r.closed ? h('p', { class: 'wk-flag small' }, 'Closed this week.') : null,
            r.events.length ? h('ul', { class: 'wk-list' }, r.events.map((ev) => h('li', {}, h('span', { class: `badge ${ev.kind}` }, kindName(ev.kind)), ` ${fmtDate(ev.date)}${ev.time ? ` ${ev.time}` : ''} · ${ev.title}${ev.done ? ' (done)' : ''}`))) : null,
            r.changes.length ? h('ul', { class: 'wk-list' }, r.changes.map((ch) => h('li', { class: ch.note ? 'wk-note' : '' }, h('span', { class: 'muted small' }, fmtDate(ch.day)), ` ${ch.note ? 'Note: ' : ''}${ch.what}`))) : null))
            : [h('p', { class: 'muted' }, 'Nothing changed on any case this week.')]));
      };
      const step = (n) => { start = A().addDays(start, 7 * n); draw(); };
      draw();
      return h('div', { class: 'wk-view' },
        h('div', { class: 'cal-head' },
          h('button', { class: 'icon-btn', type: 'button', title: 'Week before', onclick: () => step(-1) }, I('chevron-left'), h('span', { class: 'sr-only' }, 'Week before')),
          title,
          h('button', { class: 'icon-btn', type: 'button', title: 'Week after', onclick: () => step(1) }, I('chevron-right'), h('span', { class: 'sr-only' }, 'Week after')),
          h('button', { class: 'btn small', type: 'button', onclick: () => { start = A().weekStart(Vault.localDay()); draw(); } }, 'This Week'),
          h('span', { class: 'spacer' })),
        body,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', icon: 'printer', onclick: async () => {
            const bytes = A().weeklyPdf(s, { fmtDate, kindLabel: kindName, letterhead: root.CVLetterhead ? await CVLetterhead.forPdf().catch(() => null) : null, printed: fmtDate(Vault.localDay()) });
            const name = `Weekly Summary ${s.start}.pdf`;
            const viewer = CVPdfViewer.create(bytes, { h, icon: I, title: 'Weekly Summary', fileName: name });
            close();
            await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', { icon: 'printer' }, 'Weekly Summary'), viewer,
              h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Close'))));
            viewer.destroy();
          } }, 'Print / PDF'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Close')));
    });
  }

  function init(kit) { ui = kit; }
  root.CVAgendaUI = { init, calendar, weekly };
})(this);
