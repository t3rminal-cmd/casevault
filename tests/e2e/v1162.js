// v1.162: the Consistency Checker in the browser: Known Aliases on the Checks tab, the Timeline buys
// checked against the documents, confidence badges, the flags grouped by kind, Mark as Reviewed and
// Dismiss, Hide Low Confidence, and a check saved by an older version. All data is made up (Doe / Roe / Poe).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1162';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => {
    const aff = 'On March 3, 2026, Officer Mary Poez and Det. Rick Poe met Bill Doe at 1420 N. Fifth Avenue, Apt. #3-B. '
      + 'The UC bought 3.5 grams of cocaine from Bill Doe for $250 on March 3, 2026. '
      + 'The UC paid $200, $300 and $500, a total of $1,100. The suspect drove a car with plate ABC-1234.';
    const rep = 'On 03/03/2026 Officer Mary Poes and Det. Ricky Poe met William Doe at 1420 North 5th Ave #3B. '
      + 'The UC paid $200, $300 and $500 in three buys.';
    await Vault.addFile(id, new File([aff], 'Affidavit.txt', { type: 'text/plain' }), { keepName: true });
    await Vault.addFile(id, new File([rep], 'Report.txt', { type: 'text/plain' }), { keepName: true });
    const tl = await Vault.getTimeline(id);
    tl.events = [{ id: 'b1', kind: 'buy', date: '2026-03-03', title: 'Buy 1', suspect: 'Bill Doe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }];
    await Vault.saveTimeline(id, tl);
  }, ids.c);
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/checks`; }, ids.c);
  await p.waitForSelector('.chk-aliases'); await p.waitForTimeout(500);
  await p.selectOption('select[aria-label="Document to check"]', { label: (await p.$$eval('select[aria-label="Document to check"] option', (o) => o.map((x) => x.textContent))).find((t) => /Affidavit/.test(t)) });
  await p.fill('.chk-aliases', 'Rick Poe, Ricky Poe');
  await p.waitForTimeout(1200);
  const saved = await p.evaluate((i) => window.__readCaseJSON(i, 'case.json'), ids.c);
  ok(saved.checkAliases === 'Rick Poe, Ricky Poe', `Known Aliases saved with the case: ${JSON.stringify(saved.checkAliases)}`);

  await p.click('button:has-text("Run check")');
  await p.waitForSelector('.flag-list .flag', { timeout: 30000 }); await p.waitForTimeout(400);
  const res = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.flag-list .flag')];
    return {
      titles: cards.map((c) => c.querySelector('.flag-title').textContent),
      conf: cards.map((c) => (c.querySelector('.pill.conf') || {}).textContent || ''),
      groups: [...document.querySelectorAll('.flag-group-head')].map((x) => x.firstChild.textContent),
      buySource: cards.filter((c) => /Timeline says/.test(c.textContent)).map((c) => c.querySelector('.quote.none') && c.querySelector('.quote.none').textContent),
    };
  });
  ok(res.titles.some((t) => /Poez.*Poes/.test(t)), 'Poez / Poes flagged');
  ok(!res.titles.some((t) => /Rick|Ricky|Bill|William/.test(t)), `no alias or nickname flagged: ${JSON.stringify(res.titles)}`);
  ok(!res.titles.some((t) => /^Address/.test(t)), 'the two ways of writing the address are not flagged');
  ok(res.titles.some((t) => /Total doesn't add up: "\$1,100"/.test(t)), 'the wrong total is flagged');
  ok(res.buySource.length === 1 && /Timeline Buy Summary/.test(res.buySource[0]), `the buy differs from the Timeline: ${JSON.stringify(res.buySource)}`);
  ok(res.conf.length === res.titles.length && res.conf.every((c) => /^(High|Medium|Low) Confidence$/.test(c)), `every flag has a confidence: ${JSON.stringify(res.conf)}`);
  ok(res.groups.length >= 2 && res.groups.includes('Names') && res.groups.includes('Money, Weights and Totals'), `grouped by kind: ${JSON.stringify(res.groups)}`);
  await p.locator('.flag-list').screenshot({ path: `${SP}/flags.png` }).catch(() => {});

  // Hide Low Confidence.
  const nLow = res.conf.filter((c) => /^Low/.test(c)).length;
  await p.check('.hide-low input'); await p.waitForTimeout(200);
  const afterLow = await p.$$eval('.flag-list .flag', (c) => c.length);
  ok(nLow > 0 && afterLow === res.titles.length - nLow, `Hide Low Confidence hides ${nLow}: ${afterLow} left`);
  await p.uncheck('.hide-low input'); await p.waitForTimeout(200);

  // Dismiss hides a flag (until "Dismissed only"); Mark as Reviewed keeps it, greyed.
  const first = p.locator('.flag-list .flag').first();
  const firstTitle = await first.locator('.flag-title').textContent();
  await first.locator('button:has-text("Dismiss")').click(); await p.waitForTimeout(300);
  const gone = await p.$$eval('.flag-list .flag-title', (t, x) => !t.some((e) => e.textContent === x), firstTitle);
  ok(gone, 'a dismissed flag leaves the list');
  await p.selectOption('select[aria-label="Show"]', 'dismissed'); await p.waitForTimeout(200);
  ok(await p.$$eval('.flag-list .flag', (c, x) => c.length === 1 && c[0].querySelector('.flag-title').textContent === x && c[0].classList.contains('status-dismissed'), firstTitle), '"Dismissed only" shows it');
  await p.selectOption('select[aria-label="Show"]', 'active'); await p.waitForTimeout(200);
  const second = p.locator('.flag-list .flag').first();
  await second.locator('button:has-text("Mark as Reviewed")').click(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const c = document.querySelector('.flag-list .flag'); return c.classList.contains('status-reviewed') && !c.querySelector('.flag-note').hidden; }), 'Mark as Reviewed keeps it, greyed, with a note box');

  // A check saved by an older version: Not an issue -> Dismissed, Explained -> Reviewed, a confidence added.
  const old = await p.evaluate(async (id) => {
    const name = await Vault.newCheckName(id);
    const loc = { doc: 'Affidavit.txt', docIndex: 0, page: 1, paragraph: 0, text: 'Old statement.', start: 0, end: 14 };
    await Vault.saveCheck(id, name, { schema: 1, app: 'CaseVault', created: new Date().toISOString(), affidavit: 'Affidavit.txt', reports: ['Report.txt'], documents: [], flags: [
      { id: 'o1', layer: 'rules', severity: 'High', type: 'date', title: 'Old one', detail: '', statement: loc, source: null, status: 'not-issue', note: '' },
      { id: 'o2', layer: 'rules', severity: 'Low', type: 'date', title: 'Old two', detail: '', statement: loc, source: null, status: 'explained', note: 'seen' },
    ] });
    return name;
  }, ids.c);
  await p.evaluate(([i, n]) => { location.hash = `#/case/${CVRoute.enc(i)}/checks/${CVRoute.enc(n)}`; }, [ids.c, old]);
  await p.waitForSelector('.flag-list'); await p.waitForTimeout(400);
  const o = await p.$$eval('.flag-list .flag', (c) => c.map((x) => [x.querySelector('.flag-title').textContent, x.className.match(/status-\w+/)[0], x.querySelector('.pill.conf').textContent]));
  ok(JSON.stringify(o) === JSON.stringify([['Old two', 'status-reviewed', 'Low Confidence']]), `an older check opens: ${JSON.stringify(o)}`);

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
