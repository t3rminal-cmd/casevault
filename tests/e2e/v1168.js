// v1.168: a suspect added to an independent case is filled in from the same person on a Mission's
// case; the Consistency Checker pairs a Buy report with its Surveillance report, checks that their
// inventory numbers match, and (with the AI engine, faked here) compares their narratives.
// All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1168';

const BUY = 'BUY REPORT. On 03/04/2026 at 1:15 PM the UC met Rick Poe in front of 100 Example Street, Example City. '
  + 'Rick Poe arrived in a blue sedan with plate EXA1234. The UC paid $200 for 3.5 grams of cocaine. '
  + 'The narcotics were inventoried under Inventory #12345678 and Inventory #12345679.';
const SURV = 'SURVEILLANCE REPORT. On 03/04/2026 at 1:15 PM surveillance saw the UC meet Rick Poe at 100 Example Street. '
  + 'Rick Poe arrived on foot from the north. The narcotics were inventoried under Inventory #12345687 and Inventory #12345679.';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1400, 1000);
  // The fake AI engine on 127.0.0.1:11434: one model, and an answer naming the arrival.
  const asked = [];
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } }] }) });
    if (/\/api\/chat/.test(r.url())) {
      asked.push(JSON.parse(r.postData() || '{}'));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, message: { content: JSON.stringify({ issues: [
        { buy_quote: 'Rick Poe arrived in a blue sedan with plate EXA1234.', surveillance_quote: 'Rick Poe arrived on foot from the north.', explanation: 'The Buy report has him arrive by car; surveillance has him arrive on foot.', confidence: 'high' },
        { buy_quote: 'Rick Poe left in a red truck.', surveillance_quote: 'Rick Poe arrived on foot from the north.', explanation: 'Made up by the model.', confidence: 'medium' },
      ] }) } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // 1. A suspect on a Mission's case, then the same name on an independent case.
  ids.ind = await p.evaluate(async (ids) => {
    const op = Vault.listOperations()[0];
    await Vault.assignCase(ids.c2, op.id).catch(() => {});
    const m = await Vault.getCase(ids.c2);
    m.suspects = [{ name: 'Rick Poe', dob: '1990-01-02', residence: '100 Example Street, Example City', role: 'Primary', info: { height: '5 ft 10 in', hair: 'Brown' } }];
    await Vault.saveCase(m);
    const c = await Vault.createCase({ number: 'EX-950', subject: 'Sam Roe' });
    return c.id;
  }, ids);
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids.ind);
  await p.waitForSelector('.suspects'); await p.waitForTimeout(600);
  ok(await p.$$eval('#suspect-known option', (o) => o.some((x) => x.value === 'Rick Poe')), 'the Mission\'s suspect is suggested while typing a name');
  await p.evaluate(() => [...document.querySelectorAll('.suspects button')].find((x) => /Add suspect/i.test(x.textContent)).click()); await p.waitForTimeout(300);
  const type = (label, v) => p.evaluate(([l, val]) => { const el = document.querySelector(`input[aria-label="${l}"]`); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [label, v]);
  await type('Suspect 1 name', 'Rick Poe');
  await p.waitForSelector('.suspect-dup:not([hidden]) .suspect-fill', { state: 'attached', timeout: 10000 });
  const btn = await p.textContent('.suspect-fill');
  ok(/Fill In From EX-200/.test(btn), `a Fill In button: ${btn.trim()}`);
  await type('Suspect 1 residence', 'Typed Here');
  await p.evaluate(() => document.querySelector('.suspect-fill').click()); await p.waitForTimeout(800);
  const got = await p.evaluate(() => ({ dob: document.querySelector('input[aria-label="Suspect 1 date of birth"]').value, res: document.querySelector('input[aria-label="Suspect 1 residence"]').value, height: (document.querySelector('[aria-label="Suspect 1 Height"]') || {}).value }));
  ok(/^(1990-01-02|January 0?2, 1990)$/.test(got.dob) && got.height === '5 ft 10 in', `the empty boxes are filled in: ${JSON.stringify(got)}`);
  ok(got.res === 'Typed Here', 'what was already typed stays');
  await p.waitForTimeout(1200);
  const saved = await p.evaluate((i) => window.__readCaseJSON(i, 'case.json'), ids.ind);
  ok(saved.suspects && saved.suspects[0] && saved.suspects[0].dob === '1990-01-02' && saved.suspects[0].info.hair === 'Brown', 'and saved with the case');
  await p.evaluate(() => { const sec = document.querySelector('.suspects'); if (sec.querySelector('.suspect-rows').offsetParent === null) sec.querySelector('.fold-btn').click(); });
  await p.waitForTimeout(400);
  await p.locator('.suspects').screenshot({ path: `${SP}/suspect.png` }).catch(() => {});

  // 2. The Checks tab: a Buy report and its Surveillance report.
  await p.evaluate(async ([id, a, s]) => {
    await Vault.addFile(id, new File([a], 'Buy 1.txt', { type: 'text/plain' }), { keepName: true });
    await Vault.addFile(id, new File([s], 'Surveillance 1.txt', { type: 'text/plain' }), { keepName: true });
  }, [ids.ind, BUY, SURV]);
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/checks`; }, ids.ind);
  await p.waitForSelector('.chk-aliases'); await p.waitForTimeout(1500);
  await p.selectOption('select[aria-label="Document to check"]', '');
  await p.waitForTimeout(800);
  const form = await p.evaluate(() => ({ kinds: [...document.querySelectorAll('.chk-kind')].map((x) => x.textContent), ai: !document.querySelector('.chk-ai input').disabled, line: document.querySelector('.chk-ai').textContent }));
  ok(form.kinds.includes('Buy') && form.kinds.includes('Surveillance'), `the reports are marked Buy and Surveillance: ${JSON.stringify(form.kinds)}`);
  ok(form.ai && /Buy and Surveillance narratives/.test(form.line), `the AI can compare the narratives without an affidavit: ${form.line.trim()}`);
  await p.click('button:has-text("Run check")');
  await p.waitForSelector('.flag-list .flag', { timeout: 30000 }); await p.waitForTimeout(500);
  const res = await p.evaluate(() => ({
    titles: [...document.querySelectorAll('.flag-list .flag .flag-title')].map((x) => x.textContent),
    groups: [...document.querySelectorAll('.flag-group-head')].map((x) => x.firstChild.textContent),
    pairs: (document.querySelector('.chk-pairs') || {}).textContent || '',
  }));
  ok(res.titles.some((t) => /Inventory number mismatch: "12345678" vs "12345687"/.test(t)), 'the inventory number typo is flagged');
  ok(!res.titles.some((t) => /12345679/.test(t)), 'the matching inventory number is not');
  ok(res.titles.some((t) => /Buy and Surveillance narratives differ/.test(t)), `the AI's narrative difference is shown: ${JSON.stringify(res.titles)}`);
  ok(res.titles.filter((t) => /narratives differ/.test(t)).length === 1, 'the made-up quote was dropped');
  ok(res.groups.includes('Inventory Numbers'), `grouped under Inventory Numbers: ${JSON.stringify(res.groups)}`);
  ok(/Buy 1\.txt with Surveillance 1\.txt/.test(res.pairs) && /1 difference found/.test(res.pairs) && /1 answer discarded/.test(res.pairs), `the pair is named: ${res.pairs.replace(/\s+/g, ' ')}`);
  ok(asked.length === 1 && /BUY REPORT \(Buy 1\.txt\)/.test(asked[0].messages[1].content) && /SURVEILLANCE REPORT \(Surveillance 1\.txt\)/.test(asked[0].messages[1].content), 'the AI was given both narratives');
  await p.locator('.result-head').screenshot({ path: `${SP}/result-head.png` }).catch(() => {});
  await p.locator('.flag-list').screenshot({ path: `${SP}/flags.png` }).catch(() => {});
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
