/* CaseVault — storage primitives.
 *
 * HandleStore: IndexedDB holds exactly ONE thing, the folder handle for the vault on
 * the SSD. Case data is never written to IndexedDB, localStorage, or any other
 * browser storage.
 *
 * FS: thin helpers over the File System Access API. Every read and write goes
 * straight to the folder the user picked on the SSD.
 */
'use strict';

const HandleStore = (() => {
  const DB_NAME = 'casevault';
  const STORE = 'handle';
  const KEY = 'vault-folder';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function run(mode, fn) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  return {
    load: () => run('readonly', (s) => s.get(KEY)).catch(() => null),
    save: (handle) => run('readwrite', (s) => s.put(handle, KEY)),
    clear: () => run('readwrite', (s) => s.delete(KEY)),
  };
})();

const FS = (() => {
  // Errors that mean "the drive is gone or we lost access", as opposed to a bug.
  const DISCONNECT_ERRORS = new Set([
    'NotFoundError', 'NotAllowedError', 'InvalidStateError', 'NotReadableError', 'SecurityError',
  ]);

  function isDisconnectError(err) {
    return !!err && DISCONNECT_ERRORS.has(err.name);
  }

  async function getDir(parent, name, create = false) {
    try {
      return await parent.getDirectoryHandle(name, { create });
    } catch (err) {
      if (!create && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')) return null;
      throw err;
    }
  }

  async function getFile(dir, name) {
    try {
      const fh = await dir.getFileHandle(name);
      return await fh.getFile();
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'TypeMismatchError') return null;
      throw err;
    }
  }

  async function exists(dir, name, kind) {
    try {
      if (kind === 'directory') await dir.getDirectoryHandle(name);
      else await dir.getFileHandle(name);
      return true;
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'TypeMismatchError') return false;
      throw err;
    }
  }

  async function readText(dir, name) {
    const file = await getFile(dir, name);
    return file ? file.text() : null;
  }

  async function readJSON(dir, name) {
    const text = await readText(dir, name);
    if (text == null) return null;
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error(`${name} is damaged and could not be read.`);
      err.name = 'CorruptFileError';
      throw err;
    }
  }

  // createWritable() writes to a temporary swap file and only replaces the real file
  // on close(), so a pulled cable mid-write leaves the previous version intact.
  async function writeData(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try {
      await w.write(data);
      await w.close();
    } catch (err) {
      try { await w.abort(); } catch { /* already gone */ }
      throw err;
    }
  }

  const writeText = (dir, name, text) => writeData(dir, name, text);
  const writeJSON = (dir, name, obj) => writeData(dir, name, JSON.stringify(obj, null, 2) + '\n');

  async function list(dir) {
    const out = [];
    for await (const [name, handle] of dir.entries()) out.push({ name, handle, kind: handle.kind });
    return out;
  }

  async function remove(dir, name, recursive = false) {
    await dir.removeEntry(name, { recursive });
  }

  // Windows-safe file name: strip reserved characters, trailing dots/spaces, reserved device names.
  function safeName(name) {
    let n = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
    if (!n) n = 'file';
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = '_' + n;
    if (n.length > 180) {
      const dot = n.lastIndexOf('.');
      const ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : '';
      n = n.slice(0, 180 - ext.length) + ext;
    }
    return n;
  }

  async function uniqueName(dir, name) {
    const base = safeName(name);
    if (!(await exists(dir, base))) return base;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    for (let i = 2; ; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!(await exists(dir, candidate))) return candidate;
    }
  }

  return {
    isDisconnectError, getDir, getFile, exists, readText, readJSON,
    writeData, writeText, writeJSON, list, remove, safeName, uniqueName,
  };
})();
