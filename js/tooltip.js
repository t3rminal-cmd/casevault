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
    const left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, root.innerWidth - w - 6));
    b.style.left = `${Math.round(left)}px`;
    b.style.top = `${Math.round(Math.max(4, top))}px`;
    b.classList.toggle('above', !below);
  }

  function show(el, delay) {
    clearTimeout(timer);
    const text = textOf(el);
    if (!text) return;
    timer = setTimeout(() => {
      if (!el.isConnected) return;
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

  const target = (e) => (e.target && e.target.closest ? e.target.closest('[title], [data-tip]') : null);

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
   * its text goes into a hover box behind an ⓘ on the nearest heading or label. Its text stays
   * available to screen readers (aria-label). */
  const HEAD = 'h1, h2, h3, h4, legend, summary';
  function tipButton(text) {
    const b = doc.createElement('span');
    b.className = 'tip-btn';
    b.tabIndex = 0;
    b.setAttribute('role', 'img');
    b.setAttribute('aria-label', `About this: ${text}`);
    b.dataset.tip = text;
    if (root.CVIcons) b.append(root.CVIcons.icon('info-circle'));
    else b.textContent = 'ⓘ';
    return b;
  }
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
    const anchor = anchorFor(el);
    const existing = anchor && anchor.querySelector(':scope > .tip-btn');
    if (existing) {
      existing.dataset.tip = `${existing.dataset.tip}\n${text}`;
      existing.setAttribute('aria-label', `About this: ${existing.dataset.tip}`);
      el.remove();
    } else if (anchor) {
      anchor.append(tipButton(text));
      el.remove();
    } else {
      const line = doc.createElement('div');
      line.className = 'tip-line';
      line.append(tipButton(text));
      el.replaceWith(line);
    }
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
