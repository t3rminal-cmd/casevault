// v1.149: Discovery checklist, password strength, Lock After, backup history, Test Restore.
// All data is synthetic (Doe / Roe names, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/discovery-core.js');
const L = require('../js/secure/locker-core.js');
const R = require('../js/backup-restore.js');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');

test('Discovery checklist: automatic arrest and photo checks, then the manual ones', () => {
  const none = D.checklist({});
  assert.deepStrictEqual(none.map((x) => x.key), ['signed', 'bates', 'password']);
  assert.ok(none.every((x) => !x.auto && !x.ok));
  const missing = D.checklist({ needsArrest: true, arrest: { arrestees: [{ firstName: '', lastName: '' }] }, evidence: [{ photos: ['Photos/a.jpg'] }, { photos: [] }] });
  const arrest = missing.find((x) => x.key === 'arrest');
  const photos = missing.find((x) => x.key === 'photos');
  assert.strictEqual(arrest.ok, false);
  assert.strictEqual(photos.ok, false);
  assert.match(photos.note, /1 of 2 exhibits have no photo/);
  const good = D.checklist({ arrest: { arrestees: [{ firstName: 'John', lastName: 'Doe' }] }, evidence: [{ photos: ['Photos/a.jpg'] }] });
  assert.ok(good.find((x) => x.key === 'arrest').ok);
  assert.ok(good.find((x) => x.key === 'photos').ok);
});

test('Password strength: Weak / OK / Strong', () => {
  assert.strictEqual(L.strength(''), null);
  assert.strictEqual(L.strength('abc12').level, 'weak');
  assert.strictEqual(L.strength('Password2024!').level, 'weak');
  assert.strictEqual(L.strength('examplecityroad').level, 'weak');
  assert.strictEqual(L.strength('Example-City9').level, 'ok');
  assert.strictEqual(L.strength('Roe.Example-City-77').level, 'strong');
  for (let i = 0; i < 20; i++) assert.notStrictEqual(L.strength(L.generatePassword()).level, 'weak');
});

test('Lock After: 2, 5 or 15 minutes, 5 by default', () => {
  assert.deepStrictEqual(L.AUTO_LOCK, [2, 5, 15]);
  assert.strictEqual(L.normalizeData({}).autoLock, 5);
  assert.strictEqual(L.normalizeData({ autoLock: 2 }).autoLock, 2);
  assert.strictEqual(L.normalizeData({ autoLock: '15' }).autoLock, 15);
  assert.strictEqual(L.normalizeData({ autoLock: 60 }).autoLock, 5);
});

test('Backup history keeps the last 10 full backups, newest first', async () => {
  globalThis.location = globalThis.location || new URL('http://127.0.0.1:8517/');
  load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/operation.js', 'js/vault.js');
  const Vault = get('Vault');
  let list = [];
  for (let i = 1; i <= 12; i++) list = Vault.backupHistoryWith(list, { at: `2026-01-${String(i).padStart(2, '0')}T10:00:00.000Z`, files: i, bytes: i * 100, folder: `CaseVault-Backup-${i}`, where: 'BACKUP', verified: true });
  assert.strictEqual(list.length, 10);
  assert.strictEqual(list[0].files, 12);
  assert.strictEqual(list[9].files, 3);
  // The same backup recorded twice is one row.
  assert.strictEqual(Vault.backupHistoryWith(list, list[0]).length, 10);

  const dataDir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dataDir);
  await Vault.recordHelperBackup({ folder: 'E:\\CaseVault-Backups\\CaseVault-Backup-2026-02-01-100000', files: 3, bytes: 900, drive: 'E:', at: '2026-02-01T10:00:00.000Z' });
  await Vault.recordManualBackup();
  const h = Vault.data.settings.backupHistory;
  assert.strictEqual(h.length, 2);
  assert.ok(h[0].manual); // newest first by date
  assert.strictEqual(h[1].where, 'E:');
  assert.strictEqual(h[1].folder, 'CaseVault-Backup-2026-02-01-100000');
});

test('Test Restore picks from the newest backup and says what it found', () => {
  const mk = (p) => ({ path: p, file: { name: p } });
  const files = [
    'B/CaseVault-Backup-2026-01-01-100000/vault.json', 'B/CaseVault-Backup-2026-01-01-100000/cases/EX-1/case.json',
    'B/CaseVault-Backup-2026-02-01-100000/vault.json', 'B/CaseVault-Backup-2026-02-01-100000/backup-info.json',
    'B/CaseVault-Backup-2026-02-01-100000/cases/EX-1/case.json', 'B/CaseVault-Backup-2026-02-01-100000/cases/EX-1/notes.md',
  ].map(mk);
  const p = R.testPick(files, 2, () => 0);
  assert.strictEqual(p.backup, 'CaseVault-Backup-2026-02-01-100000');
  assert.strictEqual(p.files.length, 3);
  assert.ok(p.info);
  assert.strictEqual(p.sample[0].rel, 'vault.json');
  assert.strictEqual(p.sample.length, 2);
  assert.strictEqual(R.testPick([], 5), null);
  assert.ok(R.testVerdict({ read: 2, same: 1, changed: 1, count: 3, expected: 3 }).ok);
  const bad = R.testVerdict({ read: 1, unreadable: 1, same: 1, count: 2, expected: 3 });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.lines.some((l) => /could not be read/.test(l)));
  assert.ok(bad.lines.some((l) => /made 3 files, the folder has 2/.test(l)));
});
