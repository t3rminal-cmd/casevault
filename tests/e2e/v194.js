const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 1000);
  const open = () => p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelectorAll('[aria-expanded="false"]').forEach((x) => { if (x.closest('main')) x.click(); }); });
  // an older draft: offender boxes and the Officer's Report Vehicles list
  await p.evaluate(async (id) => { await Vault.writeCaseJSON(id, 'report-fields.json', { offendersList: [{ name: 'Rick Poe', vehicle: '2015 Honda Accord', vin: '1HGCR2F3XFA000000', plates: 'IL AB12345' }], vehicles: [{ year: '2018', make: 'Ford', model: 'F-150', plate: 'ZZ999', state: 'IN', disposition: 'Tow' }] }); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500); await open(); await p.waitForTimeout(600);
  ok(!(await p.$('.rf-list-vehicles')), 'no separate Vehicles list in the Officer\'s Report');
  ok(!(await p.$('input[aria-label="Offender 1 Vehicle"], input[aria-label="Offender 1 VIN"], input[aria-label="Offender 1 Plates"]')), 'no old Vehicle / VIN / Plates boxes');
  ok(await p.locator('.rf-veh-card').count() === 2, `both vehicles on the offender (${await p.locator('.rf-veh-card').count()})`);
  ok(await p.inputValue('input[aria-label="Offender 1 vehicle 1 Plate State"]') === 'IL' && await p.inputValue('input[aria-label="Offender 1 vehicle 1 License Plate"]') === 'AB12345', 'plate split into state and number');
  ok(await p.isChecked('input[aria-label="Offender 1 vehicle 2 Towed"]'), 'Tow ticked for the Ford');
  // click boxes: one at a time
  await p.check('input[aria-label="Offender 1 vehicle 1 Impounded"]'); await p.waitForTimeout(300);
  await p.check('input[aria-label="Offender 1 vehicle 1 Towed"]'); await p.waitForTimeout(300);
  ok(!(await p.isChecked('input[aria-label="Offender 1 vehicle 1 Impounded"]')) && await p.isChecked('input[aria-label="Offender 1 vehicle 1 Towed"]'), 'ticking Tow unticks Impound');
  await p.check('input[aria-label="Offender 1 vehicle 1 DNA"]'); await p.waitForTimeout(300);
  // add a vehicle and type in it
  await p.click('.rf-veh-add'); await p.waitForTimeout(300);
  await p.fill('input[aria-label="Offender 1 vehicle 3 Make"]', 'Nissan'); await p.fill('input[aria-label="Offender 1 vehicle 3 VIN"]', 'jn1az4eh0fm000000');
  await p.waitForTimeout(1200);
  const v = await p.evaluate(async (id) => { await window.CaseVaultUI.Save.flushAll(); await new Promise((r) => setTimeout(r, 300)); return (await Vault.readCaseJSON(id, 'report-fields.json')).offendersList[0].vehicles; }, ids.c);
  ok(v.length === 3 && v[0].disposition === 'DNA' && v[2].make === 'Nissan' && v[2].vin === 'JN1AZ4EH0FM000000', `saved: ${JSON.stringify(v.map((x) => [x.make, x.disposition, x.vin]))}`);
  ok(await p.evaluate(() => !document.querySelector('label label')), 'no tick box inside another label');
  await p.locator('.rf-vehicles').screenshot({ path: process.env.SP + '/v194/cards.png' });
  // remove one; No Vehicle hides them
  await p.click('.rf-veh-card:nth-child(3) .danger-icon'); await p.waitForTimeout(400);
  ok(await p.locator('.rf-veh-card').count() === 2, 'Remove takes a vehicle away');
  await p.check('input[aria-label="Offender 1 no vehicle"]'); await p.waitForTimeout(500);
  ok(!(await p.$('.rf-vehicles')), 'No Vehicle hides Offender Vehicle(s)');
  console.log('errors', errs); await b.close(); })();
