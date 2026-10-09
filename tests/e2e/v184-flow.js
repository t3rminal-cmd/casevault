const boot = require('./boot');
const ok = (cond, msg) => console.log(cond ? 'PASS' : 'FAIL', msg);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  // Hero chips
  const chips = await p.$$eval('.hero-count', (els) => els.map((e) => [e.className, e.textContent.trim(), getComputedStyle(e).backgroundColor, getComputedStyle(e).borderLeftWidth]));
  console.log(chips);
  // v1.99: the backup reminder joined the row, right after Overdue.
  ok(chips.length === 5 && chips[3][1].includes('Overdue') && /hc-backup/.test(chips[4][0]) && !chips.some((x) => /Pending/.test(x[1])), 'four count chips incl Overdue (no Pending, v1.105), then the backup reminder');
  await p.click('.hero-count.hc-open'); await p.waitForTimeout(500);
  ok(location => true, '');
  console.log('hash', await p.evaluate(() => location.hash), 'show', await p.$eval('.general-tools select', (s) => s.value), 'rows', await p.$$eval('.general-table tbody tr', (r) => r.map((x) => x.textContent.slice(0, 30))));
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(500);
  await p.click('.hero-count.hc-archived'); await p.waitForTimeout(400);
  console.log('archived rows', await p.$$eval('.general-table tbody tr', (r) => r.length));

  // Status dropdown
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForTimeout(800);
  console.log('status options', await p.$$eval('.details-row-title select option', (o) => o.map((x) => x.textContent + (x.disabled ? '(d)' : ''))), await p.textContent('.status-hint'));

  // Close by arrest without arrest report
  await p.click('button:has-text("Close Case")'); await p.waitForSelector('.close-form');
  await p.check('.close-form input[value="arrest"]');
  await p.fill('.close-form input[aria-label="Closed by"]', 'Det. Example');
  ok(await p.$eval('.close-form button[type=submit]', (x) => x.disabled), 'arrest without report: Close disabled');
  console.log('note:', await p.textContent('.close-form .arrest-required'));
  await p.screenshot({ path: process.env.SP + '/v184/close-arrest.png' });
  await p.click('.close-form .arrest-required button'); await p.waitForTimeout(800);
  console.log('hash after Open Arrest', await p.evaluate(() => location.hash));
  // Fill the arrest report
  await p.evaluate(async (id) => {
    const a = CVClosing.emptyArrest(); a.arrestees[0].firstName = 'John'; a.arrestees[0].lastName = 'Doe'; a.arrestees[0].charges[0].statute = '720 ILCS 570/402'; a.arrestees[0].charges[0].description = 'Possession';
    await Vault.writeCaseJSON(id, 'arrest.json', a);
  }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForTimeout(800);
  await p.click('button:has-text("Close Case")'); await p.waitForSelector('.close-form');
  await p.check('.close-form input[value="arrest"]');
  await p.fill('.close-form input[aria-label="Closed by"]', 'Det. Example');
  ok(!(await p.$eval('.close-form button[type=submit]', (x) => x.disabled)), 'arrest with report: Close enabled');
  await p.click('.close-form button[type=submit]'); await p.waitForTimeout(800);
  console.log('status', await p.evaluate((id) => Vault.data.cases.find((c) => c.id === id).status, ids.c), 'toast', await p.textContent('.toast.success'));
  await p.click('.toast-undo'); await p.waitForTimeout(800);
  ok(await p.evaluate((id) => Vault.data.cases.find((c) => c.id === id).status, ids.c) === 'Open', 'Undo puts the case back to Open');

  // Mission: close last case → prompt
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c2); await p.waitForTimeout(800);
  await p.click('.case-actions button:has-text("Close Case"), button.action-btn:has-text("Close Case")'); await p.waitForSelector('.close-form');
  await p.check('.close-form input[value="unfounded"]');
  await p.fill('.close-form input[aria-label="Closed by"]', 'Det. Example');
  await p.click('.close-form button[type=submit]');
  await p.waitForSelector('dialog h2:has-text("Close the Mission too?")', { timeout: 4000 });
  await p.screenshot({ path: process.env.SP + '/v184/mission-close.png' });
  await p.click('dialog button:has-text("Close Mission")'); await p.waitForTimeout(700);
  ok(await p.evaluate((id) => Vault.getOperation(id).status, ids.op) === 'Closed', 'Mission closed with its last case');
  await p.click('button:has-text("Reopen case")'); await p.waitForTimeout(300);
  await p.click('dialog button:has-text("Reopen case")');
  await p.waitForSelector('dialog h2:has-text("Reopen the Mission?")', { timeout: 4000 });
  await p.click('dialog button:has-text("Reopen Mission")'); await p.waitForTimeout(700);
  ok(await p.evaluate((id) => Vault.getOperation(id).status, ids.op) === 'Open', 'Mission reopened with the case');

  // Mission with two cases: close one → no prompt; greyed in folder; CLOSED FILES under Mission name
  const c4 = await p.evaluate(async (op) => { const c = await Vault.createCase({ number: 'EX-400', subject: 'Sam Poe' }); await Vault.assignCase(c.id, op); return c.id; }, ids.op);
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c2); await p.waitForTimeout(900);
  await p.click('button.action-btn:has-text("Close Case")'); await p.waitForSelector('.close-form');
  await p.check('.close-form input[value="unfounded"]');
  await p.fill('.close-form input[aria-label="Closed by"]', 'Det. Example');
  await p.click('.close-form button[type=submit]'); await p.waitForTimeout(900);
  ok(!(await p.$('dialog[open] h2:has-text("Close the Mission too?")')), 'no Mission prompt while a case is open');
  console.log('mission folder items', await p.$$eval('.mission-children .case-item', (e) => e.map((x) => x.className.replace('case-item', '').trim() + ':' + x.querySelector('.case-item-title').textContent)));
  console.log('closed files', await p.$$eval('#closed-list .op-head', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim())));
  await p.evaluate(() => { document.getElementById('closed-cases').open = true; });
  await p.screenshot({ path: process.env.SP + '/v184/sidebar.png' });

  // Archive needs a reason
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, c4); await p.waitForTimeout(800);
  await p.click('button.action-btn:has-text("Archive Case")'); await p.waitForSelector('.arch-form');
  ok(await p.$eval('.arch-form button[type=submit]', (x) => x.disabled), 'archive: disabled without reason');
  await p.check('.arch-form input[value=""]');
  ok(await p.$eval('.arch-form button[type=submit]', (x) => x.disabled), 'archive Other: disabled without text');
  await p.fill('.arch-form textarea', 'Moved to another unit');
  await p.screenshot({ path: process.env.SP + '/v184/archive.png' });
  await p.click('.arch-form button[type=submit]'); await p.waitForTimeout(1500);
  console.log('banner', await p.textContent('.archived-banner').catch(() => 'none'));
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(700);
  await p.screenshot({ path: process.env.SP + '/v184/hero.png', clip: { x: 0, y: 0, width: 1366, height: 300 } });
  console.log('errors', errs); await b.close(); })();
