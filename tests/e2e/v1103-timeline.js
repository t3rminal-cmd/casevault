// v1.103: the home page's Mission timeline is the Details tab's slim line with small circles
// (not the sideways-scrolling strip, not the big vertical list); links don't underline on hover.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs, ids } = await boot();
  const c4 = await p.evaluate(async (ids) => {
    const op = Vault.listOperations()[0];
    const c = await Vault.createCase({ number: 'EX-400', subject: 'Mary Doe' }); await Vault.assignCase(c.id, op.id);
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    await Vault.saveTimeline(ids.c2, { events: [{ id: 'a', kind: 'event', date: d(-40), title: 'Controlled buy' }, { id: 'c', kind: 'deadline', date: d(-2), title: 'Warrant return' }, { id: 'd', kind: 'deadline', date: d(10), title: 'Grand jury' }] });
    await Vault.saveTimeline(c.id, { events: [{ id: 'e', kind: 'event', date: d(-20), title: 'Search warrant served', note: 'Two units, Example City' }] });
    return c.id;
  }, ids);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(900);
  await p.click('.op-folder-tile'); await p.waitForSelector('.op-timeline-section .mini-tl-dot');
  ok(await p.locator('.op-timeline-section .htl, .op-timeline-section .tl-modern').count() === 0, 'neither the scrolling strip nor the vertical list');
  ok(await p.locator('.op-timeline-section .mini-tl-dot').count() === 4, 'one small circle per event, from both case numbers');
  ok(await p.locator('.op-timeline-section .mini-tl-today').count() === 1, 'a Today mark');
  ok(await p.locator('.op-timeline-section .mini-tl-dot.overdue').count() === 1, 'the overdue deadline is red');
  const fit = await p.evaluate(() => { const l = document.querySelector('.op-timeline-section .mini-tl-line'); return l.scrollWidth <= l.clientWidth + 1; });
  ok(fit, 'no sideways scrolling');
  const tip = await p.getAttribute('.op-timeline-section .mini-tl-dot[data-tip*="Search warrant"]', 'data-tip');
  ok(/Example City/.test(tip || '') && /EX-400/.test(tip || ''), 'pointing at a circle shows the date, title, note and case number');
  const dot = p.locator('.op-timeline-section .mini-tl-dot[data-tip*="Search warrant"]');
  await dot.click(); await p.waitForTimeout(900);
  ok(await p.evaluate((id) => location.hash === `#/case/${encodeURIComponent(id)}/timeline`, c4), 'a click opens that case\'s Timeline tab');
  // Links in general: the accent colour on hover, never an added underline.
  await p.evaluate(() => { location.hash = '#/operations'; }); await p.waitForTimeout(900);
  const link = p.locator('a[href]:not(.btn):not(.tab):not(.case-item):visible', { hasText: 'OP-1' }).first();
  const rest = await link.evaluate((a) => getComputedStyle(a).textDecorationLine);
  await link.hover(); await p.waitForTimeout(250);
  const over = await link.evaluate((a) => ({ hover: a.matches(':hover'), deco: getComputedStyle(a).textDecorationLine }));
  ok(over.hover && over.deco === rest, `a link under the mouse keeps its look (${rest} → ${over.deco})`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
