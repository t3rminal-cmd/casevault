// v1.98: drive encryption checks (helper 1.13 or later) and the repository's own safeguards.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ps = read('tools/casevault-helper/casevault-helper.ps1');
const app = read('js/app.js');
const wf = read('.github/workflows/pages.yml');

test('v1.98: helper 1.13+ says whether the vault drive and each backup drive have BitLocker', () => {
  assert.match(ps, /\$HelperVersion = '1\.(1[3-9]|[2-9]\d)\.\d+'/);
  assert.match(ps, /function Get-BitLockerState/);
  assert.match(ps, /System\.Volume\.BitLockerProtection/, 'asked the way File Explorer does, without admin rights');
  assert.match(ps, /"bitlocker":' \+ \(ConvertTo-JsonString \(Get-BitLockerState \$root\)\)/, '/api/info reports the vault drive');
  assert.match(ps, /"bitlocker":' \+ \(ConvertTo-JsonString \$d\.BitLocker\)/, '/api/backup-drives reports each drive');
  assert.match(ps, /BitLocker = \(Get-BitLockerState \$t\)/);
});

test('v1.98: the app warns about an unencrypted SSD and asks before backing up to one', () => {
  assert.match(app, /state\.bitlocker = info\.bitlocker/);
  assert.match(app, /function driveEncryptionWarning/);
  assert.match(app, /This Drive Is Not Encrypted/);
  assert.match(app, /pick\.bitlocker === 'off' \|\| pick\.bitlocker === 'suspended'/);
});

test('v1.98: every GitHub Action is pinned to an exact commit', () => {
  const uses = [...wf.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 5);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, u);
  assert.match(read('.github/dependabot.yml'), /package-ecosystem: github-actions/);
});

test('v1.98: nothing is published until the safety checks and the browser tests pass', () => {
  assert.match(wf, /needs: \[check, browser\]/);
  assert.match(wf, /node tests\/e2e\/run\.js/);
  assert.doesNotMatch(wf, /persist-credentials: true/);
});

test('v1.98: the split-out parts are loaded before app.js and cached for offline use', () => {
  const html = read('index.html'); const sw = read('sw.js');
  const at = (f) => html.indexOf(`src="js/${f}"`);
  for (const f of ['case-overview.js', 'case-timeline.js', 'files-tab.js']) {
    assert.ok(at(f) > 0 && at(f) < at('app.js'), `${f} before app.js`);
    assert.ok(sw.includes(`'./js/${f}'`), `${f} in the offline cache`);
  }
});
