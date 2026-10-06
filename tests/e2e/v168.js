const { chromium } = require('playwright');
const SP = process.env.SP + '/v168'; const W = +(process.env.W || 1366);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('app: ' + e.stack.slice(0, 300)));
  await p.addInitScript(() => { window.__pick = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('S' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { window.showDirectoryPicker = window.__pick; });
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  const ids = await p.evaluate(async () => {
    const c = await Vault.createCase({ number: 'EX-100', subject: 'John Doe' });
    const op = await Vault.createOperation({ name: 'Example Op', number: 'OP-1' });
    return { c: c.id, op: op.id };
  });
  // synthetic screenshots (portrait PNGs drawn in the page)
  const shot = async (txt) => p.evaluate(async (t) => { const cv = Object.assign(document.createElement('canvas'), { width: 360, height: 720 }); const g = cv.getContext('2d'); g.fillStyle = '#eef'; g.fillRect(0, 0, 360, 720); g.fillStyle = '#2a7'; g.fillRect(20, 100, 250, 60); g.fillStyle = '#000'; g.font = '28px sans-serif'; g.fillText(t, 30, 140); const bl = await new Promise((r) => cv.toBlob(r, 'image/png')); return [...new Uint8Array(await bl.arrayBuffer())]; }, txt);
  // header power button
  console.log('power btn', await p.evaluate(() => { const b = document.querySelector('#btn-power'); const s = document.querySelector('#save-status'); return b && { ci: !!b.querySelector('svg.ci'), after: s.nextElementSibling === b, w: b.offsetWidth }; }));
  await p.click('#btn-power'); await p.waitForTimeout(400); console.log('power dialog', await p.evaluate(() => document.querySelector('dialog[open]').innerText.replace(/\s+/g, ' ').slice(0, 200)));
  await p.screenshot({ path: `${SP}/${W}-power.png` }); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // OTHER FILES + caps headings
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(1000);
  console.log('caps', await p.evaluate(() => [...document.querySelectorAll('.section-title.caps')].map((x) => x.innerText.trim())));
  await p.locator('.other-files-section .shared-tile', { hasText: 'Other' }).first().click(); await p.waitForTimeout(400);
  const fileIn = p.locator('.other-files-section input[type=file]').first();
  await fileIn.setInputFiles({ name: 'notes-sample.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic test file') }); await p.waitForTimeout(1200);
  console.log('other rows', await p.evaluate(() => [...document.querySelectorAll('.other-files-section tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' '))));
  await p.locator('.other-files-section').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SP}/${W}-other.png` });
  // Operation folder
  await p.evaluate((i) => { location.hash = `#/operation/${i}`; }, ids.op); await p.waitForTimeout(1200);
  console.log('op folders', await p.evaluate(() => [...document.querySelectorAll('#op-folder ~ .shared-files .shared-tile')].map((x) => x.innerText.trim())));
  await p.locator('#op-folder ~ .shared-files .shared-tile', { hasText: 'Maps' }).click(); await p.waitForTimeout(400);
  await p.locator('#op-folder ~ .shared-files input[type=file]').first().setInputFiles({ name: 'map-sample.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic') }); await p.waitForTimeout(1200);
  console.log('op rows', await p.evaluate(() => [...document.querySelectorAll('#op-folder ~ .shared-files tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' '))));
  await p.locator('#op-folder ~ .shared-files').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SP}/${W}-opfolder.png` });
  // Files Updated column
  await p.evaluate((i) => { location.hash = `#/case/${i}/files`; }, ids.c); await p.waitForTimeout(1000);
  console.log('files th', await p.evaluate(() => [...document.querySelectorAll('#main th')].map((x) => x.innerText.trim()).filter(Boolean).slice(0, 8)));
  // Draft: How Cleared, additional exhibits
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, ids.c); await p.waitForTimeout(1300);
  console.log('on going', await p.evaluate(() => [...document.querySelectorAll('select option')].some((o) => o.textContent.includes('On Going'))));
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((b) => b.click())); await p.waitForTimeout(300);
  await p.click('button:has-text("Add Additional Exhibit")'); await p.waitForTimeout(300);
  await p.selectOption('.rf-extra-card select', 'texts'); await p.waitForTimeout(300);
  await p.fill('.rf-extra-card input[aria-label$="title"]', 'UC and Target');
  const bytes1 = await shot('Hey 1'); const bytes2 = await shot('Hey 2'); const bytes3 = await shot('Hey 3');
  await p.locator('.rf-extra-card input[type=file]').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(bytes1) }, { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(bytes2) }, { name: 'c.png', mimeType: 'image/png', buffer: Buffer.from(bytes3) }]);
  await p.waitForTimeout(2000);
  console.log('tags', await p.evaluate(() => [...document.querySelectorAll('.rf-extra-card .rf-photo-tag')].map((x) => x.innerText)));
  await p.click('button:has-text("Add Additional Exhibit")'); await p.waitForTimeout(300);
  console.log('numbers', await p.evaluate(() => [...document.querySelectorAll('.rf-extra-card .rf-exhibit')].map((x) => x.innerText)));
  await p.locator('.rf-extras').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SP}/${W}-extras.png` });
  p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
  await p.evaluate(() => window.addEventListener('unhandledrejection', (e) => console.error('UNH', e.reason && e.reason.stack)));
  console.log('texts fn', await p.evaluate(() => typeof CVReportPdf.textsReport));
  await p.click('button:has-text("Text Message PDF")');
  for (let k = 0; k < 8; k++) { await p.waitForTimeout(1000); const st = await p.evaluate(() => [!!document.querySelector('dialog[open]'), document.querySelector('#save-status').innerText]); console.log('t', k, st); if (st[0]) break; }
  await p.waitForTimeout(4000);
  console.log('pdf pages', await p.evaluate(() => document.querySelectorAll('dialog[open] canvas').length));
  await p.screenshot({ path: `${SP}/${W}-textpdf.png` });
  const pdfB64 = await p.evaluate(async (i) => { const f = await Vault.readFile(i, 'Other Exhibits/2026-EX-100-Additional Exhibit 1 - Text Messages.pdf'); const u = new Uint8Array(await f.arrayBuffer()); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); }, ids.c);
  require('fs').writeFileSync(`${SP}/texts.pdf`, Buffer.from(pdfB64, 'base64'));
  console.log('saved', await p.evaluate(async (i) => (await Vault.listFiles(i)).map((f) => f.path || f.name).filter((n) => /Additional/.test(n)), ids.c).catch((e) => e.message));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  // check column alignment
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="true"]').forEach((b) => b.click())); await p.waitForTimeout(300);
  console.log('done/fold x', await p.evaluate(() => [...document.querySelectorAll('.rf-section')].slice(0, 12).map((s) => { const d = s.querySelector('.rf-done'); const f = s.querySelector('.rf-fold'); return d && f ? `${Math.round(d.getBoundingClientRect().left)}/${Math.round(f.getBoundingClientRect().left)}` : '-'; }).join(' ')));
  await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${SP}/${W}-folded.png`, fullPage: false });
  // street value chart
  await p.evaluate(() => { location.hash = '#/reference/narcotics'; }); await p.waitForTimeout(1000);
  console.log('chart icons', await p.evaluate(() => [...document.querySelectorAll('.value-group-head')].map((x) => x.querySelector('svg.ci') ? 'ci' : 'mono').join(',')));
  await p.screenshot({ path: `${SP}/${W}-chart.png` });
  console.log('errors', errs);
  await b.close();
})();
