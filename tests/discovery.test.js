// v1.49 Discovery packages: Bates numbers, the streaming SHA-256, encryption in chunks and parts,
// the sealed manifest. Everything here is made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const nodeCrypto = require('node:crypto');
const D = require('../js/discovery-core.js');

test('Bates numbers, ranges and allocation (one per page, one per other file)', () => {
  assert.strictEqual(D.bates('disc', 7), 'DISC-000007');
  assert.strictEqual(D.cleanPrefix(' ex 1/ '), 'EX1');
  assert.strictEqual(D.cleanPrefix(''), 'DISC');
  assert.strictEqual(D.batesRange('DISC', 3, 3), 'DISC-000003');
  assert.strictEqual(D.batesRange('DISC', 3, 9), 'DISC-000003 to DISC-000009');
  const out = D.allocate([{ name: 'a.pdf', pages: 3 }, { name: 'b.mp4' }, { name: 'c.pdf', pages: 2 }], 41);
  assert.deepStrictEqual(out.map((x) => [x.batesFirst, x.batesLast]), [[41, 43], [44, 44], [45, 46]]);
});

test('what each file is', () => {
  const k = (n) => D.kindOf(n);
  assert.deepStrictEqual(['a.PDF', 'b.jpg', 'c.mp4', 'd.mov', 'e.mp3', 'f.docx', 'g.xlsx', 'h.csv', 'i.txt', 'j.avi', 'k.dav', 'l.zip'].map(k),
    ['pdf', 'image', 'video', 'video', 'audio', 'doc', 'sheet', 'sheet', 'text', 'media', 'media', 'other']);
  assert.strictEqual(D.mimeOf('x.mp4'), 'video/mp4');
});

test('SHA-256 a piece at a time matches the whole-buffer hash', () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 1000, 200000]) {
    const data = nodeCrypto.randomBytes(size);
    const sha = new D.Sha256();
    for (let i = 0; i < size; i += 777) sha.update(new Uint8Array(data.subarray(i, i + 777)));
    if (!size) sha.update(new Uint8Array(0));
    assert.strictEqual(sha.hex(), nodeCrypto.createHash('sha256').update(data).digest('hex'), `size ${size}`);
  }
});

// A small in-memory "folder" for the part files.
function memParts() {
  const files = {};
  return {
    files,
    open: async (name) => { const bufs = []; return { write: async (u8) => { bufs.push(Buffer.from(u8)); }, close: async () => { files[name] = new Blob([Buffer.concat(bufs)]); } }; },
    read: async (name) => files[name],
  };
}

test('a file encrypts in chunks and parts and comes back exactly; the hash is of the original', async () => {
  const key = await D.deriveKey('correct horse battery staple', new Uint8Array(16), 1000);
  const size = D.CHUNK * 2 + 12345; // three chunks
  const data = nodeCrypto.randomBytes(size);
  const mem = memParts();
  const rec = await D.encryptBlob(key, 'f0001', new Blob([data]), mem.open);
  assert.strictEqual(rec.chunks, 3);
  assert.deepStrictEqual(rec.parts, ['f0001.1.cvd']);
  assert.strictEqual(rec.sha256, nodeCrypto.createHash('sha256').update(data).digest('hex'));
  assert.strictEqual(mem.files['f0001.1.cvd'].size, size + 3 * D.TAG);
  assert.ok(!Buffer.from(await mem.files['f0001.1.cvd'].arrayBuffer()).includes(data.subarray(0, 64)), 'nothing in the clear');
  const back = Buffer.from(await (await D.decryptToBlob(key, rec, mem.read)).arrayBuffer());
  assert.ok(back.equals(data));
  // An empty file is one (empty) chunk.
  const empty = await D.encryptBlob(key, 'f0002', new Blob([]), mem.open);
  assert.strictEqual((await D.decryptToBlob(key, empty, mem.read)).size, 0);
});

test('big files split into part files (FAT32-safe); chunk places line up', async () => {
  assert.strictEqual(D.partCount(D.PART_CHUNKS), 1);
  assert.strictEqual(D.partCount(D.PART_CHUNKS + 1), 2);
  const size = D.CHUNK * (D.PART_CHUNKS + 1) + 10;
  assert.deepStrictEqual(D.chunkPlace(size, D.PART_CHUNKS), { part: 1, offset: 0, length: D.CHUNK + D.TAG });
  assert.deepStrictEqual(D.chunkPlace(size, D.PART_CHUNKS + 1), { part: 1, offset: D.CHUNK + D.TAG, length: 10 + D.TAG });
  assert.ok(D.PART_CHUNKS * (D.CHUNK + D.TAG) < 4 * 1024 ** 3, 'a part stays under the FAT32 4 GB limit');
});

test('tampering, a swapped chunk or a cut-off file is refused', async () => {
  const key = await D.deriveKey('pw-123456', new Uint8Array(16), 1000);
  const data = nodeCrypto.randomBytes(D.CHUNK + 100);
  const mem = memParts();
  const rec = await D.encryptBlob(key, 'f0009', new Blob([data]), mem.open);
  const buf = Buffer.from(await mem.files[rec.parts[0]].arrayBuffer());
  buf[10] ^= 1;
  mem.files[rec.parts[0]] = new Blob([buf]);
  await assert.rejects(D.decryptToBlob(key, rec, mem.read));
  // Claiming the file ends after its first chunk fails too (the last-chunk flag is bound in).
  buf[10] ^= 1;
  mem.files[rec.parts[0]] = new Blob([buf]);
  await assert.rejects(D.decryptToBlob(key, { ...rec, chunks: 1, size: D.CHUNK }, mem.read));
  // Another file's id can't be used for these chunks.
  await assert.rejects(D.decryptToBlob(key, { ...rec, id: 'f0010' }, mem.read));
});

test('the manifest is sealed: the right password opens it, a wrong one says so', async () => {
  const manifest = { produced: '2026-10-02', prefix: 'DISC', batesFirst: 1, batesLast: 4, caseLabel: 'Example v. Doe', items: [{ id: 'f0001', name: 'Synthetic report.pdf', kind: 'pdf', pages: 3, size: 1000, sha256: 'ab'.repeat(32), batesFirst: 1, batesLast: 3 }, { id: 'f0002', name: 'clip.mp4', kind: 'video', size: 2000, sha256: 'cd'.repeat(32), batesFirst: 4, batesLast: 4 }] };
  const { header } = await D.newHeader('Sample-Pass-2026', manifest, 1000);
  assert.ok(!JSON.stringify(header).includes('Doe'), 'no case details in the clear');
  const { manifest: m } = await D.unlock(header, 'Sample-Pass-2026');
  assert.deepStrictEqual(m, manifest);
  await assert.rejects(D.unlock(header, 'wrong'), { name: 'WrongPassword' });
  await assert.rejects(D.unlock({ format: 'other' }, 'x'), /not a CaseVault discovery package/);
  assert.strictEqual(D.folderName(m), 'Discovery 2026-10-02 (DISC-000001 - DISC-000004)');
  const md = D.indexMarkdown(m);
  assert.match(md, /\| DISC-000001 to DISC-000003 \| Synthetic report\.pdf \| PDF \| 3 \|/);
  assert.match(md, /DISC-000004: cdcd/);
});
