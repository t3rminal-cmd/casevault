/* CaseVault — Discovery packages (v1.49): the plain logic shared by the app (which writes a package)
 * and "Open Discovery.html" (the viewer that reads one). No DOM; the tests run it under Node.
 *
 * A package is a folder:
 *   Open Discovery.html      the viewer, with the package header inside it (salt, the sealed manifest)
 *   data/<id>.<part>.cvd     every file encrypted, in 4 MiB chunks, at most 128 chunks per part file
 *                            (512 MiB, so a FAT32 USB stick takes any size)
 *   VLC Player/              (optional) a portable VLC copied from the SSD
 *   README - Start Here.txt  how to open it (no case details)
 * Encryption: AES-256-GCM. The key comes from the password with PBKDF2-SHA-256 (600,000 rounds).
 * Each chunk has its own IV (the file's random 8-byte nonce + the chunk number) and is bound to its
 * file, place and "last chunk" flag, so chunks can't be swapped, reordered or cut off unnoticed.
 * The manifest (names, Bates numbers, fingerprints) is encrypted too: without the password the
 * package shows nothing about the case.
 */
'use strict';

(function (root) {
  const FORMAT = 'casevault-discovery';
  const VERSION = 1;
  const CHUNK = 4 * 1024 * 1024;
  const TAG = 16;
  const PART_CHUNKS = 128;
  const KDF_ITERATIONS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const subtle = () => (root.crypto || globalThis.crypto).subtle;
  const randomBytes = (n) => (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(n));

  /* ---------- base64 ---------- */
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(String(s || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ---------- Bates numbers ---------- */
  /** The prefix as it prints: capitals, digits, - and _ only ("disc 1" -> "DISC1"). */
  const cleanPrefix = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9_-]+/g, '').replace(/^[-_]+|[-_]+$/g, '').slice(0, 20) || 'DISC';
  const bates = (prefix, n, digits = 6) => `${cleanPrefix(prefix)}-${String(Math.max(0, Math.floor(n))).padStart(digits, '0')}`;
  const batesRange = (prefix, first, last) => (first === last ? bates(prefix, first) : `${bates(prefix, first)} to ${bates(prefix, last)}`);
  /** Bates numbers for items in order, from `start`: one per page (PDF), one per other file. */
  function allocate(items, start) {
    let n = Math.max(1, Math.floor(start) || 1);
    return items.map((it) => {
      const count = Math.max(1, it.pages || 1);
      const out = { ...it, batesFirst: n, batesLast: n + count - 1 };
      n += count;
      return out;
    });
  }

  /* ---------- what a file is ---------- */
  const extOf = (name) => (/\.([^./\\]{1,10})$/.exec(String(name || '')) || ['', ''])[1].toLowerCase();
  const KINDS = {
    pdf: ['pdf'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
    video: ['mp4', 'm4v', 'webm', 'mov', 'ogv'],
    audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'weba'],
    doc: ['docx'],
    sheet: ['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'tsv'],
    text: ['txt', 'md', 'log', 'eml', 'json', 'xml', 'csv0'],
    media: ['avi', 'wmv', 'mkv', 'mpg', 'mpeg', 'flv', '3gp', 'dav', 'asf', 'vob', 'ts', 'm2ts', 'h264', 'wma', 'amr', 'aiff', 'aif'],
  };
  /** pdf · image · video · audio · doc · sheet · text · media (a recording the browser can't play:
   * VLC) · other. */
  function kindOf(name) {
    const e = extOf(name);
    for (const [k, list] of Object.entries(KINDS)) if (list.includes(e)) return k;
    return 'other';
  }
  const KIND_LABEL = { pdf: 'PDF', image: 'Photo', video: 'Video', audio: 'Audio', doc: 'Word document', sheet: 'Spreadsheet', text: 'Text', media: 'Recording (VLC)', other: 'File' };
  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
    txt: 'text/plain', md: 'text/plain', log: 'text/plain', eml: 'text/plain', json: 'text/plain', xml: 'text/plain' };
  const mimeOf = (name) => MIME[extOf(name)] || 'application/octet-stream';

  /* ---------- SHA-256, a piece at a time (WebCrypto only hashes whole buffers) ---------- */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  class Sha256 {
    constructor() { this.h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]); this.buf = new Uint8Array(64); this.n = 0; this.len = 0; this.w = new Uint32Array(64); }
    block(b, o) {
      const w = this.w; const h = this.h;
      for (let i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15]; const y = w[i - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, bb, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] += a; h[1] += bb; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    update(data) {
      const u = data instanceof Uint8Array ? data : new Uint8Array(data);
      this.len += u.length;
      let i = 0;
      if (this.n) {
        const take = Math.min(64 - this.n, u.length);
        this.buf.set(u.subarray(0, take), this.n); this.n += take; i = take;
        if (this.n === 64) { this.block(this.buf, 0); this.n = 0; }
      }
      for (; i + 64 <= u.length; i += 64) this.block(u, i);
      if (i < u.length) { this.buf.set(u.subarray(i), 0); this.n = u.length - i; }
      return this;
    }
    hex() {
      const bits = this.len * 8;
      const pad = new Uint8Array(((this.n < 56 ? 56 : 120) - this.n) + 8);
      pad[0] = 0x80;
      const hi = Math.floor(bits / 0x100000000); const lo = bits >>> 0;
      pad.set([hi >>> 24, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, lo >>> 24, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255], pad.length - 8);
      const len = this.len; this.update(pad); this.len = len;
      return [...this.h].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
    }
  }

  /* ---------- encryption ---------- */
  async function deriveKey(password, salt, iterations = KDF_ITERATIONS) {
    const base = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function chunkIv(nonce, index) {
    const iv = new Uint8Array(12);
    iv.set(nonce, 0);
    new DataView(iv.buffer).setUint32(8, index);
    return iv;
  }
  const chunkAad = (id, index, last) => enc.encode(`${id}|${index}|${last ? 1 : 0}`);
  async function encryptChunk(key, id, nonce, index, last, plain) {
    return new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: chunkIv(nonce, index), additionalData: chunkAad(id, index, last) }, key, plain));
  }
  async function decryptChunk(key, id, nonce, index, last, cipher) {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: chunkIv(nonce, index), additionalData: chunkAad(id, index, last) }, key, cipher));
  }
  async function sealJSON(key, obj) {
    const iv = randomBytes(12);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('manifest') }, key, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), data: b64(new Uint8Array(ct)) };
  }
  async function openJSON(key, sealed) {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv), additionalData: enc.encode('manifest') }, key, unb64(sealed.data));
    return JSON.parse(dec.decode(pt));
  }

  /* ---------- files in parts ---------- */
  const chunkCount = (size) => Math.max(1, Math.ceil(size / CHUNK));
  const partCount = (chunks) => Math.ceil(chunks / PART_CHUNKS);
  const partName = (id, part) => `${id}.${part + 1}.cvd`;
  /** Where chunk i sits: { part, offset, length } in the encrypted part files. */
  function chunkPlace(size, i) {
    const chunks = chunkCount(size);
    const plainLen = i === chunks - 1 ? size - i * CHUNK : CHUNK;
    return { part: Math.floor(i / PART_CHUNKS), offset: (i % PART_CHUNKS) * (CHUNK + TAG), length: plainLen + TAG };
  }

  /**
   * Encrypt a Blob (read a chunk at a time) into part files. openPart(name) -> a writable with
   * write(Uint8Array) and close(). The SHA-256 of the original is worked out on the way.
   * onProgress(bytesDone). -> { id, size, nonce, chunks, parts: [names], sha256 }
   */
  async function encryptBlob(key, id, blob, openPart, onProgress = () => {}) {
    const size = blob.size;
    const nonce = randomBytes(8);
    const chunks = chunkCount(size);
    const sha = new Sha256();
    const parts = [];
    let w = null;
    for (let i = 0; i < chunks; i++) {
      const part = Math.floor(i / PART_CHUNKS);
      if (i % PART_CHUNKS === 0) {
        if (w) await w.close();
        parts.push(partName(id, part));
        w = await openPart(partName(id, part));
      }
      const plain = new Uint8Array(await blob.slice(i * CHUNK, Math.min(size, (i + 1) * CHUNK)).arrayBuffer());
      sha.update(plain);
      await w.write(await encryptChunk(key, id, nonce, i, i === chunks - 1, plain));
      onProgress(Math.min(size, (i + 1) * CHUNK));
    }
    if (w) await w.close();
    return { id, size, nonce: b64(nonce), chunks, parts, sha256: sha.hex() };
  }

  /** Decrypt a stored file back, a chunk at a time. readPart(name) -> Blob/File of that part.
   * Yields Uint8Array chunks in order; throws if anything was changed. */
  async function* decryptRecord(key, rec, readPart) {
    const nonce = unb64(rec.nonce);
    const blobs = {};
    for (let i = 0; i < rec.chunks; i++) {
      const p = chunkPlace(rec.size, i);
      const name = rec.parts[p.part];
      if (!blobs[name]) blobs[name] = await readPart(name);
      if (!blobs[name]) throw new Error(`A part of the package is missing (${name}).`);
      const ct = new Uint8Array(await blobs[name].slice(p.offset, p.offset + p.length).arrayBuffer());
      yield await decryptChunk(key, rec.id, nonce, i, i === rec.chunks - 1, ct);
    }
  }
  async function decryptToBlob(key, rec, readPart, type = '') {
    const out = [];
    for await (const c of decryptRecord(key, rec, readPart)) out.push(c);
    return new Blob(out, { type });
  }

  /** The package header kept in the viewer page: the key's salt and the sealed manifest. */
  async function newHeader(password, manifest, iterations = KDF_ITERATIONS) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, iterations);
    return { key, header: { format: FORMAT, version: VERSION, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) }, manifest: await sealJSON(key, manifest) } };
  }
  /** A fresh key for a package being written (before its files are encrypted). */
  async function newKey(password, iterations = KDF_ITERATIONS) {
    const salt = randomBytes(16);
    return { key: await deriveKey(password, salt, iterations), salt, iterations };
  }
  /** The header for a key from newKey, once the manifest is complete. */
  async function headerFor(k, manifest) {
    return { format: FORMAT, version: VERSION, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: k.iterations, salt: b64(k.salt) }, manifest: await sealJSON(k.key, manifest) };
  }
  /** Unlock a header with a password: { key, manifest }, or throws 'WrongPassword'. */
  async function unlock(header, password) {
    if (!header || header.format !== FORMAT) throw new Error('This is not a CaseVault discovery package.');
    if (header.version > VERSION) throw new Error('This package was made by a newer version of CaseVault.');
    const key = await deriveKey(password, unb64(header.kdf.salt), header.kdf.iterations);
    try { return { key, manifest: await openJSON(key, header.manifest) }; } catch {
      const err = new Error('Wrong password.'); err.name = 'WrongPassword'; throw err;
    }
  }

  /* ---------- names and the index ---------- */
  function fmtSize(n) {
    if (!(n >= 0)) return '';
    if (n < 1024) return `${n} B`;
    const u = ['KB', 'MB', 'GB', 'TB']; let v = n / 1024; let i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
  }
  /** The package's folder name: dates and Bates numbers only, never case details. */
  function folderName(m) {
    return `Discovery ${m.produced} (${batesRange(m.prefix, m.batesFirst, m.batesLast).replace(' to ', ' - ')})`;
  }
  /** The index as Markdown, for CaseVault's PDF writer (js/draft-pdf.js). */
  function indexMarkdown(m) {
    const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '/');
    const rows = m.items.map((it) => `| ${batesRange(m.prefix, it.batesFirst, it.batesLast)} | ${esc(it.folder ? `${it.folder} / ${it.name}` : it.name)} | ${KIND_LABEL[it.kind] || 'File'} | ${it.pages || 1} | ${fmtSize(it.size)} |`);
    return [
      `# Discovery Index`,
      '',
      `**Produced:** ${m.produced}${m.producedTo ? ` · **To:** ${esc(m.producedTo)}` : ''}${m.producedBy ? ` · **By:** ${esc(m.producedBy)}` : ''}`,
      '',
      `**Case:** ${esc(m.caseLabel || '')} · **Bates:** ${batesRange(m.prefix, m.batesFirst, m.batesLast)} · **Items:** ${m.items.length}`,
      '',
      '| Bates | File | Type | Pages | Size |',
      '|---|---|---|---|---|',
      ...rows,
      '',
      '## Fingerprints (SHA-256 of each original file)',
      '',
      ...m.items.map((it) => `- ${bates(m.prefix, it.batesFirst)}: ${it.sha256}`),
      '',
    ].join('\n');
  }

  const api = {
    FORMAT, VERSION, CHUNK, TAG, PART_CHUNKS, KDF_ITERATIONS,
    b64, unb64, cleanPrefix, bates, batesRange, allocate, extOf, kindOf, KIND_LABEL, mimeOf, Sha256,
    deriveKey, encryptChunk, decryptChunk, sealJSON, openJSON, chunkCount, partCount, partName, chunkPlace,
    encryptBlob, decryptRecord, decryptToBlob, newHeader, newKey, headerFor, unlock, fmtSize, folderName, indexMarkdown,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVDiscovery = api;
})(this);
