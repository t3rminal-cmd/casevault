// The sidebar's bottom area (v1.88, its CLOSED FILES / ARCHIVED panel) is gone in v1.121: closed and
// archived cases are on the home page; a search in the sidebar still finds them. All data is made up.
const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(async () => {
    for (let i = 0; i < 3; i++) { const c = await Vault.createCase({ number: `EX-${500 + i}`, subject: `Rick Poe ${i}` }); c.status = 'Closed'; c.closure = { disposition: 'unfounded', date: '2026-10-01' }; c.dates.closed = '2026-10-01'; await Vault.saveCase(c); }
    for (let i = 0; i < 2; i++) { const c = await Vault.createCase({ number: `EX-${700 + i}`, subject: `Jane Roe ${i}` }); await Vault.archiveCase(c.id, false, 'nolle', 'test'); }
  });
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(1000);
  ok(!(await p.$('#side-bottom, #closed-cases, #archived-cases')), 'no Closed / Archived area in the sidebar');
  const listText = await p.textContent('#case-list');
  ok(!/EX-500|EX-700/.test(listText), 'closed and archived cases are not in the sidebar list');
  ok((await p.locator('.closed-files-section').count()) === 1 && (await p.locator('.archived-section').count()) === 1, 'they are on the home page (CLOSED FILES, ARCHIVED)');
  // A search finds them, under Closed and Archived headings.
  await p.click('#btn-side-search'); await p.fill('#case-search', 'EX-50'); await p.waitForTimeout(500);
  const closed = await p.evaluate(() => ({ head: [...document.querySelectorAll('#case-list .side-found-head')].map((x) => x.textContent), text: document.getElementById('case-list').textContent }));
  ok(closed.head.includes('Closed') && /EX-500/.test(closed.text), `a search finds closed cases: ${closed.head.join(',')}`);
  await p.fill('#case-search', 'EX-70'); await p.waitForTimeout(500);
  const arch = await p.evaluate(() => ({ head: [...document.querySelectorAll('#case-list .side-found-head')].map((x) => x.textContent), text: document.getElementById('case-list').textContent }));
  ok(arch.head.includes('Archived') && /EX-700/.test(arch.text) && /EX-701/.test(arch.text), `a search finds archived cases: ${arch.head.join(',')}`);
  await p.fill('#case-search', ''); await p.waitForTimeout(400);
  ok(!(await p.$('#case-list .side-found-head')), 'cleared search: back to the open cases only');
  await p.locator('#sidebar').screenshot({ path: process.env.SP + '/v188/sidebar.png' }).catch(() => {});
  console.log('errors', errs); await b.close(); })().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
