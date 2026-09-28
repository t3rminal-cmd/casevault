/* CaseVault — managing the Anthropic API key (option b of online AI).
 *
 * A card that shows whether a key is set and where it's kept, with:
 *   Add API key… / Replace…  step-by-step guide + paste box + where to keep it
 *   Unlock…                  for a key saved on the SSD with a passphrase
 *   Test key                 one look-up (the list of models) to api.anthropic.com; no case data
 *   Remove API key…          from memory and the SSD, with a reminder to revoke it in the Console
 * and "How to get an API key", the same guide, readable any time.
 *
 * Shown on the online page (Anthropic API service) and in Vault → Online features.
 */
'use strict';

(function (root) {
  const CONSOLE = 'https://platform.claude.com/';
  const CONSOLE_KEYS = 'https://platform.claude.com/settings/keys';
  const CONSOLE_BILLING = 'https://platform.claude.com/settings/billing';
  const CONSOLE_LIMITS = 'https://platform.claude.com/settings/limits';
  const MODELS_URL = 'https://api.anthropic.com/v1/models';
  const SECRET = 'anthropic';

  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  const L = () => root.CVApiKeyLib;
  let ui = null;

  // In memory only. where: 'session' | 'locked' | 'plain'
  const state = { key: '', where: '', stored: null, loadedFor: null, lastTest: null }; // lastTest: { key, ok, text }
  const listeners = new Set();
  const cards = new Set(); // redraw functions of the cards on screen
  const notify = () => {
    for (const c of [...cards]) { if (c.el.isConnected) c.draw(); else cards.delete(c); }
    for (const fn of listeners) { try { fn(); } catch (err) { console.error(err); } }
  };

  /** Read what's on the SSD (once per vault). A plain key is ready to use; a locked one needs Unlock. */
  async function refresh() {
    const vid = V() && V().data && V().data.vaultId;
    if (!vid) return;
    if (state.loadedFor === vid) return;
    state.loadedFor = vid;
    let rec = null;
    try { rec = await V().readSecret(SECRET); } catch { rec = null; }
    state.stored = L().describe(rec);
    if (!state.key && state.stored.kind === 'plain') { state.key = rec.key; state.where = 'plain'; }
    state.record = rec;
    notify();
  }

  /** Forget the key in memory (another vault opened, or the SSD unplugged). The SSD copy is untouched. */
  function forget() {
    state.key = ''; state.where = ''; state.stored = null; state.record = null; state.loadedFor = null;
    notify();
  }

  function get() { return state.key; }

  function status() {
    if (state.key) return { set: true, usable: true, where: state.where, masked: L().mask(state.key), saved: state.stored && state.stored.saved };
    if (state.stored && state.stored.kind === 'locked') return { set: true, usable: false, where: 'locked', masked: state.stored.masked, saved: state.stored.saved };
    return { set: false, usable: false, where: '', masked: '' };
  }

  const WHERE_TEXT = {
    session: 'kept for this session only (gone when you close CaseVault)',
    locked: 'saved on the SSD, locked with your passphrase',
    plain: 'saved on the SSD (protected by BitLocker only)',
  };

  function openLink(url) { window.open(url, '_blank', 'noopener,noreferrer'); }

  /* ---------- the guide ---------- */

  function steps() {
    const { h } = ui;
    const link = (url, text) => h('button', { type: 'button', class: 'linkish', onclick: () => openLink(url) }, text, ' ↗');
    return h('ol', { class: 'key-steps' },
      h('li', {}, h('strong', {}, 'Open the Claude Console. '), 'Click ', link(CONSOLE, 'platform.claude.com'),
        '. It opens in a new browser tab. This is Anthropic\'s site for developers; it is separate from claude.ai (the old address console.anthropic.com goes to the same place).'),
      h('li', {}, h('strong', {}, 'Sign in or create an account. '), 'Use your email, Google or single sign-on. Your Claude Pro login can be used, but API use is billed on its own: a Pro subscription does not include API credit. If your agency has an organisation account, ask its administrator to invite you instead.'),
      h('li', {}, h('strong', {}, 'Add credit. '), 'Go to ', link(CONSOLE_BILLING, 'Settings → Billing'),
        ', add a payment method and buy credit (the minimum is small, about $5). Until there is credit, every request is refused. You only pay for what you use.'),
      h('li', {}, h('strong', {}, 'Set a spending limit (recommended). '), 'In ', link(CONSOLE_LIMITS, 'Settings → Limits'),
        ', set a monthly limit and an email alert, so a mistake can never cost more than you chose. Leave auto-reload off unless you need it.'),
      h('li', {}, h('strong', {}, 'Create the key. '), 'Go to ', link(CONSOLE_KEYS, 'Settings → API keys'),
        ' and click ', h('strong', {}, 'Create Key'), '. Name it after the PC, for example ', h('code', {}, 'CaseVault - Beelink'), ' or ', h('code', {}, 'CaseVault - L14'),
        ' (one key per PC means you can switch one off without touching the other). Keep the Default workspace.'),
      h('li', {}, h('strong', {}, 'Copy it now. '), 'The key starts with ', h('code', {}, 'sk-ant-api03-'), ' and is about 100 characters long. The Console shows it ', h('strong', {}, 'only once'),
        '. Click the copy button next to it. Don\'t paste it into email, chat, notes or a document.'),
      h('li', {}, h('strong', {}, 'Add it to CaseVault. '), 'Come back to this tab, click ', h('strong', {}, 'Add API key…'),
        ', paste it (Ctrl+V), choose where to keep it, and click ', h('strong', {}, 'Save key'), '.'),
      h('li', {}, h('strong', {}, 'Test it. '), 'Click ', h('strong', {}, 'Go online'), ', then ', h('strong', {}, 'Test key'),
        '. CaseVault asks Anthropic for its list of models, which contains no case data. "Key works" means you\'re ready.'),
      h('li', {}, h('strong', {}, 'To stop using it. '), 'Click ', h('strong', {}, 'Remove API key…'), ' here, then delete (revoke) the key in ', link(CONSOLE_KEYS, 'Settings → API keys'),
        '. Revoking works instantly everywhere; do it straight away if the SSD or a PC is lost.'));
  }

  function guide(open = false) {
    const { h } = ui;
    return h('details', { class: 'key-guide', open },
      h('summary', {}, 'How to get an API key, step by step'),
      steps(),
      h('p', { class: 'muted small' }, 'Anthropic\'s commercial terms say API data isn\'t used to train models by default. Check them, and your agency\'s policy, before using the API with case work. CaseVault still hides names and numbers before anything is sent.'));
  }

  /* ---------- dialogs ---------- */

  async function addDialog() {
    const { h, openDialog, toast, Save } = ui;
    const had = status().set;
    const result = await openDialog((close) => {
      const input = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-api03-…', class: 'key-input', autofocus: true, 'aria-describedby': 'key-problem' });
      const showBtn = h('button', { type: 'button', class: 'btn small' }, 'Show');
      showBtn.addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; showBtn.textContent = input.type === 'password' ? 'Show' : 'Hide'; });
      const problem = h('p', { id: 'key-problem', class: 'small', 'aria-live': 'polite' });
      const where = (value, label, hint, checked = false) => {
        const r = h('input', { type: 'radio', name: 'key-where', value, checked });
        return { r, el: h('label', { class: 'radio-row' }, r, h('span', {}, h('strong', {}, label), h('span', { class: 'muted small block' }, hint))) };
      };
      const wSession = where('session', 'This session only', 'Safest. You paste it again each time you open CaseVault.', true);
      const wLocked = where('locked', 'Save on the SSD, locked with a passphrase', 'Encrypted in CaseVault-Data\\secrets. You type the passphrase once per session.');
      const wPlain = where('plain', 'Save on the SSD without a passphrase', 'Protected only by BitLocker on the CASEVAULT drive. Anyone who can open the unlocked drive can use it.');
      const pass1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Passphrase (8+ characters)' });
      const pass2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repeat the passphrase' });
      const passRow = h('div', { class: 'row pass-row', hidden: true }, pass1, pass2);
      const billing = h('input', { type: 'checkbox' });
      const save = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Save key');

      const update = () => {
        const c = L().check(input.value);
        const w = [wSession, wLocked, wPlain].find((x) => x.r.checked).r.value;
        passRow.hidden = w !== 'locked';
        problem.className = `small ${input.value && !c.ok ? 'error-text' : 'ok-text'}`;
        problem.textContent = !input.value ? '' : c.ok ? `✓ Looks like an API key: ${L().mask(c.key)}` : c.problem;
        const passOk = w !== 'locked' || (pass1.value.length >= 8 && pass1.value === pass2.value);
        save.disabled = !c.ok || !passOk || !billing.checked;
      };
      for (const el of [input, pass1, pass2, billing, wSession.r, wLocked.r, wPlain.r]) el.addEventListener('input', update);
      billing.addEventListener('change', update);

      return h('form', { class: 'key-form', onsubmit: (e) => {
        e.preventDefault();
        if (save.disabled) return;
        close({ key: L().check(input.value).key, where: [wSession, wLocked, wPlain].find((x) => x.r.checked).r.value, pass: pass1.value });
      } },
      h('h2', {}, had ? 'Replace the API key' : 'Add an Anthropic API key'),
      h('div', { class: 'key-layout' },
        h('div', { class: 'key-guide-col' }, h('h3', {}, 'Get a key'), steps()),
        h('div', { class: 'key-paste-col' },
          h('h3', {}, 'Paste it here'),
          h('div', { class: 'row' }, input, showBtn),
          problem,
          h('fieldset', { class: 'plain-fieldset' }, h('legend', {}, 'Where to keep it'), wSession.el, wLocked.el, passRow, wPlain.el),
          h('label', { class: 'check-row' }, billing, h('span', {}, 'I understand API use is billed by Anthropic to the Console account, separately from any Claude subscription.')),
          h('p', { class: 'muted small' }, 'The key is only ever sent to api.anthropic.com, in the request header. It is never written to vault.json, the browser, or any log.'))),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        save));
    });
    if (!result) return false;
    try {
      if (result.where === 'session') {
        // Replacing a saved key with a session one removes the saved copy, so two keys never linger.
        if (state.stored && state.stored.kind) await Save.track('secret', () => V().writeSecret(SECRET, null));
        state.stored = { kind: null };
        state.record = null;
      } else {
        const rec = result.where === 'locked' ? await L().lock(result.key, result.pass) : L().plainRecord(result.key);
        await Save.track('secret', () => V().writeSecret(SECRET, rec));
        state.record = rec;
        state.stored = L().describe(rec);
      }
      state.key = result.key;
      state.where = result.where;
      notify();
      toast(`API key ${had ? 'replaced' : 'added'}: ${WHERE_TEXT[result.where]}. Go online and click "Test key" to check it.`, 'success', 9000);
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
        h('h2', {}, 'Unlock the API key'),
        h('p', { class: 'muted small' }, `Key ${state.stored.masked}, saved on the SSD. Type the passphrase you chose when you added it.`),
        ui.field('Passphrase', p),
        h('p', { class: 'muted small' }, 'Forgot it? Remove the key and add it again (create a new key in the Console if you no longer have it).'),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Unlock')));
    });
    if (!pass) return false;
    try {
      state.key = await L().unlock(state.record, pass);
      state.where = 'locked';
      notify();
      toast('API key unlocked for this session.', 'success');
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
      h('h2', {}, 'Remove the API key?'),
      h('p', {}, `Key ${st.masked} is removed from CaseVault${state.stored && state.stored.kind ? ' and deleted from the SSD' : ''}. The online page can then only use claude.ai (copy & paste).`),
      h('p', { class: 'hint' }, h('strong', {}, 'Also revoke it in the Console'), ' if you no longer need it, or if the SSD or a PC might be lost: ',
        h('button', { type: 'button', class: 'linkish', onclick: () => openLink(CONSOLE_KEYS) }, 'Settings → API keys ↗'), ', then the key\'s menu → Delete. A removed-but-not-revoked key still works for anyone who has a copy.'),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => close(true) }, 'Remove API key'))));
    if (!ok) return false;
    try {
      await Save.track('secret', () => V().writeSecret(SECRET, null));
      state.key = ''; state.where = ''; state.record = null; state.stored = { kind: null };
      notify();
      toast('API key removed from CaseVault and the SSD. Remember to revoke it in the Console if you\'re done with it.', 'success', 9000);
      return true;
    } catch (err) {
      toast(`Could not remove the key: ${err.message}`, 'error');
      return false;
    }
  }

  /** One look-up with no case data. Returns a message; throws on failure with a plain explanation. */
  async function test() {
    if (!state.key) throw new Error(status().where === 'locked' ? 'Unlock the key first.' : 'Add an API key first.');
    if (!CVOutbound.isOnline()) throw new Error('Go online first (the Offline button in the header), then test the key.');
    let res;
    try {
      res = await CVOutbound.sendMeta(MODELS_URL, { headers: { 'x-api-key': state.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    } catch (err) {
      throw new Error(`Could not reach api.anthropic.com (${err.message}). Check the internet connection.`);
    }
    const data = await res.json().catch(() => null);
    CVOutbound.record({ channel: 'online-ai', event: 'key-test', destination: 'api.anthropic.com', purpose: 'Test API key', result: res.status });
    if (res.status === 401) throw new Error('Anthropic refused the key: it was mistyped, revoked or deleted. Create a new one in the Console and use Replace.');
    if (res.status === 403) throw new Error('The key isn\'t allowed to do this. Check the key\'s workspace in the Console.');
    if (!res.ok) throw new Error((data && data.error && data.error.message) || `Anthropic answered ${res.status} ${res.statusText}.`);
    const models = (data && data.data || []).map((m) => m.id);
    return { models, message: `Key works. ${models.length} models available${models.length ? `, for example ${models.slice(0, 2).join(', ')}` : ''}. If sending still fails with a credit error, add credit in Settings → Billing.` };
  }

  /* ---------- the card ---------- */

  function card({ compact = false } = {}) {
    const { h, toast } = ui;
    const el = h('div', { class: 'key-card' });
    const draw = () => {
      const st = status();
      const testBtn = h('button', { class: 'btn', type: 'button', disabled: !st.usable }, 'Test key');
      // The last test result is kept in memory (for this key), so it survives the page redrawing.
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
            h('strong', {}, st.usable ? 'API key added' : st.set ? 'API key saved, locked' : 'No API key'),
            h('div', { class: 'small muted' }, st.set
              ? [h('code', {}, st.masked), ` · ${WHERE_TEXT[st.where] || ''}`, st.saved ? ` · saved ${ui.fmtDate(st.saved.slice(0, 10))}` : '']
              : 'Needed only for "Anthropic API" answers inside CaseVault. claude.ai (copy & paste) works without one.'))),
        h('div', { class: 'row key-actions' },
          st.set && !st.usable ? h('button', { class: 'btn primary', type: 'button', onclick: () => unlockDialog() }, 'Unlock…') : null,
          h('button', { class: `btn ${st.set ? '' : 'primary'}`, type: 'button', onclick: () => addDialog() }, st.set ? 'Replace…' : 'Add API key…'),
          testBtn,
          st.set ? h('button', { class: 'btn danger-ghost', type: 'button', onclick: () => removeDialog() }, 'Remove API key…') : null),
        result,
        compact ? null : guide(!st.set));
    };
    cards.add({ el, draw });
    draw();
    refresh().catch(() => {});
    return el;
  }

  function init(kit) { ui = kit; }

  root.CVApiKey = { init, card, guide, get, status, refresh, forget, addDialog, unlockDialog, removeDialog, test, onChange: (fn) => listeners.add(fn), CONSOLE_KEYS };
})(this);
