/* CaseVault — the Timeline tab.
 * Moved out of app.js in v1.98 (same code): app.js hands over the shared helpers with init(kit). */
'use strict';

(function (root) {
  function init(kit) {
    const { operationCases, state, h, today, Save, field, dueLabel, fmtDate, confirmDialog } = kit;

    /* ---------- Timeline ---------- */

    // v1.27: the Timeline is the operation's: the events of all its case numbers, in date order, each
    // marked with its case number. New events go to the case number picked (this one by default).
    async function renderTimeline(panel, c, token) {
      const archivedCase = Vault.isArchived(c.id);
      const members = archivedCase ? [c] : [c, ...operationCases(c).filter((x) => x.id !== c.id)];
      const tls = new Map();
      for (const m of members) {
        try { tls.set(m.id, await Vault.getTimeline(m.id)); } catch (err) { if (m.id === c.id) throw err; }
      }
      if (token !== state.renderToken) return;
      const many = tls.size > 1;
      const numberOf = (id) => (members.find((m) => m.id === id) || {}).number || 'No number';
      let editing = null; // { id, caseId }

      const f = {
        date: h('input', { type: 'date', required: true, value: today() }),
        time: CVTimeField.create({ label: 'Time' }),
        kind: h('select', {}, h('option', { value: 'event' }, 'Event'), h('option', { value: 'deadline' }, 'Deadline')),
        title: h('input', { required: true, maxlength: 200, 'aria-label': 'Title', class: 'tl-title-input' }),
        note: h('textarea', { rows: 2, maxlength: 4000, 'aria-label': 'Note' }),
        caseSel: h('select', { 'aria-label': 'Case number' }, [...tls.keys()].map((id) => h('option', { value: id, selected: id === c.id }, numberOf(id)))),
      };
      const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Add to timeline');
      const cancel = h('button', { class: 'btn', type: 'button', hidden: true }, 'Cancel');
      const list = h('ol', { class: 'timeline tl-modern' });
      // v1.73: a summary strip and filters above the timeline.
      const stats = h('div', { class: 'tl-stats' });
      let filter = 'all';
      const filters = h('div', { class: 'tl-filters', role: 'tablist' }, ...[['all', 'All'], ['upcoming', 'Upcoming'], ['deadline', 'Deadlines'], ['past', 'Past']].map(([k, label]) =>
        h('button', { type: 'button', class: `tl-filter${k === filter ? ' on' : ''}`, 'data-f': k, role: 'tab', onclick: () => { filter = k; filters.querySelectorAll('.tl-filter').forEach((b) => b.classList.toggle('on', b.dataset.f === k)); draw(); } }, label)));

      const persist = (caseId) => {
        const snapshot = structuredClone(tls.get(caseId));
        return Save.track(`timeline:${caseId}`, () => Vault.saveTimeline(caseId, snapshot)).catch(() => {});
      };

      const resetForm = () => {
        editing = null;
        f.title.value = ''; f.note.value = ''; f.time.value = '';
        f.caseSel.value = c.id;
        submit.textContent = 'Add to timeline';
        cancel.hidden = true;
      };
      cancel.addEventListener('click', resetForm);
      // v1.40: Clear empties the form (back to today, an Event) without leaving an edit in progress.
      const clear = h('button', { class: 'btn', type: 'button', title: 'Clear the form' }, 'Clear');
      // v1.82: Clear empties everything, an edit in progress too (back to a new entry for this case).
      clear.addEventListener('click', () => {
        resetForm();
        f.date.value = today(); f.kind.value = 'event';
        f.title.value = ''; f.note.value = ''; f.time.value = '';
        for (const el of [f.date, f.kind, f.caseSel]) el.dispatchEvent(new Event('change', { bubbles: true }));
        f.date.dispatchEvent(new Event('input', { bubbles: true }));
        f.title.focus();
      });

      const form = h('form', { class: 'timeline-form cv-boxed', onsubmit: async (e) => {
        e.preventDefault();
        const data = { date: f.date.value, time: f.time.value, kind: f.kind.value, title: f.title.value.trim(), note: f.note.value.trim() };
        if (!data.date || !data.title) return;
        const target = many ? f.caseSel.value : c.id;
        const touched = new Set([target]);
        if (editing) {
          const from = tls.get(editing.caseId);
          const ev = from.events.find((x) => x.id === editing.id);
          if (ev && editing.caseId !== target) {
            // Moved to another case number of the operation.
            from.events = from.events.filter((x) => x.id !== ev.id);
            tls.get(target).events.push({ ...ev, ...data, updated: new Date().toISOString() });
            touched.add(editing.caseId);
          } else if (ev) Object.assign(ev, data, { updated: new Date().toISOString() });
        } else {
          tls.get(target).events.push({ id: Vault.newId('e'), ...data, done: false, created: new Date().toISOString() });
        }
        for (const id of touched) Vault.sortEvents(tls.get(id).events);
        resetForm();
        draw();
        for (const id of touched) await persist(id);
        f.title.focus();
      } },
      field('Date', f.date), field('Time', f.time), field('Type', f.kind),
      many ? field('Case Number', f.caseSel, '', 'Which case number of the mission this belongs to') : null,
      field('Title', f.title, 'grow'),
      field('Note', f.note, 'full'),
      h('div', { class: 'full form-actions' }, cancel, clear, submit));

      function draw() {
        const everything = CVOperation.mergeEvents([...tls.entries()].map(([caseId, t]) => ({ caseId, number: numberOf(caseId), events: t.events })));
        const now = today();
        const openDl = everything.filter(({ ev }) => ev.kind === 'deadline' && !ev.done);
        const overdue = openDl.filter(({ ev }) => ev.date < now);
        const next = openDl.filter(({ ev }) => ev.date >= now).sort((a, b) => (a.ev.date + (a.ev.time || '')).localeCompare(b.ev.date + (b.ev.time || '')))[0];
        const stat = (n, label, cls, sub2) => h('div', { class: `tl-stat ${cls}` }, h('span', { class: 'tl-stat-n' }, String(n)), h('span', { class: 'tl-stat-l' }, label), sub2 ? h('span', { class: 'tl-stat-s' }, sub2) : '');
        stats.replaceChildren(
          stat(everything.filter(({ ev }) => ev.kind !== 'deadline').length, 'Events', 'ev'),
          stat(openDl.length, 'Open Deadlines', 'dl'),
          stat(overdue.length, 'Overdue', overdue.length ? 'od' : 'ok'),
          next ? stat((dueLabel(next.ev.date) || { text: fmtDate(next.ev.date) }).text, 'Next Due', 'nx', next.ev.title) : stat('—', 'Next Due', 'nx', 'Nothing due'));
        const keep = ({ ev }) => (filter === 'all' ? true : filter === 'deadline' ? ev.kind === 'deadline' : filter === 'upcoming' ? ev.date >= now : ev.date < now);
        const all = everything.filter(keep);
        if (!all.length) {
          list.replaceChildren(h('li', { class: 'muted empty' }, everything.length ? 'Nothing to show with this filter.' : many ? 'No events yet for any case number of this mission. Add dates, hearings, filings, and deadlines above.' : 'No events yet. Add dates, hearings, filings, and deadlines above.'));
          return;
        }
        // Newest month first or oldest? Kept in date order (as saved); a heading for each month and a
        // Today line where the past ends.
        const items = [];
        let month = '';
        let todayShown = false;
        const monthName = (d) => { const [y, m] = d.split('-'); return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m) - 1]} ${y}`; };
        for (const { caseId, ev } of all) {
          if (!todayShown && ev.date >= now && all.some((x) => x.ev.date < now)) { items.push(h('li', { class: 'tl-today' }, h('span', {}, `Today · ${fmtDate(now)}`))); todayShown = true; }
          const mk = ev.date.slice(0, 7);
          if (mk !== month) { month = mk; items.push(h('li', { class: 'tl-month' }, monthName(ev.date))); }
          const isDeadline = ev.kind === 'deadline';
          const due = isDeadline && !ev.done ? dueLabel(ev.date) : null;
          const done = isDeadline ? h('input', { type: 'checkbox', checked: !!ev.done, 'aria-label': 'Done', title: 'Mark done' }) : null;
          if (done) done.addEventListener('change', () => { ev.done = done.checked; draw(); persist(caseId); });
          const [, , dd] = ev.date.split('-');
          const wk = new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
          items.push(h('li', { class: `tl-item ${ev.kind} ${ev.done ? 'done' : ''} ${due ? due.cls : ''} ${ev.date < now ? 'past' : ''}` },
            h('div', { class: 'tl-when', title: fmtDate(ev.date) }, h('span', { class: 'tl-day' }, String(Number(dd))), h('span', { class: 'tl-wk' }, wk), ev.time ? h('span', { class: 'tl-time' }, ev.time) : ''),
            h('div', { class: 'tl-body' },
              h('div', { class: 'tl-title' },
                done,
                h('span', { class: `badge ${ev.kind}` }, isDeadline ? 'Deadline' : 'Event'),
                many ? h('span', { class: `tl-case${caseId === c.id ? ' current' : ''}`, title: caseId === c.id ? 'This case number' : 'Another case number of this mission' }, numberOf(caseId)) : null,
                h('strong', {}, ev.title),
                due && h('span', { class: `due ${due.cls}` }, due.text)),
              ev.note && h('div', { class: 'tl-note' }, ev.note)),
            h('div', { class: 'tl-actions' },
              h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
                editing = { id: ev.id, caseId };
                f.date.value = ev.date; f.time.value = ev.time || ''; f.kind.value = ev.kind;
                f.title.value = ev.title; f.note.value = ev.note || '';
                f.caseSel.value = caseId;
                submit.textContent = 'Save changes'; cancel.hidden = false;
                f.title.focus();
              } }, 'Edit'),
              h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
                if (!(await confirmDialog({ title: 'Delete this entry?', message: `"${ev.title}" on ${fmtDate(ev.date)}${many ? ` (${numberOf(caseId)})` : ''}`, confirmText: 'Delete', danger: true }))) return;
                const t = tls.get(caseId);
                t.events = t.events.filter((x) => x.id !== ev.id);
                if (editing && editing.id === ev.id) resetForm();
                draw();
                persist(caseId);
              } }, 'Delete'))));
        }
        if (!todayShown && all.every((x) => x.ev.date < now)) items.push(h('li', { class: 'tl-today' }, h('span', {}, `Today · ${fmtDate(now)}`)));
        list.replaceChildren(...items);
      }

      draw();
      panel.replaceChildren(many ? h('p', { class: 'muted small tl-op-note' }, `The timeline of the whole mission: all ${tls.size} case numbers.`) : '', form, stats, filters, list);
    }

    return { renderTimeline };
  }

  root.CVCaseTimeline = { init };
})(this);
