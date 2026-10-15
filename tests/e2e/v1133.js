// v1.133: Arrest Report → Phone Calls (name called, relationship, number; or Refused phone call) on
// the form and the PDF, and the charge 720 ILCS 550/4(b). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1133';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.arrest = true; await Vault.saveCase(c); }, ids.c);
  await p.evaluate((i) => { location.hash = `#/case/${i}/arrest`; }, ids.c); await p.waitForSelector('.arrest-toolbar');
  await p.click('.arrest-toolbar button:has-text("Show All")'); await p.waitForTimeout(200);

  // The Phone Calls part: Refused phone call, the list, + Add Phone Call.
  const sec = p.locator('.arrest-section', { hasText: 'Phone Calls' }).first();
  ok(await sec.locator('label.arrest-none', { hasText: 'Refused phone call' }).count() === 1, 'a Refused phone call box');
  await sec.locator('button:has-text("+ Add Phone Call")').click(); await p.waitForTimeout(150);
  const labels = await sec.locator('.arrest-item .field > span').allTextContents();
  ok(labels.map((x) => x.trim()).join('|') === 'Name (called who)|Relationship|Phone number called', `the fields: ${labels.join(' | ')}`);
  const inputs = sec.locator('.arrest-item input');
  await inputs.nth(0).fill('Jane Doe'); await inputs.nth(1).fill('Mother'); await inputs.nth(2).fill('3125550100');
  const fit = await sec.locator('.arrest-item').evaluate((it) => { const r = [...it.querySelectorAll('.field')].map((f) => f.getBoundingClientRect().top); return new Set(r.map(Math.round)).size === 1; });
  ok(fit, 'the three fields sit on one row');
  await sec.screenshot({ path: `${SP}/calls.png` });
  await p.locator('.arrest-toolbar').getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(800);
  const saved = await p.evaluate(async (id) => (await window.__readCaseJSON(id, 'arrest.json')).arrestees[0], ids.c);
  ok(saved.phoneCalls.length === 1 && saved.phoneCalls[0].name === 'Jane Doe' && saved.phoneCalls[0].relationship === 'Mother' && /555/.test(saved.phoneCalls[0].phone) && saved.refusedCall === false, `saved: ${JSON.stringify(saved.phoneCalls)}`);
  const pdfOf = (a) => p.evaluate(async (x) => { const out = CVArrestPdf.build({ arrestees: [x] }, {}); return [...out].map((c) => String.fromCharCode(c)).join(''); }, a);
  const pdf = await pdfOf(saved);
  ok(['Called Who', 'Relationship', 'Phone Number Called', 'Jane Doe', 'Mother', '555'].every((w) => pdf.includes(w)) && !pdf.includes('REFUSED'), 'the PDF lists the call under its headings');

  // Refused: the list hides, the PDF says so.
  await sec.locator('label.arrest-none', { hasText: 'Refused phone call' }).locator('input').check(); await p.waitForTimeout(100);
  ok(await sec.locator('.arrest-none-body').evaluate((e) => e.hidden), 'ticking Refused phone call hides the list');
  await p.locator('.arrest-toolbar').getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(800);
  const refused = await p.evaluate(async (id) => (await window.__readCaseJSON(id, 'arrest.json')).arrestees[0], ids.c);
  ok(refused.refusedCall === true, 'Refused phone call is saved');
  const pdf2 = await pdfOf(refused);
  ok(pdf2.includes('ARRESTEE REFUSED PHONE CALL') && !pdf2.includes('Jane Doe'), 'the PDF says the arrestee refused a phone call');

  // The new charge in the charge suggestions, with its class.
  const charge = p.locator('.charges-table input').first();
  await charge.click(); await charge.fill('550/4(b)'); await p.waitForTimeout(300);
  const opts = await p.$$eval('.combo-list:not([hidden]) .combo-opt', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')));
  ok(opts.some((o) => /720 ILCS 550\/4\(b\)/.test(o) && /10 to 30 grams, first offense/.test(o)), `550/4(b) is offered: ${opts.slice(0, 3).join(' | ')}`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
