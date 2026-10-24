// v1.146: Case Groups (independent cases under a name you give, with their own page); the two main
// sidebar folders' names the same size; the red bell on the main folders only, the due case in red;
// the Password Manager's Edit and arrows always in view; Confidential Files marked Active / Inactive.
// All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1146';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 768);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const past = iso(new Date(Date.now() - 2 * 86400000));
  const c4 = await p.evaluate(async (day) => {
    const ids = Vault.data.cases.map((c) => c.id);
    for (const c of Vault.data.cases.filter((x) => ['EX-100', 'EX-200'].includes(x.number))) {
      await Vault.saveTimeline(c.id, { events: [{ id: 'd1', date: day, time: '', kind: 'deadline', title: 'Lab report due', note: '', suspect: '', color: '', done: false }] });
    }
    return (await Vault.createCase({ number: 'EX-400', subject: 'Jane Doe' })).id;
  }, past);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(400); };
  await home();
  // Open both main folders.
  for (const sel of ['#sidebar .mission-group', '#sidebar .general-group']) if (!(await p.$eval(sel, (d) => d.open))) { await p.click(`${sel} > summary .op-chev`); await p.waitForTimeout(250); }
  if (!(await p.$eval('#sidebar .mission-children .op-group', (d) => d.open))) { await p.click('#sidebar .mission-children .op-group > summary .op-chev'); await p.waitForTimeout(250); }

  // 1. OPERATION CASES and INDEPENDENT CASES in the same size, neither cut off.
  const f = await p.evaluate(() => [document.querySelector('#sidebar .mission-group > summary .op-name'), document.querySelector('#sidebar .general-group > summary .ind-name')].map((e) => ({ size: getComputedStyle(e).fontSize, weight: getComputedStyle(e).fontWeight, fits: e.scrollWidth <= e.clientWidth + 1, text: e.textContent })));
  ok(f[0].size === f[1].size && f[0].weight === f[1].weight && f.every((x) => x.fits), `the two main folder names match: ${JSON.stringify(f)}`);

  // 2. The red bell on the main folders only; the due cases in red.
  const bells = await p.evaluate(() => ({
    ops: !!document.querySelector('#sidebar .mission-group > summary .case-bell'),
    ind: !!document.querySelector('#sidebar .general-group > summary .case-bell'),
    sub: document.querySelectorAll('#sidebar .mission-children .op-group > summary .case-bell').length,
    caseBells: document.querySelectorAll('#sidebar .case-item .case-bell').length,
    red: [...document.querySelectorAll('#sidebar .case-item.has-reminder')].map((e) => [e.querySelector('.case-item-title').textContent.trim(), getComputedStyle(e).backgroundColor, getComputedStyle(e.querySelector('.case-item-title')).color]),
  }));
  ok(bells.ops && bells.ind && bells.sub === 0 && bells.caseBells === 0, `bells on OPERATION CASES and INDEPENDENT CASES only: ${JSON.stringify(bells)}`);
  ok(bells.red.map((r) => r[0]).sort().join() === 'EX-100,EX-200' && bells.red.every((r) => r[1] !== 'rgba(0, 0, 0, 0)'), `the due cases are red: ${JSON.stringify(bells.red)}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar-bells.png` }).catch(() => {});

  // 3. Case Groups: New Case Group from General Files, with a name and the cases ticked.
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForSelector('.general-page');
  await p.click('.general-page button:has-text("New Case Group")'); await p.waitForSelector('#dialog[open] .cg-form');
  await p.fill('#dialog[open] input[aria-label="Group name"]', 'Doe Family');
  for (const n of ['EX-100', 'EX-400']) await p.check(`#dialog[open] .pick-row:has-text("${n}") input`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/new-group.png` }).catch(() => {});
  await p.click('#dialog[open] button[type=submit]'); await p.waitForSelector('.group-page'); await p.waitForTimeout(300);
  const page = await p.evaluate(() => ({ hash: location.hash, h1: document.querySelector('.group-page h1').textContent, cards: [...document.querySelectorAll('.group-page .op-case-num')].map((e) => e.textContent) }));
  ok(page.hash === `#/group/${await p.evaluate(() => CVRoute.enc('Doe Family'))}` && page.h1 === 'Doe Family' && page.cards.join() === 'EX-100,EX-400', `the group has its own page with its cases: ${JSON.stringify(page)}`);
  await p.screenshot({ path: `${SP}/group-page.png` });
  const side = await p.$$eval('#sidebar .suspect-group', (x) => x.map((d) => [d.querySelector('.sg-name').textContent, d.querySelectorAll('.case-item').length, d.querySelector('.sg-head').classList.contains('active')]));
  ok(side.length === 1 && side[0][0] === 'Doe Family' && side[0][1] === 2 && side[0][2], `INDEPENDENT CASES shows the group, marked as open: ${JSON.stringify(side)}`);
  // Its name in the case list opens the page.
  await home();
  if (!(await p.$eval('#sidebar .general-group', (d) => d.open))) { await p.click('#sidebar .general-group > summary .op-chev'); await p.waitForTimeout(250); }
  await p.click('#sidebar .suspect-group > summary .sg-name'); await p.waitForSelector('.group-page');
  ok(true, 'the group name in the case list opens its page');
  // Edit Group: rename it and take a case out.
  await p.click('.group-page button:has-text("Edit Group")'); await p.waitForSelector('#dialog[open] .cg-form');
  await p.fill('#dialog[open] input[aria-label="Group name"]', 'Doe Crew');
  await p.uncheck('#dialog[open] .pick-row:has-text("EX-400") input');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForSelector('.group-page'); await p.waitForTimeout(400);
  const after = await p.evaluate(([a, d]) => ({ h1: document.querySelector('.group-page h1').textContent, c: Vault.data.cases.find((x) => x.id === a).suspectGroup, d: Vault.data.cases.find((x) => x.id === d).suspectGroup }), [ids.c, c4]);
  ok(after.h1 === 'Doe Crew' && after.c === 'Doe Crew' && after.d === '', `renamed, and the case taken out: ${JSON.stringify(after)}`);
  // The case's Details link to its group.
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c); await p.waitForSelector('.case-op-bar a.case-sg-label');
  ok(/Doe Crew/.test(await p.textContent('.case-op-bar a.case-sg-label')) && /Case Group/.test(await p.textContent('.case-op-bar .sg-btn')), 'the case shows its Case Group, with a Case Group button');

  // 4. Password Manager: Edit and the arrows in view with long entries.
  await home();
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  for (const [s, u, w] of [['Example County Records Management System Portal', 'john.doe.investigator@example.gov', 'https://records.example-county.gov/login/portal/home?ref=detective'], ['Example Mail', 'jdoe', 'https://mail.example.gov']]) {
    await p.click('.locker-section button:has-text("Add Password")'); await p.waitForSelector('#dialog[open] .locker-form');
    const inp = p.locator('#dialog[open] .locker-form input');
    await inp.nth(0).fill(s); await inp.nth(1).fill(u); await inp.nth(2).fill('Synthetic-1'); await inp.nth(3).fill(w);
    await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(600);
  }
  const fit = await p.evaluate(() => {
    const wrap = document.querySelector('.locker-rows').closest('.table-wrap').getBoundingClientRect();
    return [...document.querySelectorAll('.locker-rows .locker-edit, .locker-rows button[title="Move down"]')].map((e) => { const r = e.getBoundingClientRect(); return r.right <= wrap.right + 1 && r.left >= wrap.left && r.width > 0; });
  });
  ok(fit.length === 4 && fit.every(Boolean), `Edit and the arrows are in view without searching: ${JSON.stringify(fit)}`);
  ok(/Example County Records Management System Portal/.test(await p.getAttribute('.locker-rows tbody tr td.text-cell', 'title')), 'a long name is cut with … and shown whole on hover');
  await p.locator('.locker-section').first().screenshot({ path: `${SP}/passwords.png` }).catch(() => {});

  // 5. Confidential Files: Active (green) / Inactive (red).
  await p.click('.locker-tabs button:has-text("Confidential Files")'); await p.waitForSelector('.locker-drop');
  await p.setInputFiles('.locker-drop input[type=file]', { name: 'CI-1 notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Made-up note for the test.') });
  await p.waitForSelector('.locker-status', { timeout: 30000 });
  const s1 = await p.$eval('.locker-status', (e) => [e.textContent.trim(), e.classList.contains('active'), getComputedStyle(e).color]);
  await p.click('.locker-status'); await p.waitForTimeout(600);
  const s2 = await p.$eval('.locker-status', (e) => [e.textContent.trim(), e.classList.contains('inactive'), getComputedStyle(e).color]);
  ok(s1[0] === 'Active' && s1[1] && s2[0] === 'Inactive' && s2[1] && s1[2] !== s2[2], `Active in green, a click makes it Inactive in red: ${JSON.stringify([s1, s2])}`);
  await p.locator('.locker-drop').screenshot({ path: `${SP}/files.png` }).catch(() => {});
  await p.click('.locker-page button[title^="Lock now"]'); await p.waitForSelector('input[aria-label="Locker password"]');
  await p.fill('input[aria-label="Locker password"]', 'correct horse 42'); await p.click('.locker-card button[type=submit]');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  await p.click('.locker-tabs button:has-text("Confidential Files")'); await p.waitForSelector('.locker-status');
  ok((await p.textContent('.locker-status')).trim() === 'Inactive', 'it stays Inactive after locking');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
