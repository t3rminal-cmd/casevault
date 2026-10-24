// v1.149: Today panel, Quick Note (Alt+N), Discovery checklist, password strength, Lock After,
// backup history and Test Restore. All data is made up (Doe / Roe, Example City).
const fs = require('fs');
const os = require('os');
const path = require('path');
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1149';

(async () => {
  fs.mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => iso(new Date(Date.now() + n * 86400000));
  await p.evaluate(async ([a, t0, t1]) => {
    await Vault.saveTimeline(a, { events: [
      { id: 't1', date: t0, time: '09:30', kind: 'deadline', title: 'Return the warrant', note: '', suspect: '', color: '', done: false },
      { id: 't2', date: t1, time: '', kind: 'event', title: 'Meet Example City PD', note: '', suspect: '', color: '', done: false }] });
    await Vault.addFile(a, 'Evidence', new File(['made-up text'], 'Lab note.txt', { type: 'text/plain' }));
  }, [ids.c, day(0), day(1)]);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(600); };

  // 1. Today panel.
  await home();
  await p.waitForSelector('.today-section:not([hidden]) .today-row', { timeout: 10000 });
  const rows = await p.$$eval('.today-row', (x) => x.map((e) => e.textContent));
  ok(rows.length === 2 && /Today 09:30/.test(rows[0]) && /Tomorrow/.test(rows[1]), `Today panel: ${JSON.stringify(rows)}`);
  await p.locator('.today-section').screenshot({ path: `${SP}/today.png` }).catch(() => {});
  await p.check('.today-row input[type=checkbox]'); await p.waitForTimeout(800);
  const done = await p.evaluate(async (a) => (await Vault.getTimeline(a)).events.find((e) => e.id === 't1').done, ids.c);
  ok(done === true && (await p.$$('.today-row')).length === 1, 'ticking a deadline in Today marks it done');

  // 2. Quick Note from anywhere (Alt+N).
  await p.keyboard.press('Alt+n'); await p.waitForSelector('#dialog[open] .quick-note-form');
  await p.selectOption('#dialog[open] .quick-note-form select', `c:${ids.c}`);
  await p.fill('#dialog[open] .quick-note-form textarea', 'Called Example City lab about the sample.');
  await p.keyboard.press('Control+Enter'); await p.waitForTimeout(800);
  const act = await p.evaluate(async (a) => (await Vault.getCase(a)).activity.filter((x) => x.note).map((x) => x.what), ids.c);
  ok(act.some((w) => /^\d\d:\d\d · Called Example City lab/.test(w)), `Quick Note goes to the Case History: ${JSON.stringify(act)}`);

  // 3. Discovery checklist before the copy.
  await p.evaluate((i) => { location.hash = `#/case/${i}/files`; }, ids.c); await p.waitForSelector('.disc-open');
  await p.click('.disc-open'); await p.waitForSelector('.disc .disc-row');
  await p.click('.disc .disc-list:not(.disc-picked) .disc-row >> nth=0');
  await p.fill('.disc input[aria-label="Password"]', 'example-pass-1');
  await p.fill('.disc input[aria-label="Password again"]', 'example-pass-1');
  await p.click('.disc button[type=submit]'); await p.waitForSelector('dialog[open].disc-check');
  const items = await p.$$eval('dialog[open].disc-check .disc-check-row', (x) => x.map((e) => e.dataset.key));
  const blocked = await p.$eval('dialog[open].disc-check .btn.primary', (e) => e.disabled);
  for (const cb of await p.$$('dialog[open].disc-check input[type=checkbox]')) await cb.check();
  const open = await p.$eval('dialog[open].disc-check .btn.primary', (e) => e.disabled);
  ok(items.join(',') === 'signed,bates,password' && blocked && !open, `checklist ${items} Continue blocked until ticked: ${blocked} → ${open}`);
  await p.locator('dialog[open].disc-check').screenshot({ path: `${SP}/checklist.png` }).catch(() => {});
  await p.click('dialog[open].disc-check button:has-text("Back")'); await p.waitForTimeout(300);
  ok(!(await p.$('dialog[open].disc-confirm')), 'Back stops before anything is copied');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 4. Password strength and Lock After.
  await home();
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  await p.click('.locker-section button:has-text("Add Password")'); await p.waitForSelector('#dialog[open] .locker-form');
  const inp = p.locator('#dialog[open] .locker-form input');
  await inp.nth(0).fill('Example Mail'); await inp.nth(1).fill('jdoe'); await inp.nth(2).fill('abc12');
  const meter = await p.textContent('#dialog[open] .pw-meter');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  const tag = await p.$eval('.locker-rows .pw-strength', (e) => [e.tagName, e.textContent, e.className]);
  ok(meter === 'Weak' && tag[0] === 'BUTTON' && tag[1] === 'Weak', `weak password marked: ${meter} ${JSON.stringify(tag)}`);
  await p.click('.locker-rows .pw-strength'); await p.waitForSelector('#dialog[open] .locker-form');
  await p.click('#dialog[open] button:has-text("Generate")');
  ok(await p.textContent('#dialog[open] .pw-meter') === 'Strong', 'Generate makes a Strong one');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  ok((await p.textContent('.locker-rows .pw-strength')) === 'Strong', 'the row now says Strong');
  await p.selectOption('.lock-after', '2'); await p.waitForTimeout(600);
  const note = await p.textContent('.locker-note');
  ok(/2 minutes/.test(note) && (await p.inputValue('.lock-after')) === '2', `Lock After 2 minutes: ${note.trim()}`);
  await p.locator('.locker-open').screenshot({ path: `${SP}/locker.png` }).catch(() => {});

  // 5. Backup history and Test Restore.
  await p.evaluate(async () => {
    const drive = await (await navigator.storage.getDirectory()).getDirectoryHandle('BackupDrive', { create: true });
    await Vault.fullBackup(drive);
    await Vault.recordHelperBackup({ folder: 'E:\\CaseVault-Backups\\CaseVault-Backup-2026-01-02-100000', files: 4, bytes: 2048, drive: 'E:', at: '2026-01-02T10:00:00.000Z' });
  });
  // The backup as folders on disk, to pick in the folder dialog.
  const dump = await p.evaluate(async () => {
    const drive = await (await navigator.storage.getDirectory()).getDirectoryHandle('BackupDrive');
    const out = [];
    const walk = async (d, pre) => { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') await walk(h, `${pre}${n}/`); else out.push([`${pre}${n}`, await (await h.getFile()).text()]); } };
    await walk(drive, '');
    return out;
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv1149-'));
  for (const [rel, text] of dump) { const f = path.join(tmp, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
  const backupDir = path.join(tmp, dump[0][0].split('/')[0]);
  await home();
  await p.click('.hc-backup, .backup-bar .btn'); await p.waitForSelector('.backup-history');
  await p.click('.backup-history summary');
  const hist = await p.$$eval('.backup-hist-table tbody tr', (x) => x.map((e) => e.textContent));
  ok(hist.length === 2 && /E:/.test(hist.join('|')), `backup history: ${JSON.stringify(hist)}`);
  await p.locator('[data-section="backups"]').screenshot({ path: `${SP}/backups.png` }).catch(() => {});
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.backup-test button')]);
  await chooser.setFiles(backupDir);
  await p.waitForSelector('#dialog[open] .test-restore', { timeout: 20000 });
  const res = await p.$eval('#dialog[open] .test-restore', (e) => e.innerText);
  ok(/Backup Reads Back Fine/i.test(res) && /read back in full/.test(res) && /All \d+ files the backup made are there/.test(res), `Test Restore: ${res.replace(/\s+/g, ' ').slice(0, 300)}`);
  await p.locator('#dialog[open] .test-restore').screenshot({ path: `${SP}/test-restore.png` }).catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
  ok(!errs.length, `no page errors: ${JSON.stringify(errs)}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
