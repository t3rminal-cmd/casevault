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

  const TAB_LABEL = { timeline: 'Timeline', checks: 'Checks', reports: 'Reports', draft: 'Draft', arrest: 'Arrest' };
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
    const sec = h('section', { class: 'case-health cv-boxed', 'aria-labelledby': 'case-health-title' },
      h('h3', { id: 'case-health-title', icon: 'clipboard2-pulse', title: 'What is still open on this case, and the gaps a defense attorney would find: deadlines, check flags, unconfirmed facts, evidence and custody, and the arrest details.' }, 'Case Health ', count),
      body);
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
  function missionPanel(members, ui) {
    const { h } = ui;
    const body = h('div', { class: 'health-body' }, h('p', { class: 'muted small' }, 'Looking at the cases…'));
    const sec = h('section', { class: 'case-health mission-health' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title caps' }, 'Mission Health')), body);
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

  root.CVHealthUI = { gather, panel, missionPanel };
})(this);
