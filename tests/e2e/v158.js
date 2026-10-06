const { chromium } = require('playwright');
const SP = process.env.SP + '/v158';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('app: ' + e.stack.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) errs.push('app: ' + m.text().slice(0, 200)); });
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('V58' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.evaluate(() => { window.showDirectoryPicker = undefined; });
  const id = await p.evaluate(async () => {
    const c = await Vault.createCase({ number: 'EX-811', subject: 'John Doe' });
    const plats = ['facebook', 'instagram', 'grindr', 'cashapp', 'venmo', 'zelle', 'applepay', 'coinbase', 'moonpay', 'darkweb'];
    await Vault.writeCaseJSON(c.id, 'linkchart.json', { title: 'Doe Crew', mode: 'free', nodes: [{ id: 'a', name: 'John Doe', role: 'Subject', x: 400, y: 0 }, { id: 'b', parent: 'a', name: 'Richard Roe', role: 'Supplier', x: 100, y: 260 }, { id: 'c', parent: 'a', name: 'Jane Poe', role: 'Courier', x: 700, y: 260 },
      { id: 'm', kind: 'online', platform: 'meta', name: 'old meta', parent: 'a', x: 1000, y: 0 },
      ...plats.map((pl, i) => ({ id: 'p' + i, kind: 'online', platform: pl, name: pl + '_user', parent: 'b', x: (i % 5) * 180, y: 520 + Math.floor(i / 5) * 230 }))],
      links: [{ id: 'l1', from: 'b', to: 'c', dir: 'to', flow: 'narcotics', label: '2 kilos a week' }, { id: 'l2', from: 'c', to: 'a', dir: 'to', flow: 'money', label: 'Cash' }] });
    return c.id;
  });
  await p.evaluate((i) => { location.hash = `#/case/${i}/linkchart`; }, id); await p.waitForSelector('.lc-view svg'); await p.waitForTimeout(800);
  console.log('meta->', await p.evaluate(() => [...document.querySelectorAll('.lc-item-sub')].map((e) => e.textContent).join(',')));
  console.log('badges', await p.locator('.lc-view .lc-flow').count(), 'grid', await p.evaluate(() => !!document.querySelector('.lc-view pattern#lc-grid')));
  await p.click('.lc-zoom button:has-text("Fit")'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${SP}/chart.png` });
  const before = await p.textContent('.lc-zoom-pct');
  const vb = await p.locator('.lc-view').boundingBox();
  await p.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await p.mouse.wheel(0, -300); await p.waitForTimeout(200); await p.mouse.wheel(0, -300); await p.waitForTimeout(300);
  console.log('wheel zoom', before, '->', await p.textContent('.lc-zoom-pct'));
  await p.screenshot({ path: `${SP}/zoomed.png` });
  console.log('snap shown', await p.isVisible('.lc-toolbar button:has-text("Snap")'), await p.getAttribute('.lc-toolbar button:has-text("Snap")', 'aria-pressed'));
  await p.click('.lc-toolbar button:has-text("Snap")'); await p.waitForTimeout(200);
  console.log('snap after', await p.evaluate(async (i) => (await Vault.readCaseJSON(i, 'linkchart.json').catch(() => ({}))).snap, id));
  await p.click('.lc-toolbar button:has-text("Link Cards")');
  console.log('carries visible', await p.isVisible('.lc-carries'));
  await p.selectOption('.lc-carries select', 'money');
  await p.click('.lc-zoom button:has-text("Fit")'); await p.waitForTimeout(200);
  await p.locator('.lc-view [data-node="p3"]').click(); await p.locator('.lc-view [data-node="b"]').click(); await p.waitForTimeout(300);
  console.log('badges now', await p.locator('.lc-view .lc-flow-money').count());
  await p.keyboard.press('Escape');
  await p.locator('.lc-links').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SP}/links.png` });
  await p.click('.lc-head button:has-text("PDF View")'); await p.waitForSelector('.pdf-view'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SP}/pdf.png` });
  console.log('errs', errs);
  await b.close();
})();
