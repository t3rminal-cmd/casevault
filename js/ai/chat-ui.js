/* CaseVault — Ask AI (#/chat): a chat with the AI on this computer, like claude.ai but offline.
 * Pick a model and, optionally, a case to ask about. The conversation stays in this window until
 * you save it to a case (as a draft) or start a new chat. See js/ai/chat.js.
 */
'use strict';

(function (root) {
  let ui = null;
  const Engine = () => root.CVChecks.Engine;
  // This window only.
  const mem = { turns: [], caseId: undefined, useCase: true, searchFiles: false, model: '' };
  let ctrl = null;

  const models = () => ((Engine().detected && Engine().detected.chat) || []).map((m) => m.name);

  async function render(main) {
    const { h } = ui;
    await Engine().refresh().catch(() => {});
    const cases = (Vault.data.cases || []).filter((c) => c.status !== 'Archived').sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    if (mem.caseId === undefined) mem.caseId = ui.state.lastCaseId && cases.some((c) => c.id === ui.state.lastCaseId) ? ui.state.lastCaseId : '';

    const list = models();
    const choice = Engine().choice();
    const fallback = choice && choice.model;
    if (!mem.model || !list.includes(mem.model)) mem.model = (Vault.data.settings.chatModel && list.includes(Vault.data.settings.chatModel)) ? Vault.data.settings.chatModel : fallback || list[0] || '';
    const modelSel = h('select', { 'aria-label': 'Model', title: 'The AI model on this computer that answers. Add models with Ollama; they show up here.' },
      list.length ? list.map((m) => h('option', { value: m, selected: m === mem.model }, m)) : h('option', { value: '' }, 'No AI engine found'));
    modelSel.addEventListener('change', () => { mem.model = modelSel.value; ui.Save.track('settings', () => Vault.updateSettings({ chatModel: modelSel.value })).catch(() => {}); });
    const caseSel = h('select', { 'aria-label': 'Case', title: 'Ask about a case: its details, timeline and notes go with each question.' },
      h('option', { value: '' }, 'No case: general questions'),
      cases.map((c) => h('option', { value: c.id, selected: c.id === mem.caseId }, `${c.title || 'Untitled case'}${c.number ? ` · ${c.number}` : ''}`)));
    const searchFiles = h('input', { type: 'checkbox', checked: mem.searchFiles });
    const filesToggle = h('label', { class: 'check-row small', title: 'Also look through the case\'s documents for the passages that answer the question. Slower the first time a document is read.' }, searchFiles, h('span', {}, 'Search the case files'));
    const syncCase = () => { mem.caseId = caseSel.value; filesToggle.hidden = !caseSel.value; };
    caseSel.addEventListener('change', syncCase);
    searchFiles.addEventListener('change', () => { mem.searchFiles = searchFiles.checked; });
    syncCase();

    const thread = h('div', { class: 'chat-thread', 'aria-live': 'polite' });
    const input = h('textarea', { class: 'chat-input', rows: 3, placeholder: 'Ask anything. Enter sends, Shift+Enter makes a new line.', 'aria-label': 'Your question' });
    const sendBtn = h('button', { class: 'btn primary chat-send', type: 'button', icon: 'send', title: 'Send (Enter)' }, 'Send');
    const stopBtn = h('button', { class: 'btn chat-send', type: 'button', icon: 'x-circle', hidden: true, title: 'Stop the answer; what is written so far is kept.' }, 'Stop');

    const bubble = (t) => {
      const body = h('div', { class: 'chat-body' });
      if (t.role === 'user') body.textContent = t.content;
      else body.innerHTML = Markdown.render(t.content) || '';
      const tools = t.role === 'assistant' && t.content ? h('div', { class: 'chat-tools' },
        h('button', { class: 'icon-btn', type: 'button', title: 'Copy this answer', onclick: async () => { try { await navigator.clipboard.writeText(t.content); ui.toast('Copied.', 'success', 1500); } catch { ui.toast('Could not copy.', 'error'); } } }, ui.icon('copy'), h('span', { class: 'sr-only' }, 'Copy'))) : null;
      return h('div', { class: `chat-msg ${t.role}` },
        h('span', { class: 'chat-avatar' }, ui.icon(t.role === 'user' ? 'person-circle' : 'robot')),
        h('div', { class: 'chat-content' }, body, t.error ? h('p', { class: 'error-text small' }, t.error) : null, tools));
    };
    const empty = () => h('div', { class: 'chat-empty' },
      h('span', { class: 'chat-empty-icon' }, ui.icon('chat-left-text')),
      h('h2', {}, 'Ask the AI on this computer'),
      h('p', { class: 'muted' }, 'Nothing leaves this PC. Pick a case to ask about it, or ask anything else.'),
      h('div', { class: 'chat-starters' }, ['Summarize this case so far', 'What is still missing for the affidavit?', 'Make a timeline table of the key events', 'Explain the difference between possession and possession with intent'].map((q) =>
        h('button', { class: 'btn small', type: 'button', onclick: () => { input.value = q; input.focus(); } }, q))));
    const draw = () => {
      thread.replaceChildren(...(mem.turns.length ? mem.turns.map(bubble) : [empty()]));
      thread.scrollTop = thread.scrollHeight;
    };

    async function send() {
      const q = input.value.trim();
      if (!q || ctrl) return;
      if (!modelSel.value) { ui.toast('No AI engine is running. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000); return; }
      input.value = '';
      const history = mem.turns.filter((t) => !t.error && t.content).map((t) => ({ role: t.role, content: t.content }));
      mem.turns.push({ role: 'user', content: q });
      const answer = { role: 'assistant', content: '' };
      mem.turns.push(answer);
      draw();
      const answerEl = thread.lastElementChild.querySelector('.chat-body');
      answerEl.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Thinking…');
      ctrl = new AbortController();
      const my = ctrl;
      sendBtn.hidden = true; stopBtn.hidden = false;
      let pending = false;
      const paint = () => { pending = false; if (answerEl.isConnected) { answerEl.innerHTML = Markdown.render(answer.content); thread.scrollTop = thread.scrollHeight; } };
      try {
        const det = Engine().detected;
        // The context size that suits the chosen model's size (as Draft with AI's suggestions do).
        const numCtx = CVCopilot.numCtxForModel(det, modelSel.value);
        let material = '';
        if (caseSel.value) {
          const entry = (Vault.data.cases || []).find((c) => c.id === caseSel.value);
          const [caseObj, timeline, notes] = await Promise.all([Vault.getCase(entry.id), Vault.getTimeline(entry.id), Vault.getNotes(entry.id)]);
          let passages = [];
          if (searchFiles.checked) {
            const files = (await Vault.listFiles(entry.id)).filter((f) => CVExtract.kindOf(f.name));
            const docs = [];
            for (const f of files) {
              if (my.signal.aborted) break;
              answerEl.textContent = `Reading ${f.base}…`;
              try { const d = await CVChecks.documentText(entry, f.name); docs.push({ name: f.base, docIndex: docs.length, paragraphs: d.paragraphs }); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
            }
            answerEl.textContent = 'Finding the passages that answer it…';
            const hits = await CVCopilot.relevantPassages({ docs, query: q, engine: { base: det.base, embed: det.embed }, fetchImpl: Engine().fetchImpl(), k: 8 });
            passages = hits.map((p) => ({ ...p, docName: docs[p.doc].name }));
          }
          material = CVChat.caseMaterial({ caseObj, timeline, notes, passages }, Math.floor(numCtx * 3.5 * 0.45));
        }
        const messages = CVChat.buildMessages({ history, question: q, material, numCtx });
        if (CVActivity.heavyBusy()) answerEl.textContent = 'Waiting for the check or draft that is running…';
        await CVActivity.exclusive('chat', () => CVCopilot.streamChat({
          fetchImpl: Engine().fetchImpl(), base: det.base, model: modelSel.value, messages, signal: my.signal, numCtx,
          onText: (piece) => { answer.content += piece; if (!pending) { pending = true; requestAnimationFrame(paint); } },
        }), { label: 'Answering…', model: modelSel.value });
        paint();
      } catch (err) {
        if (my.signal.aborted) { if (!answer.content) answer.content = '_Stopped._'; } else answer.error = FS.isDisconnectError(err) ? 'The SSD was disconnected.' : `Could not answer: ${err.message}`;
      } finally {
        ctrl = null;
        sendBtn.hidden = false; stopBtn.hidden = true;
        draw();
        input.focus();
      }
    }
    sendBtn.addEventListener('click', send);
    stopBtn.addEventListener('click', () => { if (ctrl) ctrl.abort(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });

    const saveBtn = h('button', { class: 'btn small', type: 'button', icon: 'save', title: 'Save the conversation to a case as a draft, on the SSD.', onclick: async () => {
      if (!mem.turns.some((t) => t.content)) return ui.toast('Nothing to save yet.', 'error');
      const id = caseSel.value || (await pickCaseId(cases));
      if (!id) return;
      const title = `Ask AI ${new Date().toLocaleDateString()}`;
      try {
        const slug = await Vault.newDraftSlug(id, title);
        await ui.Save.track(`draft:${id}:${slug}`, () => Vault.saveDraft(id, slug, { title, type: 'other', ai: true, created: new Date().toISOString() }, CVChat.transcript(mem.turns.filter((t) => t.content), { title, model: modelSel.value })));
        ui.toast(`Saved to the case as the draft "${title}".`, 'success', 5000);
      } catch { /* reported by Save */ }
    } }, 'Save to case');
    const newBtn = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: 'Start over. The current conversation is cleared unless you saved it.', onclick: () => { if (ctrl) ctrl.abort(); mem.turns = []; draw(); input.focus(); } }, 'New chat');

    main.replaceChildren(h('section', { class: 'chat-page' },
      h('div', { class: 'chat-head' },
        h('h1', { class: 'page-title', icon: 'chat-left-text' }, 'Ask AI'),
        h('div', { class: 'spacer' }), newBtn, saveBtn),
      h('div', { class: 'chat-options' }, ui.field('Model', modelSel), ui.field('Case', caseSel), filesToggle),
      thread,
      h('div', { class: 'chat-composer' }, input, h('div', { class: 'chat-actions' }, sendBtn, stopBtn)),
      h('p', { class: 'muted small chat-foot' }, ui.icon('shield-lock-fill'), ' Local AI only: nothing leaves this computer. AI answers can be wrong; check them against the case.')));
    draw();
    input.focus();
  }

  async function pickCaseId(cases) {
    const { h } = ui;
    if (!cases.length) { ui.toast('Create a case first.', 'error'); return null; }
    const sel = h('select', { 'aria-label': 'Case' }, cases.map((c) => h('option', { value: c.id }, `${c.title || 'Untitled case'}${c.number ? ` · ${c.number}` : ''}`)));
    return ui.openDialog((close) => h('form', { onsubmit: (e) => { e.preventDefault(); close(sel.value); } },
      h('h2', { icon: 'folder2-open' }, 'Save the chat to a case'), ui.field('Case', sel),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }

  function init(kit) { ui = kit; }

  root.CVChatUI = { init, render };
})(this);
