// v1.178 (helper 1.17): when the helper says the running Ollama is not the SSD's (an installed one
// that logs to this PC), the AI stays off until it is allowed for this session; the header says so
// and rules-only checks still run. The helper's answer is stood in for here (Engine.source); the
// helper itself is tested in v1178-helper-ai.js. Made-up data only.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1178';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1440, 900);
  const asked = [];
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const u = route.request().url(); asked.push(u.replace(/^.*\/api\//, ''));
    if (/\/api\/tags$/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'example:7b', size: 4.7e9, details: {} }] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) });
  });
  await p.evaluate(async () => { sessionStorage.removeItem('cv-ai-installed-ok'); CVChecks.Engine.source = async () => 'external'; await CVChecks.Engine.refresh(); });
  const st = await p.evaluate(() => ({ status: CVChecks.Engine.status(), choice: CVChecks.Engine.choice(), base: CVChecks.Engine.detected.base, pill: document.getElementById('engine-status').getAttribute('aria-label'), cls: document.getElementById('engine-status').className }));
  ok(st.status === 'blocked' && !st.choice && !st.base, `an installed Ollama: the AI is off (${st.status}), no model or address is offered`);
  ok(/installed Ollama \(logs on this PC\)/.test(st.pill) && /blocked/.test(st.cls), `the header says so: ${st.pill}`);
  await p.locator('.tb-status').screenshot({ path: `${SP}/pill.png` }).catch(() => {});

  // Rules-only checking still works.
  const rules = await p.evaluate(async (id) => {
    const c = await Vault.getCase(id);
    await Vault.addFile(id, new File(['On 03/04/2026 the UC bought 3.5 grams of cocaine from John Doe for $200.'], 'Buy Report.txt', { type: 'text/plain' }), { keepName: true });
    await Vault.addFile(id, new File(['On 03/05/2026 the UC bought 3.5 grams of cocaine from John Doe for $250.'], 'Surveillance Report.txt', { type: 'text/plain' }), { keepName: true });
    return CVChecks.checkMission ? 'ok' : 'none';
  }, ids.c);
  await p.evaluate(async () => { CVChecks.checkMission([Vault.data.cases[0]]); });
  await p.waitForSelector('#dialog[open] .mission-check-table', { timeout: 30000 }).catch(() => {});
  ok(rules === 'ok' && await p.locator('#dialog[open] .mission-check-table').count() === 1, 'rules-only checks still run');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // The engine dialog explains, and allows it for this session only.
  await p.click('#engine-status');
  await p.waitForSelector('#dialog[open] .engine-installed');
  ok(/%LOCALAPPDATA%\\Ollama/.test(await p.textContent('#dialog[open] .engine-installed')), 'the dialog says where its logs go');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/dialog.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Allow It for This Session")');
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => ({ status: CVChecks.Engine.status(), kept: sessionStorage.getItem('cv-ai-installed-ok') }));
  ok(after.status === 'connected' && after.kept === '1', `allowed: the AI is used for this session (${after.status})`);
  await p.keyboard.press('Escape');

  // The SSD's own engine: nothing to allow.
  await p.evaluate(async () => { sessionStorage.removeItem('cv-ai-installed-ok'); CVChecks.Engine.source = async () => 'ssd'; await CVChecks.Engine.refresh(); });
  ok(await p.evaluate(() => CVChecks.Engine.status()) === 'connected', 'the SSD\'s Ollama is used without asking');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
