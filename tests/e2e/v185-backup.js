const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  console.log('hero backup:', await p.textContent('.hc-backup'), await p.getAttribute('.hc-backup', 'class'));
  console.log('toasts:', await p.$$eval('.toast', (t) => t.map((x) => x.textContent)));
  // A file in a case so the copy has content.
  await p.evaluate(async (id) => { await Vault.addFile(id, 'Evidence', new File(['hello world'], 'note.txt', { type: 'text/plain' })).catch((e) => console.log(e)); }, ids.c);
  // Refused: inside the vault
  const inside = await p.evaluate(async () => { try { await Vault.fullBackup(await Vault.root.getDirectoryHandle('cases')); return 'no'; } catch (e) { return e.name + ': ' + e.message; } });
  console.log('inside:', inside);
  const around = await p.evaluate(async () => { try { await Vault.fullBackup(await navigator.storage.getDirectory()); return 'no'; } catch (e) { return e.name + ': ' + e.message; } });
  console.log('around:', around);
  // Picker returns a separate folder
  await p.evaluate(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('BackupDrive', { create: true }); });
  await p.click('.hc-backup'); await p.waitForSelector('.backup-full');
  await p.screenshot({ path: process.env.SP + '/v185/vault-backups.png' });
  await p.click('.backup-full button'); await p.click('#dialog[open] button:has-text("Pick the Backup Drive")');
  await p.waitForSelector('#dialog[open] h2:has-text("Full Backup Done")', { timeout: 20000 });
  console.log('done:', await p.textContent('#dialog[open] .backup-form p'));
  await p.click('#dialog[open] button:has-text("Done")');
  const listing = await p.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('BackupDrive');
    const out = []; for await (const [n, h] of d.entries()) { out.push(n); const info = await (await (await h.getFileHandle('backup-info.json')).getFile()).text(); out.push(info); const names = []; for await (const [m] of h.entries()) names.push(m); out.push(names.join(',')); }
    return out;
  });
  console.log(listing);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(600);
  console.log('hero after:', await p.textContent('.hc-backup'), await p.getAttribute('.hc-backup', 'class'));
  // Restore: rename the mission then restore today's backup
  const before = await p.evaluate(() => Vault.listBackups());
  await p.evaluate(async (op) => { await Vault.backupNow(); await Vault.updateOperation(op, { name: 'Renamed Op' }); }, ids.op);
  const name = (await p.evaluate(() => Vault.listBackups()))[0];
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(400);
  await p.click('.hc-backup'); await p.waitForSelector('.backup-list');
  await p.click('.backup-list summary');
  await p.click(`.backup-row:has-text("${name}") button`);
  await p.click('#dialog[open] button:has-text("Restore")'); await p.waitForTimeout(1200);
  console.log('toast:', await p.$$eval('.toast', (t) => t.map((x) => x.textContent).pop()));
  ok(await p.evaluate((op) => Vault.getOperation(op).name, ids.op) === 'Example Op', 'restore brought back the Mission name');
  ok(await p.evaluate(() => Vault.data.cases.length) >= 3, 'cases still listed');
  console.log('errors', errs); await b.close(); })();
