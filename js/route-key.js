/* CaseVault — addresses that don't show case data (v1.151).
 *
 * Links inside the app (#/case/<id>/…, #/group/<name>, a report's name) end up in the browser's
 * history on the PC. Case IDs are made from case numbers and Case Groups are named after people,
 * so those parts of the address are scrambled with a key kept in vault.json on the SSD:
 * "#/case/2026-EX-100" becomes "#/case/~Xb3…". Without the SSD the address means nothing.
 *
 * The same text always gives the same address (links can be compared), and it is decoded with
 * the key alone (no list to look things up in): an 8-byte tag made from the key and the text,
 * then the text mixed with a SHA-256 key stream made from the key and that tag. Before a vault is
 * open, or for an old address with the plain ID, the text is used as it is.
 * Plain logic, tested under Node.
 */
'use strict';

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVRoute = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
  const D = () => root.CVDiscovery || (typeof require === 'function' ? require('./discovery-core.js') : null);
  const te = new TextEncoder();
  const td = new TextDecoder();
  let secret = '';
  const memo = new Map();

  const hexBytes = (hex) => Uint8Array.from(hex.match(/../g) || [], (x) => parseInt(x, 16));
  const sha = (...parts) => {
    const s = new (D().Sha256)();
    parts.forEach((p, i) => { if (i) s.update(te.encode('|')); s.update(typeof p === 'string' ? te.encode(p) : p); });
    return hexBytes(s.hex());
  };
  const b64u = (u) => { let s = ''; u.forEach((b) => { s += String.fromCharCode(b); }); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (t) => { const s = t.replace(/-/g, '+').replace(/_/g, '/'); const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  function stream(tag, n) {
    const out = new Uint8Array(n);
    for (let i = 0, block = 0; i < n; block++) { const k = sha(secret, 'stream', tag, String(block)); for (let j = 0; j < k.length && i < n; j++, i++) out[i] = k[j]; }
    return out;
  }

  /** Use this key (hex, from vault.json); '' turns scrambling off. */
  function setSecret(hex) {
    const next = /^[0-9a-f]{32,128}$/.test(String(hex || '')) ? String(hex) : '';
    if (next !== secret) { secret = next; memo.clear(); }
  }
  const newSecret = () => [...root.crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

  /** The address part for this text (what encodeURIComponent was used for before). */
  function enc(text) {
    const t = String(text == null ? '' : text);
    if (!secret || !t) return encodeURIComponent(t);
    if (memo.has(t)) return memo.get(t);
    const plain = te.encode(t);
    const tag = sha(secret, 'tag', plain).slice(0, 8);
    const ks = stream(tag, plain.length);
    const out = `~${b64u(Uint8Array.from([...tag, ...plain.map((b, i) => b ^ ks[i])]))}`;
    memo.set(t, out);
    return out;
  }

  /** The text back from an address part, or null when it was scrambled with another key. */
  function dec(part) {
    const p = String(part == null ? '' : part);
    if (!p.startsWith('~')) { try { return decodeURIComponent(p); } catch { return p; } }
    if (!secret) return null;
    try {
      const u = unb64u(p.slice(1));
      if (u.length < 9) return null;
      const tag = u.slice(0, 8);
      const ks = stream(tag, u.length - 8);
      const plain = u.slice(8).map((b, i) => b ^ ks[i]);
      const check = sha(secret, 'tag', plain).slice(0, 8);
      if (check.some((b, i) => b !== tag[i])) return null;
      return td.decode(plain);
    } catch { return null; }
  }

  const isScrambled = (part) => String(part || '').startsWith('~');
  return { setSecret, newSecret, enc, dec, isScrambled, get active() { return !!secret; } };
});
