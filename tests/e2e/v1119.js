// v1.119: whole Quick Links on the slim bar, messages and round buttons clear of the page, the
// Details tab's first row, the Mission page's table; Buys on the timeline with a Buy Summary and a
// Timeline PDF; reuse an arrestee; the person view; a Mission's closing progress; the unsaved dot.
// All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1119';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 768);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.quick-actions'); await p.waitForTimeout(500);
  // 1–3: v1.121 replaced the slim Quick Links bar with a side panel (tests/e2e/v163-quicklinks.js).
  // Messages still rise above the round corner buttons.
  await p.evaluate(() => window.CaseVaultUI.toast('A message for the test.', 'warn', 30000));
  await p.waitForTimeout(300);
  const geo = await p.evaluate(() => { const dock = document.querySelector('#fab-dock').getBoundingClientRect(); const t = [...document.querySelectorAll('.toast')].pop().getBoundingClientRect(); return { toastAbove: t.bottom <= dock.top + 0.5 }; });
  ok(geo.toastAbove, `the message sits above the round buttons: ${JSON.stringify(geo)}`);
  await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  // 4. Top bar: Memory at once; captions on one line.
  const caps = await p.evaluate(() => [...document.querySelectorAll('.tb-status > :not([hidden]):not(#ai-activity)')].map((e) => [e.id, Math.round(e.getBoundingClientRect().bottom)]));
  ok(caps.some(([k]) => k === 'mem-status') && new Set(caps.map(([, y]) => y)).size === 1, `top-bar icons, all the same height: ${JSON.stringify(caps)}`);
  await p.screenshot({ path: `${SP}/landing.png` });

  // 5-7. Details: no Closed box while open, the hint in one line, no second Mission link.
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c2); await p.waitForSelector('.details-row-title');
  const det = await p.evaluate(() => {
    const row = document.querySelector('.details-row-title'); const boxes = [...row.querySelectorAll(':scope > .field')].filter((x) => x.getClientRects().length);
    const hs = boxes.map((x) => Math.round(x.getBoundingClientRect().height));
    return { closedShown: !!document.querySelector('input[aria-label="Closed"]').getClientRects().length, hs, hintOneLine: !document.querySelector('.status-hint'), // v1.176: the hint is the Status box's hover box
      opLinks: document.querySelectorAll('#main a[href^="#/operation/"]').length };
  });
  ok(!det.closedShown && Math.max(...det.hs) - Math.min(...det.hs) < 4 && det.hintOneLine && det.opLinks === 1, `Details' first row even, no Closed box, one Mission link: ${JSON.stringify(det)}`);
  await p.screenshot({ path: `${SP}/details.png` });

  // 8. Mission page table: every column named, Opened lined up left.
  await p.evaluate((o) => { location.hash = `#/operation/${o}`; }, ids.op); await p.waitForSelector('.op-cases-table');
  const heads = await p.$$eval('.op-cases-table th', (x) => x.map((e) => [e.textContent, getComputedStyle(e).textAlign]));
  ok(heads.every(([t, a]) => t && a !== 'right') && heads.some(([t]) => t === 'Go To'), `Mission table headers: ${heads.map((x) => x[0]).join(' | ')}`);

  // 9 + 14. Buys on the timeline; the Buy Summary; Print Timeline.
  await p.evaluate(async (id) => {
    const t = await Vault.getTimeline(id);
    t.events.push(
      { id: Vault.newId('e'), date: '2026-09-01', kind: 'buy', title: 'Buy 1', suspect: 'John Doe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' },
      { id: Vault.newId('e'), date: '2026-09-08', kind: 'buy', title: 'Buy 2', suspect: 'Rick Poe', drug: 'Heroin', qty: '2', unit: 'g', paid: '180' },
      { id: Vault.newId('e'), date: '2026-09-15', kind: 'buy', title: 'Buy 3', suspect: 'John Doe', drug: 'Cocaine', qty: '7', unit: 'g', paid: '400' },
      { id: Vault.newId('e'), date: '2026-09-20', kind: 'event', title: 'Surveillance', suspect: 'John Doe' });
    Vault.sortEvents(t.events); await Vault.saveTimeline(id, t);
  }, ids.c2);
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${i}/timeline`; }, ids.c2);
  // The case's own Timeline, not the Mission page's that was on screen a moment before (it has one too).
  await p.waitForFunction(() => document.querySelector('#case-title') && document.querySelector('.tl-tools'));
  await p.evaluate(() => { const f = document.querySelector('.timeline-form'); if (f && f.hidden) document.querySelector('.tl-add-btn').click(); }); // v1.177: the form opens from Add Event
  // Add one more through the form.
  await p.selectOption('.timeline-form select:near(:text("Type"))', 'buy').catch(async () => { await p.$eval('.timeline-form select', (s) => { s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); }); });
  await p.evaluate(() => { const s = [...document.querySelectorAll('.timeline-form select')].find((x) => [...x.options].some((o) => o.value === 'buy')); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); const el = document.querySelector('.timeline-form .date-field'); el.value = '2026-09-22'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForSelector('.tl-buy-row:not([hidden])');
  await p.fill('.timeline-form .tl-title-input', 'Buy 4');
  await p.fill('.timeline-form input[aria-label="Suspect"]', 'Rick Poe');
  await p.fill('.timeline-form input[aria-label="Narcotic"]', 'Heroin');
  await p.fill('.timeline-form input[aria-label="Amount"]', '1.5');
  await p.fill('.timeline-form input[aria-label="Paid"]', '$120');
  await p.locator('.timeline-form').screenshot({ path: `${SP}/buy-form.png` }).catch(() => {});
  await p.click('.timeline-form button[type=submit]'); await p.waitForTimeout(600);
  const saved = await p.evaluate(async (id) => (await window.CaseVaultUI.Save.flushAll(), (await Vault.getTimeline(id)).events.find((e) => e.title === 'Buy 4')), ids.c2);
  ok(saved && saved.kind === 'buy' && saved.drug === 'Heroin' && saved.qty === '1.5' && saved.paid === '120' && saved.unit === 'g', `a Buy from the form keeps its narcotic, amount and money: ${JSON.stringify(saved)}`);
  ok(/Heroin · 1\.5 g · \$120/.test(await p.textContent('.tl-item:has-text("Buy 4") .tl-buy')), 'the timeline shows what was bought and paid');
  await p.click('.tl-tools button:has-text("Buy Summary")'); await p.waitForSelector('#dialog[open] .buy-summary');
  const sum = await p.$$eval('#dialog[open] .buy-group', (x) => x.map((g) => [g.querySelector('strong').textContent, g.querySelector('.buy-group-head .muted').textContent, g.querySelector('tfoot').textContent]));
  ok(sum.length === 2 && sum[0][0] === 'John Doe' && /2 buys · \$600 paid/.test(sum[0][1]) && /10\.5 g/.test(sum[0][2]) && /Rick Poe/.test(sum[1][0]) && /\$300/.test(sum[1][1]) && /3\.5 g/.test(sum[1][2]), `Buy Summary by suspect with totals: ${JSON.stringify(sum)}`);
  await p.locator('#dialog[open] form, #dialog[open] .buy-summary').first().screenshot({ path: `${SP}/buy-summary.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("PDF")'); await p.waitForSelector('#dialog[open] .pdf-view'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SP}/buy-summary-pdf.png` });
  ok(true, 'the Buy Summary opens as a PDF');
  await p.click('#dialog[open] button:has-text("Done")'); await p.waitForTimeout(300);
  // Print only Rick Poe's events.
  await p.click('.tl-legend-name:has-text("Rick Poe")'); await p.waitForTimeout(200);
  const pdfText = await p.evaluate(async (id) => {
    const O = CVOperation; const t = await Vault.getTimeline(id);
    const rows = O.mergeEvents([{ caseId: id, number: 'EX-200', events: t.events }]).filter(({ ev }) => O.suspectKey(ev.suspect) === 'rick poe');
    const bytes = CVTimelinePdf.build({ title: 'Timeline', rows, fmtDate: (d) => d }); return [...bytes].map((x) => String.fromCharCode(x)).join('');
  }, ids.c2);
  ok(pdfText.includes('Buy 2') && pdfText.includes('Buy 4') && !pdfText.includes('Buy 1') && pdfText.includes('BUY SUMMARY'), 'the Timeline PDF of one suspect has only their events and buys');
  await p.click('.tl-tools button:has-text("Print Timeline")'); await p.waitForSelector('#dialog[open] .pdf-view'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SP}/timeline-pdf.png` });
  await p.click('#dialog[open] button:has-text("Done")'); await p.waitForTimeout(300);

  // 10. Copy an arrestee from another case number of the Mission.
  const ex201 = await p.evaluate(async ({ op, c2 }) => {
    const n = await Vault.createCase({ number: 'EX-201', subject: 'John Doe' });
    await Vault.assignCase(n.id, op);
    await Vault.writeCaseJSON(c2, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'John', lastName: 'Doe', dob: '1990-01-02', address: '100 Example St, Example City', rdNumber: 'EX-200', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery of a Controlled Substance' }], properties: [{ inventory: '7000001', description: 'Prisoner Money' }] }] });
    const c = await Vault.getCase(c2); c.arrest = true; c.people = ['John Doe']; await Vault.saveCase(c);
    const x = await Vault.getCase(n.id); x.arrest = true; await Vault.saveCase(x);
    return n.id;
  }, { op: ids.op, c2: ids.c2 });
  await p.evaluate((i) => { location.hash = `#/case/${i}/arrest`; }, ex201); await p.waitForSelector('.arrest-toolbar'); await p.waitForTimeout(600);
  await p.click('button:has-text("Copy From Another Case")'); await p.waitForSelector('#dialog[open] .copy-row');
  ok(/John Doe/.test(await p.textContent('#dialog[open] .copy-row')) && /RD EX-200/.test(await p.textContent('#dialog[open] .copy-row')), 'the Mission\'s other arrestee is offered');
  await p.click('#dialog[open] .copy-row button:has-text("Copy")'); await p.waitForTimeout(400);
  await p.click('.arrest-toolbar button:has-text("Save")'); await p.waitForTimeout(600);
  const copied = await p.evaluate(async (id) => (await window.__readCaseJSON(id, 'arrest.json')).arrestees, ex201);
  ok(copied.length === 1 && copied[0].firstName === 'John' && copied[0].lastName === 'Doe' && copied[0].dob === '1990-01-02' && copied[0].rdNumber === 'EX-201' && !(copied[0].properties || []).length && !/Delivery/.test(JSON.stringify(copied[0].charges)),
    `copied into the blank arrestee with this RD, without the other case's charges or property: ${JSON.stringify({ n: copied.length, rd: copied[0].rdNumber, dob: copied[0].dob })}`);

  // 13. The Mission's closing progress.
  await p.evaluate(async (i) => { const x = await Vault.getCase(i); x.status = 'Closed'; x.dates.closed = '2026-10-01'; x.closure = { disposition: 'arrest', date: '2026-10-01', arrestRef: { id: 'x', number: 'EX-200' } }; await Vault.saveCase(x); }, ex201);
  await p.evaluate((o) => { location.hash = '#/x'; location.hash = `#/operation/${o}`; }, ids.op); await p.waitForSelector('.op-progress strong'); await p.waitForTimeout(400);
  const prog = await p.evaluate(() => ({ head: document.querySelector('.op-progress strong').textContent, rows: [...document.querySelectorAll('.op-cases-table tbody tr')].map((r) => [r.querySelector('.case-num-link').textContent, r.querySelector('.op-closing').textContent, r.querySelector('.op-closing .closing-state').title]) }));
  ok(prog.head === '1 of 2 cases closed' && prog.rows.some(([n, t, full]) => n === 'EX-200' && t === 'Report ready' && /Arrest report ready/.test(full)) && prog.rows.some(([n, t, full]) => n === 'EX-201' && t === 'Closed by arrest' && /Closed by arrest \(report on RD EX-200\)/.test(full)), `Mission progress: ${JSON.stringify(prog)}`);
  await p.locator('.op-page').screenshot({ path: `${SP}/mission.png` }).catch(() => {});

  // 11. The person view: every case with John Doe, other spellings flagged.
  await p.evaluate(async (c) => { const x = await Vault.createCase({ number: 'EX-500', subject: 'DOE, Jon' }); void x; }, null);
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${i}/details`; }, ids.c2); await p.waitForSelector('.suspects');
  // The Mission's case numbers share their suspects: both get John Doe.
  await p.evaluate(async ({ a, b2 }) => { for (const id of [a, b2]) { const c = await Vault.getCase(id); c.suspects = [{ name: 'John Doe', role: 'Primary', info: {} }]; await Vault.saveCase(c); } location.hash = '#/x'; location.hash = `#/case/${a}/details`; }, { a: ids.c2, b2: ex201 });
  await p.waitForSelector('.suspects .person-btn', { state: 'attached' });
  await p.evaluate(() => document.querySelector('.suspects .person-btn').click()); await p.waitForSelector('#dialog[open] .person-view', { timeout: 15000 });
  const person = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#dialog[open] .person-table tbody tr')].map((r) => [...r.cells].map((x) => x.textContent)), variants: (document.querySelector('#dialog[open] .person-variants') || {}).textContent || '', events: document.querySelectorAll('#dialog[open] .person-event-list li').length }));
  ok(person.rows.some((r) => r[0] === 'EX-200' && /Primary/.test(r[3]) && /Arrestee/.test(r[3])) && person.rows.some((r) => r[0] === 'EX-201') && person.rows.some((r) => r[0] === 'EX-500') && /DOE, Jon/.test(person.variants) && person.events >= 3,
    `the person view: ${JSON.stringify(person).slice(0, 400)}`);
  await p.locator('#dialog[open] .person-view').screenshot({ path: `${SP}/person.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Done")'); await p.waitForTimeout(200);

  // 12. A mark on the tab while a change waits to be saved.
  await p.fill('.details-row-title input[placeholder="No subject yet"]', 'Jane Q Roe');
  const marked = await p.evaluate(() => !!document.querySelector('.tabs a.tab.unsaved[href$="/details"]'));
  await p.waitForTimeout(1500);
  const cleared = await p.evaluate(() => !document.querySelector('.tabs a.tab.unsaved'));
  ok(marked && cleared, `the Details tab is marked while unsaved, then cleared (${marked}, ${cleared})`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
