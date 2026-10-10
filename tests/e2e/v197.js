const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  await p.evaluate(async (ids) => {
    for (const [n, s] of [['EX-400', 'doe-roe, jonathan'], ['EX-500', 'Unknown Offender'], ['EX-600', 'Mary Ann Roe']]) await Vault.createCase({ number: n, subject: s });
    const d = (k) => { const x = new Date(); x.setDate(x.getDate() + k); return x.toISOString().slice(0, 10); };
    await Vault.saveTimeline(ids.c, { events: [
      { id: 'e1', date: d(-40), title: 'Buy one', kind: 'event' }, { id: 'e2', date: d(-39), title: 'Buy two', kind: 'event' },
      { id: 'e3', date: d(-39), title: 'Surveillance', kind: 'event' }, { id: 'e4', date: d(-2), title: 'Warrant signed', kind: 'event' },
      { id: 'e5', date: d(1), title: 'Warrant served', kind: 'deadline' }, { id: 'e6', date: d(2), title: 'Court date', kind: 'deadline' },
      { id: 'e7', date: d(60), title: 'Grand jury', kind: 'deadline' }] });
  }, ids);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/general'; }); await p.waitForTimeout(1200);
  // v1.111: Last, First and Middle are their own columns; read them back as "LAST, First Middle".
  const rows = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.general-table tbody tr')].map((r) => {
    const n = [...r.querySelectorAll('td.name-cell')].map((c) => c.textContent.trim().replace(/^—$/, ''));
    return [r.cells[0].textContent.trim(), n.length === 1 ? n[0] : `${n[0]}, ${[n[1], n[2]].filter(Boolean).join(' ')}`];
  })));
  ok(rows['EX-100'] === 'DOE, John' && rows['EX-200'] === 'ROE, Jane' && rows['EX-400'] === 'DOE-ROE, Jonathan' && rows['EX-600'] === 'ROE, Mary Ann', `General Files: LAST, First ${JSON.stringify(rows)}`);
  ok(rows['EX-500'] === 'Unknown Offender', 'Unknown Offender left as typed');
  const side = await p.evaluate(() => [...document.querySelectorAll('.case-item-meta .cim-subject')].map((x) => x.textContent.trim()));
  ok(side.includes('DOE, John') && side.includes('ROE, Mary Ann'), `sidebar: LAST, First ${side}`);
  await p.fill('input[aria-label="Search General Files"]', 'doe, john'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => [...document.querySelectorAll('table tbody tr')].length === 1), 'search by the shown name finds it');
  await p.evaluate((id) => { location.hash = `#/case/${id}/details`; }, ids.c); await p.waitForSelector('.mini-tl-line .mini-tl-dot'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.querySelector('#case-subject').textContent) === 'DOE, John', 'case header: DOE, John');
  ok(await p.evaluate(() => [...document.querySelectorAll('main input')].some((i) => i.value === 'John Doe')), 'Subject Name box keeps John Doe as typed');
  const check = async (label) => {
    const r = await p.evaluate(() => {
      const dots = [...document.querySelectorAll('.mini-tl-line .mini-tl-dot')];
      const boxes = dots.map((d) => d.getBoundingClientRect());
      let overlap = 0; for (let i = 1; i < boxes.length; i += 1) if (boxes[i].left < boxes[i - 1].right + 1) overlap += 1;
      const count = dots.reduce((n, d) => n + (d.classList.contains('mini-tl-group') ? Number(d.textContent) : 1), 0);
      return { n: dots.length, overlap, count, tips: dots.map((d) => d.dataset.tip) };
    });
    ok(r.overlap === 0, `${label}: no markers overlap (${r.n} markers)`);
    ok(r.count === 7, `${label}: every event counted once (${r.count})`);
    return r;
  };
  const r = await check('1366 wide');
  const g = r.tips.find((t) => /^3 events/.test(t));
  ok(g && /Buy one/.test(g) && /Buy two/.test(g) && /Surveillance/.test(g), 'the 3-event marker lists all three');
  ok(r.tips.some((t) => /^2 events/.test(t) && /Warrant served/.test(t) && /Court date/.test(t)), 'the two deadlines a day apart share a marker');
  await p.locator('.mini-tl').screenshot({ path: process.env.SP + '/v197/mini.png' });
  await p.setViewportSize({ width: 700, height: 900 }); await p.waitForTimeout(700);
  await check('700 wide');
  await p.locator('.mini-tl').screenshot({ path: process.env.SP + '/v197/mini-narrow.png' });
  console.log('errors', errs); await b.close(); })();
