const { chromium } = require('playwright');
const SP = process.env.SP;
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); await require("./openall.js")(p); const errs = [];
  p.on('pageerror', (e) => errs.push(e.stack.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('V36' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/'); await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.click('.quick-actions button:has-text("New Case")'); await (async (T) => { await p.fill('input[name=subject]', T); await p.evaluate(async (t) => { let op = Vault.listOperations().find((o) => o.name === t); if (!op) op = await Vault.createOperation({ number: 'OP-' + String(Vault.listOperations().length + 1).padStart(3, '0'), name: t }); const s = document.querySelector('select[name=operationId]'); if (![...s.options].some((o) => o.value === op.id)) s.add(new Option(op.number + ' - ' + op.name, op.id)); s.value = op.id; s.dispatchEvent(new Event('change')); }, T); })('Alpha Op'); await p.fill('input[name=number]', 'JH100001'); await p.click('text=Create case'); for (let i = 0; i < 4; i++) { await p.waitForTimeout(150); if (await p.isVisible('.subject-warn')) await p.click('.subject-warn .btn.primary'); else break; } await p.waitForSelector('#case-title'); await p.waitForTimeout(300);
  const id = await p.evaluate(() => Vault.data.cases[0].id);
  await p.evaluate(async (id) => { const c = await Vault.getCase(id); c.suspects = [{ name: 'John Example', dob: '1988-09-30', residence: '', role: 'Main', info: { race: 'American Indian / Alaska Native', complexion: 'Medium Brown' } }]; await Vault.saveCase(c); }, id).catch(e => console.log('save err', e.message));
  await p.evaluate((id) => { location.hash = `#/case/${id}/timeline`; }, id); await p.waitForTimeout(300);
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, id); await p.waitForSelector('.partner-badge'); await p.waitForTimeout(500);
  await p.click('button:has-text("Add suspect")'); await p.waitForTimeout(200);
  await p.fill('.suspect-row input:not([type=checkbox]) >> nth=0', 'John Example');
  const dt = p.locator('.suspect-row .date-text').first(); await dt.fill('09/30/1988'); await dt.press('Tab'); await p.waitForTimeout(300);
  await p.selectOption('.suspect-demo select[aria-label$="Race"]', 'American Indian / Alaska Native');
  await p.selectOption('.suspect-demo select[aria-label$="Complexion"]', 'Medium Brown'); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => {
    const out = [];
    const cv = document.createElement('canvas').getContext('2d');
    for (const el of document.querySelectorAll('.suspect-card select, .suspect-card .date-text, .suspect-card input')) {
      const cs = getComputedStyle(el); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const text = el.tagName === 'SELECT' ? el.selectedOptions[0]?.text || '' : el.value;
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (cv.measureText(text).width > avail + 1) out.push([el.getAttribute('aria-label') || el.className, text, Math.round(cv.measureText(text).width), Math.round(avail)]);
    }
    return out;
  });
  console.log('role:', await p.$eval('.suspect-row select', (e) => e.value), '| clipped:', JSON.stringify(clip));
  await p.locator('.suspects').screenshot({ path: `${SP}/v136-suspects.png` });
  await p.click('.partner-badge:has-text("DEA")'); await p.waitForTimeout(300);
  console.log('opacity on/off:', await p.$$eval('.partner-badge', (x) => x.slice(0, 3).map((e) => getComputedStyle(e).opacity)));
  await p.locator('.partners').screenshot({ path: `${SP}/v136-partners.png` });
  console.log('placeholders:', await p.$$eval('.suspect-demo input', (x) => x.map((e) => e.placeholder).filter(Boolean)));
  // draft offenders race
  await p.evaluate(async (id) => { const d = await CVReportFieldsUI.load({ id }); d.offendersList = [{ name: 'X Example', race: 'American Indian / Alaska Native', complexion: 'Medium Brown', gender: 'Male' }]; d.victimsList = [{ name: 'State of Illinois' }]; await Vault.writeCaseJSON(id, 'report-fields.json', d); }, id);
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, id); await p.waitForSelector('.rf-actions'); await p.waitForTimeout(700);
  const clip2 = await p.evaluate(() => { const out = []; const cv = document.createElement('canvas').getContext('2d');
    for (const el of document.querySelectorAll('.rf-section select')) { const cs = getComputedStyle(el); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const t = el.selectedOptions[0]?.text || ''; const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (el.offsetParent && cv.measureText(t).width > avail + 1) out.push([el.getAttribute('aria-label') || el.closest('.field')?.firstChild?.textContent, t, Math.round(cv.measureText(t).width), Math.round(avail)]); } return out; });
  console.log('draft clipped selects:', JSON.stringify(clip2));
  const off = p.locator('.rf-list-offendersList').first(); await off.scrollIntoViewIfNeeded(); await off.screenshot({ path: `${SP}/v136-offenders.png` });
  const ucr = p.locator('.combo').first(); await ucr.scrollIntoViewIfNeeded(); await p.locator('.rf-section', { hasText: 'Offense' }).first().screenshot({ path: `${SP}/v136-offense.png` });
  console.log('errors:', errs);
  await b.close();
})();
