// v1.135: statute of limitations notices 90 and 30 days before, the check before printing an Arrest
// Report, the closed date on Closed Files cards. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1135';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  // Two cases with narcotic charges: one expiring in about 60 days, one in about 20.
  await p.evaluate(async ({ c, c2 }) => {
    const day = (n) => Vault.localDay(new Date(Date.now() + n * 864e5));
    const back = (n) => { const d = new Date(Date.now() + n * 864e5); d.setFullYear(d.getFullYear() - 3); return Vault.localDay(d); };
    await Vault.writeCaseJSON(c, 'report-fields.json', { date: back(60), charges: [{ statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance' }] });
    await Vault.writeCaseJSON(c2, 'report-fields.json', { date: back(20), charges: [{ statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance' }] });
    await Vault.rebuildIndex();
    // A closed case (EX-300 is archived by boot).
    const x = await Vault.createCase({ number: 'EX-500', subject: 'Rick Poe' });
    const full = await Vault.getCase(x.id); full.status = 'Closed'; full.dates.closed = '2026-02-03'; full.closure = { disposition: 'unfounded', date: '2026-02-03' }; await Vault.saveCase(full);
    window.__day = day;
  }, ids);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.attention-section');
  await p.waitForTimeout(400);
  const rows = await p.$$eval('.attention-row', (x) => x.map((e) => [e.className, e.textContent.replace(/\s+/g, ' ')]));
  const n90 = rows.find(([cls]) => /att-sol-notice/.test(cls)); const n30 = rows.find(([cls]) => /att-sol-soon/.test(cls));
  ok(n90 && /EX-100/.test(n90[1]) && /Statute of Limitations in (59|60|61) days/.test(n90[1]) && /Within 90 days/.test(n90[1]), `a notice 90 days before: ${n90 && n90[1]}`);
  ok(n30 && /EX-200/.test(n30[1]) && /Within 30 days/.test(n30[1]), `a stronger notice 30 days before: ${n30 && n30[1]}`);
  await p.locator('.attention-section').screenshot({ path: `${SP}/notices.png` });

  // Closed Files: the closed date on the case card.
  await p.click('.closed-files-section .year-group-tile'); await p.waitForTimeout(200);
  await p.click('.closed-files-section .done-year .op-folder-tile'); await p.waitForTimeout(200);
  const dates = await p.$$eval('.closed-files-section .op-case-dates', (x) => x.map((e) => e.textContent.trim()));
  ok(dates.some((t) => /^Closed February 0?3, 2026$/.test(t)), `the case card says when it was closed: ${dates.join(' | ')}`);
  await p.locator('.closed-files-section').screenshot({ path: `${SP}/closed-card.png` });

  // The Arrest Report: Print asks first when parts are empty.
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.arrest = true; await Vault.saveCase(c); }, ids.c);
  await p.evaluate((i) => { location.hash = `#/case/${i}/arrest`; }, ids.c); await p.waitForSelector('.arrest-toolbar');
  await p.click('.arrest-toolbar button:has-text("Print / PDF")'); await p.waitForSelector('#dialog[open] .arrest-gaps');
  const gaps = await p.$eval('#dialog[open] .arrest-gaps', (e) => e.textContent);
  ok(/Arrestee 1/.test(gaps) && /Miranda/.test(gaps) && /phone call \(or tick Refused phone call\)/.test(gaps), `it lists what is empty: ${gaps.slice(0, 160)}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/gaps.png` });
  await p.click('#dialog[open] button:has-text("Go Back")'); await p.waitForTimeout(300);
  ok(!(await p.$('#dialog[open] .pv-page, #dialog[open] canvas')), 'Go Back does not open the PDF');
  await p.click('.arrest-toolbar button:has-text("Print / PDF")'); await p.waitForSelector('#dialog[open] .arrest-gaps');
  await p.click('#dialog[open] button:has-text("Continue Anyway")'); await p.waitForTimeout(1500);
  ok(!!(await p.$('#dialog[open] canvas')), 'Continue Anyway opens the PDF');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
