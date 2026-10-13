// v1.114: Arrest charges: class and type filled with the charge, a Class list, victims from the
// reports with the arrestee's RD number; properties with inventory numbers. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1114';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => {
    const c = await Vault.getCase(id);
    c.arrest = true;
    await Vault.saveCase(c);
    await Vault.writeCaseJSON(id, 'report-fields.json', { rdNumber: c.number, charges: [{ statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance - Cocaine, less than 15 grams' }], victimsList: [{ name: 'Jane Roe' }] });
    // Two sent reports: one with the same RD number, one with another.
    for (const [slug, rd, victim] of [['report-a', c.number, 'Rick Poe'], ['report-b', 'EX-999', 'Mary Poe']]) {
      await Vault.saveDraft(id, slug, { title: slug, type: 'report', fromFields: true }, 'Example');
      await Vault.writeCaseJSON(id, `report-fields-${slug}.json`, { rdNumber: rd, victimsList: [{ name: victim }] });
    }
  }, ids.c);
  await p.evaluate((i) => { location.hash = `#/case/${i}/arrest`; }, ids.c); await p.waitForSelector('.arrest-toolbar');
  await p.waitForTimeout(800);
  await p.click('.arrest-toolbar button:has-text("Show All")'); await p.waitForTimeout(200);
  const row = (n) => p.$$eval('.charges-table tbody tr', (rs, k) => { const r = rs[k]; return r ? ['statute', 'description', 'degree', 'level', 'victim'].map((x) => r.querySelector(`.charge-${x} input, .charge-${x} select`).value) : null; }, n);
  let r = await row(0);
  ok(r && r[0] === '720 ILCS 570/402(c)' && r[2] === 'Class 4' && r[3] === 'Felony', `the Draft's charge comes with its class and type: ${JSON.stringify(r)}`);
  // Pick another charge by statute.
  await p.click('button:has-text("+ Add Charge")'); await p.waitForTimeout(300);
  const st = p.locator('.charges-table tbody tr').nth(1).locator('.charge-statute input');
  await st.fill('646/55(a)(2)(B)'); await p.waitForTimeout(300);
  await p.locator('.combo-list:not([hidden]) .combo-opt').first().click(); await p.waitForTimeout(400);
  r = await row(1);
  ok(r && r[0] === '720 ILCS 646/55(a)(2)(B)' && /Methamphetamine/.test(r[1]) && r[2] === 'Class 1' && r[3] === 'Felony', `picking a charge fills the class and type: ${JSON.stringify(r)}`);
  // The Class list; a misdemeanor class sets the Type.
  await p.locator('.charges-table tbody tr').nth(1).locator('.charge-degree .combo-toggle').click(); await p.waitForTimeout(200);
  const classes = await p.$$eval('.combo-list:not([hidden]) .combo-opt > span:first-child', (x) => x.map((e) => e.textContent));
  ok(['Class X', 'Class 1', 'Class 4', 'Class A'].every((k) => classes.includes(k)), `Class has a list: ${classes.join(', ')}`);
  await p.locator('.combo-list:not([hidden]) .combo-opt', { hasText: 'Class A' }).first().click(); await p.waitForTimeout(400);
  r = await row(1);
  ok(r[2] === 'Class A' && r[3] === 'Misdemeanor', `a Class A charge is a misdemeanor: ${JSON.stringify(r)}`);
  // Victims from the reports with the RD number.
  await p.locator('.charges-table tbody tr').nth(0).locator('.charge-victim .combo-toggle').click(); await p.waitForTimeout(200);
  const victims = await p.$$eval('.combo-list:not([hidden]) .combo-opt > span:first-child', (x) => x.map((e) => e.textContent));
  ok(victims.join('|') === 'Jane Roe|Rick Poe|State of Illinois', `victims from the reports with this RD number: ${victims.join(', ')}`);
  await p.locator('.combo-list:not([hidden]) .combo-opt', { hasText: 'Rick Poe' }).first().click(); await p.waitForTimeout(300);
  await p.locator('.charges-table').screenshot({ path: `${SP}/charges.png` }).catch(() => {});
  // Properties.
  const props = p.locator('.arrest-section', { hasText: 'Confiscated' }).first();
  const propSec = (await props.count()) ? props : p.locator('.arrest-section', { has: p.locator('button:has-text("+ Add Property")') }).first();
  await propSec.locator('button:has-text("+ Add Property")').click(); await p.waitForTimeout(200);
  await propSec.locator('button:has-text("+ Add Property")').click(); await p.waitForTimeout(200);
  const items = propSec.locator('.arrest-item');
  await items.nth(0).locator('input').nth(0).fill('7000001');
  await items.nth(0).locator('.combo-toggle').click(); await p.waitForTimeout(200);
  const kinds = await p.$$eval('.combo-list:not([hidden]) .combo-opt > span:first-child', (x) => x.map((e) => e.textContent));
  ok(kinds.join('|') === 'Prisoner Personal Property|Prisoner Jewelry|Prisoner Money|Prisoner Other', `property descriptions to pick: ${kinds.join(', ')}`);
  await p.locator('.combo-list:not([hidden]) .combo-opt', { hasText: 'Prisoner Money' }).first().click(); await p.waitForTimeout(200);
  await items.nth(1).locator('input').nth(0).fill('7000002');
  await items.nth(1).locator('input').nth(1).fill('Black cell phone, written in'); await p.waitForTimeout(200);
  await propSec.screenshot({ path: `${SP}/properties.png` }).catch(() => {});
  await p.click('.arrest-toolbar button:has-text("Save")'); await p.waitForTimeout(800);
  const saved = await p.evaluate(async (id) => (await window.CaseVaultUI.Save.flushAll(), await Vault.readCaseJSON(id, 'arrest.json')).arrestees[0], ids.c);
  ok(saved.charges.length === 2 && saved.charges[0].victim === 'Rick Poe' && saved.charges[1].degree === 'Class A'
    && JSON.stringify(saved.properties) === JSON.stringify([{ inventory: '7000001', description: 'Prisoner Money' }, { inventory: '7000002', description: 'Black cell phone, written in' }]), `saved: ${JSON.stringify(saved.properties)}`);
  const pdf = await p.evaluate(async (a) => { const b = CVArrestPdf.build({ arrestees: [a] }, {}); return [...b].map((x) => String.fromCharCode(x)).join(''); }, saved);
  ok(['7000001', 'Prisoner Money', 'Black cell phone', 'Class 4', 'Rick Poe'].every((w) => pdf.includes(w)) && !pdf.includes('NO PROPERTIES RECORDED'), 'the PDF lists the properties and the class');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
