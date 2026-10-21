// v1.147: the sidebar's main folders say OPERATION and INDEPENDENT (no "CASES"); an Operation with a
// case that is due is highlighted red inside OPERATION; the names under the home page folders start at
// the left; every Status column has the word on the left and the icon on the right. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1147';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await p.evaluate(async ([id, day]) => {
    await Vault.saveTimeline(id, { events: [{ id: 'd1', date: day, time: '', kind: 'deadline', title: 'Lab report due', note: '', suspect: '', color: '', done: false }] });
    await Vault.createOperation({ name: 'Quiet Op', number: 'OP-2' });
  }, [ids.c2, iso(new Date(Date.now() - 86400000))]);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(500);
  if (!(await p.$eval('#sidebar .mission-group', (d) => d.open))) { await p.click('#sidebar .mission-group > summary .op-chev'); await p.waitForTimeout(250); }

  // 1. OPERATION and INDEPENDENT.
  const names = await p.evaluate(() => [document.querySelector('#sidebar .mission-group > summary .op-name').textContent, document.querySelector('#sidebar .general-group > summary .ind-name').textContent]);
  ok(names.join() === 'OPERATION,INDEPENDENT', `the main folders: ${names.join(' | ')}`);

  // 2. The Operation with a case due is red; the other is not; no bell on either.
  const ops = await p.$$eval('#sidebar .mission-children .op-group', (x) => x.map((d) => ({ num: d.querySelector('.op-num').textContent, red: d.classList.contains('has-reminder'), bg: getComputedStyle(d.querySelector(':scope > .op-head')).backgroundColor, border: getComputedStyle(d).borderTopColor, bell: !!d.querySelector(':scope > .op-head .case-bell') })));
  const due = ops.find((o) => o.num === 'OP-1'); const quiet = ops.find((o) => o.num === 'OP-2');
  ok(due && due.red && /179, 38, 30/.test(due.border) && due.bg !== quiet.bg && !due.bell && quiet && !quiet.red, `OP-1 (a case due) is red, OP-2 is not, no bells: ${JSON.stringify(ops)}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});

  // 3. The names under the home page folders start at the left of the tile.
  const tiles = await p.$$eval('.dashboard .op-folder-tile', (x) => x.filter((t) => t.offsetParent).map((t) => {
    const r = t.getBoundingClientRect(); const n = t.querySelector('.op-folder-name, .year-tile-name, .op-num') || t.lastElementChild;
    const nr = n.getBoundingClientRect();
    return { name: t.textContent.trim().slice(0, 18), left: Math.round(nr.left - r.left), align: getComputedStyle(t).alignItems };
  }));
  ok(tiles.length >= 5 && tiles.every((t) => t.align === 'flex-start' && t.left <= 16), `folder names start at the left: ${JSON.stringify(tiles.slice(0, 8))}`);
  await p.locator('.op-folders-section').first().screenshot({ path: `${SP}/folders.png` }).catch(() => {});

  // 4. Status columns: word left, icon right (General Files and the Operations list).
  for (const [route, sel] of [['#/general', '.general-table td > .pill'], ['#/operations', '.ops-table td > .pill']]) {
    await p.evaluate((r) => { location.hash = r; }, route); await p.waitForSelector(sel);
    const pills = await p.$$eval(sel, (x) => x.map((e) => {
      const box = e.getBoundingClientRect(); const svg = e.querySelector('svg').getBoundingClientRect();
      const r = document.createRange(); r.selectNodeContents([...e.childNodes].find((n) => n.nodeType === 3)); const t = r.getBoundingClientRect();
      return { left: Math.round(t.left - box.left), right: Math.round(box.right - svg.right), width: Math.round(box.width) };
    }));
    ok(pills.length && pills.every((x) => x.left <= 12 && x.right <= 12) && new Set(pills.map((x) => x.width)).size === 1, `${route}: status word left, icon right, one width: ${JSON.stringify(pills)}`);
  }
  await p.locator('.ops-page').screenshot({ path: `${SP}/ops.png` }).catch(() => {});
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
