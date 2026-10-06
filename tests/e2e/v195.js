const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 1000);
  const open = () => p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelectorAll('[aria-expanded="false"]').forEach((x) => { if (x.closest('main')) x.click(); }); });
  const C1 = 'Manufacture/Delivery of Cannabis, 10 to 30 grams'; const C2 = 'Possession of Cannabis';
  // The user's case: a draft saved before, with IUCR wording in Offense Classification and charges entered.
  await p.evaluate(async ([id, C1, C2]) => { await Vault.writeCaseJSON(id, 'report-fields.json', { offense: 'Delv: Synthetic Drugs', ucr: '2170', charges: [{ statute: '720 ILCS 550/5(c)', description: C1 }, { statute: '720 ILCS 550/4', description: C2 }] }); }, [ids.c, C1, C2]);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500); await open(); await p.waitForTimeout(500);
  const off = 'input[aria-label="Offense Classification / Last Report"], [data-key="offense"] input';
  const box = await p.evaluateHandle(() => [...document.querySelectorAll('main .field')].find((f) => /Offense Classification/.test(f.querySelector('span').textContent)).querySelector('input'));
  const val = () => box.asElement().inputValue();
  ok(await val() === C1, `older draft shows the first charge's wording: "${await val()}"`);
  // typing other wording goes back on leaving the box
  await box.asElement().fill('Possession'); await p.keyboard.press('Tab'); await p.waitForTimeout(500);
  ok(await val() === C1, `other wording goes back: "${await val()}"`);
  ok(/exact Statute Description/.test(await p.$$eval('.toast', (t) => t.map((x) => x.textContent).join(' '))), 'a note says why');
  // pick the second charge's wording from the arrow
  await box.asElement().evaluate((el) => el.closest('.combo').querySelector('.combo-toggle').click()); await p.waitForTimeout(300);
  const items = await box.asElement().evaluate((el) => [...el.closest('.combo').querySelectorAll('.combo-list li')].map((x) => x.textContent));
  ok(items.length === 2, `arrow lists both charges (${items.length})`);
  await box.asElement().evaluate((el) => el.closest('.combo').querySelectorAll('.combo-list li')[1].click()); await p.waitForTimeout(400);
  await p.keyboard.press('Tab'); await p.waitForTimeout(400);
  ok(await val() === C2, `the second charge's wording is kept: "${await val()}"`);
  // removing that charge moves it back to the first
  await p.locator('.rf-list-charges button[title="Delete charge"]').nth(1).click(); await p.waitForTimeout(300);
  await p.click('#dialog[open] button.danger');
  await p.waitForTimeout(600);
  ok(await val() === C1, `after removing that charge: "${await val()}"`);
  await p.evaluate(async () => { await window.CaseVaultUI.Save.flushAll(); }); await p.waitForTimeout(500);
  const saved = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')).offense, ids.c);
  ok(saved === C1, `saved on the SSD: "${saved}"`);
  console.log('errors', errs); await b.close(); })();
