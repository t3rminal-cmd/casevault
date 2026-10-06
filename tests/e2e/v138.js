const { chromium } = require('playwright');
const SP = process.env.SP;
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); await require("./openall.js")(p); const errs = [];
  p.on('pageerror', (e) => errs.push(e.stack.slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('V38' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/'); await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.click('.quick-actions button:has-text("New Case")'); await (async (T) => { await p.fill('input[name=subject]', T); await p.evaluate(async (t) => { let op = Vault.listOperations().find((o) => o.name === t); if (!op) op = await Vault.createOperation({ number: 'OP-' + String(Vault.listOperations().length + 1).padStart(3, '0'), name: t }); const s = document.querySelector('select[name=operationId]'); if (![...s.options].some((o) => o.value === op.id)) s.add(new Option(op.number + ' - ' + op.name, op.id)); s.value = op.id; s.dispatchEvent(new Event('change')); }, T); })('Alpha Op'); await p.fill('input[name=fileNumber]', '189-100'); await p.fill('input[name=number]', 'JH100001'); await p.click('text=Create case'); for (let i = 0; i < 4; i++) { await p.waitForTimeout(150); if (await p.isVisible('.subject-warn')) await p.click('.subject-warn .btn.primary'); else break; } await p.waitForSelector('#case-title'); await p.waitForTimeout(300);
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.hero');
  await p.click('.quick-actions button:has-text("New Case")'); await p.waitForTimeout(300);
  console.log('labels:', await p.$$eval('.dialog .field > span', (x) => x.map((e) => e.textContent.trim()).slice(0, 4)));
  console.log('file input in combo:', await p.$eval('input[name=fileNumber]', (e) => [!!e.closest('.combo'), e.getAttribute('list'), e.getAttribute('autocomplete')]));
  console.log('autocomplete on all:', await p.$$eval('.dialog input', (x) => x.filter((e) => !['date', 'checkbox', 'hidden'].includes(e.type)).map((e) => e.name + ':' + e.getAttribute('autocomplete'))));
  await p.click('input[name=fileNumber]'); await p.keyboard.type('18'); await p.waitForTimeout(300);
  console.log('combo list:', await p.$$eval('.combo-list:not([hidden]) .combo-opt', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' '))));
  await p.screenshot({ path: `${SP}/v138-file.png` });
  console.log('list radius:', await p.$eval('.combo-list:not([hidden])', (e) => getComputedStyle(e).borderRadius));
  await p.click('.combo-list:not([hidden]) .combo-opt'); console.log('picked:', await p.inputValue('input[name=fileNumber]'));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // landing folder close
  await p.click('.op-folder-tile'); await p.waitForTimeout(400);
  console.log('open after click:', await p.$$eval('.op-folder-tile.open', (x) => x.length), await p.$$eval('.op-open', (x) => x.length));
  await p.click('.op-open-head strong'); await p.waitForTimeout(300);
  console.log('still open after clicking inside:', await p.$$eval('.op-folder-tile.open', (x) => x.length));
  const box = await p.$eval('#main', (e) => { const r = e.getBoundingClientRect(); return [r.right - 30, r.bottom - 40]; });
  await p.mouse.click(1340, 400); await p.waitForTimeout(400);
  console.log('after empty click:', await p.$$eval('.op-folder-tile.open', (x) => x.length), await p.$$eval('.op-open', (x) => x.length));
  // suspect hair combo + contact role combo
  const id = await p.evaluate(() => Vault.data.cases[0].id);
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, id); await p.waitForSelector('.partner-badge');
  await p.click('button:has-text("Add suspect")'); await p.waitForTimeout(200);
  console.log('hair in combo:', await p.$eval('.suspect-demo input[aria-label$="Hair Color"]', (e) => !!e.closest('.combo')));
  await p.click('.suspect-demo input[aria-label$="Hair Color"]'); await p.keyboard.type('Bro'); await p.waitForTimeout(200);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  console.log('hair saved:', JSON.stringify((await p.evaluate((id) => Vault.getCase(id), id)).suspects[0].info));
  console.log('role inputs in combo:', await p.$$eval('input[list], .contacts input[aria-label$="role"]', (x) => x.map((e) => !!e.closest('.combo'))));
  console.log('errors:', errs);
  await b.close();
})();
