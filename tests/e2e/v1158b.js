// v1.158 (follow-up): with the case list made narrow, none of its top icons (the padlock last) runs
// past its right edge; and Case Group folders show LAST, | First | M. lined up from one to the
// next, like the cases. All data is made up (Doe / Roe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1158b';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  for (const w of [200, 240, 300, 520]) {
    await p.evaluate((x) => document.documentElement.style.setProperty('--sidebar-w', `${x}px`), w); await p.waitForTimeout(200);
    const out = await p.evaluate(() => { const s = document.querySelector('#sidebar').getBoundingClientRect(); return [...document.querySelectorAll('#sidebar .sidebar-head > *')].filter((e) => e.offsetParent).map((e) => ({ id: e.id, over: Math.round(e.getBoundingClientRect().right - s.right) })).filter((x) => x.over > 0); });
    ok(out.length === 0, `case list ${w}px: every top icon inside it ${JSON.stringify(out)}`);
  }
  const lockLast = await p.evaluate(() => { const h = [...document.querySelectorAll('#sidebar .sidebar-head > *')].filter((e) => e.offsetParent); return h[h.length - 1].id; });
  ok(lockLast === 'btn-sidebar-lock', `the padlock is still last: ${lockLast}`);
  await p.evaluate(() => document.documentElement.style.setProperty('--sidebar-w', '210px'));
  await p.locator('#sidebar .sidebar-head').screenshot({ path: `${SP}/head-210.png` }).catch(() => {});
  await p.evaluate(() => document.documentElement.style.setProperty('--sidebar-w', '300px'));

  // Two Case Groups named after people: their names line up in columns.
  await p.evaluate(async (i) => {
    const a = await Vault.getCase(i); a.suspectGroup = 'DOE, Jonathan Q'; await Vault.saveCase(a);
    const c = await Vault.createCase({ number: 'EX-800', subject: 'Mary Roe' }); c.suspectGroup = 'ROE, Mary P'; await Vault.saveCase(c);
  }, ids.c);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  const cols = await p.evaluate(() => [...document.querySelectorAll('#case-list .sg-name.cim-name')].map((n) => ({ t: n.textContent, last: Math.round(n.querySelector('.cim-last').getBoundingClientRect().left), first: Math.round(n.querySelector('.cim-first').getBoundingClientRect().left), mi: Math.round(n.querySelector('.cim-mi').getBoundingClientRect().left) })));
  ok(cols.length === 2 && new Set(cols.map((c) => c.last)).size === 1 && new Set(cols.map((c) => c.first)).size === 1 && new Set(cols.map((c) => c.mi)).size === 1, `Case Group names lined up: ${JSON.stringify(cols)}`);
  ok(cols.some((c) => c.t === 'DOE, Jonathan Q.'), 'the middle initial in its own column');
  await p.evaluate(() => document.querySelectorAll('#case-list details.general-group').forEach((d) => { d.open = true; })); await p.waitForTimeout(300);
  const fit = await p.evaluate(() => [...document.querySelectorAll('#case-list .sg-head')].map((x) => { const r = x.getBoundingClientRect(); const kids = [...x.children].map((k) => k.getBoundingClientRect()); return { inside: kids.every((k) => k.right <= r.right + 0.5), oneLine: new Set(kids.map((k) => Math.round(k.top / 4))).size <= 2, words: [...x.querySelectorAll('.cim-name > span')].every((s) => s.getClientRects().length <= 1) }; }));
  ok(fit.length === 2 && fit.every((f) => f.inside && f.words), `each Case Group row fits, no name broken: ${JSON.stringify(fit)}`);
  await p.locator('#case-list .general-group').first().screenshot({ path: `${SP}/groups.png` }).catch(() => {});
  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
