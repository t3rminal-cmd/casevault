// v1.132: typing stays smooth. After a save the case list keeps its rows (only a changed subject's
// row is drawn again), and Options → Saving While You Type: after a pause (default), every 5 or 30
// minutes, with Ctrl+S and a page change saving at once. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1132';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c);
  await p.waitForSelector('.tab-panel input[placeholder="No subject yet"]');
  // Mark the row of another case: a full redraw of the list would replace it.
  const other = `#case-list a.case-item[href="#/case/${await p.evaluate((i) => CVRoute.enc(i), ids.c2)}"]`;
  await p.waitForSelector(other, { state: 'attached' });
  await p.$eval(other, (a) => { a.closest('li').dataset.mark = 'kept'; });

  // 1. After a pause: the subject saves about 1.5 s after the last key; only its own row changes.
  const subject = '.tab-panel input[placeholder="No subject yet"]';
  await p.fill(subject, '');
  await p.type(subject, 'DOE, Johnny', { delay: 30 });
  await p.waitForTimeout(500);
  const early = await p.evaluate((id) => Vault.getCase(id).then((c) => c.subject), ids.c);
  ok(early !== 'DOE, Johnny', `not written while still within the pause: ${early}`);
  await p.waitForFunction((id) => Vault.data.cases.find((c) => c.id === id).subject === 'DOE, Johnny', ids.c, { timeout: 5000 });
  await p.waitForTimeout(400);
  const side = await p.evaluate(({ id, sel }) => ({
    mine: document.querySelector(`#case-list a.case-item[href="#/case/${CVRoute.enc(id)}"] .cim-subject`)?.textContent || '',
    kept: document.querySelector(sel)?.closest('li').dataset.mark || '',
  }), { id: ids.c, sel: other });
  ok(/DOE, Johnny/.test(side.mine), `the case list shows the new subject: ${side.mine}`);
  ok(side.kept === 'kept', 'the other rows of the case list were not drawn again');

  // 2. Options → Display → Saving While You Type.
  await p.evaluate(() => { CVOptions.open(window.CaseVaultUI); }); await p.waitForSelector('#dialog[open] .opt-choices');
  const choices = await p.$$eval('.opt-choice', (xs) => xs.map((x) => [x.textContent.trim(), x.classList.contains('active')]));
  ok(choices.map((c) => c[0]).join('|') === 'After a Pause|Every 5 Minutes|Every 30 Minutes' && choices[0][1], `three choices, After a pause chosen: ${JSON.stringify(choices)}`);
  const fit = await p.$$eval('.opt-choice', (xs) => xs.every((x) => x.scrollWidth <= x.clientWidth + 1));
  ok(fit, 'no choice is cut off');
  await p.locator('#dialog[open] .options-form').screenshot({ path: `${SP}/options.png` });
  await p.click('.opt-choice[data-key="30"]');
  ok(/30 minutes of typing can be lost/.test(await p.textContent('.opt-save-note')), 'Every 30 minutes says what can be lost');
  ok(await p.evaluate(() => localStorage.getItem('casevault-save-every')) === '30', 'kept for this PC');
  await p.click('#dialog[open] button:has-text("Done")'); await p.waitForTimeout(200);

  // 3. Every 30 minutes: typing waits; the save icon says when; Ctrl+S writes it now.
  await p.fill(subject, '');
  await p.type(subject, 'ROE, Jane', { delay: 30 });
  await p.waitForTimeout(2500);
  const waiting = await p.evaluate((id) => Vault.getCase(id).then((c) => c.subject), ids.c);
  ok(waiting === 'DOE, Johnny', `not written after a pause with Every 30 minutes: ${waiting}`);
  const status = await p.getAttribute('#save-status', 'aria-label');
  ok(/Not saved yet · saves at \d\d:\d\d/.test(status), `the save icon says when: ${status}`);
  const dot = await p.$('.tabs a.tab.unsaved');
  ok(!!dot, 'the Details tab shows its unsaved mark');
  await p.keyboard.press('Control+s'); await p.waitForTimeout(800);
  const saved = await p.evaluate((id) => Vault.getCase(id).then((c) => c.subject), ids.c);
  ok(saved === 'ROE, Jane' && /Saved to SSD/.test(await p.getAttribute('#save-status', 'aria-label')), `Ctrl+S saves at once: ${saved}`);
  // A page change saves too.
  await p.fill(subject, 'POE, Rick');
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(800);
  ok(await p.evaluate((id) => Vault.getCase(id).then((c) => c.subject), ids.c) === 'POE, Rick', 'going to another page saves at once');

  await p.evaluate(() => localStorage.removeItem('casevault-save-every'));
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
