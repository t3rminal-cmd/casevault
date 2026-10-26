// v1.142: Arrest events on the Timeline (a type you pick, and each arrestee on the Arrest Report by
// itself); fonts: text 11 pt, small text 10 pt, headers 12 pt in the app; PDFs 10 pt text, 12 pt
// headers. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1142';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(async (id) => {
    await Vault.writeCaseJSON(id, 'arrest.json', { schema: 2, arrestees: [
      { firstName: 'John', lastName: 'Doe', date: '2026-09-10', time: '1430', charges: [{ statute: '720 ILCS 570/401(c)(2)', description: 'Manufacture/Delivery of a Controlled Substance' }] },
      { firstName: 'Jane', lastName: 'Roe', date: '', charges: [] },
    ] });
    await Vault.saveTimeline(id, { events: [
      { id: 'e1', date: '2026-09-01', time: '', kind: 'buy', title: 'Buy 1', note: '', suspect: 'John Doe', color: '', done: false, drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' },
      { id: 'e2', date: '2026-09-15', time: '', kind: 'event', title: 'Surveillance', note: '', suspect: 'Rick Poe', color: '', done: false },
    ] });
  }, ids.c);
  await p.evaluate((i) => { location.hash = `#/case/${i}/timeline`; }, ids.c); await p.waitForSelector('.tl-item'); await p.waitForTimeout(400);

  // The arrest from the Arrest Report is on the Timeline by itself.
  const items = await p.$$eval('.tl-item', (x) => x.map((e) => ({ title: e.querySelector('strong').textContent, arrest: e.classList.contains('arrest'), badge: (e.querySelector('.badge') || {}).textContent || '', cuffs: !!e.querySelector('.badge .tl-cuffs'), link: (e.querySelector('.tl-actions a') || {}).textContent || '', edit: !!e.querySelector('.tl-actions button') })));
  const arr = items.find((x) => x.arrest);
  ok(items.length === 3 && arr && arr.title === 'Arrest of John Doe' && /Arrest/i.test(arr.badge) && arr.cuffs, `the arrest shows, with handcuffs: ${JSON.stringify(items)}`);
  ok(arr && /Arrest Report/.test(arr.link) && !arr.edit, 'it links to the Arrest Report instead of Edit / Delete');
  ok(items.map((x) => x.title).join(',') === 'Buy 1,Arrest of John Doe,Surveillance', 'in date order with the others');
  ok(!items.some((x) => /Jane Roe/.test(x.title)), 'an arrestee with no arrest date is left out');
  const looks = await p.$eval('.tl-item.arrest', (e) => { const body = getComputedStyle(e.querySelector('.tl-body')); const dot = getComputedStyle(e, '::before'); return { edge: body.borderLeftWidth, color: body.borderLeftColor, dotRadius: dot.borderRadius }; });
  ok(looks.edge === '6px' && /rgb\((1[6-9]\d|2\d\d), /.test(looks.color), `a thick red edge: ${JSON.stringify(looks)}`);
  const note = await p.textContent('.tl-item.arrest .tl-note');
  ok(/Charged: 720 ILCS 570\/401\(c\)\(2\)/.test(note), `its charges: ${note}`);
  await p.locator('.timeline').screenshot({ path: `${SP}/timeline.png` });

  // Typing your own Arrest event for the same person and day stands for the automatic one.
  ok(await p.$('select:has(option[value="arrest"])') !== null, 'Arrest is a Type to pick');
  await p.evaluate(async (id) => {
    const t = await Vault.getTimeline(id);
    t.events.push({ id: 'e3', date: '2026-09-10', time: '', kind: 'arrest', title: 'Arrest at Example Park', note: '', suspect: 'John Doe', color: '', done: false });
    await Vault.saveTimeline(id, t);
  }, ids.c);
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${i}/timeline`; }, ids.c); await p.waitForSelector('.tl-item'); await p.waitForTimeout(400);
  const arrests = await p.$$eval('.tl-item.arrest', (x) => x.map((e) => e.querySelector('strong').textContent));
  ok(arrests.join('|') === 'Arrest at Example Park', `no double arrest: ${arrests.join('|')}`);

  // The Timeline PDF marks the arrest.
  const pdf = await p.evaluate(async (id) => {
    const tl = await Vault.getTimeline(id);
    const rows = CVOperation.mergeEvents([{ caseId: id, number: 'EX-100', events: tl.events }]);
    return [...CVTimelinePdf.build({ title: 'Timeline', number: 'EX-100', rows })].map((c) => String.fromCharCode(c)).join('');
  }, ids.c);
  ok(/\[ARREST\]/.test(pdf) && / 12 Tf .*\(EVENTS/.test(pdf) && !/ (8|8\.5|9|9\.5) Tf [^\n]*\((Buy 1|Surveillance)/.test(pdf), 'the PDF: [ARREST], 12 pt headers, 10 pt text');

  // App fonts: text 11 pt, small 10 pt, headers 12 pt.
  const px = await p.evaluate(() => {
    const cs = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
    return { body: parseFloat(getComputedStyle(document.body).fontSize), h2: cs('h2'), label: cs('.field > span'), title: cs('h1') };
  });
  ok(Math.abs(px.body - 14.67) < 0.2, `text 11 pt (${px.body}px)`);
  ok(!px.title || Math.abs(px.title - 16) < 0.2, `the page title 12 pt (${px.title}px)`);
  ok(px.label >= 13.3, `small text no smaller than 10 pt (${px.label}px)`);
  const smallest = await p.evaluate(() => {
    let min = 99; let who = '';
    for (const e of document.querySelectorAll('#main *')) {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!e.getClientRects().length) continue;
      const f = parseFloat(getComputedStyle(e).fontSize);
      if (f < min) { min = f; who = `${e.tagName}.${e.className}`; }
    }
    return { min, who };
  });
  ok(smallest.min >= 13.3, `no text on the Timeline page under 10 pt (smallest ${smallest.min}px: ${smallest.who})`);
  await p.screenshot({ path: `${SP}/app-timeline.png` });
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(800);
  await p.screenshot({ path: `${SP}/app-home.png`, fullPage: false });
  const heads = await p.$$eval('#main h2', (x) => x.filter((e) => e.getClientRects().length).map((e) => parseFloat(getComputedStyle(e).fontSize)));
  ok(heads.length > 2 && heads.every((f) => Math.abs(f - 16) < 0.2), `section headers 12 pt (${[...new Set(heads)].join(', ')}px)`);

  // A look at each PDF.
  const shots = {
    timeline: pdf,
    arrest: await p.evaluate(async (id) => [...CVArrestPdf.build(await Vault.readCaseJSON(id, 'arrest.json'), { caseNumber: 'EX-100' })].map((c) => String.fromCharCode(c)).join(''), ids.c),
    report: await p.evaluate(() => [...CVReportPdf.build(CVReportFields.normalize({ narrative: 'On September 10, 2026, Detective Jane Doe met with an undercover officer at Example Park in Example City.' }), {})].map((c) => String.fromCharCode(c)).join('')),
    year: await p.evaluate(async () => { await CVKit.loadScripts(['js/year-summary.js']); return [...CVYearSummary.build(CVYearSummary.compute('2026', [{ id: 'a', number: 'EX-100', opened: '2026-01-02' }], new Map()), {})].map((c) => String.fromCharCode(c)).join(''); }),
    training: await p.evaluate(() => [...CVTraining.build([{ file: 'a.pdf', course: 'Basic Narcotics Investigations', provider: 'Example Police Academy', date: '2024-03-04', hours: '40', expires: '2026-09-30' }], { today: '2026-10-17' })].map((c) => String.fromCharCode(c)).join('')),
  };
  for (const [name, s] of Object.entries(shots)) {
    await p.evaluate((str) => {
      const bytes = Uint8Array.from(str, (c) => c.charCodeAt(0));
      const d = document.createElement('div'); d.id = 'pdfshot'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
      d.append(CVPdfViewer.create(bytes, { h: window.CaseVaultUI.h, icon: CVIcons.icon, title: 'x', fileName: 'x.pdf' }));
      document.body.append(d);
    }, s);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${SP}/pdf-${name}.png` });
    await p.evaluate(() => document.getElementById('pdfshot').remove());
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
