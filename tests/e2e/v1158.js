// v1.158: refreshing the page while the privacy screen is on must not open CaseVault: the screen
// comes back as the vault opens again, and only the PIN opens it. All data is made up (Doe / Roe).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  // A PIN (few rounds: a test), then Hide.
  await p.evaluate(async () => { await Vault.updateSettings({ privacyPin: await CVPrivacy.makePinRecord('2468', 1000) }); });
  await p.click('#btn-privacy'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => CVPrivacy.locked && localStorage.getItem(CVPrivacy.LOCK_KEY) === '1'), 'hidden; the browser keeps only "locked"');

  // Refresh: the vault opens again by itself (its folder is remembered), and the screen with it.
  await p.reload();
  await p.waitForFunction(() => window.CVPrivacy && CVPrivacy.locked, null, { timeout: 15000 }).catch(() => {});
  const after = await p.evaluate(() => {
    const d = document.getElementById('privacy-screen');
    return { locked: CVPrivacy.locked, open: !!(d && d.open), pinBox: !!(d && !d.querySelector('form').hidden) };
  });
  ok(after.locked && after.open && after.pinBox, `after a refresh the screen is back and asks for the PIN: ${JSON.stringify(after)}`);

  // A click, Esc or a wrong PIN don't open it.
  await p.mouse.click(400, 400); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.keyboard.type('1111'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => CVPrivacy.locked && document.getElementById('privacy-screen').open), 'a click, Esc and a wrong PIN leave it locked');

  // The PIN opens it, and the next refresh opens CaseVault as usual.
  await p.focus('#privacy-screen input'); await p.fill('#privacy-screen input', '');
  await p.keyboard.type('2468'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => !CVPrivacy.locked, null, { timeout: 10000 }).catch(() => {});
  ok(await p.evaluate(() => !CVPrivacy.locked && localStorage.getItem(CVPrivacy.LOCK_KEY) === null), 'the PIN opens it and the mark is gone');
  await p.reload();
  await p.waitForSelector('#gate', { state: 'hidden', timeout: 15000 }); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !CVPrivacy.locked), 'a refresh while open stays open');

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
