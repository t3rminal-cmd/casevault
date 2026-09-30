/* CaseVault — screens for the case status rules (js/closing.js):
 *   - the Arrest details tab (cases/<id>/arrest.json), for arrest reports;
 *   - "Close case…" with a disposition and a loose-ends checklist;
 *   - "Set to Pending" with what you're waiting on and a follow-up date on the timeline;
 *   - "Reopen case".
 * Uses the small UI kit app.js exposes as window.CaseVaultUI.
 */
'use strict';

(function (root) {
  let ui = null;
  const K = () => root.CVClosing;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const plusDays = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  /** Does this case show the Arrest details tab? */
  const hasArrestTab = (c) => !!(c && (c.arrest || (c.closure && c.closure.disposition === 'arrest')));

  async function readArrest(c) {
    return (await Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null)) || K().emptyArrest();
  }

  /** {{arrest.*}} and {{closure.*}} values for templates. */
  async function templateExtra(c) {
    const arrest = await Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null);
    // {{report.*}} from Reports → Report Fields (v1.18).
    const fields = root.CVReportFields ? await Vault.readCaseJSON(c.id, 'report-fields.json').catch(() => null) : null;
    return { ...K().arrestContext(arrest || { arrestees: [] }), ...K().closureContext(c.closure), ...(fields ? CVReportFields.context(fields) : {}) };
  }

  /* ---------------- Arrest details tab ---------------- */

  async function renderArrest(panel, c, token) {
    const { h, Save, toast } = ui;
    const arrest = await readArrest(c);
    if (token !== ui.state.renderToken) return;
    if (!arrest.arrestees.length) arrest.arrestees.push(K().emptyArrestee());

    const status = h('span', { class: 'note-save-status small muted', role: 'status', 'aria-live': 'polite' }, '✓ Saved on the SSD');
    const key = `arrest:${c.id}`;
    const writeNow = async () => {
      const snapshot = structuredClone(arrest);
      await Vault.writeCaseJSON(c.id, 'arrest.json', snapshot);
      // The arrestees' names are always hidden from online AI and flagged in mail (js/secure/pii.js).
      const people = K().peopleOf(snapshot);
      if (!c.arrest || JSON.stringify(people) !== JSON.stringify(c.people || [])) {
        c.arrest = true;
        c.people = people;
        await Vault.saveCase(structuredClone(c));
      }
      status.className = 'note-save-status small ok-text';
      status.textContent = `✓ Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };
    const changed = () => {
      status.className = 'note-save-status small warn-text';
      status.textContent = 'Not saved yet…';
      Save.schedule(key, writeNow, 700);
    };

    const input = (obj, f) => {
      let el;
      if (f.type === 'select') el = h('select', {}, f.options.map((o) => h('option', { value: o, selected: (obj[f.key] || '') === o }, o || '—')));
      else if (f.type === 'textarea') el = h('textarea', { rows: 2 });
      else if (f.type === 'time') el = CVTimeField.create({ label: f.label });
      else el = h('input', { type: f.type || 'text', autocomplete: 'off', 'data-format': f.format || null, maxlength: f.format === 'ssn' ? 11 : null });
      if (f.type !== 'select') el.value = obj[f.key] || '';
      el.addEventListener(f.type === 'select' ? 'change' : 'input', () => { obj[f.key] = el.value; changed(); });
      return el;
    };
    const fieldset = (obj, fields) => h('div', { class: 'form-grid arrest-grid' }, fields.map((f) => ui.field(f.label, input(obj, f), f.type === 'textarea' ? 'span-2' : '')));

    const list = h('div', { class: 'arrestees' });
    const draw = () => {
      list.replaceChildren(...arrest.arrestees.map((a, i) => {
        const charges = h('tbody', {}, a.charges.map((ch, j) => h('tr', {},
          K().CHARGE_FIELDS.map((f) => h('td', {}, input(ch, f))),
          h('td', {}, h('button', { class: 'btn small ghost', type: 'button', title: 'Remove this charge', onclick: () => { a.charges.splice(j, 1); if (!a.charges.length) a.charges.push(K().emptyCharge()); changed(); draw(); } }, '✕')))));
        const name = K().arresteeName(a) || `Arrestee ${i + 1}`;
        return h('section', { class: 'card arrestee' },
          h('div', { class: 'row' }, h('h2', {}, name), h('div', { class: 'spacer' }),
            arrest.arrestees.length > 1 ? h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: async () => {
              if (!(await ui.confirmDialog({ title: `Remove ${name}?`, message: 'This arrestee and their charges are removed from the arrest details.', confirmText: 'Remove', danger: true }))) return;
              arrest.arrestees.splice(i, 1); changed(); draw();
            } }, 'Remove arrestee') : null),
          h('h3', {}, 'Arrestee'), fieldset(a, K().ARRESTEE_FIELDS),
          h('h3', {}, 'Arrest'), fieldset(a, K().ARREST_FIELDS),
          h('h3', {}, 'Charges'),
          h('div', { class: 'table-scroll' }, h('table', { class: 'files charges-table' },
            h('thead', {}, h('tr', {}, K().CHARGE_FIELDS.map((f) => h('th', {}, f.label)), h('th', {}, ''))), charges)),
          h('button', { class: 'btn small', type: 'button', onclick: () => { a.charges.push(K().emptyCharge()); changed(); draw(); } }, '+ Add charge'),
          h('h3', {}, 'Property seized'), fieldset(a, [{ key: 'property', label: 'Property / evidence seized from the arrestee', type: 'textarea' }]),
          h('h3', {}, 'Notes'), fieldset(a, [{ key: 'notes', label: 'Anything else for the arrest report', type: 'textarea' }]));
      }));
    };
    draw();

    const saveBtn = h('button', { class: 'btn small primary', type: 'button', onclick: async () => {
      try { await Save.run(key, writeNow); } catch { /* shown by the header indicator */ }
    } }, 'Save');
    const reportBtn = h('button', { class: 'btn small', type: 'button', onclick: () => startArrestReport(c) }, 'Start an arrest report draft');

    panel.replaceChildren(
      h('div', { class: 'toolbar' },
        h('p', { class: 'muted small explain' }, 'These details fill {{arrest.…}} in templates, for the arrest report. Saved in this case\'s folder on the SSD (arrest.json).'),
        h('div', { class: 'spacer' }), status, saveBtn),
      list,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { arrest.arrestees.push(K().emptyArrestee()); changed(); draw(); } }, '+ Add another arrestee'),
        h('div', { class: 'spacer' }), reportBtn));
  }

  // A new draft from the arrest report template, filled from these details.
  async function startArrestReport(c) {
    const { Save, toast } = ui;
    await Save.flushAll();
    try {
      let templates = await Vault.listTemplates();
      let tpl = templates.find((t) => /arrest/i.test(`${t.file} ${t.title}`));
      if (!tpl) {
        await Vault.addStarterTemplates();
        templates = await Vault.listTemplates();
        tpl = templates.find((t) => /arrest/i.test(`${t.file} ${t.title}`));
      }
      if (!tpl) return toast('Add an arrest report template first (Vault → Templates).', 'error');
      const caseObj = await Vault.getCase(c.id);
      const body = CVDraft.fillTemplate(await Vault.readTemplate(tpl.file), CVDraft.templateContext(caseObj, new Date(), Vault.data.settings.affiant, await templateExtra(caseObj)));
      const title = `Arrest report${caseObj.people && caseObj.people[0] ? ` - ${caseObj.people[0]}` : ''}`;
      const slug = await Vault.newDraftSlug(c.id, title);
      await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, { title, type: 'other', ai: false, template: tpl.file, created: new Date().toISOString() }, body));
      toast(`Draft made from "${tpl.title}". Check every [CONFIRM: …].`, 'success', 6000);
      ui.go(c.id, 'reports', slug);
    } catch { /* reported by Save */ }
  }

  /* ---------------- Close case ---------------- */

  async function closeCaseDialog(c) {
    const { h, openDialog, Save, toast } = ui;
    await Save.flushAll();
    // Loose ends, as a reminder.
    const [timeline, checks, drafts] = await Promise.all([
      Vault.getTimeline(c.id).catch(() => ({ events: [] })),
      Vault.listChecks(c.id).catch(() => []),
      Vault.listDrafts(c.id).then((list) => Promise.all(list.map(async (d) => {
        const full = await Vault.readDraft(c.id, d.slug).catch(() => null);
        return { title: d.title, confirm: full ? CVDraft.extractPlaceholders(full.body).length : 0 };
      }))).catch(() => []),
    ]);
    const loose = K().closeChecklist({ timeline, checks, drafts });
    const arrest = await readArrest(c);
    const named = K().peopleOf(arrest);

    const result = await openDialog((close) => {
      const radios = K().DISPOSITIONS.map((d) => {
        const r = h('input', { type: 'radio', name: 'disposition', value: d.key, checked: d.key === ((c.closure && c.closure.disposition) || '') });
        return { d, r, row: h('label', { class: 'radio-row' }, r, h('span', {}, h('strong', {}, d.label), h('span', { class: 'muted small block' }, d.hint))) };
      });
      const reason = h('select', { 'aria-label': 'Reason' }, h('option', { value: '' }, 'Choose the reason…'), K().disposition('exceptional').reasons.map((x) => h('option', { value: x }, x)));
      const reasonRow = h('label', { class: 'field', hidden: true }, h('span', {}, 'Exceptional clearance reason'), reason);
      const arrestNote = h('p', { class: 'small', hidden: true });
      const date = h('input', { type: 'date', value: (c.dates && c.dates.closed) || today(), required: true });
      const note = h('textarea', { rows: 3, placeholder: 'Optional: how the case ended, where the final report is, who was notified…' });
      const ok = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Close case');
      const pick = () => {
        const sel = radios.find((x) => x.r.checked);
        reasonRow.hidden = !(sel && sel.d.key === 'exceptional');
        arrestNote.hidden = !(sel && sel.d.key === 'arrest');
        arrestNote.textContent = named.length
          ? `Arrest details: ${named.join(', ')}. You can still change them on the Arrest details tab.`
          : 'After closing, the Arrest details tab opens so you can fill in the arrestee, the arrest and the charges.';
        ok.disabled = !sel || (sel.d.key === 'exceptional' && !reason.value) || !date.value;
      };
      for (const x of radios) x.r.addEventListener('change', pick);
      reason.addEventListener('change', pick);
      date.addEventListener('input', pick);
      pick();
      return h('form', { class: 'close-form', onsubmit: (e) => {
        e.preventDefault();
        const sel = radios.find((x) => x.r.checked);
        if (!sel) return;
        close({ disposition: sel.d.key, reason: sel.d.key === 'exceptional' ? reason.value : '', date: date.value, note: note.value.trim() });
      } },
      h('h2', {}, `Close "${c.title || 'Untitled case'}"`),
      h('p', { class: 'muted small explain' }, 'Close a case when the investigation is finished. Choose how it ended. A closed case stays in the list (filter: Closed) until you archive it, and can be reopened.'),
      loose.length ? h('div', { class: 'card warn-card' }, h('strong', {}, 'Before you close'), h('ul', { class: 'small' }, loose.map((x) => h('li', {}, x.text))),
        h('p', { class: 'small muted' }, 'You can still close the case; this is a reminder.')) : h('p', { class: 'small ok-text' }, '✓ No open deadlines, check flags or [CONFIRM: …] left.'),
      h('h3', {}, 'Disposition'),
      h('div', { class: 'radio-list' }, radios.map((x) => x.row)),
      reasonRow, arrestNote,
      h('div', { class: 'form-grid' }, ui.field('Closed on', date), h('div')),
      ui.field('Closing note', note),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), ok));
    });
    if (!result) return false;
    const prev = c.closure;
    c.status = 'Closed';
    c.dates.closed = result.date;
    c.closure = { ...result, at: new Date().toISOString() };
    if (prev && prev.at && prev.at !== c.closure.at) c.closureHistory = [...(c.closureHistory || []), prev];
    c.pending = null;
    if (result.disposition === 'arrest') c.arrest = true;
    try {
      await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c)));
      toast(`Case closed: ${K().disposition(result.disposition).label}.`, 'success');
      ui.go(c.id, result.disposition === 'arrest' && !named.length ? 'arrest' : 'details');
      ui.refresh();
      return true;
    } catch { return false; }
  }

  async function reopenCase(c) {
    const { Save, toast } = ui;
    const d = c.closure && K().disposition(c.closure.disposition);
    const ok = await ui.confirmDialog({
      title: 'Reopen this case?',
      message: `It goes back to Open${d ? `. The closing (${d.label}${c.closure.date ? `, ${c.closure.date}` : ''}) is kept in the case's history` : ''}. Arrest details, files and drafts stay as they are.`,
      confirmText: 'Reopen case',
    });
    if (!ok) return false;
    if (c.closure) c.closureHistory = [...(c.closureHistory || []), { ...c.closure, reopened: new Date().toISOString() }];
    c.closure = null;
    c.status = 'Open';
    c.dates.closed = '';
    try {
      await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c)));
      toast('Case reopened.', 'success');
      ui.refresh();
      return true;
    } catch { return false; }
  }

  /* ---------------- Pending ---------------- */

  async function pendingDialog(c) {
    const { h, openDialog, Save, toast } = ui;
    const cur = c.pending || {};
    const result = await openDialog((close) => {
      const reason = h('select', {}, K().PENDING_REASONS.map((r) => h('option', { value: r, selected: r === cur.reason }, r)));
      const detail = h('input', { type: 'text', maxlength: 120, value: cur.detail || '', placeholder: 'e.g. lab request 26-114, DA Smith' });
      const follow = h('input', { type: 'date', value: cur.followUp || plusDays(14) });
      const addDeadline = h('input', { type: 'checkbox', checked: true });
      return h('form', { onsubmit: (e) => { e.preventDefault(); close({ reason: reason.value, detail: detail.value.trim(), followUp: follow.value, addDeadline: addDeadline.checked }); } },
        h('h2', {}, 'Set the case to Pending'),
        h('p', { class: 'muted small explain' }, 'Pending means you\'re waiting on someone else and can\'t move the case forward yourself. Set it back to Open when you can work it again.'),
        h('div', { class: 'form-grid' }, ui.field('Waiting on', reason), ui.field('Details', detail), ui.field('Follow up by', follow), h('div')),
        h('label', { class: 'check-row' }, addDeadline, h('span', {}, 'Add the follow-up date to the timeline as a deadline, so it shows in the case list and the Overview')),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Set to Pending')));
    });
    if (!result) return false;
    c.status = 'Pending';
    c.pending = { reason: result.reason, detail: result.detail, followUp: result.followUp, since: today() };
    try {
      await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c)));
      if (result.addDeadline && result.followUp) {
        const tl = await Vault.getTimeline(c.id);
        tl.events.push(K().followUpEvent(result.reason, result.detail, result.followUp, Vault.newId('e')));
        await Save.track(`timeline:${c.id}`, () => Vault.saveTimeline(c.id, tl));
      }
      toast(`Pending: ${result.reason}${result.followUp ? `, follow up by ${result.followUp}` : ''}.`, 'success');
      ui.refresh();
      return true;
    } catch { return false; }
  }

  /** One line under the status: what the status means here, and what it's waiting on / how it closed. */
  function statusLine(c) {
    const K2 = K();
    if (c.status === 'Pending' && c.pending) return `Waiting on ${c.pending.reason}${c.pending.detail ? ` (${c.pending.detail})` : ''}${c.pending.followUp ? ` · follow up by ${c.pending.followUp}` : ''}.`;
    if (c.status === 'Closed' && c.closure) {
      const d = K2.disposition(c.closure.disposition);
      return `Closed ${c.closure.date || ''}: ${d ? d.label : ''}${c.closure.reason ? ` (${c.closure.reason})` : ''}.`;
    }
    return K2.STATUS_HELP[c.status] || '';
  }

  function init(kit) { ui = kit; }

  root.CVClosingUI = { init, hasArrestTab, renderArrest, closeCaseDialog, reopenCase, pendingDialog, statusLine, templateExtra, startArrestReport };
})(this);
