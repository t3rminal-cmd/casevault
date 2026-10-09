// v1.109: a See DEA 6 offender, victim or charge keeps only that box (and can get its green check);
// the narcotics list has no doubles. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1109';
const SEE = 'See DEA 6 for further information';

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  const id = await p.evaluate(async () => (await Vault.createCase({ number: 'EX-800', subject: 'Jane Roe', agencyNumber: 'FJ-99' })).id);
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, id); await p.waitForSelector('.rf-actions');
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(300);
  const boxesOf = (sel) => p.$$eval(sel, (els) => els.map((e) => e.getAttribute('aria-label')));

  // (1) An offender picked as See DEA 6: only the name box, no Unknown Offender / No Vehicle.
  await p.click('.rf-section.rf-people button:has-text("Add Offender")'); await p.waitForTimeout(200);
  const before = (await boxesOf('.rf-people .rf-item [aria-label^="Offender 1 "]')).length;
  const on = p.locator('[aria-label="Offender 1 Name"]');
  await on.click(); await on.fill('See'); await p.waitForTimeout(200);
  await p.locator('.combo-list .combo-opt', { hasText: SEE }).first().click(); await p.waitForTimeout(400);
  const after = await boxesOf('.rf-people .rf-item [aria-label^="Offender 1 "]');
  ok(before > 10 && after.length === 1 && after[0] === 'Offender 1 Name', `the offender keeps only its name box (${before} → ${after.join(', ')})`);
  ok(await p.locator('.rf-people .rf-item-see .rf-unknown').count() === 0, 'no Unknown Offender / No Vehicle boxes on it');

  // (2) A victim typed as See DEA 6: only the name box.
  await p.click('.rf-section.rf-people button:has-text("Add Victim")'); await p.waitForTimeout(200);
  const vn = p.locator('[aria-label="Victim 1 Name"]');
  await vn.click(); await vn.pressSequentially(SEE, { delay: 5 }); await p.waitForTimeout(400);
  ok((await boxesOf('.rf-people .rf-item [aria-label^="Victim 1 "]')).length === 1, 'the victim keeps only its name box');
  await p.keyboard.press('Escape');

  // The part can now get its green check: fill its four numbers.
  for (const [ph, v] of [['Number of Victims', '1'], ['Number of Offenders', '1'], ['Number Arrested', '0'], ['Method Code', 'DNA']]) await p.fill(`.rf-people input[data-label="${ph}"], .rf-people input[placeholder="${ph}"]`, v);
  await p.waitForTimeout(500);
  ok(await p.locator('.rf-section.rf-people.rf-complete').count() === 1, 'Victims and Offenders gets its green check');
  await p.locator('.rf-section.rf-people').screenshot({ path: `${SP}/people.png` }).catch(() => {});

  // (3) A charge picked as See DEA 6 from the statute list: only the description box.
  await p.click('.rf-section.rf-report button:has-text("Add Charge")'); await p.waitForTimeout(200);
  const st = p.locator('[aria-label="Charge 1 Statute"]');
  await st.click(); await st.fill('See DEA'); await p.waitForTimeout(200);
  await p.locator('.combo-list .combo-opt', { hasText: SEE }).first().click(); await p.waitForTimeout(400);
  const cb = await boxesOf('.rf-report .rf-item [aria-label^="Charge 1 "]');
  ok(cb.length === 1 && cb[0] === 'Charge 1 Statute Description' && await p.inputValue('[aria-label="Charge 1 Statute Description"]') === SEE, `the charge keeps only its description: ${cb.join(', ')}`);
  await p.locator('.rf-report .rf-item-see').first().screenshot({ path: `${SP}/charge.png` }).catch(() => {});

  // (4) The narcotics list: no Cannabis next to Marijuana, no plain Cocaine next to Cocaine (Powder).
  await p.click('.rf-section.rf-report button:has-text("Add Narcotic")'); await p.waitForTimeout(200);
  const nb = p.locator('[aria-label="Narcotic 1 Narcotics Type Recovered"]');
  await nb.click(); await nb.press('ArrowDown'); await p.waitForTimeout(200);
  const all = await p.$$eval('.combo-list .combo-opt', (x) => x.filter((e) => e.offsetParent).map((e) => e.firstChild ? e.firstChild.textContent.trim() : e.textContent.trim()));
  const txt = all.join(' | ');
  ok(/Marijuana \(Domestic\)/.test(txt) && !/(^|\| )Cannabis/.test(txt) && !/(^|\| )Cocaine( \||$)/.test(txt) && !/MDMA \/ Ecstasy/.test(txt), `no doubles: ${txt}`);
  const saved = await p.evaluate(async (i) => { await new Promise((r) => setTimeout(r, 800)); return Vault.readCaseJSON(i, 'report-fields.json'); }, id);
  ok(saved.offendersList[0].name === SEE && saved.charges[0].description === SEE && saved.charges[0].statute === '', 'saved as See DEA 6');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
