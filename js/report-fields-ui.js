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

  async function photoJpegs(c, data) {
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
          out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height, caption: `${F().exhibitLine(e).replace(/^Exhibit \S+?(?=[,:])/, `Exhibit ${F().photoLabel(e.number, j)}`)}${String((e.photoLabels || [])[j] || '').trim() ? ` - Photo: ${String(e.photoLabels[j]).trim()}` : ''}` });
        } catch { /* a photo that can't be read is left out */ }
      }
    }
    return out;
  }

  /* ---- One report, one PDF (v1.32): the Draft tab keeps a linked "Supplementary Report" under
   * Reports, and the PDF saved from either place is the same file, made from the form. ---- */
  const LINKED = 'supplementary-report';
  const PDF_NAME = 'Supplementary Report.pdf';
  const BASE_TITLE = 'Supplementary Report';
  // v1.33: each draft sent from the Draft tab is its own report: "Supplementary Report", then
  // (after Clear All) "Supplementary Report 2", and so on.
  const titleOf = (slug) => { const m = /^supplementary-report-(\d+)$/.exec(slug || ''); return m ? `${BASE_TITLE} ${m[1]}` : BASE_TITLE; };
  // (Spacing and table marks don't count: the Formatted view may lay a table out again.)
  const sigOf = (text) => { const t = String(text || '').replace(/[\s|:\-]+/g, ''); let n = 5381; for (let i = 0; i < t.length; i++) n = ((n * 33) ^ t.charCodeAt(i)) >>> 0; return `${t.length}:${n.toString(36)}`; };

  /** The form as the PDF's bytes (with the exhibit photos). */
  async function pdfFor(c, data) {
    const d = data || await load(c);
    const p = Vault.data.settings.affiant || {};
    return CVReportPdf.build(d, { agency: p.agency || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' · '), printed: '', photos: await photoJpegs(c, d) });
  }

  /** Saves the PDF in the case's Supplementary Report folder, in place of the one saved before. */
  async function savePdfToCase(c, data, bytes, title = BASE_TITLE) {
    const b = bytes || await pdfFor(c, data);
    const file = new File([b], `${title}.pdf`, { type: 'application/pdf' });
    const path = await ui.Save.track(`report-pdf:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Supplementary Report', description: title, replace: true }));
    return { path, bytes: b };
  }

  /** The linked report under Reports: { slug, edited } (edited: its text was changed in Reports). */
  async function linkedReport(c, slug = LINKED) {
    const d = await Vault.readDraft(c.id, slug).catch(() => null);
    if (!d || !d.meta.fromFields) return null;
    return { slug, edited: sigOf(d.body) !== d.meta.fieldsSig, meta: d.meta, body: d.body };
  }

  /** The report the form on the Draft tab goes to now ('' before it's first sent). */
  async function sentSlugOf(c, data) {
    const d = data || await load(c);
    if (typeof d.sentSlug === 'string') return d.sentSlug; // '' after Clear All: the next send makes a new report
    return (await linkedReport(c, LINKED)) ? LINKED : ''; // sent with v1.32
  }

  /** Writes the form into the linked report (made the first time). An edited one is replaced only
   * when force is set. -> { slug, kept } */
  async function syncLinked(c, data, { force = false, slug = LINKED } = {}) {
    const cur = await linkedReport(c, slug);
    if (cur && cur.edited && !force) return { slug, kept: true };
    const title = titleOf(slug);
    const body = F().toMarkdown(data, title);
    const meta = { ...(cur ? cur.meta : { created: new Date().toISOString() }), title, type: 'supplemental', ai: false, fromFields: true, fieldsSig: sigOf(body) };
    await ui.Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, meta, body));
    return { slug, kept: false };
  }

  const formFile = (slug) => `report-fields-${slug}.json`;
  const hasEntries = (d) => {
    const x = F().normalize(d);
    return F().FIELDS.some(([k, , kind]) => k !== 'caseNumber' && (kind === 'check' ? !!x[k] : String(x[k] || '').trim()))
      || Object.keys(F().LISTS).some((k) => x[k].some(F().filled)) || x.evidence.length > 0 || !!String(x.narrative || '').trim();
  };
  /** Send Back to Draft (v1.39): the report's form goes back on the Draft tab. Asks first when the
   * Draft tab holds a different report. -> true when done. */
  async function sendBack(c, slug) {
    const cur = await load(c);
    let snap = null;
    try { snap = await Vault.readCaseJSON(c.id, formFile(slug)); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    if (!snap && cur.sentSlug !== slug) {
      ui.toast(`${titleOf(slug)} was sent before this version kept its form, so it can't go back to the Draft tab. Edit the form there and send it again.`, 'error', 9000);
      return false;
    }
    if (snap && cur.sentSlug !== slug && hasEntries(cur)) {
      const other = cur.sentSlug ? `${titleOf(cur.sentSlug)} (as last sent, plus any changes since)` : 'a draft that hasn\'t been sent';
      if (!(await ui.confirmDialog({ title: `Send ${titleOf(slug)} back to the Draft tab?`, message: `The Draft tab now holds ${other}. It's replaced by ${titleOf(slug)}'s form. What was sent stays under Reports and Files.`, confirmText: 'Send Back' }))) return false;
    }
    const next = snap ? F().normalize(snap) : cur;
    next.sentSlug = slug;
    await ui.Save.track(`report-fields:${c.id}`, () => Vault.writeCaseJSON(c.id, FILE, next));
    ui.toast(`${titleOf(slug)} is back on the Draft tab. Send Draft to Reports updates the report when you're done.`, 'success', 6000);
    return true;
  }

  /** The PDF of a report sent from the Draft tab (v1.40), laid out like the Draft tab's Print/PDF:
   * from the form as it was sent, else the form now when it still goes to this report. null when
   * neither is there (sent before v1.39) or its text was changed under Reports. */
  async function sentPdf(c, slug) {
    const cur = await linkedReport(c, slug);
    if (!cur || cur.edited) return null;
    let snap = null;
    try { snap = await Vault.readCaseJSON(c.id, formFile(slug)); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    if (snap) return pdfFor(c, F().normalize(snap));
    const now = await load(c);
    return (await sentSlugOf(c, now)) === slug ? pdfFor(c, now) : null;
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
    const RD = root.CVRefData || { UCR_CODES: [], LOCATION_CODES: [], CHARGES: [], NARCOTIC_DATA: {} };
    const UCR_ITEMS = RD.UCR_CODES.flatMap((g) => g.codes.map(([code, desc]) => ({ value: `${code} ${desc}`, label: `${code} ${desc}`, hint: g.title, group: g.title, code, desc })));
    const LOC_ITEMS = RD.LOCATION_CODES.flatMap((g) => g.codes.map(([code, desc]) => ({ value: code, label: `${code} ${desc}`, hint: g.title, desc })));
    const CHARGE_ITEMS = (RD.CHARGES || []).flatMap((g) => g.codes.map(([statute, desc]) => ({ value: statute, label: `${statute} ${desc}`, hint: g.title, statute, desc })));
    const pickItems = (list) => list.map((v) => ({ value: v, label: v }));
    // Narcotic types: the calculator's list (it has prices), then the evidence types not in it.
    const NARCOTIC_ITEMS = [...Object.keys(RD.NARCOTIC_DATA || {}).map((k) => ({ value: k, label: k, hint: RD.NARCOTIC_DATA[k].cat })),
      ...F().DRUG_TYPES.filter((d) => !(RD.NARCOTIC_DATA || {})[d]).map((d) => ({ value: d, label: d }))];
    const moneyText = (v) => {
      const n = parseFloat(String(v || '').replace(/[$,\s]/g, ''));
      return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(v || '').trim();
    };
    const els = {}; // the Report Fields inputs by key, for fields filled from a pick
    const input = (key, label, kind, opts) => {
      if (kind === 'list') { const el = listEditor(key); el.classList.add('span-all'); return el; }
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
        el = h('input', { type: kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text', min: kind === 'number' ? 0 : null, autocomplete: 'off', value: data[key] || '',
          placeholder: key === 'buyFunds' ? '$100.00 prerecorded 1505 funds in the form of:' : null });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      }
      els[key] = el;
      const setField = (k, v) => { data[k] = v; if (els[k]) els[k].value = v; };
      // The input keeps its own listeners; a searchable list wraps it (box), not replaces it.
      let box = el;
      if (kind === 'ucr') {
        // From Common UCR; an empty Offense Classification takes the UCR group (Narcotics…).
        // v1.39: picking an IUCR code puts its description in Offense Classification (for 2170:
        // "Delv: Synthetic Drugs"); so does typing a code that's in the list.
        const fillOffense = (it) => { if (key === 'ucr' && it) { setField('offense', it.desc); save(); } };
        box = CVCombo.attach(el, { items: () => UCR_ITEMS, onPick: (it) => { fillOffense(it); save(); } });
        el.addEventListener('change', () => {
          const v = el.value.trim().toLowerCase();
          fillOffense(UCR_ITEMS.find((it) => it.value.toLowerCase() === v || it.code.toLowerCase() === v));
        });
      } else if (kind === 'location') {
        // From Location Codes; Type of Location fills in from the code picked.
        box = CVCombo.attach(el, { items: () => LOC_ITEMS, onPick: (it) => { setField('locationType', it.desc); save(); } });
      }
      // Officer's Report lines get their own tick box, for when one doesn't apply (v1.22; every line since v1.34).
      if (F().OPTIONAL_LINES.includes(key)) {
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
      return ui.field(label, box, kind === 'textarea' || kind === 'line' ? 'span-all rf-line' : opts === 'span' ? 'span-all' : '');
    };

    // Pick-lists you can also type over (victim, gang, hair and eye colour).

    // ---- lists you add to: victims, offenders, charges, gangs, persons not arrested, personnel, vehicles
    function listEditor(key) {
      const L = F().LISTS[key];
      const box = h('div', { class: 'rf-items' });
      const draw = () => {
        box.replaceChildren(...(data[key].length ? data[key].map((it, i) => {
          const inputs = {};
          const unknown = key === 'offendersList' && !!it.unknown;
          const lab = `${L.item} ${i + 1}`;
          const stateVictim = F().isStateVictim(key, it);
          const fields = F().fieldsFor(key, it).map(([k, label, kind, opts]) => {
            let el;
            // v1.39: an offender's phone numbers (Add Another Phone) and monikers with their app.
            if (kind === 'phones' || kind === 'socials') {
              if (!Array.isArray(it[k])) it[k] = [];
              if (kind === 'phones' && !it[k].length) it[k].push('');
              const holder = h('div', { class: 'rf-multi' });
              const drawMulti = (focusLast) => {
                holder.replaceChildren(...it[k].map((v, j) => {
                  let parts;
                  if (kind === 'phones') {
                    const inp = h('input', { type: 'tel', autocomplete: 'off', value: v || '', 'aria-label': `${lab} phone number ${j + 1}` });
                    inp.addEventListener('input', () => { it[k][j] = inp.value; save(); });
                    parts = [inp];
                  } else {
                    const nm = h('input', { type: 'text', autocomplete: 'off', value: (v && v.name) || '', placeholder: 'Moniker / Username', 'aria-label': `${lab} moniker ${j + 1}` });
                    nm.addEventListener('input', () => { it[k][j] = { ...it[k][j], name: nm.value }; save(); });
                    const app = h('select', { 'aria-label': `${lab} moniker ${j + 1} app` }, F().SOCIAL_APPS.map((o) => h('option', { value: o, selected: o === ((v && v.app) || '') }, o || 'App or Street Name')));
                    app.addEventListener('change', () => { it[k][j] = { ...it[k][j], app: app.value }; save(); });
                    parts = [nm, app];
                  }
                  return h('div', { class: `rf-multi-row rf-multi-${kind}` }, ...parts,
                    archived ? '' : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove', onclick: () => { it[k].splice(j, 1); drawMulti(); save(); } }, ui.icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove')));
                }), archived ? '' : h('button', { class: 'btn small rf-multi-add', type: 'button', onclick: () => {
                  it[k].push(kind === 'phones' ? '' : { name: '', app: '' }); drawMulti(true); save();
                } }, kind === 'phones' ? (it[k].length ? 'Add Another Phone' : 'Add Phone Number') : 'Add Moniker / Social Media'));
                if (focusLast) { const ins = holder.querySelectorAll('.rf-multi-row input'); if (ins.length) ins[ins.length - 1].focus(); }
              };
              drawMulti();
              inputs[k] = holder;
              return ui.field(label, holder, 'rf-wide');
            }
            // Height in feet and inches, weight in pounds; for an unknown offender, from–to (v1.25).
            if (kind === 'height' || kind === 'weight' || (kind === 'age' && unknown)) {
              const range = unknown;
              const parts = kind === 'height' ? F().heightParts(it[k]) : F().numParts(it[k]);
              const vals = [parts[0] || null, range ? parts[1] || null : null];
              const store = () => {
                const txt = vals.map((v) => (kind === 'height' ? (v ? F().heightOf(v.ft, v.in) : '') : (v || ''))).filter(Boolean);
                it[k] = range ? txt.join(' - ') : (txt[0] || '');
                save();
              };
              const one = (n) => {
                const sub = range ? (n ? ' to' : ' from') : '';
                if (kind === 'height') {
                  const v = vals[n] || {};
                  const ft = h('input', { type: 'number', min: 3, max: 8, inputmode: 'numeric', class: 'rf-num', value: v.ft == null ? '' : v.ft, 'aria-label': `${lab} ${label}${sub} feet` });
                  const inch = h('input', { type: 'number', min: 0, max: 11, inputmode: 'numeric', class: 'rf-num', value: v.ft == null ? '' : v.in, 'aria-label': `${lab} ${label}${sub} inches` });
                  const upd = () => { vals[n] = ft.value === '' ? null : { ft: Number(ft.value), in: Math.min(11, Number(inch.value || 0)) }; store(); };
                  ft.addEventListener('input', upd); inch.addEventListener('input', upd);
                  return [ft, h('span', { class: 'rf-unit' }, 'ft'), inch, h('span', { class: 'rf-unit' }, 'in')];
                }
                const num = h('input', { type: 'number', min: 0, inputmode: 'decimal', class: 'rf-num', value: vals[n] || '', 'aria-label': `${lab} ${label}${sub}` });
                num.addEventListener('input', () => { vals[n] = num.value; store(); });
                return kind === 'weight' ? [num, h('span', { class: 'rf-unit' }, 'lbs')] : [num];
              };
              el = h('span', { class: `rf-measure${range ? ' rf-range' : ''}` }, ...one(0), ...(range ? [h('span', { class: 'rf-unit' }, 'to'), ...one(1)] : []));
              inputs[k] = el;
              return ui.field(F().labelFor(it, k, label), el, range && kind !== 'age' ? 'rf-span2' : '');
            }
            if (kind === 'select') {
              el = h('select', {}, opts.map((o) => h('option', { value: o, selected: o === (it[k] || '') }, o || '—')));
              el.addEventListener('change', () => { it[k] = el.value; save(); });
            } else if (kind === 'age') {
              // Worked out from the date of birth.
              el = h('input', { type: 'text', readonly: true, tabindex: -1, class: 'rf-auto', value: it[k] || '', title: 'From the date of birth' });
            } else {
              el = h('input', { type: kind === 'date' ? 'date' : kind === 'phone' ? 'tel' : 'text', autocomplete: 'off', value: it[k] || '' });
              if (kind === 'phone' && root.CVFormat) CVFormat.phone && el.addEventListener('blur', () => { el.value = CVFormat.phone(el.value); it[k] = el.value; save(); });
              if (kind === 'money') el.addEventListener('blur', () => { const m = moneyText(el.value); if (m !== el.value) { el.value = m; it[k] = m; save(); } });
              el.addEventListener('input', () => { it[k] = el.value; save(); });
              if (kind === 'date' && unknown && k === 'dob') el.disabled = true;
            }
            el.setAttribute('aria-label', `${L.item} ${i + 1} ${label}`);
            inputs[k] = el;
            let box = el;
            // A victim that becomes (or stops being) the State of Illinois changes its boxes (v1.27).
            // Switched as you type or pick (not when you leave the box, which would move the page
            // under a click); the cursor stays in the name box.
            const redrawIfState = () => {
              if (F().isStateVictim(key, it) === stateVictim) return;
              draw(); save();
              const again = box.querySelector(`[aria-label="${L.item} ${i + 1} Name"]`);
              if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch { /* not a text box */ } }
            };
            if (key === 'victimsList' && k === 'name') el.addEventListener('input', redrawIfState);
            if (F().PICKS[kind]) box = CVCombo.attach(el, { items: () => pickItems(F().PICKS[kind]), onPick: () => { if (key === 'victimsList') redrawIfState(); } });
            else if (kind === 'narcotic') box = CVCombo.attach(el, { items: () => NARCOTIC_ITEMS });
            else if (key === 'narcotics' && k === 'value') {
              // Street value from the narcotic calculator (Reference): type, amount and unit.
              const calc = h('button', { class: 'btn small rf-calc', type: 'button', icon: 'calculator', title: 'Work out the street value with the narcotic calculator (Reference → Narcotic calculator)', onclick: () => {
                const Ref = root.CVReference;
                const amount = parseFloat(String(it.amount || '').replace(/,/g, ''));
                const drug = String(it.drug || '');
                if (!Ref || !RD.NARCOTIC_DATA || !RD.NARCOTIC_DATA[drug]) { toast('Pick the narcotic type from the list first: the calculator knows those.'); return; }
                const units = Ref.priceUnits(drug);
                const unit = it.unit && units.includes(it.unit) ? it.unit : units[0];
                const r = Ref.streetValue(drug, amount, unit);
                if (!r.ok) { toast(r.error); return; }
                it.value = moneyText(String(r.value)); el.value = it.value;
                if (!it.unit) { it.unit = unit; if (inputs.unit) inputs.unit.value = unit; }
                save();
                toast(r.line, 'success', 7000);
              } }, 'Calculate');
              box = h('span', { class: 'rf-with-btn' }, el, calc);
            }
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
          if (inputs.dob && inputs.age && !unknown) {
            const upd = () => { it.age = F().ageOn(inputs.dob.value, Vault.localDay()); inputs.age.value = it.age; save(); };
            inputs.dob.addEventListener('input', upd);
            inputs.dob.addEventListener('change', upd);
          }
          const unknownBox = key === 'offendersList' ? h('label', { class: 'check-row small rf-unknown', title: 'Name not known: age, height and weight become ranges' },
            h('input', { type: 'checkbox', checked: unknown, 'aria-label': `${lab} unknown offender`, onchange: (e) => {
              it.unknown = e.target.checked;
              if (it.unknown && !String(it.name || '').trim()) it.name = F().UNKNOWN;
              if (!it.unknown && it.name === F().UNKNOWN) it.name = '';
              if (!it.unknown) it.age = F().ageOn(it.dob, Vault.localDay());
              if (it.unknown) { it.dob = ''; it.age = ''; }
              draw(); save();
            } }), h('span', {}, 'Unknown Offender')) : null;
          return h('div', { class: `rf-item${unknown ? ' rf-item-unknown' : ''}${stateVictim ? ' rf-item-state' : ''}` },
            h('div', { class: 'rf-item-head' }, h('strong', {}, `${L.item} ${i + 1}`), unknownBox,
              archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: `Delete ${L.item.toLowerCase()}`, onclick: async () => {
                if (F().filled(it) && !(await ui.confirmDialog({ title: `Delete ${L.item} ${i + 1}?`, message: 'This entry is removed from the report.', confirmText: 'Delete', danger: true }))) return;
                data[key].splice(i, 1); draw(); save();
              } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Delete ${L.item} ${i + 1}`))),
            h('div', { class: `rf-item-grid rf-grid-${key}` }, fields));
        }) : [h('p', { class: 'muted small rf-none' }, `No ${L.title.toLowerCase()} yet.`)]));
      };
      draw();
      const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
        data[key].push(F().blankItem(key)); draw(); save();
        const last = box.lastElementChild && box.lastElementChild.querySelector('input, select');
        if (last) last.focus();
      } }, `Add ${L.item}`);
      // Offenders can be filled from Details → Suspects (name, date of birth, age); the description is entered here.
      const fromSuspects = key === 'offendersList' && !archived ? h('button', { class: 'btn small', type: 'button', icon: 'person-exclamation', title: 'Adds each suspect from Details (or updates the offender with the same name). The description of the day is entered here.', onclick: () => {
        const list = (c.suspects || []).filter((s) => String(s.name || '').trim());
        if (!list.length) { toast('No named suspects on the Details tab yet.'); return; }
        for (const s of list) F().suspectToOffender(data, s, Vault.localDay());
        draw(); save();
        toast(`${list.length} suspect${list.length === 1 ? '' : 's'} filled into Offenders.`, 'success');
      } }, 'Add From Suspects') : null;
      const wrap = h('div', { class: `rf-list rf-list-${key}` });
      let head = h('h4', {}, L.title);
      // The Officer's Report lists can be ticked off like its lines (v1.34): left out of the PDF and the report.
      if (F().OPTIONAL_LISTS.includes(key)) {
        const on = !F().isHidden(data, key);
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${L.title}`, title: 'Untick if this doesn\'t apply' });
        wrap.classList.toggle('rf-line-off', !on);
        cb.addEventListener('change', () => {
          data.hidden = data.hidden.filter((x) => x !== key);
          if (!cb.checked) data.hidden.push(key);
          wrap.classList.toggle('rf-line-off', !cb.checked);
          save();
        });
        head = h('label', { class: 'rf-list-head' }, cb, h('h4', {}, L.title));
      }
      wrap.append(head, box, archived ? '' : h('div', { class: 'contact-add' }, add, fromSuspects || ''));
      return wrap;
    }

    // ---- every part has an Include box on the left: untick it when the part doesn't apply; it's
    // then folded away and left out of the PDF and the report.
    // v1.25: a fold button on the right (▾/▸) only folds the part away on screen, to keep the page
    // short; it stays in the PDF. Remembered in this browser for every case.
    const FOLD_KEY = 'casevault-rf-folded';
    const folded = new Set((() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch { return []; } })());
    const keepFolds = () => { try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch { /* this session only */ } };
    const foldButtons = [];
    function part(id, title, icon, ...body) {
      const on = !F().isHidden(data, id);
      const inner = h('div', { class: 'rf-body' }, ...body);
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${title}` });
      const fold = h('button', { class: 'icon-btn rf-fold', type: 'button' });
      const sec = h('section', { class: `rf-section rf-${id}` },
        h('div', { class: 'rf-head' }, h('label', { class: 'rf-include', title: 'Untick if this part doesn\'t apply: it is left out of the PDF' }, cb), h('h3', { icon }, title), h('div', { class: 'spacer' }), fold),
        inner);
      const show = () => {
        const isOn = cb.checked; const isFolded = folded.has(id);
        inner.hidden = !isOn || isFolded;
        sec.classList.toggle('rf-off', !isOn);
        sec.classList.toggle('rf-folded', isOn && isFolded);
        fold.disabled = !isOn;
        const label = isFolded ? `Show ${title}` : `Hide ${title} on screen (it stays in the PDF)`;
        fold.title = label; fold.setAttribute('aria-expanded', String(!isFolded));
        fold.replaceChildren(ui.icon(isFolded ? 'chevron-right' : 'chevron-down'), h('span', { class: 'sr-only' }, label));
      };
      fold.addEventListener('click', () => { if (folded.has(id)) folded.delete(id); else folded.add(id); keepFolds(); show(); });
      foldButtons.push((want) => { if (want) folded.add(id); else folded.delete(id); show(); });
      cb.addEventListener('change', () => {
        data.hidden = data.hidden.filter((x) => x !== id);
        if (!cb.checked) data.hidden.push(id);
        show();
        save();
      });
      show();
      return sec;
    }
    const foldAll = (want) => { foldButtons.forEach((f) => f(want)); keepFolds(); };

    const sections = F().SECTIONS.map((s) => part(s.id, s.title, s.icon,
      h('div', { class: s.id === 'report' ? 'rf-lines' : `rf-grid${s.id === 'update' ? ' rf-grid-4' : s.id === 'approval' ? ' rf-grid-officers' : ''}` }, s.fields.map(([k, label, kind, opts]) => input(k, label, kind, opts))),
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
        if (!Array.isArray(e.photoLabels)) e.photoLabels = (e.photos || []).map(() => '');
        const strip = h('div', { class: 'rf-photos' });
        const drawPhotos = () => {
          strip.replaceChildren(...e.photos.map((path, j) => {
            const tag = F().photoLabel(n, j);
            const img = h('img', { alt: `Exhibit ${tag}` });
            Vault.readFile(c.id, path).then((f) => { img.src = URL.createObjectURL(f); img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true }); }).catch(() => { img.alt = 'Photo not found'; });
            // A label for each photo (v1.34): shown under it here and in its caption in the PDF.
            const label = h('textarea', { class: 'rf-photo-label', rows: 2, maxlength: 120, placeholder: 'Label this photo', 'aria-label': `Label for photo ${tag}`, readonly: archived || null });
            label.value = e.photoLabels[j] || '';
            label.addEventListener('input', () => { e.photoLabels[j] = label.value; save(); });
            return h('figure', { class: 'rf-photo-card' },
              h('div', { class: 'rf-photo' },
                h('span', { class: 'rf-photo-tag' }, tag),
                h('button', { 'data-ro-ok': 'true', class: 'rf-photo-open', type: 'button', title: 'View', onclick: () => ui.previewFile(c, path) }, img),
                archived ? null : h('button', { class: 'rf-photo-x', type: 'button', title: 'Take off this exhibit (the photo stays in the case files)', onclick: () => { e.photos.splice(j, 1); e.photoLabels.splice(j, 1); drawPhotos(); save(); } }, ui.icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove photo'))),
              label);
          }));
        };
        drawPhotos();
        const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
        picker.addEventListener('change', async () => {
          const files = [...picker.files];
          picker.value = '';
          for (const f of files) {
            try {
              const path = await Save.track(`photo:${c.id}`, () => Vault.addFile(c.id, f, { folder: e.type === 'Narcotics' ? 'Drug Exhibits' : 'Other Exhibits', description: `Exhibit ${n}` }));
              e.photos.push(path);
              e.photoLabels.push('');
            } catch { /* reported by Save */ }
          }
          drawPhotos();
          save(0);
        });
        // A big camera tile, the size of a photo (v1.34), so it's easy to find.
        const addPhoto = archived ? null : h('button', { class: 'rf-photo-add', type: 'button', title: 'Add photos of this exhibit', onclick: () => picker.click() }, ui.icon('camera-fill'), h('span', {}, 'Add Photos'));
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
    const addExhibit = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: c.agencyNumber ? `Numbered on from the last exhibit of any case with federal jacket number ${c.agencyNumber}.` : 'Numbered on from the last exhibit of this case. Cases with the same federal jacket number share one sequence.', onclick: async () => {
      try {
        const n = F().nextExhibit(await numbersInUse(c, data));
        data.evidence.push({ number: n, inventory: '', type: '', drug: '', weight: '', description: '', photos: [], photoLabels: [] });
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
    const pdfBytes = () => pdfFor(c, data);
    async function showPdf(bytes) {
      // Our own viewer (pdf.js): the whole report always scrolls into view; zoom in percent (v1.25).
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: 'Supplementary Report', fileName: data.sentSlug ? `${titleOf(data.sentSlug)}.pdf` : PDF_NAME });
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', { icon: 'printer' }, 'Supplementary Report'),
        viewer,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }
    const printBtn = h('button', { 'data-ro-ok': 'true', class: 'btn', type: 'button', icon: 'printer', title: 'Opens the report. Print it, or save it as a PDF.', onclick: async () => {
      save(0);
      await Save.flushAll();
      await showPdf(await pdfBytes());
    } }, 'Print / PDF');
    // v1.33: one button sends the draft to Reports (an editable report laid out like the PDF) and to
    // Files (the PDF, in the Supplementary Report folder). Sending again brings both up to date.
    const sendBtn = h('button', { class: 'btn primary', type: 'button', icon: 'send', title: 'Puts this report under Reports and its PDF under Files (Supplementary Report). Sending again updates both.', onclick: async () => {
      save(0);
      await Save.flushAll();
      try {
        let slug = await sentSlugOf(c, data);
        if (slug && !(await Vault.readDraft(c.id, slug).catch(() => null))) slug = ''; // that report was deleted
        if (!slug) slug = await Vault.newDraftSlug(c.id, BASE_TITLE);
        const cur = await linkedReport(c, slug);
        let force = false;
        if (cur && cur.edited) {
          force = await ui.confirmDialog({ title: 'Replace the edited report?', message: `${titleOf(slug)} was changed under Reports. Replace its text with this draft? (Its PDF in Files is replaced too.)`, confirmText: 'Replace' });
          if (!force) return;
        }
        await syncLinked(c, data, { force, slug });
        // The form as sent is kept with the report, so Send Back to Draft can bring it back (v1.39).
        await Save.track(`report-form:${c.id}:${slug}`, () => Vault.writeCaseJSON(c.id, formFile(slug), { ...structuredClone(data), sentSlug: slug }));
        if (data.sentSlug !== slug) { data.sentSlug = slug; save(0); await Save.flushAll(); }
        const r = await savePdfToCase(c, data, null, titleOf(slug));
        toast(`Sent: Reports → ${titleOf(slug)}, and Files → ${r.path.split('/').pop()}`, 'success', 7000);
      } catch { /* reported by Save */ }
    } }, 'Send Draft to Reports');
    // Clear All (v1.33): an empty form, to draft another report. What was sent stays in Reports and
    // Files; the next send makes a new report.
    const clearBtn = h('button', { class: 'btn danger-ghost', type: 'button', title: 'Empties the form to draft another report. Reports and Files keep what was already sent.', onclick: async () => {
      if (!(await ui.confirmDialog({ title: 'Clear the whole draft?', message: 'Every entry on this form is emptied, to draft another report. What you already sent stays under Reports and Files. A draft not sent yet is lost.', confirmText: 'Clear All', danger: true }))) return;
      const fresh = F().normalize({});
      for (const k of Object.keys(data)) delete data[k];
      Object.assign(data, fresh);
      if (c.agencyNumber || c.number) data.caseNumber = c.agencyNumber || c.number;
      data.sentSlug = '';
      save(0);
      await Save.flushAll();
      toast('The form is empty: ready for another report.', 'success', 4000);
      ui.refresh();
    } }, 'Clear All');

    // v1.39: the heading names the Officer Report Type picked (Supplementary Report – Purchase…);
    // Show All / Hide All sit up here, and Save Changes sits with the other buttons.
    const heading = h('h2', {}, headingOf(data));
    if (els.activity) els.activity.addEventListener('change', () => { heading.textContent = headingOf(data); });
    panel.replaceChildren(
      h('div', { class: 'notes-head rf-head-bar' },
        heading, h('div', { class: 'spacer' }),
        h('button', { 'data-ro-ok': 'true', class: 'btn small ghost', type: 'button', icon: 'chevron-down', title: 'Open every part on screen', onclick: () => foldAll(false) }, 'Show All'),
        h('button', { 'data-ro-ok': 'true', class: 'btn small ghost', type: 'button', icon: 'chevron-right', title: 'Fold every part away on screen (they stay in the PDF). Open one with its arrow.', onclick: () => foldAll(true) }, 'Hide All')),
      h('p', { class: 'muted small explain' }, 'The Supplementary Report for this case: fill it in, then Send Draft to Reports puts it under Reports and its PDF under Files. Clear All starts another one. Saved as report-fields.json.'),
      h('div', { class: 'rf-actions' }, archived ? null : sendBtn, printBtn, archived ? null : clearBtn, h('div', { class: 'spacer' }), archived ? null : saveBtn),
      ...sections.slice(0, -1),
      part('evidence', 'Evidence Inventoried', 'box-seam', evRows, archived ? null : h('div', { class: 'contact-add' }, addExhibit)),
      part('summary', 'Summary of Investigation', 'journal-text', fmt, rich.el, narrative),
      sections[sections.length - 1]); // Submission and Approval comes last, as on the printed report
  }
  const headingOf = (d) => F().titleFor(d);

  function init(kit) { ui = kit; }

  root.CVReportFieldsUI = { init, load, render, sendBack, sentPdf, numbersInUse, pdfFor, savePdfToCase, linkedReport, syncLinked, sentSlugOf, titleOf, LINKED, PDF_NAME };
})(this);
