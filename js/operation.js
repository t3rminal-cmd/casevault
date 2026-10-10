/* CaseVault — operations (v1.27): several case numbers under one Title or Operation Name.
 * v1.46: an Operation is its own record in vault.json ({ id, number, name, status, start, end,
 * notes }); a case belongs to none or one of them through case.operationId. Every case lives in
 * General Files; an Operation's Files are a view of its linked cases, never a copy.
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

  /* ---------- v1.46: Operations as records ---------- */

  const OP_STATUSES = ['Open', 'Closed']; // v1.105: no Pending
  /** A number compared for duplicates: trimmed, single spaces, upper case. */
  const normNumber = (n) => String(n == null ? '' : n).trim().replace(/\s+/g, ' ').toUpperCase();
  /** "Number - Name" (just the one that's there when the other is empty). */
  const opLabel = (op) => (op ? [String(op.number || '').trim(), String(op.name || '').trim()].filter(Boolean).join(' - ') : '');

  /** A person's name for comparing: lower case, letters, digits and single spaces, words sorted
   * (so "Doe, John" and "John Doe" are the same name). */
  function normName(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  }
  function editDistance(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  /** 'same', 'similar' or '' for two subject names. Similar: one or two letters apart, or one name
   * holds every word of the other ("John Doe" and "John A. Doe"). Never merged, only flagged. */
  function nameMatch(a, b) {
    const x = normName(a); const y = normName(b);
    if (!x || !y) return '';
    if (x === y) return 'same';
    const short = Math.min(x.length, y.length);
    if (short >= 5 && editDistance(x, y) <= (short >= 10 ? 2 : 1)) return 'similar';
    const wx = x.split(' '); const wy = y.split(' ');
    const [few, many] = wx.length <= wy.length ? [wx, wy] : [wy, wx];
    if (few.length >= 2 && few.every((w) => many.includes(w))) return 'similar';
    return '';
  }
  /** Cases (index entries) whose subject is the same as, or close to, `subject`.
   * Returns { same: [...], similar: [...] }; the case `exceptId` is left out. */
  function subjectMatches(cases, subject, exceptId = '') {
    const out = { same: [], similar: [] };
    for (const c of cases || []) {
      if (!c || c.id === exceptId) continue;
      const m = nameMatch(subject, c.subject);
      if (m) out[m].push(c);
    }
    return out;
  }
  /** The case using this Case Number already (archived ones count), or null. */
  function caseWithNumber(cases, number, exceptId = '') {
    const n = normNumber(number);
    return n ? (cases || []).find((c) => c && c.id !== exceptId && normNumber(c.number) === n) || null : null;
  }
  /** Case Numbers used by more than one case (made before v1.46): Map(normalized number → [cases]). */
  function duplicateNumbers(cases) {
    const m = new Map();
    for (const c of cases || []) { const n = normNumber(c && c.number); if (n) m.set(n, [...(m.get(n) || []), c]); }
    for (const [k, v] of m) if (v.length < 2) m.delete(k);
    return m;
  }

  /** What's wrong with an Operation's fields, as messages (none: it can be saved). */
  function validateOperation(op, operations, exceptId = '') {
    const errs = [];
    const number = String((op && op.number) || '').trim();
    const name = String((op && op.name) || '').trim();
    if (!number) errs.push('Mission Number is required.');
    if (!name) errs.push('Mission Name is required.');
    if (number && (operations || []).some((o) => o && o.id !== exceptId && normNumber(o.number) === normNumber(number))) errs.push(`Mission Number ${number} is already used by another Mission.`);
    if (op && op.status && !OP_STATUSES.includes(op.status)) errs.push('Status must be Open or Closed.');
    if (op && op.start && op.end && String(op.end) < String(op.start)) errs.push('End Date is before Start Date.');
    return errs;
  }
  /** What's wrong with a new case's Case Number and Subject Name, as messages. */
  function validateCase(fields, cases, exceptId = '') {
    const errs = [];
    const number = String((fields && fields.number) || '').trim();
    if (!number) errs.push('Case Number is required.');
    if (!String((fields && fields.subject) || '').trim()) errs.push('Subject Name is required.');
    const dup = caseWithNumber(cases, number, exceptId);
    if (dup) errs.push(`Case Number ${number} already exists${dup.location === 'archive' ? ' (archived)' : ''}. Case Numbers must be unique.`);
    return errs;
  }

  /** The next free OP-001, OP-002, ... */
  function nextOpNumber(operations, taken = []) {
    const used = new Set([...(operations || []).map((o) => normNumber(o.number)), ...taken.map(normNumber)]);
    for (let n = 1; ; n++) { const v = `OP-${String(n).padStart(3, '0')}`; if (!used.has(v)) return v; }
  }
  /** An Operation's status from its cases' (when it's made from them): Open if any is open (or
   * was Pending, before v1.105), else Closed. */
  function statusFrom(statuses) {
    const s = (statuses || []).map((x) => (x === 'Archived' ? 'Closed' : x));
    return s.includes('Open') || s.includes('Pending') || !s.length ? 'Open' : 'Closed';
  }

  /** The first suspect's name (Primary first), for a case made before Subject Name existed. */
  function firstSuspect(c) {
    const sus = (Array.isArray(c && c.suspects) ? c.suspects : []).filter((x) => x && String(x.name || '').trim());
    const main = sus.find((x) => x.role === 'Primary' || x.role === 'Main') || sus[0];
    return main ? String(main.name).trim() : '';
  }

  /**
   * v1.46 migration plan. Cases (full case.json objects, archived ones included) that share a Title
   * become one Operation named after it; a case with a Title of its own stays independent.
   * Operation Number: the group's File Number when it has one no other Operation uses, else OP-001...
   * Returns { operations: [{ key, number, name, status, start, end, caseIds }], subjects: { id: name } }.
   */
  function planMigration(cases, existing = []) {
    const groups = new Map();
    for (const c of cases || []) {
      if (!c || c.operationId) continue;
      const k = opKey(c.title);
      if (!k) continue;
      groups.set(k, [...(groups.get(k) || []), c]);
    }
    const operations = [];
    const taken = (existing || []).map((o) => o.number);
    const byFirst = [...groups.entries()].filter(([, g]) => g.length >= 2)
      .map(([key, g]) => [key, [...g].sort((a, b) => String((a.dates && a.dates.opened) || '').localeCompare(String((b.dates && b.dates.opened) || '')) || String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }))])
      .sort((a, b) => String((a[1][0].dates && a[1][0].dates.opened) || '').localeCompare(String((b[1][0].dates && b[1][0].dates.opened) || '')) || a[0].localeCompare(b[0]));
    for (const [key, g] of byFirst) {
      const file = g.map((c) => String(c.fileNumber || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] || '';
      const number = file && !taken.some((t) => normNumber(t) === normNumber(file)) ? file : nextOpNumber(existing, taken);
      taken.push(number);
      const opened = g.map((c) => (c.dates && c.dates.opened) || '').filter(Boolean).sort();
      const status = statusFrom(g.map((c) => c.status));
      const closed = g.map((c) => (c.dates && c.dates.closed) || '').filter(Boolean).sort();
      operations.push({ key, number, name: String(g[0].title).trim().replace(/\s+/g, ' '), status, start: opened[0] || '', end: status === 'Closed' ? closed[closed.length - 1] || '' : '', caseIds: g.map((c) => c.id) });
    }
    const subjects = {};
    for (const c of cases || []) if (c && !String(c.subject || '').trim()) subjects[c.id] = firstSuspect(c);
    return { operations, subjects };
  }

  /** A case's title: its Operation's name, else its Subject Name, else what it had. */
  const caseTitle = (c, op) => (op && String(op.name || '').trim()) || String((c && c.subject) || '').trim() || String((c && c.title) || '').trim() || 'Untitled case';

  /* v1.97: a Subject Name shown the same way everywhere: "LAST, First" ("John Doe" and
   * "doe, john" both read "DOE, John"). Only a person's name is turned around; anything else
   * (one word, numbers, several people, "Unknown Offender", a group) shows as typed. The saved
   * Subject Name never changes. */
  const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;
  const PARTICLE = /^(de|del|della|la|las|los|van|von|der|den|da|di|du|le|st\.?|bin|al|el|mac|ter)$/i;
  const NOT_A_NAME = /^(unknown|unidentified|not|identified|offender|offenders|subject|subjects|suspect|suspects|gang|group|crew|dto|organization|org|inc\.?|llc|co\.?|company|et|al\.?|and|the|of|aka|a\.k\.a\.?|state|people|county|city|village|usa|united|states)$/i;
  const WORD = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’.-]*$/;
  const titleWord = (w) => w.toLowerCase().replace(/(^|[-'’ ])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const ROMAN = /^(ii|iii|iv|v)\.?$/i;
  // First names typed all in capitals or all in small letters get capitals; mixed ones stay as typed.
  const firstPart = (t) => (t !== t.toUpperCase() && t !== t.toLowerCase() ? t
    : t.split(' ').map((w) => (ROMAN.test(w) ? w.toUpperCase() : titleWord(w))).join(' '));
  function subjectLabel(subject) {
    const s = String(subject || '').replace(/\s+/g, ' ').trim();
    if (!s || /\d|[&/;()]|\s\+\s|\s(v|vs)\.?\s/i.test(s)) return s; // a caption (State v. Doe) stays
    const parts = s.split(',').map((x) => x.trim());
    let last; let first;
    if (parts.length === 3 && SUFFIX.test(parts[2])) parts.splice(1, 2, `${parts[1]} ${parts[2]}`);
    if (parts.length === 2 && parts[0] && parts[1]) [last, first] = parts;
    else if (parts.length === 1) {
      const w = s.split(' ');
      if (w.length < 2 || w.length > 5) return s;
      let suffix = '';
      if (SUFFIX.test(w[w.length - 1]) && w.length > 2) suffix = w.pop();
      let i = w.length - 1;
      while (i > 1 && PARTICLE.test(w[i - 1])) i -= 1;
      last = w.slice(i).join(' ');
      first = [...w.slice(0, i), suffix].filter(Boolean).join(' ');
    } else return s;
    const words = `${last} ${first}`.split(' ');
    if (!words.every((x) => WORD.test(x)) || words.some((x) => NOT_A_NAME.test(x))) return s;
    return `${last.toUpperCase()}, ${firstPart(first)}`;
  }

  /** v1.111: a person's name in parts (General Files columns): "John Michael Doe" or "DOE, John
   * Michael" -> { last: 'DOE', first: 'John', middle: 'Michael' }. Anything that isn't a person's
   * name (a caption, one word, a group) -> { last: <as typed>, first: '', middle: '', whole: true }. */
  function nameParts(subject) {
    const label = subjectLabel(subject);
    const m = /^([^,]+), (.+)$/.exec(label);
    if (!m) return { last: label, first: '', middle: '', whole: true };
    const rest = m[2].split(' ');
    let last = m[1];
    if (rest.length > 1 && SUFFIX.test(rest[rest.length - 1])) last = `${last} ${rest.pop().toUpperCase().replace(/\.$/, '')}`;
    return { last, first: rest[0] || '', middle: rest.slice(1).join(' '), whole: false };
  }

  const api = {
    subjectLabel, nameParts,
    opKey, mergeOverview, sameOverview, mergeEvents,
    OP_STATUSES, normNumber, opLabel, normName, nameMatch, subjectMatches, caseWithNumber, duplicateNumbers,
    validateOperation, validateCase, nextOpNumber, statusFrom, firstSuspect, planMigration, caseTitle,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVOperation = api;
})(this);
