// v1.102/v1.103: Back Up Everything to a folder of your choice: C:\CaseVault-Backups on this PC, or a
// shared folder on another PC (\\BEELINK\CaseVault-Backups). Runs the real helper in PowerShell 7
// (pwsh); -SimulatedNetworkRoot makes a temporary folder stand in for the other PC. Skipped when
// pwsh isn't installed.
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const PWSH = process.env.PWSH || 'pwsh';
const HELPER = path.resolve(__dirname, '..', '..', 'tools', 'casevault-helper', 'casevault-helper.ps1');
const APP = path.resolve(__dirname, '..', '..');
const PORT = 8599;

if (spawnSync(PWSH, ['-NoProfile', '-Command', 'exit 0']).status !== 0) { console.log('SKIP PowerShell (pwsh) is not installed'); process.exit(0); }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-helper-'));
  const data = path.join(dir, 'ssd', 'CaseVault-Data'); const bk1 = path.join(dir, 'bk1'); const net = path.join(dir, 'net'); const share = path.join(net, 'beelink-share');
  const local = path.join(dir, 'pc-c', 'CaseVault-Backups'); // stands in for C:\CaseVault-Backups; not made yet
  for (const d of [data, bk1, share]) fs.mkdirSync(d, { recursive: true });
  const proc = spawn(PWSH, ['-NoProfile', '-File', HELPER, '-Port', String(PORT), '-DataPath', data, '-AppPath', APP, '-NoBrowser', '-NoAI',
    '-BackupTargets', bk1, '-BitLockerStates', `${bk1}=on;${local}=on;${path.parse(data).root}=on`, '-SimulatedNetworkRoot', net], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { delete Window.prototype.showDirectoryPicker; delete window.showDirectoryPicker; });
  await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForTimeout(2500);
  const create = p.locator('button:has-text("Create")').first();
  if (await create.count()) { await create.click(); await p.waitForTimeout(2000); }
  await p.waitForSelector('#gate', { state: 'hidden', timeout: 15000 });
  await p.evaluate(async () => { const c = await Vault.createCase({ number: 'EX-200', subject: 'Jane Roe' }); await Vault.addFile(c.id, new File(['hello'], 'note.txt')); });
  const toastText = () => p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
  const clearToasts = () => p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));

  // The API refuses what isn't a shared folder, or can't be reached.
  const api = (m, q) => p.evaluate(async ([m2, q2]) => (await fetch(`/api/backup-network?p=${q2}`, { method: m2, headers: { 'X-CaseVault': '1' } })).status, [m, q]);
  ok(await api('POST', `&path=${encodeURIComponent('relative\\folder')}`) === 400, 'a path that is not a whole folder is refused (400)');
  ok(await api('POST', `&path=${encodeURIComponent(path.join(net, 'missing'))}`) === 404, 'a shared folder that cannot be reached is refused (404)');
  ok(await api('POST', `&path=${encodeURIComponent(path.join(data, 'cases'))}`) === 400, 'a folder inside the vault is refused');
  ok(await p.evaluate(async () => (await fetch('/api/backup-start?p=&drive=' + encodeURIComponent('C:\\Windows'), { method: 'POST', headers: { 'X-CaseVault': '1' } })).status) === 400, 'backup-start still only writes to a listed drive');

  await clearToasts();
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  await p.click('.hc-backup'); await p.waitForSelector('.backup-full');
  await p.click('.backup-full:not(.backup-enc) button'); await p.waitForSelector('.backup-drives');
  ok(await p.locator('.backup-net-row').isVisible() && await p.inputValue('.backup-net-row input') === 'C:\\CaseVault-Backups', 'until a folder is added, the box is open with C:\\CaseVault-Backups filled in');
  await p.screenshot({ path: process.env.SP + '/v1103/add.png' });
  ok(await p.evaluate(() => [...document.querySelectorAll('#dialog[open] button')].every((x) => { const r = x.getBoundingClientRect(); const d = document.querySelector('#dialog[open]').getBoundingClientRect(); return r.width === 0 || (r.left >= d.left - 1 && r.right <= d.right + 1); })), 'every button fits inside the dialog');
  await p.fill('.backup-net-row input', path.join(net, 'nope'));
  await p.click('.backup-net-row button:has-text("Add")'); await p.waitForTimeout(600);
  ok(/Can't reach/.test(await toastText()), 'a folder that cannot be reached shows why');
  await clearToasts();
  await p.fill('.backup-net-row input', share);
  await p.click('.backup-net-row button:has-text("Add")'); await p.waitForTimeout(1200);
  const opts = await p.evaluate(() => [...document.querySelectorAll('.backup-drives .arch-opt')].map((x) => x.textContent));
  ok(opts.length === 2 && opts[0].includes(share) && /On another PC/.test(opts[0]), 'the network folder is listed first, marked "On another PC"');
  ok(fs.readdirSync(share).length === 0, 'the write test leaves nothing behind');
  ok(fs.existsSync(path.join(data, 'backup-network.json')), 'the list is kept in the vault, not on the PC');

  await p.locator('.backup-drives .arch-opt').nth(0).click(); await p.click('#dialog[open] button:has-text("Back Up to This Drive")');
  await p.waitForSelector('#dialog[open] h2:has-text("Backing Up to Another PC")');
  ok(await p.locator('#dialog[open] button:has-text("Back Up to This Folder")').isDisabled(), 'first time: must tick "I checked" before backing up');
  await p.click('#dialog[open] .check-row input');
  await p.click('#dialog[open] button:has-text("Back Up to This Folder")');
  await p.waitForSelector('#dialog[open] h2:has-text("Full Backup Done")', { timeout: 30000 });
  const bdir = path.join(share, 'CaseVault-Backups');
  ok(fs.existsSync(bdir) && fs.readdirSync(bdir).length >= 1, 'the backup is written into CaseVault-Backups on the shared folder');
  await p.click('#dialog[open] button:has-text("Close"), #dialog[open] button:has-text("OK"), #dialog[open] button:has-text("Done")').catch(() => {});
  await p.waitForTimeout(500);

  // Second time: no question. Then the folder can be taken off the list.
  await p.evaluate(() => document.querySelector('#dialog[open]') && document.querySelector('#dialog').close());
  await p.click('.hc-backup'); await p.waitForSelector('.backup-full');
  await p.click('.backup-full:not(.backup-enc) button'); await p.waitForSelector('.backup-drives');
  await p.locator('.backup-drives .arch-opt').nth(0).click(); await p.click('#dialog[open] button:has-text("Back Up to This Drive")');
  await p.waitForSelector('#dialog[open] h2:has-text("Full Backup Done")', { timeout: 30000 });
  ok(true, 'the second backup to the same folder does not ask again');
  await p.evaluate(() => document.querySelector('#dialog').close());
  await p.click('.hc-backup'); await p.waitForSelector('.backup-full');
  await p.click('.backup-full:not(.backup-enc) button'); await p.waitForSelector('.backup-drives');
  await p.click('.backup-net-remove'); await p.waitForTimeout(1000);
  const after = await p.evaluate(() => [...document.querySelectorAll('.backup-drives .arch-opt')].map((x) => x.textContent));
  ok(after.length === 1 && !after[0].includes(share), 'Remove takes the folder off the list');
  ok(fs.readdirSync(bdir).length >= 1, 'Remove leaves the backups on that PC');

  // A listed folder that goes away (the Beelink is off) is shown but can't be picked.
  await p.evaluate(async (s) => { await HelperFS.addNetworkFolder(s); }, share);
  fs.rmSync(share, { recursive: true, force: true });
  await p.click('#dialog[open] button:has-text("Look Again")'); await p.waitForTimeout(1000);
  ok(await p.locator('.backup-drives .arch-opt.backup-off input:disabled').count() === 1 && /not reachable/.test(await p.textContent('.backup-drives .arch-opt.backup-off')), 'an unreachable network folder is greyed out');
  await p.screenshot({ path: process.env.SP + '/v1103/network.png' });

  // v1.103: a folder on this PC (C:\CaseVault-Backups): made when added, its drive's BitLocker is
  // shown, no "another PC" question, and the backups go straight into it (not CaseVault-Backups\CaseVault-Backups).
  await p.click('#dialog[open] button:has-text("Add Backup Folder")');
  await p.fill('.backup-net-row input', local);
  await p.click('.backup-net-row button:has-text("Add")'); await p.waitForTimeout(1200);
  ok(fs.existsSync(local), 'the folder is made when it is added');
  const row = p.locator('.backup-drives .arch-opt', { hasText: local });
  ok(await row.count() === 1 && /Encrypted \(BitLocker on\)/.test(await row.textContent()) && await row.locator('.backup-net-remove').count() === 1, 'listed with its drive\'s encryption and a Remove button');
  await row.click(); await p.click('#dialog[open] button:has-text("Back Up to This Drive")');
  await p.waitForSelector('#dialog[open] h2:has-text("Full Backup Done")', { timeout: 30000 });
  ok(true, 'an encrypted folder on this PC backs up without asking');
  const inside = fs.readdirSync(local);
  ok(inside.length === 1 && /^CaseVault-Backup-/.test(inside[0]) && fs.existsSync(path.join(local, inside[0], 'vault.json')), `the backup goes straight into the folder: ${inside.join(', ')}`);
  console.log('errors', errs); await b.close(); proc.kill();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
