/* CaseVault — online AI API keys (Anthropic, Google Gemini, OpenRouter): check, mask, and lock
 * with a passphrase.
 *
 * Where the key can live (the user chooses when adding it):
 *   - "session": in memory only. Gone when the tab closes, the vault changes or the SSD is unplugged.
 *   - "locked":  on the SSD in CaseVault-Data/secrets/<provider>.json, encrypted with a passphrase
 *                (AES-256-GCM, key from PBKDF2-SHA-256, 310,000 rounds). Asked once per session.
 *   - "plain":   on the SSD unencrypted, protected only by BitLocker on the CASEVAULT drive.
 * Never in the browser's own storage, never in vault.json, never in a log.
 *
 * Plain logic with no DOM, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const ITERATIONS = 310000;
  const subtle = () => (root.crypto || globalThis.crypto).subtle;
  const rand = (n) => (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(n));

  const b64 = (u8) => {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (const b of u8) s += String.fromCharCode(b);
    return btoa(s);
  };
  const unb64 = (s) => {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  };

  /**
   * Is this an API key CaseVault can use? Returns { ok, key (trimmed), problem }.
   * Catches the usual mistakes: extra spaces or quotes, an admin key, a subscription (OAuth) token,
   * a key for another service.
   */
  function check(input, provider = 'anthropic') {
    const key = String(input || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, '');
    if (!key) return { ok: false, key, problem: 'Paste the key first.' };
    const other = /^sk-ant-/i.test(key) ? 'an Anthropic' : /^AIza/.test(key) ? 'a Google Gemini' : /^sk-or-/i.test(key) ? 'an OpenRouter' : '';
    if (provider === 'gemini') {
      if (other && other !== 'a Google Gemini') return { ok: false, key, problem: `That is ${other} key. Paste it under that service instead.` };
      if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) return { ok: false, key, problem: 'A Gemini API key starts with "AIza" and is 39 characters long. Copy it again from Google AI Studio.' };
      return { ok: true, key, problem: '' };
    }
    if (provider === 'openrouter') {
      if (other && other !== 'an OpenRouter') return { ok: false, key, problem: `That is ${other} key. Paste it under that service instead.` };
      if (!/^sk-or-v1-[0-9A-Za-z]{32,}$/.test(key)) return { ok: false, key, problem: 'An OpenRouter key starts with "sk-or-v1-" and is about 70 characters long. Copy it again from openrouter.ai.' };
      return { ok: true, key, problem: '' };
    }
    if (other && other !== 'an Anthropic') return { ok: false, key, problem: `That is ${other} key. Paste it under that service instead.` };
    if (/^sk-ant-admin/i.test(key)) return { ok: false, key, problem: 'That is an Admin key (sk-ant-admin…). It manages the organisation and must not be used here. Create a normal API key instead.' };
    if (/^sk-ant-oat/i.test(key)) return { ok: false, key, problem: 'That is a sign-in token from a Claude subscription, not an API key. Subscriptions can\'t be used through the API; create an API key in the Claude Console.' };
    if (!/^sk-ant-/i.test(key)) return { ok: false, key, problem: 'An Anthropic API key starts with "sk-ant-api". Check that you copied the whole key.' };
    if (!/^sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}$/.test(key)) return { ok: false, key, problem: 'This doesn\'t look like a complete API key (it should be about 100 characters, letters, digits, - and _). Copy it again from the Console.' };
    return { ok: true, key, problem: '' };
  }

  /** "sk-ant-api03-…x7Qa": enough to recognise it in the service's key list, never enough to use it. */
  function mask(key) {
    const k = String(key || '');
    if (k.length < 16) return '••••';
    const m = /^(sk-ant-api\d{2}-|sk-or-v1-|AIza)/.exec(k);
    return `${m ? m[1] : k.slice(0, 7)}…${k.slice(-4)}`;
  }

  async function deriveKey(passphrase, salt) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /** The record written to secrets/anthropic.json for a passphrase-locked key. */
  async function lock(key, passphrase) {
    if (String(passphrase || '').length < 8) throw new Error('Use a passphrase of at least 8 characters.');
    const salt = rand(16);
    const iv = rand(12);
    const aes = await deriveKey(passphrase, salt);
    const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(key)));
    return { v: 2, kind: 'locked', masked: mask(key), saved: new Date().toISOString(), kdf: { name: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: b64(salt) }, iv: b64(iv), data: b64(data) };
  }

  /** The key inside a locked record, or throws "wrong passphrase". */
  async function unlock(record, passphrase) {
    try {
      const aes = await deriveKey(passphrase, unb64(record.kdf.salt));
      const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(record.iv) }, aes, unb64(record.data));
      return new TextDecoder().decode(plain);
    } catch {
      throw new Error('Wrong passphrase.');
    }
  }

  function plainRecord(key) {
    return { v: 2, kind: 'plain', masked: mask(key), saved: new Date().toISOString(), key };
  }

  /** What a stored record is: { kind: 'locked'|'plain'|null, masked, saved }. Old v1.9 records ({ key }) are plain. */
  function describe(record) {
    if (!record) return { kind: null, masked: '', saved: '' };
    if (record.kind === 'locked' && record.data) return { kind: 'locked', masked: record.masked || '…', saved: record.saved || '' };
    if (record.key) return { kind: 'plain', masked: mask(record.key), saved: record.saved || '' };
    return { kind: null, masked: '', saved: '' };
  }

  const api = { ITERATIONS, check, mask, lock, unlock, plainRecord, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVApiKeyLib = api;
})(this);
