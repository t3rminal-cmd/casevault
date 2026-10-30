// v1.178: in direct mode (Chrome/Edge), the saved vault folder is only used after the browser says
// the page may already read and write it (queryPermission); asking for permission
// (requestPermission) only ever happens from a click on Reconnect. Checked in a second tab of the
// same browser profile, with the browser's answers stood in for. Made-up data only.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1200, 800);
  const p2 = await p.context().newPage();
  await p2.addInitScript(() => {
    window.__perm = { query: [], request: [] };
    const proto = (window.FileSystemHandle || {}).prototype;
    if (!proto) return;
    proto.queryPermission = async function (opts) { window.__perm.query.push(opts && opts.mode); return 'prompt'; };
    proto.requestPermission = async function (opts) {
      window.__perm.request.push({ mode: opts && opts.mode, clicked: !!(navigator.userActivation && navigator.userActivation.isActive) });
      return 'granted';
    };
  });
  await p2.goto('http://localhost:8765/');
  await p2.waitForSelector('#gate:not([hidden])', { timeout: 15000 });
  await p2.waitForTimeout(800);
  const start = await p2.evaluate(() => ({ perm: window.__perm, gate: document.querySelector('#gate').innerText, connected: !!(window.Vault && Vault.data) }));
  ok(start.perm.query.includes('readwrite') && start.perm.request.length === 0, `at start it only asks whether it may (queryPermission readwrite), never prompts: ${JSON.stringify(start.perm)}`);
  ok(!start.connected && /Reconnect/i.test(start.gate), 'without permission the vault stays closed and Reconnect is offered');
  await p2.click('#gate button:has-text("Reconnect")');
  await p2.waitForSelector('#gate', { state: 'hidden', timeout: 15000 }).catch(() => {});
  const after = await p2.evaluate(() => ({ perm: window.__perm, connected: !!(Vault.data && Vault.data.vaultId) }));
  ok(after.perm.request.length === 1 && after.perm.request[0].mode === 'readwrite' && after.perm.request[0].clicked, `permission is asked for once, from the click: ${JSON.stringify(after.perm.request)}`);
  ok(after.connected, 'and the vault opens once it is granted');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
