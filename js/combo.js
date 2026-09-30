/* CaseVault — a searchable drop-down you can also type into (v1.22): UCR codes, location codes,
 * charges, gangs. Typing filters the list (every word must match, anywhere); the ▾ button shows
 * the whole list; ↑ ↓ and Enter pick; Esc closes. Anything not in the list can still be typed.
 *
 *   const box = CVCombo.attach(input, { items: () => [{ value, label, hint }], onPick(item) })
 *   // put `box` where the input would have gone
 */
'use strict';

(function (root) {
  let seq = 0;

  /** Items matching a query: every word appears in the label or hint (case doesn't matter). */
  function filter(items, query, max = 80) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const it of items) {
      const hay = `${it.label} ${it.hint || ''}`.toLowerCase();
      if (words.every((w) => hay.includes(w))) out.push(it);
      if (out.length >= max) break;
    }
    return out;
  }

  function attach(input, { items, onPick, max = 80, label = 'Show the list' } = {}) {
    const doc = root.document;
    const id = `cv-combo-${++seq}`;
    const wrap = doc.createElement('div');
    wrap.className = 'combo';
    const list = doc.createElement('ul');
    list.className = 'combo-list';
    list.id = id;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'combo-toggle';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', label);
    btn.append(root.CVIcons ? root.CVIcons.icon('chevron-down') : '▾');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', id);
    input.setAttribute('aria-expanded', 'false');
    input.autocomplete = 'off';
    input.removeAttribute('list');
    wrap.append(input, btn, list);

    let shown = [];
    let active = -1;
    let picking = false;
    const open = () => !list.hidden;
    function close() { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    function mark() {
      [...list.children].forEach((li, i) => li.classList.toggle('active', i === active));
      const li = list.children[active];
      if (li) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', li.id); }
    }
    function draw(all) {
      shown = filter(items(), all ? '' : input.value, max);
      list.replaceChildren(...shown.map((it, i) => {
        const li = doc.createElement('li');
        li.className = 'combo-opt';
        li.id = `${id}-${i}`;
        li.setAttribute('role', 'option');
        const main = doc.createElement('span');
        main.textContent = it.label;
        li.append(main);
        if (it.hint) { const s = doc.createElement('span'); s.className = 'combo-hint'; s.textContent = it.hint; li.append(s); }
        li.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus in the box
        li.addEventListener('click', () => pick(i));
        return li;
      }));
      // Nothing to choose when the text already is the one match.
      const exact = !all && shown.length === 1 && shown[0].value.toLowerCase() === input.value.trim().toLowerCase();
      list.hidden = !shown.length || exact;
      input.setAttribute('aria-expanded', String(!list.hidden));
      active = -1;
    }
    function pick(i) {
      const it = shown[i];
      if (!it) return;
      picking = true;
      input.value = it.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      picking = false;
      close();
      if (onPick) onPick(it);
    }
    input.addEventListener('input', () => { if (!picking && doc.activeElement === input) draw(false); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open()) draw(!input.value); active = Math.min(active + 1, shown.length - 1); mark(); } else if (e.key === 'ArrowUp' && open()) { e.preventDefault(); active = Math.max(active - 1, 0); mark(); } else if (e.key === 'Enter' && open() && active >= 0) { e.preventDefault(); pick(active); } else if (e.key === 'Escape' && open()) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (doc.activeElement !== input) close(); }, 120));
    // A click anywhere else closes the list, whatever has the focus.
    doc.addEventListener('pointerdown', (e) => { if (open() && !wrap.contains(e.target)) close(); }, true);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => { if (input.disabled || input.readOnly) return; if (open()) close(); else { input.focus(); draw(true); } });
    return wrap;
  }

  const api = { attach, filter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVCombo = api;
})(this);
