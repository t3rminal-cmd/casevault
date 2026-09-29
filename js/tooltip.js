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
  doc.addEventListener('scroll', hide, true);
  doc.addEventListener('pointerdown', hide, true);

  root.CVTooltip = { hide };
})(this);
