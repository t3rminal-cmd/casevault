// v1.102: Back Up Everything to a shared folder on another PC (helper 1.14).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ps = read('tools/casevault-helper/casevault-helper.ps1');
const app = read('js/app.js');

test('v1.102: helper 1.14 keeps a list of network folders in the vault and only writes to listed ones', () => {
  assert.match(ps, /\$HelperVersion = '1\.(1[4-9]|[2-9]\d)\.\d+'/);
  assert.match(ps, /backup-network\.json/, 'the list lives in CaseVault-Data, not on the PC');
  assert.match(ps, /function Test-NetworkFolderPath/);
  assert.match(ps, /\$op -eq 'backup-network'/);
  assert.match(ps, /casevault-write-test-/, 'a write test before a folder is added');
  assert.match(ps, /-not \$target\.Reachable/, 'an unreachable folder is never backed up to');
  assert.match(ps, /Where-Object \{ \$_\.Path -ieq \$want \}/, 'backup-start still only takes a listed drive');
});

test('v1.102: the app asks once per folder that the other PC is encrypted', () => {
  assert.match(app, /Add Backup Folder/);
  assert.match(app, /Backing Up to Another PC/);
  assert.match(app, /networkBackupOk/);
  assert.match(read('js/helper-fs.js'), /addNetworkFolder[\s\S]*removeNetworkFolder/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'BACKUP-TO-ANOTHER-PC.md')));
});

test('v1.103: helper 1.15 also takes a folder on this PC (C:\\CaseVault-Backups), never one on the SSD', () => {
  assert.match(ps, /\$HelperVersion = '1\.15\.0'/);
  assert.match(ps, /function Get-BackupFolderProblem/, 'refuses a folder inside the vault or on the CASEVAULT drive');
  assert.match(ps, /CreateDirectory\(\$p\)/, 'a folder on this PC is made when it is added');
  assert.match(ps, /\$leaf -ieq 'CaseVault-Backups'/, 'a folder named CaseVault-Backups holds the backups itself');
  assert.match(ps, /BitLocker = \(Get-BitLockerState \$n\)/, 'its drive\'s BitLocker is checked');
  assert.match(app, /value: 'C:\\\\CaseVault-Backups'/, 'C:\\CaseVault-Backups is filled in');
});
