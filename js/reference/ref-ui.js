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
    { key: 'narcotics', title: 'Narcotic calculator', icon: 'calculator-fill', blurb: 'Street value calculator and value chart, HIDTA 2022.' },
    { key: 'incident', title: 'Incident location codes', icon: 'geo-alt', blurb: 'Location codes by place type. Click a code to copy it.' },
    { key: 'ucr', title: 'Commonly used UCR', icon: 'journal-text', blurb: 'UCR codes by category. Search by code or offense.' },
  ];

  // This window only.
  const mem = { calc: { drug: 'Cocaine (Powder)', amount: '', unit: 'gram' }, editLinks: false };

  async function copy(text, what = 'Copied') {
    try { await navigator.clipboard.writeText(text); ui.toast(what, 'success', 1800); } catch { ui.toast('Could not copy. Select the text and press Ctrl+C.', 'error'); }
  }

  const savedLinks = () => (Vault.data && Vault.data.settings.quickLinks) || {};
  const saveLinks = (patch) => ui.Save.track('settings', () => Vault.updateSettings({ quickLinks: { ...savedLinks(), ...patch } }));

  /* ---------- Quick links (bottom of the Overview) ---------- */

  function linkTile(l, { editing, redraw }) {
    const { h } = ui;
    const inner = [h('span', { class: `ql-icon ql-${l.tab}` }, ui.icon(l.icon)), h('span', { class: 'ql-name' }, l.name)];
    const tip = `${l.note || l.name}${l.url ? `\n${l.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}${l.url ? '\nOpens in a new browser tab.' : ''}`;
    let tile;
    if (l.hash) tile = h('a', { class: 'quick-link', href: l.hash, title: tip }, ...inner);
    else if (l.url) tile = h('a', { class: 'quick-link', href: l.url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer', title: tip }, ...inner, h('span', { class: 'ql-ext' }, ui.icon('box-arrow-up-right')));
    else tile = h('button', { type: 'button', class: 'quick-link needs-url', title: `${l.note || ''} No web address yet: click to add it.`, onclick: () => ui.showVaultPanel('links') }, ...inner, h('span', { class: 'ql-ext' }, ui.icon('pencil')));
    if (!editing) return tile;
    return h('div', { class: `ql-edit-wrap ${l.hidden ? 'is-hidden' : ''}` }, tile,
      h('button', { type: 'button', class: 'ql-toggle', title: l.hidden ? 'Show this link' : 'Hide this link', onclick: async () => {
        const hidden = new Set(savedLinks().hidden || []);
        if (hidden.has(l.id)) hidden.delete(l.id); else hidden.add(l.id);
        try { await saveLinks({ hidden: [...hidden] }); redraw(); } catch { /* reported */ }
      } }, ui.icon(l.hidden ? 'eye' : 'eye-slash'), h('span', { class: 'sr-only' }, l.hidden ? `Show ${l.name}` : `Hide ${l.name}`)));
  }

  function quickLinks() {
    const { h } = ui;
    const wrap = h('div', { class: 'quick-links-box' });
    const draw = () => {
      const all = LK().linksOf(savedLinks());
      const tab = savedLinks().tab && LK().TABS.some((t) => t.key === savedLinks().tab) ? savedLinks().tab : 'reference';
      const editing = mem.editLinks;
      const inTab = all.filter((l) => l.tab === tab);
      const shown = editing ? inTab : inTab.filter((l) => !l.hidden);
      const hiddenCount = inTab.filter((l) => l.hidden).length;
      // (replaceChildren would write a null out as the text "null", so empty parts are dropped.)
      wrap.replaceChildren(...[
        h('div', { class: 'ql-head' },
          h('div', { class: 'segmented ql-tabs', role: 'tablist', 'aria-label': 'Quick links' }, LK().TABS.map((t) => h('button', {
            type: 'button', role: 'tab', class: `btn small ${t.key === tab ? 'active' : ''}`, 'aria-selected': String(t.key === tab), icon: t.icon,
            onclick: async () => { try { await saveLinks({ tab: t.key }); } catch { /* reported */ } draw(); },
          }, t.label))),
          h('div', { class: 'spacer' }),
          !editing && hiddenCount ? h('span', { class: 'small muted' }, `${hiddenCount} hidden`) : null,
          h('button', { type: 'button', class: `btn small ${editing ? 'primary' : 'ghost'}`, icon: editing ? 'check2' : 'eye-slash', title: editing ? 'Finish' : 'Choose which buttons to show', onclick: () => { mem.editLinks = !mem.editLinks; draw(); } }, editing ? 'Done' : 'Show / hide'),
          h('button', { type: 'button', class: 'btn small ghost', icon: 'pencil', title: 'Change addresses and add your own links (Vault → Quick links)', onclick: () => ui.showVaultPanel('links') }, 'Edit links')),
        tab !== 'reference' ? h('p', { class: 'muted small ql-note' }, ui.icon('info-circle'), ' These open outside CaseVault, in a new browser tab. Never paste case details into outside websites unless your policy allows it.') : null,
        shown.length ? h('div', { class: 'quick-links' }, shown.map((l) => linkTile(l, { editing, redraw: draw })))
          : h('p', { class: 'muted small' }, inTab.length ? 'All the links here are hidden. Click Show / hide to bring them back.' : 'No links here yet. Add one in Vault → Quick links.')].filter(Boolean));
    };
    draw();
    return wrap;
  }

  /* ---------- Vault → Quick links: change addresses, add your own ---------- */

  function linksSection() {
    const { h, toast } = ui;
    const box = h('div', {});
    const draw = () => {
      const all = LK().linksOf(savedLinks()).filter((l) => l.tab !== 'reference');
      box.replaceChildren(...LK().TABS.filter((t) => t.key !== 'reference').map((t) => h('div', { class: 'links-group' },
        h('h4', {}, ui.icon(t.icon), t.label),
        h('ul', { class: 'links-rows' }, all.filter((l) => l.tab === t.key).map((l) => row(l))),
        addRow(t.key))));
    };
    const row = (l) => {
      const name = h('input', { value: l.name, maxlength: 60, 'aria-label': 'Name' });
      const url = h('input', { value: l.url || '', placeholder: 'Web address, e.g. portal.example.org', 'aria-label': `${l.name} web address`, spellcheck: 'false' });
      const save = async () => {
        const clean = LK().cleanUrl(url.value);
        if (clean === null) { toast('That is not a web address (it must start with https://).', 'error'); return; }
        const s = savedLinks();
        try {
          if (l.custom) await saveLinks({ custom: (s.custom || []).map((c) => (c.id === l.id ? { ...c, name: name.value.trim() || c.name, url: clean } : c)) });
          else await saveLinks({ edits: { ...(s.edits || {}), [l.id]: { ...((s.edits || {})[l.id] || {}), name: name.value.trim() || l.name, url: clean } } });
          draw();
        } catch { /* reported */ }
      };
      name.addEventListener('change', save);
      url.addEventListener('change', save);
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
      const url = h('input', { placeholder: 'Web address, e.g. portal.example.org', 'aria-label': 'New link address', spellcheck: 'false' });
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
      box);
  }

  /* ---------- Reference pages ---------- */

  async function render(main, section) {
    const { h } = ui;
    const sec = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
    const body = h('div', { class: 'ref-body' });
    main.replaceChildren(h('section', { class: 'reference' },
      h('div', { class: 'ref-head' },
        h('h1', { class: 'page-title', icon: sec.icon }, sec.title),
        h('p', { class: 'muted small explain' }, 'Quick reference only: always follow your department\'s policies.')),
      h('nav', { class: 'ref-nav', 'aria-label': 'Reference' },
        SECTIONS.map((s) => h('a', { href: `#/reference/${s.key}`, class: `ref-pill ${sec.key === s.key ? 'active' : ''}`, 'aria-current': sec.key === s.key ? 'page' : null, icon: s.icon, title: s.blurb }, s.title))),
      body));
    if (sec.key === 'narcotics') return body.replaceChildren(h('div', { class: 'ref-grid' }, calculator(), card(`Street value chart (${RD().NARCOTIC_SOURCE})`, 'table', valueChartEl())));
    if (sec.key === 'incident') return body.replaceChildren(codeBrowser(RD().LOCATION_CODES, 'Search location codes', 'location code'));
    if (sec.key === 'ucr') return body.replaceChildren(codeBrowser(RD().UCR_CODES, 'Search UCR codes or offenses', 'UCR code'));
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
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, `${RD().NARCOTIC_SOURCE} street values. ≈ marks an estimate (gram price × 454).`), h('div', { class: 'spacer' }), copyBtn));
  }

  function valueChartEl() {
    const { h } = ui;
    return h('div', { class: 'value-chart' }, K().valueChart().map((g) => h('div', { class: 'value-group' },
      h('h3', {}, g.category),
      h('div', { class: 'table-wrap' }, h('table', { class: 'value-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Drug'), g.units.map((u) => h('th', { class: 'num' }, `per ${u}`)))),
        h('tbody', {}, g.rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, r.drug),
          g.units.map((u) => {
            const cell = r.cells[u];
            if (!cell) return h('td', { class: 'num muted' }, '—');
            return h('td', { class: `num ${cell.verify ? 'verify' : ''}`, title: cell.estimate ? 'Estimate: the gram price × 454' : cell.verify ? 'This price needs verification' : null },
              cell.estimate ? '≈ ' : '', K().money(cell.price), cell.verify ? h('span', { class: 'pill warn-pill' }, 'verify') : null);
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
        h('ul', { class: 'code-grid' }, g.codes.map(([code, desc]) => h('li', {}, h('button', { class: 'code-card', type: 'button', title: `Copy ${code}`, onclick: () => copy(code, `Copied ${what} ${code}.`) },
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
