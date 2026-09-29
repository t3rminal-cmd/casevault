/* CaseVault — the outbound gate.
 *
 * Everything that is about to leave this computer goes through here first:
 *   - online AI (Anthropic API, or copy & paste into claude.ai with your Claude subscription)
 *   - department mail (an Outlook draft or a mailto: hand-off)
 *
 * 1. review() scans the text with the PII scanner (js/secure/pii.js) and shows a review screen:
 *    online AI gets placeholders instead of names/numbers ("redact"); mail shows a warning ("warn").
 *    Nothing is sent until the user confirms on that screen.
 * 2. The confirmed review returns a one-time ticket. send() only makes a network request with an
 *    unused ticket, only to an allowed host, only while "online" is switched on, and only if none of
 *    the redacted values appear in the request (a last leak check).
 * 3. Every hand-off is logged on the SSD in CaseVault-Data/logs/outbound-YYYY-MM.json: when, where,
 *    why, and how many of each kind of detail were found or redacted. Never the content itself.
 *
 * "Online" is off every time CaseVault starts, and switches itself off again after a period without
 * use (15 minutes unless changed in Settings).
 */
'use strict';

(function (root) {
  const ALLOWED_HOSTS = ['api.anthropic.com'];
  const TICKET_MS = 5 * 60 * 1000;
  const CHANNELS = {
    'online-ai': { label: 'Online AI · Anthropic API', network: true },
    'claude-web': { label: 'claude.ai · copy and paste', network: false },
    mail: { label: 'Department mail', network: false },
  };

  let ui = null;
  let onlineUntil = 0;       // 0 = offline
  let lastUse = 0;
  const listeners = new Set();
  const tickets = new Map(); // id -> { channel, host, expires, used, values }

  const P = () => root.CVPii;
  // vault.js declares Vault as a top-level const of the page, not a window property.
  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  const settings = () => ((V() && V().data && V().data.settings) || {});
  const onlineSettings = () => ({ allowed: false, idleMinutes: 15, ...(settings().online || {}) });
  const notify = () => { for (const fn of listeners) { try { fn(); } catch (err) { console.error(err); } } };

  /* ---------- online switch ---------- */

  function isOnline() {
    if (onlineUntil && Date.now() > onlineUntil) goOffline('idle');
    return !!onlineUntil;
  }

  function idleMs() { return Math.max(1, Number(onlineSettings().idleMinutes) || 15) * 60000; }

  function goOnline() {
    if (!onlineSettings().allowed) throw new Error('Online features are turned off. Turn them on in Vault → Online features first.');
    lastUse = Date.now();
    onlineUntil = lastUse + idleMs();
    log({ channel: 'session', event: 'online-on', destination: ALLOWED_HOSTS.join(', ') });
    notify();
  }

  function goOffline(reason = 'user') {
    if (!onlineUntil) return;
    onlineUntil = 0;
    for (const t of tickets.values()) t.used = true;
    log({ channel: 'session', event: 'online-off', reason });
    notify();
    if (ui && reason === 'idle') ui.toast('Online AI switched off after inactivity. CaseVault is offline again.', 'info', 8000);
  }

  function touch() {
    if (!onlineUntil) return;
    lastUse = Date.now();
    onlineUntil = lastUse + idleMs();
    notify();
  }

  const minutesLeft = () => (onlineUntil ? Math.max(0, Math.ceil((onlineUntil - Date.now()) / 60000)) : 0);

  /* ---------- helpers ---------- */

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function log(entry) {
    if (!V() || !V().data) return Promise.resolve();
    return V().appendLog('outbound', entry).catch((err) => console.warn('Outbound log not written', err));
  }

  /** Known names/numbers for a case (client, case numbers, My details, watch list). */
  function knownFor(caseObj) {
    const s = settings();
    return P().knownTerms({ caseObj, affiant: s.affiant, watchlist: s.piiWatchlist || [], caseIndex: (V() && V().data && V().data.cases) || [] });
  }

  // A redacted value must not appear anywhere in what is about to be sent.
  function leaks(body, values) {
    const hay = String(body).toLowerCase();
    return values.filter((v) => {
      const s = String(v).trim().toLowerCase();
      return s.length >= 4 && hay.includes(s);
    });
  }

  /* ---------- review screen ---------- */

  /**
   * opts: {
   *   channel: 'online-ai' | 'claude-web' | 'mail',
   *   destination: string shown to the user,
   *   purpose: e.g. 'Research' | 'Drafting' | 'Mail',
   *   caseObj: the case (for known names) or null,
   *   parts: [{ label, text }]  (redacted in 'redact' mode),
   *   attachments: [{ name, size, text|null }]  (mail only: scanned, never changed),
   *   mode: 'redact' | 'warn',
   *   map: an existing placeholder map to keep a conversation consistent,
   *   confirmText: the Send button's label,
   *   checks: [{ ok, text, warn }] extra safeguards to show; a failed one blocks sending unless warn: true
   * }
   * Resolves to null (cancelled) or { ticket, parts: [{label, text}], map, counts }.
   */
  async function review(opts) {
    const { channel, mode = 'redact', parts = [], attachments = [], caseObj = null } = opts;
    const { h, openDialog } = ui;
    const map = opts.map || {};
    const extra = [];  // terms the user added on this screen
    const blockers = (opts.checks || []).filter((c) => !c.ok && !c.warn);
    const warnings = (opts.checks || []).filter((c) => !c.ok && c.warn);

    const scanAll = () => {
      const known = [...knownFor(caseObj), ...extra.map((value) => ({ value, type: 'known' }))];
      // Values already in the map are found again, so they get the same placeholder.
      for (const v of Object.values(map)) known.push({ value: v, type: 'known' });
      return {
        parts: parts.map((p) => ({ ...p, findings: P().scan(p.text, { known }) })),
        attachments: attachments.map((a) => ({ ...a, findings: a.text ? P().scan(a.text, { known }) : null })),
      };
    };

    let scanned = scanAll();
    const skipped = parts.map(() => new Set());

    const result = await openDialog((close) => {
      const body = h('div', { class: 'review-body' });
      const confirmBox = h('input', { type: 'checkbox' });
      const typed = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'narrow', 'aria-label': 'Type SEND to confirm' });
      const typedRow = h('label', { class: 'field', hidden: true }, h('span', {}, 'Sensitive details found (SSN, date of birth, ID, card or bank number). Type ', h('strong', {}, 'SEND'), ' to confirm they must go:'), typed);
      const sendBtn = h('button', { class: `btn ${mode === 'warn' ? 'danger' : 'primary'}`, type: 'submit', disabled: true }, opts.confirmText || 'Send');
      const addTerm = h('input', { type: 'text', placeholder: 'Anything else to hide, e.g. a nickname or street', class: 'grow', autocomplete: 'off' });

      let redactedParts = [];
      const allFindings = () => [...scanned.parts.flatMap((p) => p.findings), ...scanned.attachments.flatMap((a) => a.findings || [])];

      const refresh = () => {
        const critical = P().hasCritical(allFindings());
        const needTyped = mode === 'warn' && critical;
        typedRow.hidden = !needTyped;
        sendBtn.disabled = !!blockers.length || !confirmBox.checked || (needTyped && typed.value.trim() !== 'SEND');
      };

      const draw = () => {
        const nodes = [];
        if (mode === 'redact') {
          redactedParts = scanned.parts.map((p, i) => ({ label: p.label, ...P().redact(p.text, p.findings, { map, skip: skipped[i] }) }));
        }
        scanned.parts.forEach((p, i) => {
          const rows = p.findings.map((f, k) => {
            const ctx = P().context(p.text, f);
            const box = mode === 'redact' ? h('input', { type: 'checkbox', checked: !skipped[i].has(k), disabled: f.locked, title: f.locked ? 'Always hidden from online services' : 'Untick to send this as it is' }) : null;
            if (box) box.addEventListener('change', () => { if (box.checked) skipped[i].delete(k); else skipped[i].add(k); draw(); });
            return h('li', { class: `pii-row lvl-${f.level}` }, box,
              h('span', { class: 'pii-type' }, f.label),
              h('span', { class: 'pii-ctx small' }, ctx.before, h('mark', {}, ctx.value), ctx.after));
          });
          nodes.push(h('section', { class: 'review-part' },
            h('h3', {}, p.label, ' ', h('span', { class: 'muted small' }, p.findings.length ? `${p.findings.length} detail${p.findings.length === 1 ? '' : 's'} found` : 'nothing found')),
            rows.length ? h('ul', { class: 'pii-list' }, rows) : null,
            mode === 'redact' ? h('details', { class: 'review-preview', open: true },
              h('summary', {}, 'Exactly what will be sent'),
              h('pre', { class: 'preview-text' }, redactedParts[i].text || '(empty)')) : null));
        });
        if (scanned.attachments.length) {
          nodes.push(h('section', { class: 'review-part' }, h('h3', {}, 'Attachments'),
            h('ul', { class: 'pii-list' }, scanned.attachments.map((a) => {
              const counts = a.findings ? P().summarize(a.findings) : null;
              const critical = a.findings && P().hasCritical(a.findings);
              return h('li', { class: `pii-row ${critical ? 'lvl-critical' : a.findings && a.findings.length ? 'lvl-high' : ''}` },
                h('span', { class: 'pii-type' }, a.name),
                h('span', { class: 'pii-ctx small' }, !a.findings ? 'Not scanned: no readable text, check it yourself'
                  : !a.findings.length ? 'No personal details found'
                    : Object.entries(counts).map(([t, n]) => `${n} × ${P().TYPES[t].label}`).join(' · ')));
            }))));
        }
        body.replaceChildren(...nodes);
        refresh();
      };

      confirmBox.addEventListener('change', refresh);
      typed.addEventListener('input', refresh);
      const addBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
        const v = addTerm.value.trim();
        if (v.length < 2) return;
        extra.push(v);
        addTerm.value = '';
        scanned = scanAll();
        skipped.forEach((s) => s.clear());
        draw();
      } }, 'Hide this too');
      addTerm.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });

      draw();
      const ch = CHANNELS[channel] || { label: channel };
      return h('form', { class: 'review-form', onsubmit: (e) => {
        e.preventDefault();
        if (sendBtn.disabled) return;
        close(true);
      } },
      h('h2', {}, 'Check before it leaves this computer'),
      h('div', { class: `review-dest ${ch.network ? 'net' : ''}` },
        h('strong', {}, ch.label), ' → ', opts.destination || '', opts.purpose ? h('span', { class: 'muted' }, ` · ${opts.purpose}`) : null),
      mode === 'redact'
        ? h('p', { class: 'hint' }, 'Names, numbers and other personal details are replaced with placeholders like ', h('code', {}, '[NAME_1]'),
          '. The real values stay on this computer and are put back into the answer here. Detection can miss things: read the text below before sending.')
        : h('p', { class: 'hint warn-hint' }, 'This message is not changed. Personal details found below will go to the recipients. Make sure each one is needed.'),
      blockers.length ? h('ul', { class: 'block-list' }, blockers.map((b) => h('li', {}, '⛔ ', b.text))) : null,
      warnings.length ? h('ul', { class: 'warn-list' }, warnings.map((b) => h('li', {}, '⚠ ', b.text))) : null,
      (opts.checks || []).filter((c) => c.ok).length ? h('ul', { class: 'ok-list' }, opts.checks.filter((c) => c.ok).map((c) => h('li', {}, '✓ ', c.text))) : null,
      body,
      mode === 'redact' ? h('div', { class: 'row' }, addTerm, addBtn) : null,
      typedRow,
      h('label', { class: 'check-row' }, confirmBox, h('span', {}, mode === 'redact' ? 'I have read the text above and it is safe to send.' : 'I have checked the recipients, the text and the attachments.')),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
        sendBtn));
    });

    if (!result) return null;

    const finalParts = mode === 'redact'
      ? scanned.parts.map((p, i) => ({ label: p.label, text: P().redact(p.text, p.findings, { map, skip: skipped[i] }).text }))
      : parts.map((p) => ({ label: p.label, text: p.text }));
    const findings = [...scanned.parts.flatMap((p) => p.findings), ...scanned.attachments.flatMap((a) => a.findings || [])];
    const counts = P().summarize(findings);
    const id = crypto.randomUUID();
    const values = mode === 'redact' ? Object.values(map) : [];
    tickets.set(id, { channel, expires: Date.now() + TICKET_MS, used: false, values });
    await log({
      channel, destination: opts.destination || '', purpose: opts.purpose || '', caseId: caseObj ? caseObj.id : null,
      mode, found: counts, redacted: mode === 'redact' ? findings.length - skipped.reduce((n, s) => n + s.size, 0) : 0,
      chars: finalParts.reduce((n, p) => n + p.text.length, 0),
      attachments: attachments.map((a) => a.name),
      sha256: await sha256(finalParts.map((p) => p.text).join('\n\u0000\n')),
    });
    touch();
    return { ticket: id, parts: finalParts, map, counts };
  }

  /* ---------- the only way out to the network ---------- */

  function checkUrl(url) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error(`CaseVault only connects to ${ALLOWED_HOSTS.join(', ')}.`);
    return u;
  }

  /** A request carrying case-derived text: needs an unused ticket from review(). */
  async function send(ticketId, url, init = {}) {
    if (!isOnline()) throw new Error('CaseVault is offline. Click "Go online" first.');
    checkUrl(url);
    const t = tickets.get(ticketId);
    if (!t || t.used || Date.now() > t.expires) throw new Error('This request was not reviewed, or its review has expired. Send it again.');
    if (t.channel !== 'online-ai') throw new Error('This review was not for an online request.');
    const leaked = leaks(init.body || '', t.values);
    if (leaked.length) throw new Error(`Stopped: ${leaked.length} hidden detail(s) would have been sent. Nothing was sent.`);
    t.used = true;
    touch();
    return root.fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  }

  /** A request with no case data at all (e.g. listing the available models): GET only. */
  async function sendMeta(url, init = {}) {
    if (!isOnline()) throw new Error('CaseVault is offline. Click "Go online" first.');
    checkUrl(url);
    if (init.body || (init.method && init.method.toUpperCase() !== 'GET')) throw new Error('Only simple look-ups may be sent without a review.');
    touch();
    return root.fetch(url, { ...init, method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  }

  /** Record a hand-off that didn't need a ticket (e.g. a copied text, an opened mail draft). */
  function record(entry) { return log(entry); }

  function init(kit) {
    ui = kit;
    setInterval(() => { if (onlineUntil) { isOnline(); notify(); } }, 30000);
  }

  const api = {
    ALLOWED_HOSTS, CHANNELS, init, review, send, sendMeta, record, knownFor, leaks,
    isOnline, goOnline, goOffline, minutesLeft, onlineSettings, onChange: (fn) => listeners.add(fn), sha256,
  };
  root.CVOutbound = api;
})(this);
