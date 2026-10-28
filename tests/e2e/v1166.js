// v1.166: each Secure Locker row on one line, nothing cut and no sideways scroll bar; on a narrow
// window long names wrap between words instead. A new locker says "Locks after 5 minutes" (it said
// "undefined"). All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1166';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1920, 1000);
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });

  const note = await p.textContent('.locker-note');
  ok(/Locks after 5 minutes/.test(note) && !/undefined/.test(note), `a new locker says 5 minutes: ${note.trim()}`);
  ok(await p.$eval('select.lock-after', (s) => s.value) === '5', 'Lock After shows 5 Minutes');

  const F = (l) => `#dialog[open] .locker-form .field:has(> span:text-is("${l}")) :is(input, textarea)`;
  for (const [s, pw, n] of [['Example City Records Portal', 'Xk9#mQ2!vL7$pR4z', 'A note'], ['Mail', 'abc', ''], ['Evidence System Long Name Here', 'Tr0ub4dor&3xyzQW!', '']]) {
    await p.click('.locker-section button:has-text("Add Password")'); await p.waitForSelector('#dialog[open] .locker-form');
    await p.fill(F('Site / System'), s); await p.fill(F('Username'), 'john.doe.example'); await p.fill(F('Password'), pw);
    await p.fill(F('PIN'), '1234'); await p.fill(F('Email'), 'john.doe.example@example.com');
    if (n) await p.fill(F('Notes'), n);
    await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(500);
  }
  const look = () => p.evaluate(() => {
    const t = document.querySelector('.locker-rows'); const w = t.closest('.table-wrap');
    const rows = [...t.querySelectorAll('tbody tr')];
        const cut = [...t.querySelectorAll('td, th, .copy-text')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length;
    const actsInside = rows.every((r) => { const a = r.querySelector('.danger-icon').getBoundingClientRect(); return a.right <= w.getBoundingClientRect().right + 0.5; });
    return { scroll: w.scrollWidth - w.clientWidth, tight: t.classList.contains('tight'), lines: Math.max(...rows.flatMap((r) => [...r.querySelectorAll('td.text-cell:not(.copy-cell), .copy-text')].map((td) => { const g = document.createRange(); g.selectNodeContents(td); return new Set([...g.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; }))), cut, actsInside,
      tagsBeside: rows.every((r) => { const d = r.querySelector('.secret-text').getBoundingClientRect(); const g = r.querySelector('.pw-tags').getBoundingClientRect(); return Math.abs(d.top + d.height / 2 - (g.top + g.height / 2)) < 6; }),
      heads: [...t.querySelectorAll('thead th')].map((e) => e.textContent).filter(Boolean) };
  });
  const wide = await look();
  ok(wide.scroll <= 0 && !wide.tight && wide.actsInside, `wide window: no sideways scroll ${JSON.stringify(wide)}`);
  ok(wide.lines === 1 && wide.tagsBeside, `${wide.lines} line(s): ` + 'each row on one line, Strong / Weak and the age beside the password');
  ok(!wide.heads.includes('Department'), 'no Department column while no row has one');
  ok(await p.$$eval('.locker-rows .locker-edit', (x) => x.every((e) => e.classList.contains('icon-btn') && e.textContent.includes('Edit'))), 'Edit is an icon, named for screen readers');
  await p.locator('.locker-section').first().screenshot({ path: `${SP}/wide.png` }).catch(() => {});

  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(500);
  const narrow = await look();
  ok(narrow.scroll <= 0 && narrow.cut === 0 && narrow.actsInside, `narrow window: no sideways scroll and nothing cut ${JSON.stringify(narrow)}`);
  await p.locator('.locker-section').first().screenshot({ path: `${SP}/narrow.png` }).catch(() => {});

  await p.click('.locker-tabs button:has-text("Covert")'); await p.waitForTimeout(300);
  const heads = await p.$$eval('.locker-section .locker-rows thead th', (x) => x.map((e) => [e.textContent, e.title]).filter((e) => e[0]));
  ok(heads.some(([t, ti]) => t === 'Alias' && ti === 'Alias It Belongs To') && heads.some(([t]) => t === 'Birth Date'), `short headings, the full one in the hover box: ${JSON.stringify(heads.map((h) => h[0]))}`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
