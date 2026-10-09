// v1.107: the backup chip never clips, the opened case's timeline circles glow green, and exhibits
// can be put in date order across cases sharing one sequence. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1107';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  // (1) the chip's words fit, at a few widths.
  for (const w of [1366, 1100, 900]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(300);
    const r = await p.evaluate(() => [...document.querySelectorAll('.hero-count')].map((e) => ({ t: e.textContent.trim(), clip: e.scrollWidth > e.clientWidth + 1 })));
    ok(!r.some((x) => x.clip), `${w} wide: no chip clips (${r.map((x) => x.t).join(' | ')})`);
  }
  await p.setViewportSize({ width: 1366, height: 900 });
  await p.evaluate(async () => { await Vault.recordManualBackup?.(); });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  await p.locator('.hero-counts').screenshot({ path: `${SP}/chips.png` }).catch(() => {});

  // (2) a Mission with two case numbers: on EX-200's Details tab its own circles glow green.
  const c4 = await p.evaluate(async (ids) => {
    const op = Vault.listOperations()[0];
    const c = await Vault.createCase({ number: 'EX-400', subject: 'Mary Doe' }); await Vault.assignCase(c.id, op.id);
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    await Vault.saveTimeline(ids.c2, { events: [{ id: 'a', kind: 'event', date: d(-40), title: 'Controlled buy' }, { id: 'b', kind: 'event', date: d(-5), title: 'Search warrant' }] });
    await Vault.saveTimeline(c.id, { events: [{ id: 'c', kind: 'event', date: d(-20), title: 'Surveillance' }] });
    return c.id;
  }, ids);
  await p.evaluate((i) => { location.hash = `#/case/${i}/details`; }, ids.c2); await p.waitForSelector('.mini-tl-dot');
  const dots = await p.$$eval('.mini-tl-dot', (els) => els.map((e) => ({ mine: e.classList.contains('mini-tl-mine'), tip: e.dataset.tip || '' })));
  ok(dots.filter((d) => d.mine).length === 2 && dots.filter((d) => !d.mine).length === 1 && dots.filter((d) => !d.mine)[0].tip.includes('EX-400'), 'only this case number\'s circles glow green');
  ok(/EX-200/.test(await p.textContent('.mini-tl-key')), 'the timeline says which case number glows');
  await p.locator('.mini-tl').screenshot({ path: `${SP}/glow.png` }).catch(() => {});
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  await p.click('.op-folder-tile'); await p.waitForSelector('.op-timeline-section .mini-tl-dot');
  ok(await p.locator('.op-timeline-section .mini-tl-mine').count() === 0, 'the home page timeline has no green circles (no case is open there)');

  // (3) Put in Date Order: EX-500 (entered first, dated Sept) and EX-600 (entered later, dated Aug)
  // share a federal jacket number.
  const pair = await p.evaluate(async () => {
    const a = await Vault.createCase({ number: 'EX-500', subject: 'Jane Roe', agencyNumber: 'FJ-77' });
    const bb = await Vault.createCase({ number: 'EX-600', subject: 'Rick Poe', agencyNumber: 'FJ-77' });
    const ev = (n) => ({ number: n, inventory: '', type: 'Other', drug: '', weight: '', description: `Item ${n}`, photos: [], photoLabels: [] });
    const photo = await Vault.addFile(a.id, new File(['jpg'], 'x.jpg', { type: 'image/jpeg' }), { folder: 'Other Exhibits', description: 'Exhibit 1a' });
    await Vault.writeCaseJSON(a.id, 'report-fields.json', { date: '2026-09-10', evidence: [{ ...ev(1), photos: [photo], photoLabels: [''] }, ev(2)], lastExhibit: 2 });
    await Vault.writeCaseJSON(bb.id, 'report-fields.json', { date: '2026-08-01', evidence: [ev(3)], lastExhibit: 3 });
    return { a: a.id, b: bb.id };
  });
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, pair.a); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(300);
  await p.click('button:has-text("Put in Date Order")'); await p.waitForSelector('#dialog[open] .date-order');
  const table = await p.textContent('#dialog[open] .date-order-table');
  ok(/EX-600.*3 → 1.*EX-500.*1 → 2.*2 → 3/s.test(table), `the earlier-dated case comes first: ${table.replace(/\s+/g, ' ')}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/date-order.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Renumber")'); await p.waitForTimeout(2500);
  const after = await p.evaluate(async (pr) => ({
    a: (await Vault.readCaseJSON(pr.a, 'report-fields.json')).evidence.map((e) => [e.number, e.description, e.photos]),
    b: (await Vault.readCaseJSON(pr.b, 'report-fields.json')).evidence.map((e) => [e.number, e.description]),
    files: (await Vault.listFiles(pr.a)).map((f) => f.name),
  }), pair);
  ok(JSON.stringify(after.b) === JSON.stringify([[1, 'Item 3']]) && after.a.map((x) => x[0]).join(',') === '2,3' && after.a[0][1] === 'Item 1', `renumbered: EX-600 ${JSON.stringify(after.b)}, EX-500 ${JSON.stringify(after.a.map((x) => x.slice(0, 2)))}`);
  ok(after.files.some((f) => /Exhibit 2a/.test(f)) && after.a[0][2][0] && /Exhibit 2a/.test(after.a[0][2][0]), `the photo is renamed with its new number: ${after.files.join(', ')}`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
