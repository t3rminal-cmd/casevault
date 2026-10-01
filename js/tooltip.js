/* CaseVault — hover boxes. Any element with a title (or data-tip) shows its explanation in a
 * styled box when pointed at or focused with the keyboard, instead of the browser's plain
 * tooltip. Buttons show an icon and a short name; the longer explanation lives here.
 */
'use strict';

(function (root) {
  const doc = root.document;
  let tip = null;
  let current = null;
  let timer = null;

  function box() {
    if (!tip) {
      tip = doc.createElement('div');
      tip.className = 'cv-tip';
      tip.setAttribute('role', 'tooltip');
      tip.id = 'cv-tip';
      tip.hidden = true;
      doc.body.append(tip);
    }
    return tip;
  }

  /** The element's explanation. Its title moves to data-tip so the browser's own box stays away. */
  function textOf(el) {
    const t = el.getAttribute('title');
    if (t) { el.dataset.tip = t; el.removeAttribute('title'); }
    return el.dataset.tip || '';
  }

  function place(el) {
    const b = box();
    // Inside an open dialog (the Vault panel…) the box must live in that dialog: a modal dialog
    // sits in the browser's top layer, above anything else on the page.
    const host = el.closest('dialog[open]') || doc.body;
    if (b.parentNode !== host) host.append(b);
    const r = el.getBoundingClientRect();
    b.style.left = '0px';
    b.style.top = '0px';
    b.hidden = false;
    const w = b.offsetWidth;
    const hgt = b.offsetHeight;
    const gap = 8;
    let top = r.bottom + gap;
    let below = true;
    if (top + hgt > root.innerHeight - 4) { top = r.top - hgt - gap; below = false; }
    let left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, root.innerWidth - w - 6));
    // Buttons in a screen corner (the Ask AI and Notes buttons) show theirs right beside them (v1.26).
    if (el.dataset.tipSide === 'left' && r.left - w - gap > 4) { left = r.left - w - gap; top = r.top + r.height / 2 - hgt / 2; below = true; }
    b.style.left = `${Math.round(left)}px`;
    b.style.top = `${Math.round(Math.max(4, top))}px`;
    b.classList.toggle('above', !below);
  }

  /** Hover boxes stay short (v1.20): the first sentence, at most about 100 characters. A box
   * with several lines (a case's deadline and what it waits on) is kept whole. Screen readers
   * still get the full text through the element's own label. */
  function shorten(text, sentences = 1, max = 110) {
    const t = String(text).trim();
    if (sentences === 1 && t.includes('\n')) return t;
    const parts = t.replace(/\n+/g, ' ').match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [t];
    let s = parts.slice(0, sentences).join('').trim();
    if (s.length > max) s = `${s.slice(0, max - 10).replace(/\s+\S*$/, '')}…`;
    return sentences === 1 ? s.replace(/\.$/, '') : s;
  }

  function show(el, delay) {
    clearTimeout(timer);
    // A heading's explanation (data-tip-long) shows up to three sentences; any other box: one.
    const text = el.dataset.tipLong ? shorten(textOf(el), 3, 320) : shorten(textOf(el));
    if (!text) return;
    timer = setTimeout(() => {
      if (!el.isConnected) return;
      // Never over an open suggestion list (v1.38): the list is what you're looking at.
      if (el.getAttribute('aria-expanded') === 'true' || el.closest('.combo-list') || doc.querySelector('.combo-list:not([hidden])')) return;
      current = el;
      box().textContent = text;
      el.setAttribute('aria-describedby', 'cv-tip');
      place(el);
    }, delay);
  }

  function hide() {
    clearTimeout(timer);
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    if (tip) tip.hidden = true;
  }

  // A frame's title names it for screen readers; it isn't an explanation to show.
  const target = (e) => { const el = e.target && e.target.closest ? e.target.closest('[title], [data-tip]') : null; return el && el.tagName !== 'IFRAME' ? el : null; };

  doc.addEventListener('pointerover', (e) => {
    const el = target(e);
    if (el === current) return;
    if (!el) return hide();
    show(el, 350);
  });
  doc.addEventListener('pointerout', (e) => { const el = target(e); if (el && !el.contains(e.relatedTarget)) hide(); });
  doc.addEventListener('focusin', (e) => { const el = target(e); if (el && e.target.matches(':focus-visible')) show(el, 150); });
  doc.addEventListener('focusout', hide);
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) hide(); }, true);
  // Scrolling hides a box that is showing (it would be in the wrong place); one about to show is
  // placed where its element is by then.
  doc.addEventListener('scroll', () => { if (tip && !tip.hidden) hide(); }, true);
  doc.addEventListener('pointerdown', hide, true);

  /* ---------- explanations become hover boxes ----------
   * A paragraph marked .explain (the longer "what this does" sentences) is taken off the page and
   * its text goes into the hover box of the nearest heading or label (v1.29: no ⓘ). Its text
   * stays available to screen readers (aria-description). */
  const HEAD = 'h1, h2, h3, h4, legend, summary';
  function anchorFor(el) {
    const prev = el.previousElementSibling;
    if (prev && prev.matches(HEAD)) return prev;
    if (prev && prev.matches('.field, label.field')) return prev.querySelector(':scope > span') || prev;
    if (prev) { const inner = prev.querySelector(`:scope > ${HEAD.split(', ').join(', :scope > ')}`); if (inner) return inner; }
    const parent = el.parentElement;
    if (parent) {
      const head = parent.querySelector(`:scope > ${HEAD.split(', ').join(', :scope > ')}`);
      if (head && head.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return head;
    }
    return null;
  }
  function explainify(el) {
    if (!el.isConnected || el.dataset.explained) return;
    el.dataset.explained = '1';
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    // v1.29: no ⓘ. The explanation shows when you point at the heading or label it belongs to
    // (and its icon); screen readers get it as that element's description.
    const anchor = anchorFor(el) || el.parentElement;
    if (!anchor) return;
    const own = anchor.getAttribute('title') || anchor.dataset.tip || '';
    anchor.removeAttribute('title');
    anchor.dataset.tip = own && !own.includes(text) ? `${own}\n${text}` : (own || text);
    anchor.dataset.tipLong = '1';
    anchor.classList.add('has-tip');
    if (anchor.matches(HEAD) && !anchor.hasAttribute('tabindex') && !anchor.closest('summary, button, a')) anchor.tabIndex = 0;
    anchor.setAttribute('aria-description', anchor.dataset.tip);
    el.remove();
  }
  const scan = (node) => {
    if (!(node instanceof Element)) return;
    if (node.matches('.explain')) explainify(node);
    for (const x of node.querySelectorAll('.explain')) explainify(x);
  };
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) scan(n); })
    .observe(doc.documentElement, { childList: true, subtree: true });
  if (doc.body) scan(doc.body);

  root.CVTooltip = { hide };
})(this);
