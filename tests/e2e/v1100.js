// v1.100: the sidebar shows when each case was opened (and how long ago); after Save Changes the
// Draft outlines in red what still keeps a part from its green check.
const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  const day = (k) => p.evaluate((k) => { const d = new Date(); d.setDate(d.getDate() - k); return Vault.localDay(d); }, k);
  for (const [n, k] of [['EX-500', 5], ['EX-600', 90], ['EX-700', 800]]) {
    const iso = await day(k);
    await p.evaluate(async ([n, iso]) => { await Vault.createCase({ number: n, subject: 'Jane Roe', opened: iso }); }, [n, iso]);
  }
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelectorAll('.side-group[aria-expanded="false"], .group-toggle[aria-expanded="false"]').forEach((x) => x.click()));
  const items = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.case-item')].map((it) => {
    const num = it.querySelector('.case-item-title').textContent.trim(); const o = it.querySelector('.cim-opened'); const line = it.querySelector('.case-item-opened'); const sub = it.querySelector('.cim-subject');
    return [num, { opened: o && o.textContent, tip: line && line.title, clipped: !!o && o.scrollWidth > o.clientWidth + 1, nameClipped: sub.scrollWidth > sub.clientWidth + 1,
      below: !!line && line.getBoundingClientRect().top >= sub.getBoundingClientRect().bottom - 1, itemTip: it.title }];
  })));
  console.log(JSON.stringify(items));
  const ex = (n) => items[n] || Object.values(items).find(() => false) || {};
  ok(/^[A-Z][a-z]{2} \d{2}, \d{4} · today$/.test(ex('EX-100').opened || ''), `opened today: "${ex('EX-100').opened}"`);
  ok(/ · 5d$/.test(ex('EX-500').opened || ''), `5 days ago: "${ex('EX-500').opened}"`);
  ok(/ · 2mo$|· 3mo$/.test(ex('EX-600').opened || ''), `90 days ago: "${ex('EX-600').opened}"`);
  ok(/ · 2y$/.test(ex('EX-700').opened || ''), `800 days ago: "${ex('EX-700').opened}"`);
  ok(/Opened .*, 5 days ago/.test(ex('EX-500').tip || ''), 'pointing at it gives the long date and the days');
  ok(Object.values(items).every((x) => !x.clipped && x.below), 'the date sits on its own line under the Subject Name, never cut off');
  ok(Object.values(items).every((x) => !x.nameClipped), 'the Subject Names are not cut off');
  ok(/Opened /.test(ex('EX-500').itemTip || ''), 'the case\'s hover box says when it was opened');
  await p.locator('#sidebar, .sidebar').first().screenshot({ path: process.env.SP + '/v1100/sidebar.png' }).catch(() => {});

  // Draft: no red before saving; after Save Changes, the blanks of incomplete parts are red.
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(500);
  const red = () => p.evaluate(() => [...document.querySelectorAll('.rf-section')].map((s) => [s.className.match(/rf-(\w+)/g)[1], s.querySelectorAll('.rf-missing').length, s.classList.contains('rf-complete')]));
  let r = await red();
  ok(r.every(([, n]) => n === 0), 'nothing is red before Save Changes');
  await p.click('button:has-text("Save Changes")'); await p.waitForTimeout(800);
  r = await red();
  console.log(JSON.stringify(r));
  ok(r.filter(([, , done]) => !done).every(([, n]) => n > 0), 'every part without its green check has red outlines');
  ok(r.filter(([, , done]) => done).every(([, n]) => n === 0), 'parts with their green check have none');
  const toastText = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
  ok(/still blank \(outlined in red\)/.test(toastText), `the save message says so: ${toastText.slice(0, 120)}`);
  ok(await p.evaluate(() => [...document.querySelectorAll('.rf-missing')].every((el) => el.offsetParent && getComputedStyle(el).outlineStyle === 'solid')), 'every red outline is on a box you can see');
  // fill one red field: its outline goes away by itself
  const before = await p.evaluate(() => document.querySelectorAll('.rf-missing').length);
  const target = p.locator('.rf-missing input[type=text]:not(.date-text)').first();
  await target.fill('Synthetic value'); await p.waitForTimeout(400);
  const after = await p.evaluate(() => document.querySelectorAll('.rf-missing').length);
  ok(after === before - 1, `filling a red field clears its outline (${before} → ${after})`);
  // ticking a part off clears its red
  const sec = await p.evaluate(() => { const s = [...document.querySelectorAll('.rf-section')].find((x) => x.querySelector('.rf-missing')); return s && s.className.match(/rf-(\w+)/g)[1]; });
  await p.click(`.${sec} .rf-include input`); await p.waitForTimeout(400);
  ok(await p.evaluate((s) => document.querySelectorAll(`.${s} .rf-missing`).length === 0, sec), `ticking ${sec} off removes its red outlines`);
  await p.click(`.${sec} .rf-include input`); await p.waitForTimeout(400);
  ok(await p.evaluate((s) => document.querySelectorAll(`.${s} .rf-missing`).length > 0, sec), 'ticking it back on shows them again');
  await p.screenshot({ path: process.env.SP + '/v1100/draft.png' });
  console.log('errors', errs); await b.close(); })();
