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
    const [drafts, templates, notesText] = await Promise.all([Vault.listDrafts(c.id), Vault.listTemplates(), Vault.getNotes(c.id).catch(() => '')]);
    if (token !== state.renderToken) return;
    Engine().refresh().then(() => { if (token === state.renderToken) drawStart(); });

    const title = h('input', { maxlength: 150, placeholder: 'e.g. Affidavit for search warrant', 'aria-label': 'Report title' });
    const type = h('select', { 'aria-label': 'Document type' }, Object.entries(CVDraft.DOC_TYPES).map(([k, t]) => h('option', { value: k }, t.label)));
    const tplSelect = h('select', { 'aria-label': 'Template' }, templates.map((t) => h('option', { value: t.file }, t.title)));
    // Picking a template suggests the matching document type (affidavit, subpoena, ...).
    const guessType = () => {
      const name = `${tplSelect.value} ${(templates.find((t) => t.file === tplSelect.value) || {}).title || ''}`.toLowerCase();
      const hit = Object.keys(CVDraft.DOC_TYPES).find((k) => k !== 'other' && name.includes(k));
      if (hit) type.value = hit;
    };
    tplSelect.addEventListener('change', guessType);
    // How to start: a dropdown (Blank, Template, Draft with AI). The template list shows under it
    // when Template is picked.
    const startSel = h('select', { 'aria-label': 'Start from' },
      h('option', { value: 'blank' }, 'Blank'), h('option', { value: 'template' }, 'Template'), h('option', { value: 'ai' }, 'Draft with AI'));
    const aiNote = h('span', { class: 'muted small block' });
    const tplRow = h('div', { class: 'start-template', hidden: true }, templates.length
      ? tplSelect
      : h('span', { class: 'muted small block' }, 'No templates yet. ', h('button', { class: 'linkish', type: 'button', onclick: addStarters }, 'Add the starter templates'), ' or manage them under Vault → Templates.'));
    const startBox = h('div', { class: 'start-box' }, startSel, tplRow, aiNote);
    function drawStart() {
      const ready = aiReady();
      const aiOpt = startSel.querySelector('option[value="ai"]');
      aiOpt.disabled = !ready;
      if (!ready && startSel.value === 'ai') startSel.value = 'blank';
      tplRow.hidden = startSel.value !== 'template';
      aiNote.hidden = startSel.value !== 'ai';
      aiNote.textContent = ready
        ? `Writes a first draft from this case's details, timeline, notes, report fields and attached documents, using ${CVChecks.profileLabel(Engine().choice())}.`
        : 'Draft with AI needs the local AI engine. Start Start-CaseVault.bat on the CV-AI drive.';
      if (startSel.value === 'template') guessType();
    }
    startSel.addEventListener('change', drawStart);
    drawStart();

    async function addStarters() {
      try {
        const added = await Save.track('templates', () => Vault.addStarterTemplates());
        toast(`Added ${added.length} starter template${added.length === 1 ? '' : 's'} to CaseVault-Data\\templates.`, 'success');
        ui.refresh();
      } catch { /* reported by Save */ }
    }

    // New ▾ (v1.31): Notes opens the Field Notes; Report asks for a title, type and how to start.
    let closeNew = null;
    const create = h('button', { class: 'btn primary', type: 'submit' }, 'Create Report');
    create.addEventListener('click', async (e) => {
      e.preventDefault();
      if (closeNew) closeNew();
      const name = title.value.trim() || CVDraft.DOC_TYPES[type.value].label;
      const start = startSel.value;
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
        go(c.id, 'reports', slug);
      } catch { /* reported by Save */ }
    });

    // Reports: every report of the case (v1.32: the Field Notes aren't listed here; they're in the
    // Notes button at the bottom right). No dates.
    const I = (n) => ui.icon(n);
    // v1.34: the AI tag has its own column; each report has an icon, its type as a tag, and a bin.
    const list = h('table', { class: 'files drafts-table reports-table' },
      h('colgroup', {}, h('col', {}), h('col', { class: 'col-rtype' }), h('col', { class: 'col-ai' }), h('col', { class: 'col-ract' })),
      h('thead', {}, h('tr', {}, h('th', {}, 'Report'), h('th', {}, 'Type'), h('th', { class: 'ai-col', title: 'Written with Draft with AI' }, 'AI'), h('th', {}, h('span', { class: 'sr-only' }, 'Delete')))),
      h('tbody', {}, drafts.length ? drafts.map((d) => h('tr', {},
        h('td', { class: 'report-name' }, h('a', { href: `#/case/${encodeURIComponent(c.id)}/reports/${encodeURIComponent(d.slug)}` }, h('span', { class: 'report-icon', 'aria-hidden': 'true' }, I(d.fromFields ? 'clipboard2-check' : 'file-earmark-text')), h('span', { class: 'report-title' }, d.title))),
        h('td', {}, h('span', { class: 'type-tag' }, (CVDraft.DOC_TYPES[d.type] || CVDraft.DOC_TYPES.other).label)),
        h('td', { class: 'ai-col' }, d.ai ? h('span', { class: 'layer-badge ai-badge', title: 'Written with Draft with AI' }, I('robot'), 'AI') : h('span', { class: 'muted', 'aria-label': 'No' }, '—')),
        h('td', { class: 'actions' }, h('button', { class: 'icon-btn danger-icon', type: 'button', title: `Delete ${d.title}`, onclick: async () => {
          if (!(await confirmDialog({ title: `Delete "${d.title}"?`, message: 'The report is permanently deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
          try { await Save.track(`draft-del:${c.id}:${d.slug}`, () => Vault.deleteDraft(c.id, d.slug)); ui.refresh(); } catch { /* reported */ }
        } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${d.title}`))))) : [h('tr', {}, h('td', { colspan: 4, class: 'muted' }, 'No reports yet. Fill in the Draft tab and click Send Draft to Reports, or use New Report.'))]));

    const archived = Vault.isArchived(c.id);
    const newReport = () => ui.openDialog((close) => {
      closeNew = close;
      return h('form', { class: 'form-grid new-report-form', onsubmit: (e) => e.preventDefault() },
        h('h2', { class: 'span-2' }, 'New Report'),
        ui.field('Title', title), ui.field('Type', type),
        h('div', { class: 'field span-2' }, h('span', {}, 'Start from'), startBox),
        h('div', { class: 'dialog-actions span-2' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), create));
    }).then(() => { closeNew = null; });
    const newBtn = h('button', { class: 'btn small primary new-report-btn', type: 'button', icon: 'plus-lg', onclick: () => newReport() }, 'New Report');
    // Field Notes (v1.33): their own section at the top, always there; what you save in the notes
    // (here or in the Notes box) shows here.
    const notesPlain = String(notesText || '').replace(/\*\*|\+\+|__|[#>*_`]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const words = (notesPlain.match(/\S+/g) || []).length;
    const notesUrl = `#/case/${encodeURIComponent(c.id)}/reports/.notes`;
    // v1.34: Field Notes and Reports are two cards, each with an icon in its heading.
    const notesSection = h('section', { class: 'rpt-card notes-section' },
      h('div', { class: 'reports-head' }, h('span', { class: 'rpt-icon', 'aria-hidden': 'true' }, I('journal-text')), h('h2', { class: 'section-title' }, 'Field Notes'), h('div', { class: 'spacer' }),
        h('span', { class: 'count-pill' }, words ? `${words} word${words === 1 ? '' : 's'}` : 'Empty'),
        h('a', { class: 'btn small', href: notesUrl }, I('pencil-square'), archived ? ' Open' : ' Open and Edit')),
      h('a', { class: 'notes-card', href: notesUrl, title: 'Open the Field Notes' },
        notesPlain ? h('div', { class: 'notes-card-text' }, notesPlain.length > 900 ? `${notesPlain.slice(0, 900).replace(/\s+\S*$/, '')}…` : notesPlain)
          : h('div', { class: 'notes-empty' }, I('pencil'), h('span', {}, 'No field notes yet. Click here to write them; they save as you type.'))));
    panel.replaceChildren(
      notesSection,
      h('section', { class: 'rpt-card reports-section' },
        h('div', { class: 'reports-head' }, h('span', { class: 'rpt-icon', 'aria-hidden': 'true' }, I('files')), h('h2', { class: 'section-title' }, 'Reports'),
          h('span', { class: 'count-pill' }, String(drafts.length)), h('div', { class: 'spacer' }),
          // An archived case is read-only: its reports can be read and exported, not added to.
          archived ? null : newBtn),
        list),
      h('p', { class: 'muted small explain' }, `Every report, draft or AI draft for this case. Saved on the SSD in ${CVFormat.pathText(`${archived ? 'archive' : 'cases'}\\${c.id}`)}, in the drafts folder, as Markdown files. Templates live in CaseVault-Data | templates (Vault → Templates).`));
  }

  /* =====================================================================
   * Editor
   * ===================================================================== */

  async function renderEditor(panel, c, token, slug) {
    const { h, state, toast, go, Save, confirmDialog } = ui;
    const draft = await Vault.readDraft(c.id, slug);
    if (token !== state.renderToken) return;
    const back = h('a', { href: `#/case/${encodeURIComponent(c.id)}/reports`, class: 'back-link' }, '← All reports');
    if (!draft) { panel.replaceChildren(back, h('p', { class: 'error-text' }, 'This draft no longer exists.')); return; }
    const meta = draft.meta;
    const saveKey = `draft:${c.id}:${slug}`;
    const save = (delay = 700) => {
      const body = ta.value;
      const m = { ...meta };
      Save.schedule(saveKey, async () => { Object.assign(meta, await Vault.saveDraft(c.id, slug, m, body)); }, delay);
    };

    // ---- header
    const banner = h('div', { class: 'ai-banner', role: 'note', hidden: !meta.ai }, ui.icon('exclamation-triangle-fill'), ' ', AI_BANNER);
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
    // Formatted view (bold shows bold, as in Word) over the Markdown text box (v1.19).
    const rich = CVRichEditor.create(ta, { h, icon: ui.icon, label: 'Draft text' });
    const wrap = h('div', { class: 'editor-wrap' }, rich.el, ta, suggBox);

    const suggestToggle = h('input', { type: 'checkbox', checked: Vault.data.settings.draftSuggestions !== false });
    const suggestNote = h('span', { class: 'muted small' });
    const suggestLabel = h('label', { class: 'check-row suggest-toggle', title: 'Suggestions as you type, in the Markdown view.' }, suggestToggle, h('span', {}, 'AI suggestions ', suggestNote));
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
      // Vertical: window coordinates, limited to what is visible of both the editor and the window.
      const place = CVGhost.boxPlacement({
        caretTop: taRect.top + caret.top,
        caretBottom: taRect.top + caret.top + caret.height,
        boxHeight: suggBox.offsetHeight,
        limitTop: Math.max(0, taRect.top),
        limitBottom: Math.min(window.innerHeight, taRect.bottom),
      });
      // Fixed size, lined up with the text's left edge: the box only moves down with the cursor
      // line and never changes size while you type (v1.11).
      const left = Math.max(0, taRect.left - wrapRect.left + (parseFloat(getComputedStyle(ta).paddingLeft) || 0) - 8);
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
    // Runs before the formatting bar's Tab-to-indent (capture): when a suggestion is showing,
    // Tab takes it; otherwise Tab indents.
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' && e.key !== 'Escape') return;
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const r = ghost.key(e.key);
      if (!r) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      acceptSuggestion(r);
    }, true);

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
          if (rich.active()) {
            // The nth time this exact placeholder appears, found in the formatted view.
            let nth = 0; let at = -1;
            while ((at = ta.value.indexOf(p.text, at + 1)) >= 0 && at < p.start) nth += 1;
            if (rich.selectText(p.text, nth)) return;
            rich.setMode('markdown');
          }
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
    // v1.34: in this order, each with its icon: Word View, PDF View, Draft with AI, Re-phrase, Review, Export, Save, Delete.
    const wordViewBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'file-earmark-word', title: 'Shows this report as the Word document Export makes. Save it to the case files or to this computer from there.', onclick: () => wordView() }, 'Word View');
    const genBtn = h('button', { class: 'btn small', type: 'button', icon: 'robot', onclick: () => openGenerate() }, 'Draft with AI');
    // PDF View (v1.31): the report as a PDF, in the Supplementary Report's style; save it from there.
    const pdfViewBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'file-earmark-pdf', title: 'Shows this report as a PDF. Print it, download it, or save it to the case files.', onclick: () => pdfView() }, 'PDF View');
    const rephraseBtn = h('button', { class: 'btn small', type: 'button', icon: 'magic', title: 'Select a sentence or paragraph, then click: the AI on this computer rewrites it the way DEA reports are written. You see both before anything changes.', onclick: () => rephrase() }, 'Re-phrase');
    const reviewBtn = h('button', { class: 'btn small', type: 'button', icon: 'clipboard2-check', title: 'Checks that the totals add up (money and weights), then has the AI on this computer look for names, dates, amounts and facts that don\'t agree.', onclick: () => review() }, 'Review');
    const checkBtn = h('button', { class: 'btn small', type: 'button', hidden: meta.type !== 'affidavit', onclick: async () => {
      await Save.flushAll();
      CVChecks.checkDraft(c, { slug, title: meta.title, exclude: meta.exports || [] });
    } }, 'Run consistency check');
    // Export (v1.34): just the three choices. The report is saved as a Word document (.docx).
    const exportMenu = h('details', { class: 'menu export-menu' },
      h('summary', { class: 'btn small', title: 'Save this report as a Word document, or as a template' }, ui.icon('download'), ' Export ▾'),
      h('div', { class: 'menu-items' },
        h('button', { type: 'button', title: 'Saves it as a Word document in this case\'s Files', onclick: () => exportDocx('case') }, ui.icon('folder-plus'), ' Save to Case Files'),
        h('button', { 'data-ro-ok': 'true', type: 'button', title: 'Saves it as a Word document where you choose on this computer', onclick: () => exportDocx('download') }, ui.icon('pc-display'), ' Save to PC'),
        h('button', { type: 'button', title: 'Keeps this report\'s text as a template in Vault → Templates', onclick: saveAsTemplate }, ui.icon('bookmark-plus'), ' Save Template')));
    // Drafts save by themselves; Save (or Ctrl+S) writes now and says so.
    const saveBtn = h('button', { class: 'btn small primary', type: 'button', icon: 'floppy', title: 'Save now (Ctrl+S). Drafts also save by themselves.', onclick: async () => {
      save(0);
      await Save.flushAll();
      if (!Save.failed.has(saveKey)) toast(`Saved to the SSD (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`, 'success', 2500);
    } }, 'Save');
    const delBtn = h('button', { class: 'btn small danger-ghost', type: 'button', icon: 'trash3', title: 'Delete this report from the SSD', onclick: async () => {
      if (!(await confirmDialog({ title: `Delete "${meta.title}"?`, message: 'The draft is permanently deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
      const t = Save.timers.get(saveKey);
      if (t) { clearTimeout(t.timer); Save.timers.delete(saveKey); }
      try { await Save.track(`draft-del:${c.id}:${slug}`, () => Vault.deleteDraft(c.id, slug)); go(c.id, 'reports'); } catch { /* reported */ }
    } }, 'Delete');

    const genStatus = h('div', { class: 'gen-status', hidden: true });
    const fmtBar = CVFormatBar.attach(ta, { h, icon: ui.icon, rich });
    // AI suggestions follow the cursor in the Markdown text, so they run in that view.
    const drawSuggestMode = (m) => { suggestLabel.hidden = m === 'rich'; if (m === 'rich') ghost.stop(); };

    panel.replaceChildren(
      back,
      banner,
      h('div', { class: 'draft-head' }, titleInput, typeSelect),
      h('div', { class: 'draft-actions-bar' }, wordViewBtn, pdfViewBtn, genBtn, rephraseBtn, reviewBtn, checkBtn, exportMenu, h('div', { class: 'spacer' }), saveBtn, delBtn),
      h('div', { class: 'toolbar draft-toolbar' },
        fmtBar,
        suggestLabel),
      genStatus,
      h('div', { class: 'draft-grid' },
        h('div', { class: 'draft-main' }, wrap),
        h('aside', { class: 'confirm-panel' },
          h('h3', {}, 'To confirm ', confirmCount),
          h('p', { class: 'muted small explain' }, 'Every [CONFIRM: ...] in the draft. Click one to jump to it, then replace it with the checked fact.'),
          confirmList)));
    drawSuggestState();
    rich.onMode(drawSuggestMode);
    drawSuggestMode(rich.mode());
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
          // Filed by the case's naming convention. Affidavits go with their warrants (v1.15):
          // Warrant Drafts\2026-00123 Warrant Draft - Affidavit - <title>.docx
          const folder = { affidavit: 'Warrant Drafts', subpoena: 'Subpoena Drafts', summary: 'Case Report', dea6: 'Case Report' }[meta.type] || 'Other';
          const title = (meta.title || '').trim();
          const description = meta.type === 'affidavit' ? `Affidavit${title && !/^affidavit$/i.test(title) ? ` - ${title.replace(/^affidavit\s*[-:]\s*/i, '')}` : ''}`
            : folder === 'Other' || !/^(affidavit|case report)$/i.test(title) ? title : '';
          const name = await Save.track(`file:${c.id}:${docxName()}`, () => Vault.addFile(c.id, new File([bytes], docxName(), { type }), { folder, description }));
          // Remember exports so the draft's consistency check never compares the draft with its own copy.
          meta.exports = [...new Set([...(meta.exports || []), name])];
          save(0);
          toast(`Saved to this case's Files as ${CVFormat.pathText(name)}.`, 'success');
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

    // Export → Save as a template: this report's text becomes a template in Vault → Templates.
    async function saveAsTemplate() {
      exportMenu.open = false;
      const name = await ui.openDialog((close) => {
        const inp = h('input', { type: 'text', value: meta.title, maxlength: 80, autofocus: true });
        return h('form', { onsubmit: (e) => { e.preventDefault(); close(inp.value.trim()); } },
          h('h2', {}, 'Save as a template'),
          h('p', { class: 'muted small' }, 'Replace this case\'s details with {{placeholders}} afterwards in Vault → Templates (for example {{case.number}}), or use Options → Dev Tools to make it fictitious first.'),
          ui.field('Template name', inp),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save template')));
      });
      if (!name) return;
      const file = `${name.replace(/\.md$/i, '')}.md`;
      try { await Save.track(`template:${file}`, () => Vault.saveTemplate(file, ta.value)); toast(`Saved as the template "${name}".`, 'success'); } catch { /* reported by Save */ }
    }

    // Re-phrase: the selection rewritten the DEA way; shown side by side before it replaces anything.
    async function rephrase() {
      const inRich = rich.active();
      const s = ta.selectionStart; const e = ta.selectionEnd;
      const text = (inRich ? rich.selectionText() : ta.value.slice(s, e)).trim();
      if (!text) return toast('Select the sentence or paragraph to re-phrase first.', 'error');
      await Engine().refresh();
      if (!aiReady()) return toast('The local AI engine is not connected. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
      const choice = Engine().choice(); const det = Engine().detected;
      const ctrl = new AbortController();
      const out = h('div', { class: 'rephrase-out notes-preview' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Re-phrasing…');
      let result = '';
      const use = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Replace the selection');
      const done = ui.openDialog((close) => {
        use.addEventListener('click', () => close(result.trim()));
        return h('div', { class: 'rephrase-form' },
          h('h2', { icon: 'magic' }, 'Re-phrase to DEA standards'),
          h('div', { class: 'rephrase-cols' },
            h('div', {}, h('h3', {}, 'Now'), h('div', { class: 'rephrase-in notes-preview' }, text)),
            h('div', {}, h('h3', {}, 'Re-phrased'), out)),
          h('p', { class: 'muted small' }, 'Check that every fact, number and name is unchanged before you use it.'),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { ctrl.abort(); close(null); } }, 'Cancel'), use));
      });
      CVActivity.exclusive('draft', () => CVCopilot.streamChat({
        fetchImpl: Engine().fetchImpl(), base: det.base, model: choice.model, signal: ctrl.signal, numCtx: CVAI.numCtxFor(choice.profile),
        messages: CVCopilot.rephraseMessages(text, CVLibrary.behaviorById(Vault.data.settings, meta.behavior || CVLibrary.defaultBehaviorId(Vault.data.settings)).prompt),
        onText: (piece) => { result += piece; out.textContent = result; },
      }), { label: 'Re-phrasing…', model: CVAI.modelName(choice.model) })
        .then(() => { use.disabled = !result.trim(); })
        .catch((err) => { if (!ctrl.signal.aborted) out.textContent = `Could not re-phrase: ${err.message}`; });
      const chosen = await done;
      ctrl.abort();
      if (!chosen) return;
      if (inRich) { rich.replaceSelection(chosen); return; }
      ta.focus();
      ta.setRangeText(chosen, s, e, 'select');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Review: the arithmetic check at once, then the AI's consistency review (added when the
    // local AI is found; the window doesn't wait for it).
    async function review() {
      save(0);
      const math = CVReview.check(ta.value);
      const mathText = CVReview.describe(math);
      const aiBox = h('div', { class: 'review-ai notes-preview' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Looking for the local AI…');
      const ctrl = new AbortController();
      const dlg = ui.openDialog((close) => h('div', { class: 'review-report' },
        h('h2', { icon: 'clipboard2-check' }, 'Review'),
        h('h3', {}, 'Totals'),
        h('div', { class: `review-math ${math.issues.length ? 'warn' : 'ok'}` }, ...mathText.split('\n').map((l) => h('p', {}, (math.issues.length ? '⚠ ' : '✓ ') + l))),
        h('h3', {}, 'Consistency - Local AI'),
        aiBox,
        h('p', { class: 'muted small' }, 'AI reviews can miss things or be wrong. Read the report yourself too.'),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { ctrl.abort(); close(); } }, 'Done'))));
      (async () => {
        await Engine().refresh().catch(() => {});
        if (ctrl.signal.aborted) return;
        if (!aiReady()) { aiBox.replaceChildren('The local AI engine is not connected, so only the totals were checked.'); return; }
        const choice = Engine().choice(); const det = Engine().detected;
        const caseObj = await Vault.getCase(c.id);
        const facts = [`Title: ${caseObj.title || ''}`, `Case number: ${caseObj.number || ''}`, caseObj.agencyNumber ? `Federal jacket number: ${caseObj.agencyNumber}` : '', ...CVCopilot.contactLines(caseObj.contacts)].filter(Boolean).join('\n');
        let result = '';
        aiBox.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Reading the report…');
        await CVActivity.exclusive('draft', () => CVCopilot.streamChat({
          fetchImpl: Engine().fetchImpl(), base: det.base, model: choice.model, signal: ctrl.signal, numCtx: CVAI.numCtxFor(choice.profile),
          messages: CVCopilot.reviewMessages(ta.value, { facts, math: mathText }),
          onText: (piece) => { result += piece; aiBox.innerHTML = Markdown.render(result); },
        }), { label: 'Reviewing…', model: CVAI.modelName(choice.model) });
      })().catch((err) => { if (!ctrl.signal.aborted) aiBox.textContent = `Could not finish the review: ${err.message}`; });
      await dlg;
      ctrl.abort();
    }

    async function pdfView() {
      save(0);
      await ui.Save.flushAll();
      const p = Vault.data.settings.affiant || {};
      const name = `${(meta.title || 'Report').replace(/[\\/:*?"<>|]/g, '')}.pdf`;
      const opts = { agency: p.agency || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' \u00b7 '), printed: '', title: meta.title || '' };
      // The report made from the Draft tab, unchanged here: the same PDF as the Draft tab's (v1.32).
      const RFU = root.CVReportFieldsUI;
      // (Only the report the form now goes to: one sent before a Clear All prints from its text.)
      const linked = RFU && meta.fromFields && slug === await RFU.sentSlugOf(c).catch(() => '') && await RFU.linkedReport(c, slug).then((r) => r && !r.edited).catch(() => false);
      const bytes = linked ? await RFU.pdfFor(c) : CVDraftPdf.build(ta.value, opts);
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: meta.title || 'Report', fileName: name });
      const folder = /supplement/i.test(`${meta.type} ${meta.title}`) ? 'Supplementary Report' : /arrest/i.test(`${meta.type} ${meta.title}`) ? 'Arrest Report' : 'Case Report';
      const saveCase = Vault.isArchived(c.id) ? null : h('button', { class: 'btn', type: 'button', title: `Saves the PDF in this case's ${folder} folder.`, onclick: async () => {
        try {
          const path = linked
            ? (await RFU.savePdfToCase(c, null, bytes, RFU.titleOf(slug))).path
            : await ui.Save.track(`draft-pdf:${c.id}`, () => Vault.addFile(c.id, new File([bytes], name, { type: 'application/pdf' }), { folder, description: name.replace(/\.pdf$/, ''), replace: true }));
          toast(`Saved to the case files: ${path.split('/').pop()}`, 'success', 5000);
          saveCase.disabled = true;
        } catch { /* reported by Save */ }
      } }, 'Save PDF to Case');
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', {}, meta.title || 'Report'),
        viewer,
        h('div', { class: 'dialog-actions' }, saveCase, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }

    // Word View (v1.34): the Word document Export makes, shown read-only, with the same saves.
    async function wordView() {
      save(0);
      await ui.Save.flushAll();
      const bytes = CVDocx.buildDocx(ta.value, { title: meta.title });
      const page = h('div', { class: 'docx-page' }, h('p', { class: 'muted' }, 'Making the Word document…'));
      try {
        const xml = await CVExtract.unzipEntry(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'word/document.xml');
        const numbering = await CVExtract.unzipEntry(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'word/numbering.xml').catch(() => null);
        const blocks = CVDocxView.parse(xml || '', numbering || '');
        page.replaceChildren(...(blocks.length ? [CVDocxView.render(blocks)] : [h('p', { class: 'muted' }, 'This report has no text yet.')]));
      } catch (err) { page.replaceChildren(h('p', { class: 'error-text' }, `Could not show the Word document: ${err.message}`)); }
      const toCase = Vault.isArchived(c.id) ? null : h('button', { class: 'btn', type: 'button', icon: 'folder-plus', onclick: async () => { await exportDocx('case'); toCase.disabled = true; } }, 'Save to Case Files');
      await ui.openDialog((close) => h('div', { class: 'word-view' },
        h('h2', { icon: 'file-earmark-word' }, meta.title || 'Report'),
        h('p', { class: 'muted small' }, 'The Word document, read-only. Fonts and spacing are simplified here; it opens in Word as usual.'),
        h('div', { class: 'docx-preview word-view-page' }, page),
        h('div', { class: 'dialog-actions' }, toCase, h('button', { 'data-ro-ok': 'true', class: 'btn', type: 'button', icon: 'pc-display', onclick: () => exportDocx('download') }, 'Save to PC'), h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
    }

    async function openGenerate() {
      await Engine().refresh();
      if (!aiReady()) return toast('The local AI engine is not connected. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
      const [files, templates, library] = await Promise.all([Vault.listFiles(c.id), Vault.listTemplates(), CVLibraryUI.items().catch(() => [])]);
      const docs = files.filter((f) => CVExtract.kindOf(f.name));
      const settings = Vault.data.settings;
      const behaviors = CVLibrary.behaviorsOf(settings);
      const opts = await ui.openDialog((close) => {
        const type = h('select', {}, Object.entries(CVDraft.DOC_TYPES).map(([k, t]) => h('option', { value: k, selected: k === meta.type }, t.label)));
        const tpl = h('select', {}, h('option', { value: '' }, 'None: the standard structure'),
          templates.map((t) => h('option', { value: t.file, selected: t.file === meta.template }, t.title)));
        const useTimeline = h('input', { type: 'checkbox', checked: true });
        const useNotes = h('input', { type: 'checkbox', checked: true });
        const docBoxes = docs.map((f) => h('input', { type: 'checkbox', value: f.name, checked: true }));
        const instr = h('textarea', { rows: 3, placeholder: 'Optional, e.g. "Focus on the events of March 14" or "Formal tone, third person".' });
        const behavior = h('select', {}, behaviors.map((b) => h('option', { value: b.id, selected: b.id === (meta.behavior || CVLibrary.defaultBehaviorId(settings)) }, b.name)));
        // Library: examples of the chosen document type are ticked, and the "always use" directives.
        const libBox = h('div', { class: 'check-reports lib-pick' });
        const libChecks = [];
        const drawLibrary = () => {
          const pick = CVLibrary.pickForDraft(library, type.value);
          const on = new Set([...pick.examples, ...pick.directives]);
          libChecks.length = 0;
          const group = (label, list) => (list.length ? [h('span', { class: 'small muted lib-pick-head' }, label), list.map((it) => {
            const box = h('input', { type: 'checkbox', value: it.path, checked: on.has(it.path) });
            libChecks.push(box);
            return h('label', { class: 'check-row', title: it.path }, box, h('span', {}, it.name, it.docType && it.docType !== 'any' ? h('span', { class: 'muted small' }, ` · ${(CVLibrary.DOC_TYPES.find((d) => d[0] === it.docType) || [])[1] || ''}`) : null));
          })] : []);
          const ex = library.filter((i) => (CVLibrary.category(i.category) || {}).role === 'example');
          const dir = library.filter((i) => i.category === 'directives');
          libBox.replaceChildren(...(library.length ? [...group('Examples to write like', ex), ...group('Directives to follow', dir)]
            : [h('p', { class: 'muted small' }, 'The Library is empty. Add sample reports (DEA-6, DEA-7, DEA-202), warrants and directives in Vault → Library.')]).flat(Infinity));
        };
        type.addEventListener('change', drawLibrary);
        drawLibrary();
        const useValues = h('input', { type: 'checkbox', checked: /drug|narcotic|cocaine|heroin|fentanyl|meth|cannabis/i.test(`${c.title} ${(c.tags || []).join(' ')}`) });
        const useCodes = h('input', { type: 'checkbox' });
        // Off by default: the draft starts straight with the summary.
        const useHeader = h('input', { type: 'checkbox' });
        const replace = h('input', { type: 'radio', name: 'gen-mode', value: 'replace', checked: !ta.value.trim() });
        const append = h('input', { type: 'radio', name: 'gen-mode', value: 'append', checked: !!ta.value.trim() });
        return h('form', { class: 'gen-form', onsubmit: (e) => {
          e.preventDefault();
          close({ type: type.value, template: tpl.value, timeline: useTimeline.checked, notes: useNotes.checked, docs: docBoxes.filter((b) => b.checked).map((b) => b.value), instructions: instr.value.trim(), mode: replace.checked ? 'replace' : 'append',
            behavior: behavior.value, library: libChecks.filter((b) => b.checked).map((b) => b.value), values: useValues.checked, codes: useCodes.checked, header: useHeader.checked });
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
        h('div', { class: 'field' }, h('span', {}, 'Header'),
          h('label', { class: 'check-row', title: 'Off: the draft starts straight with the summary.' }, useHeader, h('span', {}, 'Start with a header block: case officer, ASA/AUSA, file, case and agency numbers, date'))),
        ui.field('Writing behavior', behavior),
        h('div', { class: 'field' }, h('span', { title: 'How to write, never facts: names and events in the examples belong to other cases.' }, 'Library'), libBox),
        h('div', { class: 'field' }, h('span', {}, 'Reference'),
          h('div', { class: 'check-reports' },
            h('label', { class: 'check-row' }, useValues, h('span', {}, 'Narcotics street values')),
            h('label', { class: 'check-row' }, useCodes, h('span', {}, 'Incident location and UCR codes')))),
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
          const references = [];
          const libItems = await CVLibraryUI.items().catch(() => []);
          const chosen = libItems.filter((i) => opts.library.includes(i.path));
          const examples = await CVLibraryUI.texts(chosen.filter((i) => i.category !== 'directives').map((i) => i.path), (n) => { msg.textContent = `Reading ${n} from the Library…`; });
          const directives = await CVLibraryUI.texts(chosen.filter((i) => i.category === 'directives').map((i) => i.path), (n) => { msg.textContent = `Reading ${n} from the Library…`; });
          const behaviorPrompt = CVLibrary.behaviorById(Vault.data.settings, opts.behavior).prompt;
          if (opts.values) references.push({ title: 'Narcotics street values', text: CVReference.narcoticsText() });
          if (opts.codes) references.push({ title: 'Incident location codes', text: CVReference.locationCodesText() }, { title: 'UCR codes', text: CVReference.ucrText() });
          const fields = root.CVReportFields ? CVReportFields.asText(await CVReportFieldsUI.load(c)) : '';
          const messages = CVCopilot.draftMessages({ type: opts.type, template, instructions: opts.instructions, caseObj, timeline, notes, passages, references, examples, directives, behavior: behaviorPrompt, numCtx, header: !!opts.header, fields });

          Object.assign(meta, {
            ai: true, type: opts.type, ...(opts.template ? { template: opts.template } : {}), behavior: opts.behavior,
            generated: { model: choice.model, at: new Date().toISOString(), sources: ['case details', opts.timeline && 'timeline', opts.notes && 'notes', ...opts.docs, ...examples.map((r) => `example: ${r.title}`), ...directives.map((r) => `directive: ${r.title}`), ...references.map((r) => `reference: ${r.title}`)].filter(Boolean) },
          });
          banner.hidden = false;
          typeSelect.value = meta.type;
          checkBtn.hidden = meta.type !== 'affidavit';
          msg.textContent = `Writing with ${CVAI.modelName(choice.model)}…`;
          show();
          await CVCopilot.streamChat({
            fetchImpl: Engine().fetchImpl(),
            base: det.base, model: choice.model, messages, signal: ctrl.signal, numCtx,
            onText: (piece) => { text += piece; show(); saveNow(1500); schedulePlaceholders(); },
          });
        }, { label: 'Drafting…', model: CVAI.modelName(choice.model) });
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
    } else if (rich.active()) {
      rich.focus();
    } else {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  /* =====================================================================
   * Templates (shown in the Vault panel)
   * ===================================================================== */

  /** The placeholder list under the template editor: click one to put it at the cursor. */
  function placeholderHelp(area) {
    const { h } = ui;
    const arrestKeys = window.CVClosing ? [...CVClosing.ARRESTEE_FIELDS, ...CVClosing.ARREST_FIELDS].map((f) => f.key) : [];
    const insert = (key) => {
      const text = `{{${key}}}`;
      area.focus();
      area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };
    return h('details', { class: 'placeholder-help' },
      h('summary', { title: 'Click one to insert it at the cursor.' }, 'Placeholders'),
      h('p', { class: 'muted small explain' }, 'When a draft is made, each placeholder is replaced with the case\'s value. Anything empty or unknown becomes [CONFIRM: …] so nothing slips through. Upper/lower case does not matter.'),
      CVDraft.placeholderGroups(arrestKeys, root.CVReportFields ? CVReportFields.PLACEHOLDERS : []).map((grp) => h('div', { class: 'ph-group' },
        h('span', { class: 'ph-title small' }, grp.title),
        h('span', { class: 'ph-keys' }, grp.keys.map((k) => h('button', { class: 'ph-key', type: 'button', title: `Insert {{${k}}}`, onclick: () => insert(k) }, `{{${k}}}`))))));
  }

  function templateSettings() {
    const { h, toast, Save } = ui;
    const box = h('div', {});
    const editor = h('div', { class: 'template-editor', hidden: true });

    async function draw() {
      let list = [];
      try { list = await Vault.listTemplates(); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); }
      box.replaceChildren(list.length
        ? h('ul', { class: 'plain-list template-list' }, list.map((t) => h('li', {},
          h('span', { title: t.file }, t.title),
          h('span', { class: 'template-btns' },
            h('button', { class: 'btn small ghost', type: 'button', icon: 'file-earmark-plus', title: 'Start a new report from this template in the case you have open, with its details filled in.', onclick: () => useTemplate(t) }, 'Use'),
            h('button', { class: 'btn small ghost', type: 'button', icon: 'download', title: 'Save this template as a Word document (.docx) on this computer, with its {{placeholders}}.', onclick: () => downloadTemplate(t) }, 'Download'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => edit(t.file) }, 'Edit'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              if (!window.confirm(`Delete the template "${t.title}" from the SSD?`)) return;
              try { await Save.track('templates', () => Vault.deleteTemplate(t.file)); draw(); } catch { /* reported */ }
            } }, 'Delete')))))
        : h('p', { class: 'muted small' }, 'No templates yet.'));
    }

    // Use: a new report in the open case, filled from this template, then open it.
    async function useTemplate(t) {
      const id = ui.state.caseId;
      if (!id || Vault.isArchived(id)) return toast('Open a case first (not an archived one), then use the template.', 'error');
      try {
        const caseObj = await Vault.getCase(id);
        const text = CVDraft.fillTemplate(await Vault.readTemplate(t.file), CVDraft.templateContext(caseObj, new Date(), Vault.data.settings.affiant, await CVClosingUI.templateExtra(caseObj)));
        const name = t.title;
        const hit = Object.keys(CVDraft.DOC_TYPES).find((k) => k !== 'other' && `${t.file} ${t.title}`.toLowerCase().includes(k)) || 'other';
        const slug = await Vault.newDraftSlug(id, name);
        await Save.track(`draft:${id}:${slug}`, () => Vault.saveDraft(id, slug, { title: name, type: hit, ai: false, created: new Date().toISOString(), template: t.file }, text));
        const d = document.getElementById('dialog');
        if (d && d.open) d.close();
        ui.go(id, 'reports', slug);
        toast(`New report from "${t.title}" in this case.`, 'success');
      } catch (err) { if (err && err.message) toast(`Could not use the template: ${err.message}`, 'error'); }
    }

    // Download: the template as a Word document, placeholders and all.
    async function downloadTemplate(t) {
      try {
        const text = await Vault.readTemplate(t.file);
        const bytes = CVDocx.buildDocx(text, { title: t.title });
        const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const fname = `${t.title.replace(/[<>:"/\\|?*]+/g, '-')}.docx`;
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({ suggestedName: fname, types: [{ description: 'Word document', accept: { [type]: ['.docx'] } }] });
            const w = await handle.createWritable(); await w.write(new Blob([bytes], { type })); await w.close();
            toast(`Saved ${fname}.`, 'success');
            return;
          } catch (err) { if (err && err.name === 'AbortError') return; }
        }
        const url = URL.createObjectURL(new Blob([bytes], { type }));
        const a = h('a', { href: url, download: fname, hidden: true });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) { toast(`Could not save the template: ${err.message}`, 'error'); }
    }

    function edit(file, text) {
      const name = h('input', { value: file || '', placeholder: 'agency-affidavit.md', 'aria-label': 'File name', class: 'template-name' });
      const area = h('textarea', { rows: 12, class: 'template-text', 'aria-label': 'Template text' });
      area.value = text != null ? text : '';
      if (file && text == null) Vault.readTemplate(file).then((t) => { area.value = t || ''; });
      editor.replaceChildren(
        ui.field('File name', name),
        area,
        placeholderHelp(area),
        h('div', { class: 'row' },
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => { editor.hidden = true; } }, 'Cancel'),
          h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', onclick: async () => {
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

    // Import: Markdown or text as is; a Word document is converted (headings, bold/italic, lists
    // and tables kept). {{placeholders}} typed in Word, or «placeholders», carry over.
    const importInput = h('input', { type: 'file', accept: '.md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true });
    importInput.addEventListener('change', async () => {
      const f = importInput.files[0];
      importInput.value = '';
      if (!f) return;
      try {
        if (/\.docx$/i.test(f.name)) {
          const buf = await f.arrayBuffer();
          const xml = await CVExtract.unzipEntry(buf, 'word/document.xml');
          if (!xml) throw new Error('it has no document body');
          const numbering = await CVExtract.unzipEntry(buf, 'word/numbering.xml').catch(() => null);
          const md = CVDocxView.toTemplate(CVDocxView.parse(xml, numbering || ''));
          edit(FS.safeName(f.name.replace(/\.docx$/i, '.md')), md);
          toast('Converted from Word. Check the text, add {{placeholders}} where case details go, then Save template.', 'success', 7000);
        } else {
          edit(FS.safeName(f.name.replace(/\.txt$/i, '.md')), await f.text());
        }
      } catch (err) { toast(`Could not import ${f.name}: ${err.message}`, 'error'); }
    });

    draw();
    return h('section', { 'data-section': 'templates' },
      h('h3', {}, 'Templates'),
      h('p', { class: 'muted small explain' }, 'Your own document formats for Drafts, kept as Markdown files in CaseVault-Data\\templates on the SSD. To add one: Import your agency\'s Word form (or a .md/.txt file), or New template and paste the text. Where a case detail goes, put a placeholder like {{case.number}}: the editor lists them all. # at the start of a line makes a heading, **bold**, *italic*, - for a list.'),
      box,
      h('div', { class: 'row template-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => edit('', '# New template\n\nCase No. {{case.number}}\n') }, 'New template'),
        h('button', { class: 'btn small', type: 'button', onclick: () => importInput.click() }, 'Import Word, .md or .txt…'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          try { const added = await Save.track('templates', () => Vault.addStarterTemplates()); toast(added.length ? `Added ${added.length} starter template${added.length === 1 ? '' : 's'}.` : 'The starter templates are already there.', 'success'); draw(); } catch { /* reported */ }
        } }, 'Add starter templates'),
        importInput),
      editor);
  }

  function init(kit) { ui = kit; }

  root.CVDraftsUI = { init, render, templateSettings };
})(this);
