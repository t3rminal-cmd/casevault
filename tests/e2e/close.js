const { chromium } = require('playwright');
const SP = process.env.SP;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 900 } }); await require("./openall.js")(p);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('cv.editMode', 'markdown'); } catch {} window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('CL' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/');
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.evaluate(() => document.getElementById('btn-new-case').click()); await (async (T) => { await p.fill('input[name=subject]', T); await p.evaluate(async (t) => { let op = Vault.listOperations().find((o) => o.name === t); if (!op) op = await Vault.createOperation({ number: 'OP-' + String(Vault.listOperations().length + 1).padStart(3, '0'), name: t }); const s = document.querySelector('select[name=operationId]'); if (![...s.options].some((o) => o.value === op.id)) s.add(new Option(op.number + ' - ' + op.name, op.id)); s.value = op.id; s.dispatchEvent(new Event('change')); }, T); })('State v. John Doe'); await p.fill('input[name=number]', '00123'); await p.click('text=Create case'); for (let i = 0; i < 4; i++) { await p.waitForTimeout(150); if (await p.isVisible('.subject-warn')) await p.click('.subject-warn .btn.primary'); else break; }
  await p.waitForFunction(() => document.querySelector('#case-subject')?.textContent === 'State v. John Doe');
  const statusSel = '.tab-panel .form-grid label:has(> span:text-is("Status")) select';
  console.log('status note (Open):', await p.textContent('.status-note'));
  // Notes save button
  await p.evaluate(() => { location.hash = '#/case/' + encodeURIComponent(CaseVaultUI.state.caseId) + '/notes'; }); await p.waitForSelector('.notes-editor'); await p.fill('.notes-editor', 'Test note'); console.log('notes status while typing:', await p.textContent('.note-save-status'));
  await p.click('.tab-panel button:has-text("Save")'); await p.waitForTimeout(400); console.log('notes status after Save:', await p.textContent('.note-save-status'));
  await p.click('.tab:has-text("Details")'); await p.waitForSelector('.case-actions');
  // Pending
  await p.selectOption(statusSel, 'Pending'); await p.waitForSelector('#dialog[open] h2:has-text("Pending")');
  await p.screenshot({ path: SP + '/cl-1-pending.png' });
  await p.click('#dialog[open] button:has-text("Set to Pending")'); await p.waitForTimeout(800);
  console.log('status note (Pending):', await p.textContent('.status-note'));
  console.log('case list:', await p.innerText('#case-list .case-item'));
  // Close by arrest
  await p.click('.case-actions button:has-text("Close case")'); await p.waitForSelector('#dialog[open] .close-form');
  console.log('checklist:', (await p.innerText('#dialog[open] .close-form')).split('\n').slice(0, 6).join(' | '));
  await p.check('#dialog[open] input[value=arrest]');
  await p.screenshot({ path: SP + '/cl-2-close.png' });
  // v1.84: closing by arrest needs the arrest report first.
  console.log('close disabled without report:', await p.$eval('#dialog[open] .close-form button[type=submit]', (x) => x.disabled));
  await p.click('#dialog[open] .arrest-required button');
  await p.waitForSelector('.arrestee', { timeout: 10000 });
  console.log('tabs:', await p.$$eval('.tabs .tab', (t) => t.map((x) => x.textContent)), '| url:', await p.evaluate(() => location.hash));
  const fill = (label, v) => p.locator('.arrestee label.field', { hasText: label }).first().locator('input, textarea').fill(v);
  await fill('First name', 'John'); await fill('Last name', 'Doe'); await fill('Location', 'Sample Street');
  await p.locator('.arrestee label.field', { hasText: 'Date of birth' }).locator('.date-text').fill('04.02.1990');
  await p.locator('.arrestee label.field', { hasText: 'Arrest date' }).locator('.date-text').fill('03.14.2026');
  await p.locator('.charges-table tbody tr').first().locator('input').nth(0).fill('TEST 1.01');
  await p.locator('.charges-table tbody tr').first().locator('input').nth(1).fill('Possession of a controlled substance');
  await p.locator('.charges-table tbody tr').first().locator('select').selectOption('Felony');
  await p.click('.toolbar button.primary:has-text("Save")'); await p.waitForTimeout(800);
  console.log('arrest save status:', await p.textContent('.note-save-status'));
  await p.click('.tab:has-text("Details")'); await p.waitForSelector('.case-actions');
  await p.click('.case-actions button:has-text("Close case")'); await p.waitForSelector('#dialog[open] .close-form');
  await p.check('#dialog[open] input[value=arrest]');
  await p.fill('input[aria-label="Closed by"]', 'Det. Sample'); await p.click('#dialog[open] button:has-text("Close case")'); await p.waitForTimeout(900);
  await p.waitForSelector('#dialog[open] h2:has-text("Close the Mission too?")'); await p.click('#dialog[open] button:has-text("Keep it open")'); await p.waitForTimeout(500); await p.click('.tab:has-text("Arrest")'); await p.waitForSelector('.arrestee', { timeout: 10000 });
  await p.screenshot({ path: SP + '/cl-3-arrest.png', fullPage: false });
  await p.click('button:has-text("Start an arrest report draft")'); await p.waitForSelector('.draft-editor', { timeout: 10000 });
  const body = await p.inputValue('.draft-editor');
  console.log('report draft:\n' + body.split('\n').filter((l) => /Name|birth|Location|Charges|TEST|Arrestee|Date and time/.test(l)).join('\n'));
  await p.click('.tab:has-text("Details")'); await p.waitForSelector('.case-actions');
  console.log('status note (Closed):', await p.textContent('.status-note'));
  await p.click('.case-actions button:has-text("Reopen case")'); await p.click('#dialog[open] button:has-text("Reopen case")'); await p.waitForTimeout(800);
  console.log('after reopen:', await p.inputValue(statusSel), '|', await p.textContent('.status-note'), '| arrest tab kept:', await p.$$eval('.tabs .tab', (t) => t.some((x) => /Arrest/.test(x.textContent))));
  console.log('errors:', errs); await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
