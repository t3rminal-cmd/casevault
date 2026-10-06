const { chromium } = require('playwright');
const SP = process.env.SP + '/v156';
const W = Number(process.env.W || 1366);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: 900 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('app: ' + e.stack.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) errs.push('app: ' + m.text().slice(0, 200)); });
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('V56' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.evaluate(() => { window.showDirectoryPicker = undefined; });
  const id = await p.evaluate(async () => {
    const c = await Vault.createCase({ number: 'EX-801', subject: 'John Doe' });
    await Vault.writeCaseJSON(c.id, 'linkchart.json', { title: 'Old', nodes: [{ id: 'a', name: 'John Doe', role: 'Subject' }, { id: 'b', parent: 'a', name: 'Richard Roe', role: 'Supplier' },
      { id: 'w', parent: 'a', kind: 'online', platform: 'darkweb', name: 'doe market', handle: 'http://exampleexampleexampleexample.onion/shop/listing/12345' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, parent: 'b', name: `Courier Number ${i + 1} Poe`, role: 'Courier', handle: `CP${i}` }))], links: [{ id: 'l', from: 'w', to: 'c0', label: 'Ships packages for the market every week' }] });
    return c.id;
  });
  await p.evaluate((i) => { location.hash = `#/case/${i}/linkchart`; }, id); await p.waitForSelector('.lc-view svg');
  await p.waitForTimeout(500);
  console.log('title placeholder', JSON.stringify(await p.getAttribute('.lc-title input', 'placeholder')));
  console.log('roles', await p.$$eval('.lc-item-sub', (x) => x.map((e) => e.textContent).slice(0, 3)));
  console.log('note', await p.textContent('.lc-note'));
  await p.screenshot({ path: `${SP}/tree.png` });
  // per row 3
  await p.selectOption('.lc-perrow select', '3'); await p.waitForTimeout(200);
  console.log('note3', await p.textContent('.lc-note'));
  // phone card
  await p.click('.lc-item:has-text("Richard Roe")');
  await p.click('.lc-form button:has-text("Add Phone")');
  await p.focus('.lc-form input[type=tel]'); await p.keyboard.type('5550100123'); await p.keyboard.press('Tab');
  console.log('phone', await p.inputValue('.lc-form input[type=tel]'));
  await p.screenshot({ path: `${SP}/form-phone.png` });
  // move left/right
  await p.click('.lc-item:has-text("Courier Number 2")');
  await p.click('.lc-form button:has-text("Move Left")'); await p.waitForTimeout(200);
  console.log('order', await p.$$eval('.lc-item-name', (x) => x.map((e) => e.textContent).filter((t) => t.startsWith('Courier')).slice(0, 3)));
  // link mode
  await p.click('.lc-toolbar button:has-text("Link Cards")');
  const card = (name) => p.locator(`.lc-view [data-node]`, { hasText: name }).first();
  await card('Courier Number 1').click(); await card('Courier Number 3').click(); await p.waitForTimeout(200);
  console.log('links after link', await p.evaluate(() => document.querySelectorAll('.lc-view line[marker-end]').length));
  await card('Courier Number 3').click(); await card('Courier Number 1').click(); await p.waitForTimeout(200);
  console.log('links after unlink', await p.evaluate(() => document.querySelectorAll('.lc-view line').length));
  await p.keyboard.press('Escape');
  // free mode + drag
  await p.click('.lc-toolbar button:has-text("Free")'); await p.waitForTimeout(200);
  const bb = await card('Richard Roe').boundingBox();
  await p.mouse.move(bb.x + 40, bb.y + 40); await p.mouse.down(); await p.mouse.move(bb.x + 140, bb.y + 90, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(900);
  const bb2 = await card('Richard Roe').boundingBox();
  console.log('dragged by', Math.round(bb2.x - bb.x), Math.round(bb2.y - bb.y));
  // zoom
  await p.click('.lc-zoom .icon-btn >> nth=0'); await p.click('.lc-zoom .icon-btn >> nth=0');
  console.log('zoom', await p.textContent('.lc-zoom-pct'));
  await p.click('.lc-zoom button:has-text("Fit")'); console.log('fit', await p.textContent('.lc-zoom-pct'));
  await p.screenshot({ path: `${SP}/free.png` });
  // save pdf
  await p.fill('.lc-title input', 'Doe Crew'); await p.waitForTimeout(800);
  await p.click('.lc-head button:has-text("Save PDF to Case")'); await p.waitForTimeout(2500);
  const files = await p.evaluate(async (i) => (await Vault.listFiles(i)).map((f) => f.name), id);
  console.log('files', files);
  // clear
  await p.click('.lc-head button:has-text("Clear Chart")'); await p.click('dialog[open] .btn.danger, dialog[open] button:has-text("Clear Chart")'); await p.waitForTimeout(900);
  console.log('cards after clear', await p.locator('.lc-view [data-node]').count());
  // open from files
  await p.evaluate((i) => { location.hash = `#/case/${i}/files`; }, id); await p.waitForTimeout(900);
  await p.click('text=Link Charts').catch(() => {}); await p.waitForTimeout(600);
  await p.screenshot({ path: `${SP}/files.png` });
  await p.click('button[title^="Open in Link Chart"]'); await p.waitForTimeout(300);
  if (await p.$('dialog[open] button:has-text("Open It")')) await p.click('dialog[open] button:has-text("Open It")');
  await p.waitForSelector('.lc-view svg'); await p.waitForTimeout(500);
  console.log('back: cards', await p.locator('.lc-view [data-node]').count(), 'title', await p.inputValue('.lc-title input'), 'free', await p.evaluate(() => document.querySelector('.lc-view').classList.contains('free')));
  await p.click('.lc-head button:has-text("PDF View")'); await p.waitForSelector('.pdf-view'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SP}/pdf.png` });
  console.log('errs', errs);
  await b.close();
})();
