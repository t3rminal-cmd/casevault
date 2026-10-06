const { chromium } = require('playwright');
const SP = process.env.SP + '/v167'; const W = +(process.env.W || 1366);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('app: ' + e.stack.slice(0, 300)));
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('S' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  const ids = await p.evaluate(async () => {
    const day = (yearsAgo, days) => { const d = new Date(); d.setFullYear(d.getFullYear() - yearsAgo); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
    const mk = async (n, s, date, charge) => { const c = await Vault.createCase({ number: n, subject: s }); await Vault.writeCaseJSON(c.id, 'report-fields.json', { date, charges: charge ? [{ statute: charge, description: '' }] : [] }); return c.id; };
    return {
      warn: await mk('EX-100', 'John Doe', day(3, 4), '720 ILCS 570/401(c)(2)'),
      expired: await mk('EX-200', 'Jane Roe', day(3, -2), '21 U.S.C. § 841(a)(1)'),
      far: await mk('EX-300', 'Rick Poe', day(1, 0), '720 ILCS 570/402(c)'),
      notNarc: await mk('EX-400', 'John Roe', day(3, 2), '720 ILCS 5/24-1'),
    };
  });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(1500);
  const att = await p.evaluate(() => [...document.querySelectorAll('.attention-row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
  console.log('attention', JSON.stringify(att, null, 1));
  console.log('sol index', JSON.stringify(await p.evaluate(() => Vault.data.cases.map((c) => [c.number, c.sol && c.sol.expires]))));
  console.log('toasts', await p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.innerText)));
  console.log('reminder borders', await p.evaluate(() => [...document.querySelectorAll('#case-list .case-item.has-reminder strong, #case-list .case-item.has-reminder')].length));
  await p.screenshot({ path: `${SP}/${W}-home.png` });
  // footer height same on every tab
  const hts = [];
  for (const t of ['Reference', 'OSINT', 'LEO', 'Reference']) { await p.click(`#ql-footer .ql-tabs button:has-text("${t}")`); await p.waitForTimeout(250); hts.push(await p.evaluate(() => Math.round(document.querySelector('#ql-footer').getBoundingClientRect().height))); }
  console.log('footer heights', hts.join(','));
  // hero gap
  console.log('hero gap', await p.evaluate(() => Math.round(document.querySelector('.hero-counts').getBoundingClientRect().top - document.querySelector('.hero-line').getBoundingClientRect().bottom)));
  // Not Identified
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.far); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelectorAll('.fold-btn').forEach((b) => { if (b.getAttribute('aria-expanded') === 'false') b.click(); }));
  await p.click('button:has-text("Add Suspect")'); await p.waitForTimeout(300);
  await p.check('.suspect-notid input'); await p.waitForTimeout(800);
  console.log('name disabled', await p.evaluate(() => document.querySelector('.suspect-name-field input').disabled));
  await p.locator('.suspects').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SP}/${W}-suspect.png` });
  // Draft: check marks, warrant line
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, ids.far); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((b) => b.click())); await p.waitForTimeout(300);
  await p.evaluate(() => { const s = document.querySelector('.rf-numbers'); for (const el of s.querySelectorAll('input:not([type=checkbox]), textarea')) { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); } for (const el of s.querySelectorAll('select')) { el.selectedIndex = 1; el.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.waitForTimeout(400);
  console.log('complete parts', await p.evaluate(() => [...document.querySelectorAll('.rf-section.rf-complete h3')].map((x) => x.innerText)));
  await p.locator('.rf-report').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SP}/${W}-report.png` });
  console.log('clipped in report', await p.evaluate(() => [...document.querySelectorAll('.rf-report .field, .rf-report label, .rf-report span')].filter((e) => e.offsetWidth && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.className + ':' + e.innerText.slice(0, 30)).slice(0, 8)));
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="true"]').forEach((b) => b.click())); await p.waitForTimeout(200);
  await p.screenshot({ path: `${SP}/${W}-folded.png` });
  // archive with folder
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.expired); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelectorAll('.fold-btn').forEach((b) => { if (b.getAttribute('aria-expanded') === 'false') b.click(); }));
  await p.click('button:has-text("Archive Case")'); await p.waitForTimeout(400);
  console.log('preselected', await p.evaluate(() => (document.querySelector('.arch-pick input:checked') || {}).value));
  await p.screenshot({ path: `${SP}/${W}-archive.png` });
  await p.click('.dialog button:has-text("Archive Case")'); await p.waitForTimeout(2500);
  await p.evaluate(() => { const s = document.querySelector('#archived-cases'); if (s) s.open = true; }); await p.waitForTimeout(300);
  console.log('arch subs', await p.evaluate(() => [...document.querySelectorAll('.arch-sub-head')].map((x) => x.innerText.replace(/\s+/g, ' '))));
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.expired); await p.waitForTimeout(900);
  await p.selectOption('.arch-folder-pick select', 'nolle'); await p.waitForTimeout(800);
  console.log('after move', await p.evaluate(() => [...document.querySelectorAll('.arch-sub-head')].map((x) => x.innerText.replace(/\s+/g, ' '))), await p.evaluate(() => Vault.data.cases.find((c) => c.number === 'EX-200').archiveFolder));
  await p.screenshot({ path: `${SP}/${W}-archived.png` });
  console.log('null text on page', await p.evaluate(() => /(^|\s)null(\s|$)/.test(document.querySelector('#main').innerText)));
  console.log('errs', errs); await b.close();
})();
