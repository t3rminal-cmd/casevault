/* CaseVault — the "Drafts" tab: draft editor with local-AI suggestions, "Draft with AI",
 * [CONFIRM: ...] checklist, templates, .docx export, and a one-click consistency check.
 *
 * Drafts are Markdown files in cases/<case-id>/drafts/ on the SSD (see draft-core.js). Every AI call
 * goes to the local Ollama engine only (see copilot.js); nothing typed here leaves the computer.
 * Uses the small UI kit app.js exposes as window.CaseVaultUI.
 */
'use strict';

(function (root) {
  let ui = null;
  let pendingGenerate = null; // { caseId, slug } -> open "Draft with AI" when that editor opens
  const AI_BANNER = 'AI-generated draft. Verify every fact against the source before signing or filing.';

  const Engine = () => CVChecks.Engine;
  const aiReady = () => Engine().status() === 'connected' && !!Engine().choice();

  /* =====================================================================
   * List + new draft
   * ===================================================================== */

  async function render(panel, c, token, sub) {
    if (sub) return renderEditor(panel, c, token, decodeURIComponent(sub));
    const { h, state, fmtDateTime, toast, go, Save, confirmDialog } = ui;
    const [drafts, templates] = await Promise.all([Vault.listDrafts(c.id), Vault.listTemplates()]);
    if (token !== state.renderToken) return;
    Engine().refresh().then(() => { if (token === state.renderToken) drawStart(); });

    const title = h('input', { maxlength: 150, placeholder: 'e.g. Affidavit for search warrant', 'aria-label': 'Draft title' });
    const type = h('select', { 'aria-label': 'Document type' }, Object.entries(CVDraft.DOC_TYPES).map(([k, t]) => h('option', { value: k }, t.label)));
    const tplSelect = h('select', { 'aria-label': 'Template' }, templates.map((t) => h('option', { value: t.file }, t.title)));
    // Picking a template suggests the matching document type (affidavit, subpoena, ...).
    const guessType = () => {
      const name = `${tplSelect.value} ${(templates.find((t) => t.file === tplSelect.value) || {}).title || ''}`.toLowerCase();
      const hit = Object.keys(CVDraft.DOC_TYPES).find((k) => k !== 'other' && name.includes(k));
      if (hit) type.value = hit;
    };
    tplSelect.addEventListener('change', guessType);
    const radios = {};
    const radio = (value, label, extra) => {
      radios[value] = h('input', { type: 'radio', name: 'draft-start', value, checked: value === 'blank' });
      if (value === 'template') radios[value].addEventListener('change', guessType);
      return h('label', { class: 'radio-row' }, radios[value], h('span', {}, h('strong', {}, label), extra || null));
    };
    const aiNote = h('span', { class: 'muted small block' });
    const startBox = h('div', { class: 'radio-list' });
    function drawStart() {
      const ready = aiReady();
      radios.ai && (radios.ai.disabled = !ready);
      if (!ready && radios.ai && radios.ai.checked) radios.blank.checked = true;
      aiNote.textContent = ready
        ? `Writes a first draft from this case's details, timeline, notes and attached documents, using ${CVChecks.profileLabel(Engine().choice())}.`
        : 'Needs the local AI engine (header shows "AI: Connected"). Start Start-CaseVault.bat on the CV-AI drive.';
    }
    startBox.append(
      radio('blank', 'Blank'),
      radio('template', 'From a template', templates.length
        ? h('span', { class: 'block' }, tplSelect)
        : h('span', { class: 'muted small block' }, 'No templates yet. ', h('button', { class: 'linkish', type: 'button', onclick: addStarters }, 'Add the 3 generic starter templates'), ' or manage them under Vault → Templates.')),
      radio('ai', 'Draft with AI', aiNote));
    drawStart();

    async function addStarters() {
      try {
        const added = await Save.track('templates', () => Vault.addStarterTemplates());
        toast(`Added ${added.length} starter template${added.length === 1 ? '' : 's'} to CaseVault-Data\\templates.`, 'success');
        ui.refresh();
      } catch { /* reported by Save */ }
    }

    const create = h('button', { class: 'btn primary', type: 'button' }, 'Create draft');
    create.addEventListener('click', async () => {
      const name = title.value.trim() || `${CVDraft.DOC_TYPES[type.value].label} ${new Date().toLocaleDateString()}`;
      const start = Object.values(radios).find((r) => r.checked).value;
      let body = `# ${name}\n\n`;
      try {
        if (start === 'template') {
          if (!templates.length) return toast('Add a template first.', 'error');
          const tpl = await Vault.readTemplate(tplSelect.value);
          body = CVDraft.fillTemplate(tpl, CVDraft.templateContext(state.caseObj || c, new Date(), Vault.data.settings.affiant, await CVClosingUI.templateExtra(state.caseObj || c)));
        }
        if (start === 'ai') body = '';
        const slug = await Vault.newDraftSlug(c.id, name);
        const meta = { title: name, type: type.value, ai: false, created: new Date().toISOString(), ...(start === 'template' ? { template: tplSelect.value } : {}) };
        await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, meta, body));
        if (start === 'ai') pendingGenerate = { caseId: c.id, slug };
        go(c.id, 'drafts', slug);
      } catch { /* reported by Save */ }
    });

    const list = drafts.length
      ? h('table', { class: 'files drafts-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Draft'), h('th', {}, 'Type'), h('th', {}, 'Updated'), h('th', {}, ''))),
        h('tbody', {}, drafts.map((d) => h('tr', {},
          h('td', {}, h('a', { href: `#/case/${encodeURIComponent(c.id)}/drafts/${encodeURIComponent(d.slug)}` }, d.title), d.ai ? h('span', { class: 'layer-badge ai-badge' }, 'AI') : null),
          h('td', { class: 'muted' }, (CVDraft.DOC_TYPES[d.type] || CVDraft.DOC_TYPES.other).label),
          h('td', { class: 'muted' }, d.updated ? fmtDateTime(Date.parse(d.updated)) : ''),
          h('td', { class: 'actions' }, h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
            if (!(await confirmDialog({ title: `Delete "${d.title}"?`, message: 'The draft is permanently deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
            try { await Save.track(`draft-del:${c.id}:${d.slug}`, () => Vault.deleteDraft(c.id, d.slug)); ui.refresh(); } catch { /* reported */ }
          } }, 'Delete'))))))
      : h('p', { class: 'muted' }, 'No drafts yet.');

    const archived = Vault.isArchived(c.id);
    panel.replaceChildren(
      // An archived case is read-only: its drafts can be read and exported, not added to.
      ...(archived ? [] : [h('div', { class: 'card' },
        h('h2', {}, 'New draft'),
        h('div', { class: 'form-grid' }, ui.field('Title', title), ui.field('Type', type)),
        h('div', { class: 'field' }, h('span', {}, 'Start from'), startBox),
        h('div', { class: 'form-actions' }, create))]),
      h('h2', { class: 'section-title' }, 'Drafts'),
      list,
      h('p', { class: 'muted small' }, `Saved on the SSD in ${archived ? 'archive' : 'cases'}\\${c.id}\\drafts as Markdown files. Templates live in CaseVault-Data\\templates (Vault → Templates).`));
  }

  /* =====================================================================
   * Editor
   * ===================================================================== */

  async function renderEditor(panel, c, token, slug) {
    const { h, state, toast, go, Save, confirmDialog } = ui;
    const draft = await Vault.readDraft(c.id, slug);
    if (token !== state.renderToken) return;
    const back = h('a', { href: `#/case/${encodeURIComponent(c.id)}/drafts`, class: 'back-link' }, '← All drafts');
    if (!draft) { panel.replaceChildren(back, h('p', { class: 'error-text' }, 'This draft no longer exists.')); return; }
    const meta = draft.meta;
    const saveKey = `draft:${c.id}:${slug}`;
    const save = (delay = 700) => {
      const body = ta.value;
      const m = { ...meta };
      Save.schedule(saveKey, async () => { Object.assign(meta, await Vault.saveDraft(c.id, slug, m, body)); }, delay);
    };

    // ---- header
    const banner = h('div', { class: 'ai-banner', role: 'note', hidden: !meta.ai }, '⚠ ', AI_BANNER);
    const titleInput = h('input', { class: 'draft-title', value: meta.title, maxlength: 150, 'aria-label': 'Draft title' });
    titleInput.addEventListener('input', () => { meta.title = titleInput.value.trim() || slug; save(); });
    const typeSelect = h('select', { 'aria-label': 'Document type' }, Object.entries(CVDraft.DOC_TYPES).map(([k, t]) => h('option', { value: k, selected: k === meta.type }, t.label)));
    typeSelect.addEventListener('change', () => { meta.type = typeSelect.value; checkBtn.hidden = meta.type !== 'affidavit'; save(0); });

    // ---- editor with the AI suggestion box
    const ta = h('textarea', { class: 'draft-editor', spellcheck: 'true', 'aria-label': 'Draft text', placeholder: 'Write here. Markdown works: # Heading, **bold**, 1. numbered paragraphs. Use [CONFIRM: ...] for facts to check.' });
    ta.value = draft.body;
    // The suggestion box floats just below the cursor line. It never takes focus: the cursor stays
    // in the text, Tab accepts and Esc dismisses. Screen readers hear the suggestion (aria-live).
    const suggContext = h('span', { class: 'sugg-context' });
    const suggText = h('mark', { class: 'sugg-text', title: 'Click to accept' });
    const suggBox = h('div', { class: 'sugg-box', hidden: true },
      h('div', { class: 'sugg-label', 'aria-hidden': 'true' }, 'AI suggestion'),
      h('div', { class: 'sugg-body', 'aria-live': 'polite' }, h('span', { class: 'sr-only' }, 'AI suggestion: '), suggContext, suggText),
      h('div', { class: 'sugg-foot', 'aria-hidden': 'true' }, h('kbd', {}, 'Tab'), ' to accept · ', h('kbd', {}, 'Esc'), ' to dismiss'));
    const wrap = h('div', { class: 'editor-wrap' }, ta, suggBox);
    const preview = h('div', { class: 'notes-preview draft-preview', hidden: true });

    const suggestToggle = h('input', { type: 'checkbox', checked: Vault.data.settings.draftSuggestions !== false });
    const suggestNote = h('span', { class: 'muted small' });
    const suggestionsOn = () => suggestToggle.checked && !suggestToggle.disabled;
    function drawSuggestState() {
      const ready = aiReady() && !!CVCopilot.fastModel(Engine().detected);
      suggestToggle.disabled = !ready;
      suggestNote.textContent = ready ? `(${CVCopilot.fastModel(Engine().detected)}, Tab accepts, Esc dismisses)` : `(off: AI ${Engine().status() === 'rules-only' ? 'is Rules-only' : 'engine offline'})`;
      if (!ready) ghost.stop();
    }
    suggestToggle.addEventListener('change', () => {
      Save.track('settings', () => Vault.updateSettings({ draftSuggestions: suggestToggle.checked })).catch(() => {});
      if (!suggestToggle.checked) ghost.stop();
    });

    const ghost = CVGhost.createGhost({
      delay: 700,
      // One shared queue: no suggestions while a check or "Draft with AI" is using the model.
      fetchSuggestion: async (before, signal) => {
        if (CVActivity.heavyBusy()) return '';
        const det = Engine().detected;
        const model = CVCopilot.fastModel(det);
        const task = CVActivity.begin('suggest', { label: 'Suggesting…', model });
        try {
          return await CVCopilot.suggest({
            fetchImpl: Engine().fetchImpl(), base: det.base, model, before, signal,
            numCtx: CVCopilot.numCtxForModel(det, model),
            caseInfo: { title: c.title, number: c.number, client: c.client },
          });
        } finally { task.end(); }
      },
      onChange: drawGhost,
    });

    // Where the cursor is, in pixels from the textarea's top-left corner (scrolling included):
    // a hidden copy of the textarea's text layout, without its scroll, measures the spot.
    const MEASURE_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'fontKerning',
      'fontFeatureSettings', 'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'textRendering', 'tabSize',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle', 'direction', 'wordBreak'];
    function caretCoords(pos) {
      const cs = getComputedStyle(ta);
      const m = document.createElement('div');
      for (const p of MEASURE_PROPS) m.style[p] = cs[p];
      Object.assign(m.style, {
        position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden', height: 'auto',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', boxSizing: 'content-box', borderColor: 'transparent',
        // Same text width as the textarea (clientWidth leaves out its scrollbar).
        width: `${ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`,
      });
      m.textContent = ta.value.slice(0, pos);
      const marker = document.createElement('span');
      marker.textContent = '​';
      m.append(marker);
      document.body.append(m);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const out = {
        top: marker.offsetTop + parseFloat(cs.borderTopWidth) - ta.scrollTop,
        left: marker.offsetLeft + parseFloat(cs.borderLeftWidth) - ta.scrollLeft,
        height: lh,
      };
      m.remove();
      return out;
    }

    function drawGhost() {
      const g = ghost.ghost;
      if (!g || ghost.anchor < 0 || !ta.isConnected || wrap.hidden) { suggBox.hidden = true; return; }
      suggContext.textContent = CVGhost.sentencePrefix(ta.value, ghost.anchor);
      suggText.textContent = g;
      placeSuggestion();
    }

    function placeSuggestion() {
      if (!ghost.ghost || !ta.isConnected) { suggBox.hidden = true; return; }
      const caret = caretCoords(ghost.anchor);
      // The cursor line is scrolled out of the editor's view: hide the box until it's back.
      if (caret.top + caret.height < 0 || caret.top > ta.clientHeight) { suggBox.hidden = true; return; }
      suggBox.hidden = false;
      const taRect = ta.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const boxW = Math.min(suggBox.offsetWidth, wrapRect.width);
      // Vertical: window coordinates, limited to what is visible of both the editor and the window.
      const place = CVGhost.boxPlacement({
        caretTop: taRect.top + caret.top,
        caretBottom: taRect.top + caret.top + caret.height,
        boxHeight: suggBox.offsetHeight,
        limitTop: Math.max(0, taRect.top),
        limitBottom: Math.min(window.innerHeight, taRect.bottom),
      });
      const left = Math.max(0, Math.min(taRect.left - wrapRect.left + caret.left - 12, wrapRect.width - boxW));
      suggBox.style.top = `${Math.round(place.top - wrapRect.top)}px`;
      suggBox.style.left = `${Math.round(left)}px`;
      suggBox.classList.toggle('above', place.above);
    }

    function acceptSuggestion(r = ghost.key('Tab')) {
      if (!r || !r.accept) return;
      const pos = ta.selectionStart;
      ta.setRangeText(r.accept, pos, pos, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Clicking the suggestion accepts it; mousedown is cancelled so the cursor stays in the text.
    suggBox.addEventListener('mousedown', (e) => e.preventDefault());
    suggText.addEventListener('click', () => { acceptSuggestion(); ta.focus(); });
    // Window resizes and page scrolling move the cursor line too (capture catches any scroller).
    const onResize = () => {
      if (!ta.isConnected) { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); return; }
      if (ghost.ghost) placeSuggestion();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    const tellGhost = () => ghost.update({ text: ta.value, cursor: ta.selectionStart, enabled: suggestionsOn() && ta.selectionStart === ta.selectionEnd && !ta.readOnly, focused: document.activeElement === ta });
    ta.addEventListener('input', () => { tellGhost(); save(); schedulePlaceholders(); });
    ta.addEventListener('click', tellGhost);
    ta.addEventListener('keyup', (e) => { if (/^(Arrow|Home|End|Page)/.test(e.key)) tellGhost(); });
    ta.addEventListener('scroll', () => { if (ghost.ghost) placeSuggestion(); });
    ta.addEventListener('blur', () => ghost.stop());
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' && e.key !== 'Escape') return;
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const r = ghost.key(e.key);
      if (!r) return;
      e.preventDefault();
      acceptSuggestion(r);
    });

    // ---- [CONFIRM: ...] checklist
    const confirmList = h('ol', { class: 'confirm-list' });
    const confirmCount = h('span', { class: 'pill' }, '0');
    function drawPlaceholders() {
      const ph = CVDraft.extractPlaceholders(ta.value);
      confirmCount.textContent = String(ph.length);
      confirmCount.className = `pill ${ph.length ? 'status-pending' : 'status-closed'}`;
      confirmList.replaceChildren(...(ph.length ? ph.map((p) => h('li', {}, h('button', {
        'data-ro-ok': 'true', type: 'button', class: 'linkish', title: `Line ${p.line}`,
        onclick: () => {
          if (!preview.hidden) btnEdit.click();
          ta.focus();
          ta.setSelectionRange(p.start, p.end);
          const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
          ta.scrollTop = Math.max(0, (p.line - 4) * lh);
        },
      }, p.label), h('span', { class: 'muted small' }, ` line ${p.line}`))) : [h('li', { class: 'muted small none' }, 'Nothing left to confirm.')]));
    }
    let phTimer = null;
    const schedulePlaceholders = () => { clearTimeout(phTimer); phTimer = setTimeout(drawPlaceholders, 250); };
    drawPlaceholders();

    // ---- toolbar
    const btnEdit = h('button', { 'data-ro-ok': 'true', class: 'btn small active', type: 'button' }, 'Edit');
    const btnPreview = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button' }, 'Preview');
    btnEdit.addEventListener('click', () => { preview.hidden = true; wrap.hidden = false; btnEdit.classList.add('active'); btnPreview.classList.remove('active'); ta.focus(); });
    btnPreview.addEventListener('click', () => {
      ghost.stop();
      preview.innerHTML = Markdown.render(ta.value) || '<p class="muted">Nothing written yet.</p>'; // Markdown.render escapes everything
      preview.hidden = false; wrap.hidden = true; btnPreview.classList.add('active'); btnEdit.classList.remove('active');
    });
    const genBtn = h('button', { class: 'btn small', type: 'button', onclick: () => openGenerate() }, 'Draft with AI…');
    const checkBtn = h('button', { class: 'btn small', type: 'button', hidden: meta.type !== 'affidavit', onclick: async () => {
      await Save.flushAll();
      CVChecks.checkDraft(c, { slug, title: meta.title, exclude: meta.exports || [] });
    } }, 'Run consistency check');
    const exportMenu = h('details', { class: 'menu' },
      h('summary', { class: 'btn small' }, 'Export ▾'),
      h('div', { class: 'menu-items' },
        h('button', { type: 'button', onclick: () => exportDocx('case') }, 'Save .docx to case files (SSD)'),
        h('button', { 'data-ro-ok': 'true', type: 'button', onclick: () => exportDocx('download') }, 'Save .docx to this computer…'),
        h('button', { 'data-ro-ok': 'true', type: 'button', onclick: copyPlain }, 'Copy as plain text')));
    // Drafts save by themselves; Save (or Ctrl+S) writes now and says so.
    const saveBtn = h('button', { class: 'btn small primary', type: 'button', title: 'Save now (Ctrl+S). Drafts also save by themselves.', onclick: async () => {
      save(0);
      await Save.flushAll();
      if (!Save.failed.has(saveKey)) toast(`Saved to the SSD (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`, 'success', 2500);
    } }, 'Save');
    const delBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
      if (!(await confirmDialog({ title: `Delete "${meta.title}"?`, message: 'The draft is permanently deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
      const t = Save.timers.get(saveKey);
      if (t) { clearTimeout(t.timer); Save.timers.delete(saveKey); }
      try { await Save.track(`draft-del:${c.id}:${slug}`, () => Vault.deleteDraft(c.id, slug)); go(c.id, 'drafts'); } catch { /* reported */ }
    } }, 'Delete');

    const genStatus = h('div', { class: 'gen-status', hidden: true });

    panel.replaceChildren(
      back,
      banner,
      h('div', { class: 'draft-head' }, titleInput, typeSelect),
      h('div', { class: 'toolbar draft-toolbar' },
        h('div', { class: 'segmented' }, btnEdit, btnPreview),
        h('label', { class: 'check-row suggest-toggle' }, suggestToggle, h('span', {}, 'AI suggestions ', suggestNote)),
        h('div', { class: 'spacer' }),
        genBtn, checkBtn, exportMenu, saveBtn, delBtn),
      genStatus,
      h('div', { class: 'draft-grid' },
        h('div', { class: 'draft-main' }, wrap, preview),
        h('aside', { class: 'confirm-panel' },
          h('h3', {}, 'To confirm ', confirmCount),
          h('p', { class: 'muted small' }, 'Every [CONFIRM: ...] in the draft. Click one to jump to it, then replace it with the checked fact.'),
          confirmList)));
    drawSuggestState();
    Engine().refresh().then(() => { if (ta.isConnected) drawSuggestState(); });

    /* ---- export ---- */

    function docxName() {
      return `${FS.safeName(meta.title || slug).replace(/\.docx$/i, '')}.docx`;
    }

    async function exportDocx(where) {
      exportMenu.open = false;
      const bytes = CVDocx.buildDocx(ta.value, { title: meta.title });
      const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (where === 'case') {
        try {
          // Filed by the case's naming convention: an affidavit draft becomes Affidavits\2026-00123 Affidavit - <title>.docx
          const folder = { affidavit: 'Affidavits', summary: 'Case Report' }[meta.type] || 'Other';
          const description = folder === 'Other' || !/^(affidavit|case report)$/i.test((meta.title || '').trim()) ? (meta.title || '') : '';
          const name = await Save.track(`file:${c.id}:${docxName()}`, () => Vault.addFile(c.id, new File([bytes], docxName(), { type }), { folder, description }));
          // Remember exports so the draft's consistency check never compares the draft with its own copy.
          meta.exports = [...new Set([...(meta.exports || []), name])];
          save(0);
          toast(`Saved to this case's Files as ${name.replace('/', '\\')}.`, 'success');
        } catch { /* reported by Save */ }
        return;
      }
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: docxName(), types: [{ description: 'Word document', accept: { [type]: ['.docx'] } }] });
          const w = await handle.createWritable();
          await w.write(bytes);
          await w.close();
          toast(`Saved ${handle.name}.`, 'success');
        } catch (err) { if (err.name !== 'AbortError') toast(`Could not save: ${err.message}`, 'error'); }
        return;
      }
      // Firefox: the browser's own download / save dialog.
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const a = h('a', { href: url, download: docxName(), hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    async function copyPlain() {
      exportMenu.open = false;
      try {
        await navigator.clipboard.writeText(CVDraft.stripMarkdown(ta.value));
        toast('Copied as plain text.', 'success');
      } catch {
        toast('The browser did not allow copying. Select the text and press Ctrl+C.', 'error');
      }
    }

    /* ---- Draft with AI ---- */

    let genCtrl = null;
    const stopOnLeave = () => { if (genCtrl) genCtrl.abort(); window.removeEventListener('hashchange', stopOnLeave); };
    window.addEventListener('hashchange', stopOnLeave);

    // Every installed chat model is under 5B parameters (and it isn't the in-browser engine's own choice).
    function onlySmallModels() {
      const det = Engine().detected;
      const chat = (det && det.chat) || [];
      return !Engine().inBrowser() && chat.length > 0 && chat.every((m) => m.size != null && m.size < 5);
    }

    async function openGenerate() {
      await Engine().refresh();
      if (!aiReady()) return toast('The local AI engine is not connected. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
      const [files, templates] = await Promise.all([Vault.listFiles(c.id), Vault.listTemplates()]);
      const docs = files.filter((f) => CVExtract.kindOf(f.name));
      const opts = await ui.openDialog((close) => {
        const type = h('select', {}, Object.entries(CVDraft.DOC_TYPES).map(([k, t]) => h('option', { value: k, selected: k === meta.type }, t.label)));
        const tpl = h('select', {}, h('option', { value: '' }, '(none: use the standard structure)'),
          templates.map((t) => h('option', { value: t.file, selected: t.file === meta.template }, t.title)));
        const useTimeline = h('input', { type: 'checkbox', checked: true });
        const useNotes = h('input', { type: 'checkbox', checked: true });
        const docBoxes = docs.map((f) => h('input', { type: 'checkbox', value: f.name, checked: true }));
        const instr = h('textarea', { rows: 3, placeholder: 'Optional, e.g. "Focus on the events of March 14" or "Formal tone, third person".' });
        const replace = h('input', { type: 'radio', name: 'gen-mode', value: 'replace', checked: !ta.value.trim() });
        const append = h('input', { type: 'radio', name: 'gen-mode', value: 'append', checked: !!ta.value.trim() });
        return h('form', { class: 'gen-form', onsubmit: (e) => {
          e.preventDefault();
          close({ type: type.value, template: tpl.value, timeline: useTimeline.checked, notes: useNotes.checked, docs: docBoxes.filter((b) => b.checked).map((b) => b.value), instructions: instr.value.trim(), mode: replace.checked ? 'replace' : 'append' });
        } },
        h('h2', {}, 'Draft with AI'),
        h('p', { class: 'muted small' }, `Uses ${CVChecks.profileLabel(Engine().choice())} on this computer. The AI is told to use only this case's material and to write [CONFIRM: ...] for anything missing.`),
        onlySmallModels() ? h('p', { class: 'warn-text small small-model-note' }, 'Small model: fine for suggestions, weak for full drafts. Install qwen2.5:7b for better drafts.') : null,
        h('div', { class: 'form-grid' }, ui.field('Document type', type), ui.field('Template', tpl)),
        h('div', { class: 'field' }, h('span', {}, 'Use'),
          h('div', { class: 'check-reports' },
            h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: true, disabled: true }), h('span', {}, 'Case details')),
            h('label', { class: 'check-row' }, useTimeline, h('span', {}, 'Timeline')),
            h('label', { class: 'check-row' }, useNotes, h('span', {}, 'Notes')),
            docBoxes.map((b) => h('label', { class: 'check-row' }, b, h('span', {}, b.value))),
            docs.length ? null : h('p', { class: 'muted small' }, 'No attached documents to draw on.'))),
        ui.field('Instructions', instr),
        ta.value.trim() ? h('div', { class: 'row' }, h('label', { class: 'check-row' }, replace, h('span', {}, 'Replace the current text')), h('label', { class: 'check-row' }, append, h('span', {}, 'Add below the current text'))) : null,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Generate')));
      });
      if (opts) generate(opts);
    }

    async function generate(opts) {
      const choice = Engine().choice();
      const det = Engine().detected;
      ghost.stop();
      genCtrl = new AbortController();
      const ctrl = genCtrl;
      const stop = h('button', { class: 'btn small', type: 'button', onclick: () => ctrl.abort() }, 'Stop');
      const msg = h('span', {}, 'Gathering the case material…');
      genStatus.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), msg, h('div', { class: 'spacer' }), stop);
      genStatus.hidden = false;
      ta.readOnly = true;
      genBtn.disabled = true;
      const start = opts.mode === 'append' ? `${ta.value.replace(/\s+$/, '')}\n\n` : '';
      let text = '';
      const show = () => { if (ta.isConnected) { ta.value = start + text; ta.scrollTop = ta.scrollHeight; } };
      const saveNow = (delay) => {
        const m = { ...meta };
        const body = start + text;
        Save.schedule(saveKey, async () => { Object.assign(meta, await Vault.saveDraft(c.id, slug, m, body)); }, delay);
      };
      try {
        const [caseObj, timeline, notes] = await Promise.all([
          Vault.getCase(c.id), opts.timeline ? Vault.getTimeline(c.id) : { events: [] }, opts.notes ? Vault.getNotes(c.id) : '',
        ]);
        const docs = [];
        for (const name of opts.docs) {
          if (ctrl.signal.aborted) break;
          msg.textContent = `Reading ${name}…`;
          try {
            const d = await CVChecks.documentText(c, name, (m) => { msg.textContent = `Reading ${name}: ${m}`; });
            docs.push({ name, docIndex: docs.length, paragraphs: d.paragraphs });
          } catch (err) {
            if (FS.isDisconnectError(err)) throw err;
            toast(`Skipped ${name}: ${err.message}`, 'error', 6000);
          }
        }
        if (ctrl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        if (CVActivity.heavyBusy()) msg.textContent = 'Waiting for the consistency check to finish…';
        await CVActivity.exclusive('draft', async () => {
          if (ctrl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
          const numCtx = CVAI.numCtxFor(choice.profile);
          msg.textContent = 'Finding the relevant passages…';
          const typeLabel = (CVDraft.DOC_TYPES[opts.type] || CVDraft.DOC_TYPES.other).label;
          const query = [typeLabel, caseObj.title, opts.instructions, String(notes).slice(0, 600), ...(timeline.events || []).map((e) => e.title)].join(' ');
          const hits = await CVCopilot.relevantPassages({ docs, query, engine: { base: det.base, embed: det.embed }, fetchImpl: Engine().fetchImpl() });
          const passages = hits.map((p) => ({ ...p, docName: docs[p.doc].name }));
          const template = opts.template ? CVDraft.fillTemplate(await Vault.readTemplate(opts.template), CVDraft.templateContext(caseObj, new Date(), Vault.data.settings.affiant, await CVClosingUI.templateExtra(caseObj))) : '';
          const messages = CVCopilot.draftMessages({ type: opts.type, template, instructions: opts.instructions, caseObj, timeline, notes, passages, numCtx });

          Object.assign(meta, {
            ai: true, type: opts.type, ...(opts.template ? { template: opts.template } : {}),
            generated: { model: choice.model, at: new Date().toISOString(), sources: ['case details', opts.timeline && 'timeline', opts.notes && 'notes', ...opts.docs].filter(Boolean) },
          });
          banner.hidden = false;
          typeSelect.value = meta.type;
          checkBtn.hidden = meta.type !== 'affidavit';
          msg.textContent = `Writing with ${choice.model}…`;
          show();
          await CVCopilot.streamChat({
            fetchImpl: Engine().fetchImpl(),
            base: det.base, model: choice.model, messages, signal: ctrl.signal, numCtx,
            onText: (piece) => { text += piece; show(); saveNow(1500); schedulePlaceholders(); },
          });
        }, { label: 'Drafting…', model: choice.model });
        saveNow(0);
        toast('Draft written. Check every [CONFIRM: ...] and verify each fact against the source.', 'success', 8000);
      } catch (err) {
        if (ctrl.signal.aborted) {
          if (text) saveNow(0);
          toast(text ? 'Stopped. The text so far is kept.' : 'Stopped.');
        } else if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') {
          ui.onDriveLost();
        } else {
          if (text) saveNow(0);
          toast(`Draft with AI failed: ${err.message}`, 'error', 10000);
        }
      } finally {
        if (genCtrl === ctrl) genCtrl = null;
        genStatus.hidden = true;
        ta.readOnly = false;
        genBtn.disabled = false;
        drawPlaceholders();
      }
    }

    if (pendingGenerate && pendingGenerate.caseId === c.id && pendingGenerate.slug === slug) {
      pendingGenerate = null;
      openGenerate();
    } else {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  /* =====================================================================
   * Templates (shown in the Vault panel)
   * ===================================================================== */

  function templateSettings() {
    const { h, toast, Save } = ui;
    const box = h('div', {});
    const editor = h('div', { class: 'template-editor', hidden: true });

    async function draw() {
      let list = [];
      try { list = await Vault.listTemplates(); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); }
      box.replaceChildren(list.length
        ? h('ul', { class: 'plain-list template-list' }, list.map((t) => h('li', {},
          h('span', {}, t.title, h('span', { class: 'muted small' }, ` · ${t.file}`)),
          h('span', {},
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => edit(t.file) }, 'Edit'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              if (!window.confirm(`Delete the template "${t.title}" from the SSD?`)) return;
              try { await Save.track('templates', () => Vault.deleteTemplate(t.file)); draw(); } catch { /* reported */ }
            } }, 'Delete')))))
        : h('p', { class: 'muted small' }, 'No templates yet.'));
    }

    function edit(file, text) {
      const name = h('input', { value: file || '', placeholder: 'agency-affidavit.md', 'aria-label': 'File name', class: 'template-name' });
      const area = h('textarea', { rows: 12, class: 'template-text', 'aria-label': 'Template text' });
      area.value = text != null ? text : '';
      if (file && text == null) Vault.readTemplate(file).then((t) => { area.value = t || ''; });
      editor.replaceChildren(
        ui.field('File name', name),
        area,
        h('p', { class: 'muted small' }, 'Placeholders: {{case.title}} {{case.number}} {{case.client}} {{case.status}} {{case.opened}} {{case.tags}} {{today}} {{today.iso}}, and {{confirm: what to check}}. Anything missing becomes [CONFIRM: ...].'),
        h('div', { class: 'row' },
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => { editor.hidden = true; } }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'button', onclick: async () => {
            let fname = name.value.trim() || 'template.md';
            if (!/\.md$/i.test(fname)) fname += '.md';
            try {
              await Save.track('templates', () => Vault.saveTemplate(fname, area.value));
              if (file && FS.safeName(fname) !== file) await Vault.deleteTemplate(file);
              editor.hidden = true;
              toast('Template saved to CaseVault-Data\\templates.', 'success');
              draw();
            } catch { /* reported by Save */ }
          } }, 'Save template')));
      editor.hidden = false;
      area.focus();
    }

    const importInput = h('input', { type: 'file', accept: '.md,.txt,text/markdown,text/plain', hidden: true });
    importInput.addEventListener('change', async () => {
      const f = importInput.files[0];
      importInput.value = '';
      if (f) edit(f.name.replace(/\.txt$/i, '.md'), await f.text());
    });

    draw();
    return h('section', {},
      h('h3', {}, 'Templates'),
      h('p', { class: 'muted small' }, 'Your own document formats for Drafts (Markdown files in CaseVault-Data\\templates on the SSD).'),
      box,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => edit('', '# New template\n\nCase No. {{case.number}}\n') }, 'New template'),
        h('button', { class: 'btn small', type: 'button', onclick: () => importInput.click() }, 'Import .md…'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          try { const added = await Save.track('templates', () => Vault.addStarterTemplates()); toast(added.length ? `Added ${added.length} generic starter template${added.length === 1 ? '' : 's'}.` : 'The starter templates are already there.', 'success'); draw(); } catch { /* reported */ }
        } }, 'Add generic starter templates'),
        importInput),
      editor);
  }

  function init(kit) { ui = kit; }

  root.CVDraftsUI = { init, render, templateSettings };
})(this);
