const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  // Draft: fill something, send, form clears; Undo brings it back.
  await p.evaluate(async (id) => { await Vault.writeCaseJSON(id, 'report-fields.json', { offense: 'Possession of a controlled substance', narrative: 'Sample summary.' }); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500);
  await p.click('.rf-actions button:has-text("Send Draft to Reports")'); await p.waitForTimeout(3000);
  const after = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')).offense, ids.c);
  ok(!after, `draft cleared after send (offense now "${after}")`);
  console.log('toast:', await p.$$eval('.toast', (t) => t.map((x) => x.textContent).join(' | ')));
  const reports = await p.evaluate(async (id) => (await Vault.listDrafts(id)).map((d) => d.title), ids.c);
  ok(reports.length === 1, `report sent (${reports})`);
  await p.click('.toast .toast-undo'); await p.waitForTimeout(1500);
  ok(await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')).offense, ids.c) === 'Possession of a controlled substance', 'Undo brings the draft back');
  // Details: Case History note and the Case Officer font
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelectorAll('.fold-btn[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(300);
  await p.fill('.history-add input[aria-label="Note"]', 'Case opened on paper; migrated to CaseVault');
  await p.locator('.history-add .date-text').fill('03.01.2025');
  await p.click('.history-add button:has-text("Add Note")'); await p.waitForTimeout(1200);
  console.log('history:', await p.$$eval('.history-list li', (l) => l.map((x) => [...x.children].map((c) => c.textContent).join(' | '))));
  const saved = await p.evaluate(async (id) => (await Vault.getCase(id)).activity, ids.c);
  ok(saved.some((a) => a.note && a.day === '2025-03-01'), 'note saved with its own date');
  await p.locator('.case-history').screenshot({ path: process.env.SP + '/v189/history.png' });
  const fonts = await p.evaluate(() => { const f = (el) => getComputedStyle(el).fontSize + '/' + getComputedStyle(el).fontWeight; return [f(document.querySelector('.contact-fixed')), f(document.querySelector('.contacts.cv-boxed .contact-row input'))]; });
  console.log('fonts', fonts);
  // Files: PDF preview in CaseVault's own viewer
  const pdf = await p.evaluate(() => Array.from(CVCaseSummary.build({ c: { number: 'EX-1' } })));
  await p.evaluate(async ([id, bytes]) => { await Vault.addFile(id, new File([new Uint8Array(bytes)], 'summary.pdf', { type: 'application/pdf' }), { folder: 'Supplementary Report', keepName: true }); }, [ids.c, pdf]);
  const name = await p.evaluate(async (id) => (await Vault.listFiles(id)).find((f) => /summary\.pdf$/.test(f.name)).name, ids.c);
  await p.evaluate(([id, n]) => { window.CaseVaultUI.previewFile({ id }, n); }, [ids.c, name]);
  await p.waitForSelector('.preview-pdf .pv-page', { timeout: 15000 });
  ok(!(await p.$('#dialog[open] iframe')), 'Files preview uses CaseVault\'s viewer (no browser frame)');
  await p.screenshot({ path: process.env.SP + '/v189/preview.png' });
  console.log('errors', errs); await b.close(); })();
