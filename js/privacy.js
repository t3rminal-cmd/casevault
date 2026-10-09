/* CaseVault — privacy screen ("panic key").
 *
 * A web page can't minimise the browser, so this instantly covers the whole app with a plain,
 * neutral screen: no case data and no names in it, the tab title becomes "New Tab", the tab icon
 * goes blank, audio/video pause, open file previews close, and pending edits are saved to the SSD.
 *
 * It locks from the "Hide" button in the header, or after the idle time. (No keyboard shortcuts
 * since v1.21; Esc can't close it.)
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

  /** v1.106: PBKDF2-SHA-256 over the PIN, many rounds, so a copied vault.json can't be guessed
   * through quickly (a 4-6 digit PIN only has a million choices). Hex encoded. */
  const PIN_ROUNDS = 600000;
  async function slowHashPin(pin, saltB64, rounds = PIN_ROUNDS) {
    const key = await subtle().importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    return toHex(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: rounds }, key, 256));
  }

  /** What gets stored in vault.json settings. The PIN itself is never stored. */
  async function makePinRecord(pin, rounds = PIN_ROUNDS) {
    if (!isValidPin(pin)) throw new Error('The PIN must be 4 to 6 digits.');
    const salt = b64((root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(16)));
    return { v: 2, algo: 'PBKDF2-SHA-256', rounds, salt, hash: await slowHashPin(pin, salt, rounds) };
  }

  /** A record made before v1.106 (one SHA-256): still accepted, and replaced on the next unlock. */
  const isOldPinRecord = (record) => !!record && record.v !== 2;

  async function verifyPin(pin, record) {
    if (!record || !record.salt || !record.hash || !isValidPin(pin)) return false;
    const got = record.v === 2 ? await slowHashPin(pin, record.salt, Number(record.rounds) || PIN_ROUNDS) : await hashPin(pin, record.salt);
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
      try { env.clearClipboard && env.clearClipboard(); } catch { /* ignore */ }
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
      if (await verifyPin(pin, record)) {
        restore();
        if (isOldPinRecord(record) && env.upgradePin) { try { const p = env.upgradePin(pin); if (p && p.catch) p.catch(() => {}); } catch { /* kept as it was */ } }
        return { ok: true };
      }
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

  // Falling 1s and 0s in blue on near-black (v1.50; white before), like "the Matrix". Stops when hidden; with
  // "reduce motion" in Windows it draws one still frame.
  const BG = '#0e1116'; // a muted near-black; .privacy-screen in app.css matches it
  function matrixRain(canvas, win) {
    const ctx = canvas.getContext && canvas.getContext('2d');
    let raf = 0;
    let drops = [];
    let size = 18;
    let last = 0;
    const still = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function resize() {
      const dpr = win.devicePixelRatio || 1;
      canvas.width = Math.floor(win.innerWidth * dpr);
      canvas.height = Math.floor(win.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = win.innerWidth < 600 ? 14 : 18;
      const cols = Math.ceil(win.innerWidth / size);
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * -40));
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, win.innerWidth, win.innerHeight);
    }
    function frame(t) {
      raf = win.requestAnimationFrame(frame);
      if (t - last < 55) return; // about 18 frames a second is enough, and light on the CPU
      last = t;
      step();
    }
    function step() {
      // A translucent dark wash leaves fading trails behind each falling digit.
      ctx.fillStyle = 'rgba(14, 17, 22, 0.14)';
      ctx.fillRect(0, 0, win.innerWidth, win.innerHeight);
      ctx.font = `${size}px ui-monospace, Consolas, "Courier New", monospace`;
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * size;
        if (y > 0) {
          ctx.fillStyle = Math.random() < 0.08 ? '#bfdbfe' : '#3b82f6';
          ctx.fillText(Math.random() < 0.5 ? '0' : '1', i * size, y);
        }
        if (y > win.innerHeight && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    const onResize = () => resize();
    return {
      start() {
        if (!ctx || raf) return;
        resize();
        win.addEventListener('resize', onResize);
        if (still()) { for (let k = 0; k < 60; k++) step(); return; }
        raf = win.requestAnimationFrame(frame);
      },
      stop() {
        if (raf) win.cancelAnimationFrame(raf);
        raf = 0;
        win.removeEventListener('resize', onResize);
      },
    };
  }

  let controller = null;

  function init({ flush, getPinRecord, getIdleMinutes, button, upgradePin }) {
    const doc = root.document;
    // v1.106: text copied from CaseVault (Ctrl+C, or a Copy button) is cleared from the Windows
    // clipboard when the privacy screen comes on. The browser only allows it while the CaseVault
    // window is in front, so the Hide button always clears it; the idle timer does when it can.
    let copied = false;
    let clearClipboard = null;
    const clip = root.navigator && root.navigator.clipboard;
    if (clip && clip.writeText) {
      const write = clip.writeText.bind(clip);
      try { clip.writeText = (t) => { copied = true; return write(t); }; } catch { /* read-only in this browser */ }
      doc.addEventListener('copy', () => { copied = true; });
      doc.addEventListener('cut', () => { copied = true; });
      clearClipboard = () => { if (!copied) return; write(' ').then(() => { copied = false; }, () => {}); };
    }
    const dlg = doc.createElement('dialog');
    dlg.id = 'privacy-screen';
    dlg.className = 'privacy-screen';
    dlg.setAttribute('aria-label', 'New Tab');
    const form = doc.createElement('form');
    form.className = 'privacy-unlock';
    const input = doc.createElement('input');
    Object.assign(input, { type: 'password', inputMode: 'numeric', autocomplete: 'off', maxLength: 6 });
    input.setAttribute('aria-label', 'Authenticate');
    const msg = doc.createElement('p');
    msg.className = 'privacy-msg';
    const hint = doc.createElement('p');
    hint.className = 'privacy-hint';
    // A thin box in the lower right (v1.50): "AUTHENTICATE" until something is typed, then one
    // asterisk per digit and a blinking cursor. The real input sits on top of it, invisible, so
    // typing, pasting and screen readers still work.
    const line = doc.createElement('div');
    line.className = 'privacy-prompt';
    const dots = doc.createElement('span');
    dots.className = 'privacy-dots';
    dots.dataset.placeholder = 'AUTHENTICATE';
    const cursor = doc.createElement('span');
    cursor.className = 'privacy-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    line.append(dots, cursor, input);
    const showDots = () => { dots.textContent = '*'.repeat(input.value.length); };
    input.addEventListener('input', showDots);
    form.append(line, msg);
    const canvas = doc.createElement('canvas');
    canvas.className = 'privacy-rain';
    canvas.setAttribute('aria-hidden', 'true');
    dlg.append(canvas, form, hint);
    doc.body.append(dlg);
    const rain = matrixRain(canvas, root);

    let needsPin = false;
    const iconLink = () => doc.querySelector('link[rel~="icon"]');

    controller = createController({
      show(pin) {
        needsPin = pin;
        input.value = '';
        dots.textContent = '';
        msg.textContent = '';
        form.hidden = !pin;
        hint.textContent = pin ? '' : 'Click anywhere to continue';
        if (!dlg.open) dlg.showModal(); // top layer: covers everything, including open dialogs
        rain.start();
        if (pin) input.focus(); else dlg.focus();
      },
      hide() { rain.stop(); if (dlg.open) dlg.close(); },
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
      clearClipboard: () => { if (clearClipboard) clearClipboard(); },
      upgradePin,
      getPinRecord,
    });

    const tryUnlock = async () => {
      const r = await controller.unlock(input.value);
      if (r.ok) return;
      input.value = '';
      dots.textContent = '';
      msg.textContent = r.reason === 'wait' ? `Too many attempts. Try again in ${Math.ceil(r.waitMs / 1000)} s.` : 'Wrong PIN.';
      input.focus();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); tryUnlock(); });
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      if (input.value.length === 6) tryUnlock();
    });
    // Esc must never reveal the app. Chrome closes a modal dialog on a second Esc even when its
    // "cancel" is prevented (v1.21 fix), so Esc is stopped at the key, and if the dialog closes
    // anyway while locked, it opens again at once.
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } }, true);
    dlg.addEventListener('close', () => {
      if (!controller || !controller.locked) return;
      dlg.showModal();
      rain.start();
      if (needsPin) input.focus(); else dlg.focus();
    });
    dlg.addEventListener('click', (e) => { if (!needsPin) { e.preventDefault(); controller.unlock(); } else input.focus(); });
    // With a PIN, typing anywhere on the cover goes into the PIN box.
    dlg.addEventListener('keydown', (e) => { if (needsPin && e.target !== input && /^\d$/.test(e.key)) input.focus(); }, true);
    dlg.addEventListener('keydown', (e) => { if (!needsPin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); controller.unlock(); } });

    // While locked, no key reaches the app behind the cover. (The Ctrl+Shift+H and Esc Esc
    // shortcuts were removed in v1.21: the Hide button and the idle timer lock it.)
    root.addEventListener('keydown', (e) => {
      if (controller.locked && !dlg.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
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
    isValidPin, hashPin, slowHashPin, makePinRecord, verifyPin, isOldPinRecord, PIN_ROUNDS, createEscDetector, createController, createIdleTimer, init,
    lock: () => controller && controller.lock(),
    get locked() { return !!(controller && controller.locked); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVPrivacy = api;
})(this);
