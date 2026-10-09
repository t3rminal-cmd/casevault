// v1.106: Recently Deleted, Add Follow-up, Search Inside Cases, Restore Cases from a Backup, and
// the design polish. All data is made up (Doe/Roe/Poe, Example City).
const fs = require('fs');
const os = require('os');
const path = require('path');
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1106';

(async () => {
  const { b, p, errs, ids } = await boot();
  const shot = (name, loc) => (loc ? p.locator(loc).first().screenshot({ path: `${SP}/${name}.png` }) : p.screenshot({ path: `${SP}/${name}.png` })).catch(() => {});
  await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  // (8, 9) banner chips: equal widths; (14) sidebar status edge.
  const widths = await p.$$eval('.hero-counts .hero-count', (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  ok(widths.length >= 4 && Math.max(...widths) - Math.min(...widths) <= 2, `banner chips the same width: ${widths}`);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.case-item.st-open')).borderLeftWidth) === '3px', 'sidebar case shows its status colour on the left edge');
  await shot('home');

  // (5) Add Follow-up -> a deadline on the Timeline.
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c); await p.waitForTimeout(1200);
  await p.click('.case-actions button:has-text("Add Follow-up")'); await p.waitForSelector('#dialog[open] .follow-form');
  await p.selectOption('#dialog[open] select', 'Lab results'); await p.fill('#dialog[open] input[type=text]', 'Item 1');
  await shot('followup', '#dialog[open]');
  await p.click('#dialog[open] button:has-text("Add to Timeline")'); await p.waitForTimeout(1200);
  const tl = await p.evaluate(async (i) => (await Vault.getTimeline(i)).events.map((e) => [e.kind, e.title]), ids.c);
  ok(tl.some(([k, t]) => k === 'deadline' && t === 'Follow up: Lab results — Item 1'), 'Add Follow-up puts a deadline on the Timeline');

  // (6) Search Inside Cases finds words in the notes and the timeline.
  await p.evaluate(async (i) => { await Vault.saveNotes(i, 'Met the informant near the grey sedan on Example Street.'); }, ids.c);
  await p.click('#btn-side-search'); await p.fill('#case-search', 'grey sedan');
  ok(await p.isVisible('#btn-deep-search'), 'the Search Inside Cases button shows while typing');
  await p.press('#case-search', 'Enter'); await p.waitForSelector('#dialog[open] .deep-case', { timeout: 15000 });
  const found = await p.$$eval('#dialog[open] .deep-case', (els) => els.map((e) => e.textContent));
  ok(found.length === 1 && /EX-100/.test(found[0]) && /Field Notes/.test(found[0]) && /grey sedan/.test(found[0]), 'finds the case by its notes, with a snippet');
  await shot('search', '#dialog[open]');
  await p.click('#dialog[open] .deep-case a'); await p.waitForTimeout(900);
  ok(await p.evaluate((i) => location.hash === `#/case/${encodeURIComponent(i)}/notes`, ids.c), 'a result opens the right tab');
  await p.fill('#case-search', ''); await p.press('#case-search', 'Escape');

  // (4) Delete -> Recently Deleted -> Restore.
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c2); await p.waitForTimeout(1200);
  await p.click('.case-actions button:has-text("Delete case")'); await p.waitForSelector('#dialog[open] .delete-form');
  ok(/Recently Deleted/.test(await p.textContent('#dialog[open] .delete-form')), 'the delete dialog says where the case goes');
  await p.fill('#dialog[open] .delete-form input', 'EX-200'); await p.click('#dialog[open] .delete-form button[type=submit]');
  await p.waitForSelector('#dialog[open] .doom-form'); await p.click('#dialog[open] .doom-form button[type=submit]'); await p.waitForTimeout(1500);
  ok(!(await p.evaluate((i) => Vault.data.cases.some((x) => x.id === i), ids.c2)), 'deleted from the case list');
  await p.click('.hc-backup'); await p.waitForSelector('[data-section="deleted"] .bin-row');
  ok(/EX-200/.test(await p.textContent('[data-section="deleted"]')), 'listed in Vault → Recently Deleted');
  await shot('bin', '[data-section="deleted"]');
  await p.click('[data-section="deleted"] .bin-row button:has-text("Restore")'); await p.waitForTimeout(1500);
  ok(await p.evaluate((i) => Vault.data.cases.some((x) => x.id === i), ids.c2), 'Restore brings it back');
  await p.evaluate(() => document.querySelector('#dialog').close());

  // (7) Restore Cases from a Backup: a made-up backup folder with one case.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-backup-'));
  const bk = path.join(dir, 'CaseVault-Backup-2026-10-01-090000');
  const caseDir = path.join(bk, 'cases', '2026-EX-900');
  fs.mkdirSync(path.join(caseDir, 'files', 'Other Exhibits'), { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(bk, 'vault.json'), '{}');
  fs.writeFileSync(path.join(caseDir, 'case.json'), JSON.stringify({ id: '2026-EX-900', number: 'EX-900', subject: 'Mary Poe', title: 'Mary Poe', status: 'Open', operationId: '', operation: null, dates: { opened: '2026-09-01', updated: now }, activity: [] }));
  fs.writeFileSync(path.join(caseDir, 'notes.md'), 'Restored notes from Example City.');
  fs.writeFileSync(path.join(caseDir, 'files', 'Other Exhibits', 'receipt.txt'), 'synthetic');
  await p.click('.hc-backup'); await p.waitForSelector('.backup-restore button');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.backup-restore button')]);
  await chooser.setFiles(bk); await p.waitForSelector('#dialog[open] .restore-form', { timeout: 15000 });
  ok(/EX-900/.test(await p.textContent('#dialog[open] .restore-form')) && /Mary Poe/.test(await p.textContent('#dialog[open] .restore-form')), 'the backup\'s cases are listed');
  await shot('restore', '#dialog[open]');
  await p.click('#dialog[open] .restore-form button[type=submit]'); await p.waitForTimeout(2500);
  const back = await p.evaluate(async () => { const e = Vault.data.cases.find((x) => x.number === 'EX-900'); return e && { notes: await Vault.getNotes(e.id), files: (await Vault.listFiles(e.id)).map((f) => f.name) }; });
  ok(back && back.notes === 'Restored notes from Example City.' && back.files.some((f) => /receipt\.txt$/.test(f)), 'the case comes back with its notes and files');

  // (11) headings in capitals, (13) a visible focus outline.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(900);
  ok(await p.evaluate(() => [...document.querySelectorAll('.section-title')].every((e) => getComputedStyle(e).textTransform === 'uppercase')), 'every section heading in capitals');
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  ok(await p.evaluate(() => { const a = document.activeElement; return !!a && getComputedStyle(a).outlineStyle !== 'none'; }), 'the focused control has an outline');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
