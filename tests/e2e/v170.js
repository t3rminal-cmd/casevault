const boot = require('./boot');
(async () => { const { b, p, ids, errs } = await boot();
  console.log('heading icons', await p.evaluate(() => [...document.querySelectorAll('.section-title.caps')].map((x) => `${x.textContent.trim()}:${x.querySelectorAll('svg').length}`).join(' ')));
  // files: an Additional Exhibit photo
  await p.evaluate(async (i) => { await Vault.addFile(i, new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' }), { folder: 'Other Exhibits', description: 'Additional Exhibit 1a' }); }, ids.c);
  await p.evaluate((i) => { location.hash = `#/case/${i}/files`; }, ids.c); await p.waitForTimeout(1200);
  console.log('file names', await p.evaluate(() => [...document.querySelectorAll('.fname-link')].map((x) => x.textContent).join(' ; ')));
  console.log('eye buttons', await p.evaluate(() => document.querySelectorAll('.files svg[data-icon="eye"]').length));
  // back to top
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, ids.c); await p.waitForTimeout(1300);
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((b) => b.click())); await p.waitForTimeout(300);
  const vis = () => p.evaluate(() => getComputedStyle(document.querySelector('#btn-top-fab')).visibility);
  console.log('top at start', await vis());
  await p.evaluate(() => { document.getElementById('main').scrollTop = 2000; }); await p.waitForTimeout(300);
  console.log('top scrolled', await vis(), await p.evaluate(() => [...document.querySelectorAll('#fab-dock > *')].map((x) => x.id).join(',')));
  await p.screenshot({ path: process.env.SP + '/v170/dock.png' });
  await p.click('#btn-top-fab'); await p.waitForTimeout(900);
  console.log('after click', await p.evaluate(() => document.getElementById('main').scrollTop), await vis());
  console.log('errors', errs); await b.close(); })();
