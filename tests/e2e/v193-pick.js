const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  const open = () => p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelectorAll('[aria-expanded="false"]').forEach((x) => { if (x.closest('main')) x.click(); }); });
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.suspects = [{ name: 'Main Doe', role: 'Primary', dob: '1990-01-02', info: { hair: 'Black' } }, { name: 'Second Roe', role: 'Secondary', info: {} }, { name: 'Other Poe', role: 'Other', info: {} }]; await Vault.saveCase(c); await Vault.writeCaseJSON(id, 'report-fields.json', {}); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500); await open(); await p.waitForTimeout(500);
  await p.click('button:has-text("Add From Suspects")'); await p.waitForTimeout(500);
  const rows = await p.$$eval('#dialog[open] .rf-suspect-pick', (l) => l.map((x) => [x.querySelector('strong').textContent, x.querySelector('input').checked]));
  ok(JSON.stringify(rows) === JSON.stringify([['Main Doe', true], ['Second Roe', false], ['Other Poe', false]]), `pick list, Primary ticked: ${JSON.stringify(rows)}`);
  await p.screenshot({ path: process.env.SP + '/v193/pick.png' });
  // only the Secondary
  await p.click('#dialog[open] .rf-suspect-pick:has-text("Main Doe") input');
  ok(await p.isDisabled('#dialog[open] button[type=submit]'), 'Add is off with nothing ticked');
  await p.click('#dialog[open] .rf-suspect-pick:has-text("Second Roe") input');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(1500);
  let d = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')), ids.c);
  ok(d.offendersList.map((o) => o.name).filter(Boolean).join(',') === 'Second Roe', `only the picked suspect added: ${d.offendersList.map((o) => o.name)}`);
  // again: Second Roe marked as already in; tick Main Doe
  await p.click('button:has-text("Add From Suspects")'); await p.waitForTimeout(500);
  const note = await p.textContent('#dialog[open] .rf-suspect-pick:has-text("Second Roe")');
  ok(/already in this report/.test(note), 'a suspect already in the report is marked');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(1500);
  d = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')), ids.c);
  ok(d.offendersList.map((o) => o.name).filter(Boolean).join(',') === 'Second Roe,Main Doe' && d.offendersList[1].hair === 'Black', `Main Doe added with details: ${d.offendersList.map((o) => o.name)}`);
  // Cancel adds nothing
  await p.click('button:has-text("Add From Suspects")'); await p.waitForTimeout(400);
  await p.click('#dialog[open] .rf-suspect-pick:has-text("Other Poe") input');
  await p.click('#dialog[open] button:has-text("Cancel")'); await p.waitForTimeout(800);
  d = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')), ids.c);
  ok(d.offendersList.filter((o) => o.name).length === 2, 'Cancel adds nothing');
  console.log('errors', errs); await b.close(); })();
