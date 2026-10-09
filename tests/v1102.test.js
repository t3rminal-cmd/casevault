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
  assert.match(ps, /\$HelperVersion = '1\.14\.0'/);
  assert.match(ps, /backup-network\.json/, 'the list lives in CaseVault-Data, not on the PC');
  assert.match(ps, /function Test-NetworkFolderPath/);
  assert.match(ps, /\$op -eq 'backup-network'/);
  assert.match(ps, /casevault-write-test-/, 'a write test before a folder is added');
  assert.match(ps, /-not \$target\.Reachable/, 'an unreachable folder is never backed up to');
  assert.match(ps, /Where-Object \{ \$_\.Path -ieq \$want \}/, 'backup-start still only takes a listed drive');
});

test('v1.102: the app asks once per folder that the other PC is encrypted', () => {
  assert.match(app, /Add Network Folder/);
  assert.match(app, /Backing Up to Another PC/);
  assert.match(app, /networkBackupOk/);
  assert.match(read('js/helper-fs.js'), /addNetworkFolder[\s\S]*removeNetworkFolder/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'BACKUP-TO-ANOTHER-PC.md')));
});
