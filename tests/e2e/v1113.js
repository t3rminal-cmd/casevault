// v1.113: Arrest Details: Show All / Hide All, charges from the Draft, the arrestee picked from the
// suspects, "doesn't apply" boxes, the State of Illinois as victim. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1113';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => {
    const c = await Vault.getCase(id);
    c.suspects = [{ name: 'John Q Doe', dob: '1990-02-03', role: 'Primary', info: { gender: 'Male', race: 'White', height: '5\'10"', eyes: 'Brown' } }];
    c.arrest = true;
    await Vault.saveCase(c);
    await Vault.writeCaseJSON(id, 'report-fields.json', { charges: [{ statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance - Cocaine, less than 15 grams' }], offendersList: [{ name: 'DOE, John Q', address: '1 Example St, Example City', cbNumber: '12345' }] });
  }, ids.c);
  await p.evaluate((i) => { location.hash = `#/case/${i}/arrest`; }, ids.c); await p.waitForSelector('.arrest-toolbar');
  await p.waitForTimeout(800);
  const folded = () => p.$$eval('.arrest-section.foldable', (x) => [x.length, x.filter((e) => e.classList.contains('folded')).length]);
  await p.click('.arrest-toolbar button:has-text("Show All")'); await p.waitForTimeout(200);
  let f = await folded();
  ok(f[0] > 8 && f[1] === 0, `Show All opens every part (${f})`);
  await p.click('.arrest-toolbar button:has-text("Hide All")'); await p.waitForTimeout(200);
  f = await folded();
  ok(f[1] === f[0], `Hide All folds every part (${f})`);
  await p.click('.arrest-toolbar button:has-text("Show All")'); await p.waitForTimeout(200);
  // Charges from the Draft tab.
  const ch = await p.$$eval('.charges-table tbody tr', (rs) => rs.map((r) => [...r.querySelectorAll('input')].slice(0, 2).map((i) => i.value)));
  ok(ch.length === 1 && ch[0][0] === '720 ILCS 570/402(c)' && /Cocaine/.test(ch[0][1]), `charges filled in from the Draft: ${JSON.stringify(ch)}`);
  // Pick the arrestee.
  const opts = await p.$$eval('select.arrest-pick option', (x) => x.map((o) => o.textContent));
  ok(opts.length === 2 && /DOE, John Q \(Draft offender and Details suspect\)/.test(opts[1]), `the arrestee can be picked from the suspects: ${opts.join(' | ')}`);
  await p.selectOption('select.arrest-pick', '0'); await p.waitForTimeout(700);
  const val = (label) => p.evaluate((l) => { const f = [...document.querySelectorAll('.arrest-offender .field')].find((x) => x.querySelector('span') && x.querySelector('span').textContent.trim() === l); return f ? (f.querySelector('input, select, textarea') || {}).value : null; }, label);
  const got = [await val('Last name'), await val('First name'), await val('Middle name'), await val('Date of birth'), await val('Sex'), await val('Race / ethnicity'), await val('Eyes')];
  ok(got.join('|') === 'DOE|John|Q|February 03, 1990|Male|White|Brown', `picked: ${got.join(' | ')}`);
  await p.locator('.arrest-section').nth(1).screenshot({ path: `${SP}/offender.png` }).catch(() => {});
  // Doesn't-apply boxes.
  for (const label of ['No narcotics recovered', 'No warrant identified', 'No arrestee vehicle information']) await p.locator('label.arrest-none', { hasText: label }).locator('input').check();
  await p.waitForTimeout(300);
  ok(await p.$$eval('.arrest-none-body', (x) => x.every((e) => e.hidden)), 'ticking them hides those parts');
  // The State of Illinois as victim.
  await p.click('button:has-text("+ Add State of Illinois as Victim")'); await p.waitForTimeout(300);
  const vf = await p.$$eval('.arrest-item', (items) => { const it = items.find((x) => [...x.querySelectorAll('input')].some((i) => i.value === 'State of Illinois')); return it ? [...it.querySelectorAll('.field > span')].map((s) => s.textContent.trim()) : []; });
  ok(vf.join('|') === 'Role|Name|Officer name', `State of Illinois asks only for the officer: ${vf.join(', ')}`);
  await p.evaluate(() => { const it = [...document.querySelectorAll('.arrest-item')].find((x) => [...x.querySelectorAll('input')].some((i) => i.value === 'State of Illinois')); const f = [...it.querySelectorAll('.field')].find((x) => x.querySelector('span').textContent.trim() === 'Officer name'); const i = f.querySelector('input'); i.value = 'P.O. Example #1234'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.locator('.arrest-section', { hasText: 'Victim and Complainant' }).first().screenshot({ path: `${SP}/victim.png` }).catch(() => {});
  await p.click('.arrest-toolbar button:has-text("Save")'); await p.waitForTimeout(800);
  const saved = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'arrest.json')).arrestees[0], ids.c);
  ok(saved.noNarcotics && saved.noWarrant && saved.noVehicle && saved.lastName === 'DOE' && saved.nonOffenders[0].officer === 'P.O. Example #1234' && saved.charges.length === 1, 'all of it is saved');
  // The PDF.
  const pdf = await p.evaluate(async (a) => { const b = CVArrestPdf.build({ arrestees: [a] }, {}); return [...b].map((x) => String.fromCharCode(x)).join(''); }, saved);
  ok(['NO NARCOTICS RECOVERED', 'NO WARRANT IDENTIFIED', 'NO VEHICLE', 'STATE OF ILLINOIS', 'P.O. Example #1234'].every((w) => pdf.includes(w)), 'the PDF says so, with the officer');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
