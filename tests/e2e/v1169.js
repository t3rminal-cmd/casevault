// v1.169: no X on a closed case with an arrest; a folder's name unfolds it (and it stays open);
// the counts and arrows line up at every depth; no logo at the top left; on the Checks tab what a
// report is and its pair chosen by hand; inventory numbers against the evidence list; a past check
// marked Out of Date; and a draft checked before it is exported. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1169';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1400, 1000);
  ids.ind = await p.evaluate(async (ids) => {
    const op = Vault.listOperations()[0];
    for (const i of [ids.c, ids.c2]) await Vault.assignCase(i, op.id).catch(() => {});
    const c = await Vault.getCase(ids.c); c.status = 'Closed'; c.arrest = true; await Vault.saveCase(c);
    const d = await Vault.createCase({ number: 'EX-960', subject: 'Ann Roe' });
    const dd = await Vault.getCase(d.id); dd.status = 'Closed'; await Vault.saveCase(dd);
    const e = await Vault.createCase({ number: 'EX-961', subject: 'Sam Poe' });
    return e.id;
  }, ids);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(900);

  // 1. The sidebar.
  ok(await p.evaluate(() => !document.querySelector('.closed-arrest') && [...document.querySelectorAll('#case-list a.case-item.has-arrest')].every((a) => getComputedStyle(a).backgroundImage === 'none')), 'no X on a closed case with an arrest');
  ok(await p.evaluate(() => !document.querySelector('.brand svg, .brand img') && document.querySelector('.brand-name').textContent === 'CaseVault'), 'no logo at the top left');
  await p.evaluate(() => document.querySelectorAll('#case-list details').forEach((d) => { d.open = true; })); await p.waitForTimeout(400);
  const cols = await p.evaluate(() => [...document.querySelectorAll('#case-list details > summary')].filter((s) => s.getClientRects().length && s.querySelector(':scope > .op-count')).map((s) => [Math.round(s.querySelector(':scope > .op-count').getBoundingClientRect().left), Math.round(s.querySelector(':scope > .op-chev').getBoundingClientRect().right)]));
  ok(cols.length >= 5 && new Set(cols.map((x) => x[0])).size === 1 && Math.max(...cols.map((x) => x[1])) - Math.min(...cols.map((x) => x[1])) <= 1, `counts and arrows in one column at every depth: ${JSON.stringify(cols)}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});
  const head = (name) => p.evaluate((n) => { const s = [...document.querySelectorAll('#case-list details > summary')].find((x) => x.getClientRects().length && (x.querySelector('.op-name') || {}).textContent?.startsWith(n)); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, open: s.parentElement.open }; }, name);
  let s = await head('OP-1'); await p.mouse.click(s.x + s.w - 4, s.y + s.h / 2); await p.waitForTimeout(400);
  ok(!(await head('OP-1')).open, 'a click right of the arrow folds the folder');
  s = await head('OP-1'); await p.mouse.click(s.x + s.w * 0.35, s.y + s.h / 2); await p.waitForTimeout(800);
  const after = await head('OP-1');
  ok(after && after.open && /^#\/operation\//.test(await p.evaluate(() => location.hash)), 'a click on the name opens the Mission and unfolds its folder');
  s = await head('OP-1'); await p.mouse.click(s.x + s.w * 0.35, s.y + s.h / 2); await p.waitForTimeout(800);
  ok((await head('OP-1')).open, 'and it stays open on a second click');

  // 2. The Checks tab: what each report is, and its pair, chosen by hand.
  await p.evaluate(async (id) => {
    await Vault.addFile(id, new File(['On 03/04/2026 the UC paid $200. The narcotics were inventoried under Inventory #12345678 and #77777777.'], 'Report A.txt', { type: 'text/plain' }), { keepName: true });
    await Vault.addFile(id, new File(['On 03/04/2026 surveillance saw the UC. Inventory #12345678.'], 'Surv 1.txt', { type: 'text/plain' }), { keepName: true });
    await Vault.addFile(id, new File(['On 03/05/2026 surveillance saw another meeting. Inventory #99999999.'], 'Surv 2.txt', { type: 'text/plain' }), { keepName: true });
    await Vault.writeCaseJSON(id, 'report-fields.json', { evidence: [{ number: 1, inventory: '12345678', type: 'Narcotics', description: 'Cocaine' }, { number: 2, inventory: '55555555', type: 'Currency', description: 'US currency' }] });
  }, ids.ind);
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/checks`; }, ids.ind);
  await p.waitForSelector('.chk-aliases'); await p.waitForTimeout(800);
  await p.selectOption('select[aria-label="Document to check"]', '');
  await p.waitForTimeout(300);
  ok(await p.$$eval('.chk-kind-pick', (x) => x.length === 3), 'each report has a choice of what it is');
  ok(await p.$eval('.chk-pair-box', (x) => x.hidden), 'no pairs while there is no Buy report');
  await p.selectOption('select[aria-label="What Report A.txt is"]', 'buy'); await p.waitForTimeout(300);
  ok(await p.$eval('.chk-pair-box', (x) => !x.hidden && /Report A\.txt/.test(x.textContent)), 'Report A, now a Buy report, gets a pair choice');
  await p.selectOption('select[aria-label="Surveillance report for Report A.txt"]', 'Surv 2.txt'); await p.waitForTimeout(1200);
  const saved = await p.evaluate((i) => window.__readCaseJSON(i, 'case.json'), ids.ind);
  ok(saved.checkPairs && saved.checkPairs.kinds['Report A.txt'] === 'buy' && saved.checkPairs.fixed['Report A.txt'] === 'Surv 2.txt', `kept with the case: ${JSON.stringify(saved.checkPairs)}`);
  await p.locator('.chk-card').first().screenshot({ path: `${SP}/form.png` }).catch(() => {});
  await p.click('button:has-text("Run check")');
  await p.waitForSelector('.result-head', { timeout: 30000 }); await p.waitForTimeout(500);
  const res = await p.evaluate(() => ({ titles: [...document.querySelectorAll('.flag-list .flag .flag-title')].map((x) => x.textContent), pairs: (document.querySelector('.chk-pairs') || {}).textContent || '', docs: document.querySelector('.doc-list').textContent }));
  ok(/Report A\.txt with Surv 2\.txt \(paired by hand\)/.test(res.pairs) && /Report A\.txt \(Buy report/.test(res.docs), `the pair chosen by hand is used: ${res.pairs.replace(/\s+/g, ' ')}`);
  ok(res.titles.some((t) => /77777777 is not on the evidence list/.test(t)), 'an inventory number not on the evidence list is flagged');
  ok(res.titles.some((t) => /Exhibit 2 \(Inventory 55555555\) is not in the documents checked/.test(t)), `an exhibit no document gives is noted: ${JSON.stringify(res.titles)}`);

  // 3. A document changes: the check is Out of Date, with Run Again.
  const checkUrl = await p.evaluate(() => location.hash);
  await p.evaluate(async (id) => { await Vault.addFile(id, new File(['On 03/04/2026 surveillance saw the UC. Inventory #12345678. Updated.'], 'Surv 2.txt', { type: 'text/plain' }), { keepName: true, replace: true }); }, ids.ind);
  await p.evaluate(() => { location.hash = '#/x'; }); await p.waitForTimeout(200);
  await p.evaluate((h) => { location.hash = h; }, checkUrl); await p.waitForSelector('.result-head'); await p.waitForTimeout(600);
  ok(await p.evaluate(() => { const c = document.querySelector('.chk-stale-card'); return !!c && /Surv 2\.txt/.test(c.textContent) && !!c.querySelector('button'); }), 'the check says Out of Date, with Run Again');
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/checks`; }, ids.ind); await p.waitForSelector('.checks-table'); await p.waitForTimeout(400);
  ok(await p.$$eval('.checks-table .chk-stale', (x) => x.length === 1 && /Out of Date/.test(x[0].textContent)), 'and so does its row in Past Checks');

  // 4. A draft is checked before it is exported.
  await p.evaluate(async (i) => { await Vault.saveDraft(i, 'buy-narrative', { title: 'Buy Narrative', type: 'other' }, 'On 03/04/2026 the UC paid $250 for the narcotics.'); }, ids.ind);
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports', 'buy-narrative'), ids.ind); await p.waitForSelector('.draft-actions-bar', { timeout: 15000 });
  await p.click('.draft-actions-bar button:has-text("PDF View")');
  await p.waitForSelector('#dialog[open] .export-check', { timeout: 20000 });
  const warn = await p.textContent('#dialog[open] .export-check');
  ok(/Before You Export/.test(warn) && /\$250/.test(warn) && /\$200/.test(warn), `the mismatch is shown before export: ${warn.replace(/\s+/g, ' ').slice(0, 160)}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/export-check.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Export Anyway")');
  await p.waitForSelector('#dialog[open] .pdf-view', { timeout: 20000 });
  ok(true, 'Export Anyway goes on to the PDF');
  await p.click('#dialog[open] .pdf-view button:has-text("Done")'); await p.waitForTimeout(400);
  await p.click('.draft-actions-bar button:has-text("PDF View")');
  await p.waitForSelector('#dialog[open] .pdf-view', { timeout: 20000 });
  ok(true, 'the same text is not asked about again');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
