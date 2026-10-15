// v1.125: the type scale. On the main pages every piece of visible text is one of six sizes (tiny, small,
// text, sub-section, section, title); only the clock and the BETA tag keep their own (and words hidden at
// size 0 behind an icon). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const scale = await p.evaluate(() => { const r = getComputedStyle(document.documentElement); return ['--fs-tiny', '--fs-small', '--fs-text', '--fs-sub', '--fs-section', '--fs-title'].map((k) => r.getPropertyValue(k).trim()); });
  ok(scale.every(Boolean), `the six sizes are defined: ${scale.join(' ')}`);
  const px = await p.evaluate((s) => s.map((v) => { const d = document.createElement('span'); d.style.fontSize = v; document.body.append(d); const x = getComputedStyle(d).fontSize; d.remove(); return x; }), scale);
  for (const h of ['#/', `#/case/${ids.c}/details`, `#/case/${ids.c}/timeline`, '#/general', `#/operation/${ids.op}`, '#/operations']) {
    await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(900);
    const off = await p.evaluate((allowed) => {
      const out = new Set();
      for (const el of document.querySelectorAll('main *, #sidebar *, header *')) {
        if (!el.offsetParent || el.closest('.sr-only, .hero-clock, .beta-tag, svg')) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const f = getComputedStyle(el).fontSize;
        if (f !== '0px' && !allowed.includes(f)) out.add(`${f} ${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`);
      }
      return [...out];
    }, px);
    ok(!off.length, `${h.replace(/\/[a-z0-9-]{8,}/i, '/…')}: every text on the scale${off.length ? `; off: ${off.slice(0, 6).join(', ')}` : ''}`);
  }
  const weights = await p.evaluate(() => [...new Set([...document.querySelectorAll('main *, #sidebar *')].filter((e) => e.offsetParent).map((e) => getComputedStyle(e).fontWeight))].sort());
  ok(weights.every((w) => ['400', '600', '700'].includes(w)), `three weights only: ${weights.join(', ')}`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
