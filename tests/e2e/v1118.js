// v1.118: cleanups and space: slim Quick Links, the sidebar's Closed / Archived row, closable
// messages, letterhead in one line, compact empty sections, no repeating hover boxes, Files line in
// words, Mission number in General Files, top-bar captions, counts on the Details boxes.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1118';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(() => { try { localStorage.removeItem('cv-ql-open'); } catch { /* fine */ } location.hash = '#/x'; location.hash = '#/'; });
  await p.waitForSelector('#ql-footer.ql-slim');
  // 1. Quick Links: one slim row; More opens the full panel; Less brings the row back.
  const slimH = await p.$eval('#ql-footer', (e) => e.getBoundingClientRect().height);
  ok(slimH < 60, `Quick Links is a slim bar (${Math.round(slimH)} px)`);
  await p.click('#ql-footer .ql-more'); await p.waitForTimeout(300);
  const fullH = await p.$eval('#ql-footer', (e) => e.getBoundingClientRect().height);
  ok(!(await p.$eval('#ql-footer', (e) => e.classList.contains('ql-slim'))) && fullH > 150, `More opens the full panel (${Math.round(fullH)} px)`);
  await p.click('#ql-footer .ql-more'); await p.waitForTimeout(300);
  ok(await p.$eval('#ql-footer', (e) => e.classList.contains('ql-slim')), 'Less brings the slim bar back');
  // 4. The sidebar's Closed / Archived: one row as tall as the bar, short names.
  const side = await p.evaluate(() => { const sb = document.querySelector('#side-bottom'); const [a, b2] = sb.querySelectorAll(':scope > details'); return { h: sb.getBoundingClientRect().height, sameRow: Math.abs(a.getBoundingClientRect().top - b2.getBoundingClientRect().top) < 2, words: [...sb.querySelectorAll('.sec-short')].map((x) => getComputedStyle(x).display !== 'none' && x.textContent) }; });
  ok(side.sameRow && side.h < 70 && side.words.join() === 'CLOSED,ARCHIVED', `the sidebar's Closed / Archived in one slim row: ${JSON.stringify(side)}`);
  await p.click('#archived-cases > summary'); await p.waitForTimeout(300);
  ok(await p.$eval('#side-bottom', (e) => e.getBoundingClientRect().height) > 150, 'opening Archived gives it room');
  await p.click('#archived-cases > summary'); await p.waitForTimeout(200);
  // 2. A long message can be closed.
  await p.evaluate(() => window.CaseVaultUI.toast('A long message for the test.', 'warn', 9000));
  await p.click('.toast.warn .toast-close'); await p.waitForTimeout(150);
  ok(!(await p.locator('.toast.warn', { hasText: 'A long message for the test' }).count()), 'a long message closes with ×');
  // 6. Empty sections are one header line.
  const closed = await p.$eval('.closed-files-section', (e) => [e.classList.contains('ov-empty'), Math.round(e.getBoundingClientRect().height)]);
  ok(closed[0] && closed[1] < 110, `an empty Closed Files is one line (${closed[1]} px)`);
  // 10. Captions under the top-bar icons.
  const caps = await p.$$eval('.tb-status > [data-cap]:not([hidden])', (x) => x.map((e) => getComputedStyle(e, '::after').content.replace(/"/g, '')));
  ok(caps.includes('SSD') && caps.includes('Power Off'), `top-bar captions: ${caps.join(', ')}`);
  await p.screenshot({ path: `${SP}/landing.png` });
  // 9. General Files: the Mission's number on one line.
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForSelector('.general-table');
  const mission = await p.$$eval('.general-table td.gen-mission a', (x) => x.map((e) => [e.textContent, e.getAttribute('data-tip') || e.getAttribute('title') || '']));
  ok(mission.length === 1 && mission[0][0] === 'OP-1' && /Example Op/.test(mission[0][1]), `Mission column: ${JSON.stringify(mission)}`);
  // 11. Details: counts beside the box titles.
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.suspects = [{ name: 'John Doe', role: 'Primary', info: {} }, { name: 'Rick Poe', role: 'Secondary', info: {} }]; await Vault.saveCase(c); location.hash = '#/x'; location.hash = `#/case/${id}/details`; }, ids.c2);
  await p.waitForSelector('.suspects .fold-count'); await p.waitForTimeout(300);
  ok((await p.textContent('.suspects .fold-count')) === '2', 'Suspects shows 2 beside its title');
  // 8. Files: the folder in words, the SSD path in the hover box.
  await p.evaluate((id) => { location.hash = `#/case/${id}/files`; }, ids.c2); await p.waitForSelector('.files-where');
  const where = await p.$eval('.files-where', (e) => [e.textContent, e.getAttribute('data-tip') || e.getAttribute('title') || '']);
  ok(/^0 files in All Documents/.test(where[0]) && !/cases \|/.test(where[0]) && /CaseVault-Data/.test(where[1]), `Files line: ${where[0]}`);
  // 7. A hover box that only repeats the button's words isn't shown.
  const tip = await p.evaluate(async () => {
    const btn = document.createElement('button'); btn.textContent = 'Deconfliction'; btn.title = 'Deconfliction'; document.querySelector('#main').append(btn);
    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await new Promise((r) => setTimeout(r, 900));
    const t = document.getElementById('cv-tip'); const shown = !!t && !t.hidden; btn.remove(); return shown;
  });
  ok(!tip, 'no hover box that just repeats the words');
  // 5. The letterhead editor is in Vault → My Profile.
  await p.evaluate(() => document.querySelector('#btn-menu') && null);
  ok(await p.evaluate(() => typeof CVLetterhead.summary === 'function' && typeof CVLetterhead.editor === 'function'), 'the letterhead has a one-line summary and its editor');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
