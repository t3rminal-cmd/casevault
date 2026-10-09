// v1.106: Search Inside Cases, Restore Cases from a Backup, and the Recently Deleted safety net
// for a restore. All data is made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/case-search.js');
const R = require('../js/backup-restore.js');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');

test('Search Inside Cases: every word in the same place, any case, a snippet around it', () => {
  const t = 'Controlled buy at 100 Example Street.\nJohn Doe arrived in a grey sedan.';
  assert.match(S.findIn(t, 'grey doe').snippet, /John Doe arrived in a grey sedan/);
  assert.strictEqual(S.findIn(t, 'grey roe'), null, 'all words must be there');
  assert.strictEqual(S.findIn(t, '   '), null);
  const long = `${'x '.repeat(200)}needle${' y'.repeat(200)}`;
  const f = S.findIn(long, 'NEEDLE', 20);
  assert.ok(f.snippet.startsWith('…') && f.snippet.endsWith('…') && f.snippet.includes('needle'));
  // Ids, paths, dates and the activity log are not searched; names and notes are.
  const c = { id: 'case-1', subject: 'Jane Roe', suspects: [{ name: 'Rick Poe', role: 'Primary' }], activity: [{ what: 'Opened as Open' }], photos: ['files/x.jpg'] };
  const txt = S.textOf(c);
  assert.match(txt, /Jane Roe/); assert.match(txt, /Rick Poe/);
  assert.doesNotMatch(txt, /case-1|Opened as Open|files\/x\.jpg/);
});

test('Restore from a backup: cases found in a picked backup folder, newest backup wins', () => {
  const f = (path) => ({ path, file: { name: path } });
  const g = R.group([
    f('CaseVault-Backup-2026-10-01-090000/vault.json'),
    f('CaseVault-Backup-2026-10-01-090000/cases/2026-EX-100/case.json'),
    f('CaseVault-Backup-2026-10-01-090000/cases/2026-EX-100/files/Photos/a.jpg'),
    f('CaseVault-Backup-2026-10-01-090000/archive/2026-EX-300/case.json'),
    f('CaseVault-Backup-2026-10-08-090000/cases/2026-EX-100/case.json'),
    f('CaseVault-Backup-2026-10-08-090000/cases/2026-EX-100/notes.md'),
    f('CaseVault-Backup-2026-10-08-090000/cases/2026-EX-100/.casevault-move.json'),
    f('CaseVault-Backup-2026-10-08-090000/cases/no-case-json/notes.md'),
    f('CaseVault-Backup-2026-10-08-090000/backups/vault-2026-10-08.json'),
  ]);
  assert.deepStrictEqual(g.map((x) => [x.id, x.location, x.backup]), [['2026-EX-100', 'active', 'CaseVault-Backup-2026-10-08-090000'], ['2026-EX-300', 'archive', 'CaseVault-Backup-2026-10-01-090000']]);
  assert.deepStrictEqual(g[0].files.map((x) => x.path).sort(), ['case.json', 'notes.md'], 'from the newest backup only, no move marker');
  // Picking CaseVault-Data itself (Windows paths) works too.
  assert.deepStrictEqual(R.group([f('CaseVault-Data\\cases\\2026-EX-1\\case.json')]).map((x) => x.id), ['2026-EX-1']);
  assert.strictEqual(R.backupWhen('CaseVault-Backup-2026-10-08-143000'), '2026-10-08 14:30');
});

test('Restore from a backup into the vault: files back, the copy in the vault goes to Recently Deleted', async () => {
  globalThis.location = new URL('http://127.0.0.1:8517/');
  load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/operation.js', 'js/vault.js');
  const Vault = get('Vault'); const FS = get('FS');
  const dataDir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dataDir);
  const c = await Vault.createCase({ title: 'Doe', number: 'EX-500', subject: 'John Doe' });
  await Vault.saveNotes(c.id, 'Changed after the backup.');
  const backupCase = { ...(await Vault.getCase(c.id)), subject: 'John Doe (backup)' };
  const blob = (t) => new Blob([t]);
  await Vault.restoreCaseFromBackup(c.id, 'active', [{ path: 'case.json', data: blob(JSON.stringify(backupCase)) }, { path: 'notes.md', data: blob('From the backup.') }, { path: '../escape.txt', data: blob('no') }]);
  assert.strictEqual(await Vault.getNotes(c.id), 'From the backup.');
  assert.strictEqual((await Vault.getCase(c.id)).subject, 'John Doe (backup)');
  assert.ok((await Vault.getCase(c.id)).activity.some((x) => /Restored from a full backup/.test(x.what)));
  assert.strictEqual(Vault.data.cases.filter((e) => e.id === c.id).length, 1, 'one index entry');
  const bin = await Vault.listDeleted();
  assert.deepStrictEqual(bin.map((x) => x.id), [c.id], 'the copy it replaced waits in Recently Deleted');
  assert.strictEqual(await FS.getDir(dataDir, 'restore-tmp').then((d) => d && FS.getDir(d, c.id)), null, 'nothing left in restore-tmp');
  await assert.rejects(Vault.restoreCaseFromBackup('../x', 'active', []), /not a case folder name/);
  Vault.close();
});

test('v1.107: exhibits put in date order across cases sharing one sequence', () => {
  const F = require('../js/report-fields.js');
  const plan = F.dateOrderPlan([
    { id: 'a', number: 'EX-500', date: '2026-09-10', opened: '2026-09-11', evidence: [{ number: 1 }, { number: 2 }] },
    { id: 'b', number: 'EX-600', date: '2026-08-01', opened: '2026-10-01', evidence: [{ number: 3 }] },
    { id: 'c', number: 'EX-700', date: '', opened: '2026-08-15', evidence: [] },
  ]);
  assert.deepStrictEqual(plan.order, ['b', 'c', 'a'], 'Date of Occurrence first, the opened date when empty');
  assert.deepStrictEqual(plan.changes, { b: [[3, 1]], c: [], a: [[1, 2], [2, 3]] });
  assert.ok(plan.changed);
  assert.ok(!F.dateOrderPlan([{ id: 'a', date: '2026-01-01', evidence: [{ number: 1 }, { number: 2 }] }]).changed, 'already in order');
  assert.deepStrictEqual(F.dateOrderPlan([{ id: 'a', date: '2026-02-01', evidence: [{ number: 10 }] }, { id: 'b', date: '2026-01-01', evidence: [{ number: 11 }] }]).changes, { b: [[11, 10]], a: [[10, 11]] }, 'starts at the lowest number in use');
});
