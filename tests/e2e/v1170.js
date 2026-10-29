// v1.170: Case Facts beside a draft (the Timeline, the evidence list, the paired report), the draft
// checked as you write with "Use …", the privacy check before export, and on a check's results
// "Use …" (the draft is corrected) and Explain (the AI engine, faked here). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1170';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1500, 1000);
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } }] }) });
    if (/\/api\/chat/.test(r.url())) {
      const body = JSON.parse(r.postData() || '{}');
      const props = (body.format && body.format.properties) || {};
      const content = props.explanation ? { explanation: 'The draft says $250 but the Surveillance report says $200 for the same buy.', suggestion: 'On 03/04/2026 the UC paid $200 to Rick Poe for the narcotics.' }
        : props.issues ? { issues: [] } : { verdict: 'not_found', passage: 0, quote: '', explanation: '', confidence: 'low' };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, message: { content: JSON.stringify(content) } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const id = await p.evaluate(async () => {
    const c = await Vault.createCase({ number: 'EX-970', subject: 'Rick Poe' });
    await Vault.addFile(c.id, new File(['On 03/04/2026 surveillance saw the UC meet Rick Poe. The UC paid $200 to Rick Poe. The narcotics were inventoried under Inventory #12345678.'], 'Surv 1.txt', { type: 'text/plain' }), { keepName: true });
    const tl = await Vault.getTimeline(c.id);
    tl.events = [{ id: 'b1', kind: 'buy', date: '2026-03-04', title: 'Buy 1', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }];
    await Vault.saveTimeline(c.id, tl);
    await Vault.writeCaseJSON(c.id, 'report-fields.json', { evidence: [{ number: 1, inventory: '12345678', type: 'Narcotics', drug: 'Cocaine', weight: '3.5 g', description: 'Knotted bag' }] });
    await Vault.saveDraft(c.id, 'buy-1-narrative', { title: 'Buy 1 Narrative', type: 'affidavit' }, 'On 03/04/2026 the UC paid $250 to Rick Poe for the narcotics. They were inventoried under Inventory #12345678.');
    return c.id;
  });

  // 1. Case Facts beside the draft, and the draft checked as you write.
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports', 'buy-1-narrative'), id); await p.waitForSelector('.facts-panel', { timeout: 15000 });
  await p.waitForFunction(() => /match/.test((document.querySelector('.facts-status') || {}).textContent || ''), null, { timeout: 15000 });
  const panel = await p.evaluate(() => ({
    groups: [...document.querySelectorAll('.facts-group summary')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    chips: [...document.querySelectorAll('.fact-chip')].map((x) => x.textContent),
    status: document.querySelector('.facts-status').textContent,
    mis: [...document.querySelectorAll('.facts-mismatch li strong')].map((x) => x.textContent),
    fix: [...document.querySelectorAll('.facts-mismatch .fact-fix')].map((x) => x.textContent),
    hl: !!(window.CSS && CSS.highlights && CSS.highlights.has('cv-mismatch') && CSS.highlights.get('cv-mismatch').size),
  }));
  ok(panel.groups.some((g) => /^Timeline Buys/.test(g)) && panel.groups.some((g) => /^Evidence/.test(g)) && panel.groups.some((g) => /^From Surv 1\.txt/.test(g)), `the Timeline, the evidence list and the paired report: ${JSON.stringify(panel.groups)}`);
  ok(panel.chips.some((t) => /Inventory #12345678/.test(t)) && panel.chips.some((t) => /\$200/.test(t)), 'their facts, to click into the draft');
  ok(panel.mis.some((t) => /\$250.*\$200/.test(t)) && panel.fix.includes('Use $200'), `what doesn't match, with Use $200: ${JSON.stringify(panel.mis)}`);
  ok(panel.hl, 'and underlined in the draft');
  await p.locator('.confirm-panel').screenshot({ path: `${SP}/facts.png` }).catch(() => {});
  await p.click('.facts-mismatch .fact-fix:has-text("Use $200")'); await p.waitForTimeout(1800);
  ok(await p.evaluate(() => /paid \$200 to Rick Poe/.test(document.querySelector('textarea.draft-editor').value)), 'Use $200 corrects the draft');
  ok(await p.evaluate(() => /everything checked matches/.test(document.querySelector('.facts-status').textContent)), 'and the check says everything matches');
  const before = await p.$$eval('.fact-chip', (x) => x.length);
  await p.evaluate(() => { const ed = document.querySelector('.rich-editor, [contenteditable="true"]'); if (ed) { ed.focus(); const s = getSelection(); s.selectAllChildren(ed); s.collapseToEnd(); } });
  await p.evaluate(() => [...document.querySelectorAll('.fact-chip')].find((x) => /Inventory #12345678/.test(x.textContent) && !/Exhibit/.test(x.textContent)).click()); await p.waitForTimeout(800);
  ok(before > 0 && await p.evaluate(() => (document.querySelector('textarea.draft-editor').value.match(/Inventory #12345678/g) || []).length === 2), 'a fact clicked goes into the draft');

  // 2. The privacy check before export.
  await p.evaluate(() => { const ta = document.querySelector('textarea.draft-editor'); ta.value = `${ta.value}\n\nThe CI's SSN is 123-45-6789.`; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(800);
  await p.click('.draft-actions-bar button:has-text("PDF View")');
  await p.waitForSelector('#dialog[open] .export-check', { timeout: 20000 });
  const priv = await p.textContent('#dialog[open] .export-private');
  ok(/Private details/.test(priv) && /Social Security number: 123-45-6789/.test(priv), `a Social Security number is caught before export: ${priv.replace(/\s+/g, ' ')}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/private.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Cancel")'); await p.waitForTimeout(300);
  await p.evaluate(() => { const ta = document.querySelector('textarea.draft-editor'); ta.value = 'On 03/04/2026 the UC paid $250 to Rick Poe for the narcotics.'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(1500);

  // 3. A check of the draft: Use $200 on the results, and Explain.
  await p.evaluate(async (i) => { await CaseVaultUI.Save.flushAll(); await CVChecks.Engine.refresh(); await CVChecks.checkDraft(await Vault.getCase(i), { slug: 'buy-1-narrative', title: 'Buy 1 Narrative' }); }, id);
  await p.waitForSelector('.flag-list .flag', { timeout: 30000 }); await p.waitForTimeout(500);
  const card = p.locator('.flag-list .flag', { hasText: '$250' }).first();
  ok(await card.locator('button:has-text("Use $200")').count() === 1 && await card.locator('button:has-text("Explain")').count() === 1, 'a flag about the draft has Use $200 and Explain');
  await card.locator('button:has-text("Explain")').click();
  await p.waitForSelector('.flag-explain:not([hidden]) .flag-suggest', { timeout: 15000 });
  ok(/Suggested wording/.test(await card.locator('.flag-explain').textContent()), 'Explain gives the AI\'s explanation and a suggested wording');
  await card.locator('button:has-text("Use $200")').click(); await p.waitForTimeout(1200);
  const body = await p.evaluate(async (i) => (await Vault.readDraft(i, 'buy-1-narrative')).body, id);
  ok(/paid \$200 to Rick Poe/.test(body), `the draft is corrected from the results: ${body}`);
  ok(await card.evaluate((x) => x.classList.contains('status-reviewed')), 'and the flag marked Reviewed');
  await p.locator('.flag-list').screenshot({ path: `${SP}/flags.png` }).catch(() => {});
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
