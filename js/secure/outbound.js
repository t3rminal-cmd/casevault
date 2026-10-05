/* CaseVault — the outbound check, for department mail.
 *
 * CaseVault itself never connects to the internet (v1.91: the online AI features are gone). The one
 * thing that leaves this computer is department mail, handed to Outlook or the mail app. Before it
 * goes:
 *   1. review() scans the subject, message and attachments with the PII scanner (js/secure/pii.js)
 *      and shows a review screen with the department rules; nothing is handed off until the user
 *      confirms there. Sensitive details (SSN, date of birth, ID, card or bank number) need SEND typed.
 *   2. Every hand-off is logged on the SSD in CaseVault-Data/logs/outbound-YYYY-MM.json: when, where,
 *      why, and how many of each kind of detail were found. Never the content itself.
 */
'use strict';

(function (root) {
  // Labels for the log. 'online-ai' and 'claude-web' only appear in logs written before v1.91.
  const CHANNELS = {
    mail: { label: 'Department mail' },
    'online-ai': { label: 'Online AI · API (before v1.91)' },
    'claude-web': { label: 'Online AI · copy and paste (before v1.91)' },
  };

  let ui = null;

  const P = () => root.CVPii;
  // vault.js declares Vault as a top-level const of the page, not a window property.
  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  const settings = () => ((V() && V().data && V().data.settings) || {});

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

  /* ---------- review screen ---------- */

  /**
   * opts: {
   *   channel: 'mail',
   *   destination: string shown to the user,
   *   purpose: e.g. 'Department mail',
   *   caseObj: the case (for known names) or null,
   *   parts: [{ label, text }]  (scanned, never changed),
   *   attachments: [{ name, size, text|null }]  (scanned, never changed),
   *   confirmText: the Send button's label,
   *   checks: [{ ok, text, warn }] extra safeguards to show; a failed one blocks sending unless warn: true
   * }
   * Resolves to null (cancelled) or { parts: [{label, text}], counts }.
   */
  async function review(opts) {
    const { channel, parts = [], attachments = [], caseObj = null } = opts;
    const { h, openDialog } = ui;
    const blockers = (opts.checks || []).filter((c) => !c.ok && !c.warn);
    const warnings = (opts.checks || []).filter((c) => !c.ok && c.warn);

    const scanAll = () => {
      const known = knownFor(caseObj);
      return {
        parts: parts.map((p) => ({ ...p, findings: P().scan(p.text, { known }) })),
        attachments: attachments.map((a) => ({ ...a, findings: a.text ? P().scan(a.text, { known }) : null })),
      };
    };

    const scanned = scanAll();

    const result = await openDialog((close) => {
      const body = h('div', { class: 'review-body' });
      const confirmBox = h('input', { type: 'checkbox' });
      const typed = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'narrow', 'aria-label': 'Type SEND to confirm' });
      const typedRow = h('label', { class: 'field', hidden: true }, h('span', {}, 'Sensitive details found (SSN, date of birth, ID, card or bank number). Type ', h('strong', {}, 'SEND'), ' to confirm they must go:'), typed);
      const sendBtn = h('button', { class: 'btn danger', type: 'submit', disabled: true }, opts.confirmText || 'Send');
      const allFindings = () => [...scanned.parts.flatMap((p) => p.findings), ...scanned.attachments.flatMap((a) => a.findings || [])];

      const refresh = () => {
        const critical = P().hasCritical(allFindings());
        const needTyped = critical;
        typedRow.hidden = !needTyped;
        sendBtn.disabled = !!blockers.length || !confirmBox.checked || (needTyped && typed.value.trim() !== 'SEND');
      };

      const draw = () => {
        const nodes = [];
        scanned.parts.forEach((p) => {
          const rows = p.findings.map((f) => {
            const ctx = P().context(p.text, f);
            return h('li', { class: `pii-row lvl-${f.level}` },
              h('span', { class: 'pii-type' }, f.label),
              h('span', { class: 'pii-ctx small' }, ctx.before, h('mark', {}, ctx.value), ctx.after));
          });
          nodes.push(h('section', { class: 'review-part' },
            h('h3', {}, p.label, ' ', h('span', { class: 'muted small' }, p.findings.length ? `${p.findings.length} detail${p.findings.length === 1 ? '' : 's'} found` : 'nothing found')),
            rows.length ? h('ul', { class: 'pii-list' }, rows) : null));
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

      draw();
      const ch = CHANNELS[channel] || { label: channel };
      return h('form', { class: 'review-form', onsubmit: (e) => {
        e.preventDefault();
        if (sendBtn.disabled) return;
        close(true);
      } },
      h('h2', {}, 'Check before it leaves this computer'),
      h('div', { class: 'review-dest' },
        h('strong', {}, ch.label), ' → ', opts.destination || '', opts.purpose ? h('span', { class: 'muted' }, ` · ${opts.purpose}`) : null),
      h('p', { class: 'hint warn-hint' }, 'This message is not changed. Personal details found below will go to the recipients. Make sure each one is needed.'),
      blockers.length ? h('ul', { class: 'block-list' }, blockers.map((b) => h('li', {}, '⛔ ', b.text))) : null,
      warnings.length ? h('ul', { class: 'warn-list' }, warnings.map((b) => h('li', {}, '⚠ ', b.text))) : null,
      (opts.checks || []).filter((c) => c.ok).length ? h('ul', { class: 'ok-list' }, opts.checks.filter((c) => c.ok).map((c) => h('li', {}, '✓ ', c.text))) : null,
      body,
      typedRow,
      h('label', { class: 'check-row' }, confirmBox, h('span', {}, 'I have checked the recipients, the text and the attachments.')),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
        sendBtn));
    });

    if (!result) return null;

    const finalParts = parts.map((p) => ({ label: p.label, text: p.text }));
    const findings = [...scanned.parts.flatMap((p) => p.findings), ...scanned.attachments.flatMap((a) => a.findings || [])];
    const counts = P().summarize(findings);
    await log({
      channel, destination: opts.destination || '', purpose: opts.purpose || '', caseId: caseObj ? caseObj.id : null,
      mode: 'warn', found: counts,
      chars: finalParts.reduce((n, p) => n + p.text.length, 0),
      attachments: attachments.map((a) => a.name),
      sha256: await sha256(finalParts.map((p) => p.text).join('\n\u0000\n')),
    });
    return { parts: finalParts, counts };
  }

  /** Record a hand-off in the outbound log (e.g. an opened mail draft). */
  function record(entry) { return log(entry); }

  function init(kit) { ui = kit; }

  const api = { CHANNELS, init, review, record, knownFor, sha256 };
  root.CVOutbound = api;
})(this);
