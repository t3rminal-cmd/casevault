// v1.108: the confidential address, the Federal Government as a victim, and See DEA 6 on the
// Draft tab. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1108';

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  const id = await p.evaluate(async () => (await Vault.createCase({ number: 'EX-700', subject: 'John Doe', agencyNumber: 'FJ-88' })).id);
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, id); await p.waitForSelector('.rf-actions');
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(300);

  // (1) Address of Occurrence offers 99 N Confidential and 99 N Confidential Street.
  const addr = p.locator('.rf-offense input[placeholder="Address of Occurrence"], .rf-offense input[data-label="Address of Occurrence"]').first();
  await addr.click(); await addr.fill('99'); await p.waitForTimeout(200);
  const opts = await p.$$eval('.combo-list .combo-opt', (x) => x.filter((e) => e.offsetParent).map((e) => e.textContent.trim()));
  ok(opts.some((t) => t.startsWith('99 N Confidential Street')) && opts.some((t) => /^99 N Confidential(?! Street)/.test(t)), `the address list offers the confidential address: ${opts.join(' | ')}`);
  await p.locator('.combo-list .combo-opt', { hasText: '99 N Confidential Street' }).first().click(); await p.waitForTimeout(300);
  ok(await addr.inputValue() === '99 N Confidential Street', 'picking it fills the box');

  // (2) A victim: the Federal Government (name, Relation Code and officer only).
  await p.click('.rf-section.rf-people button:has-text("Add Victim")'); await p.waitForTimeout(200);
  const vname = p.locator('[aria-label="Victim 1 Name"]');
  await vname.click(); await vname.fill('Fed'); await p.waitForTimeout(200);
  const vopts = await p.$$eval('.combo-list .combo-opt', (x) => x.filter((e) => e.offsetParent).map((e) => e.textContent.trim()));
  ok(vopts.some((t) => t.startsWith('Federal Government')), `the victim list offers the Federal Government: ${vopts.join(' | ')}`);
  await p.locator('.combo-list .combo-opt', { hasText: 'Federal Government' }).first().click(); await p.waitForTimeout(400);
  const boxes = await p.$$eval('.rf-people .rf-item [aria-label^="Victim 1 "]', (x) => x.map((e) => e.getAttribute('aria-label').replace('Victim 1 ', '')));
  ok(boxes.includes('Officer Name') && !boxes.includes('Race'), `a Federal Government victim has the officer box like the State: ${boxes.join(', ')}`);
  await p.evaluate(() => document.querySelector('[aria-label="Victim 1 Name"]').closest('.rf-item').querySelector('.danger-icon').click());
  await p.waitForSelector('#dialog[open]'); await p.click('#dialog[open] button:has-text("Delete")'); await p.waitForTimeout(400);

  // (3) See DEA 6.
  await p.click('.rf-actions button:has-text("See DEA 6")'); await p.waitForSelector('#dialog[open]');
  ok(/statistical purposes only.*Federal Case Number FJ-88/s.test(await p.textContent('#dialog[open]')), 'the dialog shows the summary it writes, with the Federal Case Number');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/dialog.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("See DEA 6")'); await p.waitForTimeout(1500);
  const saved = await p.evaluate(async (i) => Vault.readCaseJSON(i, 'report-fields.json'), id);
  const SEE = 'See DEA 6 for further information';
  ok(saved.victimsList[0].name === SEE && saved.offendersList[0].name === SEE && saved.charges[0].description === SEE && saved.evidenceNote === SEE && saved.evidence.length === 0,
    'Victims, Offenders, Charges and Evidence say See DEA 6 (no exhibit number used)');
  ok(saved.narrative === 'This report is for statistical purposes only. For further information see DEA 6 reports under Federal Case Number FJ-88. THIS CASE IS CLEAR/CLOSED.', `the summary: ${saved.narrative}`);
  const shown = await p.evaluate(() => ({
    victim: (document.querySelector('[aria-label="Victim 1 Name"]') || {}).value,
    offender: (document.querySelector('[aria-label="Offender 1 Name"]') || {}).value,
    note: (document.querySelector('.rf-ev-note-input') || {}).value,
    open: ['people', 'report', 'evidence', 'summary'].every((s) => { const sec = document.querySelector(`.rf-section.rf-${s}`); return sec && !sec.classList.contains('rf-folded') && !sec.classList.contains('rf-off'); }),
  }));
  ok(shown.victim === SEE && shown.offender === SEE && shown.note === SEE, `the grey boxes on screen read See DEA 6: ${JSON.stringify(shown)}`);
  ok(shown.open, 'Victims and Offenders, the Officer\'s Report (Charges), Evidence and the Summary are open on screen');
  await p.locator('.rf-section.rf-evidence').screenshot({ path: `${SP}/evidence.png` }).catch(() => {});
  // The Offense Classification is not turned into the DEA 6 words.
  ok(saved.offense !== SEE, 'the Offense Classification is left as it was');
  // Its PDF says it too.
  const pdf = await p.evaluate(async (i) => { const c = Vault.data.cases.find((x) => x.id === i); const d = await CVReportFieldsUI.load(c); const bytes = await CVReportFieldsUI.pdfFor(c, d); return [...bytes].map((x) => String.fromCharCode(x)).join(''); }, id);
  ok(pdf.includes('(See DEA 6 for further information)') && pdf.includes('CLEAR/CLOSED'), 'the PDF prints See DEA 6 and the summary');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
