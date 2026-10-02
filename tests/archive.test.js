// Tests for archiving, restoring and deleting cases, in both storage modes. All data is made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');
const mockHelper = require('./helpers/mock-helper.js');

let App;
function app() {
  if (!App) {
    globalThis.location = new URL('http://127.0.0.1:8517/'); // helper-fs.js reads this at load time
    load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/operation.js', 'js/vault.js');
    App = { Vault: get('Vault'), HelperFS: get('HelperFS'), FS: get('FS') };
  }
  return App;
}

// A binary "photo" bigger than one verify chunk would be slow here; a few KB of every byte value will do.
const BYTES = new Uint8Array(5000).map((_, i) => (i * 7) % 256);

async function makeCase(Vault) {
  const c = await Vault.createCase({ title: 'Test v. Example', number: 'TEST-0001', client: 'Example Unit', status: 'Pending' });
  await Vault.saveNotes(c.id, '# Notes\n\nSynthetic note for the archive test.');
  await Vault.saveTimeline(c.id, { events: [{ id: 'e1', date: '2026-03-14', kind: 'deadline', title: 'Example deadline' }] });
  await Vault.addFile(c.id, new File([BYTES], 'photo.bin'));
  await Vault.addFile(c.id, new File(['Officer Alex Sample arrived at 21:40.'], 'report.txt'));
  await Vault.saveDraft(c.id, 'affidavit', { title: 'Affidavit', type: 'affidavit' }, 'Body text.');
  await Vault.saveCheck(c.id, '2026-03-15-check.json', { flags: [{ id: 'f1', severity: 'High', status: 'open' }], created: '2026-03-15T10:00:00Z' });
  return c;
}

// Where is the case, and what is in it? Works for both storage modes through the same FS layer.
async function folderSnapshot(FS, dataDir, folder, id) {
  const parent = await FS.getDir(dataDir, folder);
  const dir = parent && await FS.getDir(parent, id);
  if (!dir) return null;
  const out = {};
  const walk = async (d, prefix) => {
    for (const e of await FS.list(d)) {
      if (e.kind === 'directory') await walk(e.handle, `${prefix}${e.name}/`);
      else out[`${prefix}${e.name}`] = new Uint8Array(await (await e.handle.getFile()).arrayBuffer()).join(',');
    }
  };
  await walk(dir, '');
  return out;
}

async function roundTrip(Vault, FS, rootHandle) {
  const dataDir = await Vault.create(rootHandle);
  await Vault.load(dataDir);
  const c = await makeCase(Vault);
  const before = await folderSnapshot(FS, dataDir, 'cases', c.id);
  assert.ok(before['files/photo.bin'] && before['drafts/affidavit.md'] && before['checks/2026-03-15-check.json']);

  // Archive: moved, every file identical, status and dates set, index says archive.
  const moved = [];
  const archived = await Vault.archiveCase(c.id, (n, name) => moved.push(name));
  assert.strictEqual(archived.status, 'Archived');
  assert.strictEqual(archived.statusBeforeArchive, 'Pending');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(archived.dates.closed), 'closed date filled in');
  assert.strictEqual(await folderSnapshot(FS, dataDir, 'cases', c.id), null, 'original removed');
  const after = await folderSnapshot(FS, dataDir, 'archive', c.id);
  for (const [name, bytes] of Object.entries(before)) {
    if (name === 'case.json') continue; // updated on purpose
    assert.strictEqual(after[name], bytes, `${name} copied exactly`);
  }
  assert.ok(!Object.keys(after).includes(Vault.MOVE_MARKER), 'no move marker left behind');
  assert.ok(moved.includes('photo.bin'));
  assert.strictEqual(Vault.data.cases.find((e) => e.id === c.id).location, 'archive');
  assert.ok(Vault.isArchived(c.id));

  // Archived cases read normally...
  assert.match(await Vault.getNotes(c.id), /Synthetic note/);
  assert.strictEqual((await Vault.getTimeline(c.id)).events.length, 1);
  assert.deepStrictEqual((await Vault.listFiles(c.id)).map((f) => f.name), ['photo.bin', 'report.txt']);
  assert.strictEqual((await Vault.readDraft(c.id, 'affidavit')).body, 'Body text.');
  assert.strictEqual((await Vault.listChecks(c.id)).length, 1);
  assert.strictEqual(await Vault.readTextCache(c.id, 'report.txt', 1, 1), null);
  await Vault.writeTextCache(c.id, 'report.txt', 1, 1, { paragraphs: [] }); // quietly skipped
  // ...but every write is refused.
  const ro = { name: 'ReadOnlyError' };
  await assert.rejects(Vault.saveNotes(c.id, 'changed'), ro);
  await assert.rejects(Vault.saveCase({ ...archived, title: 'changed' }), ro);
  await assert.rejects(Vault.saveTimeline(c.id, { events: [] }), ro);
  await assert.rejects(Vault.addFile(c.id, new File(['x'], 'x.txt')), ro);
  await assert.rejects(Vault.deleteFile(c.id, 'report.txt'), ro);
  await assert.rejects(Vault.saveDraft(c.id, 'affidavit', {}, 'changed'), ro);
  await assert.rejects(Vault.saveCheck(c.id, '2026-03-15-check.json', {}), ro);
  await assert.rejects(Vault.deleteCheck(c.id, '2026-03-15-check.json'), ro);
  assert.strictEqual(await folderSnapshot(FS, dataDir, 'cases', c.id), null, 'no stray folder was created in cases/');

  // Rebuild (e.g. vault.json lost) finds it in archive/.
  Vault.data.cases.length = 0;
  await Vault.rebuildIndex();
  const entry = Vault.data.cases.find((e) => e.id === c.id);
  assert.deepStrictEqual([entry.location, entry.status, entry.title], ['archive', 'Archived', 'Test v. Example']);

  // Restore: back in cases/, previous status, writable again.
  const restored = await Vault.restoreCase(c.id);
  assert.strictEqual(restored.status, 'Pending');
  assert.strictEqual(restored.statusBeforeArchive, undefined);
  assert.strictEqual(await folderSnapshot(FS, dataDir, 'archive', c.id), null);
  const back = await folderSnapshot(FS, dataDir, 'cases', c.id);
  for (const [name, bytes] of Object.entries(before)) if (name !== 'case.json') assert.strictEqual(back[name], bytes, `${name} restored exactly`);
  assert.strictEqual(Vault.data.cases.find((e) => e.id === c.id).location, 'active');
  await Vault.saveNotes(c.id, 'Writable again.');
  assert.strictEqual(await Vault.getNotes(c.id), 'Writable again.');

  // Deleting an archived case removes it for good.
  await Vault.archiveCase(c.id);
  await Vault.deleteCase(c.id);
  assert.strictEqual(await folderSnapshot(FS, dataDir, 'archive', c.id), null);
  assert.ok(!Vault.data.cases.some((e) => e.id === c.id));
  Vault.close();
}

test('archive and restore round trip: direct mode (Chrome/Edge)', async () => {
  const { Vault, FS } = app();
  await roundTrip(Vault, FS, new MemDirectoryHandle('V'));
});

test('archive and restore round trip: helper mode (Firefox, through the helper API)', async (t) => {
  const { Vault, FS, HelperFS } = app();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-archive-'));
  fs.mkdirSync(path.join(dir, 'CaseVault-Data'));
  const server = await mockHelper.start(path.join(dir, 'CaseVault-Data'));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  globalThis.location = new URL(`http://127.0.0.1:${server.address().port}/`);
  const info = await HelperFS.info();
  await roundTrip(Vault, FS, HelperFS.root(info.root));
  // On disk: nothing left of the case anywhere.
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'CaseVault-Data', 'archive')), []);
});

test('a move that fails part-way leaves the original case intact and active', async () => {
  const { Vault, FS } = app();
  const dataDir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dataDir);
  const c = await makeCase(Vault);
  const before = await folderSnapshot(FS, dataDir, 'cases', c.id);
  // The SSD "fails" while the third file is being copied into archive/.
  const realWrite = FS.writeData;
  let writes = 0;
  FS.writeData = async (dir, name, data) => {
    if (dir.name !== c.id && ++writes === 3) throw new DOMException('The device is not ready.', 'NotReadableError');
    return realWrite(dir, name, data);
  };
  try {
    await assert.rejects(Vault.archiveCase(c.id), { name: 'NotReadableError' });
  } finally {
    FS.writeData = realWrite;
  }
  assert.deepStrictEqual(await folderSnapshot(FS, dataDir, 'cases', c.id), before, 'original untouched, case.json included');
  assert.strictEqual(await folderSnapshot(FS, dataDir, 'archive', c.id), null, 'partial copy removed');
  assert.ok(!Vault.isArchived(c.id));
  assert.strictEqual((await Vault.getCase(c.id)).status, 'Pending');
  await Vault.saveNotes(c.id, 'Still writable.');
  Vault.close();
});

test('a copy that does not match the original stops the move', async () => {
  const { Vault, FS } = app();
  const dataDir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dataDir);
  const c = await makeCase(Vault);
  const realWrite = FS.writeData;
  FS.writeData = async (dir, name, data) => realWrite(dir, name, name === 'photo.bin' && dir.name === 'files' && (await FS.getDir(dataDir, 'archive')) ? new Blob([BYTES.slice(1)]) : data);
  try {
    await assert.rejects(Vault.archiveCase(c.id), { name: 'MoveVerifyError' });
  } finally {
    FS.writeData = realWrite;
  }
  assert.ok((await folderSnapshot(FS, dataDir, 'cases', c.id))['files/photo.bin']);
  assert.strictEqual(await folderSnapshot(FS, dataDir, 'archive', c.id), null);
  Vault.close();
});

test('interrupted after a verified copy: the next rebuild finishes the move', async () => {
  const { Vault, FS } = app();
  const dataDir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dataDir);
  const c = await makeCase(Vault);
  // Removing the original fails (the SSD was unplugged at that moment).
  const realRemove = FS.remove;
  FS.remove = async (dir, name, rec) => {
    if (dir.name === 'cases' && name === c.id) throw new DOMException('gone', 'NotReadableError');
    return realRemove(dir, name, rec);
  };
  try {
    await assert.rejects(Vault.archiveCase(c.id));
  } finally {
    FS.remove = realRemove;
  }
  const archived = await folderSnapshot(FS, dataDir, 'archive', c.id);
  assert.ok(archived[Vault.MOVE_MARKER], 'the verified copy carries the marker');
  assert.ok(await folderSnapshot(FS, dataDir, 'cases', c.id), 'the original is still there');
  await Vault.rebuildIndex();
  assert.strictEqual(await folderSnapshot(FS, dataDir, 'cases', c.id), null, 'original removed by the rebuild');
  assert.ok(!(await folderSnapshot(FS, dataDir, 'archive', c.id))[Vault.MOVE_MARKER], 'marker cleared');
  assert.strictEqual(Vault.data.cases.filter((e) => e.id === c.id).length, 1);
  assert.strictEqual(Vault.data.cases.find((e) => e.id === c.id).location, 'archive');
  Vault.close();
});

test('a leftover incomplete copy (no marker) is ignored in favour of the original', async () => {
  const { Vault, FS } = app();
  const dataDir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dataDir);
  const c = await makeCase(Vault);
  const partial = await FS.getDir(await FS.getDir(dataDir, 'archive', true), c.id, true);
  await FS.writeText(partial, 'notes.md', 'half');
  await Vault.rebuildIndex();
  assert.strictEqual(Vault.data.cases.find((e) => e.id === c.id).location, 'active');
  assert.match(await Vault.getNotes(c.id), /Synthetic note/);
  // Archiving later replaces the leftover.
  await Vault.archiveCase(c.id);
  assert.match(await Vault.getNotes(c.id), /Synthetic note/);
  Vault.close();
});

test('an archived case with no drafts, checks or files still opens (nothing is created in it)', async () => {
  const { Vault, FS } = app();
  const dataDir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dataDir);
  const c = await Vault.createCase({ title: 'Bare example' });
  const caseFolder = await FS.getDir(await FS.getDir(dataDir, 'cases'), c.id);
  await FS.remove(caseFolder, 'files', true); // as a case from an old version might be
  await Vault.archiveCase(c.id);
  assert.deepStrictEqual(await Vault.listChecks(c.id), []);
  assert.deepStrictEqual(await Vault.listDrafts(c.id), []);
  assert.deepStrictEqual(await Vault.listFiles(c.id), []);
  assert.strictEqual(await Vault.readDraft(c.id, 'none'), null);
  const snap = await folderSnapshot(FS, dataDir, 'archive', c.id);
  assert.deepStrictEqual(Object.keys(snap).sort(), ['case.json', 'notes.md', 'timeline.json'], 'no folders were added to the archived case');
  Vault.close();
});

test('delete confirmation needs the case number typed, or the title when there is no number', () => {
  const { Vault } = app();
  const numbered = { title: 'Test v. Example', number: 'TEST-0001' };
  const untitled = { title: 'Example matter', number: '' };
  assert.strictEqual(Vault.deleteConfirmText(numbered), 'TEST-0001');
  assert.strictEqual(Vault.deleteConfirmText(untitled), 'Example matter');
  assert.ok(Vault.deleteConfirmMatches(numbered, 'TEST-0001'));
  assert.ok(Vault.deleteConfirmMatches(numbered, '  TEST-0001 '));
  assert.ok(!Vault.deleteConfirmMatches(numbered, 'test-0001'), 'exact, case-sensitive');
  assert.ok(!Vault.deleteConfirmMatches(numbered, 'DELETE'));
  assert.ok(!Vault.deleteConfirmMatches(numbered, ''));
  assert.ok(Vault.deleteConfirmMatches(untitled, 'Example matter'));
  assert.ok(!Vault.deleteConfirmMatches({ title: '', number: '' }, ''), 'never an empty match');
});
