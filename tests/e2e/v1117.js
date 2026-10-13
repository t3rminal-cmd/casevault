// v1.117: the Add Suspects popup in columns; timeline events coloured by suspect. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1117';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => {
    const c = await Vault.getCase(id);
    c.suspects = [{ name: 'Johnathan Q Doe', role: 'Primary', info: {} }, { name: 'Rick Poe', role: 'Secondary', info: {} }, { name: 'Jane Roe', role: 'Other', info: {} }];
    await Vault.saveCase(c);
    await Vault.writeCaseJSON(id, 'report-fields.json', { offendersList: [{ name: 'Rick Poe' }] });
  }, ids.c2);
  // 1. Add Suspects popup: the roles line up in their own column.
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, ids.c2); await p.waitForTimeout(1500);
  await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelectorAll('[aria-expanded="false"]').forEach((x) => { if (x.closest('main')) x.click(); }); });
  await p.waitForTimeout(400);
  await p.click('button:has-text("Add From Suspects")'); await p.waitForSelector('#dialog[open] .suspect-pick-list');
  const head = await p.$$eval('#dialog[open] .sp-head span', (x) => x.map((e) => e.textContent));
  const roles = await p.$$eval('#dialog[open] .rf-suspect-pick .sp-role', (x) => x.map((e) => [e.textContent, Math.round(e.getBoundingClientRect().left)]));
  const heads = await p.$eval('#dialog[open] .sp-head span:nth-child(3)', (e) => Math.round(e.getBoundingClientRect().left));
  ok(head.join('|') === '|Name|Role|In Report', `header row: ${head.join(' | ')}`);
  ok(roles.length === 3 && roles.every((r) => Math.abs(r[1] - roles[0][1]) <= 1 && Math.abs(r[1] - heads) <= 2) && roles.map((r) => r[0]).join() === 'Primary,Secondary,Other', `the roles line up under Role: ${JSON.stringify(roles)}`);
  ok(/Already in this report/.test(await p.textContent('#dialog[open] .rf-suspect-pick:has-text("Rick Poe") .sp-note')), 'the In Report column says so');
  await p.locator('#dialog[open] form').screenshot({ path: `${SP}/pick.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Cancel")'); await p.waitForTimeout(300);

  // 2. Timeline colours by suspect.
  await p.evaluate((i) => { location.hash = `#/case/${i}/timeline`; }, ids.c2); await p.waitForSelector('.timeline-form');
  const add = async (date, title, suspect, pick = true) => {
    await p.evaluate((d) => { const el = document.querySelector('.timeline-form .date-field'); el.value = d; el.dispatchEvent(new Event('input', { bubbles: true })); }, date);
    await p.fill('.timeline-form .tl-title-input', title);
    if (suspect) {
      await p.fill('.timeline-form input[aria-label="Suspect"]', suspect.slice(0, 4)); await p.waitForTimeout(150);
      if (pick) await p.locator('.combo-list:not([hidden]) .combo-opt', { hasText: suspect }).first().click();
      else await p.fill('.timeline-form input[aria-label="Suspect"]', suspect);
      await p.waitForTimeout(150);
    }
    const sw = await p.$eval('.timeline-form .tl-swatch.on', (e) => e.getAttribute('title'));
    await p.click('.timeline-form button[type=submit]'); await p.waitForTimeout(500);
    return sw;
  };
  const sw1 = await add('2026-09-01', 'Buy 1', 'Johnathan Q Doe');
  const sw2 = await add('2026-09-08', 'Buy 2', 'Rick Poe');
  const sw3 = await add('2026-09-15', 'Buy 3', 'Johnathan Q Doe');
  const sw4 = await add('2026-09-20', 'Surveillance', '');
  ok(sw1 === 'Blue' && sw2 === 'Red' && sw3 === 'Blue' && sw4 === 'No colour', `colours follow the suspect: ${[sw1, sw2, sw3, sw4].join(', ')}`);
  const items = await p.$$eval('.tl-item', (x) => x.map((e) => [e.querySelector('strong').textContent, e.style.getPropertyValue('--tl-color'), (e.querySelector('.tl-suspect') || {}).textContent || '']));
  ok(JSON.stringify(items) === JSON.stringify([['Buy 1', '#1f6fd1', 'Johnathan Q Doe'], ['Buy 2', '#d1453b', 'Rick Poe'], ['Buy 3', '#1f6fd1', 'Johnathan Q Doe'], ['Surveillance', '', '']]), `each event in its suspect's colour: ${JSON.stringify(items)}`);
  const legend = await p.$$eval('.tl-legend-chip', (x) => x.map((e) => e.textContent.trim()));
  ok(legend.length === 2 && /Johnathan Q Doe\s*2/.test(legend[0]) && /Rick Poe\s*1/.test(legend[1]), `a key of the suspects: ${legend.join(' | ')}`);
  await p.locator('.tl-legend').screenshot({ path: `${SP}/legend.png` }).catch(() => {});
  await p.locator('.timeline-form').screenshot({ path: `${SP}/form.png` }).catch(() => {});
  // Click a suspect: only their events.
  await p.click('.tl-legend-name:has-text("Rick Poe")'); await p.waitForTimeout(200);
  ok((await p.$$eval('.tl-item strong', (x) => x.map((e) => e.textContent))).join() === 'Buy 2', 'clicking a suspect shows only their events');
  await p.click('.tl-legend-all'); await p.waitForTimeout(200);
  ok((await p.$$eval('.tl-item', (x) => x.length)) === 4, 'Show All brings everyone back');
  // Change John's colour: all his events change, and it is saved.
  await p.click('.tl-legend-chip:has-text("Johnathan") .tl-legend-dot'); await p.waitForTimeout(150);
  await p.click('.tl-recolor .tl-swatch[title="Green"]'); await p.waitForTimeout(600);
  const saved = await p.evaluate(async (id) => (await window.CaseVaultUI.Save.flushAll(), (await Vault.getTimeline(id)).events.map((e) => [e.title, e.suspect || '', e.color || ''])), ids.c2);
  ok(JSON.stringify(saved) === JSON.stringify([['Buy 1', 'Johnathan Q Doe', '#2a9d6f'], ['Buy 2', 'Rick Poe', '#d1453b'], ['Buy 3', 'Johnathan Q Doe', '#2a9d6f'], ['Surveillance', '', '']]), `recoloured and saved: ${JSON.stringify(saved)}`);
  await p.screenshot({ path: `${SP}/timeline.png`, fullPage: false });
  // Edit keeps the suspect and colour.
  await p.click('.tl-item:has-text("Buy 2") button:has-text("Edit")'); await p.waitForTimeout(200);
  ok((await p.inputValue('.timeline-form input[aria-label="Suspect"]')) === 'Rick Poe' && (await p.$eval('.timeline-form .tl-swatch.on', (e) => e.title)) === 'Red', 'Edit brings back the suspect and colour');
  // The small timeline on the Details tab shows the colours too.
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c2); await p.waitForSelector('.mini-tl-dot'); await p.waitForTimeout(400);
  const dots = await p.$$eval('.mini-tl-dot.has-color', (x) => x.map((e) => e.style.getPropertyValue('--dot-color')));
  ok(dots.includes('#2a9d6f') && dots.includes('#d1453b'), `the Details timeline's circles in the suspects' colours: ${dots.join(', ')}`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
