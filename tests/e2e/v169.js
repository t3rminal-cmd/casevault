const boot = require('./boot');
(async () => { const { b, p, ids, errs } = await boot();
  // footer on every page
  const foot = async () => p.evaluate(() => { const f = document.querySelector('#ql-footer'); return f && !f.hidden && f.childElementCount > 0; });
  const seen = [];
  for (const h of ['#/', `#/case/${ids.c}/details`, `#/case/${ids.c}/draft`, '#/reference/ucr', '#/operations', `#/operation/${ids.op}`]) { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(700); seen.push(await foot()); }
  console.log('footer everywhere', seen.join(','));
  // month prediction in a date box (Details: Opened; Closed is read-only since v1.85)
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c); await p.waitForTimeout(1000);
  const dt = p.locator(".field:has-text(\"Opened\") .date-text").first();
  await dt.click(); await p.keyboard.type('sep'); await p.waitForTimeout(100);
  console.log('predicted', await dt.evaluate((e) => [e.value, e.selectionStart, e.selectionEnd]));
  await p.keyboard.press('Tab'); await p.keyboard.type('30'); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
  console.log('completed', await dt.inputValue());
  // suspect with hair style + moniker + IR, then Add From Suspects on Draft
  await p.evaluate(() => document.querySelectorAll('.fold-btn[aria-expanded="false"]').forEach((x) => x.click()));
  await p.click('button:has-text("Add Suspect")'); await p.waitForTimeout(300);
  await p.fill('.suspect-name-field input:not([type=checkbox])', 'John Doe');
  await p.fill('input[aria-label="Suspect 1 Hair Style"]', 'Dreadlocks');
  await p.fill('input[aria-label="Suspect 1 Moniker / Social Media"]', 'JD Smooth');
  await p.fill('input[aria-label="Suspect 1 IR Number"]', '1234567');
  await p.waitForTimeout(1500);
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, ids.c); await p.waitForTimeout(1300);
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((b) => b.click())); await p.waitForTimeout(300);
  await p.click('button:has-text("Add From Suspects")').catch((e) => console.log('no add-from', e.message.slice(0, 60))); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll('dialog[open] button').forEach((b) => { if (/add|copy/i.test(b.textContent) && !/cancel/i.test(b.textContent)) b.click(); })); await p.waitForTimeout(800);
  console.log('offender', await p.evaluate(async (i) => { await new Promise((r) => setTimeout(r, 1500)); const d = await Vault.readCaseJSON(i, 'report-fields.json'); const o = (d.offendersList || [])[0] || {}; return JSON.stringify({ name: o.name, hairStyle: o.hairStyle, ir: o.irNumber, socials: o.socials }); }, ids.c));
  console.log('offender labels', await p.evaluate(() => [...document.querySelectorAll('.rf-items .field > span')].map((s) => s.textContent.trim()).filter((t) => /Hair Style|IR Number|IDOC|FBI/.test(t)).slice(0, 6).join(',')));
  // DNA on Arrest Unit / Residence, Pending court
  const combos = await p.evaluate(() => ['Arrest Unit', 'If Residence, Where'].map((l) => { const f = [...document.querySelectorAll('.rf-section .field')].find((x) => x.textContent.trim().startsWith(l)); return f ? !!f.querySelector('.combo, .combo-toggle') : 'missing'; }));
  console.log('DNA combos', combos);
  await p.check('.rf-pending input'); await p.waitForTimeout(500);
  console.log('court pending', await p.evaluate(async (i) => { await new Promise((r) => setTimeout(r, 1500)); return (await Vault.readCaseJSON(i, 'report-fields.json')).courtDate; }, ids.c));
  console.log('adderall', await p.evaluate(() => CVReportFields.DRUG_TYPES.includes('Adderall')));
  console.log('switch widths', await p.evaluate(() => [...document.querySelectorAll('select.rf-switch')].map((s) => `${s.offsetWidth}/${s.scrollWidth}`).join(' ')));
  console.log('pdf court line', await p.evaluate(async (i) => { const d = CVReportFields.normalize(await Vault.readCaseJSON(i, 'report-fields.json')); return CVReportFields.toMarkdown(d).split('\n').filter((l) => /Court/.test(l)).join(' | '); }, ids.c));
  console.log('errors', errs); await b.close(); })();
