// v1.154: Export Encrypted saves on the SSD (CaseVault-Data\exports\<folder you pick>), nothing goes
// to the PC's Downloads; Import Case lists the exports on the SSD. All data is made up (Doe / Roe).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1154';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  let downloads = 0;
  p.on('download', () => { downloads += 1; });
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids.c); await p.waitForSelector('.tabs a.tab.active'); await p.waitForTimeout(600);

  // 1. Export Encrypted: a new folder named after the case, on the SSD.
  await p.click('button.action-btn:has-text("Export Encrypted")'); await p.waitForSelector('.case-export-form .export-folder');
  const sel = await p.evaluate(() => { const s = document.querySelector('.export-folder select'); return { value: s.value, name: document.querySelector('.export-folder input').value }; });
  ok(sel.name === 'EX-100', `a new folder named after the case is offered: ${JSON.stringify(sel)}`);
  await p.screenshot({ path: `${SP}/export.png` });
  await p.fill('.case-export-form input[aria-label="Password"]', 'Example pass 1');
  await p.fill('.case-export-form input[aria-label="Password again"]', 'Example pass 1');
  await p.click('.case-export-form button[type=submit]'); await p.waitForSelector('.case-export-form', { state: 'hidden', timeout: 20000 });
  const list = await p.evaluate(() => Vault.listExportFolders());
  ok(list.length === 1 && list[0].name === 'EX-100' && list[0].files.length === 1 && /EX-100 Case Export\.cvcase/.test(list[0].files[0].name), `saved on the SSD: ${JSON.stringify(list)}`);
  ok(downloads === 0, 'nothing was downloaded to the PC');
  ok(/exports\\EX-100/.test(await p.textContent('#toasts')), 'the message says where on the SSD');

  // 2. A second export offers the folder already there.
  await p.click('button.action-btn:has-text("Export Encrypted")'); await p.waitForSelector('.case-export-form .export-folder');
  ok(await p.evaluate(() => document.querySelector('.export-folder select').value === 'EX-100'), 'the existing folder is picked');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 3. Import Case lists the export on the SSD and opens it with its password.
  await p.evaluate(() => { CVLazy.caseExport().then((m) => m.importDialog()); }); await p.waitForSelector('.case-export-form select');
  const opts = await p.$$eval('.case-export-form select option', (o) => o.map((x) => x.textContent));
  ok(opts.some((t) => /EX-100 \\ EX-100 Case Export\.cvcase/.test(t)), `Import lists it: ${opts.join(' | ')}`);
  await p.screenshot({ path: `${SP}/import.png` });
  await p.fill('.case-export-form input[aria-label="Password"]', 'wrong');
  await p.click('.case-export-form button[type=submit]'); await p.waitForTimeout(1500);
  ok(/Wrong password/.test(await p.textContent('.case-export-form .error-text')), 'a wrong password is refused');
  await p.fill('.case-export-form input[aria-label="Password"]', 'Example pass 1');
  await p.click('.case-export-form button[type=submit]');
  await p.waitForSelector('#dialog[open] button:has-text("Replace")', { timeout: 20000 });
  await p.click('#dialog[open] button:has-text("Replace")'); await p.waitForTimeout(1500);
  const after = await p.evaluate(async (i) => ({ here: Vault.data.cases.some((c) => c.id === i), bin: (await Vault.listDeleted()).map((d) => d.id) }), ids.c);
  ok(after.here && after.bin.includes(ids.c), `imported; the copy that was here is in Recently Deleted: ${JSON.stringify(after)}`);

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
