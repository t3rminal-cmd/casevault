/* CaseVault — Menu → Options and Menu → Contact Dev.
 *
 * Options:
 *   Display   zoom and brightness for this PC (kept in the browser like the theme: a display
 *             preference, never case data).
 *   Dev Tools "Make it fictitious": takes a real template, report or reference and swaps the
 *             personal details (names, phone numbers, addresses, dates of birth, case numbers…)
 *             for made-up fillers such as John Doe and 555-0100, so it can be kept as a template or
 *             given to the AI in the Library. Rules first, then optionally the local AI for anything
 *             they missed. Nothing leaves this computer.
 * Contact Dev: a bug report you send yourself, by email or through a web form.
 *
 * fictitious() is plain logic with no DOM, so the tests run it under Node.
 */
'use strict';

(function (root) {
  // Looked up when used: options.js loads early (for zoom and brightness), before js/secure/pii.js.
  const PIIMOD = typeof module !== 'undefined' && module.exports ? require('./secure/pii.js') : null;
  const PII = () => PIIMOD || root.CVPii;

  /* ---------- display: zoom and brightness (this PC) ---------- */

  const ZOOM_KEY = 'casevault-zoom';
  const BRIGHT_KEY = 'casevault-brightness';
  const ZOOM = { min: 70, max: 160, step: 10 };
  const BRIGHT = { min: 50, max: 130, step: 5 };
  const clampTo = (v, r, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, n)) : d; };
  const read = (k, r, d) => { try { const v = root.localStorage.getItem(k); return v == null ? d : clampTo(v, r, d); } catch { return d; } };
  const write = (k, v, d) => { try { if (v === d) root.localStorage.removeItem(k); else root.localStorage.setItem(k, String(v)); } catch { /* private window: this session only */ } };

  const getZoom = () => read(ZOOM_KEY, ZOOM, 100);
  const getBrightness = () => read(BRIGHT_KEY, BRIGHT, 100);

  // Zoom scales the whole page; brightness darkens or lightens it. Dialogs sit above the page in
  // the browser's top layer, so they get the same brightness filter themselves (css: .bright-adjusted).
  function applyDisplay() {
    const doc = root.document;
    if (!doc) return;
    const html = doc.documentElement;
    const z = getZoom();
    html.style.zoom = z === 100 ? '' : String(z / 100);
    const b = getBrightness();
    html.style.setProperty('--cv-brightness', String(b / 100));
    html.classList.toggle('bright-adjusted', b !== 100);
    let veil = doc.getElementById('cv-brightness');
    if (b !== 100 && !veil && doc.body) {
      veil = doc.createElement('div');
      veil.id = 'cv-brightness';
      veil.setAttribute('aria-hidden', 'true');
      doc.body.append(veil);
    }
    if (veil) veil.hidden = b === 100;
  }
  const setZoom = (v) => { write(ZOOM_KEY, clampTo(v, ZOOM, 100), 100); applyDisplay(); };
  const setBrightness = (v) => { write(BRIGHT_KEY, clampTo(v, BRIGHT, 100), 100); applyDisplay(); };

  /* ---------- Dev Tools: make a document fictitious ---------- */

  const NAMES = [['John', 'Doe'], ['Jane', 'Doe'], ['Richard', 'Roe'], ['Mary', 'Major'], ['John', 'Public'], ['Jane', 'Smith'], ['James', 'Brown'], ['Linda', 'Green'], ['Robert', 'White'], ['Susan', 'Black']];
  const STREETS = ['Main Street', 'Oak Avenue', 'Maple Drive', 'Elm Street', 'Cedar Lane', 'Pine Road'];
  const pad = (n, w) => String(n).padStart(w, '0');

  // A made-up name shaped like the real one: "DOE, John", "JOHN DOE", "Doe" or "John Doe".
  function fakeName(value, i) {
    const [first, last] = NAMES[i % NAMES.length];
    const suffix = i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '';
    const v = String(value).trim();
    const caps = (w) => w === w.toUpperCase() && /[A-Z]/.test(w);
    if (/,/.test(v)) {
      const [l, f] = v.split(',').map((x) => x.trim());
      return `${caps(l) ? last.toUpperCase() : last}${suffix}, ${caps(f || '') ? first.toUpperCase() : first}`;
    }
    const out = /\s/.test(v) ? `${first} ${last}${suffix}` : `${last}${suffix}`;
    return caps(v) ? out.toUpperCase() : out;
  }
  // Ranks and roles in front of a name are kept: "Det. Alex Sample" -> "Det. John Doe".
  const TITLE_RE = /^((?:Mr|Mrs|Ms|Miss|Dr|Det|Detective|Officer|Ofc|Sgt|Sergeant|Lt|Lieutenant|Capt|Captain|Cpl|Corporal|Agent|SA|TFO|Deputy|Trooper|Inv|Investigator|Chief|Judge|Suspect|Victim|Witness|Defendant|Subject|Complainant)\.?\s+)/i;
  const splitTitle = (v) => { const m = TITLE_RE.exec(String(v)); return m ? [m[1], String(v).slice(m[1].length)] : ['', String(v)]; };
  const nameWords = (v) => String(v).toLowerCase().match(/[a-z][a-z'-]*/g) || [];

  // type -> (value, n) where n counts the different values of that type seen so far.
  const FILLERS = {
    ssn: () => '000-00-0000',
    card: () => '0000 0000 0000 0000',
    bank: () => '000000000',
    dob: (v, n) => `01/${pad((n % 28) + 1, 2)}/1980`,
    dl: (v, n) => `D000-0000-${pad(n + 1, 4)}`,
    passport: (v, n) => `X0000000${n % 10}`,
    casenum: (v, n) => `0000-${pad(n + 1, 5)}`,
    phone: (v, n) => `(555) 555-${pad(100 + n, 4)}`,
    email: (v, n) => { const [f, l] = NAMES[n % NAMES.length]; return `${f}.${l}@example.com`.toLowerCase(); },
    address: (v, n) => `${100 + n * 11} ${STREETS[n % STREETS.length]}, Anytown, ST 00000`,
    plate: (v, n) => `ABC${pad(1000 + n, 4)}`,
    vin: (v, n) => `1FAKEVIN0000${pad(n + 1, 5)}`,
    ip: (v, n) => `192.0.2.${(n % 250) + 1}`,
  };

  /**
   * Swap personal details for fillers. The same real value always gets the same filler, so the
   * document still reads consistently. known: extra names or terms to catch (strings).
   * Returns { text, replaced, map: [{ type, label, from, to }] }.
   */
  function fictitious(text, { known = [] } = {}) {
    const s = String(text || '');
    // Names found anywhere are looked for everywhere, so "Alex Sample" also catches "ALEX SAMPLE",
    // "SAMPLE, Alex" and "Sample" later in the text.
    const asKnown = (list) => list.filter(Boolean).map((v) => ({ value: v, type: 'known' }));
    const first = PII().scan(s, { known: asKnown(known) });
    const names = first.filter((f) => f.type === 'person' || f.type === 'known').map((f) => splitTitle(f.value.trim())[1]).filter((v) => /\s/.test(v));
    const findings = PII().scan(s, { known: asKnown([...known, ...names]) });
    const seen = new Map(); // "type:value" -> filler
    const counts = {};
    // People: "Casey Placeholder", "PLACEHOLDER, Casey" and "Placeholder" are the same person.
    const people = [];
    const personOf = (value) => {
      const w = nameWords(value);
      let p = people.find((x) => w.every((k) => x.has(k)) || [...x].every((k) => w.includes(k)));
      if (!p) { p = new Set(w); p.n = people.length; people.push(p); } else w.forEach((k) => p.add(k));
      return p.n;
    };
    const map = [];
    let out = '';
    let at = 0;
    for (const f of findings) {
      if (f.index < at) continue;
      const kind = f.type === 'known' || f.type === 'person' ? 'name' : f.type;
      // Names keep their own shape (ALEX SAMPLE -> JOHN DOE), so their key keeps the case.
      const key = `${kind}:${kind === 'name' ? f.value.replace(/\s+/g, ' ') : f.value.toLowerCase().replace(/\s+/g, ' ')}`;
      let to = seen.get(key);
      if (!to) {
        if (kind === 'name') { const [title, name] = splitTitle(f.value); to = title + fakeName(name, personOf(name)); }
        else {
          const n = counts[kind] || 0;
          counts[kind] = n + 1;
          to = (FILLERS[kind] || (() => `[${PII().TYPES[f.type].tag}]`))(f.value, n);
        }
        seen.set(key, to);
        map.push({ type: f.type, label: PII().TYPES[f.type].label, from: f.value, to });
      }
      // Keep a full stop or comma the match took with it.
      const tail = (/[.,;:]$/.exec(f.value) || [''])[0];
      out += s.slice(at, f.index) + to + (tail && !to.endsWith(tail) ? tail : '');
      at = f.index + f.length;
    }
    out += s.slice(at);
    return { text: out, replaced: findings.length, map };
  }

  // The local AI's second pass: the rules can miss names and places, especially in unusual layouts.
  const AI_PROMPT = [
    'You rewrite law-enforcement documents so they contain no real personal information, for use as templates and writing examples.',
    'Replace every remaining real person name, nickname, street address, phone number, email address, date of birth, ID number, licence plate, VIN, business name tied to a person, and case or report number with obviously fictitious fillers (John Doe, Jane Roe, 123 Main Street, Anytown, (555) 555-0100, john.doe@example.com, 01/01/1980, 0000-00000).',
    'Keep everything else exactly as it is: the structure, headings, wording, legal language, officer titles, agency form names, and any {{placeholders}} or [CONFIRM: …] markers.',
    'Keep fillers consistent: the same real person always becomes the same fictitious person.',
    'Output only the rewritten document, with no comments before or after.',
  ].join('\n');

  /* ---------- the dialogs ---------- */

  let ui = null;

  function open(kit) {
    ui = kit;
    const { h, openDialog } = ui;
    return openDialog((close) => {
      const tabs = [['display', 'Display', 'zoom-in'], ['dev', 'Dev Tools', 'terminal']];
      const panels = { display: displayPanel(), dev: devPanel() };
      const tabBar = h('div', { class: 'opt-tabs', role: 'tablist' });
      const body = h('div', { class: 'opt-body' });
      const show = (key) => {
        for (const b of tabBar.children) { const on = b.dataset.key === key; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); }
        body.replaceChildren(panels[key]);
      };
      tabs.forEach(([key, label, icon]) => tabBar.append(h('button', { class: 'opt-tab', type: 'button', role: 'tab', 'data-key': key, icon, onclick: () => show(key) }, label)));
      show('display');
      return h('div', { class: 'options-form' },
        h('div', { class: 'opt-head' }, h('h2', { icon: 'sliders2' }, 'Options'), h('div', { class: 'spacer' }), h('button', { class: 'btn primary', type: 'button', icon: 'check2', onclick: () => close() }, 'Done')),
        tabBar, body);
    });
  }

  function slider(label, range, value, fmt, onInput, tip) {
    const { h } = ui;
    const input = h('input', { type: 'range', min: range.min, max: range.max, step: range.step, value, 'aria-label': label });
    const out = h('output', { class: 'opt-value' }, fmt(value));
    const set = (v) => { input.value = v; out.textContent = fmt(Number(v)); onInput(Number(v)); };
    input.addEventListener('input', () => set(input.value));
    const minus = h('button', { class: 'icon-btn', type: 'button', title: `Less`, onclick: () => set(Math.max(range.min, Number(input.value) - range.step)) }, ui.icon('dash-lg'), h('span', { class: 'sr-only' }, `${label}: less`));
    const plus = h('button', { class: 'icon-btn', type: 'button', title: `More`, onclick: () => set(Math.min(range.max, Number(input.value) + range.step)) }, ui.icon('plus-lg'), h('span', { class: 'sr-only' }, `${label}: more`));
    const reset = h('button', { class: 'btn small ghost', type: 'button', onclick: () => set(100) }, 'Reset');
    return h('div', { class: 'opt-row', title: tip }, h('span', { class: 'opt-label' }, label), minus, input, plus, out, reset);
  }

  function displayPanel() {
    const { h } = ui;
    return h('section', { class: 'opt-panel' },
      h('h3', { icon: 'zoom-in' }, 'Display on this PC'),
      slider('Zoom', ZOOM, getZoom(), (v) => `${v}%`, setZoom, 'Makes everything in CaseVault bigger or smaller. Ctrl + and Ctrl − in the browser do the same.'),
      slider('Brightness', BRIGHT, getBrightness(), (v) => `${v}%`, setBrightness, 'Darkens or lightens CaseVault, for example in a dark room at night.'),
      h('p', { class: 'muted small explain' }, 'Kept in this browser on this PC, like the theme. Each PC has its own. Nothing about your cases is stored here.'));
  }

  function devPanel() {
    const { h, toast } = ui;
    const src = h('textarea', { class: 'dev-src', rows: 9, placeholder: 'Paste a template, report or reference here, or open a file.', 'aria-label': 'Original text' });
    const outBox = h('textarea', { class: 'dev-out', rows: 9, placeholder: 'The fictitious version appears here. You can edit it.', 'aria-label': 'Fictitious text' });
    const extra = h('input', { type: 'text', placeholder: 'Other names to replace, separated by commas', 'aria-label': 'Other names to replace', title: 'Names the rules might not recognise, such as nicknames or one-word names.' });
    const report = h('div', { class: 'dev-report muted small', 'aria-live': 'polite' });
    const file = h('input', { type: 'file', hidden: true, accept: '.txt,.md,.docx,.pdf' });
    const aiBtn = h('button', { class: 'btn', type: 'button', icon: 'robot', title: 'Let the AI on this computer look for anything the rules missed. Nothing leaves this PC.' }, 'Also check with local AI');
    let ctrl = null;

    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        if (/\.(txt|md)$/i.test(f.name)) src.value = await f.text();
        else {
          const r = await CVExtract.extract(f, f.name);
          src.value = r.paragraphs.map((p) => p.text).join('\n\n');
        }
        report.textContent = `Opened ${f.name}. Only the text is used; the file isn't changed.`;
      } catch (err) { toast(`Could not read ${f.name}: ${err.message}`, 'error'); }
    });

    const known = () => {
      const k = extra.value.split(',').map((x) => x.trim()).filter(Boolean);
      const a = Vault.data && Vault.data.settings && Vault.data.settings.affiant;
      if (a) k.push(a.name, a.phone, a.email);
      for (const c of (Vault.data && Vault.data.cases) || []) k.push(c.client && c.client.length > 8 ? c.client : null);
      return k.filter(Boolean);
    };
    const runRules = () => {
      if (!src.value.trim()) { toast('Paste some text or open a file first.', 'error'); return null; }
      const r = fictitious(src.value, { known: known() });
      outBox.value = r.text;
      report.replaceChildren(r.map.length
        ? h('span', {}, `${r.replaced} detail${r.replaced === 1 ? '' : 's'} replaced: `, r.map.slice(0, 40).map((m, i) => h('span', { class: 'dev-swap' }, i ? ', ' : '', `${m.label.toLowerCase()} → ${m.to}`)), r.map.length > 40 ? ' …' : '')
        : 'The rules found nothing personal. Try "Also check with local AI", and read it through yourself.');
      return r;
    };
    aiBtn.addEventListener('click', async () => {
      if (ctrl) { ctrl.abort(); return; }
      const base = outBox.value.trim() || (runRules() || {}).text;
      if (!base) return;
      const Engine = root.CVChecks && root.CVChecks.Engine;
      await Engine.refresh().catch(() => {});
      const det = Engine.detected;
      const choice = Engine.choice();
      if (!det || !choice || !choice.model) { toast('No AI engine is running. Start Start-CaseVault.bat on the CV-AI drive, or use the rules only.', 'error', 8000); return; }
      ctrl = new AbortController();
      const my = ctrl;
      aiBtn.replaceChildren(ui.icon('x-circle'), 'Stop');
      report.textContent = 'The local AI is reading it…';
      let text = '';
      try {
        const numCtx = CVCopilot.numCtxForModel(det, choice.model);
        await CVActivity.exclusive('draft', () => CVCopilot.streamChat({
          fetchImpl: Engine.fetchImpl(), base: det.base, model: choice.model, signal: my.signal, numCtx,
          messages: [{ role: 'system', content: AI_PROMPT }, { role: 'user', content: base }],
          onText: (piece) => { text += piece; outBox.value = text; },
        }), { label: 'Making it fictitious…', model: choice.model });
        // Rules once more over the AI's version, in case it put a real detail back.
        const again = fictitious(text, { known: known() });
        outBox.value = again.text;
        report.textContent = `Checked with ${choice.model}. Read it through before you use it: neither the rules nor the AI are perfect.`;
      } catch (err) {
        if (!my.signal.aborted) toast(`The AI could not finish: ${err.message}`, 'error');
        else report.textContent = 'Stopped.';
      } finally {
        ctrl = null;
        aiBtn.replaceChildren(ui.icon('robot'), 'Also check with local AI');
      }
    });

    const name = h('input', { type: 'text', maxlength: 80, placeholder: 'Name, e.g. DEA 6 sample', 'aria-label': 'Name to save it under' });
    const libCat = h('select', { 'aria-label': 'Library folder' }, (root.CVLibrary ? root.CVLibrary.CATEGORIES : []).map((c) => h('option', { value: c.folder }, c.label)));
    const text = () => { const t = outBox.value.trim(); if (!t) toast('Make it fictitious first.', 'error'); return t; };
    const fileName = (ext) => `${(name.value.trim() || 'Fictitious document').replace(/\.(md|txt)$/i, '')}.${ext}`;

    return h('section', { class: 'opt-panel dev-panel' },
      h('h3', { icon: 'eraser', title: 'Turns a real document into a fictitious one you can keep as a template or give the AI to learn from. Runs on this computer only.' }, 'Make it fictitious'),
      h('div', { class: 'dev-cols' },
        h('div', { class: 'dev-col' },
          h('div', { class: 'dev-col-head' }, h('strong', {}, 'Original'), h('div', { class: 'spacer' }),
            h('button', { class: 'btn small', type: 'button', icon: 'folder2-open', onclick: () => file.click() }, 'Open a file…')),
          src, extra),
        h('div', { class: 'dev-col' },
          h('div', { class: 'dev-col-head' }, h('strong', {}, 'Fictitious')), outBox)),
      file,
      h('div', { class: 'row wrap dev-actions' },
        h('button', { class: 'btn primary', type: 'button', icon: 'magic', title: 'Swap names, phone numbers, addresses, dates of birth, case numbers and more for made-up ones.', onclick: runRules }, 'Replace with fillers'),
        aiBtn),
      report,
      h('div', { class: 'row wrap dev-save' },
        name,
        h('button', { class: 'btn', type: 'button', icon: 'copy', onclick: async () => { const t = text(); if (!t) return; try { await navigator.clipboard.writeText(t); toast('Copied.', 'success', 1500); } catch { toast('Could not copy.', 'error'); } } }, 'Copy'),
        h('button', { class: 'btn', type: 'button', icon: 'file-earmark-ruled', title: 'Save it to Vault → Templates on the SSD.', onclick: async () => {
          const t = text(); if (!t) return;
          const file = fileName('md');
          try { await ui.Save.track(`template:${file}`, () => Vault.saveTemplate(file, t)); toast(`Saved as the template "${file}".`, 'success'); } catch { /* reported by Save */ }
        } }, 'Save as template'),
        libCat,
        h('button', { class: 'btn', type: 'button', icon: 'bookshelf', title: 'Add it to the Library so the AI can learn from it.', onclick: async () => {
          const t = text(); if (!t) return;
          try {
            const path = await ui.Save.track('library', () => Vault.saveLibraryFile(libCat.value, fileName('md'), new Blob([t], { type: 'text/markdown' })));
            toast(`Added to the Library: ${path}`, 'success');
          } catch { /* reported by Save */ }
        } }, 'Add to Library')),
      h('p', { class: 'muted small explain' }, 'Detection is a safety net, not a guarantee. Read the result before you save it; anything you add to the Library is read by the AI.'));
  }

  /* ---------- Contact Dev ---------- */

  function contactDev(kit) {
    ui = kit;
    const { h, openDialog, toast } = ui;
    const settings = (Vault.data && Vault.data.settings) || {};
    const about = [`CaseVault ${Vault.APP_VERSION || ''}`, navigator.userAgent.replace(/\s+/g, ' ').slice(0, 160), `Screen ${root.innerWidth}×${root.innerHeight}`, `Zoom ${getZoom()}%`].join('\n');
    const kind = h('select', { 'aria-label': 'Kind of message' }, ['Bug', 'Feature request', 'Question'].map((k) => h('option', { value: k }, k)));
    const subject = h('input', { type: 'text', maxlength: 120, placeholder: 'Short title, e.g. Files tab: preview is blank', 'aria-label': 'Title' });
    const what = h('textarea', { rows: 6, placeholder: 'What did you do, what happened, and what did you expect? No case details, names or numbers.', 'aria-label': 'Description' });
    const includeAbout = h('input', { type: 'checkbox', checked: true });
    const email = h('input', { type: 'email', value: settings.devEmail || '', placeholder: 'developer@example.com', 'aria-label': 'Developer email' });
    const form = h('input', { type: 'url', value: settings.bugFormUrl || '', placeholder: CVLinks.BUG_REPORT_URL, 'aria-label': 'Bug report form address' });
    const saveContact = () => ui.Save.track('settings', () => Vault.updateSettings({ devEmail: email.value.trim(), bugFormUrl: form.value.trim() })).catch(() => {});
    email.addEventListener('change', saveContact);
    form.addEventListener('change', saveContact);

    const body = () => `${what.value.trim()}\n\n${includeAbout.checked ? `---\n${about}\n` : ''}`;
    const check = () => {
      const all = `${subject.value}\n${what.value}`;
      if (!what.value.trim()) { toast('Describe what happened first.', 'error'); return false; }
      const found = PII().scan(all, {}).filter((f) => f.level !== 'medium');
      if (found.length) { toast(`Take out the ${found[0].label.toLowerCase()} first: bug reports must not hold case details.`, 'error', 8000); return false; }
      return true;
    };
    return openDialog((close) => h('div', { class: 'contact-form' },
      h('h2', { icon: 'bug' }, 'Contact Dev'),
      h('p', { class: 'muted small explain' }, 'Report a bug or ask for a feature. The message opens in your email program or in the web form, where you check it and press Send yourself. Never include case details.'),
      h('div', { class: 'form-grid' },
        ui.field('Kind', kind), ui.field('Title', subject),
        ui.field('What happened', what, 'span-2'),
        h('label', { class: 'check-row small span-2', title: about }, includeAbout, h('span', {}, 'Include the app version, browser and screen size (no case data)'))),
      h('details', { class: 'contact-where' }, h('summary', {}, 'Where reports go'),
        h('div', { class: 'form-grid' }, ui.field('Developer email', email, '', 'Saved in vault.json. Used by "Email it".'), ui.field('Bug report form', form, '', 'The web address of your bug report form. Empty: the CaseVault issue page on GitHub.'))),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn', type: 'button', icon: 'box-arrow-up-right', title: 'Copies the report, then opens the form in a new browser tab. Paste it there.', onclick: async () => {
          if (!check()) return;
          const url = CVLinks.cleanUrl(form.value) || CVLinks.BUG_REPORT_URL;
          try { await navigator.clipboard.writeText(`${kind.value}: ${subject.value.trim()}\n\n${body()}`); } catch { /* the form can be filled by hand */ }
          const a = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' });
          a.click();
          toast('The report is copied. Paste it into the form.', 'success', 6000);
          close();
        } }, 'Open bug form'),
        h('button', { class: 'btn primary', type: 'button', icon: 'envelope', title: 'Opens a new email to the developer with the report filled in.', onclick: () => {
          if (!check()) return;
          const to = email.value.trim();
          if (!to) { toast('Add the developer\'s email under "Where reports go" first.', 'error'); return; }
          const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`[CaseVault ${kind.value}] ${subject.value.trim()}`)}&body=${encodeURIComponent(body())}`;
          h('a', { href }).click();
          close();
        } }, 'Email it'))));
  }

  const api = { fictitious, AI_PROMPT, getZoom, getBrightness, setZoom, setBrightness, applyDisplay, open, contactDev, ZOOM, BRIGHT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.CVOptions = api;
    applyDisplay();
    if (root.document && !root.document.body) root.document.addEventListener('DOMContentLoaded', applyDisplay);
  }
})(this);
