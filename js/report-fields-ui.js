/* CaseVault — Reports → Report Fields: the form (js/report-fields.js has the fields and the text
 * conversions). Saved in the case folder as report-fields.json, a moment after each change and
 * with Save changes.
 */
'use strict';

(function (root) {
  let ui = null;
  const F = () => root.CVReportFields;
  const FILE = 'report-fields.json';

  async function load(c) {
    let d = null;
    try { d = await Vault.readCaseJSON(c.id, FILE); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    const out = { ...F().empty(), ...(d || {}) };
    if (!Array.isArray(out.evidence)) out.evidence = [];
    return out;
  }

  // Exhibit numbers already given in this case and in every case with the same agency case number.
  async function numbersInUse(c, data) {
    const nums = [...data.evidence.map((e) => e.number), data.lastExhibit || 0];
    const agency = String(c.agencyNumber || '').trim().toLowerCase();
    if (!agency) return nums;
    const others = (Vault.data.cases || []).filter((x) => x.id !== c.id && String(x.agencyNumber || '').trim().toLowerCase() === agency);
    for (const o of others) {
      try {
        const d = await Vault.readCaseJSON(o.id, FILE);
        if (d) nums.push(...(d.evidence || []).map((e) => e.number), d.lastExhibit || 0);
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    }
    return nums;
  }

  async function render(panel, c, token) {
    const { h, state, Save, toast, go } = ui;
    const data = await load(c);
    if (token !== state.renderToken) return;
    if (!data.caseNumber && c.number) data.caseNumber = c.number;
    const archived = Vault.isArchived(c.id);
    const key = `report-fields:${c.id}`;
    const save = (delay = 700) => {
      const snapshot = structuredClone(data);
      Save.schedule(key, () => Vault.writeCaseJSON(c.id, FILE, snapshot), delay);
    };

    // Code lists from the Reference pages, to pick from while typing.
    const R = root.CVRefData || { UCR_CODES: [], LOCATION_CODES: [] };
    const ucrList = h('datalist', { id: 'rf-ucr' }, R.UCR_CODES.flatMap((g) => g.codes.map(([code, desc]) => h('option', { value: `${code} ${desc}` }))));
    const locList = h('datalist', { id: 'rf-loc' }, R.LOCATION_CODES.flatMap((g) => g.codes.map(([code, desc]) => h('option', { value: `${code} ${desc}` }))));

    const input = (key, label, kind, opts) => {
      let el;
      if (kind === 'select' || kind === 'yesno') {
        const list = kind === 'yesno' ? ['', 'Yes', 'No'] : opts;
        el = h('select', {}, list.map((o) => h('option', { value: o, selected: o === (data[key] || '') }, o || '—')));
        el.addEventListener('change', () => { data[key] = el.value; save(); });
      } else if (kind === 'textarea') {
        el = h('textarea', { rows: 2 });
        el.value = data[key] || '';
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      } else if (kind === 'time') {
        el = CVTimeField.create({ label, value: data[key] || '' });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      } else {
        el = h('input', { type: kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text', min: kind === 'number' ? 0 : null, autocomplete: 'off', list: kind === 'ucr' ? 'rf-ucr' : kind === 'location' ? 'rf-loc' : null, value: data[key] || '' });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      }
      return ui.field(label, el, kind === 'textarea' ? 'span-all' : '');
    };

    const sections = F().SECTIONS.map((s) => h('section', { class: 'rf-section' },
      h('h3', { icon: s.icon }, s.title),
      h('div', { class: 'rf-grid' }, s.fields.map(([k, label, kind, opts]) => input(k, label, kind, opts)))));

    // ---- evidence inventoried
    const evRows = h('tbody', {});
    const drawEvidence = () => {
      evRows.replaceChildren(...(data.evidence.length ? data.evidence.map((e, i) => {
        const desc = h('input', { value: e.description || '', 'aria-label': `Exhibit ${e.number} description`, autocomplete: 'off' });
        desc.addEventListener('input', () => { e.description = desc.value; save(); });
        const type = h('select', { 'aria-label': `Exhibit ${e.number} type` }, ['', ...F().EVIDENCE_TYPES].map((t) => h('option', { value: t, selected: t === (e.type || '') }, t || '—')));
        type.addEventListener('change', () => { e.type = type.value; save(); });
        return h('tr', {},
          h('td', { class: 'rf-exhibit' }, String(e.number)),
          h('td', {}, desc), h('td', {}, type),
          h('td', {}, h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove this exhibit. Its number is not given out again.', onclick: () => { data.evidence.splice(i, 1); drawEvidence(); save(); } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove exhibit ${e.number}`))));
      }) : [h('tr', {}, h('td', { colspan: 4, class: 'muted small' }, 'No evidence yet.'))]));
    };
    drawEvidence();
    const addExhibit = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: c.agencyNumber ? `Numbered on from the last exhibit of any case with agency case number ${c.agencyNumber}.` : 'Numbered on from the last exhibit of this case. Cases with the same agency case number share one sequence.', onclick: async () => {
      try {
        const n = F().nextExhibit(await numbersInUse(c, data));
        data.evidence.push({ number: n, description: '', type: '' });
        data.lastExhibit = Math.max(Number(data.lastExhibit) || 0, n);
        drawEvidence();
        save(0);
        const last = evRows.lastElementChild && evRows.lastElementChild.querySelector('input');
        if (last) last.focus();
      } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); }
    } }, 'Add exhibit');

    const narrative = h('textarea', { class: 'rf-narrative', rows: 12, placeholder: 'What happened, in order. Tab indents.', 'aria-label': 'Narrative' });
    narrative.value = data.narrative || '';
    narrative.addEventListener('input', () => { data.narrative = narrative.value; save(); });
    const rich = CVRichEditor.create(narrative, { h, icon: ui.icon, label: 'Narrative' });
    const fmt = CVFormatBar.attach(narrative, { h, icon: ui.icon, rich });

    const saveBtn = h('button', { class: 'btn primary', type: 'button', icon: 'save', onclick: async () => {
      save(0);
      await Save.flushAll();
      if (!Save.failed.has(key)) toast('Report fields saved to the SSD.', 'success', 2500);
    } }, 'Save changes');
    const makeBtn = h('button', { class: 'btn', type: 'button', icon: 'file-earmark-plus', title: 'Turns these fields into a new report in this case, which you can edit, review and export to Word.', onclick: async () => {
      save(0);
      await Save.flushAll();
      const title = `${data.offense || 'Case Report'} ${CVFormat.dateText(Vault.localDay())}`;
      try {
        const slug = await Vault.newDraftSlug(c.id, title);
        await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, { title, type: 'other', ai: false, created: new Date().toISOString() }, F().toMarkdown(data, title)));
        go(c.id, 'reports', slug);
      } catch { /* reported by Save */ }
    } }, 'Create report from fields');

    panel.replaceChildren(
      h('div', { class: 'notes-head' }, h('a', { href: `#/case/${encodeURIComponent(c.id)}/reports`, class: 'back-link' }, '← All reports'),
        h('h2', { icon: 'card-checklist' }, 'Report Fields'), h('div', { class: 'spacer' }), archived ? null : makeBtn, archived ? null : saveBtn),
      h('p', { class: 'muted small explain' }, 'The facts for this case\'s reports. They fill {{report.…}} in templates, go to Draft with AI, and Create report from fields turns them into a report. Saved in the case folder as report-fields.json.'),
      ucrList, locList,
      ...sections,
      h('section', { class: 'rf-section' },
        h('h3', { icon: 'box-seam', title: 'Exhibit numbers are given automatically and never reused. Every case with the same agency case number continues the same count.' }, 'Evidence inventoried'),
        h('table', { class: 'files rf-evidence' }, h('thead', {}, h('tr', {}, h('th', {}, 'Exhibit'), h('th', {}, 'Description'), h('th', {}, 'Type'), h('th', {}, ''))), evRows),
        archived ? null : h('div', { class: 'contact-add' }, addExhibit)),
      h('section', { class: 'rf-section' }, h('h3', { icon: 'journal-text' }, 'Narrative'), fmt, rich.el, narrative),
      archived ? null : h('div', { class: 'details-save' }, saveBtn.cloneNode(true)));
    // The copy at the bottom does the same as the one at the top.
    const bottom = panel.querySelector('.details-save .btn');
    if (bottom) bottom.addEventListener('click', () => saveBtn.click());
  }

  function init(kit) { ui = kit; }

  root.CVReportFieldsUI = { init, load, render, numbersInUse };
})(this);
