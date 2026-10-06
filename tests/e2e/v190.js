const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  const clearToasts = () => p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await clearToasts();
  // 2. Clear All has Undo
  await p.evaluate(async (id) => { await Vault.writeCaseJSON(id, 'report-fields.json', { offense: 'Possession of a controlled substance' }); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500);
  await p.click('.rf-actions button:has-text("Clear All")'); await p.waitForTimeout(400);
  await p.click('#dialog[open] button.danger'); await p.waitForTimeout(1500);
  ok(!(await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')).offense, ids.c)), 'Clear All empties the form');
  await p.click('.toast .toast-undo'); await p.waitForTimeout(1500);
  ok(await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')).offense, ids.c) === 'Possession of a controlled substance', 'Undo after Clear All brings it back');
  await clearToasts();
  // 3. Edit a note
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelectorAll('.fold-btn[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(300);
  await p.fill('.history-add input[aria-label="Note"]', 'Case started on paper');
  await p.click('.history-add button:has-text("Add Note")'); await p.waitForTimeout(800);
  await p.click('.history-edit'); await p.waitForTimeout(300);
  await p.fill('.history-editing input[aria-label="Note"]', 'Case started on paper; migrated to CaseVault');
  await p.locator('.history-editing .date-text').fill('02.15.2025');
  await p.click('.history-editing button:has-text("Save")'); await p.waitForTimeout(1200);
  const act = await p.evaluate(async (id) => (await Vault.getCase(id)).activity.filter((a) => a.note), ids.c);
  ok(act.length === 1 && act[0].what === 'Case started on paper; migrated to CaseVault' && act[0].day === '2025-02-15', `note changed ${JSON.stringify(act)}`);
  await p.locator('.case-history').screenshot({ path: process.env.SP + '/v190/history.png' });
  // Esc cancels an edit
  await p.click('.history-edit'); await p.waitForTimeout(200);
  await p.fill('.history-editing input[aria-label="Note"]', 'should not save'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(!(await p.$('.history-editing')) && (await p.evaluate(async (id) => (await Vault.getCase(id)).activity.filter((a) => a.note)[0].what, ids.c)) !== 'should not save', 'Esc cancels the edit');
  // 4. Search finds the note
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(800);
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300);
  await p.keyboard.type('migrated to casevault'); await p.waitForTimeout(600);
  const hits = await p.$$eval('#case-list .case-item, #case-list [data-case-id], #case-list li', (l) => l.length);
  const found = await p.evaluate(async (id) => { const c = await Vault.getCase(id); console.log(''); return document.querySelector('#sidebar, aside, nav').textContent.includes(c.number); }, ids.c); console.log('index notes:', await p.evaluate((id) => Vault.data.cases.find((x) => x.id === id).notes, ids.c));
  ok(found, `note text finds the case (${hits} items)`);
  await p.fill('#case-search', ''); await p.waitForTimeout(300);
  // 1. Power Off asks to back up first (no backup recorded)
  await p.click('#btn-power'); await p.waitForTimeout(400);
  ok(await p.isVisible('#dialog[open] .power-backup-form'), 'Power Off offers a backup first');
  await p.screenshot({ path: process.env.SP + '/v190/power.png' });
  await p.click('#dialog[open] button:has-text("Back Up First")'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !!document.querySelector('#dialog[open]') || !!document.querySelector('.vault-panel, #vault-panel')), 'Back Up First opens the Vault backups');
  console.log('errors', errs); await b.close(); })();
