/* CaseVault — Search inside cases (v1.106).
 *
 * The case list's search box matches case numbers, names and titles. "Search inside cases" also
 * reads what is in each case: the Details (suspects, contacts, deconfliction…), Field Notes, the
 * Timeline, the reports, the Draft form, the arrest details and the names of the files. Every
 * word typed has to be in the same place (AND), upper or lower case doesn't matter.
 *
 * Nothing is indexed or kept: each search reads the SSD and forgets. findIn() and textOf() are
 * plain logic, tested under Node.
 */
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVCaseSearch = api;
})(typeof self !== 'undefined' ? self : this, () => {
  // Keys whose values are ids, paths or machine data rather than words someone would look for.
  const SKIP_KEYS = new Set(['id', 'caseId', 'operationId', 'path', 'photos', 'photo', 'activity', 'hidden', 'dates', 'version', 'schema', 'closureHistory', 'deleted']);

  /** Every string in a value (objects and arrays walked), joined by newlines. */
  function textOf(value, depth = 0) {
    if (value == null || depth > 12) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return '';
    if (Array.isArray(value)) return value.map((v) => textOf(v, depth + 1)).filter(Boolean).join('\n');
    if (typeof value === 'object') return Object.entries(value).filter(([k]) => !SKIP_KEYS.has(k)).map(([, v]) => textOf(v, depth + 1)).filter(Boolean).join('\n');
    return '';
  }

  const terms = (q) => String(q || '').toLowerCase().split(/\s+/).filter((t) => t.length > 0);

  /** -> null, or { snippet, at } around the first word when every word is in the text. */
  function findIn(text, query, width = 70) {
    const ts = terms(query);
    const t = String(text || '');
    if (!ts.length || !t) return null;
    const low = t.toLowerCase();
    if (!ts.every((w) => low.includes(w))) return null;
    const at = low.indexOf(ts[0]);
    const from = Math.max(0, at - width);
    const to = Math.min(t.length, at + ts[0].length + width);
    const snippet = `${from > 0 ? '…' : ''}${t.slice(from, to).replace(/\s+/g, ' ').trim()}${to < t.length ? '…' : ''}`;
    return { snippet, at };
  }

  /**
   * Search every case. Vault is the app's Vault; onCase(done, total) reports progress; stop() can
   * end it early; isFatal(err) says which errors stop it (the SSD unplugged). -> [{ id, number, subject, title, archived, hits: [{ where, tab, snippet }] }].
   */
  async function search(Vault, query, { onCase = () => {}, stop = () => false, isFatal = () => false } = {}) {
    if (!terms(query).length) return [];
    const cases = (Vault.data && Vault.data.cases) || [];
    const out = [];
    for (const [i, entry] of cases.entries()) {
      if (stop()) break;
      const id = entry.id;
      const hits = [];
      const look = (where, tab, text) => { const f = findIn(text, query); if (f) hits.push({ where, tab, snippet: f.snippet }); };
      const safe = async (fn) => { try { return await fn(); } catch (err) { if (isFatal(err)) throw err; return null; } }; // the SSD unplugged ends it
      const c = await safe(() => Vault.getCase(id));
      if (c) look('Details', 'details', textOf(c));
      look('Field Notes', 'notes', await safe(() => Vault.getNotes(id)));
      const tl = await safe(() => Vault.getTimeline(id));
      if (tl) for (const ev of tl.events || []) { const f = findIn(`${ev.title || ''}\n${ev.note || ''}`, query); if (f) hits.push({ where: `Timeline: ${ev.date || ''}`, tab: 'timeline', snippet: f.snippet }); }
      const drafts = await safe(() => Vault.listDrafts(id));
      for (const d of drafts || []) {
        const r = await safe(() => Vault.readDraft(id, d.slug));
        if (r) { const f = findIn(`${d.title}\n${r.body}`, query); if (f) hits.push({ where: `Report: ${d.title}`, tab: 'reports', snippet: f.snippet }); }
      }
      look('Draft form', 'draft', textOf(await safe(() => Vault.readCaseJSON(id, 'report-fields.json'))));
      look('Arrest details', 'arrest', textOf(await safe(() => Vault.readCaseJSON(id, 'arrest.json'))));
      const files = await safe(() => Vault.listFiles(id));
      for (const f of files || []) { const m = findIn(f.name || '', query); if (m) hits.push({ where: `File: ${f.folder || 'Files'}`, tab: 'files', snippet: m.snippet }); }
      if (hits.length) out.push({ id, number: entry.number || '', subject: entry.subject || '', title: entry.title || '', archived: entry.location === 'archive', hits });
      onCase(i + 1, cases.length);
    }
    return out;
  }

  return { textOf, findIn, search, terms };
});
