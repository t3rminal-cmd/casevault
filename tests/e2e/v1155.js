// v1.155: the hidden case list's rail fits its buttons (no icon pushed outside it), also with
// wider buttons (a bigger browser font or another browser's sizes) and on a short window.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 360);
  await p.click('#btn-sidebar-collapse'); await p.waitForTimeout(300);
  const inside = () => p.evaluate(() => {
    const s = document.querySelector('.sidebar').getBoundingClientRect();
    const out = [...document.querySelectorAll('.sidebar-head > *')].filter((e) => e.offsetParent)
      .filter((e) => { const q = e.getBoundingClientRect(); return q.left < s.left - 0.5 || q.right > s.right + 0.5; }).map((e) => e.id);
    const head = document.querySelector('.sidebar-head');
    return { width: Math.round(s.width), out, sideways: head.scrollWidth > head.clientWidth };
  });
  let r = await inside();
  ok(!r.out.length && !r.sideways, `every rail icon inside the rail: ${JSON.stringify(r)}`);
  await p.click('#btn-sidebar-lock'); await p.waitForTimeout(300);
  r = await inside();
  ok(!r.out.length && !r.sideways, `locked too: ${JSON.stringify(r)}`);
  await p.click('#btn-sidebar-lock'); await p.waitForTimeout(300);
  // Wider buttons (as with a bigger font in Firefox): v1.157: the rail keeps its fixed width and
  // holds every button inside it.
  await p.evaluate(() => { for (const x of document.querySelectorAll('.sidebar-head > .icon-btn')) x.style.setProperty('width', '2.9rem', 'important'); });
  await p.waitForTimeout(300);
  r = await inside();
  ok(!r.out.length && !r.sideways, `wider buttons: every one stays inside the rail: ${JSON.stringify(r)}`);
  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
