// v1.128: an Opened date in the future is flagged (not "Today"); links are not underlined; the backup
// reminder is a bar under the banner, not over the page (tests/e2e/v1101.js). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(async () => {
    const d = new Date(); d.setDate(d.getDate() + 40);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await Vault.createCase({ number: 'EX-900', subject: 'POE, Rick', opened: iso });
  });
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForSelector('.general-table'); await p.waitForTimeout(600);
  const age = await p.evaluate(() => { const r = [...document.querySelectorAll('.general-table tbody tr')].find((x) => x.cells[0].textContent.includes('EX-900')); const c = r.querySelector('.age-cell'); return { text: c.textContent.trim(), flagged: !!c.querySelector('.age-future') }; });
  ok(age.flagged && /^in (40d|1mo)$/.test(age.text), `a future Opened date is flagged: ${JSON.stringify(age)}`);
  const tip = await p.evaluate(() => [...document.querySelectorAll('#sidebar a')].map((a) => a.title || '').find((t) => t.startsWith('EX-900')) || '');
  ok(/in the future, check it/.test(tip), `the sidebar hover box says so: ${tip.split('\n')[1]}`);
  const lines = await p.evaluate(() => [...document.querySelectorAll('main a, #sidebar a')].filter((a) => a.offsetParent).map((a) => getComputedStyle(a).textDecorationLine).filter((x) => x !== 'none'));
  ok(!lines.length, `no link is underlined (${lines.length} found)`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
