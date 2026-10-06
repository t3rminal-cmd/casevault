const { chromium } = require('playwright');
const SP = process.env.SP + '/v163'; const TAG = process.env.TAG || 'ql';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: +(process.env.W || 1366), height: 768 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Q' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.evaluate(async () => { for (let i = 0; i < 12; i++) await Vault.createCase({ number: `EX-${i}00`, subject: `John Doe ${i}` }); location.hash = '#/x'; location.hash = '#/'; });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${SP}/${TAG}-top.png` });
  const info = await p.evaluate(() => { const q = document.querySelector('#ql-footer'); const side = document.querySelector('#sidebar').getBoundingClientRect(); const r = q.getBoundingClientRect(); const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.contains(q)); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight, scroller: sc ? sc.id || sc.className : 'window', pos: getComputedStyle(q).position, left: Math.round(r.left), right: Math.round(r.right), sideRight: Math.round(side.right), vw: innerWidth, fab: Math.round(document.querySelector('.fab-dock').getBoundingClientRect().bottom) }; });
  console.log(JSON.stringify(info));
  await p.evaluate(() => { const m = document.querySelector('#main'); m.scrollTop = 99999; window.scrollTo(0, 99999); }); await p.waitForTimeout(300);
  await p.screenshot({ path: `${SP}/${TAG}-bottom.png` });
  for (const t of ['OSINT', 'LEO']) { await p.click(`#ql-footer .ql-tabs button:has-text("${t}")`); await p.waitForTimeout(300); await p.screenshot({ path: `${SP}/${TAG}-${t}.png` }); }
  await p.click('#ql-footer .ql-tabs button:has-text("Reference")'); await p.waitForTimeout(200);
  await p.click("#ql-footer .ql-split"); await p.click(`#ql-footer .ql-split-opt:has-text("State")`); await p.waitForTimeout(400); console.log("charges hash", await p.evaluate(() => location.hash)); await p.evaluate(() => { location.hash = "#/"; }); await p.waitForTimeout(500); await p.waitForTimeout(200); await p.screenshot({ path: `${SP}/${TAG}-charges.png` });
  await p.keyboard.press('Escape');
  await p.click('#ql-footer button:has-text("Arrange")'); await p.waitForTimeout(300); await p.screenshot({ path: `${SP}/${TAG}-arrange.png` });
  await p.click('#ql-footer button:has-text("Done")'); await p.waitForTimeout(200);
  await p.evaluate(() => { location.hash = '#/reference'; }); await p.waitForTimeout(500);
  console.log('footer on reference hidden', await p.evaluate(() => document.querySelector('#ql-footer').hidden));
  console.log('errs', errs); await b.close();
})();
