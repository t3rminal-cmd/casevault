// v1.171: the backup reminder's interval and the monthly backup test, a narrative started from a
// Timeline buy, Order of Events for a Buy and a Surveillance report, and one record per person
// (a suspect's details put on the same person on another case). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1171';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1500, 1000);

  // 1. A recent full backup that was never tested: the banner asks to test it.
  await p.evaluate(async () => { await Vault.updateSettings({ lastFullBackup: { at: new Date().toISOString(), files: 10, bytes: 1000, verified: true }, changesSinceBackup: 0, lastBackupTest: null }); try { localStorage.removeItem('cv-backup-bar'); } catch { /* */ } });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  const bar = await p.evaluate(() => { const x = document.querySelector('.backup-bar'); return x ? x.textContent : ''; });
  ok(/hasn't been tested yet/.test(bar) && /Test Backup/.test(bar), `a backup not tested yet is pointed out: ${bar}`);
  await p.evaluate(async () => { await Vault.updateSettings({ lastBackupTest: { at: new Date().toISOString(), ok: true, backup: 'CaseVault-Backup-2026-10-29' } }); });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !document.querySelector('.backup-bar')), 'a tested backup: no banner');
  await p.evaluate(() => { CaseVaultUI.showVaultPanel('backups'); }); await p.waitForSelector('select.backup-every', { timeout: 10000 });
  ok(/Last tested .*CaseVault-Backup-2026-10-29.*read back fine/.test(await p.textContent('.backup-tested')), 'the Backups panel says when it was last tested');
  await p.selectOption('select.backup-every', '14'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => Vault.data.settings.backupEveryDays === 14), 'the reminder interval is kept');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 2. A Surveillance narrative started from a Timeline buy.
  const id = await p.evaluate(async () => {
    const c = await Vault.createCase({ number: 'EX-980', subject: 'Rick Poe' });
    const tl = await Vault.getTimeline(c.id);
    tl.events = [{ id: 'b1', kind: 'buy', date: '2026-03-04', time: '13:15', title: 'Buy 1', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }];
    await Vault.saveTimeline(c.id, tl);
    await Vault.writeCaseJSON(c.id, 'report-fields.json', { evidence: [{ number: 1, inventory: '12345678', type: 'Narcotics', drug: 'Cocaine' }] });
    await Vault.addFile(c.id, new File(['BUY REPORT. At 1:15 PM the UC met Rick Poe. Rick Poe handed the UC a bag. At 1:25 PM the UC left. Inventory #12345678.'], 'Buy 1.txt', { type: 'text/plain' }), { keepName: true });
    await Vault.addFile(c.id, new File(['Surveillance set up at 12:50 PM. At 1:15 PM Rick Poe arrived on foot. At 1:30 PM Rick Poe left. Inventory #12345678.'], 'Surveillance 1.txt', { type: 'text/plain' }), { keepName: true });
    return c.id;
  });
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports'), id); await p.waitForSelector('.new-report-btn', { timeout: 15000 });
  await p.click('.new-report-btn'); await p.waitForSelector('#dialog[open] .new-report-form');
  await p.selectOption('#dialog[open] select[aria-label="Start from"]', 'buy');
  await p.selectOption('#dialog[open] select[aria-label="Narrative"]', 'surveillance');
  await p.locator('#dialog[open] .new-report-form').screenshot({ path: `${SP}/new-report.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Create Report")');
  await p.waitForSelector('.draft-actions-bar', { timeout: 15000 }); await p.waitForTimeout(500);
  const draft = await p.evaluate(() => ({ title: document.querySelector('.draft-title').value, body: document.querySelector('textarea.draft-editor').value }));
  ok(draft.title === 'Surveillance 1 Narrative' && /surveillance observed the undercover officer \(UC\) meet Rick Poe/.test(draft.body) && /Inventory #12345678/.test(draft.body) && /\[CONFIRM: surveillance position\]/.test(draft.body), `a Surveillance narrative from the buy: ${draft.title}`);

  // 3. Order of Events on a check of the pair.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/checks`; }, id); await p.waitForSelector('.chk-aliases'); await p.waitForTimeout(500);
  await p.selectOption('select[aria-label="Document to check"]', '');
  await p.evaluate(() => document.querySelectorAll('.check-reports input[type=checkbox]').forEach((x) => { x.checked = !/Narrative/.test(x.value); x.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.click('button:has-text("Run check")'); await p.waitForSelector('.result-head', { timeout: 30000 }); await p.waitForTimeout(400);
  await p.click('.chk-order-btn'); await p.waitForSelector('#dialog[open] .order-table', { timeout: 15000 });
  const rows = await p.$$eval('#dialog[open] .order-table tbody tr', (x) => x.map((r) => [...r.children].map((c) => c.textContent.trim().slice(0, 120))));
  ok(rows.length === 5 && rows[2][0] === '1:15 PM' && /met Rick Poe/.test(rows[2][1]) && /arrived on foot/.test(rows[2][2]) && rows[1][0] === '12:50 PM' && /Nothing at this time/.test(rows[1][1]), `the two reports by time: ${JSON.stringify(rows.map((r) => r[0]))}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/order.png` }).catch(() => {});
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 4. One record per person.
  const other = await p.evaluate(async (ids) => {
    const op = Vault.listOperations()[0];
    await Vault.assignCase(ids.c2, op.id).catch(() => {});
    const m = await Vault.getCase(ids.c2);
    m.suspects = [{ name: 'Rick Poe', dob: '1990-01-02', residence: '100 Example Street', role: 'Primary', info: { hair: 'Brown' } }];
    await Vault.saveCase(m);
    return ids.c2;
  }, ids);
  await p.evaluate(async (i) => { const c = await Vault.getCase(i); c.suspects = [{ name: 'Rick Poe', dob: '1990-01-02', residence: '200 Example Avenue', role: 'Primary', info: { hair: 'Brown', height: '6 ft 1 in' } }]; await Vault.saveCase(c); }, id);
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600); // the case is read again when opened
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, id);
  await p.waitForSelector('.suspect-update:not([hidden]) .suspect-update-btn', { state: 'attached', timeout: 15000 });
  ok(/Update on 1 Other Case/.test(await p.textContent('.suspect-update-btn')), 'the same person with other details on another case is pointed out');
  await p.evaluate(() => document.querySelector('.suspect-update-btn').click());
  await p.waitForSelector('#dialog[open] .suspect-update-form');
  const list = await p.textContent('#dialog[open] .suspect-update-list');
  ok(/EX-200/.test(list) && /Residence: 100 Example Street → 200 Example Avenue/.test(list) && /Height: \(empty\) → 6 ft 1 in/.test(list), `what would change, case by case: ${list.replace(/\s+/g, ' ')}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/update.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Update")'); await p.waitForTimeout(1500);
  const after = await p.evaluate(async (i) => (await Vault.getCase(i)).suspects[0], other);
  ok(after.residence === '200 Example Avenue' && after.info.height === '6 ft 1 in' && after.info.hair === 'Brown', `the other case is updated: ${JSON.stringify(after)}`);
  ok(await p.evaluate(() => document.querySelector('.suspect-update').hidden), 'and nothing is left to update');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
