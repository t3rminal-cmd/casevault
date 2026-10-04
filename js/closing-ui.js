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
  // A case closed by arrest has the tab too, unless its arrest details were deleted (v1.29).
  const hasArrestTab = (c) => !!(c && (c.arrest || (c.closure && c.closure.disposition === 'arrest' && !c.arrestRemoved)));

  /** Delete the arrest details (v1.29: also on the tab itself, and for a case closed by arrest). */
  async function deleteArrest(c) {
    const { Save, toast, confirmDialog } = ui;
    if (!(await confirmDialog({ title: 'Delete the arrest details?', message: 'The Arrest details tab is taken off this case, and the arrestees, arrest and charges entered there are deleted from the SSD. Arrest report drafts already made are kept.', confirmText: 'Delete', danger: true }))) return false;
    try {
      // A save of the tab still waiting would write the details back.
      const pending = Save.timers && Save.timers.get(`arrest:${c.id}`);
      if (pending) { clearTimeout(pending.timer); Save.timers.delete(`arrest:${c.id}`); }
      const fresh = await Vault.getCase(c.id);
      fresh.arrest = false;
      fresh.arrestRemoved = true;
      fresh.people = [];
      await Save.track(`arrest:${c.id}`, () => Vault.writeCaseJSON(c.id, 'arrest.json', K().emptyArrest()));
      await Save.track(`case:${c.id}`, () => Vault.saveCase(fresh));
      Object.assign(c, fresh);
      toast('Arrest details deleted.', 'success', 2500);
      location.hash = `#/case/${encodeURIComponent(c.id)}/details`;
      ui.refresh();
      return true;
    } catch { return false; /* reported by Save */ }
  }

  // Charges to pick from (v1.29): the Reference's Illinois and federal statutes; search by
  // statute or wording, picking fills both boxes. They can still be typed over.
  // v1.32: the charges on the case's Supplementary Report (Draft tab) come first.
  const chargeItems = (fromReport = []) => [
    ...fromReport.map((x) => ({ label: `${x.statute || ''} ${x.description || ''}`.trim(), hint: 'On the Supplementary Report', statute: x.statute || '', desc: x.description || '' })),
    ...((root.CVRefData && root.CVRefData.CHARGES) || []).flatMap((g) => g.codes.map(([statute, desc]) => ({ label: `${statute} ${desc}`, hint: g.title, statute, desc }))),
  ];

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

  /* The Arrest details tab (v1.30): laid out like an arrest report, one per arrestee, in the
   * report's order. Print / PDF, Save PDF to Case and Email for E-Sign make the Arrest Report
   * PDF (js/arrest-pdf.js), in the same style as the Supplementary Report. */
  const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;

  async function renderArrest(panel, c, token) {
    const { h, Save, toast } = ui;
    const arrest = K().normalizeArrest(await readArrest(c));
    if (token !== ui.state.renderToken) return;
    if (!arrest.arrestees.length) arrest.arrestees.push(K().emptyArrestee());
    // The RD number is the case number unless you type another.
    for (const a of arrest.arrestees) if (!a.rdNumber && c.number) a.rdNumber = c.number;
    const archived = Vault.isArchived(c.id);
    const images = archived ? [] : (await Vault.listFiles(c.id).catch(() => [])).filter((f) => IMAGE_RE.test(f.name));
    const reportCharges = root.CVReportFieldsUI ? await CVReportFieldsUI.load(c).then((d) => (d.charges || []).filter((x) => (x.statute || x.description))).catch(() => []) : [];
    if (token !== ui.state.renderToken) return;

    const status = h('span', { class: 'note-save-status small muted', role: 'status', 'aria-live': 'polite' }, '✓ Saved on the SSD');
    const key = `arrest:${c.id}`;
    const writeNow = async () => {
      const snapshot = structuredClone(arrest);
      await Vault.writeCaseJSON(c.id, 'arrest.json', snapshot);
      // The arrestees' names are always hidden from online AI and flagged in mail (js/secure/pii.js).
      const people = K().peopleOf(snapshot);
      if (!c.arrest || c.arrestRemoved || JSON.stringify(people) !== JSON.stringify(c.people || [])) {
        c.arrest = true;
        delete c.arrestRemoved;
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

    const input = (obj, f, onChange) => {
      let el;
      if (f.type === 'select' || f.type === 'yn') el = h('select', {}, (f.type === 'yn' ? ['', 'Yes', 'No'] : f.options).map((o) => h('option', { value: o, selected: (obj[f.key] || '') === o }, o || '—')));
      else if (f.type === 'textarea') el = h('textarea', { rows: f.key === 'narrative' ? 14 : 2 });
      else if (f.type === 'time') el = CVTimeField.create({ label: f.label });
      else el = h('input', { type: f.type || 'text', autocomplete: 'off', 'data-format': f.format || null, maxlength: f.format === 'ssn' ? 11 : null });
      if (f.type !== 'select' && f.type !== 'yn') el.value = obj[f.key] || '';
      el.addEventListener(f.type === 'select' || f.type === 'yn' ? 'change' : 'input', () => { obj[f.key] = el.value; changed(); if (onChange) onChange(); });
      return el;
    };
    const fieldset = (obj, fields, onChange, cls = '') => h('div', { class: `form-grid arrest-grid${cls ? ` ${cls}` : ''}` }, fields.map((f) => ui.field(f.label, input(obj, f, onChange), f.type === 'textarea' ? 'span-2' : '')));
    // v1.59: each part starts folded, like every form (open one with its arrow; remembered).
    const section = (title, ...kids) => { const sec = h('section', { class: 'arrest-section' }, h('h3', {}, title), ...kids); return ui.makeFoldable ? ui.makeFoldable(sec, `arrest-${title}`) : sec; };

    // A list of entries (narcotics, warrants, victims and complainants): a box per entry.
    const listEditor = (a, listKey, noneText, addLabel) => {
      const L = K().LISTS[listKey];
      const box = h('div', { class: 'arrest-list' });
      const draw = () => {
        box.replaceChildren(...(a[listKey].length ? a[listKey].map((it, i) => h('div', { class: 'arrest-item' },
          h('div', { class: 'arrest-item-head' }, h('strong', {}, `${L.item} ${i + 1}`), h('div', { class: 'spacer' }),
            archived ? null : h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: () => { a[listKey].splice(i, 1); changed(); draw(); } }, `Remove ${L.item}`)),
          fieldset(it, L.fields))) : [h('p', { class: 'muted small' }, noneText)]),
        archived ? null : h('button', { class: 'btn small', type: 'button', onclick: () => { a[listKey].push(K().emptyItem(listKey)); changed(); draw(); } }, addLabel));
      };
      draw();
      return box;
    };

    // The arrestee's photo: a picture from the case files, shown on the report beside the Offender.
    const photoPicker = (a) => {
      const img = h('img', { class: 'arrest-photo-img', alt: 'Arrestee photo', hidden: true });
      let url = '';
      const show = async () => {
        if (url) { URL.revokeObjectURL(url); url = ''; }
        img.hidden = true;
        if (!a.photo) return;
        try { url = URL.createObjectURL(await Vault.readFile(c.id, a.photo)); img.src = url; img.hidden = false; } catch { /* moved or deleted */ }
      };
      const sel = h('select', { 'aria-label': 'Photo' }, h('option', { value: '' }, '— No photo —'),
        ...images.map((f) => h('option', { value: f.name, selected: f.name === a.photo }, f.name.split('/').pop())));
      if (a.photo && !images.some((f) => f.name === a.photo)) sel.append(h('option', { value: a.photo, selected: true }, a.photo.split('/').pop()));
      sel.addEventListener('change', () => { a.photo = sel.value; changed(); show(); });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      file.addEventListener('change', async () => {
        const f = file.files[0];
        file.value = '';
        if (!f) return;
        try {
          const path = await Save.track(`file:${c.id}`, () => Vault.addFile(c.id, f, { folder: 'Subject Information', description: `${K().arresteeName(a) || 'Arrestee'} photo` }));
          a.photo = path;
          sel.append(h('option', { value: path, selected: true }, path.split('/').pop()));
          sel.value = path;
          changed(); show();
        } catch { /* reported by Save */ }
      });
      show();
      return h('div', { class: 'arrest-photo' }, img,
        h('div', { class: 'arrest-photo-pick' }, ui.field('Photo', sel),
          archived ? null : h('button', { class: 'btn small', type: 'button', title: 'Adds a picture to the case files (Subject Information) and uses it here', onclick: () => file.click() }, 'Add Photo'), file));
    };

    const list = h('div', { class: 'arrestees' });
    const draw = () => {
      list.replaceChildren(...arrest.arrestees.map((a, i) => {
        const charges = h('tbody', {}, a.charges.map((ch, j) => h('tr', {},
          K().CHARGE_FIELDS.map((f) => {
            const el = input(ch, f);
            if ((f.key !== 'statute' && f.key !== 'description') || !root.CVCombo) return h('td', { class: `charge-${f.key}` }, el);
            const box = CVCombo.attach(el, { label: 'Show the charges', items: () => chargeItems(reportCharges).map((x) => ({ ...x, value: f.key === 'statute' ? x.statute : x.desc })), onPick: (x) => {
              ch.statute = x.statute; ch.description = x.desc;
              changed(); draw();
            } });
            return h('td', { class: `charge-${f.key}` }, box);
          }),
          h('td', {}, h('button', { class: 'btn small ghost', type: 'button', title: 'Remove this charge', onclick: () => { a.charges.splice(j, 1); if (!a.charges.length) a.charges.push(K().emptyCharge()); changed(); draw(); } }, '✕')))));
        const name = K().arresteeName(a) || `Arrestee ${i + 1}`;
        const ageOut = h('output', { class: 'arrest-age' });
        const showAge = () => { const n = K().ageOn(a.dob, a.date); ageOut.textContent = n ? `${n} years` : '—'; };
        showAge();
        const offender = fieldset(a, K().ARRESTEE_FIELDS, showAge, 'arrest-g-offender');
        offender.insertBefore(ui.field('Age', ageOut), offender.children[6] || null);
        return h('section', { class: 'card arrestee cv-boxed' },
          h('div', { class: 'row' }, h('h2', {}, name), h('div', { class: 'spacer' }),
            archived ? null : h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: async () => {
              if (!(await ui.confirmDialog({ title: `Remove ${name}?`, message: 'This arrestee and their charges are removed from the arrest details.', confirmText: 'Remove', danger: true }))) return;
              arrest.arrestees.splice(i, 1);
              if (!arrest.arrestees.length) arrest.arrestees.push(K().emptyArrestee());
              changed(); draw();
            } }, 'Remove Arrestee')),
          section('Report Numbers', (() => { const g = fieldset(a, K().NUMBER_FIELDS); g.classList.add('arrest-numbers'); return g; })()),
          section('Offender', h('div', { class: 'arrest-offender' }, offender, photoPicker(a))),
          section('Incident', fieldset(a, K().INCIDENT_FIELDS, showAge, 'arrest-g-incident')),
          section('Charges',
            h('div', { class: 'table-scroll' }, h('table', { class: 'files charges-table' },
              h('thead', {}, h('tr', {}, K().CHARGE_FIELDS.map((f) => h('th', {}, f.label)), h('th', {}, ''))), charges)),
            archived ? null : h('div', { class: 'row' },
              h('button', { class: 'btn small', type: 'button', onclick: () => { a.charges.push(K().emptyCharge()); changed(); draw(); } }, '+ Add Charge'),
              reportCharges.length ? h('button', { class: 'btn small', type: 'button', title: 'Adds the charges from the Supplementary Report (Draft tab) that aren\'t here yet', onclick: () => {
                const have = new Set(a.charges.map((x) => `${(x.statute || '').trim()}|${(x.description || '').trim()}`));
                a.charges = a.charges.filter((x) => (x.statute || '').trim() || (x.description || '').trim());
                for (const x of reportCharges) if (!have.has(`${(x.statute || '').trim()}|${(x.description || '').trim()}`)) a.charges.push({ ...K().emptyCharge(), statute: x.statute || '', description: x.description || '' });
                if (!a.charges.length) a.charges.push(K().emptyCharge());
                changed(); draw();
              } }, 'Use Report Charges') : null)),
          section('Recovered Narcotics', listEditor(a, 'narcotics', 'No narcotics recovered.', '+ Add Narcotic')),
          section('Warrant', listEditor(a, 'warrants', 'No warrant identified.', '+ Add Warrant')),
          section('Victim and Complainant', listEditor(a, 'nonOffenders', 'None added.', '+ Add Victim or Complainant')),
          section('Arrestee Vehicle', fieldset(a, K().VEHICLE_FIELDS, null, 'arrest-g-4')),
          section('Properties', fieldset(a, [{ key: 'property', label: 'Confiscated properties: inventory numbers and description', type: 'textarea' }])),
          section('Incident Narrative', fieldset(a, [{ key: 'narrative', label: 'The facts for probable cause to arrest and to support the charges', type: 'textarea' }])),
          section('Court and Bond', fieldset(a, [...K().COURT_FIELDS, ...K().BOND_FIELDS], null, 'arrest-g-court')),
          section('Reporting Personnel', fieldset(a, K().PERSONNEL_FIELDS, null, 'arrest-g-personnel')));
      }));
    };
    draw();

    // ---- the Arrest Report as a PDF: look at it and print, keep it, or send it to sign.
    async function photoJpeg(path) {
      const bmp = await createImageBitmap(await Vault.readFile(c.id, path));
      const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
      return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height };
    }
    const pdfBytes = async () => {
      const p = Vault.data.settings.affiant || {};
      const photos = {};
      for (const [i, a] of arrest.arrestees.entries()) { if (a.photo) { try { photos[i] = await photoJpeg(a.photo); } catch { /* left out */ } } }
      return CVArrestPdf.build(arrest, { agency: p.agency || '', caseNumber: c.number || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' · '), printed: '', photos });
    };
    const pdfName = () => `Arrest Report ${CVArrestPdf.reportName(arrest.arrestees[0] || {})}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    async function showPdf(bytes) {
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: 'Arrest Report', fileName: pdfName() });
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', {}, 'Arrest Report'),
        viewer,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }
    let lastPdf = null;
    async function savePdf() {
      await Save.flushAll();
      const sig = JSON.stringify(arrest);
      if (lastPdf && lastPdf.sig === sig) return lastPdf.path;
      const bytes = await pdfBytes();
      const file = new File([bytes], pdfName(), { type: 'application/pdf' });
      const path = await Save.track(`arrest-pdf:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Arrest Report', description: pdfName().replace(/\.pdf$/, ''), replace: true }));
      lastPdf = { sig, path, bytes };
      return path;
    }
    const printBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', title: 'Opens the Arrest Report. Print it, or save it as a PDF.', onclick: async () => {
      await Save.flushAll();
      await showPdf(await pdfBytes());
    } }, 'Print / PDF');
    const pdfCaseBtn = h('button', { class: 'btn small', type: 'button', title: 'Saves the PDF in this case\'s Arrest Report folder.', onclick: async () => {
      let path;
      try { path = await savePdf(); } catch { return; }
      toast(`Saved to the case files: ${path.split('/').pop()}`, 'success', 5000);
      await showPdf(lastPdf.bytes);
    } }, 'Save PDF to Case');
    const signBtn = h('button', { class: 'btn small', type: 'button', title: 'Saves the PDF to the case and starts an email with it attached, for signing.', onclick: async () => {
      let path;
      try { path = await savePdf(); } catch { return; }
      if (root.CVMailUI) {
        CVMailUI.prepare(c, {
          subject: `${c.number || c.title || ''} Arrest Report for signature`.trim(),
          body: 'Please review and sign the attached Arrest Report. The signature boxes can be signed electronically (Adobe Acrobat or Reader: Fill & Sign) or printed and signed in blue ink.',
          attach: [path],
        });
      }
      ui.go(c.id, 'mail');
      toast('The PDF is attached. Add the recipients, then check and create the Outlook draft.', 'success', 8000);
    } }, 'Email for E-Sign');

    const saveBtn = h('button', { class: 'btn small primary', type: 'button', onclick: async () => {
      try { await Save.run(key, writeNow); } catch { /* shown by the header indicator */ }
    } }, 'Save');
    const reportBtn = h('button', { class: 'btn small', type: 'button', onclick: () => startArrestReport(c) }, 'Start an arrest report draft');

    panel.replaceChildren(
      h('div', { class: 'toolbar arrest-toolbar' },
        h('p', { class: 'muted small explain' }, 'The Arrest Report for this case, one per arrestee. Print it, save it as a PDF or email it to sign. These details also fill {{arrest.…}} in templates. Saved in this case\'s folder on the SSD (arrest.json).'),
        printBtn, archived ? null : pdfCaseBtn, archived ? null : signBtn,
        h('div', { class: 'spacer' }), status, archived ? null : saveBtn,
        archived ? null : h('button', { class: 'btn small danger-ghost', type: 'button', title: 'Deletes all the arrest details of this case and takes the tab off', onclick: () => deleteArrest(c) }, 'Delete Arrest')),
      list,
      archived ? null : h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { const a = K().emptyArrestee(); if (c.number) a.rdNumber = c.number; arrest.arrestees.push(a); changed(); draw(); } }, '+ Add another arrestee'),
        h('div', { class: 'spacer' }), reportBtn));
  }

  // A new draft from the arrest report template, filled from these details.
  async function startArrestReport(c) {
    const { Save, toast } = ui;
    await Save.flushAll();
    try {
      // Your own arrest report template (Vault → Templates), else the built-in outline (v1.28).
      const found = (await Vault.listTemplates()).find((t) => /arrest/i.test(`${t.file} ${t.title}`));
      const tpl = found || { file: '', title: 'Arrest Report outline' };
      const caseObj = await Vault.getCase(c.id);
      const text = found ? await Vault.readTemplate(found.file) : CVDraft.ARREST_OUTLINE;
      const body = CVDraft.fillTemplate(text, CVDraft.templateContext(caseObj, new Date(), Vault.data.settings.affiant, await templateExtra(caseObj)));
      const title = `Arrest report${caseObj.people && caseObj.people[0] ? ` - ${caseObj.people[0]}` : ''}`;
      const slug = await Vault.newDraftSlug(c.id, title);
      await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, { title, type: 'other', ai: false, template: tpl.file, created: new Date().toISOString() }, body));
      toast(`Draft made from "${tpl.title}". Check every [CONFIRM: …].`, 'success', 6000);
      ui.go(c.id, 'reports', slug);
    } catch { /* reported by Save */ }
  }

  /* ---------------- Close case ---------------- */

  // v1.39: the Draft tab's Update Information boxes that closing fills in, by disposition.
  const CLOSE_CODES = {
    arrest: { status: '3 - Cleared Closed', cleared: '1 - Arrest' },
    exceptional: { status: '4 - Cleared Open', cleared: '5 - Other' },
    unfounded: { status: '2 - Unfounded', cleared: '' },
    inactive: { status: '1 - Suspended', cleared: '' },
    referred: { status: '4 - Cleared Open', cleared: '3 - Referred for Prosecution' },
    other: { status: '', cleared: '' },
  };

  async function closeCaseDialog(c, { operation = null } = {}) {
    const { h, openDialog, Save, toast } = ui;
    await Save.flushAll();
    // v1.39: every open case number of the operation is listed; tick the ones to close (this one,
    // or all of them from Close Operation).
    // v1.46: the Operation's cases are the ones linked to it (operationId).
    const members = (operation || (Vault.data.cases || []).filter((x) => c.operationId && x.operationId === c.operationId))
      .filter((x) => x.id === c.id || (x.status !== 'Closed' && !Vault.isArchived(x.id)));
    if (!members.some((x) => x.id === c.id)) members.unshift(c);
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
    // v1.84: closing by arrest needs the arrest report: an arrestee's name and at least one charge.
    const charged = ((arrest && arrest.arrestees) || []).some((a) => K().arresteeName(a) && K().chargesText(a.charges));
    const arrestReady = named.length > 0 && charged;
    const RF = root.CVReportFields;
    const optsOf = (key) => ((RF && RF.FIELDS.find(([k]) => k === key)) || [, , , ['']])[3];

    const result = await openDialog((close) => {
      const radios = K().DISPOSITIONS.map((d) => {
        const r = h('input', { type: 'radio', name: 'disposition', value: d.key, checked: d.key === ((c.closure && c.closure.disposition) || '') });
        return { d, r, row: h('label', { class: 'radio-row' }, r, h('span', {}, h('strong', {}, d.label), h('span', { class: 'muted small block' }, d.hint))) };
      });
      const reason = h('select', { 'aria-label': 'Reason' }, h('option', { value: '' }, 'Choose the reason…'), K().disposition('exceptional').reasons.map((x) => h('option', { value: x }, x)));
      const reasonRow = h('label', { class: 'field', hidden: true }, h('span', {}, 'Exceptional clearance reason'), reason);
      const arrestNote = h('p', { class: 'small', hidden: true });
      const date = h('input', { type: 'date', value: (c.dates && c.dates.closed) || today(), required: true });
      const by = h('input', { type: 'text', maxlength: 120, value: (c.closure && c.closure.closedBy) || ((Vault.data.settings.affiant || {}).name || ''), placeholder: 'Your name and star number', 'aria-label': 'Closed by' });
      const note = h('textarea', { rows: 3, placeholder: 'Optional: how the case ended, where the final report is, who was notified…' });
      // Which case numbers.
      const picks = members.map((x) => {
        const cb = h('input', { type: 'checkbox', checked: x.id === c.id || !!operation, 'aria-label': `Close ${x.number || 'no number'}` });
        return { x, cb, row: h('label', { class: 'check-row close-pick' }, cb, h('span', {}, h('strong', {}, x.number || 'No case number'), x.id === c.id ? h('span', { class: 'muted small' }, ' (this one)') : '')) };
      });
      // The Draft tab's boxes.
      const upd = h('input', { type: 'checkbox', checked: !!RF });
      const status = h('select', { 'aria-label': 'Status' }, optsOf('status').map((o) => h('option', { value: o }, o || '—')));
      const cleared = h('select', { 'aria-label': 'How Cleared' }, optsOf('cleared').map((o) => h('option', { value: o }, o || '—')));
      const CHECKS = ['victimVerified', 'offenderVerified', 'propertyVerified', 'circumstancesVerified', 'victimUpdated', 'offenderUpdated', 'propertyUpdated', 'circumstancesUpdated'];
      const checkBoxes = CHECKS.map((k) => {
        const f = RF && RF.FIELDS.find(([kk]) => kk === k);
        const cb = h('input', { type: 'checkbox', checked: /Verified$/.test(k) });
        return { k, cb, row: h('label', { class: 'check-row small' }, cb, h('span', {}, f ? f[1] : k)) };
      });
      const draftBox = h('div', { class: 'close-draft' },
        h('div', { class: 'form-grid' }, ui.field('Status', status), ui.field('How Cleared', cleared)),
        h('div', { class: 'close-checks' }, checkBoxes.map((x) => x.row)));
      upd.addEventListener('change', () => { draftBox.hidden = !upd.checked; });
      const ok = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Close Case');
      const pick = () => {
        const sel = radios.find((x) => x.r.checked);
        reasonRow.hidden = !(sel && sel.d.key === 'exceptional');
        arrestNote.hidden = !(sel && sel.d.key === 'arrest');
        arrestNote.className = arrestReady ? 'small' : 'small arrest-required';
        arrestNote.replaceChildren(arrestReady
          ? `Arrest details: ${named.join(', ')}. You can still change them on the Arrest details tab.`
          : `Required before closing by arrest: the arrest report. ${named.length ? `Add at least one charge for ${named.join(', ')}` : 'Fill in the arrestee and at least one charge'} on the Arrest details tab, then close the case.`,
        arrestReady ? '' : h('button', { class: 'btn small-btn', type: 'button', icon: 'person-vcard', onclick: () => close({ fillArrest: true }) }, 'Open Arrest Details'));
        const n = picks.filter((p) => p.cb.checked).length;
        ok.textContent = n > 1 ? `Close ${n} Case Numbers` : 'Close Case';
        ok.disabled = !sel || (sel.d.key === 'exceptional' && !reason.value) || (sel.d.key === 'arrest' && !arrestReady) || !date.value || !n || !by.value.trim();
        ok.title = !sel ? 'Choose the disposition first.' : sel.d.key === 'arrest' && !arrestReady ? 'Fill in the arrest report first.' : '';
      };
      const codes = () => { const sel = radios.find((x) => x.r.checked); const cc = sel && CLOSE_CODES[sel.d.key]; if (cc) { status.value = cc.status; cleared.value = cc.cleared; } };
      for (const x of radios) x.r.addEventListener('change', () => { codes(); pick(); });
      for (const p of picks) p.cb.addEventListener('change', pick);
      reason.addEventListener('change', pick);
      date.addEventListener('input', pick);
      by.addEventListener('input', pick);
      codes();
      pick();
      return h('form', { class: 'close-form', onsubmit: (e) => {
        e.preventDefault();
        const sel = radios.find((x) => x.r.checked);
        if (!sel) return;
        close({
          disposition: sel.d.key, reason: sel.d.key === 'exceptional' ? reason.value : '', date: date.value, note: note.value.trim(), closedBy: by.value.trim(),
          ids: picks.filter((p) => p.cb.checked).map((p) => p.x.id),
          draft: upd.checked ? { status: status.value, cleared: cleared.value, checks: Object.fromEntries(checkBoxes.map((x) => [x.k, x.cb.checked])) } : null,
        });
      } },
      h('h2', {}, `Close "${c.title || 'Untitled case'}"${c.number && members.length === 1 ? ` (${c.number})` : ''}`),
      h('p', { class: 'muted small explain' }, 'Close a case when the investigation is finished. Choose how it ended. A closed case stays in the list (filter: Closed) until you archive it, and can be reopened.'),
      loose.length ? h('div', { class: 'card warn-card' }, h('strong', {}, 'Before you close'), h('ul', { class: 'small' }, loose.map((x) => h('li', {}, x.text))),
        h('p', { class: 'small muted' }, 'You can still close the case; this is a reminder.')) : h('p', { class: 'small ok-text' }, '✓ No open deadlines, check flags or [CONFIRM: …] left.'),
      members.length > 1 ? h('div', {}, h('h3', {}, 'Case numbers to close'), h('p', { class: 'muted small' }, 'Tick each case number of this mission to close with this disposition. Each can still be reopened on its own.'), h('div', { class: 'close-picks' }, picks.map((p) => p.row))) : '',
      h('h3', {}, 'Disposition'),
      h('div', { class: 'radio-list' }, radios.map((x) => x.row)),
      reasonRow, arrestNote,
      h('div', { class: 'form-grid' }, ui.field('Closed on', date), ui.field('Closed by', by)),
      RF ? h('div', {}, h('label', { class: 'check-row' }, upd, h('span', {}, h('strong', {}, 'Update the Draft tab'), h('span', { class: 'muted small' }, ': Status, How Cleared and the Update Information boxes of each case number closed'))), draftBox) : '',
      ui.field('Closing note', note),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), ok));
    });
    if (!result) return false;
    if (result.fillArrest) {
      if (!c.arrest || c.arrestRemoved) {
        c.arrest = true;
        delete c.arrestRemoved;
        try { await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c))); } catch { return false; }
      }
      toast('Fill in the arrestee and the charges, then Close Case again.', 'info', 6000);
      ui.go(c.id, 'arrest');
      return false;
    }
    const { ids, draft, ...closure } = result;
    const before = new Map();
    for (const id of ids) {
      const oc = id === c.id ? c : await Vault.getCase(id).catch(() => null);
      if (oc) before.set(id, { status: oc.status, closed: oc.dates.closed, closure: oc.closure || null, closureHistory: oc.closureHistory, pending: oc.pending, arrest: oc.arrest, arrestRemoved: oc.arrestRemoved });
    }
    let n = 0;
    for (const id of ids) {
      try {
        const oc = id === c.id ? c : await Vault.getCase(id);
        const was = oc.closure;
        oc.status = 'Closed';
        oc.dates.closed = closure.date;
        oc.closure = { ...closure, at: new Date().toISOString() };
        if (was && was.at && was.at !== oc.closure.at) oc.closureHistory = [...(oc.closureHistory || []), was];
        oc.pending = null;
        if (closure.disposition === 'arrest') { oc.arrest = true; delete oc.arrestRemoved; }
        await Save.track(`case:${oc.id}`, () => Vault.saveCase(structuredClone(oc)));
        // The Draft tab of each case closed: Status, How Cleared and the boxes ticked (v1.39).
        if (draft && RF) {
          let d = null;
          try { d = await Vault.readCaseJSON(oc.id, 'report-fields.json'); } catch { /* none yet */ }
          { const b = before.get(oc.id); if (b) b.fields = d ? structuredClone(d) : null; }
          d = RF.normalize(d);
          if (!d.caseNumber && (oc.agencyNumber || oc.number)) d.caseNumber = oc.agencyNumber || oc.number;
          if (draft.status) d.status = draft.status;
          if (draft.cleared) d.cleared = draft.cleared;
          for (const [k, v] of Object.entries(draft.checks)) if (v) d[k] = true;
          await Save.track(`report-fields:${oc.id}`, () => Vault.writeCaseJSON(oc.id, 'report-fields.json', d));
        }
        n++;
      } catch { /* reported by Save */ }
    }
    // v1.84: Undo for a few seconds puts each case back as it was.
    const closedOps = []; // Missions closed with it, put back by Undo too
    const msg = n > 1 ? `Closed ${n} case numbers: ${K().disposition(closure.disposition).label}.` : `Case closed: ${K().disposition(closure.disposition).label}.`;
    const t = toast(msg, 'success', 8000);
    if (t && n) {
      const undo = ui.h('button', { class: 'toast-undo', type: 'button' }, 'Undo');
      undo.addEventListener('click', async () => {
        t.remove();
        for (const [id, b] of before) {
          try {
            const oc = id === c.id ? c : await Vault.getCase(id);
            oc.status = b.status;
            oc.dates.closed = b.closed;
            oc.closure = b.closure;
            if (b.closureHistory) oc.closureHistory = b.closureHistory; else delete oc.closureHistory;
            oc.pending = b.pending;
            oc.arrest = b.arrest;
            if (b.arrestRemoved) oc.arrestRemoved = b.arrestRemoved;
            await Save.track(`case:${oc.id}`, () => Vault.saveCase(structuredClone(oc)));
            if (RF && 'fields' in b) await Save.track(`report-fields:${oc.id}`, () => Vault.writeCaseJSON(oc.id, 'report-fields.json', RF.normalize(b.fields)));
          } catch { /* reported by Save */ }
        }
        for (const o of closedOps) await Vault.updateOperation(o.id, { status: o.status, end: o.end }).catch(() => {});
        toast(before.size > 1 ? 'Close undone: the case numbers are back as they were.' : 'Close undone: the case is back as it was.', 'success');
        ui.refresh();
      });
      t.append(' ', undo);
    }
    if (ids.includes(c.id)) ui.go(c.id, 'details');
    ui.refresh();
    if (n) closedOps.push(...await missionFollowUp(c, ids, 'close', closure.date));
    return n > 0;
  }

  /** v1.84: after closing the last open case of a Mission, offer to close the Mission too; after
   * reopening a case of a closed Mission, offer to reopen the Mission. Returns the Missions changed,
   * with what they were before. */
  async function missionFollowUp(c, ids, what, date = today()) {
    const opIds = [...new Set(ids.map((id) => (id === c.id ? c : (Vault.data.cases || []).find((x) => x.id === id) || {}).operationId).filter(Boolean))];
    const changed = [];
    for (const opId of opIds) {
      const op = Vault.getOperation(opId);
      if (!op) continue;
      const cases = (Vault.data.cases || []).filter((x) => x.operationId === opId && !Vault.isArchived(x.id));
      const label = [op.number, op.name].filter(Boolean).join(' ') || 'this Mission';
      if (what === 'close') {
        if (op.status === 'Closed' || cases.some((x) => x.status !== 'Closed' && !ids.includes(x.id))) continue;
        const ok = await ui.confirmDialog({
          title: 'Close the Mission too?',
          message: `Every case of ${label} is closed now. Close the Mission as well? It moves to CLOSED FILES with its cases, and can be reopened.`,
          confirmText: 'Close Mission',
          cancelText: 'Keep it open',
        });
        if (!ok) continue;
        try {
          changed.push({ id: op.id, status: op.status, end: op.end || '' });
          await Vault.updateOperation(op.id, { status: 'Closed', end: op.end || date });
          ui.toast(`Mission closed: ${label}.`, 'success');
        } catch (e) { ui.toast(e.message || 'The Mission could not be closed.', 'error'); }
      } else {
        if (op.status !== 'Closed') continue;
        const ok = await ui.confirmDialog({
          title: 'Reopen the Mission?',
          message: `${label} is closed. Reopen the Mission too, so it is back in MISSION FILES with this case?`,
          confirmText: 'Reopen Mission',
          cancelText: 'Keep it closed',
        });
        if (!ok) continue;
        try {
          changed.push({ id: op.id, status: op.status, end: op.end || '' });
          await Vault.updateOperation(op.id, { status: 'Open', end: '' });
          ui.toast(`Mission reopened: ${label}.`, 'success');
        } catch (e) { ui.toast(e.message || 'The Mission could not be reopened.', 'error'); }
      }
    }
    if (changed.length) ui.refresh();
    return changed;
  }

  async function reopenCase(c) {
    const { Save, toast } = ui;
    const d = c.closure && K().disposition(c.closure.disposition);
    const ok = await ui.confirmDialog({
      title: 'Reopen this case?',
      message: `It goes back to Open${d ? `. The closing (${d.label}${c.closure.date ? `, ${root.CVFormat ? CVFormat.dateText(c.closure.date) : c.closure.date}` : ''}) is kept in the case's history` : ''}. Arrest details, files and drafts stay as they are.`,
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
      await missionFollowUp(c, [c.id], 'reopen');
      return true;
    } catch { return false; }
  }

  /* ---------------- Pending ---------------- */

  async function pendingDialog(c) {
    const { h, openDialog, Save, toast } = ui;
    const cur = c.pending || {};
    const result = await openDialog((close) => {
      const reason = h('select', {}, K().PENDING_REASONS.map((r) => h('option', { value: r, selected: r === cur.reason }, r)));
      const detail = h('input', { type: 'text', maxlength: 120, value: cur.detail || '', placeholder: 'Lab request 26-114, DA Smith' });
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
      return `Closed ${c.closure.date || ''}${c.closure.closedBy ? ` by ${c.closure.closedBy}` : ''}: ${d ? d.label : ''}${c.closure.reason ? ` (${c.closure.reason})` : ''}.`;
    }
    // Open needs no explaining on the Details tab (v1.24).
    return c.status === 'Open' ? '' : K2.STATUS_HELP[c.status] || '';
  }

  function init(kit) { ui = kit; }

  root.CVClosingUI = { init, hasArrestTab, deleteArrest, renderArrest, closeCaseDialog, reopenCase, pendingDialog, statusLine, templateExtra, startArrestReport };
})(this);
