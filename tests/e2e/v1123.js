// v1.123: Quick Links one per row, all the same size, no name cut off; the Missions list, a Mission's
// cases and General Files with status pills of one width, dates in month / day / year columns and
// (on the Mission page) the subject in Last / First / M.I. columns, all lined up. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1123';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (opId) => {
    await Vault.updateOperation(opId, { start: '2026-10-14' });
    await Vault.createOperation({ name: 'Example Two', number: 'OP-2', start: '2026-05-03', end: '2026-09-21' });
    for (const [n, s, d] of [['EX-401', 'DOE, John Quincy', '2026-01-09'], ['EX-402', 'ROE-POEZ, Mary', '2026-12-25'], ['EX-403', 'Poe, Rick A.', '2026-05-01']]) {
      const c = await Vault.createCase({ number: n, subject: s, opened: d });
      await Vault.assignCase(c.id, opId);
    }
  }, ids.op);
  const lined = (sel) => p.$$eval(sel, (xs) => xs.map((x) => Math.round(x.getBoundingClientRect().left)));
  const same = (a) => a.length > 1 && new Set(a).size === 1;

  // Quick Links: one column, every link the same height and width, every name whole.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('#btn-side-links');
  await p.click('#btn-side-links'); await p.waitForTimeout(400);
  for (const tab of ['Reference', 'OSINT', 'LEO']) {
    await p.click(`#ql-panel .ql-tabs button:has-text("${tab}")`); await p.waitForTimeout(250);
    const q = await p.evaluate(() => {
      const links = [...document.querySelectorAll('#ql-panel .quick-links .quick-link')].filter((x) => x.offsetParent);
      const r = links.map((x) => x.getBoundingClientRect());
      return { n: links.length, lefts: new Set(r.map((x) => Math.round(x.left))).size, widths: new Set(r.map((x) => Math.round(x.width))).size, heights: new Set(r.map((x) => Math.round(x.height))).size,
        cut: links.map((x) => x.querySelector('.ql-name')).filter((x) => x && x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent) };
    });
    ok(q.n > 0 && q.lefts === 1 && q.widths === 1 && q.heights === 1 && !q.cut.length, `${tab}: one link per row, all the same size, no name cut off: ${JSON.stringify(q)}`);
  }
  await p.locator('#ql-panel').screenshot({ path: `${SP}/quick-links.png` });
  await p.keyboard.press('Escape');

  // The Missions list: pills one width; months, days and years each in a line.
  await p.evaluate(() => { location.hash = '#/operations'; }); await p.waitForSelector('.ops-table');
  const pw = await p.$$eval('.ops-table .pill', (xs) => xs.map((x) => Math.round(x.getBoundingClientRect().width)));
  ok(same(pw), `Missions: the status pills are one width: ${pw}`);
  const m = await lined('.ops-table td:nth-child(3) .dc-m'); const d = await lined('.ops-table td:nth-child(3) .dc-d'); const y = await lined('.ops-table td:nth-child(3) .dc-y');
  ok(same(m) && same(d) && same(y), `Missions: start dates in month / day / year columns: ${m} | ${d} | ${y}`);
  await p.screenshot({ path: `${SP}/missions.png` });

  // A Mission's cases: Last / First / M.I. columns, dates lined up, nothing past the right edge.
  await p.evaluate((o) => { location.hash = `#/operation/${o}`; }, ids.op); await p.waitForSelector('.op-cases-table');
  const heads = await p.$$eval('.op-cases-table th', (x) => x.map((e) => e.textContent));
  ok(['Last Name', 'First Name', 'M.I.'].every((t) => heads.includes(t)), `Mission table headers: ${heads.join(' | ')}`);
  const names = await p.$$eval('.op-cases-table tbody tr', (rs) => rs.map((r) => [...r.querySelectorAll('td.name-cell')].map((c) => c.textContent.trim())));
  ok(names.some((n) => n.join('|') === 'DOE|John|Q.') && names.some((n) => n.join('|') === 'ROE-POEZ|Mary|—'), `the subject split into Last / First / M.I.: ${JSON.stringify(names)}`);
  const om = await lined('.op-cases-table .dc-m'); const od = await lined('.op-cases-table .dc-d'); const oy = await lined('.op-cases-table .dc-y');
  ok(same(om) && same(od) && same(oy), `Mission page: opened dates lined up: ${om} | ${od} | ${oy}`);
  // v1.131: measured once the Closing column has filled in (short words; the full sentence is the
  // tooltip) and every font face has loaded.
  await p.waitForFunction(() => document.querySelectorAll('.op-closing .closing-state').length === document.querySelectorAll('.op-closing').length);
  const fits = (sel) => p.evaluate(async (q) => { await document.fonts.ready; const t = document.querySelector(q); return [t.scrollWidth, t.closest('.table-wrap').clientWidth]; }, sel);
  const closing = await p.$$eval('.op-closing .closing-state', (xs) => xs.map((x) => [x.textContent, x.title]));
  ok(closing.length && closing.every(([t, full]) => t && full), `the Closing column is filled, the full sentence on hover: ${JSON.stringify(closing)}`);
  const [ow, oc] = await fits('.op-cases-table');
  ok(ow <= oc + 1, `the Mission table fits at 1366 wide: ${ow} / ${oc}`);
  await p.locator('.op-cases-table').screenshot({ path: `${SP}/mission.png` });

  // General Files: the same dates and pills.
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForSelector('.general-table');
  const gp = await p.$$eval('.general-table .pill', (xs) => xs.map((x) => [Math.round(x.getBoundingClientRect().width), x.scrollWidth <= x.clientWidth]));
  const gm = await lined('.general-table .dc-m'); const gy = await lined('.general-table .dc-y');
  ok(same(gp.map((x) => x[0])) && gp.every((x) => x[1]) && same(gm) && same(gy), `General Files: pills one width and whole, dates lined up: ${JSON.stringify(gp)} ${gm} | ${gy}`);
  const [gw, gc] = await fits('.general-table');
  ok(gw <= gc + 1, `General Files fits at 1366 wide: ${gw} / ${gc}`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
