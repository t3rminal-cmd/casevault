// v1.102: the home page's Mission timeline is the vertical one from a case's Timeline tab (no
// sideways scrolling), and links no longer underline when the mouse is over them.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs, ids } = await boot();
  const c4 = await p.evaluate(async (ids) => {
    const op = Vault.listOperations()[0];
    const c = await Vault.createCase({ number: 'EX-400', subject: 'Mary Doe' }); await Vault.assignCase(c.id, op.id);
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    await Vault.saveTimeline(ids.c2, { events: [{ id: 'a', kind: 'event', date: d(-40), title: 'Controlled buy' }, { id: 'c', kind: 'deadline', date: d(-2), title: 'Warrant return' }, { id: 'd', kind: 'deadline', date: d(10), title: 'Grand jury' }] });
    await Vault.saveTimeline(c.id, { events: [{ id: 'e', kind: 'event', date: d(-10), time: '14:30', title: 'Search warrant served', note: 'Two units, Example City' }] });
    return c.id;
  }, ids);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(900);
  await p.click('.op-folder-tile'); await p.waitForSelector('.op-timeline-section .tl-readonly');
  ok(await p.locator('.htl, .htl-wrap').count() === 0, 'no sideways-scrolling timeline any more');
  const titles = await p.$$eval('.tl-readonly .tl-item strong', (els) => els.map((e) => e.textContent));
  ok(JSON.stringify(titles) === JSON.stringify(['Controlled buy', 'Search warrant served', 'Warrant return', 'Grand jury']), `all case numbers' events, oldest first: ${titles.join(', ')}`);
  ok(await p.locator('.tl-readonly .tl-month').count() >= 1 && await p.locator('.tl-readonly .tl-today').count() === 1, 'month headings and one Today line, as on the Timeline tab');
  ok(await p.locator('.tl-readonly .tl-item.deadline.overdue').count() === 1, 'the overdue deadline is marked');
  ok(/14:30/.test(await p.textContent('.tl-readonly .tl-item:has-text("Search warrant served") .tl-when')) && /Example City/.test(await p.textContent('.tl-readonly .tl-item:has-text("Search warrant served")')), 'time and note show');
  const tl = await p.evaluate(() => { const w = document.querySelector('.tl-readonly'); return { sw: w.scrollWidth, cw: w.clientWidth, actions: w.querySelectorAll('.tl-actions, button, input').length }; });
  ok(tl.sw <= tl.cw + 1 && tl.actions === 0, 'fits the page width, read-only (no Edit/Delete)');
  const card = p.locator('.tl-readonly a.tl-body:has-text("Warrant return")');
  await card.hover(); await p.waitForTimeout(250);
  ok(await card.evaluate((a) => getComputedStyle(a).textDecorationLine) === 'none', 'no underline on a timeline card under the mouse');
  await p.locator('.tl-readonly a.tl-body:has-text("Search warrant served")').click(); await p.waitForTimeout(900);
  ok(await p.evaluate((id) => location.hash === `#/case/${encodeURIComponent(id)}/timeline`, c4), 'a click opens that case\'s Timeline tab');
  // Links in general: the accent colour on hover, never an underline.
  await p.evaluate(() => { location.hash = '#/operations'; }); await p.waitForTimeout(900);
  const link = p.locator('a[href]:not(.btn):not(.tab):not(.case-item):visible', { hasText: 'OP-1' }).first();
  const rest = await link.evaluate((a) => getComputedStyle(a).textDecorationLine);
  await link.hover(); await p.waitForTimeout(250);
  const over = await link.evaluate((a) => ({ hover: a.matches(':hover'), deco: getComputedStyle(a).textDecorationLine }));
  ok(over.hover && over.deco === rest, `a link under the mouse keeps its look (${rest} → ${over.deco})`);
  await p.screenshot({ path: process.env.SP + '/v1102/home-timeline.png' });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
