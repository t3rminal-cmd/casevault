// v1.140: Training: certificate details (course, given by, completed, hours, expires) on the cards,
// renewal reminders in Needs Attention, the Training Record PDF, and {{training}} in Drafts. The
// certificates are made here (synthetic PDFs); all data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1140';

function certPdf(text) {
  const content = `4 w 20 20 752 572 re S BT /F1 30 Tf 60 306 Td (${text}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mdY = (iso) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}.${iso.slice(0, 4)}`;

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const today = await p.evaluate(() => Vault.localDay());
  await p.evaluate(async (list) => {
    for (const [name, text] of list) await Vault.addShared('other', 'Training', new File([Uint8Array.from(text, (c) => c.charCodeAt(0))], name, { type: 'application/pdf' }));
  }, [['Basic Narcotics.pdf', certPdf('Basic Narcotics - Jane Doe')], ['CPR.pdf', certPdf('CPR - Jane Doe')]]);
  // One certificate expired last week (saved straight to the vault), so Needs Attention lists it.
  await p.evaluate(async (exp) => { await Vault.saveTraining({ 'CPR.pdf': { course: 'First Aid / CPR', date: '2024-10-01', hours: '8', expires: exp } }); }, addDays(today, -7));
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; });
  await p.waitForSelector('.attention-row.att-cert', { timeout: 8000 });
  const att = await p.$$eval('.attention-row.att-cert', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')));
  ok(att.length === 1 && /First Aid \/ CPR/.test(att[0]) && /Certificate Expired/.test(att[0]) && /7 days ago/.test(att[0]), `Needs Attention lists the expired certificate: ${att.join(' | ')}`);

  // The card: Training opens from the reminder; enter the other certificate's details.
  await p.click('.attention-row.att-cert'); await p.waitForSelector('.cert-grid .cert-card'); await p.waitForTimeout(400);
  const card = p.locator('.cert-card[data-file="Basic Narcotics.pdf"]');
  // v1.145: a card without details shows its name only (the pencil adds them).
  ok((await card.locator('.cert-open').innerText()).trim() === 'Basic Narcotics' && await card.locator('.cert-edit').count() === 1, 'a card without details shows its name, with the pencil');
  await card.locator('.cert-edit').click(); await p.waitForSelector('#dialog[open] .cert-form');
  await p.fill('#dialog[open] input[aria-label="Course"]', 'Basic Narcotics Investigations');
  await p.fill('#dialog[open] input[aria-label="Given By"]', 'Example Police Academy');
  await p.fill('#dialog[open] .date-field:has(input[aria-label="Date Completed"]) input.date-text', '03.04.2024');
  await p.fill('#dialog[open] input[aria-label="Hours"]', '40');
  const exp = addDays(today, 20);
  await p.fill('#dialog[open] .date-field:has(input[aria-label="Expires"]) input.date-text', mdY(exp));
  await p.locator('#dialog[open] form').screenshot({ path: `${SP}/details.png` });
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(800);
  const saved = await p.evaluate(() => Vault.readTraining());
  ok(saved['Basic Narcotics.pdf'] && saved['Basic Narcotics.pdf'].course === 'Basic Narcotics Investigations' && saved['Basic Narcotics.pdf'].date === '2024-03-04' && saved['Basic Narcotics.pdf'].hours === '40' && saved['Basic Narcotics.pdf'].expires === exp, `saved: ${JSON.stringify(saved['Basic Narcotics.pdf'])}`);
  const txt = (await p.locator('.cert-card[data-file="Basic Narcotics.pdf"]').innerText()).replace(/\s+/g, ' ');
  // v1.145: the card shows only the course name and the expiry (the rest is in the pencil's details).
  ok(/Basic Narcotics Investigations/.test(txt) && !/Completed|40 hrs|Added/.test(txt) && /Renew in 20 days/.test(txt), `the card shows the course and expiry: ${txt}`);
  ok(await p.$('.cert-card[data-file="CPR.pdf"].cert-expired .cert-exp-expired') !== null, 'the expired certificate is marked');
  const sizes = await p.$$eval('.cert-card', (x) => x.map((c) => `${Math.round(c.getBoundingClientRect().width)}x${Math.round(c.getBoundingClientRect().height)}`));
  ok(new Set(sizes).size === 1, `the cards are still the same size: ${sizes.join(', ')}`);
  await p.locator('.other-files-section').screenshot({ path: `${SP}/training.png` });

  // Training Record PDF.
  await p.click('.other-files-section button:has-text("Training Record")'); await p.waitForSelector('#dialog[open] form');
  await p.click('#dialog[open] button[type=submit]');
  await p.waitForSelector('#dialog[open] .pdf-view', { timeout: 20000 }); await p.waitForTimeout(800);
  const pdf = await p.evaluate(async () => {
    const rows = await Vault.trainingRows();
    return [...CVTraining.build(rows, { name: 'Jane Doe', today: Vault.localDay() })].map((c) => String.fromCharCode(c)).join('');
  });
  ok(['TRAINING RECORD', 'Basic Narcotics Investigations', 'Example Police Academy', 'First Aid / CPR', 'EXPIRED', 'Total hours', '48'].every((w) => pdf.includes(w)), 'the Training Record lists the courses and the total hours');
  const pages = await p.$$eval('#dialog[open] .pdf-view canvas, #dialog[open] .pdf-page', (x) => x.length);
  ok(pages >= 3, `the certificates follow the list (${pages} pages shown)`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/record.png` });
  await p.click('#dialog[open] button:has-text("Close")'); await p.waitForTimeout(300);

  // {{training}} in a Draft.
  const filled = await p.evaluate(async (id) => {
    const c = await Vault.getCase(id);
    return CVDraft.fillTemplate('{{training}}\n{{training.hours}}', CVDraft.templateContext(c, new Date(), Vault.data.settings.affiant, await CVClosingUI.templateExtra(c)));
  }, ids.c);
  ok(/^Your Affiant has completed the following training: First Aid \/ CPR \(October 1, 2024, 8 hours\); Basic Narcotics Investigations \(Example Police Academy, March 4, 2024, 40 hours\)|^Your Affiant has completed the following training: Basic Narcotics Investigations/.test(filled) && /In total, your Affiant has completed 48 hours of training\.\n48$/.test(filled), `{{training}} fills in: ${filled}`);

  // Deleting a certificate removes its details.
  await p.evaluate(() => Vault.deleteShared('other', 'Training', 'CPR.pdf'));
  ok(!(await p.evaluate(() => Vault.readTraining()))['CPR.pdf'], 'a deleted certificate takes its details with it');
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
