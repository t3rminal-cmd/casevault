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
    return F().normalize(d); // older saves brought up to date (v1.20 fields and evidence types)
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
      } else if (kind === 'check') {
        el = h('input', { type: 'checkbox', checked: !!data[key] });
        el.addEventListener('change', () => { data[key] = el.checked; save(); });
        return h('label', { class: 'check-row rf-check' }, el, h('span', {}, label));
      } else if (kind === 'time') {
        el = CVTimeField.create({ label, value: data[key] || '' });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      } else {
        el = h('input', { type: kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text', min: kind === 'number' ? 0 : null, autocomplete: 'off', list: kind === 'ucr' ? 'rf-ucr' : kind === 'location' ? 'rf-loc' : null, value: data[key] || '' });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      }
      return ui.field(label, el, kind === 'textarea' || kind === 'line' ? 'span-all rf-line' : '');
    };

    const sections = F().SECTIONS.map((s) => h('section', { class: `rf-section rf-${s.id}` },
      h('h3', { icon: s.icon }, s.title),
      h('div', { class: s.id === 'report' ? 'rf-lines' : 'rf-grid' }, s.fields.map(([k, label, kind, opts]) => input(k, label, kind, opts)))));

    // ---- evidence inventoried: one card per exhibit (number given automatically)
    const evRows = h('div', { class: 'rf-exhibits' });
    const drawEvidence = () => {
      evRows.replaceChildren(...(data.evidence.length ? data.evidence.map((e, i) => {
        const n = e.number;
        const inv = h('input', { value: e.inventory || '', autocomplete: 'off', 'aria-label': `Exhibit ${n} inventory number` });
        inv.addEventListener('input', () => { e.inventory = inv.value; save(); });
        const type = h('select', { 'aria-label': `Exhibit ${n} type` }, ['', ...F().EVIDENCE_TYPES].map((t) => h('option', { value: t, selected: t === (e.type || '') }, t || '—')));
        const drug = h('select', { 'aria-label': `Exhibit ${n} narcotic type` }, ['', ...F().DRUG_TYPES].map((t) => h('option', { value: t, selected: t === (e.drug || '') }, t || '—')));
        drug.addEventListener('change', () => { e.drug = drug.value; save(); });
        const weight = h('input', { value: e.weight || '', autocomplete: 'off', placeholder: '12.4 g', 'aria-label': `Exhibit ${n} weight` });
        weight.addEventListener('input', () => { e.weight = weight.value; save(); });
        const narc = h('div', { class: 'rf-narc', hidden: e.type !== 'Narcotics' }, ui.field('Narcotic Type', drug), ui.field('Weight', weight));
        type.addEventListener('change', () => { e.type = type.value; narc.hidden = e.type !== 'Narcotics'; save(); });
        const desc = h('textarea', { rows: 3, 'aria-label': `Exhibit ${n} description`, placeholder: 'What it is, where it was found, when and by whom.' });
        desc.value = e.description || '';
        desc.addEventListener('input', () => { e.description = desc.value; save(); });
        return h('div', { class: 'rf-exhibit-card' },
          h('div', { class: 'rf-exhibit-no', title: 'Given automatically; never reused' }, h('span', { class: 'small muted' }, 'Exhibit No.'), h('strong', { class: 'rf-exhibit' }, String(n))),
          h('div', { class: 'rf-exhibit-body' },
            h('div', { class: 'rf-exhibit-row' }, ui.field('Inventory Number', inv), ui.field('Type', type), narc),
            ui.field('Description', desc, 'span-all')),
          archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove exhibit', onclick: () => { data.evidence.splice(i, 1); drawEvidence(); save(); } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove exhibit ${n}`)));
      }) : [h('p', { class: 'muted small' }, 'No evidence yet.')]));
    };
    drawEvidence();
    const addExhibit = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: c.agencyNumber ? `Numbered on from the last exhibit of any case with agency case number ${c.agencyNumber}.` : 'Numbered on from the last exhibit of this case. Cases with the same agency case number share one sequence.', onclick: async () => {
      try {
        const n = F().nextExhibit(await numbersInUse(c, data));
        data.evidence.push({ number: n, inventory: '', type: '', drug: '', weight: '', description: '' });
        data.lastExhibit = Math.max(Number(data.lastExhibit) || 0, n);
        drawEvidence();
        save(0);
        const last = evRows.lastElementChild && evRows.lastElementChild.querySelector('input');
        if (last) last.focus();
      } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); }
    } }, 'Add Exhibit');

    const narrative = h('textarea', { class: 'rf-narrative', rows: 24, placeholder: 'What happened, in order. Tab indents.', 'aria-label': 'Summary of Investigation' });
    narrative.value = data.narrative || '';
    narrative.addEventListener('input', () => { data.narrative = narrative.value; save(); });
    const rich = CVRichEditor.create(narrative, { h, icon: ui.icon, label: 'Summary of Investigation' });
    const fmt = CVFormatBar.attach(narrative, { h, icon: ui.icon, rich });

    const saveBtn = h('button', { class: 'btn primary', type: 'button', icon: 'save', onclick: async () => {
      save(0);
      await Save.flushAll();
      if (!Save.failed.has(key)) toast('Report fields saved to the SSD.', 'success', 2500);
    } }, 'Save Changes');
    // ---- the Supplementary Report as a PDF: look at it and print, keep it, or send it to sign.
    const pdfBytes = () => {
      const p = Vault.data.settings.affiant || {};
      return CVReportPdf.build(data, { agency: p.agency || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' \u00b7 '), printed: CVFormat.dateText(Vault.localDay()) });
    };
    const pdfName = () => `Supplementary Report ${CVFormat.dateText(Vault.localDay())}.pdf`;
    // Saving twice without changes in between (Save PDF, then Email for E-Sign) keeps one file.
    let lastPdf = null;
    async function savePdf() {
      save(0);
      await Save.flushAll();
      const bytes = pdfBytes();
      const sig = JSON.stringify(data);
      if (lastPdf && lastPdf.sig === sig) return lastPdf.path;
      const file = new File([bytes], pdfName(), { type: 'application/pdf' });
      const path = await Save.track(`report-pdf:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Supplementary Report', description: pdfName().replace(/\.pdf$/, '') }));
      lastPdf = { sig, path };
      return path;
    }
    const printBtn = h('button', { 'data-ro-ok': 'true', class: 'btn', type: 'button', icon: 'printer', title: 'Opens the report. Print it, or save it as a PDF.', onclick: async () => {
      save(0);
      await Save.flushAll();
      const url = URL.createObjectURL(new Blob([pdfBytes()], { type: 'application/pdf' }));
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', { icon: 'printer' }, 'Supplementary Report'),
        h('p', { class: 'muted small' }, 'Use the printer button above the page to print, or the download button to save a PDF.'),
        h('iframe', { class: 'preview-frame', src: url, title: 'Supplementary Report' }),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      URL.revokeObjectURL(url);
    } }, 'Print / PDF');
    const pdfCaseBtn = h('button', { class: 'btn', type: 'button', icon: 'file-earmark-pdf-fill', title: 'Saves the PDF in this case\'s Supplementary Report folder.', onclick: async () => {
      try { const path = await savePdf(); toast(`Saved to the case files: ${path.split('/').pop()}`, 'success', 5000); } catch { /* reported by Save */ }
    } }, 'Save PDF to Case');
    const signBtn = h('button', { class: 'btn', type: 'button', icon: 'envelope-paper', title: 'Saves the PDF to the case and starts an email with it attached, for signing.', onclick: async () => {
      let path;
      try { path = await savePdf(); } catch { return; }
      if (root.CVMailUI) {
        CVMailUI.prepare(c, {
          subject: `${c.number || c.title || ''} Supplementary Report for signature`.trim(),
          body: 'Please review and sign the attached Supplementary Report. The signature boxes can be signed electronically (Adobe Acrobat or Reader: Fill & Sign) or printed and signed in blue ink.',
          attach: [path],
        });
      }
      go(c.id, 'mail');
      toast('The PDF is attached. Add the recipients, then check and create the Outlook draft.', 'success', 8000);
    } }, 'Email for E-Sign');

    const makeBtn = h('button', { class: 'btn', type: 'button', icon: 'file-earmark-plus', title: 'Makes an editable report from these fields.', onclick: async () => {
      save(0);
      await Save.flushAll();
      const title = `Supplementary Report ${CVFormat.dateText(Vault.localDay())}`;
      try {
        const slug = await Vault.newDraftSlug(c.id, title);
        await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, { title, type: 'other', ai: false, created: new Date().toISOString() }, F().toMarkdown(data, title)));
        go(c.id, 'reports', slug);
      } catch { /* reported by Save */ }
    } }, 'Create Report');

    panel.replaceChildren(
      h('div', { class: 'notes-head' }, h('a', { href: `#/case/${encodeURIComponent(c.id)}/reports`, class: 'back-link' }, '← All reports'),
        h('h2', { icon: 'card-checklist' }, 'Report Fields'), h('div', { class: 'spacer' }), archived ? null : saveBtn),
      h('p', { class: 'muted small explain' }, 'The Supplementary Report for this case. Print it, save it as a PDF, or email it to sign. Saved as report-fields.json.'),
      h('div', { class: 'rf-actions' }, printBtn, archived ? null : pdfCaseBtn, archived ? null : signBtn, archived ? null : makeBtn),
      ucrList, locList,
      ...sections.slice(0, -1),
      h('section', { class: 'rf-section' },
        h('h3', { icon: 'box-seam', title: 'Numbers are automatic and shared by cases with the same agency case number.' }, 'Evidence Inventoried'),
        evRows,
        archived ? null : h('div', { class: 'contact-add' }, addExhibit)),
      h('section', { class: 'rf-section' }, h('h3', { icon: 'journal-text' }, 'Summary of Investigation'), fmt, rich.el, narrative),
      sections[sections.length - 1], // Submission and Approval comes last, as on the printed report
      archived ? null : h('div', { class: 'details-save' }, saveBtn.cloneNode(true)));
    // The copy at the bottom does the same as the one at the top.
    const bottom = panel.querySelector('.details-save .btn');
    if (bottom) bottom.addEventListener('click', () => saveBtn.click());
  }

  function init(kit) { ui = kit; }

  root.CVReportFieldsUI = { init, load, render, numbersInUse };
})(this);
