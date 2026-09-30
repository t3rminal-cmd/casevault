/* CaseVault — operations (v1.27): several case numbers under one Title or Operation Name.
 *
 * An operation shares one Case Overview (suspects, contacts, deconfliction) and one Timeline:
 *   - the overview is kept in every case of the operation (case.json), the same in each, so a case
 *     still carries everything when it's archived or copied on its own. mergeOverview() joins what
 *     the cases have (cases made before v1.27 each had their own lists);
 *   - the timeline stays one timeline.json per case; mergeEvents() shows them as one, each event
 *     marked with its case number.
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const opKey = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const filled = (o) => !!o && Object.values(o).some((v) => String(v == null ? '' : v).trim());

  /** Items of several lists, each once (by key); empty ones are kept only from the first list. */
  function union(lists, keyOf) {
    const out = [];
    const seen = new Set();
    lists.forEach((list, i) => {
      for (const it of Array.isArray(list) ? list : []) {
        if (!it || typeof it !== 'object') continue;
        if (!filled(it)) { if (i === 0) out.push(it); continue; }
        const k = keyOf(it);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(it);
      }
    });
    return out;
  }

  /** The Case Overview of an operation: its cases' suspects, contacts and deconfliction, joined.
   * cases[0] is the case on screen: its own entries come first, in its own order. */
  function mergeOverview(cases) {
    const list = (cases || []).filter(Boolean);
    const suspects = union(list.map((c) => c.suspects), (s) => norm(s.name) || JSON.stringify(s));
    const contactOf = (c) => Object.assign({ officer: {}, prosecutor: {}, others: [] }, c.contacts || {});
    const cs = list.map(contactOf);
    const first = (k) => (cs.find((x) => filled(x[k])) || {})[k] || {};
    const contacts = {
      ...(cs[0] || {}),
      officer: first('officer'),
      prosecutor: first('prosecutor'),
      others: union(cs.map((x) => x.others), (o) => `${norm(o.role)}|${norm(o.name)}|${norm(o.email)}`),
    };
    const deconfliction = union(list.map((c) => c.deconfliction), (r) => [r.date, r.event, r.system, r.number].map(norm).join('|'));
    return { suspects, contacts, deconfliction };
  }

  const pick = (c) => ({ suspects: c.suspects || [], contacts: Object.assign({ officer: {}, prosecutor: {}, others: [] }, c.contacts || {}), deconfliction: c.deconfliction || [] });
  /** Do two cases hold the same overview? */
  const sameOverview = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));

  /** One timeline for the operation: [{ caseId, number, ev }] in date and time order.
   * timelines: [{ caseId, number, events }]. */
  function mergeEvents(timelines) {
    const out = [];
    for (const t of timelines || []) for (const ev of (t.events || [])) out.push({ caseId: t.caseId, number: t.number || '', ev });
    return out.sort((a, b) => String(a.ev.date || '').localeCompare(String(b.ev.date || ''))
      || String(a.ev.time || '').localeCompare(String(b.ev.time || ''))
      || String(a.ev.created || '').localeCompare(String(b.ev.created || '')));
  }

  const api = { opKey, mergeOverview, sameOverview, mergeEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVOperation = api;
})(this);
