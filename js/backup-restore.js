/* CaseVault — Restore cases from a full backup (v1.106).
 *
 * A full backup is a plain copy of CaseVault-Data (CaseVault-Backups\CaseVault-Backup-<date>).
 * The browser reads a picked folder as a flat list of files, each with its path inside the
 * folder. group() finds the cases in it: everything under cases\<id>\ (and archive\<id>\),
 * whether the picked folder is the backup itself, CaseVault-Backups or a CaseVault-Data copy.
 * Plain logic, tested under Node.
 */
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVBackupRestore = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const ID_RE = /^[A-Za-z0-9][\w.-]*$/;

  /**
   * files: [{ path: 'CaseVault-Backup-…/cases/2026-EX-100/notes.md', file }] (path with / or \).
   * -> [{ id, location: 'active'|'archive', backup: 'CaseVault-Backup-…', files: [{ path, file }] }]
   * The newest backup wins when the picked folder holds several with the same case.
   */
  function group(files) {
    const byKey = new Map();
    for (const f of files || []) {
      const parts = String(f.path || '').split(/[\\/]+/).filter(Boolean);
      // The last "cases" or "archive" folder that has a case folder and a file under it.
      let at = -1;
      for (let i = parts.length - 3; i >= 0; i--) if ((parts[i] === 'cases' || parts[i] === 'archive') && ID_RE.test(parts[i + 1])) { at = i; break; }
      if (at < 0) continue;
      const id = parts[at + 1];
      const rel = parts.slice(at + 2);
      if (rel.some((x) => x === '..' || x === '.') || rel[rel.length - 1] === '.casevault-move.json') continue;
      const backup = parts.slice(0, at).reverse().find((x) => /^CaseVault-Backup-/i.test(x)) || parts.slice(0, at).join('/') || '';
      const key = `${backup}|${id}`;
      if (!byKey.has(key)) byKey.set(key, { id, location: parts[at] === 'archive' ? 'archive' : 'active', backup, files: [] });
      byKey.get(key).files.push({ path: rel.join('/'), file: f.file });
    }
    // One entry per case: from the newest backup (names sort by date).
    const best = new Map();
    for (const g of byKey.values()) {
      if (!g.files.some((x) => x.path === 'case.json')) continue;
      const cur = best.get(g.id);
      if (!cur || g.backup > cur.backup) best.set(g.id, g);
    }
    return [...best.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** "CaseVault-Backup-2026-10-09-143000" -> "2026-10-09 14:30" (or the name as it is). */
  function backupWhen(name) {
    const m = /CaseVault-Backup-(\d{4}-\d{2}-\d{2})(?:-(\d{2})(\d{2}))?/i.exec(String(name || ''));
    return m ? `${m[1]}${m[2] ? ` ${m[2]}:${m[3]}` : ''}` : String(name || '');
  }

  return { group, backupWhen };
});
