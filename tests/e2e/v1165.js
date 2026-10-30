// v1.165: folder counts from 0 everywhere, no + in the case list, plain sidebar icons (green padlock
// kept), certificate pictures kept on the SSD and made only on screen, certificate groups, T for
// Training, the case list kept when only the tab changes, and "Unload When Done" for the AI.
// All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1165';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  const home = async () => { await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(600); };

  // 1. Counts: a Mission with one case shows 1, an empty one 0, on the home page and in the case list.
  await p.evaluate(async () => {
    const one = await Vault.createOperation({ name: 'Smokers Group', number: 'OP-7' });
    const c = await Vault.createCase({ number: 'EX-770', subject: 'Sam Roe' }); await Vault.assignCase(c.id, one.id);
    await Vault.createOperation({ name: 'Empty Op', number: 'OP-8' });
  });
  await home();
  const tiles = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.op-folders-section .op-folder-tile')].map((t) => [t.textContent.replace(/\d+$/, '').trim().split(/\s+/).slice(-2).join(' '), (t.querySelector('.op-folder-count') || {}).textContent])));
  ok(tiles['OP-7Smokers Group'] === '1' || Object.entries(tiles).some(([k, v]) => /OP-7/.test(k) && v === '1'), `a Mission with one case shows 1: ${JSON.stringify(tiles)}`);
  ok(Object.entries(tiles).some(([k, v]) => /OP-8/.test(k) && v === '0'), 'an empty Mission shows 0');
  await p.evaluate(() => document.querySelectorAll('#case-list details.mission-group').forEach((d) => { d.open = true; }));
  const side = await p.evaluate(() => [...document.querySelectorAll('#case-list .op-head')].map((hd) => [hd.textContent.replace(/\s+/g, ' ').trim().slice(0, 20), (hd.querySelector(':scope > .op-count') || {}).textContent]));
  ok(side.some(([t, n]) => /OP-7/.test(t) && n === '1') && side.some(([t, n]) => /OP-8/.test(t) && n === '0') && side.some(([t, n]) => /MISSIONS/.test(t) && /^\d+$/.test(n || '')), `case list counts from 0, missions counted: ${JSON.stringify(side)}`);
  ok(await p.evaluate(() => !document.querySelector('#case-list .mission-add, #case-list .general-add')), 'no + buttons in the case list');

  // 2. Plain icons at the top of the case list; the padlock keeps its colour.
  const icons = await p.evaluate(() => [...document.querySelectorAll('.sidebar-head .icon-btn')].filter((x) => x.offsetParent).map((x) => { const im = x.querySelector('svg image'); return [x.id, im ? getComputedStyle(im).display : 'none']; }));
  ok(icons.filter(([id]) => id !== 'btn-sidebar-lock').every(([, d]) => d === 'none') && icons.some(([id, d]) => id === 'btn-sidebar-lock' && d !== 'none'), `silhouettes, green padlock: ${JSON.stringify(icons)}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});

  // 3. The case list isn't drawn again when only the tab changes.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids.c); await p.waitForSelector('.tabs a.tab.active'); await p.waitForTimeout(500);
  await p.evaluate(() => { document.querySelector('#case-list a.case-item.active').dataset.mark = 'kept'; });
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/timeline`; }, ids.c); await p.waitForTimeout(600);
  ok(await p.evaluate(() => !!document.querySelector('#case-list a.case-item.active[data-mark="kept"]')), 'a tab change keeps the case list as it is');

  // 4. Training: groups, a picture kept on the SSD, T opens it.
  await p.evaluate(async () => {
    const pdf = (title) => new File([CVTraining.build([{ course: title, date: '2025-01-01', hours: '8' }], { name: 'Det. Alex Sample' })], `${title}.pdf`, { type: 'application/pdf' });
    for (const t of ['CPR Basics', 'CPR Refresher', 'Firearms Qual', 'Report Writing']) await Vault.addShared('other', 'Training', pdf(t));
    await Vault.saveTraining({ 'CPR Basics.pdf': { group: 'CPR' }, 'CPR Refresher.pdf': { group: 'cpr' }, 'Firearms Qual.pdf': { group: 'Firearms' } });
  });
  await home();
  await p.keyboard.press('t'); await p.waitForSelector('.cert-groups .cert-group-head', { timeout: 15000 }).catch(() => {});
  const heads = await p.$$eval('.cert-group-head', (x) => x.map((e) => e.firstChild.textContent));
  ok(JSON.stringify(heads) === JSON.stringify(['CPR', 'Firearms', 'Other Certificates']), `T opens Training; the certificates under their groups: ${JSON.stringify(heads)}`);
  await p.waitForSelector('.cert-art.has-thumb', { timeout: 20000 }).catch(() => {});
  // Pictures are made as their cards come on screen: scroll to the last card.
  await p.evaluate(() => [...document.querySelectorAll('.cert-card')].pop().scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(2500);
  const saved = await p.evaluate(async () => {
    const files = await Vault.listShared('other', 'Training');
    const f = files.find((x) => x.base === 'CPR Basics.pdf');
    const name = `${f.base.replace(/[^\w.-]+/g, '_').slice(0, 80)}~${f.size}-${Math.round(f.modified || 0)}.png`;
    const blob = await Vault.readSharedThumb('other', 'Training', name);
    return { pictures: document.querySelectorAll('.cert-art.has-thumb').length, kept: !!blob && blob.size > 100, listed: files.map((x) => x.base).every((n) => !n.startsWith('.')) };
  });
  ok(saved.pictures === 4 && saved.kept && saved.listed, `pictures made and kept on the SSD (hidden from the list): ${JSON.stringify(saved)}`);
  // Arrange: drag Report Writing onto a CPR card: it joins CPR.
  await p.click('.shared-open-head button:has-text("Arrange")'); await p.waitForTimeout(400);
  // The drag, as the browser fires it (the pictures appearing as cards scroll in move the cards about,
  // which throws a mouse-driven drag off in a test).
  await p.evaluate(() => {
    const from = document.querySelector('.cert-card[data-file="Report Writing.pdf"]');
    const to = document.querySelector('.cert-card[data-file="CPR Refresher.pdf"]');
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  });
  await p.waitForTimeout(900);
  const meta = await p.evaluate(() => Vault.readTraining());
  ok(meta['Report Writing.pdf'] && meta['Report Writing.pdf'].group === 'CPR', `dropped on another group's card, it joins it: ${JSON.stringify(meta['Report Writing.pdf'])}`);
  const heads2 = await p.$$eval('.cert-group-head', (x) => x.map((e) => e.firstChild.textContent));
  ok(JSON.stringify(heads2) === JSON.stringify(['CPR', 'Firearms']), `no "Other" left: ${JSON.stringify(heads2)}`);
  await p.locator('.shared-files').first().screenshot({ path: `${SP}/groups.png` }).catch(() => {});

  // 5. AI: "Unload When Done" unloads the model a check used when the check ends.
  const sent = [];
  await p.route('http://127.0.0.1:11434/**', async (route) => { const r = route.request(); sent.push([r.url().replace(/^.*\/api\//, ''), r.postData()]); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: { content: 'x' }, done: true }) }); });
  await p.evaluate(async () => {
    CVAI.setKeepChoice('0');
    const f = CVActivity.wrap(fetch);
    await CVActivity.exclusive('check', () => f('http://127.0.0.1:11434/api/chat', { method: 'POST', body: JSON.stringify({ model: 'example:7b', stream: false, keep_alive: CVAI.keepAlive() }) }));
  });
  await p.waitForTimeout(500);
  const unload = sent.find(([u, body]) => u === 'generate' && /"keep_alive":0/.test(body || '') && /example:7b/.test(body || ''));
  ok(!!unload && /"keep_alive":"2m"/.test(sent[0][1] || ''), `kept during the check, unloaded at its end: ${JSON.stringify(sent)}`);
  await p.evaluate(() => CVAI.setKeepChoice('10m'));

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
