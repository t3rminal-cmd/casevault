/* CaseVault — the Timeline tab.
 * Moved out of app.js in v1.98 (same code): app.js hands over the shared helpers with init(kit). */
'use strict';

(function (root) {
  /** v1.142: a small pair of handcuffs for the Arrest badge (drawn, so it follows the badge's colour). */
  function cuffs() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'tl-cuffs'); svg.setAttribute('aria-hidden', 'true');
    for (const [tag, a] of [['circle', { cx: 4.5, cy: 10.5, r: 3.2 }], ['circle', { cx: 11.5, cy: 10.5, r: 3.2 }], ['path', { d: 'M4.5 7.3V5.2a1.4 1.4 0 0 1 2.8 0M11.5 7.3V5.2a1.4 1.4 0 0 0-2.8 0M7.3 5.2h1.4' }]]) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(a)) el.setAttribute(k, v);
      svg.append(el);
    }
    return svg;
  }

  function init(kit) {
    const { operationCases, state, h, today, Save, field, dueLabel, fmtDate, confirmDialog, openDialog, icon: I, toast, opOf } = kit;

    /* ---------- Timeline ---------- */

    /** v1.148: how long to snooze a deadline: 1, 3 or 7 days (null when cancelled). */
    function snoozeDialog(ev) {
      return openDialog((close) => h('div', { class: 'snooze-form' },
        h('h2', { icon: 'bell-fill' }, 'Snooze Deadline'),
        h('p', { class: 'muted small' }, `"${ev.title || 'Deadline'}" stays on the Timeline, but its red alert (the bell and the red case) waits until then.`),
        h('div', { class: 'snooze-picks' }, [[1, 'Tomorrow'], [3, '3 Days'], [7, '1 Week']].map(([n, label]) => h('button', { class: 'btn', type: 'button', onclick: () => close(n) }, label))),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'))));
    }

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
      // v1.117: the suspects of every case number, to tag events with (and colour them by).
      const O = root.CVOperation;
      const suspectNames = [];
      for (const m of members) {
        let full = m.id === c.id ? c : null;
        if (!full) { try { full = await Vault.getCase(m.id); } catch { /* moved */ } }
        for (const sx of (full && full.suspects) || []) if (sx && !sx.notIdentified && String(sx.name || '').trim()) suspectNames.push(String(sx.name).trim());
      }
      // v1.142: each case number's Arrest Report: every arrestee with a name and an arrest date shows
      // on the Timeline by itself (an Arrest event, read from the report; edited there, not here).
      const arrests = new Map();
      for (const m of members) {
        const a = await Vault.readCaseJSON(m.id, 'arrest.json').catch(() => null);
        if (a && Array.isArray(a.arrestees)) arrests.set(m.id, a);
      }
      if (token !== state.renderToken) return;
      const K = root.CVClosing;
      const sameSuspect = (name) => {
        const onTimeline = [...tls.values()].flatMap((t) => t.events.map((e) => String(e.suspect || '').trim())).filter(Boolean);
        for (const pool of [onTimeline, suspectNames]) {
          const exact = pool.find((n) => O.suspectKey(n) === O.suspectKey(name));
          if (exact) return exact;
          const like = pool.find((n) => O.nameMatch(n, name));
          if (like) return like;
        }
        return name;
      };
      const autoArrests = (caseId, own) => {
        const a = arrests.get(caseId);
        if (!a || !K) return [];
        return K.normalizeArrest(a).arrestees.map((x, i) => ({ x, i })).filter(({ x }) => K.arresteeName(x) && /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''))
          .map(({ x, i }) => {
            // v1.143: the arrest goes under the suspect it is about: a name already on the timeline (or
            // on the Details tab) written another way ("DOE, John", "John Q Doe") is used instead,
            // so the suspect has one filter, not two.
            const name = sameSuspect(K.arresteeName(x));
            const charges = (x.charges || []).filter((ch) => String(ch.statute || '').trim() || String(ch.description || '').trim()).map((ch) => [ch.statute, ch.description].filter((v) => String(v || '').trim()).join(' ')).join('; ');
            return { id: `arrest-${caseId}-${i}`, auto: true, kind: 'arrest', date: x.date, time: String(x.time || '').trim(), title: `Arrest of ${K.arresteeName(x)}`, suspect: name, note: charges ? `Charged: ${charges}` : '', color: '' };
          })
          // An Arrest event you typed yourself for the same person on the same day stands for it.
          .filter((ev) => !own.some((o) => o.kind === 'arrest' && o.date === ev.date && O.suspectKey(o.suspect) === O.suspectKey(ev.suspect)));
      };
      let suspectFilter = ''; // a suspect key: only their events

      const f = {
        date: h('input', { type: 'date', required: true, value: today() }),
        time: CVTimeField.create({ label: 'Time' }),
        kind: h('select', {}, h('option', { value: 'event' }, 'Event'), h('option', { value: 'buy' }, 'Buy'), h('option', { value: 'arrest' }, 'Arrest'), h('option', { value: 'deadline' }, 'Deadline')),
        title: h('input', { required: true, maxlength: 200, 'aria-label': 'Title', class: 'tl-title-input' }),
        note: h('textarea', { rows: 2, maxlength: 4000, 'aria-label': 'Note' }),
        caseSel: h('select', { 'aria-label': 'Case number' }, [...tls.keys()].map((id) => h('option', { value: id, selected: id === c.id }, numberOf(id)))),
        suspect: h('input', { maxlength: 120, 'aria-label': 'Suspect', autocomplete: 'off', placeholder: 'Who the event is about' }),
        // v1.119: a Buy's narcotic, amount and money paid (for the Buy Summary).
        drug: h('input', { maxlength: 80, 'aria-label': 'Narcotic', autocomplete: 'off', placeholder: 'What was bought' }),
        qty: h('input', { inputmode: 'decimal', maxlength: 12, 'aria-label': 'Amount', placeholder: '0' }),
        unit: h('select', { 'aria-label': 'Unit' }, root.CVOperation.BUY_UNITS.map((u) => h('option', { value: u }, u))),
        paid: h('input', { inputmode: 'decimal', maxlength: 14, 'aria-label': 'Paid', placeholder: '$0' }),
      };
      const drugBox = root.CVCombo ? CVCombo.attach(f.drug, { label: 'Show the narcotics', items: () => ((root.CVReportFields && CVReportFields.DRUG_TYPES) || []).map((t) => ({ value: t, label: t })) }) : f.drug;
      const buyRow = h('div', { class: 'tl-buy-row full', hidden: true },
        field('Narcotic', drugBox, 'grow'),
        field('Amount', h('div', { class: 'tl-qty' }, f.qty, f.unit)),
        field('Paid', f.paid));
      const showBuy = () => { buyRow.hidden = f.kind.value !== 'buy'; };
      f.kind.addEventListener('change', showBuy);
      // v1.117: the event's colour: a swatch to pick, or None. Picking a suspect sets their colour.
      let pickedColor = '';
      let colorTouched = false;
      const swatches = h('div', { class: 'tl-swatches', role: 'radiogroup', 'aria-label': 'Colour' });
      const drawSwatches = () => swatches.replaceChildren(
        h('button', { type: 'button', class: `tl-swatch tl-swatch-none${pickedColor ? '' : ' on'}`, role: 'radio', 'aria-checked': String(!pickedColor), title: 'No colour', onclick: () => { pickedColor = ''; colorTouched = true; drawSwatches(); } }, '×'),
        ...O.TL_COLORS.map(([name, col]) => {
          const b = h('button', { type: 'button', class: `tl-swatch${pickedColor.toLowerCase() === col.toLowerCase() ? ' on' : ''}`, role: 'radio', 'aria-checked': String(pickedColor.toLowerCase() === col.toLowerCase()), title: name, 'aria-label': name, onclick: () => { pickedColor = col; colorTouched = true; drawSwatches(); } });
          b.style.setProperty('--sw', col);
          return b;
        }));
      drawSwatches();
      const allRows = () => O.mergeEvents([...tls.entries()].map(([caseId, t]) => ({ caseId, number: numberOf(caseId), events: t.events })));
      const colorsNow = () => O.suspectColors(allRows());
      const suspectFill = () => {
        if (colorTouched) return;
        // A suspect already on the timeline keeps their colour; a new one gets the next free colour.
        pickedColor = f.suspect.value.trim() ? (O.suspectColors([...allRows(), { ev: { suspect: f.suspect.value } }]).get(O.suspectKey(f.suspect.value)) || {}).color || '' : '';
        drawSwatches();
      };
      f.suspect.addEventListener('input', suspectFill);
      const suspectBox = root.CVCombo ? CVCombo.attach(f.suspect, { label: 'Show the suspects', items: () => {
        const seen = new Set(); const out = [];
        for (const n of [...suspectNames, ...[...colorsNow().values()].map((x) => x.name)]) { const k = O.suspectKey(n); if (!seen.has(k)) { seen.add(k); out.push({ value: n, label: n, hint: colorsNow().has(k) ? 'On the timeline' : 'Suspect' }); } }
        return out;
      }, onPick: suspectFill }) : f.suspect;
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
        f.suspect.value = ''; pickedColor = ''; colorTouched = false; drawSwatches();
        f.drug.value = ''; f.qty.value = ''; f.paid.value = ''; f.unit.value = 'g';
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
        const data = { date: f.date.value, time: f.time.value, kind: f.kind.value, title: f.title.value.trim(), note: f.note.value.trim(), suspect: f.suspect.value.trim(), color: pickedColor };
        if (data.kind === 'buy') Object.assign(data, { drug: f.drug.value.trim(), qty: f.qty.value.trim(), unit: f.unit.value, paid: f.paid.value.trim().replace(/^\$/, '') });
        else Object.assign(data, { drug: undefined, qty: undefined, unit: undefined, paid: undefined });
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
      field('Suspect', suspectBox, 'tl-suspect-field', 'Who the event is about, such as the target of a buy. Events of the same suspect share a colour.'),
      field('Colour', swatches, 'tl-color-field', 'A colour to tell the events apart at a glance. Picking a suspect sets theirs.'),
      buyRow,
      field('Note', f.note, 'full'),
      h('div', { class: 'full form-actions' }, cancel, clear, submit));

      // v1.117: a key of the suspects on the timeline, each in their colour: click a name to show only
      // their events; click the colour to change it on all their events.
      const legend = h('div', { class: 'tl-legend' });
      function drawLegend(colors, rows = []) {
        // v1.143: a suspect who was arrested has small handcuffs on their filter.
        const arrested = new Set(rows.filter(({ ev }) => ev.kind === 'arrest').map(({ ev }) => O.suspectKey(ev.suspect)));
        if (!colors.size) { legend.replaceChildren(); legend.hidden = true; return; }
        legend.hidden = false;
        if (suspectFilter && !colors.has(suspectFilter)) suspectFilter = '';
        legend.replaceChildren(...[h('span', { class: 'tl-legend-title small muted' }, 'Suspects'),
          ...[...colors.entries()].map(([k, x]) => {
            const dot = h('button', { type: 'button', class: 'tl-legend-dot', title: `Change ${x.name}'s colour`, 'aria-label': `Change ${x.name}'s colour`, onclick: (e) => { e.stopPropagation(); recolor(k, x, dot); } });
            dot.style.setProperty('--sw', x.color);
            return h('span', { class: `tl-legend-chip${suspectFilter === k ? ' on' : ''}${arrested.has(k) ? ' arrested' : ''}` }, dot, arrested.has(k) ? h('span', { class: 'tl-legend-cuffs', title: `${x.name} was arrested` }, cuffs()) : null,
              h('button', { type: 'button', class: 'tl-legend-name', 'aria-pressed': String(suspectFilter === k), title: suspectFilter === k ? 'Show everyone again' : `Show only ${x.name}'s events`, onclick: () => { suspectFilter = suspectFilter === k ? '' : k; draw(); } }, x.name, h('span', { class: 'count' }, String(x.count))));
          }),
          suspectFilter ? h('button', { type: 'button', class: 'btn small ghost tl-legend-all', onclick: () => { suspectFilter = ''; draw(); } }, 'Show All') : null].filter(Boolean));
      }
      function recolor(k, x, anchor) {
        document.querySelectorAll('.tl-recolor').forEach((m) => m.remove());
        const menu = h('div', { class: 'tl-recolor', role: 'menu' }, ...O.TL_COLORS.map(([name, col]) => {
          const b = h('button', { type: 'button', class: `tl-swatch${col.toLowerCase() === x.color.toLowerCase() ? ' on' : ''}`, title: name, 'aria-label': name, onclick: async () => {
            menu.remove();
            const touched = new Set();
            for (const [caseId, t] of tls) for (const ev of t.events) if (O.suspectKey(ev.suspect) === k) { ev.color = col; touched.add(caseId); }
            draw();
            for (const id of touched) await persist(id);
          } });
          b.style.setProperty('--sw', col);
          return b;
        }));
        anchor.closest('.tl-legend-chip').append(menu);
        setTimeout(() => document.addEventListener('click', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', off, true); } }, true), 0);
      }

      let shownRows = [];
      // v1.119: what the timeline is about (the Mission's or the case's number) for the PDFs.
      const op = opOf ? opOf(c) : null;
      const pdfHead = () => ({ number: many && op ? op.number || c.number : c.number, numberLabel: many && op ? 'Mission' : 'Case Number', many });
      const suspectNote = () => (suspectFilter ? `Only ${(O.suspectColors(allRows()).get(suspectFilter) || {}).name || 'one suspect'}` : '');
      async function showPdf(title, data, fileBase) {
        const lh = root.CVLetterhead ? await CVLetterhead.forPdf().catch(() => null) : null;
        const bytes = CVTimelinePdf.build({ ...pdfHead(), title, fmtDate, ...data }, { letterhead: lh, printed: fmtDate(today()) });
        const name = `${fileBase} ${pdfHead().number || ''}.pdf`.replace(/\s+\.pdf$/, '.pdf').replace(/[\\/:*?"<>|]/g, '');
        const viewer = CVPdfViewer.create(bytes, { h, icon: I, title, fileName: name });
        await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', {}, title), viewer,
          h('div', { class: 'dialog-actions' },
            archivedCase ? null : h('button', { class: 'btn', type: 'button', icon: 'save', title: 'Save this PDF in the case\'s Files', onclick: async () => {
              try { await Save.track(`files:${c.id}`, () => Vault.addFile(c.id, new File([bytes], name, { type: 'application/pdf' }), { folder: 'Supplementary Report', description: title, replace: true })); toast('Saved to Files → Supplementary Report.', 'success'); } catch (err) { toast(`Not saved: ${err.message}`, 'error'); }
            } }, 'Save PDF to Case'),
            h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
        viewer.destroy();
      }
      // v1.119: the buys of each suspect with what was bought and paid, and the totals.
      function buySummaryDialog() {
        const rows = suspectFilter ? allRows().filter(({ ev }) => O.suspectKey(ev.suspect) === suspectFilter) : allRows();
        const groups = O.buySummary(rows);
        return openDialog((done) => h('div', { class: 'buy-summary' },
          h('h2', { icon: 'cash-coin' }, 'Buy Summary'),
          h('p', { class: 'muted small' }, groups.length ? `The buys on this timeline by suspect${suspectFilter ? ` (${suspectNote().toLowerCase()})` : ''}. A buy is an event with the Type "Buy".` : 'No buys yet. Add an event with the Type "Buy" and its narcotic, amount and money paid.'),
          ...groups.map((g) => {
            const dot = h('span', { class: 'tl-legend-dot static' }); if (g.color) dot.style.setProperty('--sw', g.color);
            return h('section', { class: 'buy-group' },
              h('div', { class: 'buy-group-head' }, dot, h('strong', {}, g.name),
                g.key ? h('button', { class: 'icon-btn person-btn', type: 'button', title: `Every case ${g.name} is on`, onclick: () => { done(); root.CVPersonView.open(g.name, root.CaseVaultUI); } }, I('person-lines-fill')) : null,
                h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${g.buys.length} buy${g.buys.length === 1 ? '' : 's'} · ${O.money(g.paid)} paid`)),
              h('div', { class: 'table-wrap' }, h('table', { class: 'data-table buy-table' },
                h('thead', {}, h('tr', {}, ...['Date', 'Case', 'Title', 'Narcotic', 'Amount', 'Paid'].map((t) => h('th', {}, t)))),
                h('tbody', {}, ...g.buys.map((b) => h('tr', {}, h('td', { class: 'nowrap' }, b.date ? fmtDate(b.date) : '—'), h('td', { class: 'nowrap' }, b.number), h('td', {}, b.title), h('td', {}, b.drug || '—'), h('td', { class: 'nowrap' }, b.qty ? `${b.qty} ${b.unit}` : '—'), h('td', { class: 'nowrap' }, b.paid ? O.money(b.paid) : '—')))),
                h('tfoot', {}, h('tr', {}, h('th', { colspan: 3 }, 'Total'), h('th', {}, g.drugs.map((d) => d.drug).join(', ') || '—'), h('th', { class: 'nowrap' }, g.drugs.map((d) => d.amounts.map((a) => `${a.qty} ${a.unit}`).join(' + ')).join('; ') || '—'), h('th', { class: 'nowrap' }, O.money(g.paid)))))));
          }),
          h('div', { class: 'dialog-actions' },
            groups.length ? h('button', { class: 'btn', type: 'button', icon: 'file-earmark-pdf', onclick: () => { done(); showPdf('Buy Summary', { rows, timeline: false, subtitle: suspectNote() }, 'Buy Summary'); } }, 'PDF') : null,
            h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
      }
      const tools = h('div', { class: 'tl-tools' },
        h('button', { class: 'btn small', type: 'button', icon: 'cash-coin', title: 'The buys of each suspect: what was bought and paid, with totals', onclick: buySummaryDialog }, 'Buy Summary'),
        h('button', { class: 'btn small', type: 'button', icon: 'printer', title: 'A PDF of the events shown now (the filter and suspect you picked), in their colours', onclick: () => showPdf('Timeline', { group: groupBy, rows: shownRows, subtitle: [suspectNote(), filter !== 'all' ? `${{ upcoming: 'Upcoming', deadline: 'Deadlines', past: 'Past' }[filter]} only` : ''].filter(Boolean).join(' · ') }, 'Timeline') }, 'Print Timeline'));

      // v1.141: Group by Suspect: each suspect's events together under their name (kept on this PC).
      let groupBy = false;
      try { groupBy = localStorage.getItem('cv-tl-group') === 'suspect'; } catch { /* private window */ }
      const groupBtn = h('button', { class: `btn small tl-group-btn${groupBy ? ' on' : ''}`, type: 'button', icon: 'people', 'aria-pressed': String(groupBy), title: 'Show each suspect\'s events together under their name', onclick: () => {
        groupBy = !groupBy;
        try { localStorage.setItem('cv-tl-group', groupBy ? 'suspect' : ''); } catch { /* private window */ }
        groupBtn.classList.toggle('on', groupBy); groupBtn.setAttribute('aria-pressed', String(groupBy));
        draw();
      } }, 'Group by Suspect');
      tools.prepend(groupBtn);

      function draw() {
        const everything = CVOperation.mergeEvents([...tls.entries()].map(([caseId, t]) => ({ caseId, number: numberOf(caseId), events: [...t.events, ...autoArrests(caseId, t.events)] })));
        const colors = O.suspectColors(everything);
        drawLegend(colors, everything);
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
        const keep = ({ ev }) => (!suspectFilter || O.suspectKey(ev.suspect) === suspectFilter) && (filter === 'all' ? true : filter === 'deadline' ? ev.kind === 'deadline' : filter === 'upcoming' ? ev.date >= now : ev.date < now);
        const all = everything.filter(keep);
        shownRows = all;
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
        list.classList.toggle('tl-grouped', groupBy);
        const seq = groupBy ? O.suspectGroups(all).flatMap((g) => [{ head: g }, ...g.rows]) : all;
        for (const item of seq) {
          if (item.head) {
            const g = item.head;
            const dot = h('span', { class: 'tl-legend-dot static' }); if (g.color) dot.style.setProperty('--sw', g.color);
            const li = h('li', { class: `tl-group-head${g.key ? '' : ' none'}` }, dot, h('strong', {}, g.name), h('span', { class: 'count' }, `${g.rows.length} event${g.rows.length === 1 ? '' : 's'}`));
            if (g.color) li.style.setProperty('--tl-color', g.color);
            items.push(li);
            month = '';
            continue;
          }
          const { caseId, ev } = item;
          if (!groupBy && !todayShown && ev.date >= now && all.some((x) => x.ev.date < now)) { items.push(h('li', { class: 'tl-today' }, h('span', {}, `Today · ${fmtDate(now)}`))); todayShown = true; }
          const mk = ev.date.slice(0, 7);
          if (mk !== month) { month = mk; items.push(h('li', { class: 'tl-month' }, monthName(ev.date))); }
          const isDeadline = ev.kind === 'deadline';
          // v1.148: a snoozed deadline ("remind me in 3 days") is quiet until its snooze runs out.
          const snoozed = isDeadline && !ev.done && ev.snooze && ev.snooze > now;
          const due = isDeadline && !ev.done && !snoozed ? dueLabel(ev.date) : null;
          const done = isDeadline ? h('input', { type: 'checkbox', checked: !!ev.done, 'aria-label': 'Done', title: 'Mark done' }) : null;
          if (done) done.addEventListener('change', () => { ev.done = done.checked; draw(); persist(caseId); });
          const [, , dd] = ev.date.split('-');
          const wk = new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
          const col = O.eventColor(ev, colors);
          const li = h('li', { class: `tl-item ${ev.kind} ${ev.done ? 'done' : ''} ${due ? due.cls : ''} ${ev.date < now ? 'past' : ''}${col ? ' tl-colored' : ''}` },
            h('div', { class: 'tl-when', title: fmtDate(ev.date) }, h('span', { class: 'tl-day' }, String(Number(dd))), h('span', { class: 'tl-wk' }, wk), ev.time ? h('span', { class: 'tl-time' }, ev.time) : ''),
            h('div', { class: 'tl-body' }, h('div', { class: 'tl-main' },
              h('div', { class: 'tl-title' },
                done,
                ev.kind === 'arrest' ? h('span', { class: 'badge arrest' }, cuffs(), 'Arrest') : h('span', { class: `badge ${ev.kind}` }, isDeadline ? 'Deadline' : ev.kind === 'buy' ? 'Buy' : 'Event'),
                many ? h('span', { class: `tl-case${caseId === c.id ? ' current' : ''}`, title: caseId === c.id ? 'This case number' : 'Another case number of this mission' }, numberOf(caseId)) : null,
                h('strong', {}, ev.title),
                due && h('span', { class: `due ${due.cls}` }, due.text),
                snoozed ? h('span', { class: 'due snoozed', title: 'Snoozed: no alert until then' }, `Snoozed until ${fmtDate(ev.snooze)}`) : null),
              ev.kind === 'buy' && O.buyLine(ev) ? h('div', { class: 'tl-buy' }, O.buyLine(ev)) : null,
              ev.note && h('div', { class: 'tl-note' }, ev.note)),
              // v1.138: the suspect on the right of the box, every name the same width so they line up.
              ev.suspect ? h('div', { class: 'tl-who' }, h('span', { class: 'tl-suspect', title: 'Suspect' }, ev.suspect)) : null),
            ev.auto ? h('div', { class: 'tl-actions' }, h('a', { class: 'btn small ghost', href: `#/case/${encodeURIComponent(caseId)}/arrest`, title: 'From the Arrest Report: change it there' }, 'Arrest Report')) : h('div', { class: 'tl-actions' },
              h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
                editing = { id: ev.id, caseId };
                f.date.value = ev.date; f.time.value = ev.time || ''; f.kind.value = ev.kind;
                f.title.value = ev.title; f.note.value = ev.note || '';
                f.caseSel.value = caseId;
                f.suspect.value = ev.suspect || ''; pickedColor = O.isColor(ev.color) ? ev.color : ''; colorTouched = !!pickedColor; drawSwatches();
                f.drug.value = ev.drug || ''; f.qty.value = ev.qty || ''; f.unit.value = ev.unit || 'g'; f.paid.value = ev.paid || ''; showBuy();
                submit.textContent = 'Save changes'; cancel.hidden = false;
                f.title.focus();
              } }, 'Edit'),
              isDeadline && !ev.done && (due || snoozed) ? h('button', { class: 'btn small ghost tl-snooze', type: 'button', title: snoozed ? 'Ring for this deadline again now' : 'No alert for this deadline for a few days', onclick: async () => {
                const days = snoozed ? 0 : await snoozeDialog(ev);
                if (days === null) return;
                if (days) { const d = new Date(`${now}T12:00:00`); d.setDate(d.getDate() + days); ev.snooze = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; } else delete ev.snooze;
                draw();
                persist(caseId);
              } }, snoozed ? 'Wake' : 'Snooze') : null,
              h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
                if (!(await confirmDialog({ title: 'Delete this entry?', message: `"${ev.title}" on ${fmtDate(ev.date)}${many ? ` (${numberOf(caseId)})` : ''}`, confirmText: 'Delete', danger: true }))) return;
                const t = tls.get(caseId);
                t.events = t.events.filter((x) => x.id !== ev.id);
                if (editing && editing.id === ev.id) resetForm();
                draw();
                persist(caseId);
              } }, 'Delete')));
          if (col) li.style.setProperty('--tl-color', col);
          items.push(li);
        }
        if (!groupBy && !todayShown && all.every((x) => x.ev.date < now)) items.push(h('li', { class: 'tl-today' }, h('span', {}, `Today · ${fmtDate(now)}`)));
        list.replaceChildren(...items);
        sizeSuspects();
      }

      // v1.138: every suspect box as wide as the widest name (up to a cap, then it wraps).
      const sizeSuspects = () => requestAnimationFrame(() => {
        const chips = [...list.querySelectorAll('.tl-who .tl-suspect')];
        list.style.removeProperty('--tl-who-w');
        if (!chips.length || !list.isConnected) return;
        const w = Math.max(...chips.map((x) => Math.ceil(x.getBoundingClientRect().width)));
        if (w) list.style.setProperty('--tl-who-w', `${w}px`);
      });

      draw();
      panel.replaceChildren(many ? h('p', { class: 'muted small tl-op-note' }, `The timeline of the whole mission: all ${tls.size} case numbers.`) : '', form, stats, h('div', { class: 'tl-filter-row' }, filters, tools), legend, list);
    }

    return { renderTimeline };
  }

  root.CVCaseTimeline = { init };
})(this);
