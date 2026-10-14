// shared boot: a vault with synthetic cases
// v1.118: tests read a case file through window.__readCaseJSON: it waits for the app's saves, and tries
// again for a moment when the file is busy being written (NotReadableError when the run is under load).
function readHelper(p) {
  return p.addInitScript(() => {
    window.__readCaseJSON = async (id, name) => {
      for (let i = 0; ; i += 1) {
        try {
          if (window.CaseVaultUI && window.CaseVaultUI.Save) await window.CaseVaultUI.Save.flushAll();
          return await Vault.readCaseJSON(id, name); // the app's Vault (a script-level const, not on window)
        } catch (e) {
          if (i >= 8 || e.name !== 'NotReadableError') throw e;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    };
  });
}
module.exports = async function boot(W = 1366, H = 900) {
  const { chromium } = require('playwright');
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('app: ' + e.stack.slice(0, 300)));
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('S' + Date.now(), { create: true }); });
  await readHelper(p);
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  const ids = await p.evaluate(async () => {
    const op = await Vault.createOperation({ name: 'Example Op', number: 'OP-1' });
    const c = await Vault.createCase({ number: 'EX-100', subject: 'John Doe' });
    const c2 = await Vault.createCase({ number: 'EX-200', subject: 'Jane Roe' });
    await Vault.assignCase(c2.id, op.id).catch(() => {});
    const c3 = await Vault.createCase({ number: 'EX-300', subject: 'Rick Poe' });
    await Vault.archiveCase(c3.id, false, 'nolle').catch(() => {});
    return { c: c.id, c2: c2.id, c3: c3.id, op: op.id };
  });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(900);
  return { b, p, errs, ids };
};

module.exports.readHelper = readHelper;
