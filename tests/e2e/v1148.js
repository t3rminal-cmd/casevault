// v1.148: Case Group page (combined Timeline, Summary PDF, Make Operation); a red folder's count of
// due cases; Snooze / Wake on a deadline; Password Manager age, reminder and Copy Username; Last
// Contact on Confidential Files; Operation folder order; pinned cases. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1148';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => iso(new Date(Date.now() + n * 86400000));
  const c4 = await p.evaluate(async ([a, past, soon]) => {
    const c4 = await Vault.createCase({ number: 'EX-400', subject: 'Jane Doe' });
    await Vault.setSuspectGroup(a, 'Doe Family'); await Vault.setSuspectGroup(c4.id, 'Doe Family');
    await Vault.saveTimeline(a, { events: [{ id: 'd1', date: past, time: '', kind: 'deadline', title: 'Lab report due', note: '', suspect: '', color: '', done: false }] });
    await Vault.saveTimeline(c4.id, { events: [{ id: 'e1', date: soon, time: '', kind: 'event', title: 'Interview of Jane Doe', note: '', suspect: 'Jane Doe', color: '', done: false }] });
    return c4.id;
  }, [ids.c, day(-1), day(3)]);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(400); };
  await home();
  if (!(await p.$eval('#sidebar .general-group', (d) => d.open))) { await p.click('#sidebar .general-group > summary .op-chev'); await p.waitForTimeout(250); }

  // 1. The group's red folder shows how many of its cases are due.
  const sg = await p.$eval('#sidebar .suspect-group > summary', (e) => { const a = e.querySelector('.alert-count'); return a ? [a.textContent, a.title] : null; });
  ok(sg && sg[0] === '1' && /EX-100: Lab report due/.test(sg[1]), `the group's count of due cases: ${JSON.stringify(sg)}`);

  // 2. The group page: Timeline of every case, Summary PDF, Make Operation.
  await p.evaluate(() => { location.hash = '#/group/Doe%20Family'; }); await p.waitForSelector('.group-page');
  await p.click('.group-page a:has-text("Timeline")'); await p.waitForSelector('.tl-item'); await p.waitForTimeout(400);
  const tl = await p.$$eval('.tl-item strong', (x) => x.map((e) => e.textContent));
  ok(tl.includes('Lab report due') && tl.includes('Interview of Jane Doe'), `the Timeline shows both cases of the group: ${tl.join(' | ')}`);
  // Snooze the deadline: no red, no bell; Wake brings it back.
  await p.click('.tl-item:has-text("Lab report due") .tl-snooze'); await p.waitForSelector('#dialog[open] .snooze-form');
  await p.click('#dialog[open] button:has-text("3 Days")'); await p.waitForTimeout(800);
  const sn = await p.evaluate(async (a) => ({ txt: document.querySelector('.tl-item.deadline .due').textContent, ev: (await Vault.getTimeline(a)).events[0].snooze, idx: Vault.data.cases.find((c) => c.id === a).nextDeadline }), ids.c);
  ok(/Snoozed until/.test(sn.txt) && sn.ev && sn.idx.snooze === sn.ev, `snoozed: ${JSON.stringify(sn)}`);
  await home();
  const quiet = await p.evaluate(() => ({ bell: !!document.querySelector('#sidebar .general-group > summary .case-bell'), red: document.querySelectorAll('#sidebar .case-item.has-reminder').length, count: !!document.querySelector('#sidebar .suspect-group .alert-count') }));
  ok(!quiet.bell && !quiet.red && !quiet.count, `while snoozed, nothing rings: ${JSON.stringify(quiet)}`);
  await p.evaluate((i) => { location.hash = `#/case/${i}/timeline`; }, ids.c); await p.waitForSelector('.tl-item.deadline');
  await p.click('.tl-item.deadline .tl-snooze'); await p.waitForTimeout(800);
  await home();
  ok(await p.$('#sidebar .general-group > summary .case-bell') !== null, 'Wake rings it again');
  // Summary PDF.
  await p.evaluate(() => { location.hash = '#/group/Doe%20Family'; }); await p.waitForSelector('.group-page');
  await p.click('.group-page button:has-text("Summary PDF")'); await p.waitForSelector('#dialog[open] .pdf-view'); await p.waitForTimeout(500);
  ok(/Case Group Summary/.test(await p.textContent('#dialog[open] h2')), 'Summary PDF opens');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/summary.png` }).catch(() => {});
  await p.click('#dialog[open] .dialog-actions button:has-text("Close")');
  await p.screenshot({ path: `${SP}/group-page.png` });
  // Make Operation.
  await p.click('.group-page button:has-text("Make Mission")'); await p.waitForSelector('#dialog[open]');
  await p.click('#dialog[open] button:has-text("Make Mission")'); await p.waitForSelector('#dialog[open] .op-form');
  const opName = await p.inputValue('#dialog[open] .op-form input[name=name]');
  await p.click('#dialog[open] .op-form button[type=submit]'); await p.waitForFunction(() => /#\/operation\//.test(location.hash), null, { timeout: 15000 }); await p.waitForTimeout(600);
  const made = await p.evaluate(([a, d]) => [a, d].map((id) => { const c = Vault.data.cases.find((x) => x.id === id); return [Vault.operationOf(c) && Vault.operationOf(c).name, c.suspectGroup]; }), [ids.c, c4]);
  ok(opName === 'Doe Family' && made.every(([n, g]) => n === 'Doe Family' && g === ''), `the group became an Operation: ${opName} ${JSON.stringify(made)}`);

  // 3. The Operation's red folder in OPERATION shows its count.
  await home();
  if (!(await p.$eval('#sidebar .mission-group', (d) => d.open))) { await p.click('#sidebar .mission-group > summary .op-chev'); await p.waitForTimeout(250); }
  const oc = await p.$$eval('#sidebar .mission-children .op-group > summary', (x) => x.map((e) => [e.querySelector('.op-num').textContent, e.querySelector('.alert-count') ? e.querySelector('.alert-count').textContent : '']));
  ok(oc.some(([n, a]) => a === '1'), `an Operation with a due case shows its count: ${JSON.stringify(oc)}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});

  // 4. Operation folder order: Most Alerts First puts the one with the alert first.
  await p.selectOption('.ov-op-sort', 'alerts'); await p.waitForTimeout(500);
  const first = await p.$eval('.op-folders-section:not(.closed-files-section):not(.archived-section):not(.general-years-section) .op-folder-tile', (e) => e.textContent);
  ok(/Doe Family/.test(first) && await p.evaluate(() => localStorage.getItem('cv-op-sort')) === 'alerts', `Most Alerts First: ${first}`);

  // 5. Pin a case: it stays at the top of Recently Updated, even after Clear.
  await p.click(`.recent-grid a.recent-row:has-text("EX-300") .pin-btn`); await p.waitForTimeout(700);
  await p.click('.recent-section button:has-text("Clear")'); await p.waitForTimeout(700);
  const rows = await p.$$eval('.recent-grid a.recent-row', (x) => x.map((e) => [e.textContent.includes('EX-300'), e.classList.contains('pinned')]));
  ok(rows.length === 1 && rows[0][0] && rows[0][1], `the pinned case stays after Clear: ${JSON.stringify(rows)}`);
  await p.locator('.recent-section').screenshot({ path: `${SP}/pinned.png` }).catch(() => {});

  // 6. Password Manager: age, reminder, Copy Username; Confidential Files: Last Contact.
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  await p.click('.locker-section button:has-text("Add Password")'); await p.waitForSelector('#dialog[open] .locker-form');
  const inp = p.locator('#dialog[open] .locker-form input');
  await inp.nth(0).fill('Example Mail'); await inp.nth(1).fill('jdoe'); await inp.nth(2).fill('Synthetic-1');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  ok((await p.textContent('.locker-rows .pw-age')).trim() === 'Today', 'a new password says it was changed Today');
  ok(await p.$('.locker-rows .copy-user') !== null, 'the username has a Copy button');
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await p.click('.locker-rows .copy-user'); await p.waitForTimeout(300);
  ok((await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))) === 'jdoe', 'Copy puts the username on the clipboard');
  // An old password turns red with the reminder on.
  await p.selectOption('.pw-remind', '90'); await p.waitForTimeout(600);
  ok(await p.$('.locker-rows tr.pw-stale') === null, 'a new password is not marked');
  // (an old password turning red is covered by tests/v1148.test.js)
  await p.click('.locker-tabs button:has-text("Confidential Files")'); await p.waitForSelector('.locker-drop');
  await p.setInputFiles('.locker-drop input[type=file]', { name: 'CI-1 notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Made-up note.') });
  await p.waitForSelector('.locker-drop tbody tr .locker-status', { timeout: 30000 });
  await p.click('.locker-drop tbody tr button[title^="Informant"]'); await p.waitForSelector('#dialog[open] .locker-form');
  const dt = p.locator('#dialog[open] .date-field:has(input[aria-label="Last contact"]) input.date-text, #dialog[open] .date-field input.date-text').first();
  await dt.fill('10.01.2026'); await dt.press('Tab');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  const lc = await p.$$eval('.locker-drop thead th, .locker-drop tbody td', (x) => x.map((e) => e.textContent.trim()));
  ok(lc.includes('Last Contact') && lc.some((t) => /October 0?1, 2026/.test(t)), `Last Contact column: ${lc.join(' | ')}`);
  await p.locator('.locker-drop').screenshot({ path: `${SP}/files.png` }).catch(() => {});
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
