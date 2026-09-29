/* CaseVault — online research & drafting (#/online).
 *
 * For research and drafting only. Case documents are never sent automatically: the user types or
 * inserts the text, and every message goes through the outbound gate (js/secure/outbound.js), which
 * replaces names and numbers with placeholders and shows exactly what will be sent.
 *
 * Four services:
 *   - "claude.ai with my Claude subscription": CaseVault copies the redacted text and opens claude.ai
 *     in a new tab; the user pastes it there, then pastes the answer back here. (A Claude Pro/Max
 *     subscription can't be connected to other apps; this is how to use it safely.)
 *   - "Anthropic API": answers inside CaseVault with an API key (billed separately from a
 *     subscription). The key is managed by js/secure/apikey-ui.js: in memory, or on the SSD in
 *     CaseVault-Data/secrets, optionally locked with a passphrase. Never in the browser's storage.
 *   - "Google Gemini" and "OpenRouter" (v1.15): the same, with free tiers. Their own keys, same
 *     review and redaction; their guides say what the free tiers do with what you send.
 *
 * The conversation and the placeholder map live in memory only. Answers can be saved to a case as
 * a draft, with the real values put back in on this computer.
 */
'use strict';

(function (root) {
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const CLAUDE_WEB = 'https://claude.ai/new';
  const DEFAULT_MODEL = 'claude-sonnet-5';
  // service -> the key manager (js/secure/apikey-ui.js) and the model to start with.
  const APIS = {
    'online-ai': { key: () => CVApiKey, provider: 'anthropic', model: DEFAULT_MODEL, label: 'Anthropic API: Claude, answers here, paid' },
    gemini: { key: () => CVApiKeys.gemini, provider: 'gemini', model: 'gemini-2.5-flash', label: 'Google Gemini: answers here, free tier' },
    openrouter: { key: () => CVApiKeys.openrouter, provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'OpenRouter: answers here, free models' },
  };
  const SYSTEM = [
    'You are helping a law-enforcement investigator with research and drafting.',
    'Personal and case details in the text were replaced with placeholders such as [NAME_1], [PHONE_2], [ADDRESS_1], [CASENO_1].',
    'Keep every placeholder exactly as written, including the brackets. Never guess or invent the real values behind them.',
    'Do not invent facts about the case. Where a fact must be supplied or checked by the investigator, write [CONFIRM: what is needed].',
    'For research questions, say when an answer depends on jurisdiction or may be out of date, and suggest what to verify.',
  ].join(' ');

  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  let ui = null;

  // In memory only: cleared on reload, "Clear conversation", or when another vault is opened.
  const session = {
    service: 'claude-web', purpose: 'Research', caseId: '', draft: '', models: {}, map: {}, turns: [], showReal: true,
  };

  const onlineSettings = () => CVOutbound.onlineSettings();

  function reset() {
    session.map = {};
    session.turns = [];
  }

  /* ---------- the page ---------- */

  async function render(main) {
    const { h, toast, openDialog, Save } = ui;
    const st = onlineSettings();
    // The model for each API service, remembered in vault.json (online.model is Anthropic's, from v1.9).
    for (const [svc, a] of Object.entries(APIS)) if (!session.models[svc]) session.models[svc] = (svc === 'online-ai' ? st.model : (st.models || {})[svc]) || a.model;
    const cases = (V().data.cases || []).filter((c) => c.location !== 'archive');
    await CVApiKey.refresh().catch(() => {});

    const page = h('section', { class: 'online-page' });
    main.replaceChildren(page);

    const draw = () => {
      const online = CVOutbound.isOnline();
      const allowed = onlineSettings().allowed;
      const caseObj = cases.find((c) => c.id === session.caseId) || null;

      // --- status bar ---
      const status = h('div', { class: `online-status ${online ? 'on' : 'off'}` },
        h('div', {}, h('strong', {}, online ? `Online · switches off after ${onlineSettings().idleMinutes} min without use (${CVOutbound.minutesLeft()} min left)` : 'Offline'),
          h('div', { class: 'small' }, online
            ? `CaseVault may now reach ${CVOutbound.ALLOWED_HOSTS.join(', ')}, and only with text you have reviewed.`
            : 'Nothing can leave this computer. Case data stays on the SSD.')),
        h('div', { class: 'spacer' }),
        !allowed
          ? h('button', { class: 'btn', type: 'button', onclick: () => ui.showVaultPanel('online') }, 'Turn on online features…')
          : online
            ? h('button', { class: 'btn', type: 'button', onclick: () => { CVOutbound.goOffline('user'); draw(); } }, 'Go offline')
            : h('button', { class: 'btn primary', type: 'button', onclick: async () => {
              const ok = await ui.confirmDialog({
                title: 'Go online?',
                message: h('div', {},
                  h('p', {}, 'Online AI is for research and drafting only. Every message is checked for personal details, which are replaced with placeholders, and you see exactly what will be sent before it goes.'),
                  h('p', { class: 'muted small explain' }, `CaseVault will only connect to ${CVOutbound.ALLOWED_HOSTS.join(', ')}. It goes offline again after ${onlineSettings().idleMinutes} minutes without use, and every time it starts.`),
                  h('p', { class: 'muted small explain' }, 'Follow your agency\'s policy on using cloud AI services.')),
                confirmText: 'Go online',
              });
              if (!ok) return;
              try { CVOutbound.goOnline(); } catch (err) { toast(err.message, 'error'); }
              draw();
            } }, 'Go online'));

      // --- settings row ---
      const service = h('select', { 'aria-label': 'Service' },
        h('option', { value: 'claude-web', selected: session.service === 'claude-web' }, 'claude.ai: my Claude subscription, copy & paste'),
        Object.entries(APIS).map(([svc, a]) => h('option', { value: svc, selected: session.service === svc }, a.label)));
      service.addEventListener('change', () => { session.service = service.value; draw(); });
      const purpose = h('select', { 'aria-label': 'Purpose' }, ['Research', 'Drafting'].map((p) => h('option', { selected: session.purpose === p }, p)));
      purpose.addEventListener('change', () => { session.purpose = purpose.value; });
      const caseSel = h('select', { 'aria-label': 'Case' }, h('option', { value: '' }, 'No case: general research'),
        cases.map((c) => h('option', { value: c.id, selected: c.id === session.caseId }, `${c.title || 'Untitled'}${c.number ? ` · ${c.number}` : ''}`)));
      caseSel.addEventListener('change', () => { session.caseId = caseSel.value; draw(); });

      let apiBox = null;
      const api = APIS[session.service];
      if (api) {
        const svc = session.service;
        const model = h('input', { type: 'text', value: session.models[svc], class: 'model-input', 'aria-label': 'Model', list: 'cv-models' });
        const models = h('datalist', { id: 'cv-models' });
        model.addEventListener('change', () => {
          session.models[svc] = model.value.trim() || api.model;
          const cur = onlineSettings();
          const patch = svc === 'online-ai' ? { model: session.models[svc] } : { models: { ...(cur.models || {}), [svc]: session.models[svc] } };
          Save.track('settings', () => V().updateSettings({ online: { ...cur, ...patch } })).catch(() => {});
        });
        const listBtn = h('button', { class: 'btn small', type: 'button', onclick: async () => {
          try {
            const r = await api.key().test();
            models.replaceChildren(...r.models.map((m) => h('option', { value: m })));
            toast(`${r.models.length} models available. Pick one in the Model box.`, 'success');
          } catch (err) { toast(err.message, 'error', 9000); }
        } }, 'List models');
        apiBox = h('div', { class: 'online-api' },
          h('h2', {}, `${CVApiProviders[api.provider].short} API key`),
          api.key().card(),
          h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', {}, 'Model'), model), models, listBtn));
      }

      // --- conversation ---
      const convo = h('div', { class: 'online-convo', 'aria-live': 'polite' },
        session.turns.length ? session.turns.map((t) => turnView(t)) : h('p', { class: 'muted' }, session.service === 'claude-web'
          ? 'Write your question or the text to work on below. CaseVault hides the personal details, copies the result and opens claude.ai; paste it there, then paste Claude\'s answer back here.'
          : 'Write your question or the text to work on below. CaseVault hides the personal details, shows you the result, then sends it.'));

      const ta = h('textarea', { rows: 7, class: 'online-input', placeholder: session.purpose === 'Research'
        ? 'e.g. What does the case law in Virginia say about the staleness of information in a search warrant affidavit?'
        : 'e.g. Tighten the wording of this paragraph for a probable cause affidavit: …' });
      ta.value = session.draft || '';
      ta.addEventListener('input', () => { session.draft = ta.value; });
      const insert = h('select', { 'aria-label': 'Insert a draft', disabled: !caseObj }, h('option', { value: '' }, caseObj ? 'Insert a draft from this case…' : 'Pick a case to insert its drafts'));
      if (caseObj) {
        V().listDrafts(caseObj.id).then((list) => insert.append(...list.map((d) => h('option', { value: d.slug }, d.title)))).catch(() => {});
        insert.addEventListener('change', async () => {
          if (!insert.value) return;
          const d = await V().readDraft(caseObj.id, insert.value);
          if (d) ta.value = session.draft = `${ta.value ? `${ta.value}\n\n` : ''}${d.body}`;
          insert.value = '';
          ta.focus();
        });
      }
      const sendBtn = h('button', { class: 'btn primary', type: 'button', disabled: !online }, session.service === 'claude-web' ? 'Check, copy & open claude.ai' : 'Check & send');
      sendBtn.addEventListener('click', async () => {
        const text = ta.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        try {
          const full = caseObj ? await V().getCase(caseObj.id) : null;
          const ok = session.service === 'claude-web' ? await viaClaudeWeb(text, full) : await viaApi(text, full, session.service);
          if (ok) ta.value = session.draft = '';
        } catch (err) {
          toast(err.message, 'error', 10000);
        } finally {
          sendBtn.disabled = !CVOutbound.isOnline();
          draw();
        }
      });

      page.replaceChildren(...[
        h('h1', { title: 'Online' }, 'Research & drafting online'),
        status,
        h('div', { class: 'online-settings row' },
          h('label', { class: 'field' }, h('span', {}, 'Service'), service),
          h('label', { class: 'field' }, h('span', {}, 'Purpose'), purpose),
          h('label', { class: 'field grow' }, h('span', { title: 'For its names and drafts.' }, 'Case'), caseSel)),
        apiBox,
        h('div', { class: 'row' }, h('h2', {}, 'Conversation'), h('div', { class: 'spacer' }),
          session.turns.length ? h('label', { class: 'check-row small' }, (() => {
            const cb = h('input', { type: 'checkbox', checked: session.showReal });
            cb.addEventListener('change', () => { session.showReal = cb.checked; draw(); });
            return cb;
          })(), h('span', { title: 'Only on this computer.' }, 'Show real names')) : null,
          session.turns.length ? h('button', { class: 'btn small', type: 'button', onclick: () => { reset(); draw(); } }, 'Clear conversation') : null),
        convo,
        h('div', { class: 'online-compose' }, ta,
          h('div', { class: 'row' }, insert, h('div', { class: 'spacer' }), sendBtn)),
        h('p', { class: 'muted small explain' }, 'Placeholders ([NAME_1] …) are kept for the whole conversation, so the same person always gets the same one. The conversation is kept in memory only; save an answer to a case to keep it.')].filter(Boolean));
    };

    // One exchange: what was sent (redacted), and the answer.
    function turnView(t) {
      const show = (s) => (session.showReal ? CVPii.rehydrate(s, session.map) : s);
      const answerBox = t.answer != null
        ? h('div', { class: 'turn-answer' }, h('div', { class: 'turn-label' }, `Answer${t.model ? ` · ${t.model}` : ''}`),
          h('div', { class: 'notes-preview answer-md', html: Markdown.render(show(t.answer)) }),
          h('div', { class: 'row' },
            h('button', { class: 'btn small', type: 'button', onclick: () => copy(show(t.answer)) }, 'Copy'),
            h('button', { class: 'btn small', type: 'button', onclick: () => saveAsDraft(t) }, 'Save to case as draft…')))
        : t.service === 'claude-web'
          ? pasteBack(t)
          : h('p', { class: 'muted' }, 'Waiting for the answer…');
      return h('article', { class: 'turn' },
        h('div', { class: 'turn-sent' }, h('div', { class: 'turn-label' }, `Sent (${t.service === 'claude-web' ? 'copied for claude.ai' : `to ${CVApiProviders[APIS[t.service].provider].short}`}) · ${t.purpose}`),
          h('pre', { class: 'preview-text' }, show(t.sent))),
        answerBox);
    }

    function pasteBack(t) {
      const box = ui.h('textarea', { rows: 5, placeholder: 'Paste Claude\'s answer here. The placeholders in it are replaced with the real values on this computer.' });
      return ui.h('div', { class: 'turn-answer' },
        ui.h('div', { class: 'turn-label' }, 'Answer from claude.ai'), box,
        ui.h('div', { class: 'row' },
          ui.h('button', { class: 'btn small', type: 'button', onclick: () => { copy(t.sent); window.open(CLAUDE_WEB, '_blank', 'noopener,noreferrer'); } }, 'Copy again & open claude.ai'),
          ui.h('div', { class: 'spacer' }),
          ui.h('button', { class: 'btn small primary', type: 'button', onclick: () => {
            if (!box.value.trim()) return;
            t.answer = box.value;
            draw();
          } }, 'Add answer')));
    }

    async function copy(text) {
      try { await navigator.clipboard.writeText(text); toast('Copied.', 'success'); } catch { toast('Could not copy. Select the text and press Ctrl+C.', 'error'); }
    }

    async function saveAsDraft(t) {
      const cid = session.caseId;
      if (!cid) return toast('Pick the case at the top first.', 'error');
      const title = await openDialog((close) => {
        const inp = h('input', { type: 'text', value: `${session.purpose} notes (online AI)`, maxlength: 120, autofocus: true });
        return h('form', { onsubmit: (e) => { e.preventDefault(); close(inp.value.trim() || 'Online AI notes'); } },
          h('h2', {}, 'Save as a draft in this case'),
          h('p', { class: 'muted small explain' }, 'Saved on the SSD with the real names put back, marked as AI-assisted. Check every fact before using it.'),
          ui.field('Title', inp),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
      });
      if (!title) return;
      const body = `> Written with online AI (${t.model || 'claude.ai'}) for ${session.purpose.toLowerCase()}. Verify every fact and citation.\n\n${CVPii.rehydrate(t.answer, session.map)}`;
      try {
        const slug = await V().newDraftSlug(cid, title);
        await Save.track(`draft:${cid}:${slug}`, () => V().saveDraft(cid, slug, { title, type: 'other', ai: true }, body));
        toast('Saved to the case\'s Drafts.', 'success');
      } catch { /* reported by Save */ }
    }

    async function viaClaudeWeb(text, caseObj) {
      const r = await CVOutbound.review({
        channel: 'claude-web', destination: 'claude.ai (you paste it yourself)', purpose: session.purpose, caseObj,
        parts: [{ label: 'Your message', text }], mode: 'redact', map: session.map, confirmText: 'Copy & open claude.ai',
      });
      if (!r) return false;
      const turn = { service: 'claude-web', purpose: session.purpose, sent: r.parts[0].text, answer: null };
      session.turns.push(turn);
      await copy(r.parts[0].text);
      window.open(CLAUDE_WEB, '_blank', 'noopener,noreferrer');
      return true;
    }

    async function viaApi(text, caseObj, svc) {
      const api = APIS[svc];
      const K = api.key();
      const P = CVApiProviders[api.provider];
      const modelName = session.models[svc] || api.model;
      if (!K.get()) throw new Error(K.status().set ? 'Unlock the API key first (the Unlock button above).' : `Add ${P.short === 'Gemini' ? 'a' : 'an'} ${P.short} API key first (the Add API key button above), or switch to claude.ai.`);
      const r = await CVOutbound.review({
        channel: 'online-ai', destination: `${P.host} · ${modelName}`, purpose: session.purpose, caseObj,
        parts: [{ label: 'Your message', text }], mode: 'redact', map: session.map, confirmText: 'Send',
      });
      if (!r) return false;
      const turn = { service: svc, purpose: session.purpose, sent: r.parts[0].text, answer: null, model: modelName };
      session.turns.push(turn);
      draw();
      // The conversation so far with this service: [{ role: 'user'|'assistant', content }].
      const history = [];
      for (const t of session.turns) {
        if (t.service !== svc) continue;
        history.push({ role: 'user', content: t.sent });
        if (t.answer != null && t !== turn) history.push({ role: 'assistant', content: t.answer });
      }
      const system = `${SYSTEM} The investigator's purpose: ${session.purpose.toLowerCase()}.`;
      const req = requestFor(api.provider, { key: K.get(), model: modelName, system, history });
      const res = await CVOutbound.send(r.ticket, req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (!res.ok) {
        session.turns.pop();
        const msg = (data && data.error && (data.error.message || data.error)) || `${res.status} ${res.statusText}`;
        throw new Error(`${P.short} answered with an error: ${msg}${res.status === 429 ? ' (a free-tier limit: wait a minute, or try tomorrow)' : ''}`);
      }
      const out = answerOf(api.provider, data);
      turn.answer = out.text || '(empty answer)';
      turn.model = out.model || modelName;
      return true;
    }

    redraw = () => { if (page.isConnected && !(document.activeElement && page.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) draw(); };
    draw();
  }


  let redraw = () => {};

  /** The HTTP request for one answer from each service. history: [{ role: 'user'|'assistant', content }]. */
  function requestFor(provider, { key, model, system, history }) {
    if (provider === 'gemini') {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: { systemInstruction: { parts: [{ text: system }] }, contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) },
      };
    }
    if (provider === 'openrouter') {
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: { model, messages: [{ role: 'system', content: system }, ...history] },
      };
    }
    return {
      url: API_URL,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: { model, max_tokens: 4096, system, messages: history },
    };
  }

  /** The answer's text (and the model that wrote it) from each service's reply. */
  function answerOf(provider, data) {
    if (!data) return { text: '' };
    if (provider === 'gemini') {
      const c = (data.candidates || [])[0];
      return { text: ((c && c.content && c.content.parts) || []).map((p) => p.text || '').join(''), model: data.modelVersion };
    }
    if (provider === 'openrouter') {
      const c = (data.choices || [])[0];
      return { text: (c && c.message && c.message.content) || '', model: data.model };
    }
    return { text: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n'), model: data.model };
  }

  function init(kit) {
    ui = kit;
    CVOutbound.onChange(() => redraw());
  }

  root.CVOnlineUI = { init, render, reset, DEFAULT_MODEL, APIS, requestFor, answerOf };
})(this);
