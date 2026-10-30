/* CaseVault — Case Health on screen (v1.172): a box on a case's Details tab and on a Mission's
 * page listing what is still open (js/case-health.js), each with a link to where it is fixed, and
 * the same list for the Close dialog.
 */
'use strict';

(function (root) {
  const H = () => root.CVHealth;

  /** Everything Case Health needs about one case, read from the SSD (the latest check only). */
  async function gather(c) {
    const [timeline, checks, list, rf, arrest, files] = await Promise.all([
      Vault.getTimeline(c.id).catch(() => ({ events: [] })),
      Vault.listChecks(c.id).catch(() => []),
      Vault.listDrafts(c.id).catch(() => []),
      Vault.readCaseJSON(c.id, 'report-fields.json').catch(() => null),
      Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null),
      Vault.listFiles(c.id).catch(() => []),
    ]);
    const drafts = await Promise.all(list.map(async (d) => {
      const full = await Vault.readDraft(c.id, d.slug).catch(() => null);
      return { title: d.title, confirm: full ? CVDraft.extractPlaceholders(full.body).length : 0 };
    }));
    const latest = checks.find((k) => !k.damaged) || null;
    const stale = latest && root.CVChecks && CVChecks.changedSince ? CVChecks.changedSince(latest.documents, files).length > 0 : false;
    // The arrest details count only while the case has its Arrest tab (an arrest removed leaves its file behind).
    const hasArrest = root.CVClosingUI && CVClosingUI.hasArrestTab ? CVClosingUI.hasArrestTab(c) : true;
    return { caseObj: c, timeline: timeline || { events: [] }, checks: latest ? [{ ...latest, stale }] : [], drafts, evidence: (rf && rf.evidence) || [], arrest: hasArrest ? arrest : null, today: Vault.localDay() };
  }

  const TAB_LABEL = { timeline: 'Timeline', checks: 'Checks', reports: 'Saved Reports', draft: 'Write Report', arrest: 'Arrest' };
  function itemRow(ui, c, it) {
    const { h } = ui;
    return h('li', { class: `health-item sev-${it.severity.toLowerCase()}` },
      h('span', { class: `pill sev sev-${it.severity.toLowerCase()}` }, it.severity),
      h('span', { class: 'health-area muted small' }, it.area),
      h('span', { class: 'health-text' }, it.text),
      it.tab ? h('a', { class: 'btn small health-go', href: `#/case/${CVRoute.enc(c.id)}/${it.tab}` }, `Open ${TAB_LABEL[it.tab] || it.tab}`) : null);
  }

  /** The Case Health box of a case's Details tab (filled in once read). */
  function panel(c, ui) {
    const { h } = ui;
    const count = h('span', { class: 'count-pill health-count' }, '…');
    const body = h('div', { class: 'health-body' }, h('p', { class: 'muted small' }, 'Looking at the case…'));
    // v1.173: the prosecutor packet of this case.
    const tools = h('div', { class: 'health-tools' },
      h('button', { class: 'btn small', type: 'button', icon: 'file-earmark-pdf', 'data-ro-ok': 'true', title: 'One PDF: buys, evidence, lab status and chain of custody', onclick: () => packet(ui, [c]) }, 'Prosecutor Packet'));
    const sec = h('section', { class: 'case-health cv-boxed', 'aria-labelledby': 'case-health-title' },
      h('h3', { id: 'case-health-title', icon: 'clipboard2-pulse', title: 'What is still open, and the gaps a defense attorney would find.' }, 'Case Health ', count),
      tools, body);
    (async () => {
      let items = [];
      try { items = H().caseHealth(await gather(c)); } catch (err) { if (FS.isDisconnectError(err)) return; body.replaceChildren(h('p', { class: 'error-text small' }, `Could not look at the case: ${err.message}`)); return; }
      const high = items.filter((x) => x.severity === 'High').length;
      count.textContent = String(items.length);
      count.classList.toggle('zero', !items.length);
      count.classList.toggle('bad', high > 0);
      sec.classList.toggle('health-bad', high > 0);
      body.replaceChildren(items.length
        ? h('ul', { class: 'health-list' }, ...items.map((it) => itemRow(ui, c, it)))
        : h('p', { class: 'health-ok' }, ui.icon('check-circle-fill'), ' Nothing open: no overdue deadlines, open flags, unconfirmed facts, custody gaps or arrest mismatches.'));
    })();
    return sec;
  }

  /** The Mission page's box: each case's open items, together. members: index entries. */
  function missionPanel(members, ui, op = null) {
    const { h } = ui;
    const body = h('div', { class: 'health-body' }, h('p', { class: 'muted small' }, 'Looking at the cases…'));
    const live = () => members.filter((x) => !Vault.isArchived(x.id));
    const full = async () => { const out = []; for (const e of live()) out.push(await Vault.getCase(e.id)); return out; };
    // v1.173: the whole Mission at once: its check, its prosecutor packet, its calendar file.
    const sec = h('section', { class: 'case-health mission-health' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title caps' }, 'Mission Health'), h('div', { class: 'spacer' }),
        h('button', { class: 'btn small', type: 'button', icon: 'clipboard2-check', title: 'The rules check of every case number of this Mission, saved on each case\'s Checks tab', onclick: () => root.CVChecks.checkMission(live()) }, 'Check the Mission'),
        h('button', { class: 'btn small', type: 'button', icon: 'file-earmark-pdf', title: 'One PDF for the Mission: every buy, the totals per suspect, the evidence and the chains of custody', onclick: async () => packet(ui, await full(), op) }, 'Prosecutor Packet'),
        op ? h('button', { class: 'btn small', type: 'button', icon: 'calendar-event', title: 'The Mission\'s open deadlines and court dates as a calendar file (.ics), saved in the Mission Folder to open in Outlook', onclick: async () => calendarFile(ui, await full(), op) }, 'Calendar File') : null), body);
    (async () => {
      const rows = [];
      for (const e of members.filter((x) => !Vault.isArchived(x.id))) {
        try { const c = await Vault.getCase(e.id); rows.push({ c, items: H().caseHealth(await gather(c)) }); } catch (err) { if (FS.isDisconnectError(err)) return; }
      }
      const total = rows.reduce((t, r) => t + r.items.length, 0);
      body.replaceChildren(!total ? h('p', { class: 'health-ok' }, ui.icon('check-circle-fill'), ' Nothing open on the Mission\'s cases.')
        : h('div', { class: 'mission-health-list' }, ...rows.filter((r) => r.items.length).map((r) => h('details', { class: 'mission-health-case', open: r.items.some((x) => x.severity === 'High') },
          h('summary', {}, h('strong', {}, r.c.number || 'No case number'), h('span', { class: 'muted small' }, ` ${r.items.length} open`),
            r.items.some((x) => x.severity === 'High') ? h('span', { class: 'pill sev sev-high' }, `${r.items.filter((x) => x.severity === 'High').length} High`) : null),
          h('ul', { class: 'health-list' }, ...r.items.map((it) => itemRow(ui, r.c, it)))))));
    })();
    return sec;
  }

  /* ---------------- v1.173: the prosecutor packet and the calendar file ---------------- */

  /** What the packet needs of each case: its buys, evidence and Lab reports. */
  async function packetCase(c) {
    const [tl, rf, files] = await Promise.all([Vault.getTimeline(c.id).catch(() => ({ events: [] })), Vault.readCaseJSON(c.id, 'report-fields.json').catch(() => null), Vault.listFiles(c.id).catch(() => [])]);
    const kinds = (c.checkPairs && c.checkPairs.kinds) || {};
    const labReports = files.filter((f) => (kinds[f.name] || CVRules.kindFromName(f.name)) === 'lab').map((f) => f.name.split('/').pop());
    return { number: c.number || 'No case number', subject: c.subject || '', events: (tl && tl.events) || [], evidence: (rf && rf.evidence) || [], labReports };
  }
  /**
   * The prosecutor packet of a case (op: null) or a Mission: a PDF with the buys and totals per
   * suspect, the evidence with inventory numbers and lab status, and each exhibit's chain of
   * custody. Shown, and saved in the case's Case Closing folder (or the Mission Folder's Other).
   */
  async function packet(ui, cases, op = null) {
    const { h, toast } = ui;
    try {
      const data = [];
      for (const c of cases) data.push(await packetCase(c));
      const label = op ? `Mission ${[op.number, op.name].filter(Boolean).join(' - ')}` : `Case ${data[0].number}${data[0].subject ? ` · ${data[0].subject}` : ''}`;
      const md = CVMissionTools.packetMarkdown(data, { label, made: Vault.localDay() });
      const p = (Vault.data.settings && Vault.data.settings.affiant) || {};
      const bytes = CVDraftPdf.build(md, { title: 'Prosecutor Packet', caseLabel: label, agency: p.agency || '', printed: '' });
      const name = `${FS.safeName(op ? (op.number || op.name || 'Mission') : data[0].number)} Prosecutor Packet.pdf`;
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: 'Prosecutor Packet', fileName: name });
      const saveBtn = h('button', { class: 'btn', type: 'button', icon: 'folder-plus', onclick: async () => {
        try {
          const file = new File([bytes], name, { type: 'application/pdf' });
          const where = op ? `Mission Folder › Other › ${await Vault.addShared(`op-${op.id}`, 'Other', file)}`
            : await ui.Save.track(`packet:${cases[0].id}`, () => Vault.addFile(cases[0].id, file, { folder: 'Case Closing', keepName: true, replace: true }));
          toast(`Saved: ${where}`, 'success', 6000);
          saveBtn.disabled = true;
        } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); else toast(err.message, 'error'); }
      } }, op ? 'Save to the Mission Folder' : 'Save to the Case Files');
      await ui.openDialog((close) => h('div', { class: 'pdf-view' }, h('h2', {}, 'Prosecutor Packet'), viewer,
        h('div', { class: 'dialog-actions' }, Vault.isArchived(cases[0].id) && !op ? null : saveBtn, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); else toast(`Could not make the packet: ${err.message}`, 'error'); }
  }
  /**
   * The deadlines and court dates of a case (or a Mission) as a calendar file (.ics), saved on the
   * SSD (the case's Other folder, or the Mission Folder's Other), never on this PC. Open it from
   * there to add the dates to Outlook. -> the saved path, or null
   */
  async function calendarFile(ui, cases, op = null) {
    const { toast } = ui;
    try {
      const events = [];
      for (const c of cases) for (const e of ((await Vault.getTimeline(c.id).catch(() => null)) || {}).events || []) events.push({ ...e, caseNumber: cases.length > 1 ? c.number : '' });
      const n = events.filter((e) => ['deadline', 'court'].includes(e.kind) && !e.done).length;
      if (!n) { toast('No open deadlines or court dates on the Timeline.', 'info'); return null; }
      const label = op ? `Mission ${op.number || op.name || ''}`.trim() : `Case ${cases[0].number || ''}`.trim();
      const ics = CVMissionTools.icsCalendar(events, { name: `CaseVault ${label}` });
      const file = new File([ics], `${FS.safeName(op ? (op.number || op.name || 'Mission') : (cases[0].number || 'Case'))} Deadlines and Court Dates.ics`, { type: 'text/calendar' });
      const where = op ? `Mission Folder › Other › ${await Vault.addShared(`op-${op.id}`, 'Other', file)}`
        : await ui.Save.track(`ics:${cases[0].id}`, () => Vault.addFile(cases[0].id, file, { folder: 'Other', keepName: true, replace: true }));
      toast(`${n} date${n === 1 ? '' : 's'} saved as a calendar file on the SSD: ${where}. Open it to add them to Outlook.`, 'success', 9000);
      return where;
    } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); else toast(`Could not make the calendar file: ${err.message}`, 'error'); return null; }
  }

  root.CVHealthUI = { gather, panel, missionPanel, packet, calendarFile };
})(this);
