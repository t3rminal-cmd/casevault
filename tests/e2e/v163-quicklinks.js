// Quick Links (the v1.63 test, rewritten for v1.121): a panel that slides in from the right, opened
// from the sidebar's Quick Links button or the home page tile; tabs, Charges' two choices, Arrange,
// and closing with ×, Esc or a click outside. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v163';

(async () => {
  const { b, p, errs } = await boot(Number(process.env.W || 1366), 768);
  const isOpen = () => p.evaluate(() => { const q = document.getElementById('ql-panel'); return !!q && q.classList.contains('open') && q.getBoundingClientRect().left < innerWidth - 10; });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  ok(!(await p.$('#ql-footer')) && !(await isOpen()), 'no Quick Links bar; the panel starts closed');
  await p.click('.qa-tile.ql-open-btn'); await p.waitForTimeout(400);
  ok(await isOpen(), 'the home page tile opens the panel');
  await p.screenshot({ path: `${SP}/panel.png` });
  for (const t of ['OSINT', 'LEO', 'Reference']) { await p.click(`#ql-panel .ql-tabs button:has-text("${t}")`); await p.waitForTimeout(250); }
  const tabNow = await p.evaluate(() => [...document.querySelectorAll('#ql-panel .ql-tabs button')].map((x) => x.getAttribute('aria-selected') + ':' + x.textContent.trim()).join(', '));
  ok(/true:Reference/i.test(tabNow), `its tabs switch: ${tabNow}`);
  await p.click('#ql-panel button:has-text("Arrange")'); await p.waitForTimeout(250);
  ok(await p.locator('#ql-panel .ql-edit-wrap').count() > 0, 'Arrange works in the panel');
  await p.click('#ql-panel button:has-text("Done")'); await p.waitForTimeout(250);
  // Charges: a menu with the two statutes; picking one shows it and closes the panel.
  await p.click('#ql-panel .quick-link:has-text("Charges")'); await p.waitForTimeout(150);
  await p.click('#ql-panel .ql-choice:has-text("State")'); await p.waitForTimeout(500);
  ok(/#\/reference/.test(await p.evaluate(() => location.hash)) && !(await isOpen()), 'a CaseVault page from the panel opens and the panel closes');
  // From any page: the sidebar button; Esc, a click outside and × close it.
  await p.click('#btn-side-links'); await p.waitForTimeout(300);
  ok(await isOpen(), 'the sidebar button opens it on any page');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(!(await isOpen()), 'Esc closes it');
  await p.click('#btn-side-links'); await p.waitForTimeout(300);
  await p.mouse.click(500, 400); await p.waitForTimeout(300);
  ok(!(await isOpen()), 'a click outside closes it');
  await p.click('#btn-side-links'); await p.waitForTimeout(300);
  await p.click('#ql-panel .ql-panel-close'); await p.waitForTimeout(300);
  ok(!(await isOpen()), '× closes it');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
