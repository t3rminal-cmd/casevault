/* CaseVault — privacy screen ("panic key").
 *
 * A web page can't minimise the browser, so this instantly covers the whole app with a plain,
 * neutral screen: no case data and no names in it, the tab title becomes "New Tab", the tab icon
 * goes blank, audio/video pause, open file previews close, and pending edits are saved to the SSD.
 *
 * Shortcuts: Ctrl+Shift+H, or Esc twice within half a second. Also the "Hide" button in the header.
 * Unlock: the PIN if one is set (stored in vault.json settings as a salted SHA-256 hash, never the
 * PIN itself), otherwise one click. Optional: hide automatically after N minutes without activity.
 *
 * This is a screen cover, not security. For real security when you leave: Windows key + L.
 *
 * The core (hashing, Esc detection, lock controller, idle timer) has no DOM code, so it runs under
 * Node for the tests; init() wires it to the page.
 */
'use strict';

(function (root) {
  const PIN_RE = /^\d{4,6}$/;
  const DOUBLE_ESC_MS = 500;
  const MAX_TRIES = 5;
  const COOLDOWN_MS = 30000;
  // 1x1 transparent PNG: a "blank" tab icon.
  const BLANK_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const COVER_TITLE = 'New Tab';

  const subtle = () => (root.crypto || globalThis.crypto).subtle;
  const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const b64 = (bytes) => (typeof btoa === 'function' ? btoa(String.fromCharCode(...bytes)) : Buffer.from(bytes).toString('base64'));
  const unb64 = (s) => (typeof atob === 'function' ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64')));

  /* ---------------- PIN ---------------- */

  function isValidPin(pin) {
    return PIN_RE.test(String(pin || ''));
  }

  /** SHA-256 over (salt bytes + PIN as UTF-8), hex encoded. */
  async function hashPin(pin, saltB64) {
    const salt = unb64(saltB64);
    const pinBytes = new TextEncoder().encode(String(pin));
    const data = new Uint8Array(salt.length + pinBytes.length);
    data.set(salt, 0);
    data.set(pinBytes, salt.length);
    return toHex(await subtle().digest('SHA-256', data));
  }

  /** What gets stored in vault.json settings. The PIN itself is never stored. */
  async function makePinRecord(pin) {
    if (!isValidPin(pin)) throw new Error('The PIN must be 4 to 6 digits.');
    const salt = b64((root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(16)));
    return { v: 1, algo: 'SHA-256', salt, hash: await hashPin(pin, salt) };
  }

  async function verifyPin(pin, record) {
    if (!record || !record.salt || !record.hash || !isValidPin(pin)) return false;
    const got = await hashPin(pin, record.salt);
    let diff = got.length ^ record.hash.length;
    for (let i = 0; i < got.length && i < record.hash.length; i++) diff |= got.charCodeAt(i) ^ record.hash.charCodeAt(i);
    return diff === 0;
  }

  /* ---------------- Esc Esc ---------------- */

  /** Returns a function to call on every Escape press; it returns true on the second press within `ms`. */
  function createEscDetector(ms = DOUBLE_ESC_MS, now = () => Date.now()) {
    let last = -Infinity;
    return () => {
      const t = now();
      const hit = t - last <= ms;
      last = hit ? -Infinity : t;
      return hit;
    };
  }

  /* ---------------- lock controller ---------------- */

  /**
   * env: { show(needsPin), hide(), getTitle(), setTitle(t), getIcon(), setIcon(href),
   *        flush(), pauseMedia(), closePreviews(), getPinRecord(), now() }
   */
  function createController(env) {
    const now = env.now || (() => Date.now());
    const s = { locked: false, savedTitle: null, savedIcon: null, tries: 0, blockedUntil: 0 };

    function lock() {
      if (s.locked) return false;
      s.locked = true;
      s.savedTitle = env.getTitle();
      s.savedIcon = env.getIcon();
      env.setTitle(COVER_TITLE);
      env.setIcon(BLANK_ICON);
      try { env.pauseMedia && env.pauseMedia(); } catch { /* ignore */ }
      try { env.closePreviews && env.closePreviews(); } catch { /* ignore */ }
      env.show(!!env.getPinRecord());
      try { const p = env.flush && env.flush(); if (p && p.catch) p.catch(() => {}); } catch { /* reported by Save */ }
      return true;
    }

    function restore() {
      s.locked = false;
      s.tries = 0;
      env.setTitle(s.savedTitle);
      env.setIcon(s.savedIcon);
      env.hide();
    }

    /** Returns { ok, reason, waitMs }. Without a PIN set, any unlock succeeds. */
    async function unlock(pin) {
      if (!s.locked) return { ok: true };
      const record = env.getPinRecord();
      if (!record) { restore(); return { ok: true }; }
      const t = now();
      if (t < s.blockedUntil) return { ok: false, reason: 'wait', waitMs: s.blockedUntil - t };
      if (await verifyPin(pin, record)) { restore(); return { ok: true }; }
      s.tries++;
      if (s.tries >= MAX_TRIES) { s.tries = 0; s.blockedUntil = t + COOLDOWN_MS; return { ok: false, reason: 'wait', waitMs: COOLDOWN_MS }; }
      return { ok: false, reason: 'wrong', left: MAX_TRIES - s.tries };
    }

    return { lock, unlock, get locked() { return s.locked; } };
  }

  /* ---------------- idle timer ---------------- */

  /** Calls onIdle once after `minutes()` minutes without activity (0 = off). Call poke() on activity, tick() periodically. */
  function createIdleTimer({ minutes, onIdle, now = () => Date.now() }) {
    let last = now();
    let fired = false;
    return {
      poke() { last = now(); fired = false; },
      tick() {
        const m = Number(minutes()) || 0;
        if (m > 0 && !fired && now() - last >= m * 60000) { fired = true; onIdle(); }
      },
    };
  }

  /* ---------------- page wiring (browser) ---------------- */

  let controller = null;

  function init({ flush, getPinRecord, getIdleMinutes, button }) {
    const doc = root.document;
    const dlg = doc.createElement('dialog');
    dlg.id = 'privacy-screen';
    dlg.className = 'privacy-screen';
    dlg.setAttribute('aria-label', 'New Tab');
    const form = doc.createElement('form');
    form.className = 'privacy-unlock';
    const input = doc.createElement('input');
    Object.assign(input, { type: 'password', inputMode: 'numeric', autocomplete: 'off', maxLength: 6, placeholder: 'PIN' });
    input.setAttribute('aria-label', 'PIN');
    const msg = doc.createElement('p');
    msg.className = 'privacy-msg';
    const hint = doc.createElement('p');
    hint.className = 'privacy-hint';
    form.append(input, msg);
    dlg.append(form, hint);
    doc.body.append(dlg);

    let needsPin = false;
    const iconLink = () => doc.querySelector('link[rel~="icon"]');

    controller = createController({
      show(pin) {
        needsPin = pin;
        input.value = '';
        msg.textContent = '';
        form.hidden = !pin;
        hint.textContent = pin ? '' : 'Click anywhere to continue';
        if (!dlg.open) dlg.showModal(); // top layer: covers everything, including open dialogs
        if (pin) input.focus(); else dlg.focus();
      },
      hide() { if (dlg.open) dlg.close(); },
      getTitle: () => doc.title,
      setTitle: (t) => { doc.title = t; },
      getIcon: () => (iconLink() ? iconLink().getAttribute('href') : null),
      setIcon: (href) => { if (iconLink() && href) iconLink().setAttribute('href', href); },
      pauseMedia: () => doc.querySelectorAll('audio, video').forEach((m) => m.pause()),
      closePreviews: () => {
        const d = doc.getElementById('dialog');
        if (d && d.open && d.querySelector('.preview')) d.close();
      },
      flush,
      getPinRecord,
    });

    const tryUnlock = async () => {
      const r = await controller.unlock(input.value);
      if (r.ok) return;
      input.value = '';
      msg.textContent = r.reason === 'wait' ? `Too many attempts. Try again in ${Math.ceil(r.waitMs / 1000)} s.` : 'Wrong PIN.';
      input.focus();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); tryUnlock(); });
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      if (input.value.length === 6) tryUnlock();
    });
    dlg.addEventListener('cancel', (e) => e.preventDefault()); // Esc must not reveal the app
    dlg.addEventListener('click', (e) => { if (!needsPin) { e.preventDefault(); controller.unlock(); } else if (e.target === dlg) input.focus(); });
    dlg.addEventListener('keydown', (e) => { if (!needsPin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); controller.unlock(); } });

    const isEsc2 = createEscDetector();
    root.addEventListener('keydown', (e) => {
      if (controller.locked) return;
      if (e.ctrlKey && e.shiftKey && !e.altKey && (e.code === 'KeyH' || e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        e.stopPropagation();
        controller.lock();
      } else if (e.key === 'Escape' && isEsc2()) {
        controller.lock();
      }
    }, true);

    if (button) button.addEventListener('click', () => controller.lock());

    const idle = createIdleTimer({ minutes: getIdleMinutes, onIdle: () => controller.lock() });
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
      root.addEventListener(ev, () => { if (!controller.locked) idle.poke(); }, { capture: true, passive: true });
    }
    setInterval(() => { if (!controller.locked) idle.tick(); }, 10000);
    return controller;
  }

  const api = {
    PIN_RE, BLANK_ICON, COVER_TITLE, MAX_TRIES, COOLDOWN_MS,
    isValidPin, hashPin, makePinRecord, verifyPin, createEscDetector, createController, createIdleTimer, init,
    lock: () => controller && controller.lock(),
    get locked() { return !!(controller && controller.locked); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVPrivacy = api;
})(this);
