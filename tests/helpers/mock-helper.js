// A Node stand-in for the CaseVault helper (tools/casevault-helper/casevault-helper.ps1), serving the
// same /api/ contract over a temporary folder, so helper-mode storage can be tested without Windows.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function start(dataRoot, port = 0) {
  const safe = (rel) => {
    if (!rel) return dataRoot;
    const segs = rel.split('/');
    if (segs.some((s) => !s || s === '.' || s === '..' || /[\\:*?"<>|\x00-\x1f]/.test(s) || /[. ]$/.test(s))) return null;
    const full = path.resolve(dataRoot, ...segs);
    return full.startsWith(dataRoot + path.sep) ? full : null;
  };
  const entry = (full) => {
    const st = fs.statSync(full);
    return { name: path.basename(full), kind: st.isDirectory() ? 'directory' : 'file', size: st.isDirectory() ? 0 : st.size, mtime: Math.round(st.mtimeMs) };
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    const err = (status, name, message) => json(status, { error: name, message });
    if (!u.pathname.startsWith('/api/')) return err(404, 'NotFoundError', 'no static files in the mock');
    if (req.headers['x-casevault'] !== '1') return err(403, 'SecurityError', 'Only the CaseVault page may use this.');
    const op = u.pathname.slice(5);
    if (op === 'info') return json(200, { app: 'CaseVault helper', version: 'mock', ready: true, root: path.basename(dataRoot), drive: '' });
    if (op === 'sysinfo') return json(200, { ramTotal: 32 * 1024 ** 3, ramFree: 18 * 1024 ** 3, diskTotal: 850 * 1024 ** 3, diskFree: 700 * 1024 ** 3 });
    const rel = u.searchParams.get('p') || '';
    const full = safe(rel);
    if (!full) return err(400, 'SecurityError', 'Invalid path.');
    const exists = fs.existsSync(full);
    const isDir = exists && fs.statSync(full).isDirectory();
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (op === 'stat') return json(200, exists ? entry(full) : null);
      if (op === 'list') {
        if (!exists) return err(404, 'NotFoundError', 'Folder not found.');
        return json(200, fs.readdirSync(full).filter((n) => !n.includes('.cvtmp-')).map((n) => entry(path.join(full, n))));
      }
      if (op === 'read') {
        if (!exists) return err(404, 'NotFoundError', 'File not found.');
        if (isDir) return err(409, 'TypeMismatchError', 'That is a folder.');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Mtime': String(entry(full).mtime) });
        return res.end(fs.readFileSync(full));
      }
      if (op === 'write') {
        if (isDir) return err(409, 'TypeMismatchError', 'That is a folder.');
        if (!fs.existsSync(path.dirname(full))) return err(404, 'NotFoundError', 'Folder not found.');
        const tmp = `${full}.cvtmp-${process.pid}`;
        fs.writeFileSync(tmp, Buffer.concat(chunks));
        fs.renameSync(tmp, full);
        return json(200, entry(full));
      }
      if (op === 'open') {
        // Same rule as the real helper: only an .eml draft in a case's Email folder.
        if (!/^(cases|archive)\/[^/]+\/files\/Email\/[^/]+\.eml$/.test(rel)) return err(403, 'SecurityError', 'Only mail drafts (.eml) in a case\'s Email folder can be opened.');
        if (!exists) return err(404, 'NotFoundError', 'File not found.');
        (server.opened = server.opened || []).push(rel);
        return json(200, { ok: true });
      }
      if (op === 'mkdir') { fs.mkdirSync(full, { recursive: false }); return json(200, entry(full)); }
      if (op === 'remove') {
        if (!rel) return err(400, 'SecurityError', 'Refusing to delete the vault folder itself.');
        if (!exists) return err(404, 'NotFoundError', 'Not found.');
        fs.rmSync(full, { recursive: u.searchParams.get('recursive') === '1' });
        return json(200, { ok: true });
      }
      return err(404, 'NotFoundError', 'Unknown API call.');
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { start };
