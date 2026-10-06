const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  // an error that mentions a case number and a phone
  await p.evaluate(() => { setTimeout(() => { throw new Error('Could not read cases/2026-EX-100/notes.md for John Doe, call 312-555-0100'); }, 0); });
  await p.waitForTimeout(200);
  await p.click('#btn-menu'); await p.click('#btn-problem'); await p.waitForSelector('.problem-form');
  const rep = await p.inputValue('.problem-preview');
  console.log(rep.split('\n').slice(0, 4).join(' | '));
  ok(!/EX-100|John Doe|312-555/.test(rep) && /\[removed\]|\[case\]/.test(rep), 'report scrubbed of case details');
  ok(/Could not read/.test(rep), 'error captured');
  await p.click('.problem-form button:has-text("Save to SSD")'); await p.waitForTimeout(500);
  console.log('saved:', await p.evaluate(async () => { const d = await Vault.root.getDirectoryHandle('exports'); const n = []; for await (const [k] of d.entries()) n.push(k); return n; }));
  // shortcuts
  await p.keyboard.press('?'); await p.waitForSelector('.shortcuts-form'); ok(true, '? opens shortcuts'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.keyboard.press('Control+k'); ok(await p.evaluate(() => document.activeElement.id === 'case-search'), 'Ctrl+K focuses search');
  await p.keyboard.press('Escape'); await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('n'); await p.waitForTimeout(400); ok(!!(await p.$('#dialog[open] .new-case-form')), 'N opens New Case'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // history + summary
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForTimeout(800);
  await p.selectOption('.details-row-title select', 'Pending'); await p.waitForSelector('#dialog[open]');
  await p.click('#dialog[open] button:has-text("Set to Pending")'); await p.waitForTimeout(800);
  await p.click('.case-history .fold-btn').catch(() => {}); await p.waitForTimeout(200);
  console.log('history:', await p.$$eval('.history-list li', (l) => l.map((x) => x.textContent)));
  await p.click('.case-actions button:has-text("Case Summary")'); await p.waitForSelector('#dialog[open] .pdf-view'); await p.waitForTimeout(1500);
  await p.screenshot({ path: process.env.SP + '/v185/summary-app.png' });
  await p.click('#dialog[open] button:has-text("Save PDF to Case")'); await p.waitForTimeout(600);
  console.log('files:', await p.evaluate(async (id) => (await Vault.listFiles(id)).map((f) => f.name), ids.c));
  await p.click('#dialog[open] button:has-text("Done")');
  console.log('beta tags:', await p.$$eval('.beta-tag', (e) => e.length), await p.$eval('.tab .beta-tag', (e) => e.parentElement.textContent));
  console.log('errors', errs.filter((e) => !/Could not read cases/.test(e))); await b.close(); })();
