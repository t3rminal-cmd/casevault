// v1.151 (helper 1.16): the helper refuses API requests without the key it was started with, and
// refuses Windows device names (CON, NUL…) as file names. Runs the real helper in PowerShell 7
// (pwsh); skipped when pwsh isn't installed. Made-up data only.
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const PWSH = process.env.PWSH || 'pwsh';
const KEY = 'fedcba9876543210fedcba9876543210';
const HELPER = path.resolve(__dirname, '..', '..', 'tools', 'casevault-helper', 'casevault-helper.ps1');
const APP = path.resolve(__dirname, '..', '..');
const PORT = 8599;

if (spawnSync(PWSH, ['-NoProfile', '-Command', 'exit 0']).status !== 0) { console.log('SKIP PowerShell (pwsh) is not installed'); process.exit(0); }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-key-'));
  const data = path.join(dir, 'ssd', 'CaseVault-Data');
  fs.mkdirSync(data, { recursive: true });
  const proc = spawn(PWSH, ['-NoProfile', '-File', HELPER, '-Port', String(PORT), '-DataPath', data, '-AppPath', APP, '-NoBrowser', '-NoAI', '-SessionKey', KEY], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext()).newPage();
    await p.addInitScript(() => { delete Window.prototype.showDirectoryPicker; delete window.showDirectoryPicker; });
    // Without the key: the page loads, the API says no, and the page says how to open CaseVault.
    await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForTimeout(2500);
    const noKey = await p.evaluate(async () => { const r = await fetch('/api/info', { headers: { 'X-CaseVault': '1' } }); return [r.status, (await r.json()).error]; });
    ok(noKey[0] === 403 && noKey[1] === 'KeyError', `no key: refused (${noKey})`);
    const gate = await p.evaluate(() => document.body.innerText);
    ok(/Start-CaseVault\.bat/.test(gate), 'the page tells you to start CaseVault with Start-CaseVault.bat');
    const wrong = await p.evaluate(async () => (await fetch('/api/info', { headers: { 'X-CaseVault': '1', 'X-CaseVault-Key': '0'.repeat(32) } })).status);
    ok(wrong === 403, `a wrong key is refused (${wrong})`);
    // With the key in the address: kept, taken out of the address, and the API answers.
    await p.goto(`http://127.0.0.1:${PORT}/?k=${KEY}`); await p.waitForTimeout(2500);
    const st = await p.evaluate(() => ({ url: location.href, kept: localStorage.getItem('cv-helper-key') }));
    ok(!/k=/.test(st.url) && st.kept === KEY, `key kept for this profile and taken out of the address: ${st.url}`);
    const info = await p.evaluate(async (k) => (await fetch('/api/info', { headers: { 'X-CaseVault': '1', 'X-CaseVault-Key': k } })).status, KEY);
    ok(info === 200, `with the key the API answers (${info})`);
    // v1.152: a tab waiting with an old key reconnects by itself when a new tab brings the key.
    const p2 = await p.context().newPage();
    await p.evaluate(() => localStorage.setItem('cv-helper-key', '0'.repeat(32)));
    await p.reload(); await p.waitForTimeout(2500);
    const waiting = await p.evaluate(() => document.body.innerText);
    ok(/Start CaseVault Again to Reconnect/i.test(waiting) && !/is not running/.test(waiting), 'an old key: "Start CaseVault Again to Reconnect", not "not running"');
    // v1.178: the refused key isn't kept in the browser.
    ok(await p.evaluate(() => localStorage.getItem('cv-helper-key')) === null, 'the refused old key is removed from the browser');
    await p2.goto(`http://127.0.0.1:${PORT}/?k=${KEY}`); await p2.waitForTimeout(2500);
    await p.waitForTimeout(2500);
    // (This test vault is empty, so "reconnected" is the helper's next screen: create the vault.)
    const after = await p.evaluate(() => document.body.innerText);
    ok(!/Start CaseVault Again/i.test(after) && /Create/i.test(after), 'the waiting tab reconnected by itself');
    await p2.close();
    // Windows device names are not files.
    const dev = await p.evaluate(async (k) => Promise.all(['CON', 'nul.txt', 'com1', 'LPT9.md'].map(async (n) => (await fetch(`/api/write?p=${encodeURIComponent(n)}`, { method: 'PUT', body: 'x', headers: { 'X-CaseVault': '1', 'X-CaseVault-Key': k } })).status)), KEY);
    ok(dev.every((s) => s >= 400), `CON, NUL, COM1, LPT9 refused as names: ${dev}`);
    const fine = await p.evaluate(async (k) => (await fetch(`/api/write?p=${encodeURIComponent('console.txt')}`, { method: 'PUT', body: 'x', headers: { 'X-CaseVault': '1', 'X-CaseVault-Key': k } })).status, KEY);
    ok(fine < 400, `an ordinary name like console.txt still works (${fine})`);
  } finally {
    await b.close(); proc.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
