// v1.112: the Secure Locker in its own section under Other Files, and an empty General Files
// shows a placeholder folder. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1112';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.locker-section');
  const order = await p.$$eval('.dash-section.ov-panel', (x) => x.map((e) => (e.querySelector('h2') || {}).textContent || '').map((t) => t.trim().toUpperCase()));
  const oi = order.indexOf('OTHER FILES'); const li = order.indexOf('SECURE LOCKER');
  ok(oi >= 0 && li === oi + 1, `Secure Locker has its own section right under Other Files: ${order.join(' | ')}`);
  ok(await p.locator('.other-files-section .locker-tile, .other-files-section .ov-btn-locker').count() === 0, 'nothing of the locker is left inside Other Files');
  const tile = (await p.textContent('.locker-section .locker-tile')).replace(/\s+/g, ' ').trim();
  ok(tile === 'Secure Locker', `the tile just says "Secure Locker" (${tile})`);
  ok(await p.locator('.other-files-section .ov-btn-other').count() === 1, 'Other Files keeps New Folder');
  await p.locator('.other-files-section').screenshot({ path: `${SP}/other.png` }).catch(() => {});
  await p.locator('.locker-section').screenshot({ path: `${SP}/locker.png` }).catch(() => {});
  await p.click('.locker-section .locker-tile'); await p.waitForSelector('.locker-page');
  ok(/#\/locker/.test(await p.evaluate(() => location.hash)), 'the tile opens the Secure Locker');

  // General Files with no case outside a Mission: a placeholder folder for this year.
  await p.evaluate(async (ids) => { const op = Vault.listOperations()[0]; await Vault.assignCase(ids.c, op.id); }, ids);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.general-years-section');
  const yr = String(new Date().getFullYear());
  const tiles = await p.$$eval('.general-years-section .year-tile', (x) => x.map((e) => [e.textContent.trim(), e.classList.contains('placeholder-tile')]));
  ok(tiles.length === 1 && tiles[0][0] === yr && tiles[0][1], `an empty General Files shows a ${yr} placeholder folder: ${JSON.stringify(tiles)}`);
  await p.click('.general-years-section .year-tile'); await p.waitForTimeout(300);
  ok(/Empty/.test(await p.textContent('.general-years-section')) && await p.locator('.general-years-section button:has-text("New Case")').count() === 1, 'opening it says Empty and offers New Case');
  await p.locator('.general-years-section').screenshot({ path: `${SP}/general-empty.png` }).catch(() => {});
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
