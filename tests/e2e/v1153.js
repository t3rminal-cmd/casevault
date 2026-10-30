// v1.153: Undo, Timeline Quick Add with its deadline, Court dates (Timeline and Today), Copy Case
// Details, the duplicate-person note, Reports loading on first use with Versions, the Before You Send
// checklist, Alt+1…9, pinned cases in the sidebar, Bigger Text, the encrypted case export and the
// screen clearing when the SSD is pulled. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1153';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' }).catch(() => {});
  const open = async (tab) => { await p.evaluate(([i, t]) => { location.hash = `#/case/${CVRoute.enc(i)}/${t}`; }, [ids.c, tab]); await p.waitForSelector('.tabs a.tab.active'); await p.waitForTimeout(600); };
  const today = await p.evaluate(() => Vault.localDay());
  const plus = (n) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  // 0. Reports and the Write Report tab are not loaded at start-up.
  ok(await p.evaluate(() => !window.CVDraftsUI && !window.CVReportFieldsUI), 'Reports and Draft are not loaded at start-up');

  // 1. Timeline: Quick Add "Search Warrant Served" adds the event and its return deadline 10 days later.
  await open('timeline');
  await p.selectOption('select.tl-template', 'warrant');
  ok(await p.inputValue('.tl-title-input') === 'Search warrant served', 'the template fills the title');
  ok(await p.isVisible('.tl-follow'), 'it offers the deadline that follows');
  await p.click('form.timeline-form button[type=submit]'); await p.waitForTimeout(800);
  let tl = await p.evaluate((i) => window.__readCaseJSON(i, 'timeline.json'), ids.c);
  const dl = tl.events.find((e) => e.kind === 'deadline' && e.title === 'Search warrant return due');
  ok(tl.events.some((e) => e.title === 'Search warrant served') && dl && dl.date === plus(10), `event + deadline 10 days later: ${JSON.stringify(tl.events.map((e) => [e.kind, e.date, e.title]))}`);

  // 2. A Court date 5 days out: "Court in 5 days" on the Timeline, and on the home page's Today panel.
  await p.selectOption('select.tl-template', 'court');
  await p.evaluate((d) => { const el = document.querySelector('.timeline-form .date-field'); el.value = d; el.dispatchEvent(new Event('input', { bubbles: true })); }, plus(5));
  await p.click('form.timeline-form button[type=submit]'); await p.waitForTimeout(800);
  ok(/Court in 5 days/.test(await p.textContent('.timeline')), 'the court date counts down on the Timeline');
  await p.locator('.timeline').screenshot({ path: `${SP}/timeline.png` }).catch(() => {});

  // 3. Delete an entry, then Undo puts it back.
  const n0 = (await p.evaluate((i) => window.__readCaseJSON(i, 'timeline.json'), ids.c)).events.length;
  const row = p.locator('.tl-item', { hasText: 'Search warrant served' }).first();
  await row.locator('button', { hasText: 'Delete' }).click();
  await p.click('#dialog button.danger, #dialog .btn.danger'); await p.waitForTimeout(700);
  ok((await p.evaluate((i) => window.__readCaseJSON(i, 'timeline.json'), ids.c)).events.length === n0 - 1, 'deleted');
  await p.click('.toast .toast-undo'); await p.waitForTimeout(900);
  ok((await p.evaluate((i) => window.__readCaseJSON(i, 'timeline.json'), ids.c)).events.length === n0, 'Undo puts it back');

  // 4. Today panel: the court date is listed this week.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(1200);
  const todayText = await p.textContent('.today-section').catch(() => '');
  ok(/In 5 days/.test(todayText) && /Court/.test(todayText), `Today shows the court date: ${todayText.replace(/\s+/g, ' ').slice(0, 160)}`);

  // 5. Copy Case Details.
  await open('details');
  await p.click('button.action-btn:has-text("Copy Case Details")'); await p.waitForTimeout(500);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(/Case Number: EX-100/.test(clip) && /Next Court Date: /.test(clip) && /Next Deadline: .*Search warrant return due/.test(clip), `copied: ${clip.replace(/\n/g, ' | ')}`);

  // 6. A suspect with the name of a suspect on another case: a note with a link to it.
  await p.evaluate(async (i) => { const c = await Vault.getCase(i); c.suspects = [{ name: 'Mary Poe', dob: '1991-02-03', role: 'Primary', info: {} }]; await Vault.saveCase(c); }, ids.c2);
  await open('details');
  await p.evaluate(() => [...document.querySelectorAll('.suspects button')].find((x) => /Add suspect/i.test(x.textContent)).click()); await p.waitForTimeout(300);
  await p.evaluate(() => { const el = [...document.querySelectorAll('.suspect-card input[aria-label$=" name"]')].pop(); el.value = 'Mary Poe'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(1500);
  const dup = await p.evaluate(() => { const el = document.querySelector('.suspect-dup:not([hidden])'); return el ? el.textContent : ''; });
  ok(/on another case/.test(dup) && /EX-200/.test(dup), `duplicate-person note: ${dup}`);

  // 7. Reports load on first use; Versions keeps earlier text and puts it back.
  await p.evaluate(async (i) => { await Vault.saveDraft(i, 'buy-report', { title: 'Buy Report', type: 'other' }, 'First text.'); await Vault.saveDraft(i, 'buy-report', { title: 'Buy Report', type: 'other' }, 'Second text.'); }, ids.c);
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports', 'buy-report'), ids.c); await p.waitForSelector('.draft-actions-bar', { timeout: 15000 });
  ok(await p.evaluate(() => !!window.CVDraftsUI && !!window.CVReportFieldsUI), 'Reports loaded when opened');
  await p.click('.draft-actions-bar button:has-text("Versions")'); await p.waitForSelector('.ver-row');
  await p.click('.ver-row'); await p.waitForTimeout(400);
  ok(/First text/.test(await p.textContent('.ver-view')), 'an earlier version can be read');
  await p.screenshot({ path: `${SP}/versions.png` });
  await p.click('button:has-text("Put This Version Back")'); await p.waitForTimeout(1200);
  ok((await p.evaluate((i) => Vault.readDraft(i, 'buy-report'), ids.c)).body.trim() === 'First text.', 'Put This Version Back');

  // 8. Before You Send: the narrative mentions an exhibit that isn't in the evidence list.
  await p.evaluate(async (i) => { await CVLazy.reports(); const d = await CVReportFieldsUI.load({ id: i }); await Vault.writeCaseJSON(i, 'report-fields.json', { ...d, narrative: 'On 01/05/2026 the UC bought (Exhibit 9).', evidence: [] }); }, ids.c);
  await open('draft');
  await p.click('button:has-text("Save as Report")'); await p.waitForSelector('.send-check', { timeout: 8000 }).catch(() => {});
  const check = await p.textContent('.send-check').catch(() => '');
  ok(/Exhibit 9, which is not in the evidence list/.test(check), `checklist before sending: ${check.replace(/\s+/g, ' ').slice(0, 140)}`);
  await p.screenshot({ path: `${SP}/send-check.png` });
  await p.click('.send-check button:has-text("Cancel")'); await p.waitForTimeout(300);

  // 9. Alt+2 opens the second tab (the Timeline).
  await open('details');
  await p.keyboard.press('Alt+2'); await p.waitForTimeout(600);
  ok(/\/timeline$/.test(await p.evaluate(() => location.hash)), 'Alt+2 → Timeline');

  // 10. Pinned cases at the top of the sidebar.
  await p.evaluate(async (i) => { await Vault.updateSettings({ pinnedCases: [i] }); }, ids.c2);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(600);
  const pinnedSide = await p.textContent('#case-list .side-pinned').catch(() => '');
  ok(/Pinned/.test(pinnedSide) && /EX-200|Roe/.test(pinnedSide), `pinned at the top of the case list: ${pinnedSide.replace(/\s+/g, ' ').slice(0, 80)}`);

  // 11. Bigger Text: only the text sizes change.
  const sizes = await p.evaluate(() => { const before = getComputedStyle(document.body).fontSize; CVOptions.setTextSize(125); const after = getComputedStyle(document.body).fontSize; const attr = document.documentElement.getAttribute('data-text'); CVOptions.setTextSize(100); return { before, after, attr, back: document.documentElement.getAttribute('data-text') }; });
  ok(parseFloat(sizes.after) > parseFloat(sizes.before) && sizes.attr === '125' && sizes.back === null, `Bigger Text: ${JSON.stringify(sizes)}`);

  // 12. Export Encrypted: the whole case in one locked file; Import puts it back.
  const round = await p.evaluate(async (i) => {
    await CVLazy.caseExport();
    const files = await Vault.caseFolderFiles(i);
    const blob = await CVCaseExport.pack(files, 'Example pass 1', { caseId: i, number: 'EX-100' }, { iterations: 1000 });
    const r = await CVCaseExport.unpack(blob, 'Example pass 1');
    let wrong = '';
    try { await CVCaseExport.unpack(blob, 'nope'); } catch (e) { wrong = e.name; }
    return { files: files.length, back: r.files.length, hasCase: r.files.some((f) => f.path === 'case.json'), wrong };
  }, ids.c);
  ok(round.files > 2 && round.back === round.files && round.hasCase && round.wrong === 'WrongPassword', `encrypted export round trip: ${JSON.stringify(round)}`);
  await open('details');
  await p.click('button.action-btn:has-text("Export Encrypted")'); await p.waitForSelector('.case-export-form');
  await p.screenshot({ path: `${SP}/export.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 13. The SSD pulled: nothing of the case stays on the screen.
  await open('details');
  await p.evaluate(() => CaseVaultUI.onDriveLost()); await p.waitForTimeout(500);
  const left = await p.evaluate(() => ({ main: document.querySelector('#main').textContent.trim().length, dialogs: document.querySelectorAll('dialog[open]:not(#privacy-screen)').length, gate: !document.querySelector('#gate').hidden }));
  ok(left.main === 0 && left.dialogs === 0 && left.gate, `the screen is cleared when the SSD goes: ${JSON.stringify(left)}`);

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
