// v1.98: the helper says whether the CASEVAULT drive and each backup drive are BitLocker-encrypted,
// and the app warns. Runs the real helper in PowerShell 7 (pwsh) with made-up drive states
// (-BitLockerStates) and folders standing in for drives; skipped when pwsh isn't installed.
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const PWSH = process.env.PWSH || 'pwsh';
const HELPER = path.resolve(__dirname, '..', '..', 'tools', 'casevault-helper', 'casevault-helper.ps1');
const APP = path.resolve(__dirname, '..', '..');
const PORT = 8598;

if (spawnSync(PWSH, ['-NoProfile', '-Command', 'exit 0']).status !== 0) { console.log('SKIP PowerShell (pwsh) is not installed'); process.exit(0); }

async function startHelper(vaultState) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-helper-'));
  const data = path.join(dir, 'ssd', 'CaseVault-Data'); const bk1 = path.join(dir, 'bk1'); const bk2 = path.join(dir, 'bk2');
  for (const d of [data, bk1, bk2]) fs.mkdirSync(d, { recursive: true });
  const root = path.parse(data).root;
  const proc = spawn(PWSH, ['-NoProfile', '-File', HELPER, '-Port', String(PORT), '-DataPath', data, '-AppPath', APP, '-NoBrowser', '-NoAI',
    '-BackupTargets', `${bk1};${bk2}`, '-BitLockerStates', `${bk1}=on;${bk2}=off;${root}=${vaultState}`], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { proc, bk2 };
}
const stop = async (h) => { h.proc.kill(); await new Promise((r) => setTimeout(r, 800)); };

async function open(b) {
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { delete Window.prototype.showDirectoryPicker; delete window.showDirectoryPicker; });
  await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForTimeout(2500);
  const create = p.locator('button:has-text("Create")').first();
  if (await create.count()) { await create.click(); await p.waitForTimeout(2000); }
  await p.waitForSelector('#gate', { state: 'hidden', timeout: 15000 });
  return { p, errs };
}
const toastText = (p) => p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));

(async () => {
  const b = await chromium.launch();
  let h = await startHelper('off');
  let { p, errs } = await open(b);
  await p.waitForTimeout(1500);
  ok(/is not encrypted/.test(await toastText(p)), 'startup warns the SSD is not encrypted');
  await p.evaluate(async () => { const c = await Vault.createCase({ number: 'EX-100', subject: 'John Doe' }); await Vault.addFile(c.id, new File(['hello'], 'note.txt')); });
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  ok(await p.locator('.hero-encrypt').count() === 1 && /SSD not encrypted/.test(await p.textContent('.hero-encrypt')), 'home page has a red SSD not encrypted chip');
  await p.click('.hero-encrypt'); await p.waitForSelector('.backup-enc');
  ok(/This SSD: Not encrypted/.test(await p.textContent('.backup-enc')), 'Vault panel: This SSD: Not encrypted');
  await p.click('.backup-full:not(.backup-enc) button'); await p.waitForSelector('.backup-drives');
  const labels = await p.evaluate(() => [...document.querySelectorAll('.backup-drives .arch-opt')].map((x) => x.textContent));
  ok(/Encrypted \(BitLocker on\)/.test(labels[0]) && /Not encrypted/.test(labels[1]), 'each backup drive shows its encryption');
  await p.locator('.backup-drives .arch-opt').nth(1).click(); await p.click('#dialog[open] button:has-text("Back Up to This Drive")');
  await p.waitForSelector('#dialog[open] h2:has-text("This Drive Is Not Encrypted")');
  ok(true, 'an unencrypted backup drive asks first');
  await p.click('#dialog[open] button:has-text("Cancel")'); await p.waitForTimeout(800);
  ok(!fs.readdirSync(h.bk2).length, 'Cancel: nothing is written to the unencrypted drive');
  await p.click('.hero-backup:not(.hero-encrypt)'); await p.waitForSelector('.backup-full');
  await p.click('.backup-full:not(.backup-enc) button'); await p.waitForSelector('.backup-drives');
  await p.locator('.backup-drives .arch-opt').nth(0).click(); await p.click('#dialog[open] button:has-text("Back Up to This Drive")');
  await p.waitForSelector('#dialog[open] h2:has-text("Full Backup Done")', { timeout: 30000 });
  ok(true, 'an encrypted backup drive backs up without asking');
  console.log('errors', errs); await p.context().close(); await stop(h);

  h = await startHelper('on');
  ({ p, errs } = await open(b)); await p.waitForTimeout(1500);
  ok(!/is not encrypted/.test(await toastText(p)), 'BitLocker on: no warning');
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  ok(await p.locator('.hero-encrypt').count() === 0, 'BitLocker on: no red chip');
  await p.click('.hero-backup'); await p.waitForSelector('.backup-enc');
  ok(/Encrypted \(BitLocker on\)/.test(await p.textContent('.backup-enc')), 'Vault panel: Encrypted (BitLocker on)');
  console.log('errors', errs); await b.close(); await stop(h);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
