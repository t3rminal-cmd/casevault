// v1.116: the landing page's CLOSED FILES and ARCHIVED sections, under Other Files. Closed cases
// and closed Missions leave Mission Files and General Files. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1116';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async ({ c, op }) => {
    // A closed Mission with one case; a Mission still open with one closed and one open case;
    // a closed independent case (EX-100).
    const op2 = await Vault.createOperation({ name: 'Closed Op', number: 'OP-2' });
    const a = await Vault.createCase({ number: 'EX-400', subject: 'Rick Poe', opened: '2025-03-01' });
    await Vault.assignCase(a.id, op2.id);
    const b2 = await Vault.createCase({ number: 'EX-201', subject: 'Jane Roe' });
    await Vault.assignCase(b2.id, op);
    for (const id of [a.id, b2.id, c]) { const x = await Vault.getCase(id); x.status = 'Closed'; x.dates.closed = '2026-10-01'; x.closure = { disposition: 'unfounded', date: '2026-10-01' }; await Vault.saveCase(x); }
    await Vault.updateOperation(op2.id, { status: 'Closed' });
  }, { c: ids.c, op: ids.op });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.closed-files-section');
  await p.waitForTimeout(500);
  const order = await p.$$eval('.dashboard > .dash-section', (x) => x.map((e) => e.className.match(/(op-folders-section|general-years-section|other-files-section|closed-files-section|archived-section|locker-section)/g)).filter(Boolean).map((m) => m[m.length - 1]));
  const iOther = order.indexOf('other-files-section');
  ok(order[iOther + 1] === 'locker-section' && order[iOther + 2] === 'closed-files-section' && order[iOther + 3] === 'archived-section', `Closed Files, then Archived, under Other Files and the Secure Locker: ${order.join(' > ')}`);
  const missions = await p.$$eval('.op-folders-section:not(.closed-files-section):not(.archived-section):not(.general-years-section) .op-folder-tile', (x) => x.map((e) => e.textContent.trim()));
  ok(missions.length === 1 && /OP-1/.test(missions[0]), `Mission Files keeps the open Mission only: ${missions.join(' | ')}`);
  await p.click('.op-folders-section .op-folder-tile:has-text("OP-1")'); await p.waitForTimeout(300);
  const inOp = await p.$$eval('.op-open-section .op-case-num', (x) => x.map((e) => e.textContent));
  ok(inOp.join(',') === 'EX-200', `the open Mission shows its open case numbers only: ${inOp.join(',')}`);
  const general = await p.$$eval('.general-years-section .year-tile', (x) => x.map((e) => [e.textContent.trim(), e.classList.contains('placeholder-tile')]));
  ok(general.length === 1 && general[0][1], `the closed independent case left General Files: ${JSON.stringify(general)}`);
  const closed = await p.$$eval('.closed-files-section .op-folder-tile', (x) => x.map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
  ok(closed.length === 3 && /OP-1/.test(closed[0]) && /1 closed/.test(closed[0]) && /OP-2.*Closed Op/.test(closed[1]) && /General Files/.test(closed[2]), `Closed Files: ${closed.join(' | ')}`);
  await p.click('.closed-files-section .op-folder-tile:has-text("OP-2")'); await p.waitForTimeout(300);
  const inClosed = await p.$$eval('.closed-files-section .op-case-num', (x) => x.map((e) => e.textContent));
  ok(inClosed.join(',') === 'EX-400' && (await p.locator('.closed-files-section .op-open-name').getAttribute('href')).startsWith('#/operation/'), `a closed Mission opens with its cases and a link to it: ${inClosed}`);
  await p.locator('.closed-files-section').screenshot({ path: `${SP}/closed.png` }).catch(() => {});
  // Archived, by reason.
  const arch = await p.$$eval('.archived-section .op-folder-tile', (x) => x.map((e) => e.textContent.trim()));
  ok(arch.length === 1 && /NOLLE PROSEQUI/.test(arch[0]), `Archived by reason: ${arch.join(' | ')}`);
  await p.click('.archived-section .op-folder-tile'); await p.waitForTimeout(300);
  ok((await p.$$eval('.archived-section .op-case-num', (x) => x.map((e) => e.textContent))).join() === 'EX-300', 'the archived case is in its folder');
  await p.locator('.archived-section').screenshot({ path: `${SP}/archived.png` }).catch(() => {});
  // Clicking empty space closes the open folder.
  await p.mouse.click(1350, 120); await p.waitForTimeout(300);
  ok(!(await p.locator('.archived-section .op-open').count()), 'a click on empty space folds it again');
  // All Closed and All Archived open the list with that filter.
  await p.click('.closed-files-section button:has-text("All Closed")'); await p.waitForTimeout(600);
  ok((await p.evaluate(() => location.hash)) === '#/general' && (await p.$eval('.general-tools select', (s) => s.value)) === 'closed', 'All Closed lists the closed cases');
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.archived-section');
  await p.click('.archived-section button:has-text("All Archived")'); await p.waitForTimeout(600);
  ok((await p.$eval('.general-tools select', (s) => s.value)) === 'archived', 'All Archived lists the archived cases');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
