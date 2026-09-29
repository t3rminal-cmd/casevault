/* CaseVault — Vault panel sections for the v1.9 safeguards: online features, department mail,
 * the PII watch list, and the outbound log. All stored in vault.json on the SSD.
 */
'use strict';

(function (root) {
  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  let ui = null;

  const save = (patch, msg) => ui.Save.track('settings', () => V().updateSettings(patch)).then(() => { if (msg) ui.toast(msg, 'success'); }).catch(() => {});

  function onlineSection() {
    const { h } = ui;
    const cur = CVOutbound.onlineSettings();
    const allowed = h('input', { type: 'checkbox', checked: !!cur.allowed });
    const idle = h('select', { 'aria-label': 'Go offline after' }, [5, 10, 15, 30, 60].map((m) => h('option', { value: m, selected: Number(cur.idleMinutes) === m }, `${m} minutes`)));
    allowed.addEventListener('change', () => {
      if (!allowed.checked) CVOutbound.goOffline('turned off');
      save({ online: { ...CVOutbound.onlineSettings(), allowed: allowed.checked } }, allowed.checked ? 'Online features allowed. Use "Go online" when you need them.' : 'Online features turned off.');
    });
    idle.addEventListener('change', () => save({ online: { ...CVOutbound.onlineSettings(), idleMinutes: Number(idle.value) } }));
    return h('section', { 'data-section': 'online' },
      h('h3', { title: 'Research & drafting AI' }, 'Online features'),
      h('p', { class: 'muted small explain' }, 'Off by default. When allowed, the ', h('strong', {}, 'Online'), ' button in the header lets you go online for a while to ask Claude, Gemini or an OpenRouter model research and drafting questions. Personal details are replaced with placeholders and you see exactly what is sent. CaseVault only ever connects to ',
        h('code', {}, CVOutbound.ALLOWED_HOSTS.join(', ')), '.'),
      h('label', { class: 'check-row' }, allowed, h('span', {}, 'Allow going online')),
      h('div', { class: 'row' }, h('label', { class: 'inline' }, 'Go offline again after ', idle, ' without use')),
      h('h4', { title: 'Optional. Only needed to get answers inside CaseVault. With your Claude subscription (claude.ai, copy & paste) no key is needed. Gemini and OpenRouter have free tiers; read what they do with what you send.' }, 'API keys'),
      CVApiKey.card({ compact: false }),
      CVApiKeys.gemini.card({ compact: false }),
      CVApiKeys.openrouter.card({ compact: false }),
      h('p', { class: 'hint' }, 'Check your agency\'s policy on cloud AI before turning this on.'));
  }

  function watchSection() {
    const { h } = ui;
    const list = (V().data.settings.piiWatchlist || []).join('\n');
    const ta = h('textarea', { rows: 4, placeholder: 'One per line: names of subjects, informants, nicknames, street names…', spellcheck: 'false' });
    ta.value = list;
    ta.addEventListener('change', () => {
      const items = [...new Set(ta.value.split('\n').map((x) => x.trim()).filter((x) => x.length >= 2))];
      save({ piiWatchlist: items }, `${items.length} term${items.length === 1 ? '' : 's'} on the watch list.`);
    });
    return h('section', { 'data-section': 'pii' },
      h('h3', { title: 'PII watch list' }, 'Always hide'),
      h('p', { class: 'muted small explain' }, 'Besides the patterns CaseVault finds by itself (names after a title, SSNs, dates of birth, phones, addresses, plates, VINs, case numbers…), these words are always hidden from online AI and flagged in mail. Each case\'s client and case number, and your own details, are included automatically.'),
      ta);
  }

  function mailSection() {
    const { h } = ui;
    const cur = { ...CVMail.DEFAULTS, ...(V().data.settings.mail || {}) };
    const domains = h('input', { type: 'text', value: cur.domains.join(', '), placeholder: 'agency.gov, *.county.gov', autocomplete: 'off' });
    const book = h('textarea', { rows: 4, placeholder: 'Jane Doe <jane.doe@agency.gov>\nnarcotics-unit@agency.gov', spellcheck: 'false' });
    book.value = (cur.addressBook || []).map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join('\n');
    const marking = h('input', { type: 'text', value: cur.marking, placeholder: 'e.g. [LES]', class: 'narrow-wide', maxlength: 40 });
    const requireMarking = h('input', { type: 'checkbox', checked: !!cur.requireMarking });
    const maxMB = h('input', { type: 'number', min: 1, max: 150, value: cur.maxMB, class: 'narrow' });
    const footer = h('textarea', { rows: 3 });
    footer.value = cur.footer;
    const status = h('p', { class: 'small' });

    const commit = () => {
      const doms = CVMail.parseDomains(domains.value);
      const entries = CVMail.parseAddresses(book.value.replace(/\n/g, ';'));
      const bad = entries.filter((e) => !e.email || !CVMail.domainAllowed(e.email, doms));
      const next = {
        ...cur,
        domains: doms,
        addressBook: entries.filter((e) => e.email && CVMail.domainAllowed(e.email, doms)).map((e) => ({ name: e.name, email: e.email })),
        marking: marking.value.trim(),
        requireMarking: requireMarking.checked,
        maxMB: Math.max(1, Math.min(150, Number(maxMB.value) || 20)),
        footer: footer.value.trim(),
      };
      status.className = `small ${bad.length ? 'error-text' : 'muted'}`;
      status.textContent = bad.length ? `Left out of the address book (not an address, or outside the allowed domains): ${bad.map((b) => b.raw).join(', ')}` : `Allowed domains: ${doms.join(', ') || 'none yet'}`;
      Object.assign(cur, next);
      save({ mail: next });
    };
    for (const el of [domains, book, marking, requireMarking, maxMB, footer]) el.addEventListener('change', commit);
    status.textContent = `Allowed domains: ${cur.domains.join(', ') || 'none yet'}`;

    return h('section', { 'data-section': 'mail' },
      h('h3', {}, 'Department mail'),
      h('p', { class: 'muted small explain' }, 'Mail from a case\'s Mail tab can only go to these domains. ', h('code', {}, 'agency.gov'), ' allows exactly @agency.gov; ', h('code', {}, '*.agency.gov'), ' also allows its sub-domains.'),
      ui.field('Allowed mail domains', domains),
      status,
      ui.field('Address book', book, '', 'One address per line.'),
      h('div', { class: 'row' },
        h('label', { class: 'inline' }, 'Subject marking ', marking),
        h('label', { class: 'check-row' }, requireMarking, h('span', {}, 'Required on every email')),
        h('label', { class: 'inline' }, 'Attachment limit ', maxMB, ' MB')),
      ui.field('Footer added to new messages', footer));
  }

  function logSection() {
    const { h, fmtDateTime } = ui;
    const box = h('div', {}, h('p', { class: 'muted small' }, 'Loading…'));
    V().readLogs('outbound', 2).then((entries) => {
      const rows = entries.filter((e) => e.channel !== 'session').slice(0, 40);
      box.replaceChildren(rows.length
        ? h('div', { class: 'table-scroll' }, h('table', { class: 'files' },
          h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Where'), h('th', {}, 'Why'), h('th', {}, 'Details found'), h('th', {}, 'Hidden'))),
          h('tbody', {}, rows.map((e) => h('tr', {},
            h('td', { class: 'muted small' }, fmtDateTime(Date.parse(e.at))),
            h('td', { class: 'small' }, `${(CVOutbound.CHANNELS[e.channel] || { label: e.channel }).label}${e.destination ? ` → ${e.destination}` : ''}`),
            h('td', { class: 'small' }, e.purpose || ''),
            h('td', { class: 'small' }, Object.entries(e.found || {}).map(([t, n]) => `${n} ${(CVPii.TYPES[t] || { tag: t }).tag.toLowerCase()}`).join(', ') || 'none'),
            h('td', { class: 'small num' }, e.mode === 'redact' ? String(e.redacted || 0) : '—'))))))
        : h('p', { class: 'muted small' }, 'Nothing has left this computer through CaseVault in the last two months.'));
    }).catch(() => box.replaceChildren(h('p', { class: 'muted small' }, 'Could not read the log.')));
    return h('section', { 'data-section': 'log' },
      h('h3', {}, 'Outbound log'),
      h('p', { class: 'muted small explain' }, 'Every online AI request and mail hand-off, saved in CaseVault-Data\\logs on the SSD. It records where, when and what kind of details were found, never the text itself.'),
      box);
  }

  function init(kit) { ui = kit; }

  root.CVSecureSettings = { init, onlineSection, watchSection, mailSection, logSection };
})(this);
