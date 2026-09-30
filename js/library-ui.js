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
      const note = toast(`Copying ${list.length} file${list.length === 1 ? '' : 's'} into the Library…`, 'info', 600000);
      let n = 0;
      try {
        for (const f of list) {
          const path = await Save.track('library', () => Vault.saveLibraryFile(cat.folder, f.name, f));
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
      box.replaceChildren(...L().CATEGORIES.map((cat) => {
        const rows = list.filter((i) => i.category === cat.key);
        return h('div', { class: 'lib-group' },
          h('h4', { title: cat.hint }, ui.icon(cat.icon), cat.label, h('span', { class: 'muted small' }, ` ${rows.length}`)),
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
        h('span', { class: 'lib-name', title: it.name }, it.name),
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
        h('button', { class: 'btn small', type: 'button', icon: 'upload', onclick: () => input.click() }, 'Add files…'),
        h('button', { class: 'btn small', type: 'button', icon: 'folder2-open', onclick: () => folderInput.click() }, 'Add a folder…'), input, folderInput),
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

  root.CVLibraryUI = { init, items, texts, librarySection, behaviorSection };
})(this);
