const { chromium } = require('playwright');
const SP = process.env.SP;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: process.env.SCHEME || 'light' })).newPage(); await require("./openall.js")(p); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('cv.editMode', 'markdown'); } catch {} window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('FL' + Date.now(), { create: true }); });
  await p.goto('http://localhost:8765/');
  await p.click('text=Choose folder…'); await p.click('text=Create vault here'); await p.waitForSelector('#gate', { state: 'hidden' });
  await p.evaluate(() => document.getElementById('btn-new-case').click()); await (async (T) => { await p.fill('input[name=subject]', T); await p.evaluate(async (t) => { let op = Vault.listOperations().find((o) => o.name === t); if (!op) op = await Vault.createOperation({ number: 'OP-' + String(Vault.listOperations().length + 1).padStart(3, '0'), name: t }); const s = document.querySelector('select[name=operationId]'); if (![...s.options].some((o) => o.value === op.id)) s.add(new Option(op.number + ' - ' + op.name, op.id)); s.value = op.id; s.dispatchEvent(new Event('change')); }, T); })('Files test'); await p.fill('input[name=number]', '00321'); await p.click('text=Create case'); for (let i = 0; i < 4; i++) { await p.waitForTimeout(150); if (await p.isVisible('.subject-warn')) await p.click('.subject-warn .btn.primary'); else break; }
  await p.waitForFunction(() => document.querySelector('#case-subject')?.textContent === 'TEST, Files');
  await p.click('.tab:has-text("Files")'); await p.waitForSelector('.folder-nav');
  console.log('folders:', await p.$$eval('.folder-nav .folder-item', (x) => x.map((e) => (e.classList.contains('child') ? '  ' : '') + e.querySelector('.folder-name').textContent)).then((a) => a.join(' | ')));
  const mk = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
  await p.setInputFiles('.files-main input[type=file]', [mk('bodycam footage.mp4', 'v'), mk('jail call.mp3', 'a'), mk('Search warrant signed.pdf', 'w'), mk('A really long file name that goes on and on and on for testing the ellipsis in the table column.pdf', 'x'.repeat(5000)), mk('notes.docx', 'd')]);
  await p.click('#dialog[open] button:has-text("Save to SSD")');
  await p.waitForSelector('.files-table-wrap tbody tr');
  console.log('rows:', await p.$$eval('.files-table-wrap tbody tr', (r) => r.map((x) => [...x.cells].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).join(' | '))));
  const nameCell = await p.$eval('.files-table-wrap .fname-link', (e) => [e.scrollWidth > e.clientWidth, e.getBoundingClientRect().right <= e.closest('td').getBoundingClientRect().right + 1]);
  console.log('long name clipped inside cell:', nameCell);
  await p.screenshot({ path: `${SP}/files-all.png` });
  // sort by size
  await p.click('.th-btn:has-text("Size")'); await p.waitForTimeout(300);
  console.log('by size:', await p.$$eval('.files-table-wrap tbody tr .fname-link', (x) => x.map((e) => e.textContent.slice(0, 20))));
  // Recordings -> Video
  await p.click('.folder-toggle'); await p.click('.folder-item.child:has-text("Video")'); await p.waitForTimeout(400);
  console.log('video folder:', await p.$$eval('.files-table-wrap tbody tr .fname-link', (x) => x.map((e) => e.textContent)));
  // drag file onto Case Closing folder
  await p.click('.folder-item:has-text("All documents")'); await p.waitForTimeout(300);
  await p.dragAndDrop('.files-table-wrap tbody tr:has-text("notes.docx")', '.folder-item:has-text("Case Closing")');
  await p.waitForTimeout(800);
  console.log('after drag:', await p.$$eval('.files-table-wrap tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 60))));
  // reorder folders: drag Case Closing to top
  await p.dragAndDrop('.folder-item:has-text("Case Closing")', '.folder-item:has-text("Case Initiation")');
  await p.waitForTimeout(600);
  console.log('folder order top:', await p.$$eval('.folder-nav .folder-item .folder-name', (x) => x.slice(0, 4).map((e) => e.textContent)));
  // custom order within a folder with two files
  await p.setInputFiles('.files-main input[type=file]', [mk('memo a.pdf', '1'), mk('memo b.pdf', '2')]);
  await p.selectOption('#dialog[open] select >> nth=0', 'Other'); await p.selectOption('#dialog[open] select >> nth=1', 'Other');
  await p.click('#dialog[open] button:has-text("Save to SSD")'); await p.waitForTimeout(800);
  await p.click('.folder-item:has-text("Other") >> nth=-1'); await p.waitForTimeout(400);
  await p.click('.th-btn:has-text("Custom")'); await p.waitForTimeout(400);
  const before = await p.$$eval('.files-table-wrap tbody .fname-link', (x) => x.map((e) => e.textContent));
  await p.dragAndDrop('.files-table-wrap tbody tr >> nth=1', '.files-table-wrap tbody tr >> nth=0', { targetPosition: { x: 50, y: 3 } });
  await p.waitForTimeout(700);
  console.log('custom order', before, '->', await p.$$eval('.files-table-wrap tbody .fname-link', (x) => x.map((e) => e.textContent)));
  await p.hover('.files-table-wrap td.actions .icon-btn >> nth=0'); await p.waitForTimeout(600);
  console.log('tooltip:', await p.$eval('#cv-tip', (e) => [e.hidden, e.textContent]));
  await p.screenshot({ path: `${SP}/files-other.png` });
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
