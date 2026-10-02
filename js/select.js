/* CaseVault — square drop-down lists (v1.53). A <select>'s own list is drawn by the browser and
 * Windows, with round corners, and only the newest Chrome and Edge let a page restyle it. So every
 * single-choice <select> opens CaseVault's own list instead: square, the same in every browser.
 * The <select> stays the real control (its value, change events, forms and screen readers), only
 * the pop-up is ours. Mouse: click it. Keyboard: Alt+↓, F4, Space or Enter opens it; ↑ ↓ Home End
 * move, a letter jumps, Enter picks, Esc closes. Plain ↑ ↓ on a closed list still step through it.
 */
'use strict';

(function (root) {
  const doc = root.document;
  if (!doc) return;
  let cur = null; // { sel, pop, close }

  const usable = (el) => el instanceof root.HTMLSelectElement && !el.multiple && !(el.size > 1) && !el.disabled && !el.closest('[inert]');

  function open(sel) {
    if (cur && cur.sel === sel) { cur.close(); return; }
    if (cur) cur.close();
    const host = sel.closest('dialog[open]') || doc.body;
    const pop = doc.createElement('div');
    pop.className = 'sel-pop';
    pop.setAttribute('role', 'listbox');
    if (sel.getAttribute('aria-label')) pop.setAttribute('aria-label', sel.getAttribute('aria-label'));
    const rows = [];
    const addOpt = (o, inGroup) => {
      const b = doc.createElement('div');
      b.className = `sel-opt${inGroup ? ' in-group' : ''}${o.disabled ? ' disabled' : ''}${o.selected ? ' on' : ''}`;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(o.selected));
      b.textContent = o.label || o.textContent || ' ';
      if (o.title) b.title = o.title;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { if (!o.disabled) pick(o); });
      b.addEventListener('mousemove', () => setActive(rows.findIndex((r) => r.el === b)));
      rows.push({ el: b, opt: o });
      pop.append(b);
    };
    for (const child of sel.children) {
      if (child.tagName === 'OPTGROUP') {
        const g = doc.createElement('div');
        g.className = 'sel-group';
        g.textContent = child.label;
        pop.append(g);
        for (const o of child.children) if (o.tagName === 'OPTION' && !o.hidden) addOpt(o, true);
      } else if (child.tagName === 'OPTION' && !child.hidden) addOpt(child, false);
    }
    let active = Math.max(0, rows.findIndex((r) => r.opt.selected));
    function setActive(i) {
      if (i < 0 || i >= rows.length) return;
      if (rows[active]) rows[active].el.classList.remove('active');
      active = i;
      rows[active].el.classList.add('active');
      rows[active].el.scrollIntoView({ block: 'nearest' });
    }
    function pick(o) {
      const changed = sel.value !== o.value || !o.selected;
      o.selected = true;
      close();
      sel.focus();
      if (changed) {
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const step = (from, dir) => { let i = from; do { i += dir; } while (rows[i] && rows[i].opt.disabled); return rows[i] ? i : from; };
    let typed = ''; let typedAt = 0;
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(step(active, 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(step(active, -1)); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(step(-1, 1)); }
      else if (e.key === 'End') { e.preventDefault(); setActive(step(rows.length, -1)); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (rows[active] && !rows[active].opt.disabled) pick(rows[active].opt); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const now = Date.now();
        typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
        typedAt = now;
        const i = rows.findIndex((r) => !r.opt.disabled && r.el.textContent.toLowerCase().startsWith(typed));
        if (i >= 0) setActive(i);
      }
    };
    const outside = (e) => { if (!pop.contains(e.target) && e.target !== sel) close(); };
    const scrolled = (e) => { if (!pop.contains(e.target)) close(); };
    function close() {
      if (!pop.isConnected) return;
      pop.remove();
      sel.removeEventListener('keydown', onKey, true);
      sel.removeEventListener('blur', onBlur);
      doc.removeEventListener('pointerdown', outside, true);
      root.removeEventListener('scroll', scrolled, true);
      root.removeEventListener('resize', close);
      sel.setAttribute('aria-expanded', 'false');
      if (cur && cur.pop === pop) cur = null;
    }
    const onBlur = () => setTimeout(() => { if (doc.activeElement !== sel) close(); }, 0);
    host.append(pop);
    // Under the box (above it when there's no room), inside the page's zoom.
    const z = parseFloat(doc.documentElement.style.zoom) || 1;
    const r = sel.getBoundingClientRect();
    const W = root.innerWidth / z; const H = root.innerHeight / z;
    pop.style.minWidth = `${Math.max(r.width / z, 120)}px`;
    const w = pop.offsetWidth; const h = pop.offsetHeight;
    pop.style.left = `${Math.max(4, Math.min(r.left / z, W - w - 4))}px`;
    const below = r.bottom / z + 2;
    pop.style.top = `${below + h > H - 4 && r.top / z - h - 2 > 4 ? r.top / z - h - 2 : Math.min(below, Math.max(4, H - h - 4))}px`;
    setActive(active);
    sel.setAttribute('aria-expanded', 'true');
    sel.addEventListener('keydown', onKey, true);
    sel.addEventListener('blur', onBlur);
    doc.addEventListener('pointerdown', outside, true);
    root.addEventListener('scroll', scrolled, true);
    root.addEventListener('resize', close);
    cur = { sel, pop, close };
  }

  doc.addEventListener('mousedown', (e) => {
    const sel = e.target instanceof Element && e.target.closest('select');
    if (!sel || !usable(sel) || e.button !== 0) return;
    e.preventDefault();
    sel.focus();
    open(sel);
  }, true);
  doc.addEventListener('keydown', (e) => {
    const sel = e.target;
    if (!usable(sel) || (cur && cur.sel === sel)) return;
    if ((e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) || e.key === 'F4' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      open(sel);
    }
  }, true);

  root.CVSelect = { open, close: () => cur && cur.close(), get openSelect() { return cur ? cur.sel : null; } };
})(this);
