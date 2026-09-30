/* CaseVault — time boxes. The browser's own time box hides part of the time behind its clock
 * icon in narrow columns, and its picker has no button to confirm: you have to click away. This
 * one is a plain box you can type in ("930", "9:30 pm", "21:30") with a clock button that opens a
 * small picker: hour, minute, Now, Clear and Set time.
 *
 * The value is "HH:MM" (24-hour), like <input type="time">, so saved data doesn't change.
 * parse() is plain logic with no DOM, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const pad = (n) => String(n).padStart(2, '0');

  /** "930" / "9:30 pm" / "21.30" / "9" -> "09:30" / "21:30" / "21:30" / "09:00"; not a time -> ''. */
  function parse(text) {
    const s = String(text || '').trim().toLowerCase();
    if (!s) return '';
    const m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?\s*(a|am|a\.m\.|p|pm|p\.m\.)?$/.exec(s.replace(/\s+/g, ' '));
    if (!m) return '';
    let hh = Number(m[1]);
    const mm = m[2] == null ? 0 : Number(m[2]);
    const ap = m[3] ? m[3][0] : '';
    if (ap) {
      if (hh < 1 || hh > 12) return '';
      if (ap === 'p' && hh < 12) hh += 12;
      if (ap === 'a' && hh === 12) hh = 0;
    }
    if (hh > 23 || mm > 59) return '';
    return `${pad(hh)}:${pad(mm)}`;
  }

  // Regular (12-hour, "9:30 PM") or military (24-hour, "21:30") on screen, for every time box
  // at once; remembered in this browser (v1.25). The saved value is always "HH:MM".
  const MODE_KEY = 'casevault-time-format';
  function getMode() {
    try { return root.localStorage && root.localStorage.getItem(MODE_KEY) === '12' ? '12' : '24'; } catch { return '24'; }
  }
  function setMode(m) {
    try { root.localStorage.setItem(MODE_KEY, m === '12' ? '12' : '24'); } catch { /* this page only */ }
    if (root.document) root.document.dispatchEvent(new root.Event('cv-time-format'));
  }
  /** "21:30" -> "21:30" (24) or "9:30 PM" (12); anything else as it is. */
  function display(hhmm, mode = getMode()) {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
    if (!m || mode !== '12') return hhmm || '';
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  }

  let openPicker = null;
  function closeOpen() { if (openPicker) openPicker(); }

  /**
   * A time box. Returns the wrapper element; read and set its .value ("HH:MM" or ''). It fires
   * 'input' and 'change' when the time changes. opts: { value, label, required }.
   */
  function create(opts = {}) {
    const doc = root.document;
    const icon = (name) => (root.CVIcons ? root.CVIcons.icon(name) : doc.createTextNode(''));
    const wrap = doc.createElement('span');
    wrap.className = 'time-field';
    const input = doc.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.maxLength = 11;
    input.placeholder = getMode() === '12' ? 'H:MM AM' : 'HH:MM';
    input.className = 'time-text';
    if (opts.label) input.setAttribute('aria-label', opts.label);
    if (opts.required) input.required = true;
    input.value = display(parse(opts.value)) || '';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn time-btn';
    btn.title = 'Pick a time';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.append(icon('clock'));
    const sr = doc.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = 'Pick a time';
    btn.append(sr);
    // 24h / 12h: switches every time box between military and regular time.
    const mode = doc.createElement('button');
    mode.type = 'button';
    mode.className = 'time-mode';
    let seen = false;
    const showMode = () => {
      if (!wrap.isConnected && seen) { doc.removeEventListener('cv-time-format', showMode); return; } // box gone
      if (wrap.isConnected) seen = true;
      const m = getMode();
      mode.textContent = m === '12' ? '12h' : '24h';
      mode.title = m === '12' ? 'Regular time (9:30 PM). Click for military time (21:30).' : 'Military time (21:30). Click for regular time (9:30 PM).';
      input.placeholder = m === '12' ? 'H:MM AM' : 'HH:MM';
      const t = parse(input.value);
      if (t) input.value = display(t, m);
    };
    showMode();
    mode.addEventListener('click', (e) => { e.preventDefault(); setMode(getMode() === '12' ? '24' : '12'); });
    doc.addEventListener('cv-time-format', showMode);
    wrap.append(input, mode, btn);

    const fire = () => {
      wrap.dispatchEvent(new root.Event('input', { bubbles: true }));
      wrap.dispatchEvent(new root.Event('change', { bubbles: true }));
    };
    Object.defineProperty(wrap, 'value', {
      get() { return parse(input.value) || (input.value.trim() ? input.value.trim() : ''); },
      set(v) { input.value = display(parse(v)) || ''; },
    });
    // The typed text is tidied when you leave the box: "930" becomes "09:30".
    input.addEventListener('input', (e) => { if (e.target === input) { e.stopPropagation(); fire(); } });
    input.addEventListener('blur', () => {
      const t = parse(input.value);
      if (t && display(t) !== input.value) { input.value = display(t); fire(); }
      input.setCustomValidity(input.value.trim() && !t ? 'Type a time such as 09:30 or 9:30 pm.' : '');
    });
    // Label clicks focus the typing box, not the button.
    wrap.addEventListener('click', (e) => { if (e.target === wrap) input.focus(); });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (wrap.querySelector('.time-pop')) { closeOpen(); return; }
      closeOpen();
      const cur = parse(input.value) || (() => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; })();
      const pop = doc.createElement('div');
      pop.className = 'time-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Pick a time');
      const sel = (label, n, value) => {
        const s = doc.createElement('select');
        s.setAttribute('aria-label', label);
        for (let i = 0; i < n; i++) { const o = doc.createElement('option'); o.value = pad(i); o.textContent = pad(i); s.append(o); }
        s.value = value;
        return s;
      };
      const hour = sel('Hour', 24, cur.slice(0, 2));
      const minute = sel('Minute', 60, cur.slice(3, 5));
      const colon = doc.createElement('span');
      colon.className = 'time-colon';
      colon.textContent = ':';
      const row = doc.createElement('div');
      row.className = 'time-pop-row';
      row.append(hour, colon, minute);
      const button = (text, cls, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.className = `btn small ${cls}`; b.textContent = text; b.addEventListener('click', fn); return b; };
      const actions = doc.createElement('div');
      actions.className = 'time-pop-actions';
      actions.append(
        button('Now', 'ghost', () => { const d = new Date(); hour.value = pad(d.getHours()); minute.value = pad(d.getMinutes()); }),
        button('Clear', 'ghost', () => { input.value = ''; fire(); close(); input.focus(); }),
        button('Set time', 'primary time-set', () => { input.value = display(`${hour.value}:${minute.value}`); input.setCustomValidity(''); fire(); close(); input.focus(); }));
      pop.append(row, actions);
      wrap.append(pop);
      btn.setAttribute('aria-expanded', 'true');
      // Open upward when there is no room below.
      const r = pop.getBoundingClientRect();
      if (r.bottom > root.innerHeight - 4) pop.classList.add('up');
      hour.focus();

      const outside = (ev) => { if (!wrap.contains(ev.target)) close(); };
      const keys = (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); btn.focus(); }
        else if (ev.key === 'Enter' && ev.target.tagName === 'SELECT') { ev.preventDefault(); actions.querySelector('.time-set').click(); }
      };
      function close() {
        pop.remove();
        btn.setAttribute('aria-expanded', 'false');
        doc.removeEventListener('pointerdown', outside, true);
        pop.removeEventListener('keydown', keys);
        if (openPicker === close) openPicker = null;
      }
      openPicker = close;
      pop.addEventListener('keydown', keys);
      doc.addEventListener('pointerdown', outside, true);
    });
    return wrap;
  }

  const api = { parse, create, display, getMode, setMode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVTimeField = api;
})(this);
