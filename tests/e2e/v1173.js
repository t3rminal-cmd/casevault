// v1.173: Paste From Text on the Timeline, the calendar file and the prosecutor packet saved on the
// SSD, Check the Mission and Read Labels on the Write Report tab. All data is made up (Doe / Roe / Poe).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1173';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1500, 1000);
  const id = await p.evaluate(async () => {
    const op = Vault.listOperations()[0];
    const c = await Vault.createCase({ number: 'EX-991', subject: 'Rick Poe' });
    await Vault.assignCase(c.id, op.id);
    const tl = await Vault.getTimeline(c.id);
    tl.events = [{ id: 'b1', kind: 'buy', date: '2026-03-04', title: 'Buy 1', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' },
      { id: 'k1', kind: 'court', date: '2026-11-10', time: '09:30', title: 'Preliminary hearing' },
      { id: 'd1', kind: 'deadline', date: '2026-11-05', title: 'Lab results due', done: false }];
    await Vault.saveTimeline(c.id, tl);
    const photo = await Vault.addFile(c.id, new File(['jpg'], 'label.jpg', { type: 'image/jpeg' }), { folder: 'Other Exhibits', description: 'Exhibit 1a' });
    await Vault.writeCaseJSON(c.id, 'report-fields.json', { evidence: [{ number: 1, inventory: '12345678', type: 'Narcotics', drug: 'Cocaine', weight: '3.5 g', description: 'Knotted bag', photos: [photo], photoLabels: [''],
      custody: [{ date: '2026-03-04', time: '', action: 'Received / Seized', from: 'UC', to: 'Det. Doe', purpose: '' }, { date: '2026-03-05', time: '', action: 'Sent to Lab', from: 'Det. Doe', to: 'Lab', purpose: '' }] }], lastExhibit: 1 });
    await Vault.addFile(c.id, new File(['On 03/04/2026 the UC bought 3.5 grams of cocaine from Rick Poe for $200.'], 'Buy Report.txt', { type: 'text/plain' }), { keepName: true });
    return c.id;
  });

  // 1. Paste From Text fills the Timeline form.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/timeline`; }, id);
  await p.waitForSelector('.tl-paste-btn', { state: 'attached' });
  await p.evaluate(() => { const f = document.querySelector('.timeline-form'); if (f && f.hidden) document.querySelector('.tl-add-btn').click(); }); // v1.177: the form opens from Add Event
  await p.click('.tl-paste-btn');
  await p.fill('.tl-paste textarea', 'CAD 26-123456. On 03/11/2026 at 1415 hours the UC purchased 7 grams of crack cocaine from Rick Poe for $400 at 100 Example Street.');
  await p.click('.tl-paste .btn.primary');
  const form = await p.evaluate(() => { const f = document.querySelector('.tl-paste').closest('form'); return { found: document.querySelector('.tl-paste-found').textContent, date: f.querySelector('input[type=hidden]').value, kind: f.querySelector('select').value, qty: f.querySelector('[aria-label=Amount]').value, paid: f.querySelector('[aria-label=Paid]').value }; });
  ok(form.date === '2026-03-11' && form.kind === 'buy' && form.qty === '7' && /400/.test(form.paid) && /Filled in/.test(form.found), `Paste From Text fills the form: ${JSON.stringify(form)}`);
  await p.locator('.tl-paste').screenshot({ path: `${SP}/paste.png` }).catch(() => {});

  // 2. The calendar file, saved in the case's Files (Other).
  await p.click('.tl-tools button:has-text("Calendar File")');
  await p.waitForTimeout(800);
  const ics = await p.evaluate(async (i) => { const f = (await Vault.listFiles(i)).find((x) => /\.ics$/.test(x.name)); return f ? { path: f.path || f.name, folder: f.folder } : null; }, id);
  ok(ics && /Deadlines and Court Dates\.ics/.test(ics.path) && /Other/.test(ics.folder || ics.path), `the calendar file is in the case's Files: ${JSON.stringify(ics)}`);

  // 3. Read Labels on the Write Report tab (the OCR is stubbed: no photo text in the tests).
  await p.evaluate(() => { CVChecks.documentText = async () => ({ paragraphs: [{ text: 'INV # 12345687' }] }); });
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/draft`; }, id);
  await p.waitForSelector('.rf-label-btn', { state: 'attached', timeout: 20000 });
  await p.evaluate(() => document.querySelector('.rf-label-btn').click());
  await p.waitForSelector('.label-reads .label-differs', { state: 'attached', timeout: 10000 });
  ok(/reads 12345687, not 12345678/.test(await p.textContent('.label-reads')), 'Read Labels: the label differs from the Inventory Number');

  // 4. The prosecutor packet for the case, saved in the Case Files.
  await p.evaluate(async (i) => { CVHealthUI.packet(CaseVaultUI, [await Vault.getCase(i)]); }, id);
  await p.waitForSelector('#dialog[open] .pdf-view', { timeout: 20000 });
  await p.click('#dialog[open] button:has-text("Save to the Case Files")');
  await p.waitForTimeout(800);
  const pk = await p.evaluate(async (i) => (await Vault.listFiles(i)).some((x) => /Prosecutor Packet\.pdf$/.test(x.name)), id);
  ok(pk, 'the prosecutor packet is saved in the Case Files');
  await p.click('#dialog[open] button:has-text("Done")'); await p.waitForTimeout(300);

  // 5. The Mission page: Check the Mission.
  await p.evaluate(() => { location.hash = `#/operation/${encodeURIComponent(Vault.listOperations()[0].id)}`; });
  await p.waitForSelector('.mission-health button:has-text("Check the Mission")', { timeout: 30000 });
  await p.click('.mission-health button:has-text("Check the Mission")');
  await p.waitForSelector('#dialog[open] .mission-check-table', { timeout: 30000 });
  ok(/EX-991/.test(await p.textContent('#dialog[open] .mission-check-table')), 'Check the Mission lists each case number');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/mission-check.png` }).catch(() => {});
  const saved = await p.evaluate(async (i) => (await Vault.listChecks(i)).length, id);
  ok(saved >= 1, `the check is saved on the case's Checks tab (${saved})`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
