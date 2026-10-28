// v1.164: Training certificates in the order you want (Arrange: drag a card onto another, or the
// arrows), kept on the SSD; and Firefox keeps its own drop-down lists. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1164';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(async () => {
    for (const n of ['Course A.txt', 'Course B.txt', 'Course C.txt', 'Course D.txt']) await Vault.addShared('other', 'Training', new File([`certificate ${n}`], n, { type: 'text/plain' }));
  });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; });
  await p.waitForSelector('.recent-section'); await p.waitForTimeout(400);
  // Other Files → Training.
  await p.click('.other-files-section .shared-tile:has-text("Training")');
  const opened = true;
  await p.waitForSelector('.cert-grid .cert-card', { timeout: 15000 }).catch(() => {});
  const names = () => p.$$eval('.cert-grid .cert-card .cert-name', (e) => e.map((x) => x.textContent));
  const start = await names();
  ok(opened && start.length === 4, `Training shows the 4 certificates: ${JSON.stringify(start)}`);

  await p.click('.shared-open-head button:has-text("Arrange")'); await p.waitForTimeout(400);
  ok(await p.$$eval('.cert-grid.cert-arranging .cert-card[draggable="true"]', (e) => e.length) === 4, 'Arrange makes the cards draggable');
  // Move the last one earlier with the arrow, twice.
  const last = start[3];
  await p.click(`.cert-card:has(.cert-name:text-is("${last}")) button[title="Move earlier"]`); await p.waitForTimeout(500);
  await p.click(`.cert-card:has(.cert-name:text-is("${last}")) button[title="Move earlier"]`); await p.waitForTimeout(500);
  const afterArrows = await names();
  ok(afterArrows[1] === last, `the arrows move it: ${JSON.stringify(afterArrows)}`);
  // Drag the first card onto the last one.
  const first = afterArrows[0];
  await p.dragAndDrop(`.cert-card:has(.cert-name:text-is("${first}"))`, `.cert-card:has(.cert-name:text-is("${afterArrows[3]}"))`); await p.waitForTimeout(600);
  const afterDrag = await names();
  ok(afterDrag[3] === first, `dragging moves it: ${JSON.stringify(afterDrag)}`);
  await p.locator('.shared-files').first().screenshot({ path: `${SP}/arrange.png` }).catch(() => {});
  await p.click('.shared-open-head button:has-text("Done Arranging")'); await p.waitForTimeout(400);
  // Kept on the SSD: after a reload the order is the same.
  const saved = await p.evaluate(async () => (await Vault.readTraining())['.order']);
  ok(JSON.stringify(saved) === JSON.stringify(afterDrag.map((n) => `${n}.txt`)), `kept in .training.json: ${JSON.stringify(saved)}`);
  // A new certificate goes at the end.
  await p.evaluate(async () => Vault.addShared('other', 'Training', new File(['x'], 'Course E.txt', { type: 'text/plain' })));
  const rows = await p.evaluate(async () => CVTraining.ordered(await Vault.listShared('other', 'Training'), await Vault.readTraining()).map((f) => f.base));
  ok(rows[rows.length - 1] === 'Course E.txt' && rows.slice(0, 4).join() === saved.join(), `a new one comes last: ${JSON.stringify(rows)}`);

  // Firefox: CaseVault's own list isn't used, Firefox's is.
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0' });
  const fp = await ctx.newPage();
  await fp.goto('http://localhost:8765/'); await fp.waitForTimeout(800);
  const ff = await fp.evaluate(() => ({ native: window.CVSelect && CVSelect.native, cls: document.documentElement.classList.contains('native-select') }));
  ok(ff.native === true && ff.cls, `in Firefox the browser's own list is used: ${JSON.stringify(ff)}`);
  ok(await p.evaluate(() => CVSelect.native === false), 'in Chrome and Edge CaseVault\'s list is used');

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
