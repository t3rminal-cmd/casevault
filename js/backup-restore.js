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

  /**
   * v1.149: Test Restore. From the files of a picked folder, the newest full backup in it and a
   * random sample of its files to read back. Nothing is written anywhere.
   * -> { backup, files: [{ rel, file }], info: File|null, sample: [{ rel, file }] } or null.
   * rel is the path inside the backup (the same as inside CaseVault-Data on the SSD).
   */
  function testPick(files, n = 20, rand = Math.random) {
    const byBackup = new Map();
    for (const f of files || []) {
      const parts = String(f.path || '').split(/[\\/]+/).filter(Boolean);
      let at = -1;
      for (let i = parts.length - 2; i >= 0; i--) if (/^CaseVault-Backup-/i.test(parts[i])) { at = i; break; }
      // A picked CaseVault-Data copy (no dated folder): its own name is the first part.
      const name = at >= 0 ? parts[at] : parts[0] || '';
      const rel = parts.slice(at >= 0 ? at + 1 : 1);
      if (!rel.length || rel.some((x) => x === '..' || x === '.')) continue;
      if (!byBackup.has(name)) byBackup.set(name, []);
      byBackup.get(name).push({ rel: rel.join('/'), file: f.file });
    }
    const named = [...byBackup.keys()].filter((k) => /^CaseVault-Backup-/i.test(k)).sort();
    const backup = named.length ? named[named.length - 1] : [...byBackup.keys()][0];
    if (!backup) return null;
    const all = byBackup.get(backup);
    const infoRow = all.find((x) => x.rel === 'backup-info.json');
    const files2 = all.filter((x) => x.rel !== 'backup-info.json');
    if (!files2.length) return null;
    // vault.json (the case list) is always read, then random others.
    const pool = files2.filter((x) => x.rel !== 'vault.json');
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const first = files2.find((x) => x.rel === 'vault.json');
    const sample = [...(first ? [first] : []), ...pool].slice(0, Math.max(1, n));
    return { backup, files: files2, info: infoRow ? infoRow.file : null, sample };
  }

  /** v1.149: what a Test Restore found -> { ok, lines: [text] } (ok: every file read and the count right). */
  function testVerdict({ read = 0, unreadable = 0, badJson = 0, same = 0, changed = 0, gone = 0, count = 0, expected = null } = {}) {
    const lines = [];
    lines.push(`${read} of ${read + unreadable} sample file${read + unreadable === 1 ? '' : 's'} read back in full${unreadable ? `; ${unreadable} could not be read` : ''}.`);
    if (badJson) lines.push(`${badJson} data file${badJson === 1 ? ' is' : 's are'} damaged (not readable as data).`);
    lines.push(`${same} the same as on the SSD${changed ? `, ${changed} changed on the SSD since the backup (normal for files you worked on)` : ''}${gone ? `, ${gone} no longer on the SSD` : ''}.`);
    if (expected != null) lines.push(count === expected ? `All ${count} files the backup made are there.` : `The backup made ${expected} files, the folder has ${count}: some are missing or extra.`);
    return { ok: !unreadable && !badJson && (expected == null || count === expected), lines };
  }

  return { group, backupWhen, testPick, testVerdict };
});
