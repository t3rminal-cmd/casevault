// v1.178: the helper's key stays in localStorage (other tabs need it: v1.152 reconnect, and a tab
// reopened while the helper runs), but a key that is no longer any use is removed: when the helper
// refuses it, unless another tab has meanwhile stored a new one, and at Power Off. The helper's
// answers are stood in for here; the real helper is in v1151-helper-key.js. Made-up data only.
const { chromium } = require('playwright');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const OLD = '0'.repeat(32); const NEW = 'f'.repeat(32);

(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext();
    let shutdowns = 0; let refuse = true; const seen = []; let hold = null;
    await ctx.route('http://localhost:8765/api/**', async (route) => {
      const r = route.request(); const key = r.headers()['x-casevault-key'] || ''; seen.push(key);
      if (hold && key === OLD) { await hold; return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'KeyError', message: 'restarted' }) }); }
      if (/\/api\/shutdown/.test(r.url())) { shutdowns += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"drives":""}' }); }
      if (refuse || key !== NEW) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'KeyError', message: 'The CaseVault helper was restarted, so this window needs its new key.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app: 'CaseVault helper', version: 'test', ready: false, root: '', drive: '' }) });
    });
    const p = await ctx.newPage();
    await p.addInitScript(() => { delete Window.prototype.showDirectoryPicker; delete window.showDirectoryPicker; });
    await p.addInitScript((k) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('cv-helper-key', k); sessionStorage.setItem('seeded', '1'); } }, OLD);
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(2500);
    const after = await p.evaluate(() => ({ key: localStorage.getItem('cv-helper-key'), text: document.body.innerText }));
    ok(seen.includes(OLD) && after.key === null, `a key the helper refuses is removed from the browser: ${after.key}`);
    ok(/Start CaseVault Again to Reconnect/i.test(after.text), 'the window still waits to reconnect');

    // A new tab brings the new key: the waiting tab reconnects (the storage event still works).
    refuse = false;
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => { delete Window.prototype.showDirectoryPicker; delete window.showDirectoryPicker; });
    await p2.goto(`http://localhost:8765/?k=${NEW}`); await p2.waitForTimeout(2500);
    await p.waitForTimeout(1500);
    const back = await p.evaluate(() => ({ key: localStorage.getItem('cv-helper-key'), text: document.body.innerText }));
    ok(back.key === NEW && !/Start CaseVault Again/i.test(back.text), 'the waiting tab reconnects with the key the new tab brought');

    // A refusal of the old key never removes a newer key another tab has stored meanwhile: the old
    // key's refusal is held back until the new key is in place.
    let release; hold = new Promise((r) => { release = r; });
    await p.evaluate((k) => { localStorage.setItem('cv-helper-key', k); window.__info = HelperFS.info().catch((e) => e.name); }, OLD);
    await p.waitForTimeout(300);
    await p2.evaluate((k) => localStorage.setItem('cv-helper-key', k), NEW);
    release(); hold = null;
    await p.evaluate(() => window.__info);
    ok(await p.evaluate(() => localStorage.getItem('cv-helper-key')) === NEW, 'a newer key stored by another tab is kept when the old one is refused');

    // Power Off: the key goes with the helper session.
    await p2.evaluate(async () => { await HelperFS.shutdown(); });
    ok(shutdowns === 1 && await p2.evaluate(() => localStorage.getItem('cv-helper-key')) === null, 'Power Off removes the key');
  } finally { await b.close(); }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
