/* CaseVault — the vault on the SSD.
 *
 * CaseVault-Data/
 *   vault.json            app version, settings, case index
 *   cases/<case-id>/
 *     case.json           title, number, client, status, tags, dates
 *     notes.md            free-form notes
 *     timeline.json       dated events and deadlines
 *     files/              attached documents, copied in
 *   backups/              dated snapshots of vault.json
 *
 * case.json and timeline.json are the source of truth. The index inside vault.json is
 * a fast lookup that gets rebuilt from them every time the vault is opened.
 */
'use strict';

const Vault = (() => {
  const APP_VERSION = '1.5.0';
  const SCHEMA = 1;
  const DATA_DIR = 'CaseVault-Data';
  const STATUSES = ['Open', 'Pending', 'Closed', 'Archived'];
  const DEFAULT_SETTINGS = { backupsToKeep: 30, aiProfile: 'auto' };

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

  function indexEntry(c, timeline, prev) {
    return {
      id: c.id,
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

  // Rebuild the index from the case folders so vault.json can never drift out of sync.
  async function rebuildIndex() {
    const casesDir = await FS.getDir(root, 'cases', true);
    const prevById = new Map(vault.cases.map((c) => [c.id, c]));
    const entries = (await FS.list(casesDir)).filter((e) => e.kind === 'directory');
    const rebuilt = (await Promise.all(entries.map(async ({ name, handle }) => {
      try {
        const c = await FS.readJSON(handle, 'case.json');
        if (!c) return null;
        c.id = name; // the folder name is the id
        const tl = await FS.readJSON(handle, 'timeline.json').catch(() => null);
        return indexEntry(c, tl, prevById.get(name));
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

  async function caseDir(id, create = false) {
    const casesDir = await FS.getDir(root, 'cases', true);
    const dir = await FS.getDir(casesDir, id, create);
    if (!dir) {
      const err = new Error('This case folder no longer exists on the SSD.');
      err.name = 'CaseMissingError';
      throw err;
    }
    return dir;
  }

  async function createCase(fields) {
    const id = newId();
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
    await FS.getDir(dir, 'files', true);
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
      const dir = await caseDir(c.id);
      c.dates.updated = nowISO();
      await FS.writeJSON(dir, 'case.json', c);
      const prev = vault.cases.find((e) => e.id === c.id);
      upsertIndex({ ...indexEntry(c, null), nextDeadline: prev ? prev.nextDeadline : null });
      await saveVault();
    });
  }

  async function deleteCase(id) {
    const casesDir = await FS.getDir(root, 'cases', true);
    await FS.remove(casesDir, id, true);
    vault.cases = vault.cases.filter((c) => c.id !== id);
    await saveVault();
  }

  /* ---------- notes ---------- */

  async function getNotes(id) {
    return (await FS.readText(await caseDir(id), 'notes.md')) || '';
  }

  function saveNotes(id, text) {
    return serial(`notes:${id}`, async () => {
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
      sortEvents(tl.events);
      await FS.writeJSON(await caseDir(id), 'timeline.json', tl);
      await touchIndex(id, { nextDeadline: nextDeadline(tl) });
    });
  }

  /* ---------- files ---------- */

  async function filesDir(id) {
    return FS.getDir(await caseDir(id), 'files', true);
  }

  async function listFiles(id) {
    const dir = await filesDir(id);
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file') continue;
      if (e.handle.meta) { // helper mode: size and date come with the listing
        out.push({ name: e.name, size: e.handle.meta.size, type: '', modified: e.handle.meta.mtime });
        continue;
      }
      const f = await e.handle.getFile();
      out.push({ name: e.name, size: f.size, type: f.type, modified: f.lastModified });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async function addFile(id, file) {
    const dir = await filesDir(id);
    const name = await FS.uniqueName(dir, file.name);
    await FS.writeData(dir, name, file);
    await touchIndex(id);
    return name;
  }

  async function readFile(id, name) {
    return FS.getFile(await filesDir(id), name);
  }

  async function deleteFile(id, name) {
    await FS.remove(await filesDir(id), name);
    await touchIndex(id);
  }

  /* ---------- consistency checks (cases/<id>/checks/) ---------- */

  async function checksDir(id) {
    return FS.getDir(await caseDir(id), 'checks', true);
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
      data.updated = nowISO();
      await FS.writeJSON(await checksDir(id), name, data);
      await touchIndex(id);
    });
  }

  async function deleteCheck(id, name) {
    await FS.remove(await checksDir(id), name);
  }

  // Text read out of a document (OCR is slow) is kept on the SSD, keyed by file name, size and date.
  function cacheKey(fileName, size, modified) {
    return FS.safeName(`${fileName}--${size}-${modified}`).slice(0, 150) + '.json';
  }

  async function readTextCache(id, fileName, size, modified) {
    const dir = await FS.getDir(await checksDir(id), 'text-cache', true);
    try { return await FS.readJSON(dir, cacheKey(fileName, size, modified)); } catch (err) {
      if (FS.isDisconnectError(err)) throw err;
      return null; // damaged cache entry: just read the document again
    }
  }

  async function writeTextCache(id, fileName, size, modified, data) {
    const dir = await FS.getDir(await checksDir(id), 'text-cache', true);
    // Drop older cache entries for the same file.
    for (const e of await FS.list(dir)) {
      if (e.kind === 'file' && e.name.startsWith(FS.safeName(`${fileName}--`)) && e.name !== cacheKey(fileName, size, modified)) await FS.remove(dir, e.name);
    }
    await FS.writeJSON(dir, cacheKey(fileName, size, modified), data);
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
    getNotes, saveNotes,
    getTimeline, saveTimeline, sortEvents,
    listFiles, addFile, readFile, deleteFile,
    listChecks, newCheckName, readCheck, saveCheck, deleteCheck, readTextCache, writeTextCache,
  };
})();
