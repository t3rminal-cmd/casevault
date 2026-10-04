/* CaseVault — helper mode storage (Firefox and other browsers without the File System Access API).
 *
 * The CaseVault helper (tools/casevault-helper) is a small server on 127.0.0.1 that serves this
 * app and reads/writes CaseVault-Data on the SSD. This file wraps its API in objects that behave
 * like FileSystemDirectoryHandle / FileSystemFileHandle, so vault.js works the same in both modes
 * and the data format on the SSD is identical.
 */
'use strict';

const HelperFS = (() => {
  // True when this page was served by the helper (the only way helper mode can work: its API is same-origin only).
  const servedByHelper = location.protocol === 'http:' && (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
  const DEFAULT_URL = 'http://127.0.0.1:8517/';

  const domError = (name, message) => new DOMException(message || name, name);
  const join = (a, b) => (a ? `${a}/${b}` : b);

  function checkName(name) {
    if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new TypeError(`Invalid name: ${name}`);
  }

  async function call(method, op, path, { body, query = '' } = {}) {
    let res;
    try {
      res = await fetch(new URL(`/api/${op}?p=${encodeURIComponent(path)}${query}`, location.href), {
        method,
        body,
        headers: { 'X-CaseVault': '1' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
    } catch {
      throw domError('NotReadableError', 'The CaseVault helper is not running. Start it with Start-CaseVault.bat.');
    }
    if (!res.ok) {
      let name = res.status === 404 ? 'NotFoundError' : 'UnknownError';
      let message = res.statusText;
      try { const j = await res.json(); name = j.error || name; message = j.message || message; } catch { /* not JSON */ }
      throw domError(name, message);
    }
    return res;
  }

  // { kind, size, mtime } or null when nothing exists at that path.
  async function stat(path) {
    return (await call('GET', 'stat', path)).json();
  }

  class HelperFileHandle {
    constructor(path, name, meta) {
      this.kind = 'file';
      this.name = name;
      this.path = path;
      this.meta = meta || null; // { size, mtime } from a listing, so file lists don't download every file
    }

    async getFile() {
      const res = await call('GET', 'read', this.path);
      const blob = await res.blob();
      const lastModified = Number(res.headers.get('X-Mtime')) || Date.now();
      return new File([blob], this.name, { lastModified, type: '' });
    }

    async createWritable() {
      const parts = [];
      const path = this.path;
      return {
        async write(data) {
          if (data && typeof data === 'object' && data.type === 'write') data = data.data;
          parts.push(data);
        },
        async close() {
          await call('PUT', 'write', path, { body: new Blob(parts) });
        },
        async abort() { parts.length = 0; },
      };
    }

    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async isSameEntry(other) { return !!other && other.path === this.path && other.kind === this.kind; }
  }

  class HelperDirectoryHandle {
    constructor(path, name) {
      this.kind = 'directory';
      this.name = name;
      this.path = path;
    }

    async getDirectoryHandle(name, { create = false } = {}) {
      checkName(name);
      const p = join(this.path, name);
      const st = await stat(p);
      if (st && st.kind !== 'directory') throw domError('TypeMismatchError', `${name} is a file.`);
      if (!st) {
        if (!create) throw domError('NotFoundError', `${name} not found.`);
        await call('POST', 'mkdir', p);
      }
      return new HelperDirectoryHandle(p, name);
    }

    async getFileHandle(name, { create = false } = {}) {
      checkName(name);
      const p = join(this.path, name);
      let st = await stat(p);
      if (st && st.kind !== 'file') throw domError('TypeMismatchError', `${name} is a folder.`);
      if (!st) {
        if (!create) throw domError('NotFoundError', `${name} not found.`);
        st = await (await call('PUT', 'write', p, { body: new Blob([]) })).json();
      }
      return new HelperFileHandle(p, name, st);
    }

    async removeEntry(name, { recursive = false } = {}) {
      checkName(name);
      await call('DELETE', 'remove', join(this.path, name), { query: recursive ? '&recursive=1' : '' });
    }

    async *entries() {
      const list = await (await call('GET', 'list', this.path)).json();
      for (const e of list) {
        const p = join(this.path, e.name);
        yield [e.name, e.kind === 'directory' ? new HelperDirectoryHandle(p, e.name) : new HelperFileHandle(p, e.name, e)];
      }
    }

    async *keys() { for await (const [name] of this.entries()) yield name; }
    async *values() { for await (const [, handle] of this.entries()) yield handle; }
    [Symbol.asyncIterator]() { return this.entries(); }

    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async isSameEntry(other) { return !!other && other.path === this.path && other.kind === this.kind; }
  }

  // { ready, root, drive, version } or throws NotReadableError when the helper isn't reachable.
  async function info() {
    let res;
    try {
      res = await fetch(new URL('/api/info', location.href), { headers: { 'X-CaseVault': '1' }, cache: 'no-store' });
    } catch {
      throw domError('NotReadableError', 'The CaseVault helper is not running.');
    }
    if (!res.ok) throw domError('NotReadableError', 'The CaseVault helper did not answer.');
    const data = await res.json();
    if (data.app !== 'CaseVault helper') throw domError('NotReadableError', 'Something else is running at this address.');
    return data;
  }

  function root(name) {
    return new HelperDirectoryHandle('', name || 'CaseVault-Data');
  }

  // Opens an .eml mail draft from a case's Email folder in the PC's mail program (Outlook).
  // The helper refuses anything that isn't an .eml file inside the vault's cases or archive.
  async function openFile(path) {
    await call('POST', 'open', path);
  }

  // { ramTotal, ramFree, diskTotal, diskFree } in bytes (helper mode only), or null.
  async function sysinfo() {
    try { return await (await call('GET', 'sysinfo', '')).json(); } catch { return null; }
  }

  // v1.68: Power Off. The helper answers, then stops; its clean-up closes the browser window,
  // Ollama, and locks and ejects the drives. -> { ok, drives }
  async function shutdown() {
    const res = await fetch(new URL('/api/shutdown', location.href), { method: 'POST', headers: { 'X-CaseVault': '1' }, cache: 'no-store' });
    if (!res.ok) throw domError('NotReadableError', 'The CaseVault helper did not answer.');
    return res.json();
  }

  // v1.87 (helper 1.11): Back Up Everything in Firefox. The helper lists the other drives, copies
  // CaseVault-Data to the one picked and checks every file, in the background.
  // backupDrives() -> [{ path, label, free, total, kind }], or null with an older helper.
  async function backupDrives() {
    try { return await (await call('GET', 'backup-drives', '')).json(); } catch (err) { if (err && err.name === 'NotFoundError') return null; throw err; }
  }
  // -> { state: idle | running | done | error, files, total, bytes, totalBytes, current, folder, drive, message, at }
  async function backupStart(drive) {
    return (await call('POST', 'backup-start', '', { query: `&drive=${encodeURIComponent(drive)}` })).json();
  }
  async function backupStatus() {
    return (await call('GET', 'backup-status', '')).json();
  }

  return { servedByHelper, DEFAULT_URL, info, root, openFile, sysinfo, shutdown, backupDrives, backupStart, backupStatus };
})();
