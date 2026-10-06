const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, errs } = await boot(1366, 900);
  // Several closed and archived cases so the bottom area scrolls.
  await p.evaluate(async () => {
    for (let i = 0; i < 6; i++) { const c = await Vault.createCase({ number: `EX-${500 + i}`, subject: `Rick Poe ${i}` }); c.status = 'Closed'; c.closure = { disposition: 'unfounded', date: '2026-10-01' }; c.dates.closed = '2026-10-01'; await Vault.saveCase(c); }
    for (let i = 0; i < 4; i++) { const c = await Vault.createCase({ number: `EX-${700 + i}`, subject: `Jane Roe ${i}` }); await Vault.archiveCase(c.id, false, 'nolle', 'test'); }
  });
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(1000);
  await p.evaluate(() => { document.getElementById('closed-cases').open = true; document.getElementById('archived-cases').open = true; document.querySelectorAll('#closed-list details').forEach((d) => { d.open = true; }); });
  await p.waitForTimeout(400);
  const hs = await p.evaluate(() => [document.getElementById('ql-footer').getBoundingClientRect().height, document.getElementById('side-bottom').getBoundingClientRect().height, getComputedStyle(document.body).getPropertyValue('--cv-panel-h')]);
  console.log('heights', hs);
  ok(Math.abs(hs[0] - hs[1]) < 1.5, 'Quick Links and the bottom area are the same height');
  ok(!(await p.$('.panel-grip, .panel-lock')), 'no drag bars or padlocks');
  // Scroll the bottom area a little with the wheel; it should settle on a whole card.
  const sb = await p.$('#side-bottom'); const box = await sb.boundingBox();
  await p.mouse.move(box.x + 100, box.y + 60);
  const tops = [];
  for (let i = 0; i < 4; i++) {
    await p.mouse.wheel(0, Number(process.env.STEP || 45)); await p.waitForTimeout(900);
    tops.push(await p.evaluate(() => {
      const el = document.getElementById('side-bottom'); const r = el.getBoundingClientRect();
      // The heading pinned at the top, and the first card under it: is a card cut by the heading?
      const heads = [...el.querySelectorAll(':scope > details > summary')].filter((x) => { const t = x.getBoundingClientRect().top - r.top; return t > -1 && t < 2; });
      const hb = heads.length ? heads[0].getBoundingClientRect().bottom : r.top;
      const cards = [...el.querySelectorAll('.case-item, .op-head, .arch-sub-head')].filter((x) => !heads.some((hd) => hd.contains(x)));
      const cut = cards.filter((x) => { const b = x.getBoundingClientRect(); return b.top < hb - 1 && b.bottom > hb + 1; }).map((x) => x.textContent.trim().slice(0, 20))
        .concat([...el.querySelectorAll('.op-group, :scope > details')].filter((x) => { const b = x.getBoundingClientRect(); return b.top < hb - 1 && b.bottom > hb + 1.5 && b.bottom - hb < 18; }).map((x) => 'sliver:' + x.className));
      const aligned = !cut.length;
      return { scrollTop: Math.round(el.scrollTop), aligned, cut };
    }));
  }
  console.log(tops);
  console.log('geom', await p.evaluate(() => { const el = document.getElementById('side-bottom'); const r = el.getBoundingClientRect(); const g = (x) => { const b = x.getBoundingClientRect(); return [Math.round(b.top - r.top), Math.round(b.bottom - r.top)]; }; const cd = document.getElementById('closed-cases'); const cs = getComputedStyle(cd); return { st: el.scrollTop, closed: g(cd), closedSum: g(cd.querySelector('summary')), list: g(document.getElementById('closed-list')), arch: g(document.getElementById('archived-cases')), pad: cs.paddingBottom, mb: cs.marginBottom, bb: cs.borderBottomWidth, listMb: getComputedStyle(document.getElementById('closed-list')).marginBottom + '/' + getComputedStyle(document.getElementById('closed-list')).paddingBottom }; }));
  console.log('last card', await p.evaluate(() => { const el = document.getElementById('side-bottom'); const r = el.getBoundingClientRect(); const cards = [...el.querySelectorAll('.case-item, .op-head, .arch-sub-head, :scope > details > summary')].filter((x) => x.getClientRects().length); const last = cards[cards.length - 1].getBoundingClientRect(); return { lastBottom: Math.round(last.bottom - r.top), panel: Math.round(r.height), text: cards[cards.length - 1].textContent.trim().slice(0, 30) }; }));
  ok(tops.every((t) => t.aligned || t.scrollTop === 0), 'every stop has a card starting at the top edge');
  await p.locator('#side-bottom').screenshot({ path: process.env.SP + '/v188/sidebar.png' });
  await p.setViewportSize({ width: 1920, height: 1080 }); await p.waitForTimeout(600);
  const hs2 = await p.evaluate(() => [document.getElementById('ql-footer').getBoundingClientRect().height, document.getElementById('side-bottom').getBoundingClientRect().height]);
  ok(Math.abs(hs2[0] - hs2[1]) < 1.5, `still equal at 1920 (${hs2.map(Math.round)})`);
  console.log('errors', errs); await b.close(); })();
