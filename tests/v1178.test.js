// v1.178 (helper 1.17): Power Off closes only CaseVault's own browser window. The window-title
// pattern is read from the helper script itself and tried on titles the browsers really show.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ps1 = fs.readFileSync(path.join(__dirname, '..', 'tools', 'casevault-helper', 'casevault-helper.ps1'), 'utf8');
const m = ps1.match(/^\$TitlePattern = '([^']+)'/m);
const re = new RegExp(m ? m[1] : 'x^'); // PowerShell -cmatch: case-sensitive, like JavaScript

test('Power Off: the pattern is in the clean-up script, and the helper passes the browser it started', () => {
  assert.ok(m, 'the $TitlePattern line is in the helper');
  const script = ps1.slice(ps1.indexOf("$ShutdownScript = @'"), ps1.indexOf("'@", ps1.indexOf("$ShutdownScript = @'")));
  assert.ok(script.includes('$TitlePattern') && /\[int\]\$BrowserPid = 0/.test(script), 'the clean-up script uses the pattern and takes -BrowserPid');
  assert.match(script, /-cmatch \$TitlePattern/);
  assert.doesNotMatch(script, /MainWindowTitle -match 'CaseVault'/, 'no more "any title containing CaseVault"');
  assert.match(ps1, /'-BrowserPid', \$script:BrowserPid/);
});

test('Power Off closes a window titled exactly like the app', () => {
  const Z = '​'; // Edge writes "Microsoft​ Edge" with a zero-width space
  for (const t of ['CaseVault', 'CaseVault - Off', `CaseVault - Microsoft${Z} Edge`, `CaseVault - Personal - Microsoft${Z} Edge`, 'CaseVault - Microsoft Edge',
    'CaseVault - Google Chrome', 'CaseVault - Work - Google Chrome', 'CaseVault — Mozilla Firefox', 'CaseVault - Off - Brave']) {
    assert.ok(re.test(t), `closes: ${t}`);
  }
});

test('Power Off leaves other windows alone, even ones about CaseVault', () => {
  const Z = '​';
  for (const t of [`t3rminal-cmd/casevault: CaseVault - GitHub - Microsoft${Z} Edge`, 'GitHub - t3rminal-cmd/casevault - Google Chrome',
    `CaseVault and 2 more pages - Personal - Microsoft${Z} Edge`, 'Notes about CaseVault - Google Chrome', 'casevault - Google Chrome',
    'CaseVault-Data - File Explorer', 'CaseVault helper - close this window to stop', 'CaseVault - Example City Police - Outlook', '']) {
    assert.ok(!re.test(t), `leaves: ${t}`);
  }
});
