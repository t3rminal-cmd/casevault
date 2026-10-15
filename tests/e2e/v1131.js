// v1.131: Find (Ctrl+K): cases, Missions, pages and actions, the person view and a search inside cases,
// all from one box, by keyboard or mouse. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1131';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (opId) => { const c = await Vault.createCase({ number: 'EX-777', subject: 'POE, Rick' }); await Vault.assignCase(c.id, opId); }, ids.op);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.dashboard');
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Control+k'); await p.waitForSelector('#dialog[open] .find-form');
  const start = await p.$$eval('.find-row .find-kind', (k) => [...new Set(k.map((x) => x.textContent))]);
  ok(['Case', 'Mission', 'Page'].every((k) => start.includes(k)), `before typing it offers ${start.join(', ')}`);
  await p.keyboard.type('ex-777'); await p.waitForTimeout(200);
  const first = await p.$eval('.find-row.on', (r) => r.textContent);
  ok(/EX-777/.test(first) && /POE, Rick/.test(first), `typing a case number puts it first: ${first}`);
  await p.screenshot({ path: `${SP}/find.png` });
  await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  ok(/#\/case\//.test(await p.evaluate(() => location.hash)) && !(await p.$('#dialog[open] .find-form')), 'Enter opens it and closes Find');
  // A Mission and a page, by keyboard.
  await p.keyboard.press('Control+k'); await p.waitForSelector('#dialog[open] .find-form');
  await p.keyboard.type('example op'); await p.waitForTimeout(200);
  ok(/Mission/.test(await p.$eval('.find-row.on', (r) => r.textContent)), 'a Mission name finds the Mission');
  await p.fill('.find-input', 'general'); await p.waitForTimeout(150);
  await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  ok(/#\/general$/.test(await p.evaluate(() => location.hash)), 'a page name opens the page');
  // The person view and the inside search for the words typed.
  await p.keyboard.press('Control+k'); await p.waitForSelector('#dialog[open] .find-form');
  await p.keyboard.type('Rick Poe'); await p.waitForTimeout(200);
  const kinds = await p.$$eval('.find-row .find-kind', (k) => k.map((x) => x.textContent));
  ok(kinds.includes('Person') && kinds.includes('Search'), `it offers the person view and a search inside cases: ${kinds.join(', ')}`);
  await p.click('.find-row:has(.find-kind:text("Person"))'); await p.waitForSelector('#dialog[open] .person-view', { timeout: 5000 }).catch(() => {});
  ok(!!(await p.$('#dialog[open] .person-view')), 'Person opens the person view');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // ? lists Ctrl+K as Find.
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('?'); await p.waitForSelector('.shortcuts-form');
  ok(/Ctrl\+K\s*Find a case, Mission, person or page/.test(await p.$eval('.shortcuts-form', (f) => f.textContent)), 'the shortcuts list names Find');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
