// v1.130: a Mission's case rows are one line tall with an Open menu (Details, Reports, Files); long
// tables keep their headings in view and are lightly striped; flatter banner chips. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1130';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 768);
  await p.evaluate(async (opId) => {
    const names = ['DOE, John', 'ROE, Jane', 'POE, Rick', 'DOE, Jane', 'ROE, Rick', 'POE, Mary'];
    for (let i = 0; i < 30; i += 1) { const c = await Vault.createCase({ number: `EX-${1000 + i}`, subject: names[i % names.length], opened: '2026-02-03' }); if (i < 4) await Vault.assignCase(c.id, opId); }
  }, ids.op);
  // Mission page: one-line rows, the Open menu.
  await p.evaluate((o) => { location.hash = `#/operation/${o}`; }, ids.op); await p.waitForSelector('.op-cases-table');
  const hs = await p.$$eval('.op-cases-table tbody tr', (rs) => rs.map((r) => Math.round(r.getBoundingClientRect().height)));
  ok(hs.length >= 4 && Math.max(...hs) <= 60, `Mission rows are one line tall: ${hs.join(', ')}px`);
  await p.click('.op-cases-table tbody tr:first-child .row-menu > summary'); await p.waitForTimeout(150);
  const items = await p.$$eval('.op-cases-table tbody tr:first-child .row-menu-list a', (a) => a.filter((x) => x.offsetParent).map((x) => x.textContent));
  ok(items.join('|') === 'Details|Reports|Files', `the Open menu lists ${items.join(', ')}`);
  await p.screenshot({ path: `${SP}/mission-menu.png` });
  await p.mouse.click(700, 120); await p.waitForTimeout(150);
  ok(!(await p.$('.row-menu[open]')), 'a click outside closes it');
  await p.click('.op-cases-table tbody tr:first-child .row-menu > summary');
  await p.click('.op-cases-table tbody tr:first-child .row-menu-list a:has-text("Reports")'); await p.waitForTimeout(500);
  ok(/\/reports$/.test(await p.evaluate(() => location.hash)), 'Reports opens that case on its Reports tab');
  // The sidebar's INDEPENDENT CASES name never runs under its (two-digit) count.
  const side = await p.evaluate(() => { const g = document.querySelector('.general-group .op-head'); const n = g.querySelector('.ind-name'); const c = g.querySelector('.op-count'); return { fits: n.scrollWidth <= n.clientWidth + 1, gap: Math.round(c.getBoundingClientRect().left - n.getBoundingClientRect().right), count: c.textContent }; });
  ok(side.fits && side.gap >= 2, `INDEPENDENT CASES clears its count of ${side.count}: ${JSON.stringify(side)}`);
  // General Files: the heading stays in view while the list scrolls; rows are striped.
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForSelector('.general-table'); await p.waitForTimeout(500);
  const before = await p.evaluate(() => document.querySelector('.general-table thead th').getBoundingClientRect().top);
  await p.evaluate(() => { const t = document.querySelector('.general-table tbody tr:nth-child(25)'); t.scrollIntoView({ block: 'end' }); });
  await p.waitForTimeout(250);
  const st = await p.evaluate(() => { const th = document.querySelector('.general-table thead th').getBoundingClientRect(); const main = document.querySelector('#main').getBoundingClientRect(); return { top: Math.round(th.top), mainTop: Math.round(main.top) }; });
  ok(Math.abs(st.top - st.mainTop) <= 2 && st.top < before, `the heading row sticks at the top while scrolling (${JSON.stringify(st)}, was ${Math.round(before)})`);
  const stripes = await p.$$eval('.general-table tbody tr', (rs) => rs.slice(0, 4).map((r) => getComputedStyle(r.cells[0]).backgroundColor));
  ok(stripes[0] !== stripes[1] && stripes[0] === stripes[2], `rows are striped: ${stripes.join(' / ')}`);
  await p.screenshot({ path: `${SP}/general-sticky.png` });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
