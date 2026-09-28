// An in-memory stand-in for the File System Access API handles (what Chrome/Edge give CaseVault
// for a folder on the SSD). Supports what fs.js / vault.js use.
'use strict';

const notFound = (n) => new DOMException(`${n} not found`, 'NotFoundError');

class MemFileHandle {
  constructor(name, parent) { this.kind = 'file'; this.name = name; this.parent = parent; this.data = new Uint8Array(0); this.mtime = Date.now(); }
  async getFile() { return new File([this.data], this.name, { lastModified: this.mtime }); }
  async createWritable() {
    const parts = [];
    return {
      write: async (d) => { parts.push(d); },
      close: async () => { this.data = new Uint8Array(await new Blob(parts).arrayBuffer()); this.mtime = Date.now(); },
      abort: async () => { parts.length = 0; },
    };
  }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}

class MemDirectoryHandle {
  constructor(name) { this.kind = 'directory'; this.name = name; this.children = new Map(); }
  async getDirectoryHandle(name, { create = false } = {}) {
    const c = this.children.get(name);
    if (c) { if (c.kind !== 'directory') throw new DOMException('is a file', 'TypeMismatchError'); return c; }
    if (!create) throw notFound(name);
    const d = new MemDirectoryHandle(name); this.children.set(name, d); return d;
  }
  async getFileHandle(name, { create = false } = {}) {
    const c = this.children.get(name);
    if (c) { if (c.kind !== 'file') throw new DOMException('is a folder', 'TypeMismatchError'); return c; }
    if (!create) throw notFound(name);
    const f = new MemFileHandle(name, this); this.children.set(name, f); return f;
  }
  async removeEntry(name, { recursive = false } = {}) {
    const c = this.children.get(name);
    if (!c) throw notFound(name);
    if (c.kind === 'directory' && c.children.size && !recursive) throw new DOMException('not empty', 'InvalidModificationError');
    this.children.delete(name);
  }
  async *entries() { for (const [n, h] of [...this.children]) yield [n, h]; }
  async *keys() { for (const n of [...this.children.keys()]) yield n; }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}

module.exports = { MemDirectoryHandle, MemFileHandle };
