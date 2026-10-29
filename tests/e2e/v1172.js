// v1.172: Case Health on the Details tab and the Mission page, custody gaps on the Draft tab, the
// arrest checked against the case, the Close dialog's ready-to-close list, the evidence and buys
// template fields and the suspects' monikers as Known Aliases. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1172';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1500, 1000);
  const id = await p.evaluate(async () => {
    const op = Vault.listOperations()[0];
    const c = await Vault.createCase({ number: 'EX-990', subject: 'Rick Poe' });
    await Vault.assignCase(c.id, op.id);
    const full = await Vault.getCase(c.id);
    full.suspects = [{ name: 'Richard Poe', dob: '1990-01-02', role: 'Primary', info: { moniker: 'Rick, Ricky' } }];
    full.arrest = true; // the case has its Arrest tab
    await Vault.saveCase(full);
    const tl = await Vault.getTimeline(c.id);
    tl.events = [{ id: 'b1', kind: 'buy', date: '2026-03-04', title: 'Buy 1', suspect: 'Richard Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' },
      { id: 'd1', kind: 'deadline', date: '2026-10-01', title: 'Lab results due', done: false }];
    await Vault.saveTimeline(c.id, tl);
    await Vault.writeCaseJSON(c.id, 'report-fields.json', { evidence: [{ number: 1, inventory: '12345678', type: 'Narcotics', drug: 'Cocaine', weight: '3.5 g', description: 'Knotted bag',
      custody: [{ date: '2026-03-04', time: '', action: 'Received / Seized', from: 'UC', to: 'Det. Doe', purpose: '' }, { date: '2026-03-05', time: '', action: 'Checked Out', from: 'Evidence', to: 'Det. Doe', purpose: 'Photos' }] }] });
    await Vault.writeCaseJSON(c.id, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'Richard', lastName: 'Poe', dob: '1990-01-03', date: '2026-04-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery of heroin' }], narcotics: [] }] });
    return c.id;
  });

  // 1. Case Health on the Details tab.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, id);
  await p.waitForSelector('.case-health .health-list, .case-health .health-ok', { timeout: 20000 });
  const health = await p.evaluate(() => ({ n: document.querySelector('.health-count').textContent, items: [...document.querySelectorAll('.case-health .health-item')].map((x) => x.textContent), links: [...document.querySelectorAll('.case-health .health-go')].map((a) => a.getAttribute('href')) }));
  ok(Number(health.n) >= 4 && health.items[0].startsWith('High'), `Case Health lists what is open, most serious first: ${health.n}`);
  ok(health.items.some((t) => /checked out on 2026-03-05 to Det\. Doe and never returned/.test(t)) && health.items.some((t) => /date of birth is 1990-01-03 on the Arrest tab/.test(t)) && health.items.some((t) => /overdue deadline/.test(t)), 'custody, arrest and deadline items');
  ok(health.links.some((l) => /\/arrest$/.test(l)) && health.links.some((l) => /\/draft$/.test(l)), 'each with a link to where it is fixed');
  await p.locator('.case-health').screenshot({ path: `${SP}/health.png` }).catch(() => {});

  // 2. The Arrest tab says what doesn't match.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/arrest`; }, id);
  await p.waitForSelector('.arrest-issues:not([hidden])', { state: 'attached', timeout: 20000 });
  const arr = await p.textContent('.arrest-issues');
  ok(/1990-01-03/.test(arr) && /charged with heroin/.test(arr), `the arrest against the case: ${arr.replace(/\s+/g, ' ').slice(0, 160)}`);

  // 3. Custody gaps on the Draft tab.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/draft`; }, id);
  await p.waitForSelector('.custody-gap-tag:not([hidden])', { state: 'attached', timeout: 20000 });
  ok(/1 gap/.test(await p.textContent('.custody-gap-tag')), 'the exhibit shows its custody gap');
  await p.evaluate(() => document.querySelector('.rf-custody-btn').click());
  await p.waitForSelector('#dialog[open] .custody-gaps');
  ok(/never returned/.test(await p.textContent('#dialog[open] .custody-gaps')), 'the Chain of Custody dialog lists the gap');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/custody.png` }).catch(() => {});
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 4. Templates: the buys and evidence tables.
  const filled = await p.evaluate(async (i) => { const c = await Vault.getCase(i); const ctx = CVDraft.templateContext(c, new Date(), null, await CVClosingUI.templateExtra(c)); return CVDraft.fillTemplate('{{buys.total}} in {{buys.count}}: {{inventory}}\n\n{{evidence}}', ctx); }, id);
  ok(/^\$200 in 1: #12345678/.test(filled) && /\| 1 \| 12345678 \| Cocaine, Knotted bag \| 3\.5 g \| Checked Out 2026-03-05 \|/.test(filled), `{{buys.total}}, {{inventory}} and {{evidence}}: ${filled.split('\n')[0]}`);

  // 5. The Checks tab knows the monikers.
  await p.evaluate(async (i) => { await Vault.addFile(i, new File(['Rick Poe sold $200 of cocaine.'], 'Report.txt', { type: 'text/plain' }), { keepName: true }); }, id);
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/checks`; }, id); await p.waitForSelector('.chk-aliases');
  ok(/Richard Poe = Rick, Ricky/.test(await p.textContent('.chk-monikers')), 'the suspects\' monikers count as Known Aliases');

  // 6. The Mission page.
  await p.evaluate(() => { location.hash = `#/operation/${encodeURIComponent(Vault.listOperations()[0].id)}`; });
  await p.waitForSelector('.mission-health .mission-health-case, .mission-health .health-ok', { timeout: 30000 });
  ok(await p.evaluate(() => [...document.querySelectorAll('.mission-health-case summary')].some((s) => /EX-990/.test(s.textContent) && /High/.test(s.textContent))), 'Mission Health lists the case with its High items');
  await p.locator('.mission-health').screenshot({ path: `${SP}/mission.png` }).catch(() => {});

  // 7. The Close dialog: ready to close?
  await p.evaluate(async (i) => { CVClosingUI.closeCaseDialog(await Vault.getCase(i)); }, id);
  await p.waitForSelector('#dialog[open] .warn-card', { timeout: 20000 });
  const close = await p.textContent('#dialog[open] .warn-card');
  ok(/never returned/.test(close) && /No lab result yet for Exhibit 1/.test(close) && /1990-01-03/.test(close), `the Close dialog lists custody, lab and arrest: ${close.replace(/\s+/g, ' ').slice(0, 200)}`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
