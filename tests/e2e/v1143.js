// v1.143: no "null" (or undefined / NaN) shown anywhere, the Arrest Report first of all; an arrest from
// the Arrest Report goes under the suspect it is about on the Timeline (one filter, with handcuffs),
// even when the name is written another way. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1143';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => {
    const c = await Vault.getCase(id); c.arrest = true; await Vault.saveCase(c);
    await Vault.writeCaseJSON(id, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'Johnathan', middleName: 'Q', lastName: 'Doe', date: '2026-09-10' }] });
    await Vault.saveTimeline(id, { events: [
      { id: 'e1', date: '2026-09-01', time: '', kind: 'buy', title: 'Buy 1', note: '', suspect: 'DOE, Johnathan', color: '', done: false, drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' },
      { id: 'e2', date: '2026-09-05', time: '', kind: 'event', title: 'Surveillance', note: '', suspect: 'Rick Poe', color: '', done: false },
    ] });
  }, ids.c);
  const scan = () => p.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode.textContent; if (/\b(null|undefined|NaN)\b/.test(t) && !w.currentNode.parentElement.closest('script,style,textarea')) out.push(`${w.currentNode.parentElement.className}: ${t.trim().slice(0, 60)}`); }
    for (const e of document.querySelectorAll('input')) if (/^(null|undefined|NaN)$/.test(e.value)) out.push(`input ${e.getAttribute('aria-label')}: ${e.value}`);
    return out;
  });

  // 1. The Arrest Report (and every other page) shows no "null".
  await p.evaluate((i) => { location.hash = `#/case/${i}/arrest`; }, ids.c); await p.waitForSelector('.arrest-toolbar'); await p.waitForTimeout(500);
  const arrestFound = await scan();
  ok(!arrestFound.length, `no "null" on the Arrest Report: ${JSON.stringify(arrestFound)}`);
  await p.screenshot({ path: `${SP}/arrest.png` });
  const routes = ['#/', '#/general', '#/operations', `#/operation/${ids.op}`, '#/reference'];
  for (const t of ['details', 'timeline', 'draft', 'arrest', 'reports', 'files', 'linkchart']) routes.push(`#/case/${ids.c}/${t}`, `#/case/${ids.c2}/${t}`);
  const bad = [];
  for (const r of routes) {
    await p.evaluate((x) => { location.hash = '#/x'; location.hash = x; }, r); await p.waitForTimeout(700);
    const f = await scan();
    if (f.length) bad.push(`${r} ${JSON.stringify(f)}`);
  }
  ok(!bad.length, `no "null" / "undefined" / "NaN" on ${routes.length} pages: ${bad.join(' | ')}`);

  // 2. Timeline: the arrest is under the suspect already there ("DOE, Johnathan"), one filter each.
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${i}/timeline`; }, ids.c); await p.waitForSelector('.tl-item'); await p.waitForTimeout(400);
  const chips = await p.$$eval('.tl-legend-chip', (x) => x.map((e) => ({ name: e.querySelector('.tl-legend-name').firstChild.textContent, count: (e.querySelector('.count') || {}).textContent, cuffs: !!e.querySelector('.tl-legend-cuffs') })));
  ok(chips.length === 2 && chips.some((c) => c.name === 'DOE, Johnathan' && c.count === '2' && c.cuffs) && chips.some((c) => c.name === 'Rick Poe' && !c.cuffs), `one filter per suspect, the arrest under it: ${JSON.stringify(chips)}`);
  const arrest = await p.$eval('.tl-item.arrest', (e) => ({ title: e.querySelector('strong').textContent, who: e.querySelector('.tl-suspect').textContent }));
  ok(arrest.title === 'Arrest of Johnathan Q Doe' && arrest.who === 'DOE, Johnathan', `the arrest shows the name from the report and the suspect's name: ${JSON.stringify(arrest)}`);
  await p.click('.tl-legend-chip:has-text("DOE, Johnathan") .tl-legend-name'); await p.waitForTimeout(300);
  const shown = await p.$$eval('.tl-item strong', (x) => x.map((e) => e.textContent));
  ok(shown.join(',') === 'Buy 1,Arrest of Johnathan Q Doe', `filtering by the suspect shows their arrest too: ${shown.join(',')}`);
  await p.locator('.tl-legend').screenshot({ path: `${SP}/legend.png` });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
