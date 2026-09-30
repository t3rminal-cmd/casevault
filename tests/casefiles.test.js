// Tests for the case folder layout (document-type folders) and the 2026-<CaseNo> naming convention.
// All data is made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const CF = require('../js/casefiles.js');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');

const C = (number, opened = '2026-03-14') => ({ number, dates: { opened } });

test('the document folders, in order, with Recordings/Video and /Audio; Affidavits, Warrants Signed and Subpoena Sent are legacy', () => {
  assert.deepStrictEqual(CF.FOLDERS, ['Case Overview', 'Case Initiation', 'Warrant Drafts', 'Warrant Final',
    'Arrest Report', 'Supplementary Report', 'Case Report', 'Deconfliction', 'Drug Exhibits', 'Other Exhibits', 'Email', 'Ops Plan',
    'Subpoena Drafts', 'Subpoena Response', 'Subject Information', 'Recordings', 'Recordings/Video', 'Recordings/Audio',
    'Vehicle Information', 'Maps', 'Case Closing', 'Other']);
  for (const [old, into] of [['Affidavits', 'Warrant Final'], ['Affidavit Drafts', 'Warrant Drafts'], ['Affidavit Final', 'Warrant Final'], ['Warrants Signed', 'Warrant Final'], ['Subpoena Sent', 'Subpoena Response']]) {
    assert.ok(CF.isCategory(old) && !CF.FOLDERS.includes(old), `${old} is still read`);
    assert.strictEqual(CF.byFolder(old).mergeInto, into);
  }
  assert.deepStrictEqual(CF.childrenOf('Recordings'), ['Recordings/Video', 'Recordings/Audio']);
  assert.deepStrictEqual([CF.parentOf('Recordings/Audio'), CF.parentOf('Maps'), CF.shortName('Recordings/Video')], ['Recordings', null, 'Video']);
});

test('case prefix: <year opened>-<case number>', () => {
  assert.strictEqual(CF.casePrefix(C('00123')), '2026-00123');
  assert.strictEqual(CF.casePrefix(C('00123', '2025-12-31')), '2025-00123');
  assert.strictEqual(CF.casePrefix(C('2026-00123')), '2026-00123', 'the year is not doubled');
  assert.strictEqual(CF.casePrefix(C('NC 45/7')), '2026-NC-45-7', 'Windows-safe');
  assert.strictEqual(CF.casePrefix(C('')), null);
  assert.strictEqual(CF.caseFolderName(C('')), null);
});

test('file names: Year-Case-FileName (v1.18)', () => {
  assert.strictEqual(CF.fileName(C('00123'), 'Arrest Report', 'scan0001.PDF'), '2026-00123-scan0001.pdf');
  assert.strictEqual(CF.fileName(C('00123'), 'Supplementary Report', 'x.docx', 'Det. Doe'), '2026-00123-Det. Doe.docx', 'a description replaces the file name');
  assert.strictEqual(CF.fileName(C('00123'), 'Other', '2026-00123 Arrest Report.pdf'), '2026-00123-Arrest Report.pdf', 'the old prefix is not repeated');
  assert.strictEqual(CF.fileName(C('00123'), 'Other', '2026-00123-bank records.pdf'), '2026-00123-bank records.pdf');
  assert.strictEqual(CF.fileName(C('00123'), 'Recordings/Video', 'IMG_2.MOV'), '2026-00123-IMG_2.mov');
  assert.strictEqual(CF.fileName(C(''), 'Maps', 'area.png'), '2026-NOCASENO-area.png');
  assert.ok(CF.followsConvention(C('00123'), 'Arrest Report', '2026-00123-scan.pdf'));
  assert.ok(CF.followsConvention(C('00123'), 'Arrest Report', '2026-00123 Arrest Report (2).pdf'));
  assert.ok(!CF.followsConvention(C('00123'), 'Arrest Report', 'scan.pdf'));
  assert.strictEqual(CF.prefixInName('2026-00999 Case Report.pdf'), '2026-00999');
});

test('document type is guessed from the original file name', () => {
  const cases = {
    'PC Affidavit draft.docx': 'Warrant Drafts', 'Affidavit signed.pdf': 'Warrant Final', 'search warrant signed.pdf': 'Warrant Final',
    'warrant draft v2.docx': 'Warrant Drafts', 'Search Warrant.pdf': 'Warrant Final', 'subpoena draft.docx': 'Subpoena Drafts',
    'Subpoena to Example Bank.pdf': 'Subpoena Response', 'Case overview.docx': 'Case Overview', 'synopsis.pdf': 'Case Overview', 'Case initiation memo.pdf': 'Case Initiation', 'case closing report.pdf': 'Case Closing',
    'jail call 3.wav': 'Recordings/Audio', 'Arrest report - Doe.pdf': 'Arrest Report', 'Supp 2.pdf': 'Supplementary Report',
    'Supplemental Report.pdf': 'Supplementary Report', 'incident report.pdf': 'Case Report', 'deconfliction-results.pdf': 'Deconfliction',
    'Lab results exhibit 4.pdf': 'Drug Exhibits', 'FW message.eml': 'Email', 'Ops Plan v2.docx': 'Ops Plan',
    'Subpoena return bank.pdf': 'Subpoena Response', 'subject photo.jpg': 'Subject Information', 'interview.mp3': 'Recordings/Audio',
    'bodycam.mp4': 'Recordings/Video', 'interview notes recording': 'Recordings', 'vehicle registration.pdf': 'Vehicle Information', 'area map.png': 'Maps', 'random.txt': 'Other',
  };
  for (const [name, want] of Object.entries(cases)) assert.strictEqual(CF.guessFolder(name), want, name);
});

test('paths split into folder and file name; files from older versions are unsorted', () => {
  assert.deepStrictEqual(CF.splitPath('Arrest Report/2026-1 Arrest Report.pdf'), { folder: 'Arrest Report', base: '2026-1 Arrest Report.pdf' });
  assert.deepStrictEqual(CF.splitPath('old.pdf'), { folder: '', base: 'old.pdf' });
  assert.deepStrictEqual(CF.splitPath('Recordings/Video/2026-1 Video Recording.mp4'), { folder: 'Recordings/Video', base: '2026-1 Video Recording.mp4' });
  assert.strictEqual(CF.joinPath('', 'old.pdf'), 'old.pdf');
});

/* ---------- with the vault ---------- */

let App;
function app() {
  if (!App) {
    globalThis.location = new URL('http://127.0.0.1:8517/');
    load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/vault.js');
    App = { Vault: get('Vault'), FS: get('FS') };
  }
  return App;
}

async function freshVault() {
  const { Vault } = app();
  const dir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dir);
  return { Vault, dir };
}

test('a new case is named 2026-<CaseNo>, with all fourteen document folders', async () => {
  const { Vault, dir } = await freshVault();
  const a = await Vault.createCase({ title: 'A', number: '00123', opened: '2026-03-14' });
  const b = await Vault.createCase({ title: 'B', number: '00123', opened: '2026-05-01' });
  const n = await Vault.createCase({ title: 'No number' });
  assert.strictEqual(a.id, '2026-00123');
  assert.strictEqual(b.id, '2026-00123-2', 'a taken name gets -2');
  assert.match(n.id, /^\d{8}-[0-9a-z]{6}$/);
  const files = await (await (await dir.getDirectoryHandle('cases')).getDirectoryHandle('2026-00123')).getDirectoryHandle('files');
  const names = []; for await (const k of files.keys()) names.push(k);
  assert.deepStrictEqual(names.sort(), CF.FOLDERS.filter((f) => !f.includes('/')).sort());
  const rec = []; for await (const k of (await files.getDirectoryHandle('Recordings')).keys()) rec.push(k);
  assert.deepStrictEqual(rec.sort(), ['Audio', 'Video']);
});

test('files are saved into their folder and named by the convention; moving renames them', async () => {
  const { Vault } = await freshVault();
  const c = await Vault.createCase({ title: 'T', number: '00777', opened: '2026-09-01' });
  const p1 = await Vault.addFile(c.id, new File(['one'], 'scan.pdf'), { folder: 'Arrest Report' });
  const p2 = await Vault.addFile(c.id, new File(['two'], 'scan2.pdf'), { folder: 'Arrest Report' });
  const p3 = await Vault.addFile(c.id, new File(['three'], 'call.mp3'), { folder: 'Recordings', description: 'Jail call 1' });
  const p4 = await Vault.addFile(c.id, new File(['legacy'], 'old name.txt'));
  assert.strictEqual(p1, 'Arrest Report/2026-00777-scan.pdf');
  assert.strictEqual(p2, 'Arrest Report/2026-00777-scan2.pdf');
  assert.strictEqual(p3, 'Recordings/2026-00777-Jail call 1.mp3');
  assert.strictEqual(p4, 'old name.txt', 'no folder: kept as-is, unsorted');

  const list = await Vault.listFiles(c.id);
  assert.deepStrictEqual(list.map((f) => f.name), [p1, p2, p3, p4], 'ordered by folder, unsorted last');
  assert.strictEqual(await (await Vault.readFile(c.id, p3)).text(), 'three');

  const moved = await Vault.moveFile(c.id, p4, 'Case Report');
  assert.strictEqual(moved, 'Case Report/2026-00777-old name.txt');
  assert.strictEqual(await (await Vault.readFile(c.id, moved)).text(), 'legacy');
  assert.strictEqual(await Vault.readFile(c.id, p4), null, 'the original is gone');
  await Vault.deleteFile(c.id, p2);
  assert.ok(!(await Vault.listFiles(c.id)).some((f) => f.name === p2));
  await assert.rejects(Vault.addFile(c.id, new File(['x'], 'x.txt'), { folder: '../cases' }), /Unknown document folder/);
});

test('an older case folder is renamed to 2026-<CaseNo>, with every file verified', async () => {
  const { Vault, dir } = await freshVault();
  const c = await Vault.createCase({ title: 'Old', opened: '2026-02-02' }); // no number yet: dated id
  await Vault.addFile(c.id, new File(['r'], 'r.pdf'), { folder: 'Case Report' });
  await Vault.saveNotes(c.id, 'notes');
  c.number = '555';
  await Vault.saveCase(c);
  assert.strictEqual(Vault.conventionalId(await Vault.getCase(c.id)), '2026-555');
  const renamed = await Vault.renameCaseFolder(c.id);
  assert.strictEqual(renamed.id, '2026-555');
  assert.deepStrictEqual(renamed.previousIds, [c.id]);
  assert.strictEqual(await Vault.getNotes('2026-555'), 'notes');
  assert.strictEqual((await Vault.listFiles('2026-555')).length, 1);
  assert.ok(!Vault.data.cases.some((e) => e.id === c.id));
  const cases = await dir.getDirectoryHandle('cases');
  await assert.rejects(cases.getDirectoryHandle(c.id), /not found/);
  assert.strictEqual(Vault.conventionalId(await Vault.getCase('2026-555')), null, 'already follows the convention');
});

test('an interrupted rename is finished or undone on the next open', async () => {
  const { Vault, dir } = await freshVault();
  const { FS } = app();
  const a = await Vault.createCase({ title: 'A', opened: '2026-02-02' });
  const cases = await dir.getDirectoryHandle('cases');
  // A copy that never finished: dropped, the original kept.
  const partial = await cases.getDirectoryHandle('2026-1', { create: true });
  await FS.writeJSON(partial, Vault.RENAME_MARKER, { from: a.id, state: 'copying' });
  // A copy that finished before the original could be removed: the original is removed.
  const b = await Vault.createCase({ title: 'B', opened: '2026-02-02' });
  const done = await cases.getDirectoryHandle('2026-2', { create: true });
  await FS.writeJSON(done, 'case.json', { title: 'B', id: '2026-2', dates: {} });
  await FS.writeJSON(done, Vault.RENAME_MARKER, { from: b.id, state: 'copied' });
  await Vault.rebuildIndex();
  const ids = Vault.data.cases.map((x) => x.id).sort();
  assert.deepStrictEqual(ids, ['2026-2', a.id].sort());
});

test('Other Exhibits: its own folder, named "Exhibit", guessed from evidence words (v1.9.2)', () => {
  assert.strictEqual(CF.fileName(C('00123'), 'Other Exhibits', 'knife.jpg', 'kitchen knife'), '2026-00123-kitchen knife.jpg');
  assert.strictEqual(CF.guessFolder('evidence photo 3.jpg'), 'Other Exhibits');
  assert.strictEqual(CF.guessFolder('firearm trace.pdf'), 'Other Exhibits');
  assert.strictEqual(CF.guessFolder('drug exhibits log.xlsx'), 'Drug Exhibits');
  assert.strictEqual(CF.guessFolder('Lab results exhibit 4.pdf'), 'Drug Exhibits');
});

test('sub-folders: files in Recordings/Video are listed, moved and read back', async () => {
  const { Vault } = await freshVault();
  const c = await Vault.createCase({ title: 'R', number: '00888', opened: '2026-09-01' });
  const v = await Vault.addFile(c.id, new File(['vid'], 'cam.mp4'), { folder: 'Recordings/Video' });
  assert.strictEqual(v, 'Recordings/Video/2026-00888-cam.mp4');
  const a = await Vault.addFile(c.id, new File(['aud'], 'call.mp3'), { folder: 'Recordings' });
  const moved = await Vault.moveFile(c.id, a, 'Recordings/Audio');
  assert.strictEqual(moved, 'Recordings/Audio/2026-00888-call.mp3');
  const list = await Vault.listFiles(c.id);
  assert.deepStrictEqual(list.map((f) => [f.folder, f.base]), [['Recordings/Video', '2026-00888-cam.mp4'], ['Recordings/Audio', '2026-00888-call.mp3']]);
  assert.strictEqual(await (await Vault.readFile(c.id, v)).text(), 'vid');
});
