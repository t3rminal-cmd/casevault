#!/usr/bin/env node
/* CaseVault browser tests (v1.98).
 *
 * Runs every test in this folder in Chromium (Playwright) against the app served from the repo by
 * `python3 -m http.server 8765`. Every test makes up its own vault with Doe/Roe/Poe data in the
 * browser's private storage; nothing is read from or written to a real vault.
 *
 *   node tests/e2e/run.js                 all tests
 *   node tests/e2e/run.js v195 v196       only these
 *
 * Needs Playwright (npm i --no-save playwright && npx playwright install chromium). A test fails
 * when it exits with an error, prints a line starting with FAIL, or reports page errors
 * ("errors [...]" not empty). Screenshots and PDFs go to a temporary folder (SP), never the repo.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const PORT = 8765;
const SKIP = new Set(['run.js', 'boot.js', 'openall.js']);
const TIMEOUT_MS = 240000;

const portOpen = () => new Promise((resolve) => {
  const s = net.connect(PORT, '127.0.0.1', () => { s.end(); resolve(true); });
  s.on('error', () => resolve(false));
});

async function startServer() {
  if (await portOpen()) return null; // already running (e.g. by hand)
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await portOpen()); i += 1) await new Promise((r) => setTimeout(r, 100));
  return srv;
}

function runOne(file, SP) {
  const src = fs.readFileSync(path.join(HERE, file), 'utf8');
  // Tests save screenshots under SP/<folder>/...: make those folders.
  for (const m of src.matchAll(/(?:process\.env\.SP \+ '|\$\{SP\})\/([\w-]+)\//g)) fs.mkdirSync(path.join(SP, m[1]), { recursive: true });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, file)], { cwd: SP, env: { ...process.env, SP }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += `\nFAIL timed out after ${TIMEOUT_MS / 1000} s`; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      const lines = out.split('\n');
      const fails = lines.filter((l) => /^FAIL\b/.test(l));
      const pageErrors = lines.filter((l) => /^errors:? \[(?!\s*\])/.test(l));
      const skipped = lines.some((l) => /^SKIP\b/.test(l));
      resolve({ file, ok: code === 0 && !fails.length && !pageErrors.length, skipped, code, fails, pageErrors, out, passes: lines.filter((l) => /^PASS\b/.test(l)).length });
    });
  });
}

(async () => {
  const want = process.argv.slice(2);
  const files = fs.readdirSync(HERE).filter((f) => f.endsWith('.js') && !SKIP.has(f))
    .filter((f) => !want.length || want.some((w) => f.startsWith(w))).sort();
  const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'casevault-e2e-'));
  const srv = await startServer();
  const results = [];
  for (const f of files) {
    const r = await runOne(f, SP);
    results.push(r);
    // Older tests have no PASS/FAIL lines: they drive the screens and fail on any crash, page error or timeout.
    console.log(`${r.skipped ? 'SKIP' : r.ok ? 'ok  ' : 'FAIL'}  ${f}  (${r.passes ? `${r.passes} checks` : 'smoke test'})`);
    if (!r.ok) console.log(r.out.split('\n').filter((l) => l.trim()).slice(-25).map((l) => `      ${l}`).join('\n'));
  }
  if (srv) srv.kill();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length} of ${results.length} browser tests passed. Output: ${SP}`);
  process.exit(bad.length ? 1 : 0);
})();
