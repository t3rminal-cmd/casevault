/* CaseVault — managing online AI API keys: Anthropic (Claude), Google Gemini and OpenRouter.
 *
 * One card per service that shows whether a key is set and where it's kept, with:
 *   Add API key… / Replace…  step-by-step guide + paste box + where to keep it
 *   Unlock…                  for a key saved on the SSD with a passphrase
 *   Test key                 one look-up (the list of models) to that service; no case data
 *   Remove API key…          from memory and the SSD, with a reminder to revoke it
 * and "How to get an API key", the same guide, readable any time.
 *
 * Gemini and OpenRouter have free tiers. Their guides say plainly what "free" costs in privacy:
 * what you send may be used to improve their products. CaseVault still hides names and numbers.
 *
 * CVApiKey is the Anthropic key (as before v1.15); CVApiKeys.gemini and CVApiKeys.openrouter are
 * the others, with the same functions. Shown on the online page and in Vault → Online features.
 */
'use strict';

(function (root) {
  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  const L = () => root.CVApiKeyLib;
  let ui = null;

  const WHERE_TEXT = {
    session: 'kept for this session only (gone when you close CaseVault)',
    locked: 'saved on the SSD, locked with your passphrase',
    plain: 'saved on the SSD (protected by BitLocker only)',
  };

  function openLink(url) { window.open(url, '_blank', 'noopener,noreferrer'); }

  /* ---------- the three services ---------- */

  const PROVIDERS = {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic API - Claude',
      short: 'Anthropic',
      host: 'api.anthropic.com',
      placeholder: 'sk-ant-api03-…',
      free: false,
      keysUrl: 'https://platform.claude.com/settings/keys',
      costCheck: 'I understand API use is billed by Anthropic to the Console account, separately from any Claude subscription.',
      none: 'Paid per use. Answers inside CaseVault with Claude. claude.ai (copy & paste) works without a key.',
      steps(h, link) {
        const CONSOLE = 'https://platform.claude.com/';
        return [
          [h('strong', {}, 'Open the Claude Console. '), 'Click ', link(CONSOLE, 'platform.claude.com'), '. It opens in a new browser tab. This is Anthropic\'s site for developers; it is separate from claude.ai (the old address console.anthropic.com goes to the same place).'],
          [h('strong', {}, 'Sign in or create an account. '), 'Use your email, Google or single sign-on. Your Claude Pro login can be used, but API use is billed on its own: a Pro subscription does not include API credit. If your agency has an organisation account, ask its administrator to invite you instead.'],
          [h('strong', {}, 'Add credit. '), 'Go to ', link('https://platform.claude.com/settings/billing', 'Settings → Billing'), ', add a payment method and buy credit (the minimum is small, about $5). Until there is credit, every request is refused. You only pay for what you use.'],
          [h('strong', { title: 'Recommended' }, 'Set a spending limit. '), 'In ', link('https://platform.claude.com/settings/limits', 'Settings → Limits'), ', set a monthly limit and an email alert, so a mistake can never cost more than you chose.'],
          [h('strong', {}, 'Create the key. '), 'Go to ', link(this.keysUrl, 'Settings → API keys'), ' and click ', h('strong', {}, 'Create Key'), '. Name it after the PC, for example ', h('code', {}, 'CaseVault - L14'), ' (one key per PC means you can switch one off without touching the other).'],
          [h('strong', {}, 'Copy it now. '), 'The key starts with ', h('code', {}, 'sk-ant-api03-'), ' and is about 100 characters long. The Console shows it ', h('strong', {}, 'only once'), '. Don\'t paste it into email, chat, notes or a document.'],
        ];
      },
      terms: 'Anthropic\'s commercial terms say API data isn\'t used to train models by default. Check them, and your agency\'s policy, before using the API with case work. CaseVault still hides names and numbers before anything is sent.',
      async test(key) {
        const res = await CVOutbound.sendMeta('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
        const data = await res.json().catch(() => null);
        if (res.status === 401) throw new Error('Anthropic refused the key: it was mistyped, revoked or deleted. Create a new one in the Console and use Replace.');
        if (res.status === 403) throw new Error('The key isn\'t allowed to do this. Check the key\'s workspace in the Console.');
        if (!res.ok) throw new Error((data && data.error && data.error.message) || `Anthropic answered ${res.status} ${res.statusText}.`);
        const models = ((data && data.data) || []).map((m) => m.id);
        return { status: res.status, models, message: `Key works. ${models.length} models available${models.length ? `, for example ${models.slice(0, 2).join(', ')}` : ''}. If sending still fails with a credit error, add credit in Settings → Billing.` };
      },
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini API - Free Tier',
      short: 'Gemini',
      host: 'generativelanguage.googleapis.com',
      placeholder: 'AIza…',
      free: true,
      keysUrl: 'https://aistudio.google.com/app/apikey',
      costCheck: 'I understand that on the free tier Google may use what I send to improve its products, and that people may read it. CaseVault hides names and numbers, and I follow my agency\'s policy.',
      none: 'Free tier with daily limits, no card needed. Answers inside CaseVault with Google\'s Gemini models.',
      steps(h, link) {
        return [
          [h('strong', {}, 'Open Google AI Studio. '), 'Click ', link('https://aistudio.google.com/', 'aistudio.google.com'), '. It opens in a new browser tab. Sign in with a Google account (one your agency allows).'],
          [h('strong', {}, 'Accept the terms. '), 'The first time, AI Studio asks you to accept the Gemini API terms. Read the part about the free tier: what you send may be used to improve Google\'s products, and human reviewers may read it.'],
          [h('strong', {}, 'Create the key. '), 'Go to ', link(this.keysUrl, 'Get API key'), ' and click ', h('strong', {}, 'Create API key'), '. If it asks for a Google Cloud project, let it create one. Name it after the PC, for example ', h('code', {}, 'CaseVault - L14'), '.'],
          [h('strong', {}, 'Copy it. '), 'The key starts with ', h('code', {}, 'AIza'), ' and is 39 characters long. Don\'t paste it into email, chat, notes or a document.'],
          [h('strong', {}, 'No card needed. '), 'The free tier has limits on requests per minute and per day. When you reach one, CaseVault shows the error; wait a minute (or until tomorrow). Adding billing in Google Cloud removes the limits, and paid-tier data isn\'t used to improve Google\'s products.'],
        ];
      },
      terms: 'Free tier: Google may use prompts and answers to improve its products, and human reviewers may read them. Don\'t use it for anything your agency\'s policy doesn\'t allow, even with names hidden. Check Google\'s current Gemini API terms.',
      async test(key) {
        const res = await CVOutbound.sendMeta('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': key } });
        const data = await res.json().catch(() => null);
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error(`Google refused the key${data && data.error && data.error.message ? ` (${data.error.message})` : ''}. Copy it again from AI Studio, or create a new one, and use Replace.`);
        if (!res.ok) throw new Error((data && data.error && data.error.message) || `Google answered ${res.status} ${res.statusText}.`);
        const models = ((data && data.models) || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => String(m.name || '').replace(/^models\//, ''))
          .filter((m) => /^gemini/.test(m));
        return { status: res.status, models, message: `Key works. ${models.length} Gemini models available${models.length ? `, for example ${models.slice(0, 2).join(', ')}` : ''}. Flash models are the ones with the most free use.` };
      },
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter - Free Models',
      short: 'OpenRouter',
      host: 'openrouter.ai',
      placeholder: 'sk-or-v1-…',
      free: true,
      keysUrl: 'https://openrouter.ai/settings/keys',
      costCheck: 'I understand free models on OpenRouter are run by other companies that may log or use what I send, and paid models are billed to my OpenRouter credit. CaseVault hides names and numbers, and I follow my agency\'s policy.',
      none: 'One key for many AI models, including free ones (names ending in ":free"). Answers inside CaseVault.',
      steps(h, link) {
        return [
          [h('strong', {}, 'Open OpenRouter. '), 'Click ', link('https://openrouter.ai/', 'openrouter.ai'), '. It opens in a new browser tab. Sign in with Google, GitHub or an email address.'],
          [h('strong', { title: 'Recommended' }, 'Set your privacy choice. '), 'In ', link('https://openrouter.ai/settings/privacy', 'Settings → Privacy'), ', turn off using providers that may train on your data. Fewer free models are then available, but those left don\'t keep what you send for training.'],
          [h('strong', {}, 'Create the key. '), 'Go to ', link(this.keysUrl, 'Settings → Keys'), ' and click ', h('strong', {}, 'Create Key'), '. Name it after the PC, for example ', h('code', {}, 'CaseVault - L14'), '. Set a ', h('strong', {}, 'credit limit'), ' (0 if you only want free models), so it can never spend more.'],
          [h('strong', {}, 'Copy it now. '), 'The key starts with ', h('code', {}, 'sk-or-v1-'), '. OpenRouter shows it only once. Don\'t paste it into email, chat, notes or a document.'],
          [h('strong', {}, 'Free models. '), 'Model names ending in ', h('code', {}, ':free'), ' cost nothing, with a daily limit (higher once your account has bought some credit). ', h('strong', {}, 'Test key'), ' below lists the free models you can pick.'],
        ];
      },
      terms: 'Free models are run by the companies that make them, and some log or use what you send. Choose your privacy setting in OpenRouter, check each model\'s page, and follow your agency\'s policy. CaseVault still hides names and numbers before anything is sent.',
      async test(key) {
        const res = await CVOutbound.sendMeta('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${key}` } });
        const data = await res.json().catch(() => null);
        if (res.status === 401 || res.status === 403) throw new Error('OpenRouter refused the key: it was mistyped, disabled or deleted. Create a new one in Settings → Keys and use Replace.');
        if (!res.ok) throw new Error((data && data.error && data.error.message) || `OpenRouter answered ${res.status} ${res.statusText}.`);
        let models = [];
        try {
          const m = await CVOutbound.sendMeta('https://openrouter.ai/api/v1/models');
          const list = await m.json();
          models = ((list && list.data) || []).map((x) => x.id).filter((id) => /:free$/.test(id)).sort();
        } catch { /* the key works; the list is a bonus */ }
        const info = (data && data.data) || {};
        return { status: res.status, models, message: `Key works${info.is_free_tier ? ' (free tier)' : ''}. ${models.length} free models available${models.length ? `, for example ${models.slice(0, 2).join(', ')}` : ''}.` };
      },
    },
  };

  /* ---------- one key manager per service ---------- */

  function make(P) {
    // In memory only. where: 'session' | 'locked' | 'plain'
    const state = { key: '', where: '', stored: null, record: null, loadedFor: null, lastTest: null };
    const listeners = new Set();
    const cards = new Set();
    const notify = () => {
      for (const c of [...cards]) { if (c.el.isConnected) c.draw(); else cards.delete(c); }
      for (const fn of listeners) { try { fn(); } catch (err) { console.error(err); } }
    };

    /** Read what's on the SSD (once per vault). A plain key is ready to use; a locked one needs Unlock. */
    async function refresh() {
      const vid = V() && V().data && V().data.vaultId;
      if (!vid || state.loadedFor === vid) return;
      state.loadedFor = vid;
      let rec = null;
      try { rec = await V().readSecret(P.id); } catch { rec = null; }
      state.stored = L().describe(rec);
      if (!state.key && state.stored.kind === 'plain') { state.key = rec.key; state.where = 'plain'; }
      state.record = rec;
      notify();
    }

    function forget() {
      state.key = ''; state.where = ''; state.stored = null; state.record = null; state.loadedFor = null;
      notify();
    }

    const get = () => state.key;

    function status() {
      if (state.key) return { set: true, usable: true, where: state.where, masked: L().mask(state.key), saved: state.stored && state.stored.saved };
      if (state.stored && state.stored.kind === 'locked') return { set: true, usable: false, where: 'locked', masked: state.stored.masked, saved: state.stored.saved };
      return { set: false, usable: false, where: '', masked: '' };
    }

    function steps() {
      const { h } = ui;
      const link = (url, text) => h('button', { type: 'button', class: 'linkish', onclick: () => openLink(url) }, text, ' ↗');
      const list = P.steps(h, link);
      list.push(
        [h('strong', {}, 'Add it to CaseVault. '), 'Come back to this tab, click ', h('strong', {}, 'Add API key…'), ', paste it (Ctrl+V), choose where to keep it, and click ', h('strong', {}, 'Save key'), '.'],
        [h('strong', {}, 'Test it. '), 'Click ', h('strong', {}, 'Go online'), ', then ', h('strong', {}, 'Test key'), '. CaseVault asks for the list of models, which contains no case data. "Key works" means you\'re ready.'],
        [h('strong', {}, 'To stop using it. '), 'Click ', h('strong', {}, 'Remove API key…'), ' here, then delete the key at ', link(P.keysUrl, P.keysUrl.replace(/^https:\/\//, '')), '. Do it straight away if the SSD or a PC is lost.'],
      );
      return h('ol', { class: 'key-steps' }, list.map((li) => h('li', {}, ...li)));
    }

    function guide(open = false) {
      const { h } = ui;
      return h('details', { class: 'key-guide', open },
        h('summary', {}, `How to get ${P.short === 'Anthropic' ? 'an Anthropic' : P.short === 'OpenRouter' ? 'an OpenRouter' : `a ${P.short}`} API key, step by step`),
        steps(),
        h('p', { class: `small ${P.free ? 'warn-text' : 'muted'}` }, P.terms));
    }

    async function addDialog() {
      const { h, openDialog, toast, Save } = ui;
      const had = status().set;
      const result = await openDialog((close) => {
        const input = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: P.placeholder, class: 'key-input', autofocus: true, 'aria-describedby': `key-problem-${P.id}` });
        const showBtn = h('button', { type: 'button', class: 'btn small' }, 'Show');
        showBtn.addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; showBtn.textContent = input.type === 'password' ? 'Show' : 'Hide'; });
        const problem = h('p', { id: `key-problem-${P.id}`, class: 'small', 'aria-live': 'polite' });
        const where = (value, label, hint, checked = false) => {
          const r = h('input', { type: 'radio', name: 'key-where', value, checked });
          return { r, el: h('label', { class: 'radio-row' }, r, h('span', {}, h('strong', {}, label), h('span', { class: 'muted small block' }, hint))) };
        };
        const wSession = where('session', 'This session only', 'Safest. You paste it again each time you open CaseVault.', true);
        const wLocked = where('locked', 'Save on the SSD, locked with a passphrase', 'Encrypted in CaseVault-Data\\secrets. You type the passphrase once per session.');
        const wPlain = where('plain', 'Save on the SSD without a passphrase', 'Protected only by BitLocker on the CASEVAULT drive. Anyone who can open the unlocked drive can use it.');
        const pass1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Passphrase', title: 'At least 8 characters.' });
        const pass2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repeat the passphrase' });
        const passRow = h('div', { class: 'row pass-row', hidden: true }, pass1, pass2);
        const understood = h('input', { type: 'checkbox' });
        const save = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Save key');
        const update = () => {
          const c = L().check(input.value, P.id);
          const w = [wSession, wLocked, wPlain].find((x) => x.r.checked).r.value;
          passRow.hidden = w !== 'locked';
          problem.className = `small ${input.value && !c.ok ? 'error-text' : 'ok-text'}`;
          problem.textContent = !input.value ? '' : c.ok ? `✓ Looks like ${P.short === 'Anthropic' || P.short === 'OpenRouter' ? 'an' : 'a'} ${P.short} key: ${L().mask(c.key)}` : c.problem;
          const passOk = w !== 'locked' || (pass1.value.length >= 8 && pass1.value === pass2.value);
          save.disabled = !c.ok || !passOk || !understood.checked;
        };
        for (const el of [input, pass1, pass2, understood, wSession.r, wLocked.r, wPlain.r]) el.addEventListener('input', update);
        understood.addEventListener('change', update);
        return h('form', { class: 'key-form', onsubmit: (e) => {
          e.preventDefault();
          if (save.disabled) return;
          close({ key: L().check(input.value, P.id).key, where: [wSession, wLocked, wPlain].find((x) => x.r.checked).r.value, pass: pass1.value });
        } },
        h('h2', {}, had ? `Replace the ${P.short} API key` : `Add ${P.short === 'Anthropic' || P.short === 'OpenRouter' ? 'an' : 'a'} ${P.short} API key`),
        h('div', { class: 'key-layout' },
          h('div', { class: 'key-guide-col' }, h('h3', {}, 'Get a key'), steps(), h('p', { class: `small ${P.free ? 'warn-text' : 'muted'}` }, P.terms)),
          h('div', { class: 'key-paste-col' },
            h('h3', {}, 'Paste it here'),
            h('div', { class: 'row' }, input, showBtn),
            problem,
            h('fieldset', { class: 'plain-fieldset' }, h('legend', {}, 'Where to keep it'), wSession.el, wLocked.el, passRow, wPlain.el),
            h('label', { class: 'check-row' }, understood, h('span', {}, P.costCheck)),
            h('p', { class: 'muted small explain' }, `The key is only ever sent to ${P.host}, in the request header. It is never written to vault.json, the browser, or any log.`))),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          save));
      });
      if (!result) return false;
      try {
        if (result.where === 'session') {
          // Replacing a saved key with a session one removes the saved copy, so two keys never linger.
          if (state.stored && state.stored.kind) await Save.track('secret', () => V().writeSecret(P.id, null));
          state.stored = { kind: null };
          state.record = null;
        } else {
          const rec = result.where === 'locked' ? await L().lock(result.key, result.pass) : L().plainRecord(result.key);
          await Save.track('secret', () => V().writeSecret(P.id, rec));
          state.record = rec;
          state.stored = L().describe(rec);
        }
        state.key = result.key;
        state.where = result.where;
        notify();
        toast(`${P.short} API key ${had ? 'replaced' : 'added'}: ${WHERE_TEXT[result.where]}. Go online and click "Test key" to check it.`, 'success', 9000);
        return true;
      } catch (err) {
        toast(`The key was not saved: ${err.message}`, 'error', 9000);
        return false;
      }
    }

    async function unlockDialog() {
      const { h, openDialog, toast } = ui;
      if (!state.record || state.record.kind !== 'locked') return false;
      const pass = await openDialog((close) => {
        const p = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true });
        return h('form', { onsubmit: (e) => { e.preventDefault(); close(p.value); } },
          h('h2', {}, `Unlock the ${P.short} API key`),
          h('p', { class: 'muted small' }, `Key ${state.stored.masked}, saved on the SSD. Type the passphrase you chose when you added it.`),
          ui.field('Passphrase', p),
          h('p', { class: 'muted small explain' }, 'Forgot it? Remove the key and add it again (create a new key if you no longer have it).'),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Unlock')));
      });
      if (!pass) return false;
      try {
        state.key = await L().unlock(state.record, pass);
        state.where = 'locked';
        notify();
        toast(`${P.short} API key unlocked for this session.`, 'success');
        return true;
      } catch (err) {
        toast(err.message, 'error');
        return false;
      }
    }

    async function removeDialog() {
      const { h, openDialog, toast, Save } = ui;
      const st = status();
      const ok = await openDialog((close) => h('div', {},
        h('h2', {}, `Remove the ${P.short} API key?`),
        h('p', {}, `Key ${st.masked} is removed from CaseVault${state.stored && state.stored.kind ? ' and deleted from the SSD' : ''}.`),
        h('p', { class: 'hint' }, h('strong', {}, 'Also delete it at the service'), ' if you no longer need it, or if the SSD or a PC might be lost: ',
          h('button', { type: 'button', class: 'linkish', onclick: () => openLink(P.keysUrl) }, `${P.short} API keys ↗`), '. A removed-but-not-deleted key still works for anyone who has a copy.'),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
          h('button', { class: 'btn danger', type: 'button', onclick: () => close(true) }, 'Remove API key'))));
      if (!ok) return false;
      try {
        await Save.track('secret', () => V().writeSecret(P.id, null));
        state.key = ''; state.where = ''; state.record = null; state.stored = { kind: null };
        notify();
        toast(`${P.short} API key removed from CaseVault and the SSD. Remember to delete it at the service if you're done with it.`, 'success', 9000);
        return true;
      } catch (err) {
        toast(`Could not remove the key: ${err.message}`, 'error');
        return false;
      }
    }

    /** One look-up with no case data. Returns { models, message }; throws with a plain explanation. */
    async function test() {
      if (!state.key) throw new Error(status().where === 'locked' ? 'Unlock the key first.' : 'Add an API key first.');
      if (!CVOutbound.isOnline()) throw new Error('Go online first (the Offline button in the header), then test the key.');
      let r;
      try {
        r = await P.test(state.key);
      } catch (err) {
        CVOutbound.record({ channel: 'online-ai', event: 'key-test', destination: P.host, purpose: 'Test API key', result: 'failed' });
        if (/Failed to fetch|NetworkError|Load failed/i.test(err.message)) throw new Error(`Could not reach ${P.host} (${err.message}). Check the internet connection.`);
        throw err;
      }
      CVOutbound.record({ channel: 'online-ai', event: 'key-test', destination: P.host, purpose: 'Test API key', result: r.status });
      return r;
    }

    function card({ compact = false } = {}) {
      const { h } = ui;
      const el = h('div', { class: 'key-card' });
      const draw = () => {
        const st = status();
        const testBtn = h('button', { class: 'btn', type: 'button', disabled: !st.usable }, 'Test key');
        const lt = state.lastTest && state.lastTest.key === state.key ? state.lastTest : null;
        const result = h('p', { class: `small ${lt ? (lt.ok ? 'ok-text' : 'error-text') : ''}`, 'aria-live': 'polite' }, lt ? lt.text : '');
        testBtn.addEventListener('click', async () => {
          testBtn.disabled = true;
          result.className = 'small muted';
          result.textContent = 'Testing…';
          try { const r = await test(); state.lastTest = { key: state.key, ok: true, text: `✓ ${r.message}` }; } catch (err) { state.lastTest = { key: state.key, ok: false, text: err.message }; }
          notify();
        });
        el.className = `key-card ${st.usable ? 'ok' : st.set ? 'locked' : 'none'}`;
        el.replaceChildren(
          h('div', { class: 'key-status' },
            h('span', { class: 'key-dot', 'aria-hidden': 'true' }),
            h('div', {},
              h('strong', {}, `${P.name}: ${st.usable ? 'key added' : st.set ? 'key saved, locked' : 'no key'}`),
              h('div', { class: 'small muted' }, st.set
                ? [h('code', {}, st.masked), ` · ${WHERE_TEXT[st.where] || ''}`, st.saved ? ` · saved ${ui.fmtDate(st.saved.slice(0, 10))}` : '']
                : P.none))),
          h('div', { class: 'row key-actions' },
            st.set && !st.usable ? h('button', { class: 'btn primary', type: 'button', onclick: () => unlockDialog() }, 'Unlock…') : null,
            h('button', { class: `btn ${st.set ? '' : 'primary'}`, type: 'button', onclick: () => addDialog() }, st.set ? 'Replace…' : 'Add API key…'),
            testBtn,
            st.set ? h('button', { class: 'btn danger-ghost', type: 'button', onclick: () => removeDialog() }, 'Remove API key…') : null),
          result,
          compact ? null : guide(false));
      };
      cards.add({ el, draw });
      draw();
      refresh().catch(() => {});
      return el;
    }

    return { provider: P, card, guide, get, status, refresh, forget, addDialog, unlockDialog, removeDialog, test, onChange: (fn) => listeners.add(fn), CONSOLE_KEYS: P.keysUrl };
  }

  const keys = Object.fromEntries(Object.entries(PROVIDERS).map(([id, P]) => [id, make(P)]));
  const all = () => Object.values(keys);

  // CVApiKey keeps its v1.9 shape (the Anthropic key); init/forget/refresh cover every service.
  root.CVApiKey = {
    ...keys.anthropic,
    init(kit) { ui = kit; },
    forget() { for (const k of all()) k.forget(); },
    refresh() { return Promise.all(all().map((k) => k.refresh())); },
  };
  root.CVApiKeys = keys;
  root.CVApiProviders = PROVIDERS;
})(this);
