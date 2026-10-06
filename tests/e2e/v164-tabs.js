const { chromium } = require('playwright');
const SP = process.env.SP + '/v164'; const W = +(process.env.W || 1366);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: 768 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('T' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  const id = await p.evaluate(async () => { const c = await Vault.createCase({ number: 'EX-100', subject: 'John Doe' }); c.arrest = true; await Vault.saveCase(c); return c.id; });
  for (const t of ['details', 'arrest', 'timeline', 'files']) {
    await p.evaluate(([i, tt]) => { location.hash = `#/case/${i}/${tt}`; }, [id, t]); await p.waitForTimeout(700);
    if (t === 'details' || t === 'files') await p.screenshot({ path: `${SP}/${W}-${t}.png` });
  }
  console.log(JSON.stringify(await p.evaluate(() => { const tabs = [...document.querySelectorAll('.tabs .tab')]; const tops = new Set(tabs.map((x) => Math.round(x.getBoundingClientRect().top))); return { n: tabs.length, rows: tops.size, labels: tabs.map((x) => x.innerText.trim()), icons: tabs.filter((x) => x.querySelector('svg')).length, clipped: tabs.filter((x) => x.scrollWidth > x.clientWidth + 1).length }; })));
  console.log('errs', errs); await b.close();
})();
