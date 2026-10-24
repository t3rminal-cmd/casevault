/* CaseVault — the person view (v1.119): every case and Mission a person appears in, as the subject,
 * a suspect (with their role) or an arrestee, and their timeline events. Names written another way
 * ("DOE, John", "Jon Doe") are matched too and shown as possibly the same person.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const O = () => (isNode ? require('./operation.js') : root.CVOperation);
  const clean = (v) => String(v == null ? '' : v).trim();

  /** name; cases: full case objects (subject, suspects, people); timelines: { caseId: { events } }.
   * -> { rows: [{ c, roles, match: 'same'|'similar', names, events }], variants: [names written
   * another way] }, exact matches first, then by case number. */
  function appearances(name, cases, timelines = {}) {
    const Op = O();
    const want = Op.normName(name);
    const rows = [];
    const variants = new Map();
    for (const c of cases || []) {
      if (!c) continue;
      const roles = []; const names = []; let match = '';
      const see = (who, role) => {
        const m = Op.nameMatch(name, who);
        if (!m) return;
        if (!roles.includes(role)) roles.push(role);
        names.push(clean(who));
        match = match === 'same' || m === 'same' ? 'same' : 'similar';
        if (Op.normName(who) !== want) variants.set(Op.normName(who), clean(who));
      };
      see(c.subject, 'Subject');
      for (const sx of c.suspects || []) if (sx && !sx.notIdentified && clean(sx.name)) see(sx.name, sx.role || 'Suspect');
      for (const p of c.people || []) see(p, 'Arrestee');
      const events = (((timelines[c.id] || {}).events) || []).filter((ev) => ev && Op.nameMatch(name, ev.suspect));
      if (!match && events.length) { match = events.some((ev) => Op.nameMatch(name, ev.suspect) === 'same') ? 'same' : 'similar'; roles.push('On the timeline'); }
      if (match) rows.push({ c, roles, match, names: [...new Set(names)], events });
    }
    rows.sort((a, b) => (a.match === b.match ? 0 : a.match === 'same' ? -1 : 1) || String(a.c.number || '').localeCompare(String(b.c.number || '')));
    return { rows, variants: [...variants.values()] };
  }

  /** Opens the person view (browser only). */
  async function open(name, ui) {
    const { h, openDialog, fmtDate, toast } = ui;
    const who = clean(name);
    if (!who) return;
    const entries = (Vault.data.cases || []).slice();
    const cases = [];
    for (const e of entries) { try { cases.push({ ...(await Vault.getCase(e.id)), archivedEntry: Vault.isArchived(e.id) }); } catch { /* moved or unreadable: skipped */ } }
    // Timelines only where the name could be: every case (events can name a suspect who isn't listed).
    const timelines = {};
    for (const c of cases) { try { timelines[c.id] = await Vault.getTimeline(c.id); } catch { /* none */ } }
    const { rows, variants } = appearances(who, cases, timelines);
    const ops = new Map((Vault.data.operations || []).map((o) => [o.id, o]));
    const missions = [...new Set(rows.map((r) => r.c.operationId).filter(Boolean))].map((id) => ops.get(id)).filter(Boolean);
    const events = rows.flatMap((r) => r.events.map((ev) => ({ ev, c: r.c }))).sort((a, b) => `${a.ev.date}${a.ev.time || ''}`.localeCompare(`${b.ev.date}${b.ev.time || ''}`));
    if (!rows.length) { toast(`${who} isn't on any other case.`, 'info'); return; }
    await openDialog((done) => h('div', { class: 'person-view' },
      h('h2', { icon: 'person-lines-fill' }, who),
      h('p', { class: 'muted small' }, `${rows.length} case${rows.length === 1 ? '' : 's'}${missions.length ? ` in ${missions.length} Mission${missions.length === 1 ? '' : 's'}` : ''} · ${events.length} timeline event${events.length === 1 ? '' : 's'}`),
      variants.length ? h('p', { class: 'person-variants' }, h('strong', {}, 'Possibly the same person: '), variants.join(', '), h('span', { class: 'muted small' }, '. Written another way on some cases; check before you treat them as one.')) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table person-table' },
        h('thead', {}, h('tr', {}, ...['Case Number', 'Mission', 'Status', 'Role', 'Written As'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...rows.map((r) => {
          const op = ops.get(r.c.operationId);
          return h('tr', { class: r.match === 'similar' ? 'similar-row' : '' },
            h('td', {}, h('a', { href: `#/case/${CVRoute.enc(r.c.id)}`, onclick: () => done() }, r.c.number || 'No case number')),
            h('td', {}, op ? h('a', { href: `#/operation/${encodeURIComponent(op.id)}`, onclick: () => done() }, op.number || op.name) : h('span', { class: 'muted' }, 'General Files')),
            h('td', { class: 'nowrap' }, r.c.archivedEntry ? 'Archived' : r.c.status || 'Open'),
            h('td', {}, r.roles.join(', ')),
            h('td', {}, r.names.join(', ') || '—'));
        })))),
      events.length ? h('section', { class: 'person-events' }, h('h3', {}, 'Timeline'),
        h('ol', { class: 'person-event-list' }, ...events.map(({ ev, c }) => h('li', {},
          h('span', { class: 'nowrap' }, `${fmtDate(ev.date)}${ev.time ? ` ${ev.time}` : ''}`),
          h('strong', {}, ev.title || 'Event'),
          ev.kind === 'buy' && O().buyLine(ev) ? h('span', { class: 'muted small' }, O().buyLine(ev)) : null,
          h('span', { class: 'muted small' }, c.number || ''))))) : null,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
  }

  const api = { appearances, open };
  if (isNode) module.exports = api;
  else root.CVPersonView = api;
})(this);
