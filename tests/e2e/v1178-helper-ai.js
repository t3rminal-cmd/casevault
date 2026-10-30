// v1.178 (helper 1.17): /api/info says where the running AI engine comes from: 'ssd' (Ollama from
// the drive's own ollama folder), 'external' (any other, e.g. installed on the PC, which logs there)
// or 'none'. Runs a copy of the real helper in PowerShell 7 (pwsh) on a made-up drive, with a
// stand-in program named "ollama"; skipped when pwsh isn't installed (or off Linux/macOS).
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const PWSH = process.env.PWSH || 'pwsh';
const KEY = '00112233445566778899aabbccddeeff';
const HELPER = path.resolve(__dirname, '..', '..', 'tools', 'casevault-helper', 'casevault-helper.ps1');
const APP = path.resolve(__dirname, '..', '..');
const PORT = 8595;
const SLEEP = ['/bin/sleep', '/usr/bin/sleep'].find((f) => fs.existsSync(f));

if (spawnSync(PWSH, ['-NoProfile', '-Command', 'exit 0']).status !== 0) { console.log('SKIP PowerShell (pwsh) is not installed'); process.exit(0); }
if (!SLEEP) { console.log('SKIP no sleep program to stand in for Ollama'); process.exit(0); }

const info = () => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/info', headers: { 'X-CaseVault': '1', 'X-CaseVault-Key': KEY } }, (res) => {
    let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { try { resolve(JSON.parse(t)); } catch (e) { reject(e); } });
  });
  req.on('error', reject); req.end();
});
// A copy of sleep called "ollama": Get-Process sees a process named ollama, from that file.
function fakeOllama(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'ollama');
  fs.copyFileSync(SLEEP, exe); fs.chmodSync(exe, 0o755);
  return spawn(exe, ['600'], { stdio: 'ignore' });
}
const kill = async (proc) => { if (proc) proc.kill(); await new Promise((r) => setTimeout(r, 400)); };

(async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cv-ai-')));
  // W:\casevault-helper\casevault-helper.ps1 and W:\ollama, as on the CV-AI drive.
  const w = path.join(dir, 'W');
  fs.mkdirSync(path.join(w, 'casevault-helper'), { recursive: true });
  fs.copyFileSync(HELPER, path.join(w, 'casevault-helper', 'casevault-helper.ps1'));
  const data = path.join(dir, 'V', 'CaseVault-Data'); fs.mkdirSync(data, { recursive: true });
  const helper = spawn(PWSH, ['-NoProfile', '-File', path.join(w, 'casevault-helper', 'casevault-helper.ps1'), '-Port', String(PORT), '-DataPath', data, '-AppPath', APP, '-NoBrowser', '-NoAI', '-SessionKey', KEY], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  let other = null; let mine = null;
  try {
    ok((await info()).aiEngine === 'none', 'no Ollama running: "none"');
    other = fakeOllama(path.join(dir, 'Program Files', 'Ollama'));
    await new Promise((r) => setTimeout(r, 300));
    ok((await info()).aiEngine === 'external', 'an Ollama from anywhere but the drive\'s ollama folder: "external"');
    await kill(other); other = null;
    mine = fakeOllama(path.join(w, 'ollama'));
    await new Promise((r) => setTimeout(r, 300));
    ok((await info()).aiEngine === 'ssd', 'the drive\'s own Ollama: "ssd"');
    other = fakeOllama(path.join(dir, 'elsewhere'));
    await new Promise((r) => setTimeout(r, 300));
    ok((await info()).aiEngine === 'external', 'both running: "external" (CaseVault can\'t tell which one answers)');
  } finally {
    await kill(other); await kill(mine); helper.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
