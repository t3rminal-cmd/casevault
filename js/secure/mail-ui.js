/* CaseVault — the Mail tab of a case: send documents to department mail, with safeguards.
 *
 * Safeguards, in order:
 *   1. Recipients must be in the department's mail domains (Vault → Department mail). Anything
 *      else is blocked, not just warned about.
 *   2. Attachments come only from this case, stay under the size limit, and any file whose name
 *      carries another case's number is flagged.
 *   3. Subject, message and every readable attachment are scanned for personal details; the review
 *      screen lists what was found, and SSNs, dates of birth, ID, card or bank numbers need "SEND"
 *      typed to go ahead.
 *   4. The message is saved in the case's Email folder as an Outlook draft (.eml) and opened in
 *      Outlook, where it is sent by the department's own mail system. Or, for text only, handed to
 *      the mail app with a mailto: link.
 *   5. Every hand-off is logged: in the case (mail-log.json) and in CaseVault-Data/logs.
 */
'use strict';

(function (root) {
  const V = () => (typeof Vault !== 'undefined' ? Vault : null);
  let ui = null;
  const drafts = new Map(); // caseId -> unsent compose state (memory only), so switching tabs keeps it

  const mailSettings = () => ({ ...CVMail.DEFAULTS, ...((V().data.settings && V().data.settings.mail) || {}) });
  const MB = 1024 * 1024;

  async function render(panel, c, token) {
    const { h, toast, fmtSize, fmtDateTime, Save } = ui;
    const st = mailSettings();
    const [files, log] = await Promise.all([V().listFiles(c.id), V().readCaseJSON(c.id, 'mail-log.json').catch(() => null)]);
    if (token !== ui.state.renderToken) return;
    const history = (log && Array.isArray(log.sent)) ? log.sent : [];
    const prefix = CVCaseFiles.casePrefix(c);

    if (!st.domains.length) {
      panel.replaceChildren(h('div', { class: 'card' },
        h('h2', {}, 'Set up department mail first'),
        h('p', {}, 'For safety, CaseVault only prepares mail for your department\'s own addresses. Add your department\'s mail domain (for example ', h('code', {}, 'agency.gov'), ') and, if you like, an address book.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => ui.showVaultPanel('mail') }, 'Open mail settings…')),
      historyView(c, history, files));
      return;
    }

    const d = drafts.get(c.id) || {
      to: '', cc: '', subject: `${st.marking ? `${st.marking} ` : ''}${prefix || c.number || c.title || ''} – `, body: `\n\n\n${st.footer ? `--\n${st.footer}` : ''}`, attach: new Set(),
    };
    drafts.set(c.id, d);

    const book = h('datalist', { id: 'cv-address-book' }, (st.addressBook || []).map((a) => h('option', { value: a.name ? `${a.name} <${a.email}>` : a.email })));
    const to = h('input', { type: 'text', value: d.to, list: 'cv-address-book', placeholder: 'name@department.gov; …', autocomplete: 'off' });
    const cc = h('input', { type: 'text', value: d.cc, list: 'cv-address-book', autocomplete: 'off' });
    const subject = h('input', { type: 'text', value: d.subject, maxlength: 250 });
    const body = h('textarea', { rows: 12, class: 'mail-body' });
    body.value = d.body;
    const recipNote = h('div', { class: 'small' });
    const sizeNote = h('span', { class: 'small muted' });

    const checkRecipientsNow = () => {
      const all = [...CVMail.parseAddresses(to.value), ...CVMail.parseAddresses(cc.value)];
      if (!all.length) { recipNote.replaceChildren(); return; }
      const r = CVMail.checkRecipients(all, st.domains);
      recipNote.className = `small ${r.ok ? 'ok-text' : 'error-text'}`;
      recipNote.replaceChildren(r.ok ? `✓ All ${r.allowed.length} recipient${r.allowed.length === 1 ? ' is' : 's are'} in ${st.domains.join(', ')}`
        : `⛔ ${[...r.blocked.map((e) => `${e} is outside the department`), ...r.invalid.map((x) => `"${x}" is not an email address`)].join(' · ')}`);
    };
    for (const [el, key] of [[to, 'to'], [cc, 'cc'], [subject, 'subject'], [body, 'body']]) {
      el.addEventListener('input', () => { d[key] = el.value; if (key === 'to' || key === 'cc') checkRecipientsNow(); });
    }
    checkRecipientsNow();

    // Attachments: this case's files, grouped by folder.
    const updateSize = () => {
      const bytes = files.filter((f) => d.attach.has(f.name)).reduce((n, f) => n + (f.size || 0), 0);
      sizeNote.textContent = `${d.attach.size} attached · ${fmtSize(bytes)} of ${st.maxMB} MB`;
      sizeNote.className = `small ${bytes > st.maxMB * MB ? 'error-text' : 'muted'}`;
    };
    const groups = new Map();
    for (const f of files) {
      const k = f.folder || 'Unsorted';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
    const attachList = h('div', { class: 'attach-list' }, files.length ? [...groups.entries()].map(([folder, list]) => h('details', { open: list.some((f) => d.attach.has(f.name)) || groups.size <= 3 },
      h('summary', {}, folder, h('span', { class: 'count-pill' }, String(list.length))),
      list.map((f) => {
        const cb = h('input', { type: 'checkbox', checked: d.attach.has(f.name) });
        cb.addEventListener('change', () => { if (cb.checked) d.attach.add(f.name); else d.attach.delete(f.name); updateSize(); });
        return h('label', { class: 'check-row' }, cb, h('span', {}, f.base, ' ', h('span', { class: 'muted small' }, fmtSize(f.size))));
      }))) : h('p', { class: 'muted small' }, 'No files in this case yet.'));
    updateSize();

    const collect = () => ({
      to: CVMail.parseAddresses(to.value), cc: CVMail.parseAddresses(cc.value),
      subject: subject.value.trim(), body: body.value, attach: files.filter((f) => d.attach.has(f.name)),
    });

    // Throw away what's typed (it's only in this window until an Outlook draft is created).
    const discardBtn = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
      const typed = to.value.trim() || cc.value.trim() || body.value.replace(st.footer || '\u0000', '').trim() || d.attach.size;
      if (typed && !(await ui.confirmDialog({ title: 'Discard this draft?', message: 'The recipients, subject, message and ticked attachments are cleared. Nothing has been saved or sent yet.', confirmText: 'Discard' }))) return;
      drafts.delete(c.id);
      ui.refresh();
      toast('Draft discarded.');
    } }, 'Discard draft');
    const outlookBtn = h('button', { class: 'btn primary', type: 'button' }, 'Check & create Outlook draft');
    const mailtoBtn = h('button', { class: 'btn', type: 'button', title: 'Text only: the subject and message go to your mail app, without attachments.' }, 'Check & open in mail app');
    outlookBtn.addEventListener('click', () => go('eml'));
    mailtoBtn.addEventListener('click', () => go('mailto'));

    async function go(method) {
      const m = collect();
      if (!m.to.length) return toast('Add at least one recipient.', 'error');
      if (!m.subject) return toast('Add a subject.', 'error');
      if (method === 'mailto' && m.attach.length) return toast('A mail-app link can\'t carry attachments. Untick them, or create an Outlook draft instead.', 'error', 8000);
      outlookBtn.disabled = mailtoBtn.disabled = true;
      const busy = toast(m.attach.length ? `Reading ${m.attach.length} attachment${m.attach.length === 1 ? '' : 's'} to check them…` : 'Checking…', 'info', 600000);
      try {
        await send(c, m, method, st, prefix);
      } catch (err) {
        if (FS.isDisconnectError(err)) ui.onDriveLost();
        else toast(err.message, 'error', 10000);
      } finally {
        busy.remove();
        outlookBtn.disabled = mailtoBtn.disabled = false;
      }
    }

    panel.replaceChildren(
      h('div', { class: 'mail-layout' },
        h('form', { class: 'mail-form', onsubmit: (e) => e.preventDefault() },
          book,
          ui.field('To', to), ui.field('Cc', cc), recipNote,
          ui.field('Subject', subject),
          ui.field('Message', body),
          h('div', { class: 'row' }, outlookBtn, mailtoBtn, h('div', { class: 'spacer' }), discardBtn),
          h('p', { class: 'muted small explain' }, 'CaseVault never sends mail itself. It checks the message, saves it in this case\'s Email folder and opens it in Outlook, where you press Send. Only addresses in ',
            h('strong', {}, st.domains.join(', ')), ' are allowed.')),
        h('aside', { class: 'mail-attach' }, h('h3', {}, 'Attach from this case'), sizeNote, attachList)),
      historyView(c, history, files));
  }

  // The list of mail prepared from this case. An Outlook draft (.eml in the Email folder) can be
  // deleted here; its line stays, marked deleted, so the record of what was prepared remains.
  function historyView(c, history, files) {
    const { h, fmtDateTime, toast } = ui;
    const exists = new Set((files || []).map((f) => f.name));
    const readOnly = V().isArchived(c.id);
    const action = (e, i) => {
      if (e.method !== 'eml' || !e.file) return h('span', { class: 'muted small' }, '—');
      if (e.deleted || !exists.has(e.file)) return h('span', { class: 'muted small' }, e.deleted ? `Draft deleted ${fmtDateTime(Date.parse(e.deleted))}` : 'Draft file no longer in the case');
      if (readOnly) return h('span', { class: 'muted small' }, CVCaseFiles.splitPath(e.file).base);
      return h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: async () => {
        const ok = await ui.confirmDialog({
          title: 'Delete this Outlook draft?',
          message: `"${CVCaseFiles.splitPath(e.file).base}" is deleted from the case's Email folder. If you already sent it from Outlook, the sent email is not affected. This list keeps a line saying it was deleted.`,
          confirmText: 'Delete draft', danger: true,
        });
        if (!ok) return;
        try {
          await ui.Save.track(`mail-del:${c.id}`, async () => {
            await V().deleteFile(c.id, e.file);
            const cur = (await V().readCaseJSON(c.id, 'mail-log.json').catch(() => null)) || { sent: [] };
            if (Array.isArray(cur.sent) && cur.sent[i] && cur.sent[i].at === e.at) cur.sent[i].deleted = new Date().toISOString();
            await V().writeCaseJSON(c.id, 'mail-log.json', cur);
          });
          toast('Outlook draft deleted.');
          ui.refresh();
        } catch { /* reported by Save */ }
      } }, 'Delete draft');
    };
    const rows = history.map((e, i) => ({ e, i })).reverse();
    return h('section', { class: 'mail-history' },
      h('h3', {}, 'Mail prepared from this case'),
      history.length
        ? h('table', { class: 'files' },
          h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'To'), h('th', {}, 'Subject'), h('th', {}, 'Attachments'), h('th', {}, 'How'), h('th', {}, ''))),
          h('tbody', {}, rows.map(({ e, i }) => h('tr', { class: e.deleted ? 'muted' : null },
            h('td', { class: 'muted' }, fmtDateTime(Date.parse(e.at))),
            h('td', { class: 'small' }, [...(e.to || []), ...(e.cc || []).map((x) => `cc ${x}`)].join(', ')),
            h('td', {}, e.subject),
            h('td', { class: 'small' }, (e.attachments || []).map((a) => a.split('/').pop()).join(', ') || '—'),
            h('td', { class: 'small muted' }, e.method === 'eml' ? 'Outlook draft' : 'Mail app'),
            h('td', { class: 'actions' }, action(e, i))))))
        : h('p', { class: 'muted small' }, 'Nothing yet.'));
  }

  async function send(c, m, method, st, prefix) {
    const { toast } = ui;
    const all = [...m.to, ...m.cc];
    const r = CVMail.checkRecipients(all, st.domains);
    const bytes = m.attach.reduce((n, f) => n + (f.size || 0), 0);
    const foreign = CVMail.otherCaseFiles(m.attach.map((f) => f.name), prefix, CVCaseFiles.prefixInName);
    const markingOk = !st.requireMarking || !st.marking || m.subject.startsWith(st.marking);

    // Text of each readable attachment, for the PII scan (from the checker's cache when possible).
    const attachments = [];
    for (const f of m.attach) {
      let text = null;
      if (CVExtract.kindOf(f.name)) {
        try {
          const doc = await CVChecks.documentText(c, f.name);
          text = (doc.paragraphs || []).map((p) => p.text).join('\n');
        } catch (err) { if (FS.isDisconnectError(err)) throw err; text = null; }
      }
      attachments.push({ name: f.base, size: f.size, text });
    }

    const checks = [
      { ok: r.ok, text: r.ok ? `Recipients are all in ${st.domains.join(', ')}` : `Recipients outside the department: ${[...r.blocked, ...r.invalid].join(', ')}. Remove them (or add the domain in Vault → Department mail if it really is yours).` },
      { ok: bytes <= st.maxMB * MB, text: bytes <= st.maxMB * MB ? `Attachments total ${ui.fmtSize(bytes)} (limit ${st.maxMB} MB)` : `Attachments total ${ui.fmtSize(bytes)}, over the ${st.maxMB} MB limit` },
      { ok: !foreign.length, warn: true, text: foreign.length ? `These look like another case's files: ${foreign.map((n) => n.split('/').pop()).join(', ')}. Untick them if they don't belong.` : 'Every attachment belongs to this case' },
      { ok: markingOk, text: markingOk ? (st.marking ? `Subject starts with ${st.marking}` : 'No subject marking required') : `The subject must start with ${st.marking}` },
    ];

    const review = await CVOutbound.review({
      channel: 'mail', destination: all.map((x) => x.email).filter(Boolean).join(', '), purpose: 'Department mail', caseObj: c,
      parts: [{ label: 'Subject', text: m.subject }, { label: 'Message', text: m.body }], attachments, mode: 'warn',
      confirmText: method === 'eml' ? 'Create Outlook draft' : 'Open in mail app', checks,
    });
    if (!review) return;

    const logEntry = { at: new Date().toISOString(), to: m.to.map((x) => x.email), cc: m.cc.map((x) => x.email), subject: m.subject, attachments: m.attach.map((f) => f.name), method, found: review.counts };

    if (method === 'mailto') {
      const url = CVMail.mailtoUrl(m);
      if (!url) throw new Error('The message is too long for a mail-app link. Create an Outlook draft instead.');
      await appendCaseLog(c, logEntry);
      location.href = url;
      toast('Handed to your mail app. Check it there and press Send.', 'success', 8000);
      return;
    }

    // Build the Outlook draft from the files on the SSD.
    const parts = [];
    for (const f of m.attach) {
      const file = await V().readFile(c.id, f.name);
      if (!file) throw new Error(`${f.base} is no longer in this case.`);
      parts.push({ name: f.base, type: file.type || 'application/octet-stream', bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    const eml = CVMail.buildEml({ to: m.to, cc: m.cc, subject: m.subject, body: m.body, attachments: parts });
    const desc = CVCaseFiles.clean(m.subject.replace(st.marking || '\u0000', '').replace(prefix || '\u0000', '').replace(/^[\s–-]+/, '')).slice(0, 60) || 'draft';
    const saved = await ui.Save.track(`mail:${c.id}`, () => V().addFile(c.id, new File([eml], 'mail.eml', { type: 'message/rfc822' }), { folder: 'Email', description: desc }));
    logEntry.file = saved;
    await appendCaseLog(c, logEntry);
    drafts.delete(c.id);

    const rel = `${V().isArchived(c.id) ? 'archive' : 'cases'}/${c.id}/files/${saved}`;
    if (document.body.dataset.mode === 'helper') {
      try {
        await HelperFS.openFile(rel);
        toast('The draft is open in Outlook with its attachments. Check it there and press Send.', 'success', 10000);
        ui.refresh();
        return;
      } catch (err) { console.warn('Could not open the draft', err); }
    }
    ui.refresh();
    const winPath = `${V().root.name}\\${rel.replace(/\//g, '\\')}`;
    await ui.openDialog((close) => ui.h('div', {},
      ui.h('h2', {}, 'Outlook draft ready'),
      ui.h('p', {}, 'Saved in this case\'s Email folder. Open it from File Explorer (double-click): Outlook shows it as a new email with the attachments. Check it and press Send.'),
      ui.h('code', { class: 'path' }, winPath),
      ui.h('p', { class: 'muted small explain' }, 'Tip: in File Explorer, go to your CASEVAULT drive and then this folder. With Start-CaseVault.bat running (helper mode), CaseVault opens it in Outlook for you.'),
      ui.h('div', { class: 'dialog-actions' },
        ui.h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(winPath); ui.toast('Path copied.', 'success'); } catch { /* select it by hand */ } } }, 'Copy path'),
        ui.h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }

  async function appendCaseLog(c, entry) {
    const cur = (await V().readCaseJSON(c.id, 'mail-log.json').catch(() => null)) || { sent: [] };
    if (!Array.isArray(cur.sent)) cur.sent = [];
    cur.sent.push(entry);
    await ui.Save.track(`mail-log:${c.id}`, () => V().writeCaseJSON(c.id, 'mail-log.json', cur));
  }

  function init(kit) { ui = kit; }

  root.CVMailUI = { init, render };
})(this);
