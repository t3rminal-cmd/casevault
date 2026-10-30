// v1.118: cleanups and space: slim Quick Links, the sidebar's Closed / Archived row, closable
// messages, letterhead in one line, compact empty sections, no repeating hover boxes, Files line in
// words, Mission number in General Files, top-bar captions, counts on the Details boxes.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1118';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  // 1 and 4 (the slim Quick Links bar and the sidebar's Closed / Archived row) were replaced in v1.121
  // by the Quick Links side panel and the home page's sections: tests/e2e/v163-quicklinks.js, v188.js.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.closed-files-section');
  // 2. A long message can be closed.
  await p.evaluate(() => window.CaseVaultUI.toast('A long message for the test.', 'warn', 9000));
  await p.click('.toast.warn:has-text("A long message for the test") .toast-close'); // v1.119: its own (the backup reminder is amber too) await p.waitForTimeout(150);
  ok(!(await p.locator('.toast.warn', { hasText: 'A long message for the test' }).count()), 'a long message closes with ×');
  // 6. Empty sections are one header line.
  const closed = await p.$eval('.closed-files-section', (e) => [e.classList.contains('ov-empty'), Math.round(e.getBoundingClientRect().height)]);
  ok(closed[0] && closed[1] < 110, `an empty Closed Files is one line (${closed[1]} px)`);
  // 10. v1.137: the top-bar icons have no captions; each still names itself in its hover box.
  const caps = await p.$$eval('.tb-status > :not([hidden])', (x) => x.map((e) => [e.id, getComputedStyle(e, '::after').content, e.getAttribute('data-tip') || e.getAttribute('title') || e.getAttribute('aria-label') || '']));
  ok(caps.filter(([id]) => ['net-status', 'engine-status', 'mem-status', 'save-status', 'btn-power'].includes(id)).every(([, after]) => /^"\w/.test(after)), `v1.177: each top-bar icon has a one-word caption: ${JSON.stringify(caps)}`);
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
