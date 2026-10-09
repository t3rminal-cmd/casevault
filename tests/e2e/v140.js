const { chromium } = require('playwright');
const SP = process.env.SP;
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); await require("./openall.js")(p); const errs = [];
  p.on('pageerror', (e) => errs.push(e.stack.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('V40' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/'); await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.click('.quick-actions button:has-text("New Case")'); await (async (T) => { await p.fill('input[name=subject]', T); await p.evaluate(async (t) => { let op = Vault.listOperations().find((o) => o.name === t); if (!op) op = await Vault.createOperation({ number: 'OP-' + String(Vault.listOperations().length + 1).padStart(3, '0'), name: t }); const s = document.querySelector('select[name=operationId]'); if (![...s.options].some((o) => o.value === op.id)) s.add(new Option(op.number + ' - ' + op.name, op.id)); s.value = op.id; s.dispatchEvent(new Event('change')); }, T); })('Alpha Op'); await p.fill('input[name=number]', 'JH1'); await p.click('text=Create case'); for (let i = 0; i < 4; i++) { await p.waitForTimeout(150); if (await p.isVisible('.subject-warn')) await p.click('.subject-warn .btn.primary'); else break; } await p.waitForSelector('#case-title');
  const id = await p.evaluate(() => Vault.data.cases[0].id);
  // timeline
  await p.evaluate(async (id) => { await Vault.saveTimeline(id, { events: [{ id: 'e1', date: '2026-09-30', time: '14:30', kind: 'deadline', title: 'Grand jury subpoena return', note: 'Synthetic', done: false }, { id: 'e2', date: '2026-10-12', time: '', kind: 'event', title: 'Controlled buy', note: '', done: false }] }); }, id);
  await p.evaluate((id) => { location.hash = `#/case/${id}/timeline`; }, id); await p.waitForTimeout(900);
  console.log('1 buttons:', await p.$$eval('.timeline-form .form-actions button:not([hidden])', (x) => x.map((e) => e.textContent)));
  await p.fill('.tl-title-input', 'Something'); await p.selectOption('.timeline-form select >> nth=0', 'deadline'); await p.fill('.timeline-form textarea', 'note');
  await p.click('.timeline-form button:has-text("Clear")');
  console.log('  after clear:', await p.$eval('.tl-title-input', (e) => e.value), '|', await p.$eval('.timeline-form textarea', (e) => e.value), '|', await p.$eval('.timeline-form select', (e) => e.value));
  console.log('2 date lines:', await p.$$eval('.tl-when > div:first-child', (x) => x.map((e) => [e.textContent, Math.round(e.getBoundingClientRect().height)])));
  await p.locator('.timeline').screenshot({ path: `${SP}/v140-tl.png` });
  // two draft-sent reports + one New Report
  const send = async (offense, extra) => {
    // Leave the Draft page first, so its last save has finished before the file is read again.
    await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(400);
    await p.evaluate(async ([id, offense, extra]) => { const d = await CVReportFieldsUI.load({ id }); await Vault.writeCaseJSON(id, 'report-fields.json', { ...d, offense, ...extra }); }, [id, offense, extra]);
    await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, id); await p.waitForSelector('.rf-actions');
    await p.click('.rf-actions button:has-text("Send Draft to Reports")'); await p.waitForTimeout(2200);
  };
  await send('Delv: Synthetic A', {}); await send('Delv: Synthetic B', { sentSlug: '' });
  await p.evaluate(async (id) => { await Vault.saveDraft(id, 'memo', { title: 'Memo Sample', type: 'other', ai: false, created: new Date().toISOString() }, '# Memo Sample\n\nSynthetic text.'); }, id);
  await p.evaluate((id) => { location.hash = `#/case/${id}/reports`; }, id); await p.waitForSelector('.reports-table');
  const rowsOf = () => p.$$eval('.reports-table tbody tr', (x) => x.map((e) => e.dataset.slug + ':' + [...e.querySelectorAll('td.actions [title]')].map((b) => b.getAttribute('title').split(' ')[0]).join('/')));
  console.log('3 rows:', await rowsOf());
  console.log('  sentPdf non-null:', await p.evaluate(async (id) => Promise.all(['supplementary-report', 'supplementary-report-2'].map(async (s) => { const b = await CVReportFieldsUI.sentPdf({ id, title: 'Alpha Op', number: 'JH1' }, s); return b && b.length; })), id));
  await p.screenshot({ path: `${SP}/v140-reports.png` });
  // view
  await p.click('.reports-table tr[data-slug="supplementary-report"] .report-open'); await p.waitForSelector('.report-preview iframe'); await p.waitForTimeout(1200);
  console.log('4 viewer head:', await p.$$eval('.report-preview .preview-head > *', (x) => x.map((e) => e.textContent.trim())), '| hash:', await p.evaluate(() => location.hash));
  await p.screenshot({ path: `${SP}/v140-view.png` });
  await p.click('.report-preview button:has-text("Close")'); await p.waitForTimeout(300);
  await p.click('.reports-table tr[data-slug="memo"] .report-open'); await p.waitForSelector('.report-preview iframe');
  console.log('  memo head:', await p.$$eval('.report-preview .preview-head button', (x) => x.map((e) => e.textContent.trim())));
  await p.click('.report-preview button:has-text("Close")'); await p.waitForTimeout(300);
  // reorder
  await p.focus('.reports-table tbody tr:first-child .grip-btn'); await p.keyboard.press('Alt+ArrowDown'); await p.waitForTimeout(800);
  console.log('5 after alt-down:', await rowsOf());
  const src = p.locator('.reports-table tbody tr').nth(2); const dst = p.locator('.reports-table tbody tr').nth(0);
  await src.dragTo(dst, { targetPosition: { x: 50, y: 3 } }); await p.waitForTimeout(800);
  console.log('  after drag last->top:', await rowsOf(), '| file:', JSON.stringify(await p.evaluate((id) => Vault.readCaseJSON(id, 'reports-order.json'), id)));
  // send back from list
  await p.click('.reports-table tr[data-slug="supplementary-report"] button[title^="Send Back"]'); await p.waitForTimeout(400);
  const ok = await p.$('.dialog button:has-text("Send Back")'); if (ok) await ok.click();
  await p.waitForTimeout(1200);
  console.log('6 send back ->', await p.evaluate(() => location.hash), '| offense:', (await p.evaluate((id) => CVReportFieldsUI.load({ id }), id)).offense);
  console.log('errors:', errs);
  await b.close();
})();
