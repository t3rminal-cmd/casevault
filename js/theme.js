/* CaseVault — light / dark theme. Loaded in <head> so the page never flashes the wrong colors.
 * "auto" follows Windows; "light" and "dark" are this PC's choice, kept in the browser like the
 * AI profile (a preference, never case data).
 */
'use strict';

(function (root) {
  const KEY = 'casevault-theme';
  const ORDER = ['auto', 'light', 'dark'];
  const doc = root.document;

  const get = () => { try { const t = root.localStorage.getItem(KEY); return ORDER.includes(t) ? t : 'auto'; } catch { return 'auto'; } };
  const systemDark = () => !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  /** The colors actually showing: 'light' or 'dark'. */
  const effective = (t = get()) => (t === 'auto' ? (systemDark() ? 'dark' : 'light') : t);

  function apply(t = get()) {
    if (t === 'auto') doc.documentElement.removeAttribute('data-theme');
    else doc.documentElement.setAttribute('data-theme', t);
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effective(t) === 'dark' ? '#0d1117' : '#ffffff');
    for (const fn of listeners) fn(t, effective(t));
  }
  function set(t) {
    try { if (t === 'auto') root.localStorage.removeItem(KEY); else root.localStorage.setItem(KEY, t); } catch { /* private window: this session only */ }
    apply(t);
  }
  /** auto -> light -> dark -> auto */
  const next = () => { const t = ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length]; set(t); return t; };

  const listeners = [];
  const onChange = (fn) => listeners.push(fn);
  if (root.matchMedia) root.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (get() === 'auto') apply('auto'); });

  apply();
  root.CVTheme = { get, set, next, effective, onChange, LABELS: { auto: 'Theme: automatic, follows Windows', light: 'Theme: light', dark: 'Theme: dark' } };
})(this);
