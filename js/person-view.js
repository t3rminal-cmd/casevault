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

  /** v1.153: when a suspect is added: the other cases with the same person (the same name, and the
   * same date of birth when both have one). person: { name, dob }; cases: full case objects; self:
   * the case being edited (it and the cases of its Mission are left out, they share suspects).
   * -> [{ c, name, dob, sameDob }] */
  function duplicates(person, cases, self = {}) {
    const Op = O();
    const name = clean(person && person.name);
    if (!name || Op.normName(name).length < 3) return [];
    const dob = clean(person.dob);
    const out = [];
    for (const c of cases || []) {
      if (!c || c.id === self.id || (self.operationId && c.operationId === self.operationId)) continue;
      const hit = [...(c.suspects || []).filter((sx) => sx && !sx.notIdentified).map((sx) => ({ name: sx.name, dob: sx.dob, suspect: sx })), { name: c.subject, dob: '' }]
        .find((x) => clean(x.name) && Op.nameMatch(name, x.name) === 'same' && !(dob && clean(x.dob) && clean(x.dob) !== dob));
      // v1.168: the suspect's record too (to fill in the same person on this case), and how much it holds.
      if (hit) out.push({ c, name: clean(hit.name), dob: clean(hit.dob), sameDob: !!(dob && clean(hit.dob) === dob), ...(hit.suspect ? { suspect: hit.suspect, filled: filledCount(hit.suspect) } : {}) });
    }
    // The same date of birth first, then a case in a Mission (a group case), then the fullest record.
    return out.sort((a, b) => Number(b.sameDob) - Number(a.sameDob) || Number(!!b.c.operationId) - Number(!!a.c.operationId)
      || (b.filled || 0) - (a.filled || 0) || String(a.c.number || '').localeCompare(String(b.c.number || '')));
  }

  /** v1.168: how many details a suspect's record has (date of birth, residence, description). */
  function filledCount(sx) {
    return ['dob', 'residence'].filter((k) => clean(sx[k])).length + Object.values((sx && sx.info) || {}).filter((v) => clean(v)).length;
  }

  /**
   * v1.168: fills in a suspect from the same person's record on another case: only the empty boxes
   * (date of birth, residence, the description and record numbers); what is already typed stays.
   * -> the number of boxes filled.
   */
  function fillFrom(target, source) {
    let n = 0;
    for (const k of ['dob', 'residence']) if (!clean(target[k]) && clean(source[k])) { target[k] = clean(source[k]); n++; }
    if (!target.info || typeof target.info !== 'object') target.info = {};
    for (const [k, v] of Object.entries(source.info || {})) if (!clean(target.info[k]) && clean(v)) { target.info[k] = clean(v); n++; }
    return n;
  }

  // The cases read for duplicates(), kept while each case's "updated" stays the same.
  const caseMemo = new Map();
  async function allCases() {
    const entries = (Vault.data.cases || []).slice();
    const out = [];
    for (let i = 0; i < entries.length; i += 8) {
      await Promise.all(entries.slice(i, i + 8).map(async (e) => {
        const m = caseMemo.get(e.id);
        if (m && m.updated === (e.updated || '')) { out.push(m.c); return; }
        try { const c = await Vault.getCase(e.id); caseMemo.set(e.id, { updated: e.updated || '', c }); out.push(c); } catch { /* moved or unreadable */ }
      }));
    }
    return out;
  }
  /** Browser: duplicates() over every case on the SSD. */
  async function findDuplicates(person, self) { return duplicates(person, await allCases(), self); }

  /** v1.168: the identified suspects on the other cases (names for the Name box's suggestions),
   * those on a Mission's cases first. self: the case being edited. -> [{ name, dob, number }] */
  async function knownSuspects(self = {}) {
    const seen = new Map();
    const cases = (await allCases()).filter((c) => c.id !== self.id).sort((a, b) => Number(!!b.operationId) - Number(!!a.operationId));
    for (const c of cases) for (const sx of c.suspects || []) {
      const name = clean(sx && !sx.notIdentified && sx.name);
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, dob: clean(sx.dob), number: c.number || '' });
    }
    return [...seen.values()];
  }

  const api = { appearances, duplicates, findDuplicates, fillFrom, filledCount, knownSuspects, open };
  if (isNode) module.exports = api;
  else root.CVPersonView = api;
})(this);
