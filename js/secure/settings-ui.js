/* CaseVault — Vault panel sections for the safeguards: department mail, the PII watch list, and
 * the outbound log. All stored in vault.json on the SSD. (v1.91: the online features are gone.)
 */
'use strict';

(function (root) {
  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  let ui = null;

  const save = (patch, msg) => ui.Save.track('settings', () => V().updateSettings(patch)).then(() => { if (msg) ui.toast(msg, 'success'); }).catch(() => {});

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
      h('p', { class: 'muted small explain' }, 'Besides the patterns CaseVault finds by itself (names after a title, SSNs, dates of birth, phones, addresses, plates, VINs, case numbers…), these words are always flagged when department mail is checked. Each case\'s client and case number, and your own details, are included automatically.'),
      ta);
  }

  function mailSection() {
    const { h } = ui;
    const cur = CVMail.settingsOf(V().data.settings.mail);
    const domains = h('input', { type: 'text', value: cur.domains.join(', '), placeholder: 'agency.gov, *.county.gov', autocomplete: 'off' });
    const book = h('textarea', { rows: 4, placeholder: 'Jane Doe <jane.doe@agency.gov>\nnarcotics-unit@agency.gov', spellcheck: 'false' });
    book.value = (cur.addressBook || []).map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join('\n');
    const marking = h('input', { type: 'text', value: cur.marking, placeholder: '[LES]', class: 'narrow-wide', maxlength: 40 });
    const requireMarking = h('input', { type: 'checkbox', checked: !!cur.requireMarking });
    const maxMB = h('input', { type: 'number', min: 1, max: 150, value: cur.maxMB, class: 'narrow' });
    const footer = h('textarea', { rows: 3 });
    footer.value = cur.footer;
    // Signature (v1.26): goes at the end of every new message, above the footer.
    const signature = h('textarea', { rows: 4, placeholder: 'Det. Jane Doe #12345\nNarcotics Division\nPhone: 555-010-0100', spellcheck: 'true', 'aria-label': 'Signature' });
    signature.value = cur.signature || '';
    const sigFromProfile = h('button', { class: 'btn small', type: 'button', icon: 'person-badge', title: 'Fill the signature from Vault → My Profile (name, title, agency, phone, email)', onclick: () => {
      const s = CVMail.signatureFrom(V().data.settings.affiant);
      if (!s) { ui.toast('Fill in My Profile first (Vault → My Profile).'); return; }
      signature.value = s; commit(); ui.toast('Signature filled from My Profile.', 'success', 2500);
    } }, 'Fill From My Profile');
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
        signature: signature.value.replace(/\s+$/, ''),
        preloaded: CVMail.PRELOAD_ROUND,
      };
      status.className = `small ${bad.length ? 'error-text' : 'muted'}`;
      status.textContent = bad.length ? `Left out of the address book (not an address, or outside the allowed domains): ${bad.map((b) => b.raw).join(', ')}` : `Allowed domains: ${doms.join(', ') || 'none yet'}`;
      Object.assign(cur, next);
      save({ mail: next });
    };
    for (const el of [domains, book, marking, requireMarking, maxMB, footer, signature]) el.addEventListener('change', commit);
    status.textContent = `Allowed domains: ${cur.domains.join(', ') || 'none yet'}`;

    return h('section', { 'data-section': 'mail' },
      h('h3', {}, 'Department mail'),
      h('p', { class: 'muted small explain' }, 'Mail from a case\'s Mail tab can only go to these domains. chicagopolice.org, dea.gov and uspis.gov are filled in to start with. ', h('code', {}, 'agency.gov'), ' allows exactly @agency.gov; ', h('code', {}, '*.agency.gov'), ' also allows its sub-domains.'),
      ui.field('Allowed mail domains', domains),
      status,
      ui.field('Address book', book, '', 'One address per line.'),
      h('div', { class: 'row' },
        h('label', { class: 'inline' }, 'Subject marking ', marking),
        h('label', { class: 'check-row' }, requireMarking, h('span', {}, 'Required on every email')),
        h('label', { class: 'inline' }, 'Attachment limit ', maxMB, ' MB')),
      ui.field('Signature', signature, 'mail-signature', 'Added to the end of every new message, above the footer.'),
      h('div', { class: 'row' }, sigFromProfile),
      ui.field('Footer added to new messages', footer),
      h('div', { class: 'row vault-save-row' }, h('div', { class: 'spacer' }),
        h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', title: 'Save the department mail settings to vault.json on the SSD. Each box also saves when you leave it.', onclick: () => { commit(); ui.toast('Department mail settings saved to the SSD.', 'success', 2500); } }, 'Save changes')));
  }

  function logSection() {
    const { h, fmtDateTime } = ui;
    const box = h('div', {}, h('p', { class: 'muted small' }, 'Loading…'));
    // v1.59: how much the log takes on the SSD, and deleting it.
    const sizeLine = h('p', { class: 'small log-size' });
    const del = async (keepFrom) => {
      const files = await V().logFiles('outbound');
      const doomed = files.filter((f) => !keepFrom || f.month < keepFrom);
      if (!doomed.length) { ui.toast('Nothing to delete.', 'info'); return; }
      const ok = await ui.confirmDialog({ title: keepFrom ? 'Delete Older Outbound Logs?' : 'Delete the Whole Outbound Log?', danger: true, confirmText: 'Delete',
        message: `${doomed.length} month${doomed.length === 1 ? '' : 's'} of the log (${ui.fmtSize(doomed.reduce((n, f) => n + f.size, 0))}) will be deleted from the SSD. The log is your record of what left this computer; check your agency's rules before deleting it. There is no undo.` });
      if (!ok) { ui.showVaultPanel('log'); return; }
      try { const n = await V().deleteLogs('outbound', keepFrom); ui.toast(`${n} month${n === 1 ? '' : 's'} of the outbound log deleted.`, 'success'); } catch (err) { ui.toast(`Could not delete: ${err.message}`, 'error'); }
      ui.showVaultPanel('log');
    };
    V().logFiles('outbound').then((files) => {
      const bytes = files.reduce((n, f) => n + f.size, 0);
      sizeLine.replaceChildren(files.length
        ? `${files.length} month${files.length === 1 ? '' : 's'} on the SSD, ${ui.fmtSize(bytes)} in all (oldest ${files[files.length - 1].month}). Each month is usually only a few KB, so deleting frees very little space.`
        : 'The log is empty.');
    }).catch(() => sizeLine.replaceChildren(''));
    const thisMonth = new Date().toISOString().slice(0, 7);
    const actions = h('div', { class: 'row log-actions' }, h('div', { class: 'spacer' }),
      h('button', { class: 'btn small', type: 'button', icon: 'trash3', title: 'Delete every month before this one; keep this month.', onclick: () => del(thisMonth) }, 'Delete Older Months'),
      h('button', { class: 'btn small danger', type: 'button', icon: 'trash3', title: 'Delete the whole outbound log from the SSD.', onclick: () => del('') }, 'Delete All'));
    V().readLogs('outbound', 2).then((entries) => {
      const rows = entries.filter((e) => e.channel !== 'session').slice(0, 40);
      box.replaceChildren(rows.length
        ? h('div', { class: 'table-scroll' }, h('table', { class: 'files' },
          h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Where'), h('th', {}, 'Why'), h('th', {}, 'Details found'))),
          h('tbody', {}, rows.map((e) => h('tr', {},
            h('td', { class: 'muted small' }, fmtDateTime(Date.parse(e.at))),
            h('td', { class: 'small' }, `${(CVOutbound.CHANNELS[e.channel] || { label: e.channel }).label}${e.destination ? ` → ${e.destination}` : ''}`),
            h('td', { class: 'small' }, e.purpose || ''),
            h('td', { class: 'small' }, Object.entries(e.found || {}).map(([t, n]) => `${n} ${(CVPii.TYPES[t] || { tag: t }).tag.toLowerCase()}`).join(', ') || 'none'))))))
        : h('p', { class: 'muted small' }, 'Nothing has left this computer through CaseVault in the last two months.'));
    }).catch(() => box.replaceChildren(h('p', { class: 'muted small' }, 'Could not read the log.')));
    return h('section', { 'data-section': 'log' },
      h('h3', {}, 'Outbound log'),
      h('p', { class: 'muted small explain' }, 'Every department mail hand-off, saved in CaseVault-Data\\logs on the SSD. It records where, when and what kind of details were found, never the text itself.'),
      box, sizeLine, actions);
  }

  function init(kit) { ui = kit; }

  root.CVSecureSettings = { init, watchSection, mailSection, logSection };
})(this);
