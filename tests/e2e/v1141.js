// v1.141: Ctrl+K finds certificates and Other Files; Cards / List for every folder; Timeline → Group by
// Suspect (and the PDF's aligned Suspect column); the vault mark on PDFs without a letterhead.
// All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1141';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async () => {
    const txt = (s) => new File([s], 'x', { type: 'text/plain' });
    await Vault.addShared('other', 'Training', new File(['%PDF-1.4\n'], 'Basic Narcotics.pdf', { type: 'application/pdf' }));
    await Vault.saveTraining({ 'Basic Narcotics.pdf': { course: 'Basic Narcotics Investigations', provider: 'Example Police Academy', date: '2024-03-04', hours: '40' } });
    await Vault.addShared('other', 'DEA Files', new File(['Example form'], 'Example Lab Request Form.txt', { type: 'text/plain' }));
    await Vault.addShared('other', 'DEA Files', new File(['Second'], 'Second Example Sheet.txt', { type: 'text/plain' }));
    void txt;
  });

  // 5. Ctrl+K: certificates by course and who gave it, and Other Files by name.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.quick-actions');
  await p.keyboard.press('Control+k'); await p.waitForSelector('#dialog[open] .find-input');
  await p.fill('#dialog[open] .find-input', 'narcotics academy'); await p.waitForTimeout(800);
  const rows = await p.$$eval('#dialog[open] .find-row', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')));
  ok(rows.some((r) => /Basic Narcotics Investigations/.test(r) && /certificate/i.test(r)), `Find lists the certificate: ${rows.slice(0, 3).join(' | ')}`);
  await p.fill('#dialog[open] .find-input', 'lab request'); await p.waitForTimeout(500);
  const rows2 = await p.$$eval('#dialog[open] .find-row', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')));
  ok(rows2.some((r) => /Example Lab Request Form/.test(r) && /DEA Files/.test(r) && /File/.test(r)), `Find lists Other Files: ${rows2.slice(0, 3).join(' | ')}`);
  await p.locator('#dialog[open] .find-input').screenshot({ path: `${SP}/find.png` }).catch(() => {});
  await p.keyboard.press('Enter'); await p.waitForSelector('#dialog[open]'); await p.waitForTimeout(600);
  ok(/Example Lab Request Form/.test(await p.textContent('#dialog[open]')), 'Enter opens the file');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 6. Cards / List for a folder, remembered.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.other-files-section .shared-tile');
  await p.locator('.other-files-section .shared-tile', { hasText: 'DEA Files' }).click(); await p.waitForTimeout(500);
  ok(await p.$('.other-files-section .shared-table') !== null && /List/.test(await p.textContent('.other-files-section .view-btn.on')), 'DEA Files starts as a list');
  await p.click('.other-files-section .view-btn:has-text("Cards")'); await p.waitForTimeout(500);
  const cards = await p.$$eval('.other-files-section .cert-card.file-card', (x) => x.map((c) => `${Math.round(c.getBoundingClientRect().width)}x${Math.round(c.getBoundingClientRect().height)}`));
  ok(cards.length === 2 && new Set(cards).size === 1, `Cards: same-size cards (${cards.join(', ')})`);
  ok(!(await p.$('.other-files-section .file-card .cert-edit')), 'no certificate details outside Training');
  await p.locator('.other-files-section').screenshot({ path: `${SP}/cards.png` });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.other-files-section .shared-tile');
  // The folder is still open (Other Files remembers it): its files are cards again.
  await p.waitForTimeout(500);
  if (!(await p.$('.other-files-section .shared-tile.open'))) { await p.locator('.other-files-section .shared-tile', { hasText: 'DEA Files' }).click(); await p.waitForTimeout(500); }
  ok(await p.$('.other-files-section .cert-card.file-card') !== null, 'the choice is remembered');
  await p.locator('.other-files-section .shared-tile', { hasText: 'Training' }).click(); await p.waitForTimeout(500);
  ok(/Cards/.test(await p.textContent('.other-files-section .view-btn.on')) && (await p.$('.other-files-section .cert-edit')) !== null, 'Training starts as cards with its details');
  await p.click('.other-files-section .view-btn:has-text("List")'); await p.waitForTimeout(400);
  ok(await p.$('.other-files-section .shared-table') !== null, 'Training can be a list too');

  // 7. Timeline: Group by Suspect.
  await p.evaluate(async (id) => {
    const ev = (n, date, title, suspect, extra = {}) => ({ id: `t${n}`, date, time: '', kind: 'event', title, note: '', suspect, color: '', done: false, ...extra });
    await Vault.saveTimeline(id, { events: [
      ev(1, '2026-09-01', 'Buy 1', 'Rick Poe', { kind: 'buy', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }),
      ev(2, '2026-09-08', 'Surveillance at Example Park', 'John Doe'),
      ev(3, '2026-09-15', 'Buy 2', 'Rick Poe', { kind: 'buy', drug: 'Cocaine', qty: '7', unit: 'g', paid: '400' }),
      ev(4, '2026-09-20', 'Grand jury', ''),
    ] });
  }, ids.c);
  await p.evaluate(() => localStorage.removeItem('cv-tl-group'));
  await p.evaluate((i) => { location.hash = `#/case/${i}/timeline`; }, ids.c); await p.waitForSelector('.tl-item');
  ok(!(await p.$('.tl-group-head')), 'not grouped to begin with');
  await p.click('.tl-group-btn'); await p.waitForTimeout(400);
  const heads = await p.$$eval('.tl-group-head', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  ok(heads.join(' | ') === 'John Doe 1 event | Rick Poe 2 events | No Suspect 1 event', `grouped by suspect: ${heads.join(' | ')}`);
  const order = await p.$$eval('.timeline > li', (x) => x.map((e) => (e.classList.contains('tl-group-head') ? `#${e.querySelector('strong').textContent}` : e.classList.contains('tl-item') ? e.querySelector('strong').textContent : '')).filter(Boolean));
  ok(order.join(',') === '#John Doe,Surveillance at Example Park,#Rick Poe,Buy 1,Buy 2,#No Suspect,Grand jury', `each suspect's events under them: ${order.join(',')}`);
  await p.locator('.timeline').screenshot({ path: `${SP}/grouped.png` });
  ok(await p.evaluate(() => localStorage.getItem('cv-tl-group')) === 'suspect', 'remembered on this PC');
  // The PDFs: grouped, and a plain one with the Suspect column.
  const pdfs = await p.evaluate(async (id) => {
    const tl = await Vault.getTimeline(id);
    const rows = CVOperation.mergeEvents([{ caseId: id, number: 'EX-100', events: tl.events }]);
    const s = (d) => [...CVTimelinePdf.build({ title: 'Timeline', number: 'EX-100', rows, ...d })].map((c) => String.fromCharCode(c)).join('');
    return { grouped: s({ group: true }), plain: s({}) };
  }, ids.c);
  ok(/John Doe/.test(pdfs.grouped) && /2 events/.test(pdfs.grouped) && /No Suspect/.test(pdfs.grouped), 'the PDF groups the events too');
  ok(/\(Suspect\)/.test(pdfs.plain) && !/Suspect: /.test(pdfs.plain), 'the plain PDF has a Suspect column');

  // 8. The vault mark on PDFs without a letterhead; the letterhead when there is one.
  ok(/\(CaseVault\) Tj/.test(pdfs.plain), 'no letterhead: the CaseVault mark is in the header');
  const withLh = await p.evaluate(async (id) => {
    const tl = await Vault.getTimeline(id);
    const rows = CVOperation.mergeEvents([{ caseId: id, number: 'EX-100', events: tl.events }]);
    return [...CVTimelinePdf.build({ title: 'Timeline', number: 'EX-100', rows }, { letterhead: { header: 'Example City Police Department' } })].map((c) => String.fromCharCode(c)).join('');
  }, ids.c);
  ok(/Example City Police Department/.test(withLh) && !/\(CaseVault\) Tj/.test(withLh), 'with a letterhead: the letterhead, no mark');
  // A look at each PDF's header without a letterhead.
  const shots = { timeline: pdfs.plain };
  shots.year = await p.evaluate(async () => { await CVKit.loadScripts(['js/year-summary.js']); return [...CVYearSummary.build(CVYearSummary.compute('2026', [], new Map()), {})].map((c) => String.fromCharCode(c)).join(''); });
  shots.training = await p.evaluate(async () => [...CVTraining.build(await Vault.trainingRows(), {})].map((c) => String.fromCharCode(c)).join(''));
  shots.arrest = await p.evaluate(() => [...CVArrestPdf.build({ arrestees: [{ firstName: 'John', lastName: 'Doe' }] }, { caseNumber: 'EX-100' })].map((c) => String.fromCharCode(c)).join(''));
  shots.report = await p.evaluate(() => [...CVReportPdf.build(CVReportFields.normalize ? CVReportFields.normalize({}) : {}, {})].map((c) => String.fromCharCode(c)).join(''));
  for (const [name, s] of Object.entries(shots)) {
    ok(/\(CaseVault\) Tj/.test(s), `${name}: the vault mark without a letterhead`);
    await p.evaluate((str) => {
      const bytes = Uint8Array.from(str, (c) => c.charCodeAt(0));
      const d = document.createElement('div'); d.id = 'pdfshot'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
      d.append(CVPdfViewer.create(bytes, { h: window.CaseVaultUI.h, icon: CVIcons.icon, title: 'x', fileName: 'x.pdf' }));
      document.body.append(d);
    }, s);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${SP}/pdf-${name}.png`, clip: { x: 0, y: 0, width: 1366, height: 420 } });
    await p.evaluate(() => document.getElementById('pdfshot').remove());
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
