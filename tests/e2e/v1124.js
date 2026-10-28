// v1.124: the Navy Ledger theme: the bundled JetBrains Mono font, the navy accent, one colour per status
// (Open blue, Closed green, Archived warm grey) in light and dark, and a flat navy banner. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1124';

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.hero');
  const look = (theme) => p.evaluate(async (t) => {
    if (t) document.documentElement.setAttribute('data-theme', t);
    await document.fonts.ready;
    const v = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    return { font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, ''), loaded: document.fonts.check('15px "JetBrains Mono"'),
      accent: v('--accent'), open: v('--st-open'), closed: v('--st-closed'), archived: v('--st-archived'), bg: v('--bg'),
      hero: getComputedStyle(document.querySelector('.hero')).backgroundImage.includes('linear-gradient') };
  }, theme);
  const light = await look('light');
  ok(light.font === 'JetBrains Mono' && light.loaded, `the bundled font is in use: ${light.font}`);
  ok(light.accent === '#1f3a5f' && light.bg === '#f5f4f0' && light.hero, `light: navy accent on warm off-white: ${JSON.stringify(light)}`);
  ok(light.open === '#2f6db5' && light.closed === '#a3262e' && light.archived === '#6b665c', 'light: Open blue, Closed red (v1.167), Archived warm grey');
  await p.screenshot({ path: `${SP}/home-light.png` });
  const dark = await look('dark');
  ok(dark.accent === '#8fb3e0' && dark.bg === '#11161e' && dark.open === '#8fb3e0' && dark.closed === '#ef8a86', `dark: the same meanings, lighter tones: ${JSON.stringify(dark)}`);
  await p.screenshot({ path: `${SP}/home-dark.png` });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
