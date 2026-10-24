/* CaseVault — Library and AI writing behavior, in the Vault panel, and the Library part of
 * Draft with AI. See js/library.js for what they are.
 */
'use strict';

(function (root) {
  let ui = null;
  const L = () => root.CVLibrary;
  const textMemo = new Map();

  /** Library files with their settings: [{ path, folder, name, size, modified, category, docType, always }]. */
  async function items() {
    const [files, meta] = await Promise.all([Vault.listLibrary(), Vault.readLibraryMeta()]);
    return files.map((f) => {
      const cat = L().categoryOfFolder(f.folder);
      const m = meta.items[f.path] || {};
      return { ...f, category: cat ? cat.key : 'other', docType: m.docType || L().guessDocType(f.name), always: !!m.always };
    });
  }

  async function setMeta(path, patch) {
    const meta = await Vault.readLibraryMeta();
    meta.items[path] = { ...(meta.items[path] || {}), ...patch };
    await ui.Save.track('library', () => Vault.writeLibraryMeta(meta));
  }

  /* ---------- v1.149: real names in examples ---------- */
  /** What CaseVault knows to look for: every case's numbers, clients and subjects, this case's
   * people, you, and the watch list (Settings). Plus the usual patterns (phones, addresses, SSNs…). */
  function knownFor(caseObj = null) {
    const s = (Vault.data && Vault.data.settings) || {};
    const cases = (Vault.data && Vault.data.cases) || [];
    const subjects = cases.map((c) => String(c.subject || '').trim()).filter((v) => v.length >= 3).map((value) => ({ value, type: 'known' }));
    return [...root.CVPii.knownTerms({ caseObj, affiant: s.affiant, watchlist: s.piiWatchlist || [], caseIndex: cases }), ...subjects];
  }
  const scrubScan = (text, caseObj = null) => root.CVPii.scan(text, { known: knownFor(caseObj) });
  /** The findings as a short list: "Name: DOE, John", at most 12, then "and N more". */
  function findingsList(findings) {
    const { h } = ui;
    const seen = new Set(); const rows = [];
    for (const f of findings) { const k = `${f.label}|${f.value.toLowerCase()}`; if (seen.has(k)) continue; seen.add(k); rows.push(f); }
    return h('ul', { class: 'scrub-list' }, ...rows.slice(0, 12).map((f) => h('li', {}, h('span', { class: 'scrub-type' }, f.label), ' ', h('span', { class: 'scrub-value' }, f.value))),
      rows.length > 12 ? h('li', { class: 'muted' }, `and ${rows.length - 12} more`) : null);
  }
  /** The example folder for a document type: warrants and affidavits apart from reports. */
  const folderFor = (docType) => (['affidavit', 'warrant'].includes(docType) ? 'warrants' : 'examples');

  /** v1.149: Use as AI Example (a report's Export menu): the report's text with names, numbers and
   * addresses swapped for placeholders ([NAME_1]…), saved in the Library as an example. */
  async function addFromReport(caseObj, title, text, type) {
    const { h } = ui;
    const findings = scrubScan(text, caseObj);
    const { text: clean, replaced } = root.CVPii.redact(text, findings);
    const guess = L().DOC_TYPES.some(([k]) => k === type) ? type : L().guessDocType(`${title} ${type}`);
    const docSel = h('select', { 'aria-label': 'Example of' }, L().DOC_TYPES.map(([k, label]) => h('option', { value: k, selected: k === guess }, label)));
    const pre = h('textarea', { class: 'scrub-preview', rows: 10, readonly: true }); pre.value = clean;
    const ok = await ui.openDialog((close) => h('form', { class: 'scrub-form', onsubmit: (e) => { e.preventDefault(); close(true); } },
      h('h2', { icon: 'journal-bookmark' }, 'Use as AI Example'),
      h('p', { class: 'muted small' }, replaced ? `${replaced} name${replaced === 1 ? '' : 's'}, number${replaced === 1 ? '' : 's'} or address${replaced === 1 ? '' : 'es'} were swapped for placeholders like [NAME_1], so the AI learns the wording, not the people. Read it before saving: unusual names can slip through.` : 'Nothing that looks like a name, number or address was found. Read it before saving: unusual names can slip through.'),
      replaced ? findingsList(findings) : null,
      ui.field('Example Of', docSel), pre,
      CVKit.cancelRow(h, () => close(false), h('button', { class: 'btn primary', type: 'submit', icon: 'journal-bookmark' }, 'Save Example'))));
    if (!ok) return false;
    const cat = L().category(folderFor(docSel.value));
    const name = `${FS.safeName(title || 'Report')} (example).md`;
    try {
      const path = await ui.Save.track('library', () => Vault.saveLibraryFile(cat.folder, name, new File([pre.value], name, { type: 'text/markdown' })));
      await setMeta(path, { docType: docSel.value, always: false });
      ui.toast(`Saved in Settings → Library → ${cat.label}.`, 'success', 4000);
      return true;
    } catch { return false; }
  }

  /** The file's text, read once and kept in library/.cache on the SSD. */
  async function textOf(path) {
    const file = await Vault.readLibraryFile(path);
    if (!file) return '';
    const key = `${path}|${file.size}|${file.lastModified}`;
    if (textMemo.has(key)) return textMemo.get(key);
    let text = await Vault.readLibraryText(path, file.size, file.lastModified).catch(() => null);
    if (text == null) {
      if (/\.(md|txt)$/i.test(file.name)) text = await file.text();
      else {
        const out = await CVExtract.extract(file, file.name);
        text = (out.paragraphs || []).map((p) => p.text).join('\n\n');
      }
      await Vault.writeLibraryText(path, file.size, file.lastModified, text).catch(() => {});
    }
    textMemo.set(key, text);
    return text;
  }

  /** [{ title, text }] for the chosen paths, for draftMessages(). */
  async function texts(paths, onProgress) {
    const out = [];
    for (const p of paths) {
      if (onProgress) onProgress(p.split('/').pop());
      try { const t = await textOf(p); if (t.trim()) out.push({ title: p.split('/').pop().replace(/\.[^.]+$/, ''), text: t }); } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        ui.toast(`Skipped ${p.split('/').pop()}: ${err.message}`, 'error', 6000);
      }
    }
    return out;
  }

  /* ---------------- Vault → Library ---------------- */

  function librarySection() {
    const { h, toast, Save } = ui;
    const box = h('div', { class: 'library-list' }, h('p', { class: 'muted small' }, 'Reading the library…'));
    const target = h('select', { 'aria-label': 'Add to' }, L().CATEGORIES.map((c) => h('option', { value: c.key }, c.label)));
    const input = h('input', { type: 'file', multiple: true, hidden: true, accept: '.pdf,.docx,.txt,.md,.xlsx,.csv,.jpg,.jpeg,.png' });
    const folderInput = h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: true });

    async function add(files) {
      const cat = L().category(target.value);
      const list = files.filter((f) => !f.name.startsWith('.'));
      if (!list.length) return;
      // v1.149: look in each file for real names, numbers and addresses before it goes in.
      const checking = toast(`Checking ${list.length} file${list.length === 1 ? '' : 's'} for names and numbers…`, 'info', 600000);
      const flagged = new Map();
      for (const f of list) {
        try {
          const text = /\.(md|txt)$/i.test(f.name) ? await f.text() : ((await CVExtract.extract(f, f.name)).paragraphs || []).map((p) => p.text).join('\n\n');
          const found = text.trim() ? scrubScan(text) : [];
          if (found.length) flagged.set(f, { text, found });
        } catch { /* unreadable: added as it is */ }
      }
      checking.remove();
      let mode = 'asis';
      if (flagged.size) {
        mode = await ui.openDialog((close) => h('div', { class: 'scrub-form' },
          h('h2', { icon: 'exclamation-triangle-fill' }, 'Real Names Found'),
          h('p', { class: 'small' }, `${flagged.size} of ${list.length} file${list.length === 1 ? '' : 's'} have what look like real names, phone numbers, addresses or case numbers. A small AI can copy them into a new draft. Save an anonymized copy instead (the text with [NAME_1]-style placeholders, as a text file), or keep the files as they are.`),
          ...[...flagged.entries()].map(([f, x]) => h('div', { class: 'scrub-file' }, h('strong', {}, f.name), findingsList(x.found))),
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
            h('button', { class: 'btn', type: 'button', onclick: () => close('asis') }, 'Keep As They Are'),
            h('button', { class: 'btn primary', type: 'button', icon: 'shield-lock-fill', onclick: () => close('clean') }, 'Save Anonymized Copies'))));
        if (!mode) return;
      }
      const note = toast(`Copying ${list.length} file${list.length === 1 ? '' : 's'} into the Library…`, 'info', 600000);
      let n = 0;
      try {
        for (const f of list) {
          const x = mode === 'clean' ? flagged.get(f) : null;
          const name = x ? `${f.name.replace(/\.[^.]+$/, '')} (anonymized).md` : f.name;
          const data = x ? new File([root.CVPii.redact(x.text, x.found).text], name, { type: 'text/markdown' }) : f;
          const path = await Save.track('library', () => Vault.saveLibraryFile(cat.folder, name, data));
          await setMeta(path, { docType: L().guessDocType(f.name), always: cat.key === 'directives' });
          n++;
        }
        toast(`${n} file${n === 1 ? '' : 's'} added to ${cat.label}.`, 'success');
      } catch { /* reported by Save */ } finally { note.remove(); }
      draw();
    }
    input.addEventListener('change', () => { const f = [...input.files]; input.value = ''; add(f); });
    folderInput.addEventListener('change', () => { const f = [...folderInput.files]; folderInput.value = ''; add(f); });

    async function draw() {
      let list = [];
      try { list = await items(); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); }
      // v1.149: which document types Draft with AI has examples for, and which have none.
      const examples = list.filter((i) => (L().category(i.category) || {}).role === 'example');
      const cover = L().DOC_TYPES.filter(([k]) => k !== 'any').map(([k, label]) => [k, label, examples.filter((i) => i.docType === k).length]);
      const anyCount = examples.filter((i) => !i.docType || i.docType === 'any').length;
      const coverage = h('div', { class: 'lib-coverage', role: 'list', 'aria-label': 'Examples by document type' },
        h('span', { class: 'lib-cov-title small' }, 'Examples Draft with AI can use:'),
        ...cover.map(([k, label, n]) => h('span', { role: 'listitem', class: `lib-cov${n ? '' : ' none'}`, title: n ? `${n} example${n === 1 ? '' : 's'} of ${label}` : `No ${label} example yet: Draft with AI writes ${label} without one${anyCount ? ' (it uses the Any Document examples)' : ''}` }, label, h('strong', {}, String(n)))));
      box.replaceChildren(coverage, ...L().CATEGORIES.map((cat) => {
        const rows = list.filter((i) => i.category === cat.key);
        return h('div', { class: 'lib-group' },
          h('h4', { title: cat.hint }, cat.label, h('span', { class: 'muted small' }, ` ${rows.length}`)),
          rows.length ? h('ul', { class: 'lib-rows' }, rows.map((it) => row(it, cat))) : h('p', { class: 'muted small lib-empty' }, cat.hint));
      }));
    }

    function row(it, cat) {
      const type = h('select', { class: 'lib-type', 'aria-label': `What ${it.name} is`, title: 'What this is an example of. Draft with AI picks examples of the document type you are writing.' },
        L().DOC_TYPES.map(([k, label]) => h('option', { value: k, selected: k === it.docType }, label)));
      type.addEventListener('change', () => setMeta(it.path, { docType: type.value }).catch(() => {}));
      const always = h('input', { type: 'checkbox', checked: it.always });
      always.addEventListener('change', () => setMeta(it.path, { always: always.checked }).catch(() => {}));
      const move = h('select', { class: 'lib-move', 'aria-label': `Move ${it.name}`, title: 'Move to another part of the Library' },
        L().CATEGORIES.map((c) => h('option', { value: c.key, selected: c.key === cat.key }, c.label)));
      move.addEventListener('change', async () => {
        try {
          const to = await Save.track('library', () => Vault.moveLibraryFile(it.path, L().category(move.value).folder));
          await setMeta(to, { docType: it.docType, always: move.value === 'directives' ? true : it.always });
          draw();
        } catch { /* reported */ }
      });
      return h('li', { class: 'lib-row' },
        h('span', { class: 'lib-name', title: it.name }, it.name.replace(/\.(md|txt)$/i, '')), // v1.27: no .md
        cat.role === 'example' ? type : h('label', { class: 'check-row small', title: 'Send this directive with every Draft with AI.' }, always, h('span', {}, 'Always use')),
        move,
        h('button', { class: 'icon-btn', type: 'button', title: 'Show the text the AI reads', onclick: () => showText(it) }, ui.icon('eye'), h('span', { class: 'sr-only' }, `Show ${it.name}`)),
        h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete from the Library', onclick: async () => {
          if (!(await ui.confirmDialog({ title: 'Delete from the Library?', message: `"${it.name}" will be deleted from CaseVault-Data\\library on the SSD.`, confirmText: 'Delete', danger: true }))) return;
          try { await Save.track('library', () => Vault.deleteLibraryFile(it.path)); draw(); } catch { /* reported */ }
        } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Delete ${it.name}`)));
    }

    async function showText(it) {
      const pre = h('pre', { class: 'lib-text' }, 'Reading…');
      const d = ui.openDialog((close) => h('div', { class: 'lib-preview' },
        h('div', { class: 'preview-head' }, h('h2', {}, it.name), h('div', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
        h('p', { class: 'muted small explain' }, 'This is the text Draft with AI reads from this file, or its first part if it is long.'), pre));
      try { const t = await textOf(it.path); pre.textContent = t.trim() ? t : '(No text found. A scanned PDF needs OCR: open it once in a case, or save it as text.)'; } catch (err) { pre.textContent = `Could not read it: ${err.message}`; }
      await d;
    }

    draw();
    return h('section', { 'data-section': 'library' },
      h('h3', {}, 'Library'),
      h('p', { class: 'muted small explain' }, 'Sample reports and warrants the AI learns to write from (DEA-6, DEA-7, DEA-202…), and directives it follows. Draft with AI uses examples of the document type you are writing, and your "always use" directives. Examples teach the format and wording only: their names and facts are never used. Stored in CaseVault-Data\\library on the SSD; only the AI on this computer reads them.'),
      h('div', { class: 'row lib-add' }, h('span', { class: 'small' }, 'Add to'), target,
        h('button', { class: 'btn small', type: 'button', onclick: () => input.click() }, 'Add files…'),
        h('button', { class: 'btn small', type: 'button', onclick: () => folderInput.click() }, 'Add a folder…'), input, folderInput),
      box);
  }

  /* ---------------- Vault → AI writing behavior ---------------- */

  function behaviorSection() {
    const { h, toast, Save } = ui;
    const box = h('div', {});
    const settings = () => Vault.data.settings;
    const saveAll = (list, def) => Save.track('settings', () => Vault.updateSettings({ aiBehaviors: list, ...(def ? { aiBehaviorDefault: def } : {}) }));

    function draw(selectedId) {
      const list = L().behaviorsOf(settings());
      const def = L().defaultBehaviorId(settings());
      const pick = h('select', { 'aria-label': 'Behavior' }, list.map((b) => h('option', { value: b.id, selected: b.id === (selectedId || def) }, `${b.name}${b.id === def ? ' · Default' : ''}`)));
      const name = h('input', { maxlength: 80, 'aria-label': 'Name' });
      const prompt = h('textarea', { rows: 9, class: 'behavior-prompt', 'aria-label': 'Instruction prompt', spellcheck: 'true' });
      const load = () => { const b = list.find((x) => x.id === pick.value); name.value = b.name; prompt.value = b.prompt; restoreBtn.hidden = !b.builtin; delBtn.hidden = !!b.builtin; };
      const current = () => list.find((x) => x.id === pick.value);
      const restoreBtn = h('button', { class: 'btn small', type: 'button', icon: 'arrow-counterclockwise', title: 'Put this built-in behavior back to how CaseVault ships it.', onclick: async () => {
        const saved = (settings().aiBehaviors || []).filter((x) => x.id !== pick.value);
        try { await saveAll(saved); toast('Restored.', 'success'); draw(pick.value); } catch { /* reported */ }
      } }, 'Restore original');
      const delBtn = h('button', { class: 'btn small danger-ghost ghost', type: 'button', icon: 'trash3', onclick: async () => {
        const saved = (settings().aiBehaviors || []).filter((x) => x.id !== pick.value);
        try { await saveAll(saved, def === pick.value ? 'dea6' : null); draw(); } catch { /* reported */ }
      } }, 'Delete');
      pick.addEventListener('change', load);
      load();
      box.replaceChildren(
        h('div', { class: 'row' }, ui.field('Behavior', pick),
          h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: async () => {
            const id = `custom-${Date.now().toString(36)}`;
            const saved = [...(settings().aiBehaviors || []), { id, name: 'My behavior', prompt: current().prompt }];
            try { await saveAll(saved); draw(id); } catch { /* reported */ }
          } }, 'New')),
        ui.field('Name', name),
        ui.field('Instruction prompt', prompt, '', 'How the AI writes.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', icon: 'check2', title: 'Draft with AI starts with this behavior selected.', onclick: async () => {
            try { await saveAll(settings().aiBehaviors || [], pick.value); toast(`${current().name} is the default.`, 'success'); draw(pick.value); } catch { /* reported */ }
          } }, 'Make Default'),
          restoreBtn, delBtn, h('div', { class: 'spacer' }),
          h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', onclick: async () => {
            const b = current();
            const saved = (settings().aiBehaviors || []).filter((x) => x.id !== b.id);
            saved.push({ id: b.id, name: name.value.trim() || b.name, prompt: prompt.value });
            try { await saveAll(saved); toast('Behavior saved.', 'success'); draw(b.id); } catch { /* reported */ }
          } }, 'Save behavior')));
    }
    draw();
    return h('section', { 'data-section': 'behavior' },
      h('h3', {}, 'AI writing behavior'),
      h('p', { class: 'muted small explain' }, 'The instruction prompt that tells the AI how to write. DEA-6 style is the default; choose another in Draft with AI, edit these, or add your own. Saved in vault.json on the SSD.'),
      box);
  }

  function init(kit) { ui = kit; }

  root.CVLibraryUI = { init, items, texts, librarySection, behaviorSection, addFromReport, scrubScan };
})(this);
