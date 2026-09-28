/* CaseVault drafts — inline AI suggestions, the logic only.
 *
 * After a pause in typing, ask for a short continuation of the text before the cursor and show it
 * in a small "AI suggestion" box next to the cursor line. Tab accepts it, Esc dismisses it, and typing dismisses it too, unless
 * the typed characters are the start of the suggestion (then the rest stays). Every new keystroke
 * cancels the pending request (AbortController), so only the latest one can ever show.
 *
 * No DOM here: timers and the model call are passed in, so the tests can drive it.
 */
'use strict';

(function (root) {
  const MAX_CHARS = 200; // about 40 tokens

  /**
   * Tidy a raw model reply into a one-sentence continuation that fits after `before`.
   * Removes quotes and labels, repeated text, and anything after the first sentence.
   */
  function cleanSuggestion(raw, before = '') {
    let s = String(raw || '').replace(/\r/g, '');
    s = s.replace(/^\s*(continuation|completion|suggestion|next)\s*:\s*/i, '');
    s = s.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ');
    s = s.replace(/^["'`“‘]+|["'`”’]+$/g, '');
    // If the model repeated the end of the text, drop the repeated part.
    const tail = before.slice(-80);
    for (let k = Math.min(tail.length, s.length); k >= 8; k--) {
      if (s.startsWith(tail.slice(-k))) { s = s.slice(k); break; }
    }
    // Keep only the first sentence.
    const end = /[.!?](?=\s|$)/.exec(s);
    if (end) s = s.slice(0, end.index + 1);
    if (s.length > MAX_CHARS) s = s.slice(0, MAX_CHARS).replace(/\s+\S*$/, '');
    s = s.replace(/\s+$/, '');
    if (!s.trim()) return '';
    // Spacing at the join.
    if (/\s$/.test(before) || before === '') s = s.replace(/^\s+/, '');
    else if (/^[A-Za-z0-9(“"]/.test(s.trimStart()) && !/^\s/.test(s)) s = ` ${s}`;
    return s;
  }

  /** Only suggest when the cursor is at the end of a line with some text before it. */
  function eligible(text, cursor) {
    const before = text.slice(0, cursor);
    const nextChar = text.charAt(cursor);
    if (nextChar && nextChar !== '\n') return false;
    const line = before.slice(before.lastIndexOf('\n') + 1);
    return line.trim().length >= 3 && before.trim().length >= 12;
  }

  /**
   * opts: { fetchSuggestion(before, signal) -> Promise<string>, delay = 700,
   *         setTimer = setTimeout, clearTimer = clearTimeout, onChange() }
   */
  function createGhost(opts) {
    const delay = opts.delay ?? 700;
    const setTimer = opts.setTimer || setTimeout;
    const clearTimer = opts.clearTimer || clearTimeout;
    const onChange = opts.onChange || (() => {});
    const s = { ghost: '', anchor: -1, text: '', cursor: -1, timer: null, ctrl: null, seq: 0 };

    function cancel() {
      if (s.timer != null) { clearTimer(s.timer); s.timer = null; }
      if (s.ctrl) { s.ctrl.abort(); s.ctrl = null; }
    }

    function clear() {
      const had = !!s.ghost;
      s.ghost = '';
      s.anchor = -1;
      if (had) onChange();
    }

    /** Call on every input or cursor move: { text, cursor, enabled, focused } */
    function update({ text, cursor, enabled = true, focused = true }) {
      const prevText = s.text;
      s.text = text;
      s.cursor = cursor;
      // Typed the start of the suggestion? Keep the rest.
      if (s.ghost && cursor > s.anchor && text.length - prevText.length === cursor - s.anchor
        && text.slice(0, s.anchor) === prevText.slice(0, s.anchor) && text.slice(cursor) === prevText.slice(s.anchor)) {
        const typed = text.slice(s.anchor, cursor);
        if (s.ghost.startsWith(typed) && s.ghost.length > typed.length) {
          s.ghost = s.ghost.slice(typed.length);
          s.anchor = cursor;
          onChange();
          return;
        }
      }
      if (s.ghost && text === prevText && cursor === s.anchor) return; // nothing changed
      cancel();
      clear();
      if (!enabled || !focused || !eligible(text, cursor)) return;
      const seq = ++s.seq;
      s.timer = setTimer(() => {
        s.timer = null;
        const ctrl = new AbortController();
        s.ctrl = ctrl;
        const before = text.slice(0, cursor);
        Promise.resolve()
          .then(() => opts.fetchSuggestion(before, ctrl.signal))
          .then((raw) => {
            if (seq !== s.seq || ctrl.signal.aborted || s.text !== text || s.cursor !== cursor) return;
            s.ctrl = null;
            const g = cleanSuggestion(raw, before);
            if (!g) return;
            s.ghost = g;
            s.anchor = cursor;
            onChange();
          })
          .catch(() => { if (s.ctrl === ctrl) s.ctrl = null; });
      }, delay);
    }

    /** Returns { accept: text } for Tab, { dismiss: true } for Esc, or null (let the key through). */
    function key(k) {
      if (!s.ghost) return null;
      if (k === 'Tab') {
        const text = s.ghost;
        cancel();
        clear();
        return { accept: text };
      }
      if (k === 'Escape') {
        cancel();
        clear();
        return { dismiss: true };
      }
      return null;
    }

    function stop() { cancel(); clear(); s.seq++; }

    return {
      update, key, stop,
      get ghost() { return s.ghost; },
      get anchor() { return s.anchor; },
      get pending() { return s.timer != null || s.ctrl != null; },
    };
  }

  /* ---------------- the suggestion box (pure helpers; drafts-ui.js does the DOM) ---------------- */

  /**
   * The current sentence up to the cursor, for context in the suggestion box. A long sentence
   * keeps its end, with "…" in front: "…arrived at 100 Example Street at".
   */
  function sentencePrefix(text, cursor, max = 90) {
    const before = String(text || '').slice(0, cursor);
    const line = before.slice(before.lastIndexOf('\n') + 1);
    let start = 0;
    const re = /[.!?]["'”’)]*\s+/g;
    let m;
    while ((m = re.exec(line))) start = m.index + m[0].length;
    let s = line.slice(start).replace(/^\s+/, '');
    if (s.length > max) s = `…${s.slice(s.length - max).replace(/^\S*\s/, '')}`;
    return s;
  }

  /**
   * Where to put the box: below the cursor line, or above it when there's no room below.
   * All values are pixels in the same coordinates (e.g. the window). Returns { top, above }.
   * caretTop/caretBottom: the cursor line; boxHeight: the box; limitTop/limitBottom: the visible area.
   */
  function boxPlacement({ caretTop, caretBottom, boxHeight, limitTop, limitBottom, gap = 6 }) {
    const below = caretBottom + gap;
    if (below + boxHeight <= limitBottom) return { top: below, above: false };
    const above = caretTop - gap - boxHeight;
    if (above >= limitTop) return { top: above, above: true };
    // No room either way (a very small window): keep it below, where the eye is going.
    return { top: below, above: false };
  }

  const api = { createGhost, cleanSuggestion, eligible, sentencePrefix, boxPlacement, MAX_CHARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVGhost = api;
})(this);
