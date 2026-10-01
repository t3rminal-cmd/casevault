/* CaseVault — one way to write numbers everywhere:
 *
 *   phone   123.456.7890
 *   SSN     123.45.6789
 *   date    12.01.2026   (month.day.year)
 *
 * Phone and SSN boxes format themselves as you type. Date boxes are plain boxes you type into
 * ("12012026", "12/1/26" and "2026-12-01" all become 12.01.2026) with a calendar button; they
 * still hold "YYYY-MM-DD" underneath, so saved data doesn't change.
 *
 * The formatters are plain logic with no DOM, so the tests run them under Node.
 */
'use strict';

(function (root) {
  const pad = (n) => String(n).padStart(2, '0');
  const digits = (s) => String(s || '').replace(/\D/g, '');

  /** Groups the digits as they're typed: "1234567890" -> "123.456.7890". Anything else is left alone. */
  function phone(text) {
    const s = String(text || '');
    if (!s.trim()) return '';
    // Keep international numbers, extensions and words as typed.
    if (/^\s*\+(?!1\b)/.test(s) || /[a-z]/i.test(s.replace(/\s*(x|ext\.?)\s*\d*$/i, ''))) return s;
    let d = digits(s.replace(/\s*(x|ext\.?)\s*\d*$/i, ''));
    const ext = (/\s*(?:x|ext\.?)\s*(\d+)$/i.exec(s) || [])[1];
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    if (d.length > 10) return s;
    const out = d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)}.${d.slice(3)}` : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return ext ? `${out} x${ext}` : out;
  }

  /** "123456789" -> "123.45.6789" (as typed, too). */
  function ssn(text) {
    const d = digits(text).slice(0, 9);
    return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}.${d.slice(3)}` : `${d.slice(0, 3)}.${d.slice(3, 5)}.${d.slice(5)}`;
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** "2026-09-30" -> "September 30, 2026" (v1.32: the long date everywhere); anything else as it is. */
  function dateText(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(iso || '');
  }

  /** What was typed -> "YYYY-MM-DD", or '' if it isn't a real date. Month first, as in the US. */
  function parseDate(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    let y; let mo; let d;
    let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
    // "September 30, 2026" or "Sep 30 2026", as dates are shown (v1.32).
    const long = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
    const mi = long ? MONTHS.findIndex((x) => x.toLowerCase().startsWith(long[1].toLowerCase().slice(0, 3))) : -1;
    if (long && mi >= 0) [y, mo, d] = [long[3], mi + 1, long[2]];
    else if (m) [y, mo, d] = [m[1], m[2], m[3]];
    else if ((m = /^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{2}|\d{4})$/.exec(s))) [mo, d, y] = [m[1], m[2], m[3]];
    else if ((m = /^(\d{2})(\d{2})(\d{4}|\d{2})$/.exec(s))) [mo, d, y] = [m[1], m[2], m[3]];
    else return '';
    y = Number(y); mo = Number(mo); d = Number(d);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || y < 1900 || y > 2200) return '';
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  /* ---------- in the page ---------- */

  /**
   * A date box: type MM.DD.YYYY, or pick it from the calendar button. Returns the wrapper; read and
   * set its .value as "YYYY-MM-DD". Fires 'input' and 'change'. A form still gets the value under
   * the box's name (a hidden input holds it). attrs: name, value, required, aria-label, title.
   */
  function dateField(attrs = {}) {
    const doc = root.document;
    const wrap = doc.createElement('span');
    wrap.className = 'date-field';
    const text = doc.createElement('input');
    text.type = 'text';
    text.className = 'date-text';
    text.inputMode = 'numeric';
    text.autocomplete = 'off';
    text.maxLength = 24;
    text.placeholder = 'MM.DD.YYYY';
    if (attrs['aria-label']) text.setAttribute('aria-label', attrs['aria-label']);
    if (attrs.required) text.required = true;
    if (attrs.title) wrap.title = attrs.title;
    const hidden = doc.createElement('input');
    hidden.type = 'hidden';
    if (attrs.name) hidden.name = attrs.name;
    // The browser's own calendar, opened from the button; never shown as a box.
    const picker = doc.createElement('input');
    picker.type = 'date';
    picker.className = 'date-picker-native';
    picker.tabIndex = -1;
    picker.setAttribute('aria-hidden', 'true');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn date-btn';
    btn.title = 'Pick a date';
    if (root.CVIcons) btn.append(root.CVIcons.icon('calendar-event'));
    const sr = doc.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = 'Pick a date';
    btn.append(sr);
    wrap.append(text, btn, picker, hidden);

    let iso = parseDate(attrs.value) || '';
    const show = () => { text.value = dateText(iso); hidden.value = iso; picker.value = iso; };
    show();
    const fire = () => {
      wrap.dispatchEvent(new root.Event('input', { bubbles: true }));
      wrap.dispatchEvent(new root.Event('change', { bubbles: true }));
    };
    Object.defineProperty(wrap, 'value', {
      get() { return iso; },
      set(v) { iso = parseDate(v) || ''; show(); },
    });
    Object.defineProperty(wrap, 'name', { get: () => hidden.name });

    text.addEventListener('input', (e) => {
      e.stopPropagation();
      // Dots go in as you type: "1201" -> "12.01", "12012026" -> "12.01.2026".
      // Only digits and our own dots: regroup the digits (typing "/" or "-" is left as typed).
      const d = text.value.replace(/\D/g, '');
      if (/^[\d.]*$/.test(text.value) && d.length <= 8 && text.selectionStart === text.value.length && !(e.inputType || '').startsWith('delete')) {
        text.value = d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}.${d.slice(2)}` : `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
      }
      const next = parseDate(text.value);
      if (next || !text.value.trim()) {
        const changed = next !== iso;
        iso = next;
        hidden.value = iso;
        picker.value = iso;
        text.setCustomValidity('');
        if (changed) fire();
      }
    });
    text.addEventListener('blur', () => {
      const next = parseDate(text.value);
      if (next) { iso = next; show(); }
      text.setCustomValidity(text.value.trim() && !next ? 'Type a date as MM.DD.YYYY, for example 12.01.2026.' : '');
    });
    btn.addEventListener('click', () => {
      try { if (picker.showPicker) { picker.showPicker(); return; } } catch { /* not allowed here */ }
      picker.focus();
      picker.click();
    });
    picker.addEventListener('change', () => { iso = picker.value || ''; show(); text.setCustomValidity(''); fire(); text.focus(); });
    picker.addEventListener('input', (e) => e.stopPropagation());
    return wrap;
  }

  // Phone and SSN boxes format themselves. Only when the cursor is at the end, so fixing a digit
  // in the middle doesn't make the cursor jump; the whole number is tidied when you leave the box.
  function install(doc) {
    const fmt = (el) => (el.type === 'tel' ? phone : el.dataset && el.dataset.format === 'ssn' ? ssn : null);
    doc.addEventListener('input', (e) => {
      const el = e.target;
      if (!(el instanceof root.HTMLInputElement)) return;
      const f = fmt(el);
      if (!f || el.selectionStart !== el.value.length || (e.inputType || '').startsWith('delete')) return;
      const v = f(el.value);
      if (v !== el.value) el.value = v;
    }, true);
    doc.addEventListener('blur', (e) => {
      const el = e.target;
      if (!(el instanceof root.HTMLInputElement)) return;
      const f = fmt(el);
      if (!f) return;
      const v = f(el.value);
      if (v !== el.value) { el.value = v; el.dispatchEvent(new root.Event('input', { bubbles: true })); el.dispatchEvent(new root.Event('change', { bubbles: true })); }
    }, true);
  }

  /* ---------------- headings: Title Case ---------------- */

  const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'for', 'of', 'on', 'in', 'to', 'at', 'by', 'with', 'from', 'as', 'per', 'vs', 'via', 'into']);
  /** "Upcoming deadlines" -> "Upcoming Deadlines". Short joining words stay lower case (except
   * first); words with capitals, digits, dots or slashes (DEA-6, notes.md, AI) and anything in
   * quotes (a case's own title) are left as they are. */
  function titleCase(text) {
    let quoted = false;
    let first = true;
    return String(text).split(/(\s+)/).map((w) => {
      if (/^\s+$/.test(w) || !w) return w;
      const opens = /^["“']/.test(w);
      const was = quoted;
      if (opens && !quoted) quoted = true;
      if (quoted && /["”']$/.test(w) && (w.length > 1 || !opens)) quoted = false;
      if (was || opens) { first = false; return w; }
      const skip = /[@\\/]|\.\w/.test(w) || !/^[a-z]/.test(w);
      const small = !first && SMALL.has(w.toLowerCase().replace(/[^a-z]/g, ''));
      const out = skip || small ? w : w[0].toUpperCase() + w.slice(1);
      first = /[:–—-]$/.test(w);
      return out;
    }).join('');
  }

  /** A folder path as shown on screen (v1.22): "cases\\2026-B1\\files" -> "cases | 2026-B1 | files". */
  const pathText = (p) => String(p || '').split(/[\\/]+/).filter(Boolean).join(' | ');

  const api = { phone, ssn, dateText, parseDate, dateField, install, titleCase, pathText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.CVFormat = api;
    if (root.document) install(root.document);
  }
})(this);
