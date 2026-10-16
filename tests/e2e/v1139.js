// v1.139: Other Files folders show their name only; Training shows certificates as cards of the same
// size with a picture of the first page; the vault door is the favicon. The certificates are made
// here (synthetic PDFs). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1139';

// A one-page PDF of the given size with a border and a line of text.
function certPdf(w, hgt, text) {
  const content = `4 w 20 20 ${w - 40} ${hgt - 40} re S BT /F1 30 Tf 60 ${hgt / 2} Td (${text}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${hgt}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  const certs = [
    ['Basic Narcotics Course Certificate.pdf', certPdf(792, 612, 'Certificate of Completion - Jane Doe')],
    ['Interview Techniques.pdf', certPdf(612, 792, 'Certificate - Jane Doe')],
    ['A Much Longer Training Certificate Name For Advanced Surveillance Operations 2026.pdf', certPdf(792, 612, 'Advanced Surveillance - Jane Doe')],
  ];
  await p.evaluate(async (list) => {
    for (const [name, text] of list) await Vault.addShared('other', 'Training', new File([Uint8Array.from(text, (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
  }, certs);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.other-files-section .shared-tile');

  // The folder tiles: the name only, all the same height.
  const tiles = await p.$$eval('.other-files-section .shared-tile', (x) => x.map((t) => ({ name: t.querySelector('.op-num').textContent, sub: !!t.querySelector('.op-title'), h: Math.round(t.getBoundingClientRect().height), tip: t.getAttribute('data-tip') || t.getAttribute('title') || '' })));
  ok(tiles.length >= 5 && tiles.every((t) => !t.sub), `no subheadings on the folders: ${tiles.map((t) => t.name).join(', ')}`);
  ok(new Set(tiles.map((t) => t.h)).size === 1, `every folder tile the same height: ${tiles.map((t) => t.h).join(',')}`);
  ok(/Postal Inspection/.test(tiles.find((t) => t.name === 'USPIS Files').tip), 'the hover box still says what the folder is');
  await p.locator('.other-files-section .op-folders').screenshot({ path: `${SP}/folders.png` });

  // Training: cards of the same size, a picture of each first page.
  await p.locator('.other-files-section .shared-tile', { hasText: 'Training' }).click();
  await p.waitForSelector('.cert-grid .cert-card');
  await p.waitForFunction(() => document.querySelectorAll('.cert-art.has-thumb').length === 3, null, { timeout: 15000 });
  const cards = await p.$$eval('.cert-card', (x) => x.map((c) => { const r = c.getBoundingClientRect(); const a = c.querySelector('.cert-art').getBoundingClientRect(); const n = c.querySelector('.cert-name');
    return { w: Math.round(r.width), h: Math.round(r.height), aw: Math.round(a.width), ah: Math.round(a.height), top: Math.round(r.top), name: n.textContent, cut: n.scrollWidth > n.clientWidth + 1 }; }));
  ok(cards.length === 3 && new Set(cards.map((c) => `${c.w}x${c.h}`)).size === 1, `the cards are the same size: ${JSON.stringify(cards.map((c) => `${c.w}x${c.h}`))}`);
  ok(new Set(cards.map((c) => `${c.aw}x${c.ah}`)).size === 1, 'landscape and portrait certificates sit in the same frame');
  ok(new Set(cards.map((c) => c.top)).size === 1, 'the cards sit in one even row');
  ok(!cards.some((c) => c.cut) && cards.some((c) => /Advanced Surveillance/.test(c.name)) && !cards.some((c) => /\.pdf$/.test(c.name)), 'the names show in full, without .pdf');
  await p.locator('.other-files-section').screenshot({ path: `${SP}/training.png` });
  // Click opens the certificate.
  await p.locator('.cert-open', { hasText: 'Interview Techniques' }).click();
  await p.waitForSelector('#dialog[open]'); await p.waitForTimeout(500);
  ok(await p.$('#dialog[open] canvas, #dialog[open] .pdf-view, #dialog[open] iframe') !== null, 'a card opens the certificate');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // Other folders keep their file list.
  await p.locator('.other-files-section button:has-text("Close")').click(); await p.waitForTimeout(300);
  await p.locator('.other-files-section .shared-tile', { hasText: 'DEA Files' }).click(); await p.waitForTimeout(400);
  ok(!(await p.$('.other-files-section .cert-grid')), 'other folders stay a list');

  // Phone width: the cards stack and stay the same size.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator('.other-files-section .shared-tile', { hasText: 'Training' }).click(); await p.waitForTimeout(600);
  const small = await p.$$eval('.cert-card', (x) => x.map((c) => Math.round(c.getBoundingClientRect().width)));
  ok(small.length === 3 && new Set(small).size === 1 && small[0] <= 360, `phone width: ${small.join(',')}`);
  await p.setViewportSize({ width: 1366, height: 900 });

  const fav = await p.$$eval('link[rel="icon"]', (x) => x.map((l) => l.getAttribute('href')));
  ok(fav[0] === 'icons/vault.svg', `the favicon is the vault door: ${fav.join(', ')}`);
  const svgOk = await p.evaluate(async () => (await fetch('icons/vault.svg')).ok);
  ok(svgOk, 'icons/vault.svg is served');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
