// v1.178 (helper 1.17): a write must state its size as a plain number (a negative, missing or
// non-numeric Content-Length used to write an empty file over the real one), not be over the size
// limit, and not be chunked. Runs the real helper in PowerShell 7 (pwsh); skipped when pwsh isn't
// installed. Made-up data only.
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const PWSH = process.env.PWSH || 'pwsh';
const KEY = '0123456789abcdef0123456789abcdef';
const HELPER = path.resolve(__dirname, '..', '..', 'tools', 'casevault-helper', 'casevault-helper.ps1');
const APP = path.resolve(__dirname, '..', '..');
const PORT = 8596;

if (spawnSync(PWSH, ['-NoProfile', '-Command', 'exit 0']).status !== 0) { console.log('SKIP PowerShell (pwsh) is not installed'); process.exit(0); }

// A request written by hand, for headers fetch won't send (a negative length, chunked).
function raw(lines, body = '') {
  return new Promise((resolve) => {
    let out = '';
    const s = net.connect(PORT, '127.0.0.1', () => s.write(`${lines.join('\r\n')}\r\n\r\n${body}`));
    s.on('data', (d) => { out += d; });
    s.on('close', () => resolve({ status: Number((out.match(/^HTTP\/1\.1 (\d+)/) || [])[1] || 0), text: out }));
    s.on('error', () => resolve({ status: 0, text: out }));
    setTimeout(() => s.destroy(), 8000);
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-upload-'));
  const data = path.join(dir, 'ssd', 'CaseVault-Data');
  fs.mkdirSync(data, { recursive: true });
  const file = path.join(data, 'report.txt');
  const proc = spawn(PWSH, ['-NoProfile', '-File', HELPER, '-Port', String(PORT), '-DataPath', data, '-AppPath', APP, '-NoBrowser', '-NoAI', '-SessionKey', KEY], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const head = (extra) => [`PUT /api/write?p=report.txt HTTP/1.1`, `Host: 127.0.0.1:${PORT}`, 'X-CaseVault: 1', `X-CaseVault-Key: ${KEY}`, ...extra];
  const kept = () => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === 'Report for Example City';
  try {
    const body = 'Report for Example City';
    const good = await raw(head([`Content-Length: ${Buffer.byteLength(body)}`]), body);
    ok(good.status === 200 && kept(), `a normal write works (${good.status})`);
    const neg = await raw(head(['Content-Length: -1']));
    ok(neg.status === 400 && kept(), `Content-Length -1 is refused (${neg.status}) and the file is untouched`);
    const word = await raw(head(['Content-Length: ten']));
    ok(word.status === 400 && kept() && /not a number/.test(word.text), `a Content-Length that isn't a number is refused (${word.status})`);
    const huge = await raw(head([`Content-Length: ${64 * 1024 * 1024 * 1024}`]));
    ok(huge.status === 413 && kept() && /too large/.test(huge.text), `a body over the limit is refused with 413 (${huge.status})`);
    const overflow = await raw(head(['Content-Length: 99999999999999999999999']));
    ok(overflow.status === 413 && kept(), `a size too big to be a number at all: 413 (${overflow.status})`);
    const chunked = await raw(head(['Transfer-Encoding: chunked']), '5\r\nhello\r\n0\r\n\r\n');
    ok(chunked.status === 411 && kept(), `a chunked body is refused with 411 (${chunked.status})`);
    const none = await raw(head([]));
    ok(none.status === 411 && kept(), `no Content-Length at all: 411 (${none.status})`);
    ok(!fs.readdirSync(data).some((n) => n.includes('.cvtmp-')), 'no half-written temp file is left behind');
  } finally {
    proc.kill(); await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
