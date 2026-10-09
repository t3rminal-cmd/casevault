// v1.99: the backup reminder sits in the banner's row of counts, right after Overdue.
const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, errs } = await boot(1366, 900);
  const row = () => p.evaluate(() => {
    const chips = [...document.querySelectorAll('.hero-counts > .hero-count')];
    const r = (el) => el.getBoundingClientRect();
    const over = document.querySelector('.hc-overdue'); const bk = document.querySelector('.hc-backup');
    return { order: chips.map((c) => c.className.match(/hc-(\w+)/)[1]), sameRow: !!(over && bk) && Math.abs(r(over).top - r(bk).top) < 2,
      text: bk && bk.textContent.trim(), alert: bk && bk.classList.contains('hc-alert'), clipped: chips.some((c) => c.scrollWidth > c.clientWidth + 1),
      oldLine: !!document.querySelector('.hero-backup') };
  });
  let r = await row();
  ok(r.order.join(',') === 'open,closed,archived,overdue,backup', `the backup chip comes right after Overdue (${r.order})`);
  ok(r.sameRow, 'in the same row as Overdue at 1366 wide');
  ok(r.text === 'No Backup' && r.alert, `no backup yet: "${r.text}", red`);
  ok(!r.clipped, 'no chip is cut off');
  ok(!r.oldLine, 'the separate backup line under the counts is gone');
  await p.locator('.hero').screenshot({ path: process.env.SP + '/v199/hero-none.png' });
  await p.click('.hc-backup'); await p.waitForSelector('.backup-full');
  ok(true, 'clicking it opens Vault → Backups');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(async () => { Vault.data.settings.lastFullBackup = { at: new Date().toISOString(), files: 3, bytes: 10, verified: true }; location.hash = '#/x'; location.hash = '#/'; });
  await p.waitForTimeout(800);
  r = await row();
  ok(r.text === 'Backed Up Today' && !r.alert, `after a backup: "${r.text}", not red`);
  await p.evaluate(async () => { Vault.data.settings.lastFullBackup.at = new Date(Date.now() - 9 * 864e5).toISOString(); location.hash = '#/x'; location.hash = '#/'; });
  await p.waitForTimeout(800);
  r = await row();
  ok(r.text === 'Backup 9d Ago' && r.alert, `9 days later: "${r.text}", red again`);
  for (const w of [1920, 1100, 700]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(500);
    r = await row();
    ok(!r.clipped && r.order.at(-1) === 'backup', `${w} wide: still last in the counts, nothing cut off (same row as Overdue: ${r.sameRow})`);
    await p.locator('.hero').screenshot({ path: process.env.SP + `/v199/hero-${w}.png` });
  }
  console.log('errors', errs); await b.close(); })();
