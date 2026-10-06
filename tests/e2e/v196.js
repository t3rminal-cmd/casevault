const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.deconfliction = [
    { date: '2026-05-10', event: 'B-May', system: 'DICE', number: '2', conflict: 'No', notes: '' },
    { date: '', event: 'Z-NoDate', system: '', number: '', conflict: '', notes: '' },
    { date: '2026-01-03', event: 'A-Jan', system: 'RISSafe', number: '1', conflict: 'No', notes: '' },
    { date: '2026-09-20', event: 'C-Sep', system: 'DICE', number: '3', conflict: 'Yes', notes: '' }]; await Vault.saveCase(c); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForSelector('.decon-card', { state: 'attached' }); await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelectorAll('[aria-expanded="false"]').forEach((x) => { if (x.closest('main')) x.click(); }); }); await p.waitForTimeout(600);
  const order = () => p.evaluate(() => [...document.querySelectorAll('.decon-card .decon-wide input')].filter((_, i) => i % 2 === 0).map((x) => x.value));
  ok(JSON.stringify(await order()) === JSON.stringify(['A-Jan', 'B-May', 'C-Sep', 'Z-NoDate']), `opened in date order ${await order()}`);
  // change A-Jan to 2027: stays put while typing, moves when the cursor leaves the list
  const d0 = p.locator('.decon-card').nth(0).locator('.date-text');
  await d0.click(); await d0.fill(''); await d0.type('01032027'); await p.waitForTimeout(400);
  ok((await order())[0] === 'A-Jan', 'card does not jump while its date is typed');
  await p.keyboard.press('Tab'); await p.waitForTimeout(300);
  ok((await order())[0] === 'A-Jan', 'still in place while the cursor is in the list');
  await p.click('#decon-title'); await p.waitForTimeout(600);
  ok(JSON.stringify(await order()) === JSON.stringify(['B-May', 'C-Sep', 'A-Jan', 'Z-NoDate']), `re-sorted after leaving the list ${await order()}`);
  // add: today's date, focused card
  await p.click('.deconfliction .contact-add button'); await p.waitForTimeout(500);
  const focusedIdx = await p.evaluate(() => [...document.querySelectorAll('.decon-card')].findIndex((c) => c.contains(document.activeElement)));
  const o = await order();
  ok(focusedIdx === o.indexOf('') && focusedIdx >= 0, `new check focused at its place ${focusedIdx} ${o}`);
  ok(await p.evaluate(() => !!document.querySelector('.decon-card.conflict')), 'conflict card still marked');
  await p.click('#decon-title'); await p.waitForTimeout(1200);
  const saved = await p.evaluate(async (id) => (await Vault.getCase(id)).deconfliction.map((r) => r.event + '@' + r.date), ids.c);
  ok(saved[0] === 'B-May@2026-05-10' && saved.indexOf('A-Jan@2027-01-03') > saved.indexOf('C-Sep@2026-09-20') && saved[saved.length - 1] === 'Z-NoDate@', `saved in order ${saved}`);
  await p.locator('.deconfliction').screenshot({ path: process.env.SP + '/v196/decon.png' });
  console.log('errors', errs); await b.close(); })();
