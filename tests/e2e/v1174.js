// v1.174: New Case searches the known suspects of the open cases (Name, DOB, Gender, IR) and makes
// the one picked the new case's suspect; a closed case's suspects are not suggested; the case list
// on the left shows no hover boxes. All data is made up (Doe / Roe / Poe).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1174';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1400, 950);
  await p.evaluate(async () => {
    const a = await Vault.createCase({ number: 'EX-801', subject: 'Rick Poe' });
    const ca = await Vault.getCase(a.id);
    ca.suspects = [{ name: 'Rick Poe', dob: '1990-01-02', residence: '100 Example Street, Example City', role: 'Primary', info: { gender: 'Male', irNumber: '1234567', moniker: 'Ricky' } }];
    await Vault.saveCase(ca);
    const z = await Vault.createCase({ number: 'EX-802', subject: 'Jane Roe' });
    const cz = await Vault.getCase(z.id);
    cz.suspects = [{ name: 'Jane Roe', dob: '1985-05-05', role: 'Primary', info: { gender: 'Female' } }];
    cz.status = 'Closed';
    await Vault.saveCase(cz);
  });
  const closedOk = await p.evaluate(() => Vault.data.cases.find((x) => x.number === 'EX-802').status);
  console.log('EX-802 status', closedOk);

  // 1. New Case: typing finds the known suspect with DOB, gender and IR; a closed case's isn't found.
  await p.keyboard.press('Escape');
  await p.evaluate(() => { location.hash = '#/'; });
  await p.waitForTimeout(500);
  await p.keyboard.press('n');
  await p.waitForSelector('#dialog[open] .new-case-form');
  await p.fill('#dialog[open] input[name=subject]', 'roe');
  await p.waitForTimeout(800);
  ok(await p.locator('#dialog[open] .known-pick button.known-row').count() === 0, 'a closed case\'s suspect is not suggested');
  await p.fill('#dialog[open] input[name=subject]', 'poe');
  await p.waitForSelector('#dialog[open] .known-pick button.known-row', { timeout: 10000 });
  const row = await p.textContent('#dialog[open] .known-pick button.known-row');
  ok(/Rick Poe/.test(row) && /1990|01\/02/.test(row) && /Male/.test(row) && /1234567/.test(row), `the row shows Name, DOB, Gender and IR: ${row}`);
  await p.locator('#dialog[open] .known-pick').screenshot({ path: `${SP}/known.png` }).catch(() => {});
  await p.click('#dialog[open] .known-pick button.known-row');
  ok(await p.inputValue('#dialog[open] input[name=subject]') === 'Rick Poe' && /becomes this case's suspect/.test(await p.textContent('#dialog[open] .known-picked')), 'picking fills the Subject Name');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/new-case.png` }).catch(() => {});
  await p.fill('#dialog[open] input[name=number]', 'EX-803');
  await p.click('#dialog[open] button[type=submit]');
  await p.waitForFunction(() => /\/details$/.test(location.hash), null, { timeout: 15000 });
  const sx = await p.evaluate(async () => { const e = Vault.data.cases.find((x) => x.number === 'EX-803'); const c = await Vault.getCase(e.id); return c.suspects; });
  ok(sx.length === 1 && sx[0].name === 'Rick Poe' && sx[0].dob === '1990-01-02' && sx[0].info.irNumber === '1234567' && sx[0].role === 'Primary', `the new case has the suspect with their details: ${JSON.stringify(sx)}`);

  // 2. The Suspects name box's suggestions leave out the closed case's suspect.
  await p.waitForTimeout(1500);
  const opts = await p.evaluate(() => [...document.querySelectorAll('#suspect-known option')].map((o) => `${o.value} | ${o.label}`));
  ok(!opts.some((o) => /Jane Roe/.test(o)), `no closed case's suspect in the suggestions: ${JSON.stringify(opts)}`);

  // 3. The case list on the left: no hover box on the fold arrows or the folders.
  for (const sel of ['#sidebar-body .op-chev:visible', '#sidebar-body li a:visible']) {
    const el = p.locator(sel).first();
    if (await el.count()) { await el.hover(); await p.waitForTimeout(700); }
  }
  ok(await p.evaluate(() => { const t = document.querySelector('.cv-tip'); return !t || t.hidden; }), 'no hover box in the case list');
  ok(await p.locator('#sidebar-body .op-chev[title], #sidebar-body .op-chev[data-tip]').count() === 0, 'the fold arrows have no "Fold or unfold" box');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
