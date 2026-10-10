// v1.111: Field Notes in plain view, closing other cases on the same suspect, the General Files
// name columns, and the Secure Locker. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1111';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  // (A) Field Notes on the Details tab and the Mission page.
  await p.evaluate(async (ids) => { await Vault.saveNotes(ids.c2, '# Surveillance\n\n**Blue sedan** seen at Example City lot.'); }, ids);
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c2); await p.waitForSelector('.field-notes-card .fn-text');
  ok(/Blue sedan/.test(await p.textContent('.field-notes-card')) && await p.locator('.field-notes-card strong', { hasText: 'Blue sedan' }).count() === 1, 'the Details tab shows the Field Notes, formatted');
  await p.locator('.field-notes-card').screenshot({ path: `${SP}/details-notes.png` }).catch(() => {});
  const opId = await p.evaluate(() => Vault.listOperations()[0].id);
  await p.evaluate((i) => { location.hash = `#/operation/${i}`; }, opId); await p.waitForSelector('.field-notes-card .fn-text');
  ok(/EX-200/.test(await p.textContent('.field-notes-card')) && /Blue sedan/.test(await p.textContent('.field-notes-card')), 'the Mission page shows each case number\'s Field Notes');

  // (C) General Files: Last, First, Middle.
  await p.evaluate(async () => { await Vault.createCase({ number: 'EX-500', subject: 'Robert Allen Doe' }); await Vault.createCase({ number: 'EX-501', subject: 'DOE, John Q' }); });
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForSelector('.general-table tbody tr');
  const heads = await p.$$eval('.general-table thead th', (x) => x.map((e) => e.textContent.trim()));
  ok(heads.slice(1, 4).join('|') === 'Last Name|First Name|Middle Name', `columns: ${heads.join(' | ')}`);
  const row = await p.$$eval('.general-table tbody tr', (rs) => { const r = rs.find((x) => /EX-500/.test(x.textContent)); return [...r.querySelectorAll('td')].slice(1, 4).map((t) => [t.textContent.trim(), getComputedStyle(t).textAlign]); });
  ok(row.map((x) => x[0]).join('|') === 'DOE|Robert|Allen' && row.every((x) => ['left', 'start'].includes(x[1])), `EX-500 split and left aligned: ${JSON.stringify(row)}`);
  await p.locator('.general-table').screenshot({ path: `${SP}/general.png` }).catch(() => {});

  // (B) Close EX-100 (John Doe): EX-501 (DOE, John Q)? not the same person; EX-600 (DOE, John) is.
  const c6 = await p.evaluate(async () => (await Vault.createCase({ number: 'EX-600', subject: 'DOE, John' })).id);
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c); await p.waitForSelector('.case-actions');
  await p.click('.case-actions button:has-text("Close Case")'); await p.waitForSelector('#dialog[open] .close-form');
  const rel = await p.$$eval('#dialog[open] .close-related .close-pick', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  // EX-501 (DOE, John Q) is offered too: a middle initial left off may be the same person (not ticked).
  ok(rel.length === 2 && rel.some((t) => /EX-600/.test(t)) && rel.every((t) => /Same suspect: John Doe/.test(t)) && !/EX-200|EX-500/.test(rel.join()), `offers the other open cases on the same suspect: ${rel.join(' / ')}`);
  ok(await p.$$eval('#dialog[open] .close-related input[type=checkbox]', (x) => x.every((e) => !e.checked)), 'none ticked to start');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/close.png` }).catch(() => {});
  await p.check('#dialog[open] .close-related input[aria-label="Also close EX-600"]');
  await p.check('#dialog[open] input[name=disposition][value=inactive]');
  await p.fill('#dialog[open] input[aria-label="Closed by"]', 'P.O. Example');
  ok(/Close 2 Case Numbers/.test(await p.textContent('#dialog[open] button[type=submit]')), 'the button counts both');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(1500);
  const st = await p.evaluate(async ([a, b]) => [await Vault.getCase(a), await Vault.getCase(b)].map((x) => [x.status, (x.closure || {}).disposition, (x.closure || {}).note || '']), [ids.c, c6]);
  ok(st[0][0] === 'Closed' && st[1][0] === 'Closed' && st[1][1] === 'inactive' && /Closed together with EX-100 \(same suspect: John Doe\)/.test(st[1][2]), `both closed: ${JSON.stringify(st)}`);
  // (D) Secure Locker: Other Files tile, set up, recovery key, tables, files, lock, recovery.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  ok(await p.locator('a.locker-tile, a.ov-btn-locker').count() >= 1, 'Other Files has the Secure Locker');
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  const rk = (await p.textContent('#dialog[open] .recovery-key')).trim();
  ok(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/.test(rk) && await p.isDisabled('#dialog[open] button:has-text("Done")'), `a recovery key is shown once, Done waits for the tick (${rk.slice(0, 4)}…)`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/recovery.png` }).catch(() => {});
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  // A password.
  await p.click('.locker-section button:has-text("Add Password")'); await p.waitForSelector('#dialog[open] .locker-form');
  const inp = p.locator('#dialog[open] .locker-form input');
  await inp.nth(0).fill('Example Portal'); await inp.nth(1).fill('jdoe'); await inp.nth(2).fill('Synthetic-Pass-77');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(800);
  const cells = await p.$$eval('.locker-table tbody tr td', (x) => x.map((e) => e.textContent.trim()));
  ok(cells.includes('Example Portal') && cells.includes('jdoe') && !cells.join().includes('Synthetic-Pass-77'), `the password table shows the entry with the password hidden: ${cells.slice(0, 4).join(' | ')}`);
  await p.click('.locker-table .secret-wrap button[title="Show"]');
  ok(/Synthetic-Pass-77/.test(await p.textContent('.locker-table .secret-wrap')), 'Show reveals it');
  await p.locator('.locker-page').screenshot({ path: `${SP}/passwords.png` }).catch(() => {});
  // Covert: an alias and an account.
  await p.click('.locker-tabs button:has-text("Covert")'); await p.waitForTimeout(300);
  await p.click('.locker-section button:has-text("Add Alias")'); await p.waitForSelector('#dialog[open] .locker-form');
  await p.locator('#dialog[open] .locker-form input').nth(0).fill('Ricky Example'); await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(600);
  await p.click('.locker-section button:has-text("Add Account")'); await p.waitForSelector('#dialog[open] .locker-form');
  await p.locator('#dialog[open] .locker-form input').nth(0).fill('Example Chat'); await p.locator('#dialog[open] .locker-form input').nth(1).fill('ricky_ex'); await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(600);
  ok(/Ricky Example/.test(await p.textContent('.locker-open')) && /ricky_ex/.test(await p.textContent('.locker-open')), 'Covert holds aliases and accounts');
  await p.locator('.locker-page').screenshot({ path: `${SP}/covert.png` }).catch(() => {});
  // Confidential Files: one synthetic text file.
  await p.click('.locker-tabs button:has-text("Confidential Files")'); await p.waitForTimeout(300);
  await p.setInputFiles('.locker-section input[type=file]', { name: 'CI-0001 debrief.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic debrief: Example City, nothing real.') });
  await p.waitForSelector('.locker-table tbody tr button.linklike', { timeout: 20000 });
  ok(/CI-0001 debrief\.txt/.test(await p.textContent('.locker-table')), 'the file is in Confidential Files');
  await p.click('.locker-table button.linklike'); await p.waitForSelector('#dialog[open] .locker-text');
  ok(/Synthetic debrief/.test(await p.textContent('#dialog[open] .locker-text')), 'it opens decrypted');
  await p.click('#dialog[open] button:has-text("Close")');
  // Nothing readable on the SSD.
  const disk = await p.evaluate(async () => {
    const t = async (n) => { const b = await Vault.lockerRead(n); return b ? [...b].map((x) => String.fromCharCode(x)).join('') : ''; };
    const head = JSON.stringify(await Vault.lockerHeader());
    const dir = await Vault.root.getDirectoryHandle('locker'); const names = []; for await (const [n] of dir.entries()) names.push(n);
    let all = head + (await t('data.bin'));
    for (const n of names.filter((x) => x.startsWith('f-'))) all += await t(n);
    return { names, plain: ['Synthetic-Pass-77', 'Example Portal', 'Ricky Example', 'Synthetic debrief', 'correct horse'].filter((w) => all.includes(w)) };
  });
  ok(disk.names.includes('locker.json') && disk.names.includes('data.bin') && disk.names.some((n) => n.startsWith('f-')) && !disk.plain.length, `encrypted on the SSD: ${disk.names.join(', ')}; readable words: ${disk.plain.join(', ') || 'none'}`);
  // Leaving the page locks it; a wrong password is refused; the right one opens it.
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = '#/locker'; }); await p.waitForSelector('input[aria-label="Locker password"]');
  ok(true, 'leaving the page locked it');
  await p.fill('input[aria-label="Locker password"]', 'wrong password 1'); await p.click('.locker-card button[type=submit]');
  await p.waitForFunction(() => /Wrong password/.test(document.querySelector('.locker-card [role=alert]').textContent), null, { timeout: 30000 });
  ok(true, 'a wrong password is refused');
  await p.fill('input[aria-label="Locker password"]', 'correct horse 42'); await p.click('.locker-card button[type=submit]');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  await p.click('.locker-tabs button:has-text("Password Manager")'); await p.waitForTimeout(300);
  ok(/Example Portal/.test(await p.textContent('.locker-open')), 'the right password opens it with everything there');
  // Lock, then the recovery key sets a new password.
  await p.click('.locker-page button[title^="Lock now"]'); await p.waitForSelector('input[aria-label="Locker password"]');
  await p.click('button:has-text("Forgot the password?")'); await p.waitForSelector('#dialog[open] input[aria-label="Recovery key"]');
  await p.fill('#dialog[open] input[aria-label="Recovery key"]', rk.toLowerCase().replace(/-/g, ' '));
  await p.fill('#dialog[open] input[aria-label="New password"]', 'brand new pass 9'); await p.fill('#dialog[open] input[aria-label="New password again"]', 'brand new pass 9');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForSelector('.locker-open', { timeout: 30000 });
  ok(/Example Portal/.test(await p.textContent('.locker-open')), 'the recovery key opens it and sets a new password');
  // The privacy screen locks it.
  await p.evaluate(() => document.dispatchEvent(new Event('cv-privacy-screen'))); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => CVLockerUI.isUnlocked())), 'the privacy screen locks it');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
