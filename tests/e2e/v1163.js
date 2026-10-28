// v1.163: Options → Dev Tools → Document Anonymizer: the colour-coded preview, a click keeps a
// detail (every mention) or replaces it again, critical ones can't be kept, the style changes the
// result at once. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1163';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(() => { CVOptions.open(window.CaseVaultUI); }); await p.waitForSelector('#dialog[open] .opt-tabs');
  await p.click('#dialog[open] .opt-tabs button:has-text("Dev Tools")'); await p.waitForSelector('.anon-highlight');
  const text = 'Ofc. Maria de la Cruz met Ana Roe-Poe at 1420 NW Oak Street. SSN 123-45-6789. Later, Ana Roe-Poe called 555-201-0142.';
  await p.fill('.dev-src', text); await p.waitForTimeout(600);
  const marks = () => p.$$eval('.anon-highlight mark', (m) => m.map((x) => [x.textContent, x.className]));
  const m1 = await marks();
  const cls = Object.fromEntries(m1);
  ok(m1.length === 6, `six details highlighted: ${JSON.stringify(m1)}`);
  ok(/pii-critical/.test(cls['123-45-6789']) && /pii-high/.test(cls['1420 NW Oak Street.']) && /pii-medium/.test(cls['Maria de la Cruz']), 'critical red, high orange, medium yellow');
  const colors = await p.evaluate(() => [...document.querySelectorAll('.anon-highlight mark')].map((m) => getComputedStyle(m).backgroundColor));
  ok(new Set(colors).size === 3, `three colours: ${JSON.stringify([...new Set(colors)])}`);
  ok((await p.inputValue('.dev-out')).startsWith('Ofc. John Doe met Jane Doe at 100 Main Street'), 'the result updates as you type (Fictitious)');

  // Keep Ana Roe-Poe: both mentions stay; click again to replace.
  await p.click('.anon-highlight mark:has-text("Ana Roe-Poe") >> nth=0'); await p.waitForTimeout(200);
  const kept = await marks();
  ok(kept.filter(([t, c]) => t === 'Ana Roe-Poe' && c === 'pii-skip').length === 2, 'keeping a name keeps every mention');
  const out = await p.inputValue('.dev-out');
  ok((out.match(/Ana Roe-Poe/g) || []).length === 2 && /SSN 000-00-0000/.test(out), `the result keeps it: ${out}`);
  ok(/1 kept|2 kept/.test(await p.textContent('.anon-stats')), `the count says so: ${await p.textContent('.anon-stats')}`);

  // A critical detail can't be kept.
  await p.click('.anon-highlight mark:has-text("123-45-6789")'); await p.waitForTimeout(200);
  ok(/pii-critical/.test(Object.fromEntries(await marks())['123-45-6789']) && !(await p.inputValue('.dev-out')).includes('123-45-6789'), 'a critical detail stays replaced');

  // Styles.
  await p.selectOption('.anon-style', 'placeholder'); await p.waitForTimeout(150);
  ok(await p.inputValue('.dev-out') === 'Ofc. [NAME_1] met Ana Roe-Poe at [ADDRESS_1]. SSN [SSN_1]. Later, Ana Roe-Poe called [PHONE_1].', `placeholder: ${await p.inputValue('.dev-out')}`);
  await p.selectOption('.anon-style', 'blackbar'); await p.waitForTimeout(150);
  ok(/^Ofc\. █+ met Ana Roe-Poe at █+\. SSN █+\./.test(await p.inputValue('.dev-out')), 'black bar');
  await p.selectOption('.anon-style', 'initials'); await p.waitForTimeout(150);
  ok(/^Ofc\. M\. C\. met Ana Roe-Poe at \[ADDRESS_1\]/.test(await p.inputValue('.dev-out')), `initials for names only: ${await p.inputValue('.dev-out')}`);
  await p.click('.anon-highlight mark:has-text("Ana Roe-Poe") >> nth=0'); await p.waitForTimeout(150);
  await p.selectOption('.anon-style', 'redacted'); await p.waitForTimeout(150);
  ok(await p.inputValue('.dev-out') === 'Ofc. REDACTED met REDACTED at REDACTED. SSN REDACTED. Later, REDACTED called REDACTED.', 'REDACTED, and a second click replaces the name again');
  await p.locator('#dialog[open] .dev-card').screenshot({ path: `${SP}/anonymizer.png` }).catch(() => {});

  // Anonymize with a redaction style says the AI pass is for Fictitious only, and Clear empties all.
  await p.click('.dev-actions button:has-text("Anonymize")'); await p.waitForTimeout(300);
  ok(/Fictitious style only/.test(await p.textContent('.dev-report')), 'the AI pass goes with Fictitious only');
  await p.click('.dev-actions button:has-text("Clear")'); await p.waitForTimeout(200);
  ok((await p.$$('.anon-highlight mark')).length === 0 && await p.inputValue('.dev-out') === '', 'Clear empties the preview and the result');

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
