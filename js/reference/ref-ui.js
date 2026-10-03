/* CaseVault — the Reference screen (#/reference: the narcotic calculator and value chart,
 * incident location codes, commonly used UCR), and the Quick links at the bottom of the
 * Overview: Reference, OSINT and LEO tabs (js/reference/links.js). Links can be hidden, edited and
 * added in Vault → Quick links. Web links open in a new browser tab with no referrer; CaseVault
 * itself never contacts those sites.
 */
'use strict';

(function (root) {
  let ui = null;
  const K = () => root.CVReference;
  const RD = () => root.CVRefData;
  const LK = () => root.CVLinks;

  const SECTIONS = [
    { key: 'narcotics', title: 'Narcotic Calculator', icon: 'calculator-fill', blurb: 'Street value calculator and value chart, HIDTA 2022.' },
    { key: 'incident', title: 'Location Codes', icon: 'geo-alt', blurb: 'Location codes by place type. Click a code to copy it.' },
    { key: 'ucr', title: 'Common UCR', icon: 'journal-text', blurb: 'UCR codes by category. Search by code or offense.' },
    { key: 'charges', title: 'Charges', icon: 'bank2', blurb: 'Illinois and federal statutes for narcotics, mail and weapons charges. Search by statute or wording.' },
  ];

  // This window only.
  const mem = { calc: { drug: 'Cocaine (Powder)', amount: '', unit: 'gram' }, editLinks: false };

  async function copy(text, what = 'Copied') {
    try { await navigator.clipboard.writeText(text); ui.toast(what, 'success', 1800); } catch { ui.toast('Could not copy. Select the text and press Ctrl+C.', 'error'); }
  }

  const savedLinks = () => (Vault.data && Vault.data.settings.quickLinks) || {};
  const saveLinks = (patch) => ui.Save.track('settings', () => Vault.updateSettings({ quickLinks: { ...savedLinks(), ...patch } }));

  /* ---------- Quick links (bottom of the Overview) ---------- */

  function linkTile(l, { editing, redraw, footer }) {
    const { h } = ui;
    const inner = [h('span', { class: `ql-icon ql-${l.tab}` }, ui.icon(l.icon)), h('span', { class: 'ql-name' }, l.name)];
    const tip = `${l.note || l.name}${l.url ? `\n${l.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}${l.url ? '\nOpens in a new browser tab.' : ''}`;
    let tile;
    // Charges asks which (v1.28): Federal Statute or State Statute.
    // v1.63: in the footer, the choices sit inside the button (no menu to be cut off).
    if (l.choices && !editing && footer) {
      return h('span', { class: 'quick-link ql-split', title: tip }, ...inner, h('span', { class: 'ql-split-opts' }, l.choices.map(([label, hash]) => h('a', { class: 'ql-split-opt', href: hash }, label.replace(/\s*Statutes?$/i, '')))));
    }
    if (l.choices && !editing) {
      const menu = h('div', { class: 'ql-choices', role: 'menu', hidden: true }, l.choices.map(([label, hash]) => h('a', { class: 'ql-choice', role: 'menuitem', href: hash }, label)));
      const btn = h('button', { type: 'button', class: 'quick-link', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: tip }, ...inner);
      const close = (e) => { if (!wrap.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', close, true); } };
      btn.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        btn.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) { document.addEventListener('pointerdown', close, true); menu.querySelector('a').focus(); }
      });
      menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
      const wrap = h('div', { class: 'ql-choice-wrap' }, btn, menu);
      return wrap;
    }
    if (l.hash) tile = h('a', { class: 'quick-link', href: l.hash, title: tip }, ...inner);
    else if (l.url) tile = h('a', { class: 'quick-link', href: l.url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer', title: tip }, ...inner, h('span', { class: 'ql-ext' }, ui.icon('box-arrow-up-right')));
    else tile = h('button', { type: 'button', class: 'quick-link needs-url', title: `${l.note || ''} No web address yet: click to add it.`, onclick: () => ui.showVaultPanel('links') }, ...inner, h('span', { class: 'ql-ext' }, ui.icon('pencil')));
    if (!editing) return tile;
    // Arrange (v1.29): ‹ › move a button within its tab, or drag it onto another.
    const move = async (step) => { try { await saveLinks({ order: LK().moveLink(savedLinks(), l.id, step) }); redraw(); } catch { /* reported */ } };
    const wrap = h('div', { class: `ql-edit-wrap ${l.hidden ? 'is-hidden' : ''}`, draggable: 'true', 'data-id': l.id, title: 'Drag to move it, or use the arrows' },
      h('button', { type: 'button', class: 'ql-move', title: 'Move left', onclick: () => move(-1) }, ui.icon('chevron-left'), h('span', { class: 'sr-only' }, `Move ${l.name} left`)),
      tile,
      h('button', { type: 'button', class: 'ql-move', title: 'Move right', onclick: () => move(1) }, ui.icon('chevron-right'), h('span', { class: 'sr-only' }, `Move ${l.name} right`)),
      l.fixed ? h('span', { class: 'ql-toggle', title: 'Always shown' }) : h('button', { type: 'button', class: 'ql-toggle', title: l.hidden ? 'Show this link' : 'Hide this link', onclick: async () => {
        const hidden = new Set(savedLinks().hidden || []);
        if (hidden.has(l.id)) hidden.delete(l.id); else hidden.add(l.id);
        try { await saveLinks({ hidden: [...hidden] }); redraw(); } catch { /* reported */ }
      } }, ui.icon(l.hidden ? 'eye' : 'eye-slash'), h('span', { class: 'sr-only' }, l.hidden ? `Show ${l.name}` : `Hide ${l.name}`)));
    wrap.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-casevault-link', l.id); e.dataTransfer.effectAllowed = 'move'; wrap.classList.add('dragging'); });
    wrap.addEventListener('dragend', () => wrap.classList.remove('dragging'));
    wrap.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-casevault-link')) { e.preventDefault(); wrap.classList.add('drop-target'); } });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-target'));
    wrap.addEventListener('drop', async (e) => {
      e.preventDefault();
      wrap.classList.remove('drop-target');
      const id = e.dataTransfer.getData('application/x-casevault-link');
      if (!id || id === l.id) return;
      const r = wrap.getBoundingClientRect();
      try { await saveLinks({ order: LK().dropLink(savedLinks(), id, l.id, e.clientX > r.left + r.width / 2) }); redraw(); } catch { /* reported */ }
    });
    return wrap;
  }

  function quickLinks(opts = {}) {
    const { h } = ui;
    const wrap = h('div', { class: `quick-links-box${opts.footer ? ' in-footer' : ''}` });
    const draw = () => {
      const all = LK().linksOf(savedLinks());
      const tab = savedLinks().tab && LK().TABS.some((t) => t.key === savedLinks().tab) ? savedLinks().tab : 'reference';
      const editing = mem.editLinks;
      const inTab = all.filter((l) => l.tab === tab);
      const shown = editing ? inTab : inTab.filter((l) => !l.hidden);
      const hiddenCount = inTab.filter((l) => l.hidden).length;
      // (replaceChildren would write a null out as the text "null", so empty parts are dropped.)
      wrap.classList.toggle('editing', !!editing);
      wrap.replaceChildren(...[
        h('div', { class: 'ql-head' },
          h('div', { class: 'segmented ql-tabs', role: 'tablist', 'aria-label': 'Quick links' }, LK().TABS.map((t) => h('button', {
            type: 'button', role: 'tab', class: `btn small ${t.key === tab ? 'active' : ''}`, 'aria-selected': String(t.key === tab), icon: t.icon,
            onclick: async () => { try { await saveLinks({ tab: t.key }); } catch { /* reported */ } draw(); },
          }, t.label))),
          h('div', { class: 'spacer' }),
          !editing && hiddenCount ? h('span', { class: 'small muted' }, `${hiddenCount} hidden`) : null,
          h('button', { type: 'button', class: `btn small ${editing ? 'primary' : 'ghost'}`, icon: editing ? 'check2' : 'arrow-left-right', title: editing ? 'Finish' : 'Move the buttons (arrows or drag) and choose which to show. Addresses and your own links: Vault → Quick links.', onclick: () => { mem.editLinks = !mem.editLinks; draw(); } }, editing ? 'Done' : 'Arrange')),
        // v1.63: in the footer the warning is a small sign (hover or focus for the words).
        tab !== 'reference' ? (opts.footer
          ? h('span', { class: 'ql-note-sign', tabindex: '0', role: 'note', title: 'These open outside CaseVault, in a new browser tab. Never paste case details into outside websites unless your policy allows it.' }, ui.icon('exclamation-triangle-fill'), h('span', {}, 'Outside Sites'))
          : h('p', { class: 'muted small ql-note' }, 'These open outside CaseVault, in a new browser tab. Never paste case details into outside websites unless your policy allows it.')) : null,
        shown.length ? h('div', { class: 'quick-links' }, shown.map((l) => linkTile(l, { editing, redraw: draw, footer: !!opts.footer })))
          : h('p', { class: 'muted small' }, inTab.length ? 'All the links here are hidden. Click Arrange to bring them back.' : 'No links here yet. Add one in Vault → Quick links.')].filter(Boolean));
    };
    draw();
    return wrap;
  }

  /* ---------- Vault → Quick links: change addresses, add your own ---------- */

  function linksSection() {
    const { h, toast } = ui;
    const box = h('div', {});
    let savers = []; // each row's save(), for the Save button
    const draw = () => {
      savers = [];
      const all = LK().linksOf(savedLinks()).filter((l) => l.tab !== 'reference');
      box.replaceChildren(...LK().TABS.filter((t) => t.key !== 'reference').map((t) => h('div', { class: 'links-group' },
        h('h4', {}, ui.icon(t.icon), t.label),
        h('ul', { class: 'links-rows' }, all.filter((l) => l.tab === t.key).map((l) => row(l))),
        addRow(t.key))));
    };
    const row = (l) => {
      const name = h('input', { value: l.name, maxlength: 60, 'aria-label': 'Name', readonly: l.fixed || null });
      const url = h('input', { value: l.url || '', placeholder: 'Web address: portal.example.org', 'aria-label': `${l.name} web address`, spellcheck: 'false', readonly: l.fixed || null });
      const save = async ({ redraw = true } = {}) => {
        const clean = LK().cleanUrl(url.value);
        if (clean === null) { toast('That is not a web address (it must start with https://).', 'error'); return false; }
        if (name.value.trim() === l.name && clean === (l.url || '')) return true;
        const s = savedLinks();
        try {
          if (l.custom) await saveLinks({ custom: (s.custom || []).map((c) => (c.id === l.id ? { ...c, name: name.value.trim() || c.name, url: clean } : c)) });
          else await saveLinks({ edits: { ...(s.edits || {}), [l.id]: { ...((s.edits || {})[l.id] || {}), name: name.value.trim() || l.name, url: clean } } });
          if (redraw) draw();
          return true;
        } catch { return false; /* reported */ }
      };
      savers.push(save);
      name.addEventListener('change', () => save());
      url.addEventListener('change', () => save());
      // v1.54: a fixed link (Chicago HIDTA) is always shown and keeps its address.
      if (l.fixed) return h('li', { class: 'links-row links-fixed', title: 'Built in: always shown, its address can\'t be changed' }, h('span', { class: 'links-icon' }, ui.icon(l.icon)), name, url, h('span', { class: 'muted small' }, 'Always'), h('span'));
      const hidden = h('input', { type: 'checkbox', checked: !l.hidden });
      hidden.addEventListener('change', async () => {
        const set = new Set(savedLinks().hidden || []);
        if (hidden.checked) set.delete(l.id); else set.add(l.id);
        try { await saveLinks({ hidden: [...set] }); } catch { /* reported */ }
      });
      return h('li', { class: 'links-row' },
        h('span', { class: 'links-icon' }, ui.icon(l.icon)), name, url,
        h('label', { class: 'check-row small', title: 'Show this button in Quick links' }, hidden, h('span', {}, 'Show')),
        l.custom
          ? h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove this link', onclick: async () => { try { await saveLinks({ custom: (savedLinks().custom || []).filter((c) => c.id !== l.id) }); draw(); } catch { /* reported */ } } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove ${l.name}`))
          : h('button', { class: 'icon-btn', type: 'button', title: 'Back to the built-in name and address', onclick: async () => { const e = { ...(savedLinks().edits || {}) }; delete e[l.id]; try { await saveLinks({ edits: e }); draw(); } catch { /* reported */ } } }, ui.icon('arrow-counterclockwise'), h('span', { class: 'sr-only' }, `Reset ${l.name}`)));
    };
    const addRow = (tab) => {
      const name = h('input', { placeholder: 'Name', maxlength: 60, 'aria-label': 'New link name' });
      const url = h('input', { placeholder: 'Web address: portal.example.org', 'aria-label': 'New link address', spellcheck: 'false' });
      return h('form', { class: 'links-add', onsubmit: async (e) => {
        e.preventDefault();
        const clean = LK().cleanUrl(url.value);
        if (!name.value.trim() || !clean) { toast('Give the link a name and a web address (for example portal.example.org).', 'error'); return; }
        const custom = [...(savedLinks().custom || []), { id: `custom-${Date.now().toString(36)}`, tab, name: name.value.trim(), url: clean }];
        try { await saveLinks({ custom }); draw(); } catch { /* reported */ }
      } }, name, url, h('button', { class: 'btn small', type: 'submit', icon: 'plus-lg' }, `Add to ${tab === 'leo' ? 'LEO' : 'OSINT'}`));
    };
    draw();
    return h('section', { 'data-section': 'links' },
      h('h3', {}, 'Quick links'),
      h('p', { class: 'muted small explain' }, 'The OSINT and LEO buttons at the bottom of the Overview. Change a name or address (it saves when you leave the box), untick Show to hide a button, or add your own, such as your agency\'s portals. They open in a new browser tab; CaseVault never contacts them itself.'),
      box,
      h('div', { class: 'row links-save' }, h('div', { class: 'spacer' }),
        h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', title: 'Save every name and address in this box to vault.json on the SSD.', onclick: async () => {
          let ok = true;
          for (const fn of [...savers]) ok = (await fn({ redraw: false })) && ok;
          draw();
          if (ok) toast('Quick links saved to the SSD.', 'success', 2500);
        } }, 'Save changes')));
  }

  /* ---------- Reference pages ---------- */

  async function render(main, section) {
    const { h } = ui;
    // charges-federal / charges-state (v1.28): the Charges page with one set of statutes.
    const scope = /^charges-(federal|state)$/.test(section || '') ? section.slice(8) : null;
    if (scope) section = 'charges';
    const sec = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
    const body = h('div', { class: 'ref-body' });
    main.replaceChildren(h('section', { class: 'reference' },
      h('div', { class: 'ref-head' },
        h('h1', { class: 'page-title', icon: sec.icon }, sec.title),
        h('p', { class: 'muted small explain' }, 'Quick reference only: always follow your department\'s policies.')),
      h('nav', { class: 'ref-nav', 'aria-label': 'Reference' },
        SECTIONS.map((s) => h('a', { href: `#/reference/${s.key}`, class: `ref-pill ${sec.key === s.key ? 'active' : ''}`, 'aria-current': sec.key === s.key ? 'page' : null, icon: s.icon, title: s.blurb }, s.title))),
      body));
    if (sec.key === 'narcotics') return body.replaceChildren(h('div', { class: 'ref-grid ref-narc' }, calculator(), card(`Street value chart (${RD().NARCOTIC_SOURCE})`, 'table', valueChartEl())));
    if (sec.key === 'incident') return body.replaceChildren(codeBrowser(RD().LOCATION_CODES, 'Search location codes', 'location code'));
    if (sec.key === 'ucr') return body.replaceChildren(codeBrowser(RD().UCR_CODES, 'Search UCR codes or offenses', 'UCR code'));
    if (sec.key === 'charges') {
      const groups = scope ? RD().CHARGES.filter((g) => (scope === 'federal' ? /^us-/ : /^il-/).test(g.key)) : RD().CHARGES;
      const pick = h('div', { class: 'segmented charges-scope', role: 'tablist', 'aria-label': 'Statutes' },
        [['state', 'State Statute'], ['federal', 'Federal Statute'], ['', 'Both']].map(([k, label]) => h('a', { class: `btn small ${(scope || '') === k ? 'active' : ''}`, role: 'tab', 'aria-selected': String((scope || '') === k), href: `#/reference/charges${k ? `-${k}` : ''}` }, label)));
      return body.replaceChildren(pick, codeBrowser(groups, scope === 'federal' ? 'Search federal statutes' : scope === 'state' ? 'Search state statutes' : 'Search statutes or charges', 'statute'));
    }
  }

  const card = (title, icon, ...kids) => ui.h('section', { class: 'ref-card' }, ui.h('h2', { class: 'ref-card-title', icon }, title), ...kids);


  function calculator() {
    const { h } = ui;
    const c = mem.calc;
    const drug = h('select', { 'aria-label': 'Drug' }, RD().NARCOTIC_CATEGORIES.map((cat) => h('optgroup', { label: cat },
      Object.keys(RD().NARCOTIC_DATA).filter((k) => RD().NARCOTIC_DATA[k].cat === cat).map((k) => h('option', { value: k, selected: k === c.drug }, k)))));
    const amount = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: 'Amount', 'aria-label': 'Amount', value: c.amount });
    const unit = h('select', { 'aria-label': 'Unit' });
    const result = h('div', { class: 'calc-result', role: 'status', 'aria-live': 'polite' });
    const copyBtn = h('button', { class: 'btn', type: 'button', icon: 'copy', disabled: true }, 'Copy for a report');
    let line = '';
    const syncUnits = () => {
      const units = K().priceUnits(drug.value);
      unit.replaceChildren(...units.map((u) => h('option', { value: u, selected: u === c.unit }, K().unitLabel(u))));
      if (!units.includes(c.unit)) c.unit = units[0];
    };
    const calc = () => {
      Object.assign(c, { drug: drug.value, amount: amount.value, unit: unit.value });
      if (!amount.value) { result.className = 'calc-result'; result.textContent = 'Enter an amount.'; copyBtn.disabled = true; return; }
      const r = K().streetValue(drug.value, amount.value, unit.value);
      result.className = `calc-result ${r.ok ? 'is-value' : 'is-error'}`;
      result.textContent = r.ok ? r.text : r.error;
      line = r.ok ? r.line : '';
      copyBtn.disabled = !r.ok;
    };
    drug.addEventListener('change', () => { syncUnits(); calc(); });
    unit.addEventListener('change', calc);
    amount.addEventListener('input', calc);
    copyBtn.addEventListener('click', () => copy(line, 'Copied the value line.'));
    syncUnits();
    calc();
    return card('Value calculator', 'calculator-fill',
      h('div', { class: 'calc-form' }, ui.field('Drug', drug), ui.field('Amount', amount), ui.field('Unit', unit)),
      result,
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, `${RD().NARCOTIC_SOURCE} street values. ≈ Estimates (gram price × 454).`), h('div', { class: 'spacer' }), copyBtn));
  }

  /** v1.62: "Cocaine (Powder)" -> Drug "Cocaine", Form "Powder". */
  function drugCells(name) {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name);
    return [ui.h('th', { scope: 'row' }, m ? m[1] : name), ui.h('td', { class: 'vc-form-cell' }, m ? m[2] : '—')];
  }

  function valueChartEl() {
    const { h } = ui;
    // v1.62: every category has the same columns, the same widths, so the whole chart lines up.
    const groups = K().valueChart();
    const units = [...new Set(groups.flatMap((g) => g.units))].sort((a, b) => groups.findIndex((g) => g.units.includes(a)) - groups.findIndex((g) => g.units.includes(b)));
    const order = ['gram', 'pill', 'ounce', 'pound', 'kilogram'];
    units.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    return h('div', { class: 'value-chart' }, groups.map((g) => h('div', { class: 'value-group' },
      h('h3', {}, g.category),
      h('div', { class: 'table-wrap' }, h('table', { class: 'value-table' },
        // The form in brackets, e.g. (Powder), has its own column so the names line up.
        h('colgroup', {}, h('col', { class: 'vc-drug' }), h('col', { class: 'vc-form' }), units.map(() => h('col', { class: 'vc-price' }))),
        h('thead', {}, h('tr', {}, h('th', {}, 'Drug'), h('th', {}, 'Form'), units.map((u) => h('th', { class: 'num' }, `per ${u}`)))),
        h('tbody', {}, g.rows.map((r) => h('tr', {}, ...drugCells(r.drug),
          units.map((u) => {
            const cell = r.cells[u];
            if (!cell) return h('td', { class: 'num muted' }, '—');
            return h('td', { class: `num ${cell.verify ? 'verify' : ''}`, title: cell.estimate ? 'Estimate: the gram price × 454' : cell.verify ? 'This price needs verification' : null },
              h('span', { class: 'vc-price-text' }, `${cell.estimate ? '≈ ' : ''}${K().money(cell.price)}`), cell.verify ? h('span', { class: 'pill warn-pill' }, 'verify') : null);
          })))))))));
  }

  function codeBrowser(list, placeholder, what) {
    const { h } = ui;
    const q = h('input', { type: 'search', placeholder, 'aria-label': placeholder });
    const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: 'all' }, 'All categories'), list.map((g) => h('option', { value: g.key }, `${g.title} · ${g.codes.length}`)));
    const out = h('div', { class: 'code-groups' });
    const draw = () => {
      const groups = K().searchCodes(list, q.value, cat.value);
      out.replaceChildren(...(groups.length ? groups.map((g) => h('section', { class: 'code-group' }, h('h3', {}, g.title),
        h('ul', { class: 'code-grid' }, g.codes.map(([code, desc]) => h('li', {}, h('button', { class: `code-card${code.length > 6 ? ' code-card-long' : ''}`, type: 'button', title: `Copy ${code}`, onclick: () => copy(code, `Copied ${what} ${code}.`) },
          h('span', { class: 'code-card-code' }, code), h('span', { class: 'code-card-desc' }, desc), h('span', { class: 'code-card-copy' }, ui.icon('copy')))))))) : [h('p', { class: 'muted' }, 'No codes match.')]));
    };
    q.addEventListener('input', draw);
    cat.addEventListener('change', draw);
    draw();
    return h('div', { class: 'ref-card' },
      h('div', { class: 'ref-filters' }, h('div', { class: 'search-wrap' }, ui.icon('search'), q), cat),
      h('p', { class: 'muted small' }, 'Click a code to copy it.'),
      out);
  }

  function init(kit) { ui = kit; }

  root.CVReferenceUI = { init, render, quickLinks, linksSection, SECTIONS };
})(this);
