// v1.167: a closed case is red, not green: the Closed tag, the closed folder icon and the border all
// round its box in the case list, most of all inside a Mission that is still open. A case closed
// with an arrest has an X across its box. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1167';
const red = (rgb) => { const m = String(rgb).match(/\d+(\.\d+)?/g); if (!m) return false; const [r, g, b] = m.map(Number); return r > 140 && r > g * 1.6 && r > b * 1.6; };

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1400, 1000);
  await p.evaluate(async (ids) => {
    const op = Vault.listOperations()[0];
    for (const i of [ids.c, ids.c2]) await Vault.assignCase(i, op.id).catch(() => {});
    const c = await Vault.getCase(ids.c); c.status = 'Closed'; c.arrest = true; await Vault.saveCase(c);
    const d = await Vault.createCase({ number: 'EX-940', subject: 'Ann Roe' }); await Vault.assignCase(d.id, op.id);
    const dd = await Vault.getCase(d.id); dd.status = 'Closed'; await Vault.saveCase(dd);
  }, ids);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll('#case-list details').forEach((d) => { d.open = true; }));
  const look = await p.evaluate((ids) => {
    const box = (i) => document.querySelector(`#case-list .mission-children a.case-item[href="#/case/${CVRoute.enc(i)}"], #case-list a.case-item.case-dim[href="#/case/${CVRoute.enc(i)}"]`);
    const a = box(ids.c); const plain = [...document.querySelectorAll('#case-list a.case-item.case-dim')].find((x) => /EX-940/.test(x.textContent));
    const cs = (e) => getComputedStyle(e);
    return {
      arrest: a && { cls: a.className, img: cs(a).backgroundImage, left: cs(a).borderLeftColor, shadow: cs(a).boxShadow, pill: cs(a.querySelector('.status-closed') || a).color, title: a.title },
      plain: plain && { cls: plain.className, img: cs(plain).backgroundImage, left: cs(plain).borderLeftColor, shadow: cs(plain).boxShadow, lock: cs(plain.querySelector('.case-lock')).color },
      closedIcon: (document.querySelector('#case-list .closed-icon image') || {}).getAttribute?.('href') || '',
    };
  }, ids);
  ok(look.plain && /case-dim/.test(look.plain.cls) && red(look.plain.left) && /rgb\(\s*1[0-9]{2}, 38, 46\)|rgb\(163, 38, 46\)/.test(look.plain.shadow) && red(look.plain.lock), `closed in an open Mission: red border all round and a red lock ${JSON.stringify(look.plain)}`);
  ok(look.plain && look.plain.img === 'none', 'no X without an arrest');
  ok(look.arrest && /closed-arrest/.test(look.arrest.cls) && (look.arrest.img.match(/linear-gradient/g) || []).length === 2 && /X/.test(look.arrest.title), `closed with an arrest: an X across the box ${JSON.stringify(look.arrest && { cls: look.arrest.cls, title: look.arrest.title })}`);
  ok(look.arrest && red(look.arrest.pill), `the Closed tag is red: ${look.arrest && look.arrest.pill}`);
  ok(/folder-closed-shield/.test(look.closedIcon), `the closed folder icon: ${look.closedIcon}`);
  const px = await p.evaluate(async () => {
    const img = new Image(); img.src = 'icons/color/folder-closed-shield.png'; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0, bl = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; }
    return [r, g, bl];
  });
  ok(px[0] > px[1] * 1.5 && px[0] > px[2] * 1.5, `the closed folder is red, not green: ${px}`);
  await p.locator('#sidebar').screenshot({ path: `${SP}/sidebar.png` }).catch(() => {});
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
