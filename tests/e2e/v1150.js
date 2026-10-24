// v1.150: the Today panel shows on every visit to the home page (not only the first), and a Case
// Group's name (often a suspect's) is never written to the browser's storage on the PC. Made-up data.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await p.evaluate(async ([a, t0]) => {
    await Vault.saveTimeline(a, { events: [{ id: 't1', date: t0, time: '', kind: 'deadline', title: 'Return the warrant', note: '', suspect: '', color: '', done: false }] });
    await Vault.setSuspectGroup(a, 'Doe Family');
  }, [ids.c, iso(new Date())]);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(600); };
  await home();
  ok(await p.$('.today-section:not([hidden]) .today-row') !== null, 'Today shows on the first visit');
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c); await p.waitForTimeout(400);
  await home();
  ok(await p.$('.today-section:not([hidden]) .today-row') !== null, 'Today shows again on the next visit');

  if (!(await p.$eval('#sidebar .general-group', (d) => d.open))) { await p.click('#sidebar .general-group > summary .op-chev'); await p.waitForTimeout(250); }
  await p.evaluate(() => localStorage.setItem('cv-side-fold', JSON.stringify({ general: true, 'sg:Old Roe Group': false })));
  await p.click('#sidebar .suspect-group > summary .op-chev'); await p.waitForTimeout(300);
  const stored = await p.evaluate(() => Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join(' | '));
  ok(!/Doe Family/.test(stored) && /"general"/.test(stored), `no Case Group name in browser storage: ${stored}`);
  await p.reload(); await p.waitForTimeout(1500);
  const after = await p.evaluate(() => localStorage.getItem('cv-side-fold') || '');
  ok(!/Roe/.test(after), `names saved by older versions are dropped: ${after}`);
  ok(!errs.length, `no page errors: ${JSON.stringify(errs)}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
