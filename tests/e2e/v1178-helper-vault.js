// v1.178 (helper 1.17): the helper opens the vault on the drive labelled CASEVAULT before any other
// drive with a vault, and stays with the vault it opened first (a drive letter change is fine; an
// old SSD, a copy or another stick is not). Runs the real helper in PowerShell 7 (pwsh) with folders standing
// in for drives (-SimulatedDrives); skipped when pwsh isn't installed. Made-up data only.
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const PWSH = process.env.PWSH || 'pwsh';
const KEY = 'abcdef0123456789abcdef0123456789';
const HELPER = path.resolve(__dirname, '..', '..', 'tools', 'casevault-helper', 'casevault-helper.ps1');
const APP = path.resolve(__dirname, '..', '..');
const PORT = 8597;

if (spawnSync(PWSH, ['-NoProfile', '-Command', 'exit 0']).status !== 0) { console.log('SKIP PowerShell (pwsh) is not installed'); process.exit(0); }

const H = { 'X-CaseVault': '1', 'X-CaseVault-Key': KEY };
function api(method, op, query = '', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const len = body != null ? { 'Content-Length': Buffer.byteLength(body) } : {}; // never chunked (the helper refuses that)
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: `/api/${op}${query ? `?${query}` : ''}`, headers: { ...H, ...len, ...headers } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ } resolve({ status: res.statusCode, text, json }); });
    });
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}
function makeVault(root, id, mark) {
  const d = path.join(root, 'CaseVault-Data');
  fs.mkdirSync(path.join(d, 'cases'), { recursive: true });
  fs.writeFileSync(path.join(d, 'vault.json'), JSON.stringify({ app: 'CaseVault', schema: 1, vaultId: id, cases: [], operations: [], settings: {} }));
  fs.writeFileSync(path.join(d, 'which.txt'), mark);
}
async function start(args, out) {
  const proc = spawn(PWSH, ['-NoProfile', '-File', HELPER, '-Port', String(PORT), '-AppPath', APP, '-NoBrowser', '-NoAI', '-SessionKey', KEY, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', (d) => { out.text += d; }); proc.stderr.on('data', (d) => { out.text += d; });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return proc;
}
const stop = async (proc) => { proc.kill(); await new Promise((r) => setTimeout(r, 800)); };
const which = async () => { const r = await api('GET', 'read', 'p=which.txt'); return r.status === 200 ? r.text : `(${r.status})`; };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-drives-'));
  const d = (n) => path.join(dir, n);
  try {
    // ---- 1. The drive labelled CASEVAULT wins over an earlier drive with a vault (an old SSD).
    for (const n of ['E', 'F', 'G', 'H']) fs.mkdirSync(d(n));
    makeVault(d('E'), 'old-ssd-vault', 'old SSD');
    makeVault(d('F'), 'the-real-vault', 'CASEVAULT');
    // G: not plugged in yet (the same SSD, later, under another letter); H: a copy of the vault elsewhere.
    fs.rmSync(d('G'), { recursive: true });
    const drives = `${d('E')}|OLDSSD|1111AAAA;${d('F')}|CASEVAULT|2222BBBB;${d('G')}|CASEVAULT|2222BBBB;${d('H')}|CASEVAULT|3333CCCC`;
    let out = { text: '' };
    let proc = await start(['-SimulatedDrives', drives], out);
    let info = (await api('GET', 'info')).json;
    ok(info && info.ready && info.vaultId === 'the-real-vault' && await which() === 'CASEVAULT', `the CASEVAULT drive is opened, not the old SSD before it: ${JSON.stringify(info)}`);
    ok(info.volumeSerial === '2222BBBB', `/api/info names the pinned vault and volume: ${info.vaultId} ${info.volumeSerial}`);

    // ---- 2. The SSD drops out: no other vault is used in its place, even one labelled CASEVAULT.
    makeVault(d('H'), 'the-real-vault', 'a copy');
    fs.renameSync(d('F'), d('F-unplugged'));
    info = (await api('GET', 'info')).json;
    ok(info && !info.ready, `with the SSD gone the helper reports "not connected", not the old SSD or the copy: ${JSON.stringify(info)}`);
    const w = await api('PUT', 'write', 'p=after.txt', 'x');
    ok(w.status === 503 && !fs.existsSync(path.join(d('E'), 'CaseVault-Data', 'after.txt')) && !fs.existsSync(path.join(d('H'), 'CaseVault-Data', 'after.txt')), `writes are refused while it is gone (${w.status}), and nothing lands on another drive`);

    // ---- 3. The same SSD back under another drive letter (F: -> G:): accepted.
    fs.renameSync(d('F-unplugged'), d('G'));
    info = (await api('GET', 'info')).json;
    ok(info && info.ready && info.vaultId === 'the-real-vault' && await which() === 'CASEVAULT', `the same vault under a new drive letter is used again: ${JSON.stringify(info)}`);

    await stop(proc);

    // ---- 4. No drive labelled CASEVAULT: the vault on another drive is used, with a warning.
    out = { text: '' };
    proc = await start(['-SimulatedDrives', `${d('E')}|OLDSSD|1111AAAA`], out);
    info = (await api('GET', 'info')).json;
    ok(info && info.ready && info.vaultId === 'old-ssd-vault', `without a CASEVAULT drive the other vault is used: ${JSON.stringify(info)}`);
    await new Promise((r) => setTimeout(r, 300));
    ok(/No drive is labelled CASEVAULT/.test(out.text), 'and the helper window warns about it');
    await stop(proc);

    // ---- 5. -DataPath still overrides the drive search.
    out = { text: '' };
    proc = await start(['-SimulatedDrives', drives, '-DataPath', path.join(d('E'), 'CaseVault-Data')], out);
    ok(await which() === 'old SSD', '-DataPath still picks the folder it names');
    await stop(proc);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
