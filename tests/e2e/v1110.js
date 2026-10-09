// v1.110: the IUCR list is written out, and picking a code fills Offense Classification with it
// (it stays when a charge is added). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1110';
const HAL = 'Manufacture and Delivery: Hallucinogen';

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  const id = await p.evaluate(async () => (await Vault.createCase({ number: 'EX-900', subject: 'Rick Poe' })).id);
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, id); await p.waitForSelector('.rf-actions');
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(300);
  const ucr = p.locator('.rf-offense input[data-label="IUCR Code"], .rf-offense input[placeholder="IUCR Code"]').first();
  const off = p.locator('.rf-offense input[data-label="Offense Classification / Last Report"], .rf-offense input[placeholder="Offense Classification / Last Report"]').first();
  await ucr.click(); await ucr.fill('Hallucinogen'); await p.waitForTimeout(200);
  const opts = await p.$$eval('.combo-list .combo-opt', (x) => x.filter((e) => e.offsetParent).map((e) => e.textContent.trim()));
  ok(opts.some((t) => t === `2015${HAL}`) && opts.some((t) => t === '2025Possession: Hallucinogen'), `the IUCR list is written out: ${opts.join(' | ')}`);
  await p.locator('.combo-list .combo-opt', { hasText: '2015' }).first().click(); await p.waitForTimeout(500);
  ok(await off.inputValue() === HAL, `Offense Classification: ${await off.inputValue()}`);
  await p.locator('.rf-section.rf-offense').screenshot({ path: `${SP}/offense.png` }).catch(() => {});
  // A charge added afterwards leaves it as the IUCR wording.
  await p.click('.rf-section.rf-report button:has-text("Add Charge")'); await p.waitForTimeout(200);
  const st = p.locator('[aria-label="Charge 1 Statute"]');
  await st.click(); await st.fill('570/401(e)'); await p.waitForTimeout(200);
  await p.locator('.combo-list:not([hidden]) .combo-opt', { hasText: 'LSD' }).first().click(); await p.waitForTimeout(600);
  ok(await off.inputValue() === HAL, 'a charge added afterwards does not replace it');
  // Its arrow offers the IUCR wording first, then the charge's.
  await off.evaluate((el) => el.closest('.combo').querySelector('.combo-toggle').click()); await p.waitForTimeout(300);
  const offs = await p.$$eval('.combo-list .combo-opt', (x) => x.filter((e) => e.offsetParent).map((e) => e.textContent.trim()));
  ok(offs.length === 2 && offs[0].startsWith(HAL) && /LSD/.test(offs[1]), `Offense Classification offers: ${offs.join(' | ')}`);
  await p.keyboard.press('Escape');
  const saved = await p.evaluate(async (i) => { await new Promise((r) => setTimeout(r, 800)); return Vault.readCaseJSON(i, 'report-fields.json'); }, id);
  ok(saved.ucr === '2015' && saved.offense === HAL && saved.offenseFrom === 'ucr', `saved: ${saved.ucr} / ${saved.offense}`);
  // A Draft form saved before v1.110 with the old short wording opens written out.
  const old = await p.evaluate(async () => { const c = await Vault.createCase({ number: 'EX-901', subject: 'Mary Doe' }); await Vault.writeCaseJSON(c.id, 'report-fields.json', { ucr: '2025', offense: 'Poss: Hallucinogens' }); return c.id; });
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, old); await p.waitForSelector('.rf-actions'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.querySelector('.rf-offense input[data-label="Offense Classification / Last Report"], .rf-offense input[placeholder="Offense Classification / Last Report"]').value) === 'Possession: Hallucinogen', 'an older form\'s "Poss: Hallucinogens" now reads "Possession: Hallucinogen"');
  // The Reference page lists the written-out wording too.
  await p.evaluate(() => { location.hash = '#/reference/ucr'; }); await p.waitForTimeout(800);
  ok((await p.textContent('main')).includes(HAL), 'Reference → UCR shows the written-out wording');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
