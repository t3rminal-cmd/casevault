const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('S' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.click('#btn-power'); await p.waitForTimeout(300); await p.click('dialog[open] button:has-text("Power Off")'); await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')));
  await p.screenshot({ path: process.env.SP + '/v168/off.png' }); console.log('errors', errs); await b.close();
})();
