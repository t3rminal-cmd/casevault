const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  await p.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  // synthetic logo: a blue shield-ish circle with "EX"
  const png = Buffer.from((await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#1d4ed8'; g.beginPath(); g.arc(100, 100, 90, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 70px sans-serif'; g.fillText('EX', 52, 125); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
  // v1.118: the Draft tab shows one line; Edit Letterhead opens the editor.
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForSelector('.lh-summary');
  await p.click('.lh-summary button:has-text("Edit Letterhead")'); await p.waitForSelector('#dialog[open] .lh-editor');
  await p.setInputFiles('.lh-editor input[type=file]', { name: 'logo.png', mimeType: 'image/png', buffer: png });
  await p.waitForSelector('.lh-logo.has-logo');
  await p.fill('.lh-text', 'Example City Police Department\nNarcotics Division\n100 Main Street · Example City');
  await p.waitForTimeout(900);
  await p.locator('.lh-editor').screenshot({ path: process.env.SP + '/v185/lh-editor.png' });
  await p.click('#dialog[open] button:has-text("Done")'); await p.waitForTimeout(400);
  ok(/Example City Police Department/.test(await p.textContent('.lh-summary')) && await p.locator('.lh-summary .lh-thumb img').count() === 1, 'the Draft tab shows the letterhead in one line');
  const info = await p.evaluate(async () => { const lh = await CVLetterhead.forPdf(); return { header: lh.header, w: lh.logo && lh.logo.w, size: lh.logo && lh.logo.jpeg.length }; });
  console.log(info);
  // Build the three PDFs and render the first page of each to PNG via pdf viewer
  const bytes = await p.evaluate(async (id) => {
    const c = await Vault.getCase(id);
    const lh = await CVLetterhead.forPdf();
    const rep = CVReportPdf.build({}, { letterhead: lh, agency: 'X', caseLabel: 'Case EX-100' });
    const arr = CVArrestPdf.build(CVClosing.emptyArrest(), { letterhead: lh, caseNumber: 'EX-100' });
    return [Array.from(rep), Array.from(arr)];
  }, ids.c);
  const fs = require('fs');
  fs.writeFileSync(process.env.SP + '/v185/rep.pdf', Buffer.from(bytes[0]));
  fs.writeFileSync(process.env.SP + '/v185/arr.pdf', Buffer.from(bytes[1]));
  ok(Buffer.from(bytes[0]).toString('latin1').includes('Narcotics Division'), 'report PDF has header');
  ok(/\/Im0 Do/.test(Buffer.from(bytes[0]).toString('latin1')), 'report PDF draws logo');
  // Link chart tab
  await p.evaluate((id) => { location.hash = `#/case/${id}/linkchart`; }, ids.c); await p.waitForSelector('.lc .lh-summary');
  ok(/Example City Police Department/.test(await p.textContent('.lc .lh-summary')), 'link chart shows the same header');
  console.log('errors', errs); await b.close(); })();
