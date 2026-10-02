const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const dir = process.env.OUT; const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  for (const f of files) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    const png = await p.evaluate(async (svg) => {
      const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(svg); await img.decode();
      const c = new OffscreenCanvas(96, 96); const g = c.getContext('2d'); g.drawImage(img, 0, 0, 96, 96);
      const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s);
    }, svg);
    fs.writeFileSync(path.join(dir, f.replace('.svg', '.png')), Buffer.from(png, 'base64'));
  }
  const all = [...files.map((f) => path.join(dir, f.replace('.svg', '.png'))), ...(process.env.REF ? fs.readdirSync(process.env.REF).slice(0, 12).map((f) => path.join(process.env.REF, f)) : [])];
  const cell = (bg) => all.map((f) => `<div style="display:inline-block;width:120px;text-align:center;margin:3px;background:${bg};padding:5px;font:10px monospace;color:${bg === '#111' ? '#ccc' : '#333'}"><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:48px;height:48px"> <img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:18px;height:18px"><br>${path.basename(f, '.png')}</div>`).join('');
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.setContent(`<body style="margin:0">${cell('#fff')}<hr>${cell('#111')}</body>`);
  await p.screenshot({ path: path.join(dir, '..', 'sheet.png'), fullPage: true });
  await b.close();
})();
