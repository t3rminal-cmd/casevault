// v1.145: Recently Updated status (word left, icon right); OPERATION CASES (was Mission Files);
// Archived → Rename Folders; independent cases in a suspect folder (not a Mission); the Password
// Manager arranged by hand or A to Z, with an Edit button and each entry's old passwords. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1145';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(400); };
  await home();

  // 1. OPERATION CASES in the case list and on the home page.
  const side = (await p.textContent('#sidebar .mission-group > summary .op-name')).trim();
  ok(side === 'OPERATION CASES', `the case list says OPERATION CASES: ${side}`);
  const heads = await p.$$eval('.dash-section h2', (x) => x.map((e) => e.textContent.trim().toUpperCase()));
  ok(heads.includes('OPERATION CASES') && !heads.some((t) => /MISSION FILES/.test(t)), `the home page says Operation Cases: ${heads.join(' | ')}`);
  const sideClip = await p.$eval('#sidebar .mission-group > summary .op-name', (e) => e.scrollWidth <= e.clientWidth + 1);
  ok(sideClip, 'OPERATION CASES fits in the case list');

  // 2. Recently Updated: the status word on the left of its box, the icon on the right.
  const pill = await p.$eval('.recent-grid a.recent-row .pill', (e) => {
    const box = e.getBoundingClientRect(); const svg = e.querySelector('svg').getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents([...e.childNodes].find((n) => n.nodeType === 3 || (n.tagName !== 'svg' && n.tagName !== 'SVG')));
    const t = r.getBoundingClientRect();
    return { left: t.left - box.left, right: box.right - svg.right, gap: svg.left - t.right, jc: getComputedStyle(e).justifyContent };
  });
  ok(pill.jc === 'space-between' && pill.left < 14 && pill.right < 14 && pill.gap > 4, `status word left, icon right: ${JSON.stringify(pill)}`);
  await p.locator('.recent-section').screenshot({ path: `${SP}/recent.png` }).catch(() => {});

  // 3. Archived → Rename Folders.
  await p.click('.archived-section button:has-text("Rename Folders")'); await p.waitForSelector('#dialog[open] .rename-arch-form');
  await p.fill('#dialog[open] input[aria-label="Name for NOLLE PROSEQUI"]', 'Dismissed');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/rename-dialog.png` }).catch(() => {});
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  const names = await p.evaluate(() => [Vault.archiveFolderName('nolle'), Vault.archiveFolderName('expired'), Vault.data.settings.archiveFolderNames]);
  ok(names[0] === 'Dismissed' && names[1] === 'EXPIRED', `the folder is renamed, the others keep their names: ${JSON.stringify(names)}`);
  await p.click('.archived-section .year-group-tile'); await p.waitForTimeout(300);
  const arch = await p.$$eval('.archived-section .done-year .op-folder-tile', (x) => x.map((e) => e.textContent.trim()));
  ok(arch.some((t) => /Dismissed/i.test(t)) && !arch.some((t) => /NOLLE/i.test(t)), `Archived shows the new name: ${arch.join(' | ')}`);
  const c3 = await p.evaluate((id) => Vault.data.cases.find((c) => c.id === id).archiveFolder, ids.c3);
  ok(c3 === 'nolle', 'the archived case stays in its folder');
  await p.locator('.archived-section').screenshot({ path: `${SP}/archived.png` }).catch(() => {});

  // 4. Independent cases in a suspect folder (not a Mission).
  const c4 = await p.evaluate(async () => (await Vault.createCase({ number: 'EX-400', subject: 'John Doe' })).id);
  const putIn = async (id, name) => {
    await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${i}/details`; }, id); await p.waitForSelector('.case-op-bar .sg-btn');
    await p.click('.case-op-bar .sg-btn'); await p.waitForSelector('#dialog[open] .sg-form');
    if (name != null) await p.fill('#dialog[open] .sg-form input', name);
    await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  };
  await putIn(ids.c, null); // the subject's name is offered
  await putIn(c4, 'john   doe'); // written another way: joins the folder already there
  const groups = await p.evaluate(([a, b2]) => [a, b2].map((id) => Vault.data.cases.find((c) => c.id === id).suspectGroup), [ids.c, c4]);
  ok(groups[0] === 'John Doe' && groups[1] === 'John Doe', `both cases are in the folder John Doe: ${JSON.stringify(groups)}`);
  const saved = await p.evaluate(async (id) => (await Vault.getCase(id)).suspectGroup, c4);
  ok(saved === 'John Doe', 'it is kept in case.json');
  ok(/John Doe/.test(await p.textContent('.case-op-bar .case-sg-label')), 'the case shows its suspect folder');
  // Editing the case keeps it in the folder.
  await p.fill('.details-grid input[aria-label="Subject Name"], .details-grid .field:has-text("Subject Name") input', 'John Q Doe').catch(() => {});
  await p.evaluate(() => window.CaseVaultUI.Save.flushAll()); await p.waitForTimeout(500);
  ok(await p.evaluate(async (id) => (await Vault.getCase(id)).suspectGroup, c4) === 'John Doe', 'saving the Details keeps the suspect folder');
  await home();
  const sg = await p.$$eval('#sidebar .general-group .suspect-group', (x) => x.map((d) => ({ name: d.querySelector('.sg-name').textContent, n: d.querySelector('.sg-count').textContent, cases: [...d.querySelectorAll('.case-item-title')].map((e) => e.textContent.trim()) })));
  ok(sg.length === 1 && sg[0].name === 'John Doe' && sg[0].n === '2' && sg[0].cases.join() === 'EX-100,EX-400', `INDEPENDENT CASES has the folder John Doe with both cases: ${JSON.stringify(sg)}`);
  if (!(await p.$eval('#sidebar .general-group', (d) => d.open))) { await p.click('#sidebar .general-group > summary .op-chev'); await p.waitForTimeout(300); }
  const was = await p.$eval('#sidebar .suspect-group', (d) => d.open);
  await p.click('#sidebar .suspect-group > summary'); await p.waitForTimeout(200);
  const once = await p.$eval('#sidebar .suspect-group', (d) => d.open);
  await p.click('#sidebar .suspect-group > summary'); await p.waitForTimeout(200);
  const twice = await p.$eval('#sidebar .suspect-group', (d) => d.open);
  ok(once === !was && twice === was, `the folder folds and opens (${was} → ${once} → ${twice})`);
  if (!twice) { await p.click('#sidebar .suspect-group > summary'); await p.waitForTimeout(200); }
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForSelector('.gen-sg');
  ok((await p.$$eval('.gen-sg', (x) => x.map((e) => e.textContent.trim()))).filter((t) => t === 'John Doe').length === 2, 'General Files shows the folder in the Mission column');
  // A case moved into a Mission leaves its suspect folder.
  await p.evaluate(async ([id, op]) => { await Vault.assignCase(id, op); }, [c4, ids.op]);
  ok(await p.evaluate((id) => Vault.data.cases.find((c) => c.id === id).suspectGroup, c4) === '', 'a case put in a Mission leaves the suspect folder');
  // Take Out of Folder.
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${i}/details`; }, ids.c); await p.waitForSelector('.case-op-bar .sg-btn');
  await p.click('.case-op-bar .sg-btn'); await p.waitForSelector('#dialog[open] .sg-form');
  await p.click('#dialog[open] button:has-text("Take Out of Folder")'); await p.waitForTimeout(600);
  ok(await p.evaluate((id) => Vault.data.cases.find((c) => c.id === id).suspectGroup, ids.c) === '' && await p.locator('#sidebar .suspect-group').count() === 0, 'Take Out of Folder empties it, and the folder goes');

  // 5. Password Manager: order, Edit, old passwords.
  await home();
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  for (const [site, pw] of [['Zeta Portal', 'Zeta-Pass-1'], ['Alpha Mail', 'Old-Pass-1'], ['Mid Records', 'Mid-Pass-1']]) {
    await p.click('.locker-section button:has-text("Add Password")'); await p.waitForSelector('#dialog[open] .locker-form');
    const inp = p.locator('#dialog[open] .locker-form input');
    await inp.nth(0).fill(site); await inp.nth(1).fill('jdoe'); await inp.nth(2).fill(pw);
    await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(600);
  }
  const order = () => p.$$eval('.locker-table tbody tr[data-id] td:first-child', (x) => x.map((e) => e.textContent.trim()));
  ok((await order()).join() === 'Zeta Portal,Alpha Mail,Mid Records', `in the order added: ${(await order()).join()}`);
  await p.click('.locker-table tr:has-text("Mid Records") button[title="Move up"]'); await p.waitForTimeout(500);
  ok((await order()).join() === 'Zeta Portal,Mid Records,Alpha Mail', `Move up: ${(await order()).join()}`);
  ok(await p.$eval('.locker-table tbody tr[data-id] button[title="Move up"]', (e) => e.disabled), 'the first one cannot move up');
  await p.click('.locker-section button:has-text("Sort A")'); await p.waitForTimeout(500);
  ok((await order()).join() === 'Alpha Mail,Mid Records,Zeta Portal', `Sort A to Z: ${(await order()).join()}`);
  // Edit (a button with its word) changes the password; the old one is kept.
  const editTxt = (await p.textContent('.locker-table tr:has-text("Alpha Mail") .locker-edit')).trim();
  ok(editTxt === 'Edit', `the Edit button says Edit: ${editTxt}`);
  await p.click('.locker-table tr:has-text("Alpha Mail") .locker-edit'); await p.waitForSelector('#dialog[open] .locker-form');
  await p.locator('#dialog[open] .locker-form input').nth(2).fill('New-Pass-2');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  const hb = (await p.textContent('.locker-table tr:has-text("Alpha Mail") .locker-hist-btn')).trim();
  ok(/Old \(1\)/.test(hb), `the entry has one old password: ${hb}`);
  await p.click('.locker-table tr:has-text("Alpha Mail") .locker-hist-btn'); await p.waitForSelector('.locker-hist-row');
  await p.click('.locker-hist-row button[title="Show"]'); await p.waitForTimeout(200);
  const hist = (await p.textContent('.locker-hist-row')).replace(/\s+/g, ' ');
  ok(/Old-Pass-1/.test(hist) && /Until /.test(hist), `the old password shows under the entry, with the day it changed: ${hist}`);
  await p.locator('.locker-section').first().screenshot({ path: `${SP}/passwords.png` }).catch(() => {});
  // Changed again: two old passwords, newest first; the Edit box lists them.
  await p.click('.locker-table tr[data-id]:has-text("Alpha Mail") .locker-edit'); await p.waitForSelector('#dialog[open] .locker-form');
  await p.locator('#dialog[open] .locker-form input').nth(2).fill('Newest-Pass-3');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  const data = await p.evaluate(async () => { const r = (await (async () => document.querySelectorAll('.locker-table tr[data-id]').length)()); return r; });
  await p.click('.locker-table tr[data-id]:has-text("Alpha Mail") .locker-edit'); await p.waitForSelector('#dialog[open] .edit-hist');
  const eh = await p.$$eval('#dialog[open] .edit-hist li', (x) => x.length);
  ok(eh === 2 && data === 3, `the Edit box lists the 2 old passwords: ${eh}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/edit.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Cancel")');
  // Locked and opened again: the order and the old passwords are still there (kept encrypted).
  await p.click('.locker-page button[title^="Lock now"]'); await p.waitForSelector('input[aria-label="Locker password"]');
  await p.fill('input[aria-label="Locker password"]', 'correct horse 42'); await p.click('.locker-card button[type=submit]');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  ok((await order()).join() === 'Alpha Mail,Mid Records,Zeta Portal' && /Old \(2\)/.test(await p.textContent('.locker-table tr:has-text("Alpha Mail") .locker-hist-btn')), 'after locking, the order and the old passwords are kept');

  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
