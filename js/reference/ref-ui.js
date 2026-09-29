/* CaseVault — the Reference screen (#/reference): narcotics street values, the value calculator
 * and the narcotic complaint forms; the DUI guide (SFST checklist and DUI flow chart); incident
 * location codes; commonly used UCR codes.
 *
 * What you fill in on the SFST checklist or the DUI flow chart stays in this window only. It is
 * written to the SSD only when you save it to a case (as a draft), and never to this computer.
 * The complaint PDFs are imported onto the SSD (CaseVault-Data\reference\complaints).
 */
'use strict';

(function (root) {
  let ui = null;
  const K = () => root.CVReference;
  const RD = () => root.CVRefData;

  const SECTIONS = [
    { key: 'narcotics', title: 'Narcotics', icon: 'capsule-pill', blurb: 'Street value chart, value calculator and narcotic complaint forms.' },
    { key: 'dui', title: 'DUI guide', icon: 'cone-striped', blurb: 'SFST checklist that adds up the clues, and the DUI flow chart.' },
    { key: 'incident', title: 'Incident location codes', icon: 'geo-alt', blurb: 'Location codes by place type. Click a code to copy it.' },
    { key: 'ucr', title: 'Commonly used UCR', icon: 'journal-text', blurb: 'UCR codes by category. Search by code or offense.' },
  ];

  // This window only (see the note at the top).
  const mem = { calc: { drug: 'Cocaine (Powder)', amount: '', unit: 'gram' }, sfst: {}, sfstHeader: null, dui: {}, duiHeader: null, complaintFilter: { q: '', drug: 'all', kind: 'all' } };
  const textCache = new Map();

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  async function copy(text, what = 'Copied') {
    try { await navigator.clipboard.writeText(text); ui.toast(what, 'success', 1800); } catch { ui.toast('Could not copy. Select the text and press Ctrl+C.', 'error'); }
  }

  /* ---------- the Overview's quick links ---------- */

  function quickLinks() {
    const { h } = ui;
    return h('div', { class: 'quick-links' }, SECTIONS.map((s) => h('a', { class: 'quick-link', href: `#/reference/${s.key}` },
      h('span', { class: `ql-icon ql-${s.key}` }, ui.icon(s.icon)),
      h('span', { class: 'ql-text' }, h('strong', {}, s.title), h('span', { class: 'small muted' }, s.blurb)),
      h('span', { class: 'ql-go' }, ui.icon('chevron-right')))));
  }

  /* ---------- page ---------- */

  async function render(main, section) {
    const { h } = ui;
    const sec = SECTIONS.find((s) => s.key === section) || null;
    const body = h('div', { class: 'ref-body' });
    main.replaceChildren(h('section', { class: 'reference' },
      h('div', { class: 'ref-head' },
        h('h1', { class: 'page-title', icon: 'book' }, sec ? sec.title : 'Reference'),
        h('p', { class: 'muted small' }, 'Quick reference only: always follow your department\'s policies. Have charging documents reviewed by your ASA or supervisor.')),
      h('nav', { class: 'ref-nav', 'aria-label': 'Reference sections' },
        h('a', { href: '#/reference', class: `ref-pill ${sec ? '' : 'active'}`, icon: 'collection' }, 'All'),
        SECTIONS.map((s) => h('a', { href: `#/reference/${s.key}`, class: `ref-pill ${sec && sec.key === s.key ? 'active' : ''}`, 'aria-current': sec && sec.key === s.key ? 'page' : null, icon: s.icon }, s.title))),
      body));
    if (!sec) return body.replaceChildren(quickLinks());
    if (sec.key === 'narcotics') return renderNarcotics(body);
    if (sec.key === 'dui') return renderDui(body);
    if (sec.key === 'incident') return body.replaceChildren(codeBrowser(RD().LOCATION_CODES, 'Search location codes', 'location code'));
    if (sec.key === 'ucr') return body.replaceChildren(codeBrowser(RD().UCR_CODES, 'Search UCR codes or offenses', 'UCR code'));
  }

  const card = (title, icon, ...kids) => ui.h('section', { class: 'ref-card' }, ui.h('h2', { class: 'ref-card-title', icon }, title), ...kids);

  /* ---------- narcotics ---------- */

  async function renderNarcotics(body) {
    const { h } = ui;
    const complaints = h('div', {}, h('p', { class: 'muted' }, 'Looking for complaint forms on the SSD…'));
    body.replaceChildren(
      h('div', { class: 'ref-grid' }, calculator(), card('Narcotic complaint forms', 'file-earmark-pdf-fill', complaints)),
      card(`Street value chart (${RD().NARCOTIC_SOURCE})`, 'table', valueChartEl()));
    await drawComplaints(complaints);
  }

  function calculator() {
    const { h } = ui;
    const c = mem.calc;
    const drug = h('select', { 'aria-label': 'Drug' }, RD().NARCOTIC_CATEGORIES.map((cat) => h('optgroup', { label: cat },
      Object.keys(RD().NARCOTIC_DATA).filter((k) => RD().NARCOTIC_DATA[k].cat === cat).map((k) => h('option', { value: k, selected: k === c.drug }, k)))));
    const amount = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: 'Amount', 'aria-label': 'Amount', value: c.amount });
    const unit = h('select', { 'aria-label': 'Unit' });
    const result = h('div', { class: 'calc-result', role: 'status', 'aria-live': 'polite' });
    const copyBtn = h('button', { class: 'btn', type: 'button', icon: 'copy', disabled: true }, 'Copy for a report');
    let line = '';
    const syncUnits = () => {
      const units = K().priceUnits(drug.value);
      unit.replaceChildren(...units.map((u) => h('option', { value: u, selected: u === c.unit }, K().unitLabel(u))));
      if (!units.includes(c.unit)) c.unit = units[0];
    };
    const calc = () => {
      Object.assign(c, { drug: drug.value, amount: amount.value, unit: unit.value });
      if (!amount.value) { result.className = 'calc-result'; result.textContent = 'Enter an amount.'; copyBtn.disabled = true; return; }
      const r = K().streetValue(drug.value, amount.value, unit.value);
      result.className = `calc-result ${r.ok ? 'is-value' : 'is-error'}`;
      result.textContent = r.ok ? r.text : r.error;
      line = r.ok ? r.line : '';
      copyBtn.disabled = !r.ok;
    };
    drug.addEventListener('change', () => { syncUnits(); calc(); });
    unit.addEventListener('change', calc);
    amount.addEventListener('input', calc);
    copyBtn.addEventListener('click', () => copy(line, 'Copied the value line.'));
    syncUnits();
    calc();
    return card('Value calculator', 'calculator-fill',
      h('div', { class: 'calc-form' }, ui.field('Drug', drug), ui.field('Amount', amount), ui.field('Unit', unit)),
      result,
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, `${RD().NARCOTIC_SOURCE} street values. ≈ marks an estimate (gram price × 454).`), h('div', { class: 'spacer' }), copyBtn));
  }

  function valueChartEl() {
    const { h } = ui;
    return h('div', { class: 'value-chart' }, K().valueChart().map((g) => h('div', { class: 'value-group' },
      h('h3', {}, g.category),
      h('div', { class: 'table-wrap' }, h('table', { class: 'value-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Drug'), g.units.map((u) => h('th', { class: 'num' }, `per ${u}`)))),
        h('tbody', {}, g.rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.drug),
          g.units.map((u) => {
            const cell = r.cells[u];
            if (!cell) return h('td', { class: 'num muted' }, '—');
            return h('td', { class: `num ${cell.verify ? 'verify' : ''}`, title: cell.estimate ? 'Estimate: the gram price × 454' : cell.verify ? 'This price needs verification' : null },
              cell.estimate ? '≈ ' : '', K().money(cell.price), cell.verify ? h('span', { class: 'pill warn-pill' }, 'verify') : null);
          })))))))));
  }

  const formPath = (f) => `complaints/${f.file}`;

  async function libraryIndex() {
    let files = [];
    try { files = await Vault.listReference('complaints'); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
    return { files, has: (form) => byName.get(form.file.split('/').pop().toLowerCase()) || null };
  }

  async function drawComplaints(box) {
    const { h } = ui;
    const lib = await libraryIndex();
    const all = K().complaintList();
    const onSsd = all.filter((f) => lib.has(f)).length;
    const f = mem.complaintFilter;
    const q = h('input', { type: 'search', placeholder: 'Search citation, drug or grams', 'aria-label': 'Search complaint forms', value: f.q });
    const drug = h('select', { 'aria-label': 'Drug' }, h('option', { value: 'all' }, 'All drugs'), RD().COMPLAINTS.groups.map((g) => h('option', { value: g.key, selected: f.drug === g.key }, g.drug)));
    const kind = h('select', { 'aria-label': 'Possession or delivery' }, [['all', 'Possession & delivery'], ['possession', 'Possession'], ['delivery', 'Manufacture / delivery']].map(([v, l]) => h('option', { value: v, selected: f.kind === v }, l)));
    const list = h('div', { class: 'complaint-groups' });
    const draw = () => {
      Object.assign(f, { q: q.value, drug: drug.value, kind: kind.value });
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const grams = K().gramsOf(q.value);
      const groups = RD().COMPLAINTS.groups.filter((g) => drug.value === 'all' || g.key === drug.value).map((g) => {
        const forms = all.filter((x) => x.drugKey === g.key && (kind.value === 'all' || x.kind === kind.value)
          && (grams != null ? x.grams && grams >= x.grams[0] && (x.grams[1] == null || grams < x.grams[1])
            : words.every((w) => `${x.cite} ${x.range} ${x.cls} ${g.drug} ${x.kind}`.toLowerCase().includes(w))));
        return { g, forms };
      }).filter((x) => x.forms.length);
      list.replaceChildren(...(groups.length ? groups.map(({ g, forms }) => h('div', { class: 'complaint-group' },
        h('h3', {}, g.drug, h('span', { class: 'muted small complaint-act' }, g.act)),
        g.notes.map((n) => h('p', { class: 'hint small', icon: 'info-circle' }, n)),
        h('ul', { class: 'complaint-list' }, forms.map((x) => complaintRow(x, lib.has(x), box))))) : [h('p', { class: 'muted' }, 'No forms match.')]));
    };
    [q, drug, kind].forEach((el) => el.addEventListener(el === q ? 'input' : 'change', draw));
    draw();

    const files = h('input', { type: 'file', accept: '.pdf,application/pdf', multiple: true, hidden: true });
    const folder = h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: true });
    const onPick = (input) => async () => { const picked = [...input.files]; input.value = ''; await importForms(picked); drawComplaints(box); };
    files.addEventListener('change', onPick(files));
    folder.addEventListener('change', onPick(folder));
    const other = RD().COMPLAINTS.other.map(([label, file]) => ({ label, form: all.find((x) => x.file === file) }));

    box.replaceChildren(
      h('p', { class: 'muted small' }, RD().COMPLAINTS.hint),
      h('div', { class: `library-status ${onSsd ? 'ok' : 'empty'}` },
        ui.icon(onSsd ? 'hdd-fill' : 'exclamation-circle'),
        h('span', {}, onSsd ? `${onSsd} of ${all.length} forms are on the SSD.` : 'The complaint PDFs are not on the SSD yet. Import them once from the LE Cyber-Docs folder (assets\\complaints).'),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn small', type: 'button', icon: 'folder2-open', onclick: () => folder.click() }, 'Import a folder…'),
        h('button', { class: 'btn small', type: 'button', icon: 'upload', onclick: () => files.click() }, 'Import PDFs…'),
        files, folder),
      h('div', { class: 'ref-filters' }, h('div', { class: 'search-wrap' }, ui.icon('search'), q), drug, kind),
      list,
      h('div', { class: 'row complaint-other' }, h('span', { class: 'muted small' }, 'Blank forms:'),
        other.map(({ label, form }) => complaintButtons(form, lib.has(form), label, box))));
  }

  function complaintRow(x, file, box) {
    const { h } = ui;
    return h('li', { class: `complaint-row ${file ? '' : 'missing'}` },
      h('span', { class: `complaint-kind pill ${x.kind}` }, x.kind === 'possession' ? 'Possession' : 'Delivery'),
      h('span', { class: 'complaint-main' },
        h('span', { class: 'complaint-cite mono' }, x.cite),
        h('span', { class: 'complaint-meta small' }, h('strong', {}, x.range), ' · ', x.cls)),
      complaintButtons(x, file, null, box));
  }

  function complaintButtons(x, file, label, box) {
    const { h } = ui;
    if (!file) return h('span', { class: 'complaint-actions' }, label ? h('span', { class: 'small muted' }, `${label} (not imported)`) : h('span', { class: 'small muted', title: 'Import the complaint PDFs to open and use this form' }, 'Not on the SSD'));
    return h('span', { class: 'complaint-actions' },
      label ? h('span', { class: 'small' }, label) : null,
      h('button', { class: 'btn small ghost', type: 'button', icon: 'eye', title: 'Open the form', onclick: () => openForm(file.path, x.name) }, 'Open'),
      h('button', { class: 'btn small ghost', type: 'button', icon: 'pencil-square', title: 'Start a draft in a case from this form (Draft with AI can then fill it in)', onclick: () => useInCase(x, file.path) }, 'Use in a case…'));
  }

  async function importForms(picked) {
    const pdfs = picked.filter((f) => /\.pdf$/i.test(f.name));
    if (!pdfs.length) return ui.toast('No PDF files there.', 'error');
    const note = ui.toast(`Copying ${pdfs.length} form${pdfs.length === 1 ? '' : 's'} to the SSD…`, 'info', 600000);
    let n = 0;
    try {
      for (const f of pdfs) {
        const form = K().complaintByFileName(f.name);
        const path = form ? formPath(form) : `complaints/other/${f.name}`;
        await ui.Save.track('reference', () => Vault.saveReferenceFile(path, f));
        textCache.delete(path);
        n++;
      }
      ui.toast(`${n} complaint form${n === 1 ? '' : 's'} saved in CaseVault-Data\\reference\\complaints.`, 'success', 6000);
    } catch { /* reported by Save */ } finally { note.remove(); }
  }

  async function openForm(path, title) {
    const file = await Vault.readReferenceFile(path);
    if (!file) return ui.toast('That form is no longer on the SSD.', 'error');
    const url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: 'application/pdf' }));
    await ui.openDialog((close) => ui.h('div', { class: 'preview' },
      ui.h('div', { class: 'preview-head' }, ui.h('h2', {}, title), ui.h('div', { class: 'spacer' }), ui.h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
      ui.h('iframe', { class: 'preview-frame', src: url, title })));
    URL.revokeObjectURL(url);
  }

  /** The form's text (read once per window), for drafts and Draft with AI. */
  async function complaintText(path) {
    const file = await Vault.readReferenceFile(path);
    if (!file) return '';
    const key = `${path}|${file.size}|${file.lastModified}`;
    if (!textCache.has(key)) {
      const out = await CVExtract.extract(file, file.name);
      textCache.set(key, (out.paragraphs || []).map((p) => p.text).join('\n\n'));
    }
    return textCache.get(key);
  }

  /** Imported complaint forms, for the Draft with AI dialog: [{ path, name, form }]. */
  async function importedComplaints() {
    const lib = await libraryIndex();
    const known = K().complaintList().map((form) => ({ form, file: lib.has(form) })).filter((x) => x.file).map(({ form, file }) => ({ path: file.path, name: form.name, form }));
    const extra = lib.files.filter((f) => !K().complaintByFileName(f.name)).map((f) => ({ path: f.path, name: f.name.replace(/\.pdf$/i, ''), form: null }));
    return [...known, ...extra];
  }

  async function useInCase(form, path) {
    const c = await pickCase(`Use "${form.name}"`, 'A new draft is made in the case with the form\'s text. Open it and use Draft with AI to fill it in from the case: the form is chosen as the reference.');
    if (!c) return;
    let text = '';
    try { text = await complaintText(path); } catch (err) { ui.toast(`Could not read the form: ${err.message}`, 'error'); }
    const title = `Complaint: ${form.name}`;
    const body = `# ${title}\n\n> Started from the complaint form in CaseVault-Data\\reference\\${path.replace(/\//g, '\\')}. Draft with AI can fill it in from the case; check every fact and [CONFIRM: …].\n\n${text || '[CONFIRM: form text could not be read; open the form in Reference → Narcotics]'}\n`;
    await saveDraftTo(c, title, body, { type: 'complaint', reference: path });
  }

  /* ---------- saving to a case ---------- */

  async function pickCase(title, message) {
    const { h } = ui;
    const cases = (Vault.data.cases || []).filter((c) => c.status !== 'Archived').sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    if (!cases.length) { ui.toast('Create a case first.', 'error'); return null; }
    const current = ui.state.lastCaseId && cases.find((c) => c.id === ui.state.lastCaseId);
    const sel = h('select', { 'aria-label': 'Case' }, cases.map((c) => h('option', { value: c.id, selected: current ? c.id === current.id : false }, `${c.title || 'Untitled case'}${c.number ? ` · ${c.number}` : ''}`)));
    const id = await ui.openDialog((close) => h('form', { class: 'pick-case', onsubmit: (e) => { e.preventDefault(); close(sel.value); } },
      h('h2', { icon: 'folder2-open' }, title),
      message ? h('p', { class: 'muted small' }, message) : null,
      ui.field('Case', sel),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Continue'))));
    return id ? cases.find((c) => c.id === id) : null;
  }

  async function saveDraftTo(c, title, body, extraMeta = {}) {
    try {
      const slug = await Vault.newDraftSlug(c.id, title);
      await ui.Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, { title, type: 'other', ai: false, created: new Date().toISOString(), ...extraMeta }, body));
      ui.toast(`Saved to ${c.title || c.id} as the draft "${title}".`, 'success', 5000);
      ui.go(c.id, 'drafts', slug);
    } catch { /* reported by Save */ }
  }

  /* ---------- DUI guide ---------- */

  function headerFields(key) {
    const { h } = ui;
    const a = (Vault.data && Vault.data.settings.affiant) || {};
    mem[key] = mem[key] || { officer: a.name || '', star: '', date: today(), caseNo: '' };
    const st = mem[key];
    const inp = (k, label, attrs = {}) => { const el = h('input', { value: st[k] || '', ...attrs }); el.addEventListener('input', () => { st[k] = el.value; }); return ui.field(label, el); };
    return h('fieldset', { class: 'report-details' }, h('legend', {}, 'Report details'),
      h('div', { class: 'report-grid' }, inp('officer', 'Officer'), inp('star', 'Star #', { inputmode: 'numeric' }), inp('date', 'Date', { type: 'date' }), inp('caseNo', 'RD / Case #')));
  }

  function actionsBar(kind) {
    const { h } = ui;
    const md = () => (kind === 'sfst' ? K().sfstMarkdown(mem.sfst, mem.sfstHeader || {}) : K().duiMarkdown(mem.dui, mem.duiHeader || {}));
    const name = kind === 'sfst' ? 'SFST' : 'DUI flow chart';
    return h('div', { class: 'ref-actions' },
      h('button', { class: 'btn', type: 'button', icon: 'copy', onclick: () => copy(md(), `Copied the ${name} as text.`) }, 'Copy as text'),
      h('button', { class: 'btn primary', type: 'button', icon: 'save', onclick: async () => {
        const c = await pickCase(`Save the ${name} to a case`, 'Saved as a draft in the case (on the SSD), where you can edit and export it.');
        if (c) saveDraftTo(c, `${name} ${(mem[`${kind}Header`] || {}).date || today()}`, md());
      } }, 'Save to a case…'),
      h('button', { class: 'btn ghost', type: 'button', icon: 'arrow-counterclockwise', onclick: async () => {
        if (!(await ui.confirmDialog({ title: `Clear the ${name}?`, message: 'Everything filled in on this page is cleared.', confirmText: 'Clear' }))) return;
        if (kind === 'sfst') { mem.sfst = {}; mem.sfstHeader = null; } else { mem.dui = {}; mem.duiHeader = null; }
        location.hash = '#/reference/dui'; ui.refresh();
      } }, 'Clear'));
  }

  function renderDui(body) {
    const { h } = ui;
    const which = h('div', { class: 'segmented ref-seg', role: 'tablist' });
    const panel = h('div', {});
    const show = (k) => {
      mem.duiTab = k;
      which.replaceChildren(
        h('button', { class: `btn ${k === 'sfst' ? 'active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(k === 'sfst'), icon: 'clipboard2-check', onclick: () => show('sfst') }, 'SFST checklist'),
        h('button', { class: `btn ${k === 'flow' ? 'active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(k === 'flow'), icon: 'diagram-3-fill', onclick: () => show('flow') }, 'DUI flow chart'));
      panel.replaceChildren(k === 'sfst' ? sfstEl() : flowEl());
    };
    body.replaceChildren(which, panel);
    show(mem.duiTab || 'sfst');
  }

  function sfstEl() {
    const { h } = ui;
    const st = mem.sfst;
    const scoreEls = {};
    const redraw = () => {
      for (const s of K().sfstScores(st)) {
        const el = scoreEls[s.key];
        el.className = `sfst-score ${s.cantPerform ? 'over' : s.over ? 'over' : 'under'}`;
        el.replaceChildren(h('span', { class: 'sfst-num' }, `${s.clues}/${s.max}`), h('span', {}, h('strong', {}, s.cantPerform ? 'Could not perform' : s.over ? 'At or above the decision point' : 'Below the decision point'), h('span', { class: 'small block muted' }, `Decision point ${s.decision} of ${s.max} clues`)));
      }
    };
    const check = (obj, key, label, cls = '') => {
      const box = h('input', { type: 'checkbox', checked: !!obj[key] });
      box.addEventListener('change', () => { obj[key] = box.checked; redraw(); });
      return h('label', { class: `check-row ${cls}` }, box, h('span', {}, label));
    };
    const phases = RD().SFST.map((t, idx) => {
      const ts = st[t.key] = st[t.key] || { clues: {}, steps: {} };
      scoreEls[t.key] = h('div', { class: 'sfst-score' });
      const stages = t.stages.map((sg, si) => h('div', { class: 'sfst-stage' }, h('h4', {}, sg.title),
        sg.sided
          ? h('table', { class: 'sided' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Left'), h('th', {}, 'Right'))),
            h('tbody', {}, sg.steps.map((step, i) => h('tr', {}, h('th', { scope: 'row' }, step), ['left', 'right'].map((side) => h('td', {}, sideBox(ts.steps, `${si}-${i}-${side}`, `${step}, ${side}`, redraw)))))))
          : sg.steps.map((step, i) => check(ts.steps, `${si}-${i}`, step))));
      const clues = t.sidedClues
        ? h('table', { class: 'sided' }, h('thead', {}, h('tr', {}, h('th', {}, 'Clue'), h('th', {}, 'Left'), h('th', {}, 'Right'))),
          h('tbody', {}, t.clues.map((clue, i) => h('tr', {}, h('th', { scope: 'row' }, clue), ['left', 'right'].map((side) => h('td', {}, sideBox(ts.clues, `${i}-${side}`, `${clue}, ${side} eye`, redraw)))))))
        : h('div', {}, t.clues.map((clue, i) => check(ts.clues, i, clue)));
      let extra = null;
      if (t.extra) {
        extra = h('div', { class: 'row' }, h('span', {}, t.extra.label), t.extra.options.map((o) => {
          const r = h('input', { type: 'radio', name: `sfst-${t.key}-extra`, value: o, checked: ts.extra === o });
          r.addEventListener('change', () => { ts.extra = o; });
          return h('label', { class: 'check-row' }, r, h('span', {}, o));
        }));
      }
      return h('details', { class: 'sfst-phase', open: idx === 0 },
        h('summary', {}, h('span', { class: 'phase-num' }, String(idx + 1)), h('span', { class: 'phase-title' }, t.title), scoreEls[t.key]),
        h('div', { class: 'sfst-body' }, stages, h('h4', {}, 'Clues'), clues, extra, t.cantPerform ? check(ts, 'cantPerform', t.cantPerform, 'warn-text') : null));
    });
    const alt = st.alternate = st.alternate || {};
    const altEl = h('details', { class: 'sfst-phase' },
      h('summary', {}, h('span', { class: 'phase-num' }, '4'), h('span', { class: 'phase-title' }, 'Phase IV: Alternate tests')),
      h('div', { class: 'sfst-body' },
        RD().SFST_ALTERNATE.map((a) => h('div', { class: 'row alt-row' }, h('span', { class: 'alt-name' }, a), ['Pass', 'Fail', 'Not given'].map((o) => {
          const r = h('input', { type: 'radio', name: `alt-${a}`, value: o, checked: alt[a] === o });
          r.addEventListener('change', () => { alt[a] = o === 'Not given' ? '' : o; });
          return h('label', { class: 'check-row' }, r, h('span', {}, o));
        }))),
        (() => { const pbt = h('input', { value: st.pbt || '', placeholder: 'e.g. 0.112' }); pbt.addEventListener('input', () => { st.pbt = pbt.value; }); return ui.field('PBT result', pbt); })()));
    redraw();
    return h('div', { class: 'ref-card sfst' },
      h('h2', { class: 'ref-card-title', icon: 'clipboard2-check' }, 'Standardized Field Sobriety Test'),
      h('p', { class: 'muted small' }, 'Tick the clues you observe; the score for each test is added up for you. Nothing here is saved until you choose Save to a case.'),
      headerFields('sfstHeader'), phases, altEl, actionsBar('sfst'));
  }

  function sideBox(obj, key, label, redraw) {
    const box = ui.h('input', { type: 'checkbox', checked: !!obj[key], 'aria-label': label });
    box.addEventListener('change', () => { obj[key] = box.checked; redraw(); });
    return box;
  }

  function flowEl() {
    const { h } = ui;
    const st = mem.dui;
    const wrap = h('ol', { class: 'flow' });
    const draw = () => {
      const path = K().duiPath(st);
      const nodes = [];
      for (const p of RD().DUI_FLOW) {
        const on = path.includes(p.key);
        const current = path[path.length - 1] === p.key;
        const fields = (p.fields || []).map((f) => flowField(f, st, draw));
        const checks = (p.checklist || []).map((c, i) => {
          const box = h('input', { type: 'checkbox', checked: !!st[`${p.key}-check-${i}`] });
          box.addEventListener('change', () => { st[`${p.key}-check-${i}`] = box.checked; });
          return h('label', { class: 'check-row' }, box, h('span', {}, c));
        });
        nodes.push(h('li', { class: `flow-node ${on ? 'on' : 'off'} ${current ? 'current' : ''}` },
          h('div', { class: 'flow-dot' }, ui.icon(on ? (current ? 'arrow-repeat' : 'check2') : 'three-dots')),
          h('div', { class: 'flow-card' },
            h('h3', {}, p.title), h('p', { class: 'muted small' }, p.lead),
            on ? h('div', { class: 'flow-fields' }, fields) : h('p', { class: 'small muted' }, 'Skipped on this path.'),
            on && checks.length ? h('div', { class: 'flow-checks' }, checks) : null)));
        const endKey = path.find((k) => RD().DUI_ENDS[k]);
        if (endKey && p.key === 'p3') nodes.push(h('li', { class: 'flow-node on end' }, h('div', { class: 'flow-dot' }, ui.icon('flag')), h('div', { class: 'flow-card' }, h('strong', {}, RD().DUI_ENDS[endKey]))));
      }
      wrap.replaceChildren(...nodes);
    };
    draw();
    return h('div', { class: 'ref-card' },
      h('h2', { class: 'ref-card-title', icon: 'diagram-3-fill' }, 'DUI flow chart'),
      h('p', { class: 'muted small' }, 'Work down the phases. Your answers choose the path (for example, no probable cause ends the stop at Phase III). Now fills in the current time.'),
      headerFields('duiHeader'), wrap, actionsBar('dui'));
  }

  function flowField(f, st, redraw) {
    const { h } = ui;
    if (f.type === 'choice') {
      return h('div', { class: 'field' }, h('span', {}, f.label), h('div', { class: 'segmented choice' }, f.options.map((o) => h('button', {
        class: `btn small ${st[f.key] === o ? 'active' : ''}`, type: 'button', 'aria-pressed': String(st[f.key] === o),
        onclick: () => { st[f.key] = st[f.key] === o ? '' : o; redraw(); },
      }, o, f.next && f.next[o] && RD().DUI_ENDS[f.next[o]] ? h('span', { class: 'small muted' }, ' (end)') : null))));
    }
    let input;
    if (f.type === 'select') input = h('select', {}, f.options.map((o) => h('option', { value: o, selected: st[f.key] === o }, o || '—')));
    else input = h('input', { type: 'text', value: st[f.key] || '', placeholder: f.type === 'time' ? 'hh:mm' : '' });
    input.addEventListener(f.type === 'select' ? 'change' : 'input', () => { st[f.key] = input.value; });
    if (f.type !== 'time') return ui.field(f.label, input);
    return ui.field(f.label, h('div', { class: 'input-group' }, input, h('button', { class: 'btn small', type: 'button', icon: 'clock-history', title: 'Fill in the current time', onclick: () => { input.value = nowTime(); st[f.key] = input.value; } }, 'Now')));
  }

  /* ---------- code lists ---------- */

  function codeBrowser(list, placeholder, what) {
    const { h } = ui;
    const q = h('input', { type: 'search', placeholder, 'aria-label': placeholder });
    const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: 'all' }, 'All categories'), list.map((g) => h('option', { value: g.key }, `${g.title} (${g.codes.length})`)));
    const out = h('div', { class: 'code-groups' });
    const draw = () => {
      const groups = K().searchCodes(list, q.value, cat.value);
      out.replaceChildren(...(groups.length ? groups.map((g) => h('section', { class: 'code-group' }, h('h3', {}, g.title),
        h('ul', { class: 'code-grid' }, g.codes.map(([code, desc]) => h('li', {}, h('button', { class: 'code-card', type: 'button', title: `Copy ${code}`, onclick: () => copy(code, `Copied ${what} ${code}.`) },
          h('span', { class: 'code-card-code' }, code), h('span', { class: 'code-card-desc' }, desc), h('span', { class: 'code-card-copy' }, ui.icon('copy')))))))) : [h('p', { class: 'muted' }, 'No codes match.')]));
    };
    q.addEventListener('input', draw);
    cat.addEventListener('change', draw);
    draw();
    return h('div', { class: 'ref-card' },
      h('div', { class: 'ref-filters' }, h('div', { class: 'search-wrap' }, ui.icon('search'), q), cat),
      h('p', { class: 'muted small' }, 'Click a code to copy it.'),
      out);
  }

  function init(kit) { ui = kit; }

  root.CVReferenceUI = { init, render, quickLinks, complaintText, importedComplaints, SECTIONS };
})(this);
