// v1.138: the suspect on the right of each timeline event, every name the same width so they line up;
// the vault door as the top-left logo. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1138';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => {
    const ev = (n, date, title, suspect, extra = {}) => ({ id: `t${n}`, date, time: '', kind: 'buy', title, note: '', suspect, color: '', done: false, ...extra });
    await Vault.saveTimeline(id, { events: [
      ev(1, '2026-09-01', 'Buy 1', 'Johnathan Q Doe', { drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }),
      ev(2, '2026-09-08', 'A much longer event title for the second buy at the Example City park', 'Rick Poe'),
      ev(3, '2026-09-15', 'Buy 3', 'Johnathan Q Doe', { note: 'Met at the gas station on Example Road.' }),
      ev(4, '2026-09-20', 'Surveillance', '', { kind: 'event' }),
    ] });
  }, ids.c2);
  await p.evaluate((i) => { location.hash = `#/case/${i}/timeline`; }, ids.c2); await p.waitForSelector('.tl-item'); await p.waitForTimeout(400);

  const geo = await p.$$eval('.tl-item', (x) => x.map((e) => {
    const body = e.querySelector('.tl-body').getBoundingClientRect(); const s = e.querySelector('.tl-who .tl-suspect');
    const r = s && s.getBoundingClientRect();
    return { title: e.querySelector('strong').textContent.slice(0, 12), name: s ? s.textContent : '', inTitle: !!e.querySelector('.tl-title .tl-suspect'),
      right: r ? Math.round(body.right - r.right) : null, w: r ? Math.round(r.width) : null, l: r ? Math.round(r.left) : null, cut: s ? s.scrollWidth > s.clientWidth + 1 : false };
  }));
  const named = geo.filter((g) => g.name);
  ok(named.length === 3 && !geo.some((g) => g.inTitle), `the names are out of the title line: ${JSON.stringify(geo)}`);
  ok(named.every((g) => g.w === named[0].w && g.l === named[0].l), 'every name box has the same width and lines up');
  ok(named.every((g) => g.right >= 0 && g.right < 30), 'the names sit on the right of the event box');
  ok(!named.some((g) => g.cut), 'no name is cut off');
  await p.locator('.timeline').screenshot({ path: `${SP}/timeline.png` });

  // Phone width: still beside the event, not cut off.
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
  const small = await p.$$eval('.tl-who .tl-suspect', (x) => x.map((s) => s.scrollWidth <= s.clientWidth + 1));
  ok(small.length === 3 && small.every(Boolean), 'no name is cut off at phone width');
  await p.setViewportSize({ width: 1366, height: 900 }); await p.waitForTimeout(300);

  const logo = await p.evaluate(() => { const s = document.querySelector('.brand .brand-vault'); return s && { w: Math.round(s.getBoundingClientRect().width), img: !!document.querySelector('.brand img'), wheel: !!s.querySelector('.hv-wheel') }; });
  ok(logo && logo.w === 30 && !logo.img && logo.wheel, `the top-left logo is the vault door: ${JSON.stringify(logo)}`);
  await p.hover('.brand'); await p.waitForTimeout(800);
  const turned = await p.$eval('.brand-vault .hv-wheel', (g) => getComputedStyle(g).transform);
  ok(turned !== 'none', `its handle turns under the pointer: ${turned}`);
  await p.locator('.topbar').screenshot({ path: `${SP}/topbar.png` });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
