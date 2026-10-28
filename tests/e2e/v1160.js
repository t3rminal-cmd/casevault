// v1.160: drop-down lists stay open and on top (Edit Alias, combo boxes), the sidebar folder icons in
// one column with a count on CLOSED, the locker row buttons lined up, and the Timeline Paid
// box formatted as money. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1160';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(700); };

  // 1. Sidebar: the counts, + buttons and chevrons of every folder in one column; CLOSED shows a handcuff count.
  await p.evaluate(async () => {
    const op = Vault.listOperations()[0];
    for (let i = 0; i < 2; i++) { const c = await Vault.createCase({ number: `EX-6${i}0`, subject: 'Sam Roe' }); await Vault.assignCase(c.id, op.id); }
    const t = await Vault.createCase({ number: 'EX-900', subject: 'Ann Poe' }); await Vault.assignCase(t.id, op.id);
    const tl = await Vault.getTimeline(t.id); tl.events = [{ id: 'd1', kind: 'deadline', date: Vault.localDay(), title: 'Due' }]; await Vault.saveTimeline(t.id, tl);
    for (const [n, s] of [['EX-700', 'Sam Roe'], ['EX-710', 'Joe Doe']]) { const a = await Vault.createCase({ number: n, subject: s }); a.status = 'Closed'; await Vault.saveCase(a); }
  });
  await home();
  const cols = await p.evaluate(() => {
    const at = (sel) => [...new Set([...document.querySelectorAll(`#case-list .op-head > :is(${sel})`)].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2); }))];
    return { count: at('.op-count, .closed-count'), add: at('.mission-add, .general-add'), chev: at('.op-chev') };
  });
  ok(cols.count.length === 1 && cols.add.length === 0 && cols.chev.length === 1, `folder icons in one column (no + since v1.165): ${JSON.stringify(cols)}`);
  const closedN = await p.evaluate(() => { const c = document.querySelector('#case-list .closed-group > summary .closed-count'); return c ? { icon: !!c.querySelector('svg, img'), n: c.textContent.trim() } : null; });
  ok(closedN && !closedN.icon && closedN.n === '2', `CLOSED shows its count, without an icon (v1.161): ${JSON.stringify(closedN)}`);
  // v1.161: a folder with a single case shows its count too.
  const one = await p.evaluate(async () => {
    const op = await Vault.createOperation({ name: 'Single Op', number: 'OP-9' });
    const c = await Vault.createCase({ number: 'EX-990', subject: 'Joe Roe' }); await Vault.assignCase(c.id, op.id);
    return op.id;
  });
  await home();
  const oneN = await p.evaluate(() => { const s = [...document.querySelectorAll('#case-list .mission-children .op-head')].find((x) => /OP-9/.test(x.textContent)); const c = s && s.querySelector('.op-count'); return c ? c.textContent : null; });
  ok(oneN === '1', `a Mission with one case shows 1: ${oneN}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});

  // 2. Secure Locker: the row buttons line up from row to row, with or without notes.
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  await p.click('.locker-tabs button:has-text("Covert")');
  const F = (l) => `#dialog[open] .locker-form .field:has(> span:text-is("${l}")) :is(input, textarea)`;
  for (const [n, notes] of [['Rick Poe', 'Backstory note'], ['Sam Roe', ''], ['Ann Doe', 'x']]) {
    await p.click('.locker-section button:has-text("Add Alias")'); await p.waitForSelector('#dialog[open] .locker-form');
    await p.fill(F('Alias Name'), n);
    if (notes) await p.fill(F('Backstory / Notes'), notes);
    await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(600);
  }
  const acts = await p.evaluate(() => [...document.querySelectorAll('.locker-rows tbody tr')].filter((r) => r.querySelector('.locker-edit'))
    .map((r) => ['.locker-edit', '.danger-icon'].map((s) => { const e = r.querySelector(`.col-actions ${s}`); return e ? Math.round(e.getBoundingClientRect().left) : null; }).join(',')));
  ok(acts.length === 3 && new Set(acts).size === 1, `Edit and Delete line up in every row: ${JSON.stringify(acts)}`);
  await p.locator('.locker-section').first().screenshot({ path: `${SP}/locker.png` }).catch(() => {});

  // 3. Edit Alias: every drop-down opens and its list is on top, also the ones low in the form.
  await p.click('.locker-rows .locker-edit'); await p.waitForSelector('#dialog[open] .locker-form');
  const n = await p.locator('#dialog[open] select').count();
  const bad = [];
  for (let i = 0; i < n; i++) {
    const sel = p.locator('#dialog[open] select').nth(i);
    const label = await sel.evaluate((s) => (s.closest('.field') && s.closest('.field').querySelector('span') ? s.closest('.field').querySelector('span').textContent : s.getAttribute('aria-label')));
    await sel.scrollIntoViewIfNeeded(); await p.waitForTimeout(80);
    await sel.click(); await p.waitForTimeout(200);
    const shown = await p.evaluate(() => { const x = document.querySelector('.sel-pop'); if (!x) return false; const r = x.getBoundingClientRect(); const t = document.elementFromPoint(r.left + 5, r.top + 5); return !!t && x.contains(t); });
    if (shown) await p.keyboard.press('Escape'); else bad.push(label);
    await p.waitForTimeout(80);
  }
  ok(n >= 10 && !bad.length, `${n} drop-downs open: ${bad.length ? `not opening: ${bad.join(', ')}` : 'all'}`);
  const cb = p.locator('#dialog[open] .combo button').first();
  await cb.scrollIntoViewIfNeeded(); await cb.click(); await p.waitForTimeout(250);
  const combo = await p.evaluate(() => { const x = [...document.querySelectorAll('.combo-list')].find((l) => !l.hidden); if (!x) return null; const r = x.getBoundingClientRect(); const t = document.elementFromPoint(r.left + 5, r.top + 5); return { onTop: !!t && x.contains(t), items: x.children.length }; });
  ok(combo && combo.onTop && combo.items > 0, `a combo box list shows on top of the window: ${JSON.stringify(combo)}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.click('#dialog[open] button:has-text("Cancel")').catch(() => {});
  await p.waitForTimeout(300);
  if (await p.isVisible('#dialog[open]')) await p.keyboard.press('Escape');

  // 4. Timeline: the Paid box of a Buy is money as it is typed and when left; it is saved as a number.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/timeline`; }, ids.c); await p.waitForSelector('form.timeline-form'); await p.waitForTimeout(500);
  await p.evaluate(() => { const s = [...document.querySelectorAll('form.timeline-form select')].find((x) => [...x.options].some((o) => o.value === 'buy')); s.value = 'buy'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.fill('.tl-title-input', 'Buy 1');
  await p.click('input[aria-label="Paid"]'); await p.keyboard.type('1234.5');
  const typed = await p.inputValue('input[aria-label="Paid"]');
  await p.click('.tl-title-input');
  const left = await p.inputValue('input[aria-label="Paid"]');
  ok(typed === '$1,234.5' && left === '$1,234.50', `Paid as money: typed ${typed}, then ${left}`);
  await p.click('form.timeline-form button[type=submit]'); await p.waitForTimeout(800);
  const tl = await p.evaluate((i) => window.__readCaseJSON(i, 'timeline.json'), ids.c);
  const buy = tl.events.find((e) => e.title === 'Buy 1');
  ok(buy && buy.paid === '1234.5', `saved as a plain number: ${JSON.stringify(buy && buy.paid)}`);

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
