// v1.104: a PDF can be attached to an exhibit as well as photos (Draft tab). Its first page shows
// on the tile with a PDF badge, and every page goes into the report's Exhibit Attachments.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

// A small synthetic PDF with `n` pages, each saying "Lab result page k" (no real data).
function makePdf(n) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids = [];
  for (let k = 1; k <= n; k++) {
    const content = `BT /F1 28 Tf 72 700 Td (Lab result page ${k}) Tj ET`;
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objs.length} 0 R /Resources << /Font << /F1 ${2 + 2 * n + 1} 0 R >> >> >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`;
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

(async () => {
  const { b, p, errs, ids } = await boot();
  await p.evaluate((i) => { location.hash = `#/case/${i}/draft`; }, ids.c); await p.waitForTimeout(1300);
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(300);
  await p.click('button:has-text("Add Exhibit")'); await p.waitForTimeout(400);
  const card = p.locator('.rf-exhibit-card:not(.rf-extra-card)').first();
  ok(/Add Photos or PDF/.test(await card.locator('.rf-photo-add').textContent()), 'the add tile says "Add Photos or PDF"');
  ok(/application\/pdf/.test(await card.locator('input[type=file]').getAttribute('accept')), 'the picker takes PDFs as well as images');
  await card.locator('input[type=file]').setInputFiles({ name: 'lab-sample.pdf', mimeType: 'application/pdf', buffer: makePdf(3) });
  await p.waitForSelector('.rf-exhibit-card .rf-photo-pdf', { timeout: 15000 });
  await p.waitForFunction(() => { const im = document.querySelector('.rf-exhibit-card .rf-photo-card img'); return im && im.naturalWidth > 0; }, null, { timeout: 15000 });
  const thumb = await p.evaluate(() => { const im = document.querySelector('.rf-exhibit-card .rf-photo-card img'); return { w: im.naturalWidth, h: im.naturalHeight }; });
  ok(thumb.h > thumb.w, `the tile shows the PDF's first (portrait) page: ${thumb.w}x${thumb.h}`);
  ok(await p.getAttribute('.rf-exhibit-card .rf-photo-label', 'placeholder') === 'Label this PDF', 'its label box says "Label this PDF"');
  await p.fill('.rf-exhibit-card .rf-photo-label', 'Lab report'); await p.waitForTimeout(1500);
  const files = await p.evaluate(async (i) => (await Vault.listFiles(i)).map((f) => f.path || f.name), ids.c).catch(() => []);
  ok(files.some((f) => /\.pdf$/i.test(f) && /Exhibit/i.test(f)), `saved in the case files as an exhibit PDF: ${files.filter((f) => /\.pdf$/i.test(f)).join(', ')}`);
  // The report PDF: one attachment page image per PDF page, captioned with the page.
  const pdf = await p.evaluate(async (i) => {
    const c = Vault.data.cases.find((x) => x.id === i) || { id: i };
    const bytes = await CVReportFieldsUI.pdfFor(c);
    const txt = new TextDecoder('latin1').decode(bytes);
    return { images: (txt.match(/\/Subtype\s*\/Image/g) || []).length, page2: /page 2 of 3/.test(txt), doc: /Document: Lab report/.test(txt) };
  }, ids.c);
  ok(pdf.images >= 3, `every page of the PDF goes into the report (${pdf.images} images)`);
  ok(pdf.page2 && pdf.doc, 'captions name the page ("page 2 of 3") and the label ("Document: Lab report")');
  await p.locator('.rf-exhibit-card').first().screenshot({ path: process.env.SP + '/v1104/exhibit-pdf.png' });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
