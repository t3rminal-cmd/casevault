const { chromium } = require('playwright');
const SP = process.env.SP + '/v161';
const W = +(process.env.W || 1366);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: 768 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('app: ' + e.stack.slice(0, 300)));
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('V61' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.evaluate(() => { window.showDirectoryPicker = undefined; });
  await p.screenshot({ path: `${SP}/${W}-empty.png` });
  const empty = await p.evaluate(() => document.querySelector('.attention-section').innerText);
  console.log('empty attention:', JSON.stringify(empty));
  await p.evaluate(async () => {
    const op = await Vault.createOperation({ number: 'OP-202601', name: 'Example Doe Crew' });
    const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const mk = [['EX-100', 'John Doe', -2, 'Discovery due'], ['EX-200', 'Jane Roe', 0, 'Court date'], ['EX-300', 'Rick Poe', 3, 'Warrant return'], ['EX-400', 'John Roe', 20, 'Far off']];
    for (const [n, s, d, t] of mk) { const c = await Vault.createCase({ number: n, subject: s }); await Vault.assignCase(c.id, op.id); await Vault.saveTimeline(c.id, { events: [{ id: 'e', date: day(d), time: '09:00', title: t, kind: 'deadline' }] }); }
    location.hash = '#/x'; location.hash = '#/';
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${SP}/${W}-home.png` });
  const info = await p.evaluate(() => ({
    rows: [...document.querySelectorAll('.attention-row')].map((r) => r.className.split(' ')[1] + ':' + r.innerText.replace(/\s+/g, ' ')),
    tiles: [...document.querySelectorAll('.qa-tile')].map((t) => `${t.innerText.trim()}:${Math.round(t.getBoundingClientRect().width)}x${Math.round(t.getBoundingClientRect().height)}`),
    counts: [...document.querySelectorAll('.hero-count')].map((c) => c.innerText.replace(/\s+/g, ' ')),
    heroH: Math.round(document.querySelector('.hero').getBoundingClientRect().height),
    stats: !!document.querySelector('.stats'),
    clipped: [...document.querySelectorAll('.dashboard *')].filter((e) => e.children.length === 0 && e.innerText && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.className).slice(0, 5),
  }));
  console.log(JSON.stringify(info, null, 1));
  await p.click('.qa-tile:has-text("Link Chart")'); await p.waitForSelector('.pick-case');
  await p.screenshot({ path: `${SP}/${W}-pick.png` });
  await p.fill('.pick-case input', 'roe'); await p.waitForTimeout(100);
  console.log('filtered', await p.$$eval('.pick-case-row', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' '))));
  await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  console.log('hash', await p.evaluate(() => location.hash));
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600);
  await p.click('.qa-tile:has-text("Draft")'); await p.click('.pick-case-row:has-text("EX-300")'); await p.waitForTimeout(800);
  console.log('hash', await p.evaluate(() => location.hash));
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600);
  await p.click('.qa-tile:has-text("Discovery")'); await p.click('.pick-case-row:has-text("EX-100")'); await p.waitForTimeout(1500);
  console.log('hash', await p.evaluate(() => location.hash), 'discovery open', await p.evaluate(() => !!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.slice(0, 60)));
  await p.screenshot({ path: `${SP}/${W}-disc.png` });
  await p.keyboard.press('Escape'); await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600);
  await p.click('.attention-row >> nth=0'); await p.waitForTimeout(800);
  console.log('row click hash', await p.evaluate(() => location.hash));
  console.log('errs', errs);
  await b.close();
})();
