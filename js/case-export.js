/* CaseVault — encrypted export of one case (v1.153).
 *
 * One file, "<case number> Case Export.cvcase", with every file of the case folder encrypted with
 * a password, the same way as a Discovery package (js/discovery-core.js: PBKDF2-SHA-256 for the key,
 * AES-256-GCM in 1 MB chunks, each chunk tied to its file and place). It goes to another officer or
 * to a safe place, and Settings → Backups → Import Case puts it back.
 *
 *   'CVCASE01' | header length (4 bytes, big-endian) | header (JSON) | the encrypted chunks
 * The header holds the key's salt and the sealed manifest (case number, subject, and each file's
 * path, size, nonce and offset). Nothing about the case can be read without the password.
 * Plain logic over Blobs and WebCrypto, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = () => (isNode ? require('./discovery-core.js') : root.CVDiscovery);
  const MAGIC = 'CVCASE01';
  const KIND = 'case-export';
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  // Left out: the Files undo trash and the move/rename markers (they mean nothing in another vault).
  const SKIP = /(^|\/)(\.trash\/|\.casevault-move\.json$|\.casevault-rename\.json$)/;

  /** files: [{ path, blob }] (paths inside the case folder); meta: { caseId, number, subject }.
   * -> Blob of the .cvcase file. */
  async function pack(files, password, meta = {}, { iterations, onProgress = () => {} } = {}) {
    const C = D();
    const k = await C.newKey(password, iterations);
    const list = files.filter((f) => f && f.path && !SKIP.test(f.path));
    const total = list.reduce((n, f) => n + f.blob.size, 0);
    const parts = []; const out = []; let offset = 0; let done = 0;
    for (let i = 0; i < list.length; i++) {
      const { path, blob } = list[i];
      const id = `f${i}`;
      const nonce = crypto.getRandomValues(new Uint8Array(8));
      const chunks = C.chunkCount(blob.size);
      const start = offset;
      for (let n = 0; n < chunks; n++) {
        const plain = new Uint8Array(await blob.slice(n * C.CHUNK, Math.min(blob.size, (n + 1) * C.CHUNK)).arrayBuffer());
        const ct = await C.encryptChunk(k.key, id, nonce, n, n === chunks - 1, plain);
        parts.push(ct); offset += ct.length;
        done += plain.length;
        onProgress(done, total);
      }
      out.push({ id, path, size: blob.size, nonce: C.b64(nonce), chunks, offset: start });
    }
    const manifest = { kind: KIND, app: 'CaseVault', exported: new Date().toISOString(), caseId: meta.caseId || '', number: meta.number || '', subject: meta.subject || '', files: out };
    const header = { ...(await C.headerFor(k, manifest)), kind: KIND };
    const hb = enc.encode(JSON.stringify(header));
    const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, hb.length);
    return new Blob([enc.encode(MAGIC), len, hb, ...parts], { type: 'application/octet-stream' });
  }

  /** The header of a .cvcase file (no password needed: it holds nothing readable). */
  async function readHeader(blob) {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (head.length < 12 || dec.decode(head.slice(0, 8)) !== MAGIC) throw Object.assign(new Error('This is not a CaseVault case export (.cvcase).'), { name: 'FormatError' });
    const n = new DataView(head.buffer).getUint32(8);
    if (n > 64 * 1024 * 1024) throw Object.assign(new Error('This case export is damaged.'), { name: 'FormatError' });
    const header = JSON.parse(dec.decode(new Uint8Array(await blob.slice(12, 12 + n).arrayBuffer())));
    if (header.kind !== KIND) throw Object.assign(new Error('This is not a CaseVault case export (.cvcase).'), { name: 'FormatError' });
    return { header, dataStart: 12 + n };
  }

  /** Opens a .cvcase with its password: { manifest, files: [{ path, data: Blob }] }. Throws
   * WrongPassword, or an error if any byte was changed. */
  async function unpack(blob, password, { onProgress = () => {} } = {}) {
    const C = D();
    const { header, dataStart } = await readHeader(blob);
    const { key, manifest } = await C.unlock(header, password);
    if (manifest.kind !== KIND || !Array.isArray(manifest.files)) throw Object.assign(new Error('This case export is damaged.'), { name: 'FormatError' });
    const total = manifest.files.reduce((n, f) => n + (f.size || 0), 0);
    const files = []; let done = 0;
    for (const f of manifest.files) {
      const nonce = C.unb64(f.nonce);
      const chunks = []; let at = dataStart + f.offset;
      for (let n = 0; n < f.chunks; n++) {
        const plainLen = n === f.chunks - 1 ? f.size - n * C.CHUNK : C.CHUNK;
        const ct = new Uint8Array(await blob.slice(at, at + plainLen + C.TAG).arrayBuffer());
        at += plainLen + C.TAG;
        let plain;
        try { plain = await C.decryptChunk(key, f.id, nonce, n, n === f.chunks - 1, ct); } catch {
          throw Object.assign(new Error(`${f.path} in this case export was changed or is damaged.`), { name: 'FormatError' });
        }
        chunks.push(plain); done += plain.length; onProgress(done, total);
      }
      files.push({ path: f.path, data: new Blob(chunks) });
    }
    return { manifest, files };
  }

  /** "EX-100 Case Export.cvcase" */
  const fileName = (number) => `${String(number || 'Case').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Case'} Case Export.cvcase`;

  const api = { MAGIC, KIND, pack, readHeader, unpack, fileName };
  if (isNode) module.exports = api;
  else root.CVCaseExport = api;
})(this);
