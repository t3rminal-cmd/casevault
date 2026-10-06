const { chromium } = require('playwright');
const SP = process.env.SP + '/v159';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('app: ' + e.stack.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) errs.push('app: ' + m.text().slice(0, 200)); });
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('V59' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.evaluate(() => { window.showDirectoryPicker = undefined; });
  const id = await p.evaluate(async () => {
    const c = await Vault.createCase({ number: 'EX-821', subject: 'John Doe' });
    c.arrest = true; await Vault.saveCase(c);
    await Vault.addFile(c.id, new File(['Synthetic report A on 01/02/2026'], 'report-a.txt'), { folder: 'Other' });
    await Vault.addFile(c.id, new File(['Synthetic report B on 01/03/2026'], 'report-b.txt'), { folder: 'Other' });
    await Vault.appendLog('outbound', { channel: 'mail', destination: 'x', purpose: 'test' });
    await Vault.writeCaseJSON(c.id, 'linkchart.json', { title: 'Doe Buy', mode: 'free', nodes: [{ id: 'a', name: 'John Doe', role: 'Primary', x: 0, y: 0 }, { id: 'u', name: 'Det. Richard Roe (UC)', role: 'Other', x: 420, y: 0 }, { id: 'c', name: 'Jane Poe', role: 'Courier', x: 0, y: 320 }],
      links: [{ id: 'l1', from: 'a', to: 'u', dir: 'to', flow: 'narcotics', label: '1 oz cocaine' }, { id: 'l2', from: 'u', to: 'a', dir: 'to', flow: 'money', label: '$1,200 buy money' }, { id: 'l3', from: 'c', to: 'u', dir: 'to', label: 'Delivered' }] });
    return c.id;
  });
  // forms folded
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, id); await p.waitForTimeout(900);
  console.log('details folded', await p.$$eval('section.foldable', (x) => x.map((s) => s.classList.contains('folded')).join(',')));
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, id); await p.waitForTimeout(900);
  console.log('draft folded', await p.$$eval('.rf-section', (x) => x.filter((s) => s.classList.contains('rf-folded')).length + '/' + x.length));
  await p.screenshot({ path: `${SP}/draft.png` });
  await p.evaluate((i) => { location.hash = `#/case/${i}/arrest`; }, id); await p.waitForTimeout(900);
  console.log('arrest folded', await p.$$eval('.arrest-section', (x) => x.filter((s) => s.classList.contains('folded')).length + '/' + x.length));
  await p.screenshot({ path: `${SP}/arrest.png` });
  // link chart
  await p.evaluate((i) => { location.hash = `#/case/${i}/linkchart`; }, id); await p.waitForSelector('.lc-view svg'); await p.waitForTimeout(600);
  await p.click('.lc-zoom button:has-text("Fit")'); await p.waitForTimeout(300);
  await p.locator('.lc-view').screenshot({ path: `${SP}/chart.png` });
  console.log('link cards', await p.locator('.lc-link-card').count(), 'open bodies', await p.locator('.lc-link-card > .lc-link-row:not([hidden])').count());
  await p.locator('.lc-link-card').nth(2).locator('button[aria-pressed]').click(); await p.waitForTimeout(300);
  console.log('lines after hide', await p.locator('.lc-view polyline[stroke-dasharray]').count());
  await p.locator('.lc-links').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SP}/links.png` });
  await p.click('.lc-head button:has-text("Save PDF to Case")'); await p.waitForTimeout(2500);
  const rep = await p.evaluate(async (i) => (await Vault.listDrafts(i)).map((d) => [d.title, d.type, d.fromLinkChart, d.chartPath]), id);
  console.log('reports', JSON.stringify(rep));
  await p.evaluate((i) => { location.hash = `#/case/${i}/reports`; }, id); await p.waitForTimeout(900);
  await p.screenshot({ path: `${SP}/reports.png` });
  await p.click('.report-open'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${SP}/report-view.png` });
  await p.click('button:has-text("Send Back to Link Chart")'); await p.waitForTimeout(400);
  if (await p.$('dialog[open] button:has-text("Open It")')) await p.click('dialog[open] button:has-text("Open It")');
  await p.waitForSelector('.lc-view svg'); console.log('back on link chart', await p.evaluate(() => location.hash.endsWith('/linkchart')));
  // checks
  await p.evaluate((i) => { location.hash = `#/case/${i}/checks`; }, id); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${SP}/checks.png` });
  // chat
  await p.click('#btn-chat'); await p.waitForTimeout(600);
  console.log('chip sizes', await p.$$eval('.chat-starters .btn', (x) => x.map((e) => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`).join(' ')));
  await p.locator('.chat-float').screenshot({ path: `${SP}/chat.png` });
  await p.click('#btn-chat');
  // outbound log
  await p.evaluate(() => { CaseVaultUI.showVaultPanel('log'); }); await p.waitForTimeout(1000);
  console.log('log size', await p.textContent('.log-size'));
  await p.screenshot({ path: `${SP}/log.png` });
  await p.click('.log-actions button:has-text("Delete All")'); await p.click('dialog[open] button:has-text("Delete")'); await p.waitForTimeout(1200);
  console.log('log files after', await p.evaluate(async () => (await Vault.logFiles('outbound')).length));
  await p.keyboard.press('Escape');
  // discovery burn help
  await p.evaluate((i) => { location.hash = `#/case/${i}/files`; }, id); await p.waitForSelector('.disc-open'); await p.click('.disc-open'); await p.waitForSelector('.disc');
  await p.selectOption('.disc select[aria-label="Where to"]', 'ssd'); await p.click('.disc-burn summary'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${SP}/burn.png` });
  console.log('errs', errs);
  await b.close();
})();
