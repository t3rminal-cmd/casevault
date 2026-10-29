// v1.175: the location code typed in full still offers its match; the Officer's Report lines keep
// the cursor; the case list is never narrower than its buttons; Suspect Search and the suspect
// profile (arrests, police interactions, kinds of arrest) without scroll bars; the Rolodex fills in
// a case's prosecutor. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1175';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1440, 950);
  const id = await p.evaluate(async () => {
    const a = await Vault.createCase({ number: 'EX-701', subject: 'Rick Poe' });
    const ca = await Vault.getCase(a.id);
    ca.suspects = [{ name: 'Rick Poe', dob: '1990-01-02', role: 'Primary', info: { gender: 'Male', irNumber: '1234567' } }];
    await Vault.saveCase(ca);
    await Vault.writeCaseJSON(a.id, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'Rick', lastName: 'Poe', dob: '1990-01-02', sex: 'Male', bookingNumber: '99887766', date: '2026-04-01', time: '21:40', location: '100 Example Street, Example City',
      charges: [{ statute: '720 ILCS 570/401(c)(2)', description: 'Manufacture/delivery of cocaine' }, { statute: '720 ILCS 5/24-1.6', description: 'Aggravated unlawful use of a weapon' }], narcotics: [] }] });
    const tl = await Vault.getTimeline(a.id);
    tl.events = [{ id: 'b1', kind: 'buy', date: '2026-03-04', title: 'Buy 1', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }];
    await Vault.saveTimeline(a.id, tl);
    const z = await Vault.createCase({ number: 'EX-702', subject: 'Rick Poe' });
    await Vault.writeCaseJSON(z.id, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'Rick', lastName: 'Poe', date: '2025-06-10', charges: [{ statute: '720 ILCS 5/12-3', description: 'Battery' }] }] });
    const cz = await Vault.getCase(z.id); cz.status = 'Closed'; await Vault.saveCase(cz);
    await Vault.updateSettings({ rolodex: [{ id: 'r1', kind: 'ASA', name: 'Ann Roe', agency: 'Example County State\'s Attorney', email: 'ann.roe@example.com', phone: '555-0100' }] });
    return a.id;
  });

  // 1. The case list: never narrower than its buttons; the padlock stays on their line.
  const grip = await p.locator('.sidebar-resizer').boundingBox();
  await p.mouse.move(grip.x + 2, grip.y + 200); await p.mouse.down(); await p.mouse.move(60, grip.y + 200, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(300);
  const side = await p.evaluate(() => { const kids = [...document.querySelector('.sidebar-head').children].filter((k) => k.offsetParent); return new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))).size; });
  ok(side === 1, 'the case list\'s buttons and padlock stay on one line at its narrowest');
  await p.evaluate(() => document.querySelector('.sidebar-resizer').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));

  // 2. Draft tab: Location Code 259 typed in full still shows its match; the Operation line keeps the cursor.
  await p.evaluate((i) => { localStorage.removeItem('casevault-folded-sections'); location.hash = `#/case/${CVRoute.enc(i)}/draft`; }, id);
  await p.waitForSelector('.rf-section', { timeout: 20000 });
  await p.evaluate(() => document.querySelectorAll('.rf-section.rf-folded .rf-fold').forEach((x) => x.click()));
  await p.waitForTimeout(400);
  const loc = p.locator('.field', { hasText: 'Location Code' }).locator('input').first();
  if (await loc.count()) {
    await loc.scrollIntoViewIfNeeded(); await loc.click(); await loc.fill('');
    await p.keyboard.type('259');
    await p.waitForTimeout(300);
    const opts = await p.evaluate(() => [...document.querySelectorAll('.combo-list:not([hidden]) .combo-opt')].map((x) => x.textContent));
    ok(opts.length === 1 && /259 Vehicle Non-Commercial/.test(opts[0]), `259 offers its match: ${JSON.stringify(opts)}`);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    ok(await p.evaluate(() => [...document.querySelectorAll('.field')].some((f) => /Type of Location/.test(f.textContent) && f.querySelector('input') && /Vehicle Non-Commercial/.test(f.querySelector('input').value))), 'Enter picks it and fills in Type of Location');
  } else ok(false, 'Location Code box not found');
  const row = p.locator('.rf-line', { hasText: 'Operation / Mission' });
  const inp = row.locator('input:not([type=checkbox])');
  await inp.scrollIntoViewIfNeeded();
  await inp.click({ position: { x: 12, y: 10 } });
  await p.keyboard.type('OP-77');
  ok(await inp.inputValue() === 'OP-77' && await row.locator('input[type=checkbox]').isChecked(), 'clicking the Operation / Mission Number line types in it (the Include box stays ticked)');
  await row.locator('.rf-lab, span').first().click();
  ok(await p.evaluate(() => document.activeElement && document.activeElement.type === 'text'), 'clicking the line\'s name puts the cursor in its box');

  // 3. The Rolodex fills in the prosecutor on the Details tab.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, id);
  const pro = p.locator('input[aria-label="Prosecutor name"]');
  await pro.waitFor({ state: 'attached', timeout: 20000 });
  await p.evaluate(() => { const sec = document.querySelector('input[aria-label="Prosecutor name"]').closest('section'); if (sec.cvUnfold) sec.cvUnfold(); });
  await pro.scrollIntoViewIfNeeded();
  await pro.click(); await p.keyboard.type('ann');
  await p.waitForSelector('.combo-list:not([hidden]) .combo-opt', { timeout: 5000 });
  await p.click('.combo-list:not([hidden]) .combo-opt');
  await p.waitForTimeout(500);
  const pc = await p.evaluate(() => ({ e: document.querySelector('input[aria-label="Prosecutor email"]').value, ph: document.querySelector('input[aria-label="Prosecutor phone"]').value }));
  ok(pc.e === 'ann.roe@example.com' && pc.ph === '555-0100', `picking from the Rolodex fills the email and phone: ${JSON.stringify(pc)}`);
  await p.locator('section.contacts:has(#contacts-title)').screenshot({ path: `${SP}/contacts.png` }).catch(() => {});
  await p.evaluate(() => { CVRolodex.open(CaseVaultUI); });
  await p.waitForSelector('#dialog[open] .rolodex-form .rolo-card');
  await p.click('#dialog[open] button:has-text("Add Contact")');
  await p.keyboard.type('Det. John Doe');
  await p.waitForTimeout(400);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/rolodex.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => (Vault.data.settings.rolodex || []).map((x) => x.name).join(',')) === 'Ann Roe,Det. John Doe', 'the Rolodex keeps a new card on the SSD');

  // 4. Suspect Search and the profile, with nothing to scroll.
  await p.evaluate(() => { CVPersonView.search(CaseVaultUI); });
  await p.waitForSelector('#dialog[open] .suspect-search .ss-row', { timeout: 20000 });
  await p.fill('#dialog[open] .suspect-search input[type=search]', 'poe 1990');
  await p.waitForTimeout(300);
  const ss = await p.textContent('#dialog[open] .ss-table tbody');
  ok(/Rick Poe/.test(ss) && /1234567/.test(ss) && /EX-701/.test(ss) && /EX-702/.test(ss), `Suspect Search finds him on both cases (one closed): ${ss.replace(/\s+/g, ' ').slice(0, 140)}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/search.png` }).catch(() => {});
  await p.click('#dialog[open] .ss-row');
  await p.waitForSelector('#dialog[open] .person-view .pv-arrests', { timeout: 20000 });
  const pv = await p.evaluate(() => {
    const d = document.querySelector('#dialog[open]');
    const over = [...d.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).length;
    return { badges: [...d.querySelectorAll('.pv-head .kind-badge')].map((x) => x.textContent), arrests: d.querySelectorAll('.pv-arrests tbody tr').length, life: [...d.querySelectorAll('.person-event-list li')].map((x) => x.textContent.slice(0, 40)), hScroll: over, vScroll: d.scrollHeight > d.clientHeight + 1, facts: d.querySelector('.pv-facts').textContent };
  });
  ok(pv.badges.join(',') === 'Narcotics,Battery,Firearms', `the kinds of arrest as icons: ${pv.badges}`);
  ok(pv.arrests === 2 && pv.life.length === 3, `two arrest reports and three police interactions: ${JSON.stringify(pv.life)}`);
  ok(/IR1234567/.test(pv.facts.replace(/\s/g, '')) && /CB99887766/.test(pv.facts.replace(/\s/g, '')), `what is known of him: ${pv.facts}`);
  ok(!pv.hScroll && !pv.vScroll, `no scroll bars (sideways ${pv.hScroll}, down ${pv.vScroll})`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/profile.png` }).catch(() => {});
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
