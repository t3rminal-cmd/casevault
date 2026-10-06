const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  const open = () => p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelectorAll('[aria-expanded="false"]').forEach((x) => { if (x.closest('main')) x.click(); }); });
  const RF = await p.evaluate(() => ({ lines: CVReportFields.OPTIONAL_LINES, lists: CVReportFields.OPTIONAL_LISTS }));
  const hidden = [...RF.lines, ...RF.lists.filter((k) => k !== 'personnel' && k !== 'charges')];
  await p.evaluate(async ([id, hidden]) => { await Vault.writeCaseJSON(id, 'report-fields.json', { hidden, victimsList: [{ name: '' }], charges: [{}] }); }, [ids.c, hidden]);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500); await open(); await p.waitForTimeout(600);
  // 1. State of Illinois -> Relation Code 024
  await p.fill('input[aria-label="Victim 1 Name"]', 'State of Illinois'); await p.waitForTimeout(800);
  ok(await p.inputValue('input[aria-label="Victim 1 Relation Code"]') === '024', 'State of Illinois fills Relation Code 024');
  // 2. charge pick -> Offense Classification = exact Statute Description
  const st = p.locator('input[aria-label="Charge 1 Statute"]');
  await st.evaluate((el) => el.closest('.combo').querySelector('.combo-toggle').click()); await p.waitForTimeout(300);
  const desc = await st.evaluate((el) => { const li = el.closest('.combo').querySelector('.combo-list li'); li.click(); return null; });
  await p.waitForTimeout(800);
  const chargeDesc = await p.inputValue('input[aria-label="Charge 1 Statute Description"], textarea[aria-label="Charge 1 Statute Description"]');
  const offense = await p.evaluate(() => document.querySelector('.rf-offense input, [aria-label="Offense Classification / Last Report"]') && null) || await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')).offense, ids.c);
  await p.waitForTimeout(800);
  const saved = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')), ids.c);
  ok(chargeDesc && saved.offense === chargeDesc, `Offense Classification = "${saved.offense}" (Statute Description "${chargeDesc}")`);
  // a UCR pick afterwards keeps the statute wording
  const ucr = await p.evaluateHandle(() => [...document.querySelectorAll('main .field')].find((f) => /IUCR|UCR/.test(f.querySelector('span').textContent)).querySelector('input'));
  await ucr.asElement().evaluate((el) => el.closest('.combo').querySelector('.combo-toggle').click()); await p.waitForTimeout(300);
  await ucr.asElement().evaluate((el) => el.closest('.combo').querySelector('.combo-list li').click()); await p.waitForTimeout(1200);
  const s2 = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')), ids.c);
  ok(s2.ucr && s2.offense === chargeDesc, `after an IUCR pick (${s2.ucr}) the offense keeps the statute wording`);
  // 3. Officer's Report: no personnel -> no green check; add a filled officer -> green
  const done = () => p.evaluate(() => document.querySelector('.rf-section.rf-report').classList.contains('rf-complete'));
  ok(!(await done()), 'no green check while Police Personnel is empty');
  await p.click('.rf-list-personnel button:has-text("Add Officer")'); await p.waitForTimeout(400);
  await p.fill('input[aria-label="Officer 1 Name"]', 'Jane Roe'); await p.fill('input[aria-label="Officer 1 Star Number"]', '1234'); await p.fill('input[aria-label="Officer 1 Unit"]', '189');
  await p.selectOption('select[aria-label="Officer 1 Role"]', { index: 1 }).catch(async () => { await p.evaluate(() => { const s = document.querySelector('select[aria-label="Officer 1 Role"]'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); }); });
  await p.waitForTimeout(600);
  ok(await done(), 'green check once an officer is filled in');
  await p.screenshot({ path: process.env.SP + '/v193/draft.png' });
  // 4. suspects: Primary, Secondary, Other
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600);
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.suspects = [{ name: 'Other Poe', role: 'Other', info: {} }, { name: 'Second Roe', role: 'Secondary', info: {} }, { name: 'Main Doe', role: 'Primary', info: {} }]; await Vault.saveCase(c); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForTimeout(1500); await open(); await p.waitForTimeout(500);
  const order = () => p.$$eval('.suspect-card input[aria-label$="name"]', (l) => l.map((x) => x.value));
  ok(JSON.stringify(await order()) === JSON.stringify(['Main Doe', 'Second Roe', 'Other Poe']), `shown Primary, Secondary, Other: ${await order()}`);
  await p.selectOption('select[aria-label="Suspect 3 role"]', 'Primary').catch(() => p.evaluate(() => { const s = document.querySelector('select[aria-label="Suspect 3 role"]'); s.value = 'Primary'; s.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.waitForTimeout(800);
  ok(JSON.stringify(await order()) === JSON.stringify(['Main Doe', 'Other Poe', 'Second Roe']), `a role change moves the card: ${await order()}`);
  await p.click('.suspects button:has-text("Add suspect")'); await p.waitForTimeout(500);
  const roles = await p.$$eval('.suspect-card select[aria-label$="role"]', (l) => l.map((x) => x.value));
  ok(JSON.stringify(roles) === JSON.stringify(['Primary', 'Primary', 'Secondary', 'Secondary']), `a new suspect (Secondary) goes after the Primaries: ${roles}`);
  ok(await p.evaluate(() => document.activeElement && /^Suspect 4 name$/.test(document.activeElement.getAttribute('aria-label') || '')), `focus on the new suspect (${await p.evaluate(() => document.activeElement.getAttribute('aria-label'))})`);
  await p.waitForTimeout(1200);
  const savedOrder = await p.evaluate(async (id) => (await Vault.getCase(id)).suspects.map((s) => s.role), ids.c);
  ok(JSON.stringify(savedOrder.slice(0, 3)) === JSON.stringify(['Primary', 'Primary', 'Secondary']), `saved in that order: ${savedOrder}`);
  console.log('errors', errs); await b.close(); })();
