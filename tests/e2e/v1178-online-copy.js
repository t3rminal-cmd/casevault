// v1.178: the online copy (GitHub Pages) never remembers the vault folder, since its web address is
// shared with the account's other Pages sites: the folder is chosen each visit and kept only while
// the page is open, and the welcome screen points to the SSD copy (Start-CaseVault.bat) for everyday
// use. The SSD copy still remembers it. The online address is stood in for (__cvOnlineCopy).
const { chromium } = require('playwright');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

async function open(b, online) {
  const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript((on) => {
    if (on) window.__cvOnlineCopy = true;
    window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('S' + Date.now(), { create: true });
  }, online);
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.waitForSelector('#gate:not([hidden])');
  const welcome = await p.textContent('#gate');
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  // Counted, not read back: reading a saved folder back crashes some test browsers.
  const saved = await p.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('casevault', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handle');
    req.onsuccess = () => { const c = req.result.transaction('handle').objectStore('handle').count(); c.onsuccess = () => { resolve(c.result > 0); req.result.close(); }; c.onerror = () => resolve(false); };
    req.onerror = () => resolve(false);
  }));
  return { p, errs, welcome, saved };
}

(async () => {
  const b = await chromium.launch();
  try {
    const on = await open(b, true);
    ok(/online copy/.test(on.welcome) && /Start-CaseVault\.bat/.test(on.welcome) && /Allow this time/.test(on.welcome), 'the online copy says to use the SSD copy every day, and to allow this time only');
    ok(!on.saved, 'the online copy keeps no folder in the browser');
    ok(await on.p.evaluate(() => !!(Vault.data && Vault.data.vaultId)), 'the vault opens as usual');
    ok(on.errs.length === 0, `no page errors: ${JSON.stringify(on.errs)}`);
    const off = await open(b, false);
    ok(off.saved && !/online copy/.test(off.welcome), 'the SSD copy still remembers the folder, without the note');
  } finally { await b.close(); }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
