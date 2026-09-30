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
    if (!data.caseNumber && (c.agencyNumber || c.number)) data.caseNumber = c.agencyNumber || c.number; // Agency Report Number
    const archived = Vault.isArchived(c.id);
    const key = `report-fields:${c.id}`;
    const save = (delay = 700) => {
      const snapshot = structuredClone(data);
      Save.schedule(key, () => Vault.writeCaseJSON(c.id, FILE, snapshot), delay);
    };


    // Searchable lists (v1.22): UCR codes and location codes from the Reference pages, and the
    // charges; the pick-lists (victim, gang, hair, eyes). All can still be typed over.
    const RD = root.CVRefData || { UCR_CODES: [], LOCATION_CODES: [], CHARGES: [] };
    const UCR_ITEMS = RD.UCR_CODES.flatMap((g) => g.codes.map(([code, desc]) => ({ value: `${code} ${desc}`, label: `${code} ${desc}`, hint: g.title, group: g.title })));
    const LOC_ITEMS = RD.LOCATION_CODES.flatMap((g) => g.codes.map(([code, desc]) => ({ value: code, label: `${code} ${desc}`, hint: g.title, desc })));
    const CHARGE_ITEMS = (RD.CHARGES || []).flatMap((g) => g.codes.map(([statute, desc]) => ({ value: statute, label: `${statute} ${desc}`, hint: g.title, statute, desc })));
    const pickItems = (list) => list.map((v) => ({ value: v, label: v }));
    const els = {}; // the Report Fields inputs by key, for fields filled from a pick
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
        el = h('input', { type: kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text', min: kind === 'number' ? 0 : null, autocomplete: 'off', value: data[key] || '' });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      }
      els[key] = el;
      const setField = (k, v) => { data[k] = v; if (els[k]) els[k].value = v; };
      // The input keeps its own listeners; a searchable list wraps it (box), not replaces it.
      let box = el;
      if (kind === 'ucr') {
        // From Common UCR; an empty Offense Classification takes the UCR group (Narcotics…).
        box = CVCombo.attach(el, { items: () => UCR_ITEMS, onPick: (it) => { if (key === 'ucr' && !String(data.offense || '').trim()) setField('offense', it.group); save(); } });
      } else if (kind === 'location') {
        // From Location Codes; Type of Location fills in from the code picked.
        box = CVCombo.attach(el, { items: () => LOC_ITEMS, onPick: (it) => { setField('locationType', it.desc); save(); } });
      }
      // Officer's Report lines that may not apply get their own tick box (v1.22).
      if (kind === 'line' && F().OPTIONAL_LINES.includes(key)) {
        const on = !F().isHidden(data, key);
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${label}`, title: 'Untick if this line doesn\'t apply' });
        const row = ui.field(label, box, `span-all rf-line rf-optional${on ? '' : ' rf-line-off'}`);
        row.prepend(cb);
        cb.addEventListener('change', () => {
          data.hidden = data.hidden.filter((x) => x !== key);
          if (!cb.checked) data.hidden.push(key);
          row.classList.toggle('rf-line-off', !cb.checked);
          save();
        });
        return row;
      }
      return ui.field(label, box, kind === 'textarea' || kind === 'line' ? 'span-all rf-line' : '');
    };

    // Pick-lists you can also type over (victim, gang, hair and eye colour).

    // ---- lists you add to: victims, offenders, charges, gangs, persons not arrested, personnel, vehicles
    function listEditor(key) {
      const L = F().LISTS[key];
      const box = h('div', { class: 'rf-items' });
      const draw = () => {
        box.replaceChildren(...(data[key].length ? data[key].map((it, i) => {
          const inputs = {};
          const fields = L.fields.map(([k, label, kind, opts]) => {
            let el;
            if (kind === 'select') {
              el = h('select', {}, opts.map((o) => h('option', { value: o, selected: o === (it[k] || '') }, o || '—')));
              el.addEventListener('change', () => { it[k] = el.value; save(); });
            } else if (kind === 'age') {
              // Worked out from the date of birth.
              el = h('input', { type: 'text', readonly: true, tabindex: -1, class: 'rf-auto', value: it[k] || '', title: 'From the date of birth' });
            } else {
              el = h('input', { type: kind === 'date' ? 'date' : kind === 'phone' ? 'tel' : 'text', autocomplete: 'off', value: it[k] || '' });
              if (kind === 'phone' && root.CVFormat) CVFormat.phone && el.addEventListener('blur', () => { el.value = CVFormat.phone(el.value); it[k] = el.value; save(); });
              el.addEventListener('input', () => { it[k] = el.value; save(); });
            }
            el.setAttribute('aria-label', `${L.item} ${i + 1} ${label}`);
            inputs[k] = el;
            let box = el;
            if (F().PICKS[kind]) box = CVCombo.attach(el, { items: () => pickItems(F().PICKS[kind]) });
            else if (kind === 'charge' || kind === 'chargeWide') {
              // Search the charges by statute or wording; picking fills both boxes.
              box = CVCombo.attach(el, { items: () => CHARGE_ITEMS.map((c) => ({ ...c, value: kind === 'charge' ? c.statute : c.desc })), onPick: (c) => {
                it.statute = c.statute; it.description = c.desc;
                if (inputs.statute) inputs.statute.value = c.statute;
                if (inputs.description) inputs.description.value = c.desc;
                save();
              } });
            }
            return ui.field(label, box, kind === 'wide' || kind === 'chargeWide' ? 'rf-wide' : '');
          });
          // Age follows the date of birth.
          if (inputs.dob && inputs.age) {
            const upd = () => { it.age = F().ageOn(inputs.dob.value, Vault.localDay()); inputs.age.value = it.age; save(); };
            inputs.dob.addEventListener('input', upd);
            inputs.dob.addEventListener('change', upd);
          }
          return h('div', { class: 'rf-item' },
            h('div', { class: 'rf-item-head' }, h('strong', {}, `${L.item} ${i + 1}`),
              archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: `Delete ${L.item.toLowerCase()}`, onclick: async () => {
                if (F().filled(it) && !(await ui.confirmDialog({ title: `Delete ${L.item} ${i + 1}?`, message: 'This entry is removed from the report.', confirmText: 'Delete', danger: true }))) return;
                data[key].splice(i, 1); draw(); save();
              } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Delete ${L.item} ${i + 1}`))),
            h('div', { class: 'rf-item-grid' }, fields));
        }) : [h('p', { class: 'muted small rf-none' }, `No ${L.title.toLowerCase()} yet.`)]));
      };
      draw();
      const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
        data[key].push(F().blankItem(key)); draw(); save();
        const last = box.lastElementChild && box.lastElementChild.querySelector('input, select');
        if (last) last.focus();
      } }, `Add ${L.item}`);
      return h('div', { class: `rf-list rf-list-${key}` }, h('h4', {}, L.title), box, archived ? null : h('div', { class: 'contact-add' }, add));
    }

    // ---- every part has an Include box on the left: untick it when the part doesn't apply; it's
    // then folded away and left out of the PDF and the report.
    function part(id, title, icon, ...body) {
      const on = !F().isHidden(data, id);
      const inner = h('div', { class: 'rf-body', hidden: !on }, ...body);
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${title}` });
      const sec = h('section', { class: `rf-section rf-${id}${on ? '' : ' rf-off'}` },
        h('div', { class: 'rf-head' }, h('label', { class: 'rf-include', title: 'Untick if this part doesn\'t apply' }, cb), h('h3', { icon }, title)),
        inner);
      cb.addEventListener('change', () => {
        data.hidden = data.hidden.filter((x) => x !== id);
        if (!cb.checked) data.hidden.push(id);
        inner.hidden = !cb.checked;
        sec.classList.toggle('rf-off', !cb.checked);
        save();
      });
      return sec;
    }

    const sections = F().SECTIONS.map((s) => part(s.id, s.title, s.icon,
      h('div', { class: s.id === 'report' ? 'rf-lines' : `rf-grid${s.id === 'update' ? ' rf-grid-4' : ''}` }, s.fields.map(([k, label, kind, opts]) => input(k, label, kind, opts))),
      ...(s.lists || []).map(listEditor)));

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
        // Photos: saved in the case's exhibit folder; click one to view it.
        const strip = h('div', { class: 'rf-photos' });
        const drawPhotos = () => {
          strip.replaceChildren(...e.photos.map((path, j) => {
            const tag = F().photoLabel(n, j);
            const img = h('img', { alt: `Exhibit ${tag}` });
            Vault.readFile(c.id, path).then((f) => { img.src = URL.createObjectURL(f); img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true }); }).catch(() => { img.alt = 'Photo not found'; });
            return h('div', { class: 'rf-photo' },
              h('span', { class: 'rf-photo-tag' }, tag),
              h('button', { 'data-ro-ok': 'true', class: 'rf-photo-open', type: 'button', title: 'View', onclick: () => ui.previewFile(c, path) }, img),
              archived ? null : h('button', { class: 'rf-photo-x', type: 'button', title: 'Take off this exhibit (the photo stays in the case files)', onclick: () => { e.photos.splice(j, 1); drawPhotos(); save(); } }, ui.icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove photo')));
          }));
        };
        drawPhotos();
        const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
        picker.addEventListener('change', async () => {
          const files = [...picker.files];
          picker.value = '';
          for (const f of files) {
            try {
              const path = await Save.track(`photo:${c.id}`, () => Vault.addFile(c.id, f, { folder: e.type === 'Narcotics' ? 'Drug Exhibits' : 'Other Exhibits', description: `Exhibit ${n} photo` }));
              e.photos.push(path);
            } catch { /* reported by Save */ }
          }
          drawPhotos();
          save(0);
        });
        const addPhoto = archived ? null : h('button', { class: 'btn small', type: 'button', icon: 'camera', onclick: () => picker.click() }, 'Add Photos');
        return h('div', { class: 'rf-exhibit-card' },
          h('div', { class: 'rf-exhibit-no', title: 'Given automatically; never reused' }, h('span', { class: 'small muted' }, 'Exhibit No.'), h('strong', { class: 'rf-exhibit' }, String(n))),
          h('div', { class: 'rf-exhibit-body' },
            h('div', { class: 'rf-exhibit-row' }, ui.field('Inventory Number', inv), ui.field('Type', type), narc),
            ui.field('Description', desc, 'span-all'),
            h('div', { class: 'rf-photo-row' }, strip, addPhoto, picker)),
          archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove exhibit', onclick: () => { data.evidence.splice(i, 1); drawEvidence(); save(); } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove exhibit ${n}`)));
      }) : [h('p', { class: 'muted small' }, 'No evidence yet.')]));
    };
    drawEvidence();
    const addExhibit = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: c.agencyNumber ? `Numbered on from the last exhibit of any case with agency case number ${c.agencyNumber}.` : 'Numbered on from the last exhibit of this case. Cases with the same agency case number share one sequence.', onclick: async () => {
      try {
        const n = F().nextExhibit(await numbersInUse(c, data));
        data.evidence.push({ number: n, inventory: '', type: '', drug: '', weight: '', description: '', photos: [] });
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
    // Exhibit photos as JPEG for the Exhibit Attachments pages (at most 1600 px, readable in print).
    async function photoJpegs() {
      const out = [];
      if (F().isHidden(data, 'evidence')) return out;
      for (const e of data.evidence) {
        for (const [j, path] of (e.photos || []).entries()) {
          try {
            const bmp = await createImageBitmap(await Vault.readFile(c.id, path));
            const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
            const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
            const g = cv.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
            g.drawImage(bmp, 0, 0, cv.width, cv.height);
            const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
            out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height, caption: F().exhibitLine(e).replace(/^Exhibit \S+?(?=[,:])/, `Exhibit ${F().photoLabel(e.number, j)}`) });
          } catch { /* a photo that can't be read is left out */ }
        }
      }
      return out;
    }
    const pdfBytes = async () => {
      const p = Vault.data.settings.affiant || {};
      return CVReportPdf.build(data, { agency: p.agency || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' \u00b7 '), printed: CVFormat.dateText(Vault.localDay()), photos: await photoJpegs() });
    };
    async function showPdf(bytes) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', { icon: 'printer' }, 'Supplementary Report'),
        h('p', { class: 'muted small' }, 'Use the printer button above the page to print, or the download button to save a PDF.'),
        h('iframe', { class: 'preview-frame', src: url, title: 'Supplementary Report' }),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      URL.revokeObjectURL(url);
    }
    const pdfName = () => `Supplementary Report ${CVFormat.dateText(Vault.localDay())}.pdf`;
    // Saving twice without changes in between (Save PDF, then Email for E-Sign) keeps one file.
    let lastPdf = null;
    async function savePdf() {
      save(0);
      await Save.flushAll();
      const sig = JSON.stringify(data);
      if (lastPdf && lastPdf.sig === sig) return lastPdf.path;
      const bytes = await pdfBytes();
      const file = new File([bytes], pdfName(), { type: 'application/pdf' });
      const path = await Save.track(`report-pdf:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Supplementary Report', description: pdfName().replace(/\.pdf$/, '') }));
      lastPdf = { sig, path, bytes };
      return path;
    }
    const printBtn = h('button', { 'data-ro-ok': 'true', class: 'btn', type: 'button', icon: 'printer', title: 'Opens the report. Print it, or save it as a PDF.', onclick: async () => {
      save(0);
      await Save.flushAll();
      await showPdf(await pdfBytes());
    } }, 'Print / PDF');
    const pdfCaseBtn = h('button', { class: 'btn', type: 'button', icon: 'file-earmark-pdf-fill', title: 'Saves the PDF in this case\'s Supplementary Report folder.', onclick: async () => {
      let path;
      try { path = await savePdf(); } catch { return; }
      toast(`Saved to the case files: ${path.split('/').pop()}`, 'success', 5000);
      await showPdf(lastPdf.bytes); // the saved report, to look at straight away
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
      ...sections.slice(0, -1),
      part('evidence', 'Evidence Inventoried', 'box-seam', evRows, archived ? null : h('div', { class: 'contact-add' }, addExhibit)),
      part('summary', 'Summary of Investigation', 'journal-text', fmt, rich.el, narrative),
      sections[sections.length - 1], // Submission and Approval comes last, as on the printed report
      archived ? null : h('div', { class: 'details-save' }, saveBtn.cloneNode(true)));
    // The copy at the bottom does the same as the one at the top.
    const bottom = panel.querySelector('.details-save .btn');
    if (bottom) bottom.addEventListener('click', () => saveBtn.click());
  }

  function init(kit) { ui = kit; }

  root.CVReportFieldsUI = { init, load, render, numbersInUse };
})(this);
