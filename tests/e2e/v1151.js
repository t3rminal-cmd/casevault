// v1.151: PDFs open at Fit Width; addresses don't show case numbers or Case Group names; the
// backup chip and bar don't say the same thing twice; empty Files folders greyed; Discovery and
// Link Chart load on first use; the Details tab no longer repeats where the case is filed.
// All data is made up (Doe / Roe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1151';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  const num = await p.evaluate((i) => Vault.data.cases.find((c) => c.id === i).number, ids.c);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(500); };

  // 1. The address has no case number in it, and opens the same page after a reload.
  await home();
  await p.click(`#sidebar a.case-item[href="#/case/${await p.evaluate((i) => CVRoute.enc(i), ids.c)}"]`).catch(async () => {
    await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids.c);
  });
  await p.waitForSelector('.tabs a.tab.active'); await p.waitForTimeout(500);
  let hash = await p.evaluate(() => location.hash);
  ok(/^#\/case\/~/.test(hash) && !hash.includes(ids.c) && !hash.includes(num), `case address is scrambled: ${hash}`);
  // An old address with the plain ID still works and is rewritten (no new history entry).
  const before = await p.evaluate(() => history.length);
  await p.evaluate((i) => { location.hash = `#/case/${i}/timeline`; }, ids.c); await p.waitForSelector('.tab.active'); await p.waitForTimeout(600);
  hash = await p.evaluate(() => location.hash);
  ok(/^#\/case\/~[^/]+\/timeline$/.test(hash) && !hash.includes(ids.c), `an old plain address is rewritten: ${hash}`);
  ok((await p.evaluate(() => history.length)) <= before + 1, 'rewriting adds no extra history entry');
  // The key is in vault.json on the SSD; an address made with another key is not opened.
  ok(await p.evaluate(() => /^[0-9a-f]{48}$/.test(Vault.data.settings.routeKey)), 'the scrambling key is kept in vault.json');
  await p.evaluate(() => { location.hash = '#/case/~AAAAAAAAAAAAAAAAAAAA/details'; }); await p.waitForTimeout(600);
  ok(await p.evaluate(() => location.hash === '#/'), 'an address from another vault goes to the home page');
  // Case Group addresses too; a report's name in the address too.
  await p.evaluate(async (i) => { await Vault.setSuspectGroup(i, 'Roe Family'); location.hash = `#/group/${CVRoute.enc('Roe Family')}`; }, ids.c);
  await p.waitForSelector('.group-page'); hash = await p.evaluate(() => location.hash);
  ok(!/Roe/.test(decodeURIComponent(hash)) && /Roe Family/.test(await p.textContent('.group-page')), `Case Group address is scrambled: ${hash}`);
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports', 'john-doe-search-warrant'), ids.c); await p.waitForTimeout(500);
  hash = await p.evaluate(() => location.hash);
  ok(!/john|doe/i.test(hash), `a report's name is scrambled too: ${hash}`);

  // 2. The Details tab says where the case is filed once (in the header), not again in the grey bar.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids.c); await p.waitForSelector('.case-op-bar');
  const bar = await p.textContent('.case-op-bar');
  ok(!/General Files: not in a Mission|Filed in Mission/.test(bar), `the grey bar no longer repeats it: ${bar.replace(/\s+/g, ' ').trim().slice(0, 80)}`);

  // 3. Files: All Documents, Choose Files, empty folders greyed.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/files`; }, ids.c); await p.waitForSelector('.folder-item');
  const files = await p.evaluate(() => ({ all: document.querySelector('.folder-item .folder-name').textContent, choose: [...document.querySelectorAll('#main .link')].map((x) => x.textContent).find((t) => /choose/i.test(t)) || '', empty: document.querySelectorAll('.folder-item.empty').length, items: document.querySelectorAll('.folder-item').length }));
  ok(files.all === 'All Documents' && files.choose === 'Choose Files' && files.empty > 0 && files.empty < files.items, `Files folder list: ${JSON.stringify(files)}`);
  await p.locator('.folder-list, .files-folders').first().screenshot({ path: `${SP}/folders.png` }).catch(() => {});

  // 4. Discovery and Link Chart load the first time they are opened.
  ok(await p.evaluate(() => !window.CVDiscoveryUI && !window.CVLinkChartUI), 'Discovery and Link Chart are not loaded at start-up');
  await p.click('.disc-open'); await p.waitForSelector('.disc', { timeout: 15000 });
  ok(await p.evaluate(() => !!window.CVDiscoveryUI), 'Discovery loads when opened');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/linkchart`; }, ids.c); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => !!window.CVLinkChartUI && !!document.querySelector('.lc-wrap, .linkchart, .lc-view, svg')), 'Link Chart loads when its tab opens');

  // 5. A PDF opens at Fit Width.
  await p.evaluate((i) => { location.hash = `#/group/${CVRoute.enc('Roe Family')}`; }, ids.c); await p.waitForSelector('.group-page');
  await p.click('.group-page button:has-text("Summary PDF")'); await p.waitForSelector('#dialog[open] .pv-page', { timeout: 20000 }); await p.waitForTimeout(800);
  const pv = await p.evaluate(() => { const pages = document.querySelector('#dialog[open] .pv-pages'); const cv = pages.querySelector('.pv-page'); return { pct: document.querySelector('#dialog[open] .pv-pct').textContent, w: cv.getBoundingClientRect().width, box: pages.clientWidth }; });
  ok(pv.pct !== '100%' && Math.abs(pv.w - (pv.box - 40)) < 12, `opens at Fit Width: ${JSON.stringify(pv)}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/pdf-fit.png` }).catch(() => {});
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 6. Home: with the backup bar showing, the banner leaves out its own backup chip.
  await home();
  const hb = await p.evaluate(() => ({ bar: !!document.querySelector('.backup-bar'), chip: !!document.querySelector('.hc-backup') }));
  ok(hb.bar && !hb.chip, `backup said once: ${JSON.stringify(hb)}`);
  await p.click('.backup-bar .backup-bar-close'); await home();
  ok(await p.$('.hc-backup') !== null, 'after × hides the bar for today, the chip is back');
  await p.screenshot({ path: `${SP}/home.png` });

  ok(!errs.length, `no page errors: ${JSON.stringify(errs)}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
