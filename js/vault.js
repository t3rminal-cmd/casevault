/* CaseVault — the vault on the SSD.
 *
 * CaseVault-Data/
 *   vault.json            app version, settings, case index
 *   cases/<case-id>/
 *     case.json           title, number, client, status, tags, dates
 *     notes.md            free-form notes
 *     timeline.json       dated events and deadlines
 *     files/<Category>/   attached documents, copied in, one folder per document type
 *                         (Affidavits, Arrest Report, ... Other; see js/casefiles.js)
 *     mail-log.json       department mail hand-offs
 *     drafts/, checks/    drafts and consistency checks
 *   archive/<case-id>/    archived cases (same layout, read-only in the app)
 *   templates/            document templates
 *   backups/              dated snapshots of vault.json
 *   logs/                 outbound-YYYY-MM.json: everything that left this computer (never its content)
 *   secrets/              optional online AI key (only if the user ticks "Remember on SSD")
 *
 * case.json and timeline.json are the source of truth. The index inside vault.json is
 * a fast lookup that gets rebuilt from them every time the vault is opened.
 */
'use strict';

const Vault = (() => {
  const APP_VERSION = '1.9.1';
  const SCHEMA = 1;
  const DATA_DIR = 'CaseVault-Data';
  const STATUSES = ['Open', 'Pending', 'Closed', 'Archived'];
  const DEFAULT_SETTINGS = { backupsToKeep: 30, aiProfile: 'auto', privacyPin: null, privacyIdleMinutes: 0, webllm: true, webllmModel: '', affiant: null, sidebarCollapsed: false, mail: null, online: null, piiWatchlist: [] };

  let root = null;   // handle to CaseVault-Data
  let vault = null;  // parsed vault.json
  let lastBackupDay = null;

  // One write at a time per file, in order, so rapid autosaves never interleave.
  const chains = new Map();
  function serial(key, fn) {
    const next = (chains.get(key) || Promise.resolve()).catch(() => {}).then(fn);
    const cleanup = () => { if (chains.get(key) === next) chains.delete(key); };
    next.then(cleanup, cleanup);
    chains.set(key, next);
    return next;
  }

  const pad = (n) => String(n).padStart(2, '0');
  function localDay(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const nowISO = () => new Date().toISOString();

  function newId(prefix = '') {
    const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).padStart(6, '0').slice(-6);
    return prefix + localDay().replace(/-/g, '') + '-' + rand;
  }

  /* ---------- opening a vault ---------- */

  // Accepts whatever folder the user picked: CaseVault-Data itself, or the folder that
  // contains it (for example the root of V:).
  async function resolve(picked) {
    await picked.keys().next(); // throws NotFoundError if the drive is unplugged
    if (await FS.exists(picked, 'vault.json')) return { dir: picked, found: true };
    const sub = await FS.getDir(picked, DATA_DIR);
    if (sub && (await FS.exists(sub, 'vault.json'))) return { dir: sub, found: true };
    return { dir: null, found: false, parent: picked };
  }

  async function create(parent) {
    const dir = parent.name === DATA_DIR ? parent : await FS.getDir(parent, DATA_DIR, true);
    if (await FS.exists(dir, 'vault.json')) return dir;
    await FS.getDir(dir, 'cases', true);
    await FS.getDir(dir, 'backups', true);
    await FS.writeJSON(dir, 'vault.json', {
      app: 'CaseVault',
      appVersion: APP_VERSION,
      schema: SCHEMA,
      vaultId: crypto.randomUUID(),
      created: nowISO(),
      updated: nowISO(),
      settings: { ...DEFAULT_SETTINGS },
      cases: [],
    });
    return dir;
  }

  async function load(dir) {
    const data = await FS.readJSON(dir, 'vault.json');
    if (!data || data.app !== 'CaseVault') {
      const err = new Error('This folder does not contain a CaseVault vault.');
      err.name = 'NotAVaultError';
      throw err;
    }
    if ((data.schema || 1) > SCHEMA) {
      const err = new Error('This vault was saved by a newer version of CaseVault. Update the app before opening it.');
      err.name = 'NewerSchemaError';
      throw err;
    }
    root = dir;
    vault = data;
    vault.settings = { ...DEFAULT_SETTINGS, ...(vault.settings || {}) };
    // v1 stored 'rules-only' without asking; from v1.5 the user picks, and "Auto" is the default.
    if (!vault.settings.aiProfileChosen) vault.settings.aiProfile = 'auto';
    vault.cases = Array.isArray(vault.cases) ? vault.cases : [];
    lastBackupDay = null;
    await FS.getDir(root, 'cases', true);
    await FS.getDir(root, 'backups', true);
    await dailyBackup();
    await rebuildIndex();
    return vault;
  }

  function close() {
    root = null;
    vault = null;
  }

  // Cheap check used as a heartbeat to notice when the SSD is unplugged.
  async function ping() {
    if (!root) return false;
    await root.getFileHandle('vault.json');
    return true;
  }

  /* ---------- vault.json + backups ---------- */

  function saveVault() {
    return serial('vault.json', async () => {
      await dailyBackup();
      vault.appVersion = APP_VERSION;
      vault.updated = nowISO();
      await FS.writeJSON(root, 'vault.json', vault);
    });
  }

  // Before vault.json is first changed each day, keep a copy of it as backups/vault-YYYY-MM-DD.json.
  async function dailyBackup() {
    const day = localDay();
    if (lastBackupDay === day) return;
    const backups = await FS.getDir(root, 'backups', true);
    const name = `vault-${day}.json`;
    if (!(await FS.exists(backups, name))) {
      const text = await FS.readText(root, 'vault.json');
      if (text != null) await FS.writeText(backups, name, text);
    }
    lastBackupDay = day;
    await pruneBackups();
  }

  async function backupNow() {
    const d = new Date();
    const name = `vault-${localDay(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
    const backups = await FS.getDir(root, 'backups', true);
    await serial('vault.json', async () => {
      await FS.writeText(backups, name, (await FS.readText(root, 'vault.json')) || '');
    });
    await pruneBackups();
    return name;
  }

  async function listBackups() {
    const backups = await FS.getDir(root, 'backups', true);
    return (await FS.list(backups))
      .filter((e) => e.kind === 'file' && /^vault-.*\.json$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
  }

  async function pruneBackups() {
    const keep = Math.max(1, Number(vault.settings.backupsToKeep) || DEFAULT_SETTINGS.backupsToKeep);
    const names = await listBackups();
    const backups = await FS.getDir(root, 'backups', true);
    for (const name of names.slice(keep)) await FS.remove(backups, name);
  }

  /* ---------- case index ---------- */

  function nextDeadline(timeline) {
    const open = (timeline?.events || [])
      .filter((e) => e.kind === 'deadline' && !e.done && e.date)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    return open.length ? { date: open[0].date, time: open[0].time || '', title: open[0].title || '' } : null;
  }

  function indexEntry(c, timeline, prev, location = 'active') {
    return {
      id: c.id,
      location,
      title: c.title || '',
      number: c.number || '',
      client: c.client || '',
      status: c.status || 'Open',
      tags: Array.isArray(c.tags) ? c.tags : [],
      opened: c.dates?.opened || '',
      updated: [c.dates?.updated, prev?.updated].filter(Boolean).sort().pop() || '',
      nextDeadline: nextDeadline(timeline),
    };
  }

  // Rebuild the index from the case folders (cases/ and archive/) so vault.json can never drift
  // out of sync. Also settles a move that was interrupted (see moveCaseFolder).
  async function rebuildIndex() {
    const casesDir = await FS.getDir(root, 'cases', true);
    const archiveDir = await FS.getDir(root, 'archive'); // created on first archive
    const prevById = new Map(vault.cases.map((c) => [c.id, c]));
    const dirsIn = async (parent) => (parent ? (await FS.list(parent)).filter((e) => e.kind === 'directory') : []);
    await settleRenames(casesDir);
    const active = await dirsIn(casesDir);
    const archived = await dirsIn(archiveDir);
    const archivedNames = new Set(archived.map((e) => e.name));
    const found = [];
    for (const e of active) found.push({ ...e, location: 'active' });
    for (const e of archived) found.push({ ...e, location: 'archive' });

    // The same case in both folders means a move was interrupted. Keep the right copy.
    const settled = new Set();
    for (const e of active) {
      if (!archivedNames.has(e.name)) continue;
      const keep = await settleInterruptedMove(e.name, prevById.get(e.name));
      settled.add(`${e.name}:${keep === 'active' ? 'archive' : 'active'}`); // the copy to leave out
    }

    const rebuilt = (await Promise.all(found.map(async ({ name, handle, location }) => {
      if (settled.has(`${name}:${location}`)) return null;
      try {
        const c = await FS.readJSON(handle, 'case.json');
        if (!c) return null;
        c.id = name; // the folder name is the id
        const tl = await FS.readJSON(handle, 'timeline.json').catch(() => null);
        return indexEntry(c, tl, prevById.get(name), location);
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        console.warn('Skipping unreadable case folder', name, err);
        return null;
      }
    }))).filter(Boolean);
    rebuilt.sort((a, b) => a.id.localeCompare(b.id));
    const before = JSON.stringify([...vault.cases].sort((a, b) => a.id.localeCompare(b.id)));
    vault.cases = rebuilt;
    if (JSON.stringify(rebuilt) !== before) await saveVault();
  }

  function upsertIndex(entry) {
    const i = vault.cases.findIndex((c) => c.id === entry.id);
    if (i >= 0) vault.cases[i] = entry;
    else vault.cases.push(entry);
  }

  function touchIndex(id, patch = {}) {
    const entry = vault.cases.find((c) => c.id === id);
    if (entry) Object.assign(entry, patch, { updated: nowISO() });
    return saveVault();
  }

  /* ---------- cases ---------- */

  // Active cases live in cases/, archived ones in archive/. The index entry's `location` says which.
  const FOLDERS = { active: 'cases', archive: 'archive' };
  const locationOf = (id) => ((vault.cases.find((c) => c.id === id) || {}).location === 'archive' ? 'archive' : 'active');
  const isArchived = (id) => !!vault && locationOf(id) === 'archive';

  async function caseDir(id, create = false) {
    const where = locationOf(id);
    let dir = await FS.getDir(await FS.getDir(root, FOLDERS[where], true), id, create);
    if (!dir && !create) {
      // The index may be out of date (e.g. a restored vault.json backup): look in the other folder.
      const other = await FS.getDir(root, FOLDERS[where === 'archive' ? 'active' : 'archive']);
      dir = other ? await FS.getDir(other, id) : null;
    }
    if (!dir) {
      const err = new Error('This case folder no longer exists on the SSD.');
      err.name = 'CaseMissingError';
      throw err;
    }
    return dir;
  }

  // Archived cases are read-only: every write to one is refused here, whatever the screen allows.
  function assertWritable(id) {
    if (!isArchived(id)) return;
    const err = new Error('This case is archived, so it is read-only. Restore it to active cases to change it.');
    err.name = 'ReadOnlyError';
    throw err;
  }

  // cases/2026-00123 for case number 00123 opened in 2026 (then -2, -3 if taken); a case without a
  // number gets a dated id like 20260928-k3j9x2, and can be renamed once it has one.
  async function freeCaseId(base) {
    const casesDir = await FS.getDir(root, 'cases', true);
    const archiveDir = await FS.getDir(root, 'archive');
    const taken = async (name) => vault.cases.some((x) => x.id === name)
      || (await FS.exists(casesDir, name, 'directory')) || (archiveDir ? await FS.exists(archiveDir, name, 'directory') : false);
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      if (!(await taken(candidate))) return candidate;
    }
  }

  async function ensureCategoryFolders(dir) {
    const files = await FS.getDir(dir, 'files', true);
    for (const folder of CVCaseFiles.FOLDERS) await FS.getDir(files, folder, true);
    return files;
  }

  async function createCase(fields) {
    const draft = { number: fields.number || '', dates: { opened: fields.opened || localDay() } };
    const base = CVCaseFiles.caseFolderName(draft);
    const id = base ? await freeCaseId(base) : newId();
    const now = nowISO();
    const c = {
      schema: SCHEMA,
      id,
      title: fields.title || 'Untitled case',
      number: fields.number || '',
      client: fields.client || '',
      status: STATUSES.includes(fields.status) ? fields.status : 'Open',
      tags: fields.tags || [],
      dates: { opened: fields.opened || localDay(), closed: '', created: now, updated: now },
    };
    const dir = await caseDir(id, true);
    await ensureCategoryFolders(dir);
    await FS.writeJSON(dir, 'case.json', c);
    await FS.writeText(dir, 'notes.md', '');
    await FS.writeJSON(dir, 'timeline.json', { schema: SCHEMA, events: [] });
    upsertIndex(indexEntry(c, null));
    await saveVault();
    return c;
  }

  async function getCase(id) {
    const c = await FS.readJSON(await caseDir(id), 'case.json');
    if (!c) {
      const err = new Error('case.json is missing for this case.');
      err.name = 'CaseMissingError';
      throw err;
    }
    c.id = id;
    c.tags = Array.isArray(c.tags) ? c.tags : [];
    c.dates = { opened: '', closed: '', created: '', updated: '', ...(c.dates || {}) };
    return c;
  }

  function saveCase(c) {
    return serial(`case:${c.id}`, async () => {
      assertWritable(c.id);
      const dir = await caseDir(c.id);
      c.dates.updated = nowISO();
      await FS.writeJSON(dir, 'case.json', c);
      const prev = vault.cases.find((e) => e.id === c.id);
      upsertIndex({ ...indexEntry(c, null, prev, locationOf(c.id)), nextDeadline: prev ? prev.nextDeadline : null });
      await saveVault();
    });
  }

  // Permanent: removes the case folder (active or archived) with everything in it. No trash.
  async function deleteCase(id) {
    return serial(`case:${id}`, async () => {
      const parent = await FS.getDir(root, FOLDERS[locationOf(id)], true);
      if (await FS.exists(parent, id, 'directory')) await FS.remove(parent, id, true);
      vault.cases = vault.cases.filter((c) => c.id !== id);
      await saveVault();
    });
  }

  /* ---------- archive: move a case folder between cases/ and archive/ ---------- */

  // Written into the copy once every file has been copied and checked. If the original can't be
  // removed afterwards (the SSD unplugged at that moment), the next rebuild sees the marker and
  // finishes the move; without it, the copy is incomplete and the original is kept.
  const MOVE_MARKER = '.casevault-move.json';
  const CHUNK = 4 * 1024 * 1024;

  async function sameBytes(a, b) {
    if (!a || !b || a.size !== b.size) return false;
    for (let at = 0; at < a.size; at += CHUNK) {
      const [x, y] = await Promise.all([a.slice(at, at + CHUNK).arrayBuffer(), b.slice(at, at + CHUNK).arrayBuffer()]);
      const u = new Uint8Array(x);
      const v = new Uint8Array(y);
      if (u.length !== v.length) return false;
      for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
    }
    return true;
  }

  // Copy every file and folder of src into dst, then read both back and compare byte for byte.
  // Returns the number of files. Throws (leaving src untouched) if anything differs.
  async function copyTree(src, dst, onFile) {
    let n = 0;
    for (const e of await FS.list(src)) {
      if (e.name === MOVE_MARKER || e.name === RENAME_MARKER) continue;
      if (e.kind === 'directory') {
        n += await copyTree(e.handle, await FS.getDir(dst, e.name, true), onFile);
      } else {
        const file = await e.handle.getFile();
        await FS.writeData(dst, e.name, file);
        const copy = await FS.getFile(dst, e.name);
        if (!(await sameBytes(file, copy))) {
          const err = new Error(`The copy of ${e.name} does not match the original, so the case was not moved.`);
          err.name = 'MoveVerifyError';
          throw err;
        }
        n++;
        if (onFile) onFile(n, e.name);
      }
    }
    return n;
  }

  /** Move cases/<id> <-> archive/<id>: copy, verify every file, then remove the original. */
  async function moveCaseFolder(id, from, to, onFile) {
    const fromParent = await FS.getDir(root, FOLDERS[from], true);
    const toParent = await FS.getDir(root, FOLDERS[to], true);
    const src = await FS.getDir(fromParent, id);
    if (!src) {
      const err = new Error('This case folder no longer exists on the SSD.');
      err.name = 'CaseMissingError';
      throw err;
    }
    const stale = await FS.getDir(toParent, id);
    if (stale) {
      // A copy left by an earlier move. Complete (marker): that move only needs finishing.
      if (await FS.exists(stale, MOVE_MARKER)) {
        await FS.remove(fromParent, id, true);
        await FS.remove(stale, MOVE_MARKER);
        return;
      }
      await FS.remove(toParent, id, true); // incomplete: the original is intact, start again
    }
    const dst = await FS.getDir(toParent, id, true);
    try {
      await copyTree(src, dst, onFile);
    } catch (err) {
      // Leave only the untouched original behind.
      try { await FS.remove(toParent, id, true); } catch { /* the next move or rebuild tidies up */ }
      throw err;
    }
    await FS.writeJSON(dst, MOVE_MARKER, { from: FOLDERS[from], to: FOLDERS[to], at: nowISO() });
    await FS.remove(fromParent, id, true);
    await FS.remove(dst, MOVE_MARKER);
  }

  // Both cases/<id> and archive/<id> exist: a move was interrupted. Returns which copy to keep.
  async function settleInterruptedMove(id, prevEntry) {
    const casesDir = await FS.getDir(root, 'cases', true);
    const archiveDir = await FS.getDir(root, 'archive', true);
    const inActive = await FS.getDir(casesDir, id);
    const inArchive = await FS.getDir(archiveDir, id);
    try {
      if (await FS.exists(inArchive, MOVE_MARKER)) { // archiving had copied everything
        await FS.remove(casesDir, id, true);
        await FS.remove(inArchive, MOVE_MARKER);
        return 'archive';
      }
      if (await FS.exists(inActive, MOVE_MARKER)) { // restoring had copied everything
        await FS.remove(archiveDir, id, true);
        await FS.remove(inActive, MOVE_MARKER);
        return 'active';
      }
    } catch (err) {
      if (FS.isDisconnectError(err)) throw err;
      console.warn('Could not finish an interrupted move', id, err);
    }
    // No marker: the copy is incomplete. The original is where the index last put the case.
    return prevEntry && prevEntry.location === 'archive' ? 'archive' : 'active';
  }

  /**
   * Archive a case: status Archived, closed date filled in if empty, folder moved to archive/.
   * Returns the updated case.
   */
  function archiveCase(id, onFile) {
    return serial(`case:${id}`, async () => {
      if (isArchived(id)) return getCase(id);
      const c = await getCase(id);
      const before = structuredClone(c);
      if (c.status !== 'Archived') c.statusBeforeArchive = c.status;
      c.status = 'Archived';
      if (!c.dates.closed) c.dates.closed = localDay();
      c.dates.archived = localDay();
      c.dates.updated = nowISO();
      // case.json is updated first so the copy carries it. If the move fails, the case stays
      // active exactly as it was.
      const dir = await caseDir(id);
      await FS.writeJSON(dir, 'case.json', c);
      try {
        await moveCaseFolder(id, 'active', 'archive', onFile);
      } catch (err) {
        if (await FS.exists(await FS.getDir(root, 'cases', true), id, 'directory').catch(() => false)) {
          await FS.writeJSON(dir, 'case.json', before).catch(() => {});
        }
        throw err;
      }
      const prev = vault.cases.find((e) => e.id === id);
      const tl = await FS.readJSON(await FS.getDir(await FS.getDir(root, 'archive'), id), 'timeline.json').catch(() => null);
      upsertIndex(indexEntry(c, tl, prev, 'archive'));
      await saveVault();
      return c;
    });
  }

  /** Restore an archived case to cases/, with the status it had before (Closed if unknown). */
  function restoreCase(id, onFile) {
    return serial(`case:${id}`, async () => {
      if (!isArchived(id)) return getCase(id);
      await moveCaseFolder(id, 'archive', 'active', onFile);
      const prev = vault.cases.find((e) => e.id === id);
      if (prev) prev.location = 'active';
      const dir = await caseDir(id);
      const c = await getCase(id);
      c.status = c.statusBeforeArchive && c.statusBeforeArchive !== 'Archived' ? c.statusBeforeArchive : (c.dates.closed ? 'Closed' : 'Open');
      delete c.statusBeforeArchive;
      delete c.dates.archived;
      c.dates.updated = nowISO();
      await FS.writeJSON(dir, 'case.json', c);
      const tl = await FS.readJSON(dir, 'timeline.json').catch(() => null);
      upsertIndex(indexEntry(c, tl, prev, 'active'));
      await saveVault();
      return c;
    });
  }

  /** What must be typed to delete a case: its number, or its title when it has no number. */
  function deleteConfirmText(c) {
    return String((c && (String(c.number || '').trim() || c.title)) || '').trim();
  }
  const deleteConfirmMatches = (c, typed) => {
    const want = deleteConfirmText(c);
    return !!want && String(typed || '').trim() === want;
  };

  /* ---------- renaming a case folder to the 2026-<CaseNo> convention ---------- */

  // Written into the new folder before copying ("copying") and after every file is verified
  // ("copied"). The next rebuild finishes or undoes an interrupted rename from it.
  const RENAME_MARKER = '.casevault-rename.json';

  /** The folder name the convention wants for this case, or null (no number, or already named so). */
  function conventionalId(c) {
    const base = CVCaseFiles.caseFolderName(c);
    if (!base || c.id === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(c.id)) return null;
    return base;
  }

  /** Rename cases/<id> to cases/<2026-CaseNo>: copy, verify every file, then remove the original. */
  function renameCaseFolder(id, onFile) {
    return serial(`case:${id}`, async () => {
      assertWritable(id);
      const c = await getCase(id);
      const base = conventionalId(c);
      if (!base) return c;
      const newCaseId = await freeCaseId(base);
      const casesDir = await FS.getDir(root, 'cases', true);
      const src = await caseDir(id);
      const dst = await FS.getDir(casesDir, newCaseId, true);
      await FS.writeJSON(dst, RENAME_MARKER, { from: id, state: 'copying', at: nowISO() });
      try {
        await copyTree(src, dst, onFile);
      } catch (err) {
        try { await FS.remove(casesDir, newCaseId, true); } catch { /* the next rebuild tidies up */ }
        throw err;
      }
      c.id = newCaseId;
      c.previousIds = [...new Set([...(c.previousIds || []), id])];
      c.dates.updated = nowISO();
      await FS.writeJSON(dst, 'case.json', c);
      await FS.writeJSON(dst, RENAME_MARKER, { from: id, state: 'copied', at: nowISO() });
      await FS.remove(casesDir, id, true);
      await FS.remove(dst, RENAME_MARKER);
      const prev = vault.cases.find((e) => e.id === id);
      vault.cases = vault.cases.filter((e) => e.id !== id);
      const tl = await FS.readJSON(dst, 'timeline.json').catch(() => null);
      upsertIndex(indexEntry(c, tl, prev, 'active'));
      await saveVault();
      return c;
    });
  }

  async function settleRenames(casesDir) {
    for (const e of await FS.list(casesDir)) {
      if (e.kind !== 'directory') continue;
      let marker = null;
      try { marker = await FS.readJSON(e.handle, RENAME_MARKER); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      if (!marker) continue;
      try {
        if (marker.state === 'copied') {
          if (marker.from && marker.from !== e.name && (await FS.exists(casesDir, marker.from, 'directory'))) await FS.remove(casesDir, marker.from, true);
          await FS.remove(e.handle, RENAME_MARKER);
        } else {
          // The copy never finished: the original is intact, so drop the partial copy.
          await FS.remove(casesDir, e.name, true);
        }
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        console.warn('Could not finish an interrupted rename', e.name, err);
      }
    }
  }

  /* ---------- notes ---------- */

  async function getNotes(id) {
    return (await FS.readText(await caseDir(id), 'notes.md')) || '';
  }

  function saveNotes(id, text) {
    return serial(`notes:${id}`, async () => {
      assertWritable(id);
      await FS.writeText(await caseDir(id), 'notes.md', text);
      await touchIndex(id);
    });
  }

  /* ---------- timeline ---------- */

  async function getTimeline(id) {
    const tl = await FS.readJSON(await caseDir(id), 'timeline.json');
    return { schema: SCHEMA, events: [], ...(tl || {}) };
  }

  function sortEvents(events) {
    return events.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  }

  function saveTimeline(id, tl) {
    return serial(`timeline:${id}`, async () => {
      assertWritable(id);
      sortEvents(tl.events);
      await FS.writeJSON(await caseDir(id), 'timeline.json', tl);
      await touchIndex(id, { nextDeadline: nextDeadline(tl) });
    });
  }

  /* ---------- files (files/<Category>/<name>) ---------- */
  // A file is addressed by its path inside files/: "Arrest Report/2026-00123 Arrest Report.pdf".
  // Files from versions before 1.9 sit directly in files/ and are listed as unsorted (folder '').

  async function filesDir(id) {
    return (await FS.getDir(await caseDir(id), 'files', !isArchived(id))) || emptyDir;
  }

  // Stands in for a sub-folder an archived case never had (it can't be created: read-only).
  const emptyDir = {
    kind: 'directory', name: '',
    async *entries() { /* nothing */ },
    async getFileHandle() { throw Object.assign(new Error('Not found'), { name: 'NotFoundError' }); },
    async getDirectoryHandle() { throw Object.assign(new Error('Not found'), { name: 'NotFoundError' }); },
  };

  /** Create any missing document-type folders (so they show in File Explorer too). */
  async function ensureFolders(id) {
    if (isArchived(id)) return;
    await ensureCategoryFolders(await caseDir(id));
  }

  // The folder a file lives in. Only the known document folders (or '' for unsorted) are allowed.
  async function folderDir(id, folder, create = false) {
    const files = await filesDir(id);
    if (!folder) return files;
    if (!CVCaseFiles.isCategory(folder)) {
      const err = new Error(`Unknown document folder: ${folder}`);
      err.name = 'TypeError';
      throw err;
    }
    return (await FS.getDir(files, folder, create && !isArchived(id))) || emptyDir;
  }

  async function fileInfo(e, folder) {
    const base = { name: CVCaseFiles.joinPath(folder, e.name), folder, base: e.name };
    if (e.handle.meta) return { ...base, size: e.handle.meta.size, type: '', modified: e.handle.meta.mtime }; // helper mode
    const f = await e.handle.getFile();
    return { ...base, size: f.size, type: f.type, modified: f.lastModified };
  }

  // [{ name: 'Arrest Report/2026-00123 Arrest Report.pdf', folder, base, size, type, modified }]
  async function listFiles(id) {
    const dir = await filesDir(id);
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind === 'file') out.push(await fileInfo(e, CVCaseFiles.UNSORTED));
      else if (e.kind === 'directory' && CVCaseFiles.isCategory(e.name)) {
        for (const f of await FS.list(e.handle)) if (f.kind === 'file' && !f.name.startsWith('.')) out.push(await fileInfo(f, e.name));
      }
    }
    const order = (f) => (f.folder ? CVCaseFiles.FOLDERS.indexOf(f.folder) : 99);
    const stem = (f) => f.base.replace(/\.[^.]{1,10}$/, ''); // "X.pdf" before "X (2).pdf"
    return out.sort((a, b) => order(a) - order(b) || stem(a).localeCompare(stem(b), undefined, { numeric: true }) || a.base.localeCompare(b.base));
  }

  /**
   * Copy a file into the case. With { folder } it goes into that document folder and is named by
   * the convention ("2026-00123 Arrest Report.pdf"; { description } adds " - <description>";
   * { keepName: true } keeps the original name). Without a folder it goes into files/ unchanged.
   * Returns the new file's path.
   */
  async function addFile(id, file, opts = {}) {
    assertWritable(id);
    const folder = opts.folder || CVCaseFiles.UNSORTED;
    const dir = await folderDir(id, folder, true);
    let wanted = file.name;
    if (folder && !opts.keepName) wanted = CVCaseFiles.fileName(await getCase(id), folder, file.name, opts.description || '');
    const name = await FS.uniqueName(dir, wanted);
    await FS.writeData(dir, name, file);
    await touchIndex(id);
    return CVCaseFiles.joinPath(folder, name);
  }

  async function readFile(id, path) {
    const { folder, base } = CVCaseFiles.splitPath(path);
    return FS.getFile(await folderDir(id, folder), base);
  }

  async function deleteFile(id, path) {
    assertWritable(id);
    const { folder, base } = CVCaseFiles.splitPath(path);
    await FS.remove(await folderDir(id, folder), base);
    await touchIndex(id);
  }

  /**
   * Move a file to another document folder (or rename it in place), naming it by the convention.
   * The copy is verified byte for byte before the original is removed. Returns the new path.
   */
  async function moveFile(id, path, toFolder, opts = {}) {
    assertWritable(id);
    const { folder, base } = CVCaseFiles.splitPath(path);
    const src = await folderDir(id, folder);
    const file = await FS.getFile(src, base);
    if (!file) throw Object.assign(new Error(`${base} is no longer in this case.`), { name: 'NotFoundError' });
    const dst = await folderDir(id, toFolder, true);
    const c = await getCase(id);
    const wanted = opts.keepName ? base : CVCaseFiles.fileName(c, toFolder, base, opts.description || '');
    if (folder === toFolder && wanted === base) return path;
    const name = await FS.uniqueName(dst, wanted);
    await FS.writeData(dst, name, file);
    if (!(await sameBytes(file, await FS.getFile(dst, name)))) {
      await FS.remove(dst, name).catch(() => {});
      throw Object.assign(new Error(`The copy of ${base} did not match, so it was not moved.`), { name: 'MoveVerifyError' });
    }
    await FS.remove(src, base);
    await touchIndex(id);
    return CVCaseFiles.joinPath(toFolder, name);
  }

  /** Text-only record kept inside the case folder, e.g. mail-log.json. */
  async function readCaseJSON(id, name) {
    return FS.readJSON(await caseDir(id), name);
  }
  function writeCaseJSON(id, name, data) {
    return serial(`casejson:${id}:${name}`, async () => {
      assertWritable(id);
      await FS.writeJSON(await caseDir(id), name, data);
    });
  }

  /* ---------- logs/ and secrets/ (vault level) ---------- */

  /** Append an entry to logs/<name>-YYYY-MM.json (a JSON array). */
  function appendLog(name, entry) {
    const file = `${name}-${localDay().slice(0, 7)}.json`;
    return serial(`log:${file}`, async () => {
      const dir = await FS.getDir(root, 'logs', true);
      let list = [];
      try { list = (await FS.readJSON(dir, file)) || []; } catch (err) { if (FS.isDisconnectError(err)) throw err; list = []; }
      if (!Array.isArray(list)) list = [];
      list.push({ at: nowISO(), ...entry });
      await FS.writeJSON(dir, file, list);
    });
  }

  async function readLogs(name, months = 3) {
    const dir = await FS.getDir(root, 'logs');
    if (!dir) return [];
    const files = (await FS.list(dir)).filter((e) => e.kind === 'file' && e.name.startsWith(`${name}-`)).map((e) => e.name).sort().reverse().slice(0, months);
    const out = [];
    for (const f of files) { try { out.push(...((await FS.readJSON(dir, f)) || [])); } catch { /* skip a damaged log */ } }
    return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }

  async function readSecret(name) {
    const dir = await FS.getDir(root, 'secrets');
    if (!dir) return null;
    try { return await FS.readJSON(dir, `${name}.json`); } catch { return null; }
  }

  async function writeSecret(name, value) {
    const dir = await FS.getDir(root, 'secrets', true);
    if (value == null) { if (await FS.exists(dir, `${name}.json`)) await FS.remove(dir, `${name}.json`); return; }
    await FS.writeJSON(dir, `${name}.json`, value);
  }

  /* ---------- consistency checks (cases/<id>/checks/) ---------- */

  async function checksDir(id) {
    return (await FS.getDir(await caseDir(id), 'checks', !isArchived(id))) || emptyDir;
  }

  // Newest first: [{ name, created, affidavit, reports, counts, open }]
  async function listChecks(id) {
    const dir = await checksDir(id);
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/-check\.json$/.test(e.name)) continue;
      try {
        const c = await FS.readJSON(dir, e.name);
        const counts = { High: 0, Medium: 0, Low: 0 };
        let open = 0;
        for (const f of c.flags || []) { counts[f.severity] = (counts[f.severity] || 0) + 1; if (f.status === 'open') open++; }
        out.push({ name: e.name, created: c.created, affidavit: c.affidavit, reports: c.reports || [], engine: c.engine, counts, open, complete: c.complete !== false });
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        out.push({ name: e.name, damaged: true });
      }
    }
    return out.sort((a, b) => (b.created || b.name).localeCompare(a.created || a.name));
  }

  // cases/<id>/checks/<YYYY-MM-DD>-check.json, then -2-check.json, -3-check.json on the same day.
  async function newCheckName(id) {
    const dir = await checksDir(id);
    const day = localDay();
    for (let n = 1; ; n++) {
      const name = n === 1 ? `${day}-check.json` : `${day}-${n}-check.json`;
      if (!(await FS.exists(dir, name))) return name;
    }
  }

  async function readCheck(id, name) {
    return FS.readJSON(await checksDir(id), name);
  }

  function saveCheck(id, name, data) {
    return serial(`check:${id}:${name}`, async () => {
      assertWritable(id);
      data.updated = nowISO();
      await FS.writeJSON(await checksDir(id), name, data);
      await touchIndex(id);
    });
  }

  async function deleteCheck(id, name) {
    assertWritable(id);
    await FS.remove(await checksDir(id), name);
  }

  // Text read out of a document (OCR is slow) is kept on the SSD, keyed by file name, size and date.
  function cacheKey(fileName, size, modified) {
    return FS.safeName(`${fileName}--${size}-${modified}`).slice(0, 150) + '.json';
  }

  async function readTextCache(id, fileName, size, modified) {
    const dir = await FS.getDir(await checksDir(id), 'text-cache', !isArchived(id));
    if (!dir) return null;
    try { return await FS.readJSON(dir, cacheKey(fileName, size, modified)); } catch (err) {
      if (FS.isDisconnectError(err)) throw err;
      return null; // damaged cache entry: just read the document again
    }
  }

  async function writeTextCache(id, fileName, size, modified, data) {
    if (isArchived(id)) return; // read-only: the text is simply read again next time
    const dir = await FS.getDir(await checksDir(id), 'text-cache', true);
    // Drop older cache entries for the same file.
    for (const e of await FS.list(dir)) {
      if (e.kind === 'file' && e.name.startsWith(FS.safeName(`${fileName}--`)) && e.name !== cacheKey(fileName, size, modified)) await FS.remove(dir, e.name);
    }
    await FS.writeJSON(dir, cacheKey(fileName, size, modified), data);
  }

  /* ---------- drafts (cases/<id>/drafts/<slug>.md) ---------- */
  // Created on first use, so vaults from older versions open unchanged.

  async function draftsDir(id) {
    return (await FS.getDir(await caseDir(id), 'drafts', !isArchived(id))) || emptyDir;
  }

  // Newest first: [{ slug, title, type, ai, created, updated, size }]
  async function listDrafts(id) {
    const dir = await draftsDir(id);
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/\.md$/i.test(e.name)) continue;
      const slug = e.name.replace(/\.md$/i, '');
      const f = await e.handle.getFile();
      const { meta } = CVDraft.parseDraft(await f.text());
      out.push({ slug, title: meta.title || slug, type: meta.type || 'other', ai: !!meta.ai, created: meta.created || '', updated: meta.updated || new Date(f.lastModified).toISOString(), size: f.size });
    }
    return out.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }

  async function readDraft(id, slug) {
    const text = await FS.readText(await draftsDir(id), `${slug}.md`);
    if (text == null) return null;
    const { meta, body } = CVDraft.parseDraft(text);
    return { slug, meta: { title: slug, type: 'other', ...meta }, body };
  }

  async function newDraftSlug(id, title) {
    const dir = await draftsDir(id);
    const base = CVDraft.slugify(title);
    for (let n = 1; ; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      if (!(await FS.exists(dir, `${slug}.md`))) return slug;
    }
  }

  function saveDraft(id, slug, meta, body) {
    return serial(`draft:${id}:${slug}`, async () => {
      assertWritable(id);
      const m = { ...meta, updated: nowISO() };
      if (!m.created) m.created = m.updated;
      await FS.writeText(await draftsDir(id), `${slug}.md`, CVDraft.serializeDraft(m, body));
      await touchIndex(id);
      return m;
    });
  }

  async function deleteDraft(id, slug) {
    assertWritable(id);
    await FS.remove(await draftsDir(id), `${slug}.md`);
    await touchIndex(id);
  }

  /* ---------- templates (CaseVault-Data/templates/*.md) ---------- */

  async function templatesDir() {
    return FS.getDir(root, 'templates', true);
  }

  async function listTemplates() {
    const dir = await templatesDir();
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/\.md$/i.test(e.name)) continue;
      const text = await (await e.handle.getFile()).text();
      out.push({ file: e.name, title: CVDraft.templateTitle(text, e.name) });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  async function readTemplate(file) {
    return FS.readText(await templatesDir(), file);
  }

  function saveTemplate(file, text) {
    return serial(`template:${file}`, async () => FS.writeText(await templatesDir(), FS.safeName(file), text));
  }

  async function deleteTemplate(file) {
    await FS.remove(await templatesDir(), file);
  }

  // Copies the generic starter templates in; never overwrites a file the user already has.
  async function addStarterTemplates() {
    const dir = await templatesDir();
    const added = [];
    for (const [file, text] of Object.entries(CVDraft.STARTER_TEMPLATES)) {
      if (await FS.exists(dir, file)) continue;
      await FS.writeText(dir, file, text);
      added.push(file);
    }
    return added;
  }

  /* ---------- settings ---------- */

  function updateSettings(patch) {
    Object.assign(vault.settings, patch);
    return saveVault();
  }

  return {
    APP_VERSION, DATA_DIR, STATUSES,
    get root() { return root; },
    get data() { return vault; },
    newId, localDay,
    resolve, create, load, close, ping,
    backupNow, listBackups, rebuildIndex, updateSettings,
    createCase, getCase, saveCase, deleteCase,
    archiveCase, restoreCase, isArchived, deleteConfirmText, deleteConfirmMatches, MOVE_MARKER,
    getNotes, saveNotes,
    getTimeline, saveTimeline, sortEvents,
    listFiles, addFile, readFile, deleteFile, moveFile, ensureFolders, renameCaseFolder, conventionalId, RENAME_MARKER,
    readCaseJSON, writeCaseJSON, appendLog, readLogs, readSecret, writeSecret,
    listChecks, newCheckName, readCheck, saveCheck, deleteCheck, readTextCache, writeTextCache,
    listDrafts, readDraft, newDraftSlug, saveDraft, deleteDraft,
    listTemplates, readTemplate, saveTemplate, deleteTemplate, addStarterTemplates,
  };
})();
