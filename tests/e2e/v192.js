const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  const open = () => p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelectorAll('[aria-expanded="false"]').forEach((x) => { if (x.closest('main')) x.click(); }); });
  await p.evaluate(async (id) => { await Vault.writeCaseJSON(id, 'report-fields.json', { offendersList: [{ name: 'Rick Poe' }] }); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500); await open(); await p.waitForTimeout(600);
  // Court Date: Pending never touches the row's Include tick
  const st = () => p.evaluate(() => { const row = document.querySelector('.rf-pending').closest('.field'); return { tag: row.tagName, include: row.querySelector(':scope > input[type=checkbox]').checked, pending: row.querySelector('.rf-pending input').checked }; });
  const s0 = await st();
  ok(s0.tag === 'DIV', `Court Date row is no longer a label (${s0.tag})`);
  ok(await p.evaluate(() => !document.querySelector('label label')), 'no label inside a label anywhere on the Draft');
  await p.click('.rf-pending input'); await p.waitForTimeout(300);
  const s1 = await st();
  ok(s1.pending && s1.include, `Pending ticked, Court Date still included ${JSON.stringify(s1)}`);
  await p.click('.rf-pending span'); await p.waitForTimeout(300);
  const s2 = await st();
  ok(!s2.pending && s2.include, `Pending unticked by its word, Court Date still included ${JSON.stringify(s2)}`);
  await p.click('.rf-pending input'); await p.waitForTimeout(1200);
  const saved = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')), ids.c);
  ok(saved.courtDate === 'Pending' && !(saved.hidden || []).includes('courtDate'), 'saved: Court Date Pending and still on the report');
  // Offender CB Number: DNA
  const cb = p.locator('.rf-items input').filter({ has: p.locator('xpath=.') }).first();
  const cbInput = await p.evaluateHandle(() => [...document.querySelectorAll('.rf-items .field')].find((f) => /^CB/i.test(f.querySelector('span').textContent.trim())).querySelector('input'));
  await cbInput.asElement().evaluate((el) => el.closest('.combo').querySelector('.combo-toggle').click()); await p.waitForTimeout(300);
  const items = await cbInput.asElement().evaluate((el) => [...el.closest('.combo').querySelectorAll('.combo-list li')].map((x) => x.textContent.trim()));
  ok(items.some((t) => /^DNA/.test(t)), `CB Number offers DNA (${items.join(' | ')})`);
  await cbInput.asElement().evaluate((el) => el.closest('.combo').querySelector('.combo-list li').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); await p.waitForTimeout(200);
  await cbInput.asElement().evaluate((el) => { const li = el.closest('.combo').querySelector('.combo-list li'); if (li && !el.value) li.click(); }); await p.waitForTimeout(1200);
  const off = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'report-fields.json')).offendersList[0].cbNumber, ids.c);
  ok(off === 'DNA', `offender CB Number saved as DNA (${off})`);
  await p.screenshot({ path: process.env.SP + '/v192/draft.png' });
  // Arrest tab CB #
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(800);
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.arrest = true; await Vault.saveCase(c); }, ids.c);
  await p.evaluate((id) => { location.hash = `#/case/${id}/arrest`; }, ids.c); await p.waitForTimeout(1500); await open(); await p.waitForTimeout(600);
  console.log('hash', await p.evaluate(() => location.hash), (await p.evaluate(() => [...document.querySelectorAll('main .field > span')].map((s) => s.textContent).slice(0, 8))).join(','));
  const ab = await p.evaluateHandle(() => ([...document.querySelectorAll('main .field')].find((f) => /^CB/.test(f.querySelector('span').textContent.trim())) || { querySelector: () => null }).querySelector('input'));
  if (ab.asElement()) {
    await ab.asElement().evaluate((el) => el.closest('.combo').querySelector('.combo-toggle').click()); await p.waitForTimeout(300);
    await ab.asElement().evaluate((el) => { const li = el.closest('.combo').querySelector('.combo-list li'); li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); if (!el.value) li.click(); }); await p.waitForTimeout(1500);
    const ar = await p.evaluate(async (id) => (await Vault.readCaseJSON(id, 'arrest.json')), ids.c);
    const v = ar && (ar.bookingNumber || (ar.arrestees && ar.arrestees[0] && ar.arrestees[0].bookingNumber));
    ok(v === 'DNA', `Arrest CB # saved as DNA (${v})`);
  } else ok(false, 'Arrest CB # box not found');
  console.log('errors', errs); await b.close(); })();
