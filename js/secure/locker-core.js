/* CaseVault — Secure Locker: the encryption (v1.111).
 *
 * The locker (Other Files → Secure Locker) keeps the Password Manager, Confidential (Informant)
 * Files and the Covert aliases and accounts encrypted on the SSD, behind a password of its own
 * (not the PIN). Nothing in it can be read without the password or the recovery key.
 *
 * How:
 * - A random 256-bit data key encrypts everything (AES-256-GCM, a fresh 12-byte IV each time, and
 *   the file's own name as additional data so files can't be swapped around).
 * - The data key is kept in locker.json twice, each encrypted with a key made from:
 *   the password (PBKDF2-SHA-256, 600,000 rounds, random salt), and
 *   the recovery key (160 random bits shown once as 8 groups of 4 letters/digits; PBKDF2 too).
 * - Changing the password or using the recovery key only re-encrypts the data key.
 * - The data key, once opened, is a non-extractable CryptoKey that lives in memory until the
 *   locker is locked.
 *
 * Plain logic over WebCrypto (browser, or Node's globalThis.crypto for the tests).
 */
'use strict';

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVLockerCore = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
  const C = () => (root && root.crypto) || globalThis.crypto;
  const ITER = 600000;
  const RK_ITER = 100000; // the recovery key is 160 random bits: no need for more
  const MIN_PASSWORD = 10;
  const te = new TextEncoder();
  const td = new TextDecoder();

  const b64 = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(String(s || '')), (ch) => ch.charCodeAt(0));
  const rand = (n) => C().getRandomValues(new Uint8Array(n));

  // Recovery key: Crockford base32 (no I, L, O, U), 32 characters in groups of 4.
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function toB32(u8) {
    let bits = 0; let val = 0; let out = '';
    for (const x of u8) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
    if (bits) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  /** Typed recovery key -> its 32 characters (dashes, spaces and case ignored; O→0, I/L→1). */
  const cleanRecovery = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  const groupRecovery = (s) => cleanRecovery(s).match(/.{1,4}/g).join('-');
  const newRecoveryKey = () => groupRecovery(toB32(rand(20)));
  const recoveryLooksRight = (s) => cleanRecovery(s).length === 32 && [...cleanRecovery(s)].every((ch) => B32.includes(ch));

  /** Why a new password isn't good enough ('' when it is). */
  function passwordProblem(pw, again) {
    const p = String(pw || '');
    if (p.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters.`;
    if (/^(.)\1+$/.test(p)) return 'Not one character repeated.';
    if (again != null && p !== again) return 'The two passwords are not the same.';
    return '';
  }

  async function kek(secret, salt, iter) {
    const base = await C().subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return C().subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, bytes, aad) {
    const iv = rand(12);
    const ct = new Uint8Array(await C().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, bytes));
    return { iv, ct };
  }
  async function wrap(raw, secret, iter, aad) {
    const salt = rand(16);
    const { iv, ct } = await seal(await kek(secret, salt, iter), raw, aad);
    return { salt: b64(salt), iv: b64(iv), ct: b64(ct), iter };
  }
  async function unwrapRaw(slot, secret, aad) {
    const key = await kek(secret, unb64(slot.salt), slot.iter);
    return new Uint8Array(await C().subtle.decrypt({ name: 'AES-GCM', iv: unb64(slot.iv), additionalData: te.encode(aad) }, key, unb64(slot.ct)));
  }
  const dataKey = (raw) => C().subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

  /** A new locker: -> { header (for locker.json), key (CryptoKey), recoveryKey (show once) }. */
  async function create(password) {
    const problem = passwordProblem(password);
    if (problem) throw Object.assign(new Error(problem), { name: 'TypeError' });
    const raw = rand(32);
    const recoveryKey = newRecoveryKey();
    const header = { v: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', created: new Date().toISOString(),
      pw: await wrap(raw, password, ITER, 'pw'), rk: await wrap(raw, cleanRecovery(recoveryKey), RK_ITER, 'rk') };
    const key = await dataKey(raw);
    raw.fill(0);
    return { header, key, recoveryKey };
  }

  const wrong = (what) => Object.assign(new Error(what === 'rk' ? 'That recovery key does not open this locker.' : 'Wrong password.'), { name: 'WrongSecretError' });
  /** Open with the password (how 'pw') or the recovery key ('rk'). -> CryptoKey; WrongSecretError when it doesn't fit. */
  async function open(header, secret, how = 'pw') {
    const slot = header && header[how];
    if (!slot) throw wrong(how);
    let raw;
    try { raw = await unwrapRaw(slot, how === 'rk' ? cleanRecovery(secret) : String(secret || ''), how); } catch { throw wrong(how); }
    const key = await dataKey(raw);
    raw.fill(0);
    return key;
  }

  /** A new password, proven by the current password or the recovery key. -> the new header. */
  async function changePassword(header, secret, how, newPassword) {
    const problem = passwordProblem(newPassword);
    if (problem) throw Object.assign(new Error(problem), { name: 'TypeError' });
    let raw;
    try { raw = await unwrapRaw(header[how], how === 'rk' ? cleanRecovery(secret) : String(secret || ''), how); } catch { throw wrong(how); }
    const next = { ...header, pw: await wrap(raw, newPassword, ITER, 'pw'), changed: new Date().toISOString() };
    raw.fill(0);
    return next;
  }

  /** A new recovery key (the old one stops working), proven by the password. -> { header, recoveryKey }. */
  async function newRecovery(header, password) {
    let raw;
    try { raw = await unwrapRaw(header.pw, String(password || ''), 'pw'); } catch { throw wrong('pw'); }
    const recoveryKey = newRecoveryKey();
    const next = { ...header, rk: await wrap(raw, cleanRecovery(recoveryKey), RK_ITER, 'rk') };
    raw.fill(0);
    return { header: next, recoveryKey };
  }

  // A file in the locker: [12-byte IV][ciphertext + tag], bound to its name.
  async function encrypt(key, bytes, name) {
    const { iv, ct } = await seal(key, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), `file:${name}`);
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0); out.set(ct, 12);
    return out;
  }
  async function decrypt(key, bytes, name) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 28) throw Object.assign(new Error(`${name} is damaged.`), { name: 'CorruptFileError' });
    try {
      return new Uint8Array(await C().subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12), additionalData: te.encode(`file:${name}`) }, key, u8.slice(12)));
    } catch { throw Object.assign(new Error(`${name} could not be opened: it is damaged or from another locker.`), { name: 'CorruptFileError' }); }
  }
  const encryptJSON = (key, obj, name) => encrypt(key, te.encode(JSON.stringify(obj)), name);
  const decryptJSON = async (key, bytes, name) => JSON.parse(td.decode(await decrypt(key, bytes, name)));

  /* ---------- what the locker holds ---------- */
  // [key, label, kind]; kind 'secret' is hidden until shown, and has Copy.
  const TABLES = {
    passwords: { title: 'Password Manager', item: 'Password', icon: 'key', fields: [['site', 'Site / System', 'text'], ['username', 'Username', 'text'], ['password', 'Password', 'secret'], ['url', 'Web Address', 'text'], ['notes', 'Notes', 'wide']] },
    aliases: { title: 'Covert Aliases', item: 'Alias', icon: 'person-badge', fields: [['alias', 'Alias Name', 'text'], ['dob', 'Date of Birth Used', 'date'], ['address', 'Address Used', 'text'], ['idNumber', 'ID / License Number', 'text'], ['phone', 'Phone Number', 'text'], ['email', 'Email', 'text'], ['backstory', 'Backstory / Notes', 'wide']] },
    accounts: { title: 'Covert Accounts', item: 'Account', icon: 'globe2', fields: [['platform', 'Platform / App', 'text'], ['handle', 'Username / Handle', 'text'], ['password', 'Password', 'secret'], ['alias', 'Alias It Belongs To', 'text'], ['phone', 'Phone Number', 'text'], ['email', 'Email', 'text'], ['notes', 'Notes', 'wide']] },
  };
  const emptyData = () => ({ v: 1, passwords: [], aliases: [], accounts: [], files: [] });
  function normalizeData(d) {
    const x = { ...emptyData(), ...(d && typeof d === 'object' ? d : {}) };
    for (const t of Object.keys(TABLES)) x[t] = (Array.isArray(x[t]) ? x[t] : []).filter((r) => r && typeof r === 'object').map((r) => ({ id: String(r.id || ''), ...Object.fromEntries(TABLES[t].fields.map(([k]) => [k, String(r[k] == null ? '' : r[k])])) }));
    x.files = (Array.isArray(x.files) ? x.files : []).filter((f) => f && /^[a-z0-9]{8,40}$/.test(String(f.id || ''))).map((f) => ({ id: String(f.id), name: String(f.name || 'file'), type: String(f.type || ''), size: Number(f.size) || 0, added: String(f.added || ''), label: String(f.label || ''), notes: String(f.notes || '') }));
    return x;
  }
  const newId = () => toB32(rand(10)).toLowerCase();
  /** Rows matching every word typed (any column but the secrets). */
  function filterRows(table, rows, q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    const keys = TABLES[table].fields.filter(([, , k]) => k !== 'secret').map(([k]) => k);
    return rows.filter((r) => { const t = keys.map((k) => r[k]).join(' ').toLowerCase(); return words.every((w) => t.includes(w)); });
  }
  /** A strong random password for the Password Manager: 20 characters, no look-alikes. */
  function generatePassword(n = 20) {
    const set = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#$%&*+-=?@';
    const out = [];
    while (out.length < n) { const b = rand(1)[0]; if (b < 256 - (256 % set.length)) out.push(set[b % set.length]); }
    return out.join('');
  }

  return { ITER, RK_ITER, MIN_PASSWORD, passwordProblem, newRecoveryKey, cleanRecovery, groupRecovery, recoveryLooksRight, create, open, changePassword, newRecovery,
    encrypt, decrypt, encryptJSON, decryptJSON, TABLES, emptyData, normalizeData, newId, filterRows, generatePassword };
});
