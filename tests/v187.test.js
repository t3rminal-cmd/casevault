// v1.87: Back Up Everything through the helper (1.11). The helper itself is PowerShell and was run
// by hand under PowerShell 7; this checks the pieces the app relies on are there.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ps = fs.readFileSync(path.join(__dirname, '../tools/casevault-helper/casevault-helper.ps1'), 'utf8');
const hfs = fs.readFileSync(path.join(__dirname, '../js/helper-fs.js'), 'utf8');

test('v1.87: helper 1.11 has the backup calls, and a backup only goes to a drive it lists', () => {
  const [maj, min] = /\$HelperVersion = '(\d+)\.(\d+)\.\d+'/.exec(ps).slice(1).map(Number);
  assert.ok(maj > 1 || min >= 11, 'helper 1.11 or later');
  for (const op of ['backup-drives', 'backup-status', 'backup-start']) assert.ok(ps.includes(`$op -eq '${op}'`), op);
  assert.match(ps, /Get-BackupDrives\) \| Where-Object \{ \$_\.Path -ieq \$want \}/, 'the drive asked for must be one of the listed drives');
  assert.match(ps, /SHA256/, 'every copy is checked');
  assert.match(ps, /CaseVault-Backups/);
  for (const fn of ['backupDrives', 'backupStart', 'backupStatus']) assert.ok(hfs.includes(`async function ${fn}`), fn);
});

test('v1.91: helper 1.12 no longer serves in-browser models (/webllm)', () => {
  assert.match(ps, /\$HelperVersion = '1\.12\.0'/);
  assert.doesNotMatch(ps, /webllm/i);
});
