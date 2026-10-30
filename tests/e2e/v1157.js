// v1.157: the ARREST mark on a case, the hidden case list's rail (every button inside it), a
// Mission's number and name in different colours, LAST / First / M. lined up in the case list,
// CLOSED (Operation and Independent) in the case list, and the Secure Locker fixes: Covert Accounts
// with the email on one line and the Copy buttons whole, Department next to the first column, the
// alias drop-downs, the state of each ID, more email and mailing addresses, and the social media of
// a covert account. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1157';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(500); };

  // 1. A case with an arrest: purple border and an ARREST tag in the case list.
  await p.evaluate(async (i) => { const c = await Vault.getCase(i); c.arrest = true; c.subject = 'John Quincy Doe'; await Vault.saveCase(c); }, ids.c);
  await home();
  const arr = await p.evaluate((i) => {
    const a = document.querySelector(`#case-list a.case-item[href="#/case/${CVRoute.enc(i)}"]`);
    return a ? { cls: a.className, tag: (a.querySelector('.case-arrest-tag') || {}).textContent || '', shadow: getComputedStyle(a).boxShadow } : null;
  }, ids.c);
  ok(arr && /has-arrest/.test(arr.cls) && arr.tag === 'ARREST' && /rgb/.test(arr.shadow), `arrest marked: ${JSON.stringify(arr)}`);
  ok(await p.evaluate((i) => Vault.data.cases.find((c) => c.id === i).arrested === true, ids.c), 'the case list index knows the arrest');

  // 2. LAST, | First | M. in columns that line up from one case to the next.
  await p.evaluate(async (i) => { const c = await Vault.getCase(i); c.operationId = ''; await Vault.saveCase(c); }, ids.c2).catch(() => {});
  await home();
  const cols = await p.evaluate(() => [...document.querySelectorAll('#case-list .cim-name')].map((n) => ({ t: n.textContent, first: Math.round(n.querySelector('.cim-first').getBoundingClientRect().left), mi: Math.round(n.querySelector('.cim-mi').getBoundingClientRect().left) })));
  const firsts = [...new Set(cols.map((c) => c.first))]; const mis = [...new Set(cols.map((c) => c.mi))];
  ok(cols.length >= 2 && firsts.length === 1 && mis.length === 1, `names lined up: ${JSON.stringify(cols)}`);
  ok(cols.some((c) => c.t === 'DOE, John Q.'), 'middle initial shown');

  // 3. A Mission's number and name in different colours.
  await p.evaluate(async () => { const op = Vault.listOperations()[0]; const c = await Vault.createCase({ number: 'EX-210', subject: 'Mary Poe' }); await Vault.assignCase(c.id, op.id); });
  await home();
  await p.evaluate(() => document.querySelectorAll('#case-list details.mission-group').forEach((d) => { d.open = true; }));
  const colors = await p.evaluate(() => { const g = document.querySelector('#case-list .mission-children .op-name'); return g ? { num: getComputedStyle(g.querySelector('.op-num')).color, title: getComputedStyle(g.querySelector('.op-title')).color } : null; });
  ok(colors && colors.num !== colors.title, `number and name colours: ${JSON.stringify(colors)}`);

  // 4. CLOSED in the case list, with OPERATION and INDEPENDENT inside.
  await p.evaluate(async () => {
    const op = Vault.listOperations()[0];
    const a = await Vault.createCase({ number: 'EX-700', subject: 'Sam Roe' }); a.status = 'Closed'; await Vault.saveCase(a);
    const m = await Vault.createCase({ number: 'EX-710', subject: 'Ann Poe' }); await Vault.assignCase(m.id, op.id); const mm = await Vault.getCase(m.id); mm.status = 'Closed'; await Vault.saveCase(mm);
  });
  await home();
  const closed = await p.evaluate(() => {
    const d = document.querySelector('#case-list .closed-group');
    if (!d) return null;
    d.open = true; d.querySelectorAll('details').forEach((x) => { x.open = true; });
    return { head: d.querySelector(':scope > summary .op-name').textContent, ops: !!d.querySelector('.closed-ops-group'), ind: [...d.querySelectorAll('.general-group .ind-name')].map((x) => x.textContent), text: d.textContent };
  });
  ok(closed && closed.head === 'CLOSED' && closed.ops && closed.ind.includes('GENERAL FILES') && /EX-700/.test(closed.text) && /EX-710/.test(closed.text), `CLOSED folder: ${JSON.stringify(closed && { ...closed, text: closed.text.replace(/\s+/g, ' ').slice(0, 160) })}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});

  // 5. The hidden case list: every button stays inside the rail, at each text size.
  for (const size of [100, 125]) {
    await p.evaluate((s) => CVOptions.setTextSize(s), size);
    await p.evaluate(() => { if (!document.body.classList.contains('sidebar-collapsed')) document.querySelector('#btn-sidebar-collapse').click(); }); await p.waitForTimeout(400);
    const out = await p.evaluate(() => {
      const r = document.querySelector('#sidebar').getBoundingClientRect();
      return [...document.querySelectorAll('#sidebar .sidebar-head > *')].filter((e) => e.offsetParent).map((e) => { const x = e.getBoundingClientRect(); return { id: e.id || e.className, l: Math.round(x.left - r.left), r: Math.round(r.right - x.right) }; }).filter((x) => x.l < 0 || x.r < 1);
    });
    ok(out.length === 0, `text size ${size}%: nothing outside the rail ${JSON.stringify(out)}`);
    await p.locator('#sidebar').screenshot({ path: `${SP}/rail-${size}.png` }).catch(() => {});
  }
  await p.evaluate(() => CVOptions.setTextSize(100));
  await p.evaluate(() => document.querySelector('#btn-sidebar-collapse').click()); await p.waitForTimeout(300);

  // 6. Secure Locker.
  await home();
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  const F = (label) => `#dialog[open] .locker-form .field:has(> span:text-is("${label}")) :is(input, select, textarea)`;

  // Covert Accounts: social media; the email on one line, whole; the Copy buttons whole.
  await p.click('.locker-tabs button:has-text("Covert")'); await p.waitForSelector('.locker-section');
  await p.click('.locker-section button:has-text("Add Account")'); await p.waitForSelector('#dialog[open] .locker-form');
  await p.fill(F('Platform / App'), 'Example Chat'); await p.fill(F('Username / Handle'), 'example.handle.long');
  await p.fill(F('Email'), 'synthetic.covert.account.longaddress@examplecity-mail.example'); await p.fill(F('Department'), 'DEA');
  await p.click('#dialog[open] button:has-text("Add Social Media Account")');
  await p.fill('#dialog[open] input[aria-label="Social Media Account 1 Platform"]', 'Example Photos');
  await p.fill('#dialog[open] input[aria-label="Social Media Account 1 Username / Handle"]', '@example_poe');
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(800);
  const acct = await p.evaluate(() => {
    const row = [...document.querySelectorAll('.locker-rows tbody tr')].find((r) => /Example Chat/.test(r.textContent));
    if (!row) return null;
    const email = row.querySelector('td.col-k-email .copy-text');
    const cells = [...row.querySelectorAll('td.copy-cell')].map((td) => { const b = td.querySelector('.copy-user').getBoundingClientRect(); const t = td.getBoundingClientRect(); return b.right <= t.right + 0.5 && b.left >= t.left - 0.5; });
    const ths = [...row.closest('table').querySelectorAll('thead th')].map((th) => th.textContent);
    return { lines: Math.round(email.getBoundingClientRect().height / parseFloat(getComputedStyle(email).lineHeight || 16)), whole: email.scrollWidth <= email.clientWidth + 1, copies: cells, social: (row.querySelector('.social-tag') || {}).textContent || '', dept: ths.indexOf('Department') };
  });
  // v1.166: one line when the window has room; here (1366 wide, sidebar open) nothing is cut and nothing scrolls sideways.
  ok(acct && acct.whole && await p.evaluate(() => [...document.querySelectorAll('.locker-section .table-wrap')].every((w) => w.scrollWidth <= w.clientWidth)), `email whole, no sideways scroll: ${JSON.stringify(acct)}`);
  ok(acct && acct.copies.length >= 2 && acct.copies.every(Boolean), 'every Copy button is fully shown');
  ok(acct && acct.social === '1 social' && acct.dept === 1, 'social media shown; Department is the second column');
  await p.locator('.locker-open').screenshot({ path: `${SP}/accounts.png` }).catch(() => {});

  // Alias: drop-downs, the state of each ID, more emails and mailing addresses.
  await p.click('.locker-section button:has-text("Add Alias")'); await p.waitForSelector('#dialog[open] .locker-form');
  await p.fill(F('Alias Name'), 'Rick Poe');
  const selects = await p.evaluate(() => ['Gender', 'Nationality', 'Ethnicity', 'Civil Status', 'Blood Type', 'Body Type', 'Driver\'s License State', 'State License / ID State', 'Library Card State', 'Other ID State']
    .map((l) => { const f = [...document.querySelectorAll('#dialog[open] .locker-form .field')].find((x) => x.querySelector(':scope > span') && x.querySelector(':scope > span').textContent === l); return [l, !!(f && f.querySelector('select'))]; }));
  ok(selects.every(([, s]) => s), `drop-downs: ${JSON.stringify(selects)}`);
  await p.selectOption(F('Nationality'), 'Mexican'); await p.selectOption(F('Ethnicity'), 'Hispanic or Latino');
  await p.selectOption(F('Civil Status'), 'Married'); await p.selectOption(F('Body Type'), 'Athletic');
  await p.fill(F('Driver\'s License'), 'D000-0000-0000'); await p.selectOption(F('Driver\'s License State'), 'IL');
  await p.click('#dialog[open] button:has-text("Add Email Address")');
  await p.fill('#dialog[open] input[aria-label="Email Address 1 Email"]', 'rick.poe.second@example.com');
  await p.click('#dialog[open] button:has-text("Add Mailing Address")'); await p.click('#dialog[open] button:has-text("Add Mailing Address")');
  await p.fill('#dialog[open] input[aria-label="Mailing Address 1 Address"]', '1 Example St, Example City');
  await p.fill('#dialog[open] input[aria-label="Mailing Address 2 Address"]', 'PO Box 12, Example City');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/alias-form.png` }).catch(() => {});
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(800);
  await p.click('.locker-rows .locker-edit'); await p.waitForSelector('#dialog[open] .locker-form');
  const back = await p.evaluate(() => {
    const v = (sel) => (document.querySelector(sel) || {}).value;
    const sel = (l) => { const f = [...document.querySelectorAll('#dialog[open] .locker-form .field')].find((x) => x.querySelector(':scope > span') && x.querySelector(':scope > span').textContent === l); return f && f.querySelector('select').value; };
    return { nat: sel('Nationality'), dl: sel('Driver\'s License State'), email2: v('#dialog[open] input[aria-label="Email Address 1 Email"]'), mail2: v('#dialog[open] input[aria-label="Mailing Address 2 Address"]') };
  });
  ok(back.nat === 'Mexican' && back.dl === 'IL' && back.email2 === 'rick.poe.second@example.com' && back.mail2 === 'PO Box 12, Example City', `saved: ${JSON.stringify(back)}`);
  await p.keyboard.press('Escape');

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
