/* CaseVault — the Link Chart tab (v1.52). The cards on the left (who is under whom), the card
 * you picked in a form under them, and the chart on the right as it will print. PDF View shows it
 * as a portrait page; Save PDF to Case puts it in Files → Link Charts, ready to attach.
 * Kept in the case folder as linkchart.json; photos are the case's own pictures (Subject Information).
 */
'use strict';

(function (root) {
  let ui = null;
  const FILE = 'linkchart.json';
  const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;
  const LC = () => root.CVLinkChart;

  async function load(c) {
    try { return LC().normalize(await Vault.readCaseJSON(c.id, FILE)); } catch { return LC().emptyChart(); }
  }

  /* ---------- pictures for the PDF ---------- */

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
  const iconCache = new Map();
  async function iconData(name) {
    if (!iconCache.has(name)) iconCache.set(name, fetch(`icons/color/${name}.png`).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? blobToDataUrl(b) : '')).catch(() => ''));
    return iconCache.get(name);
  }
  /** A case photo, made small (the card is 76 units; 300 px is plenty at print size). */
  async function photoData(c, path) {
    try {
      const file = await Vault.readFile(c.id, path);
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 300 / Math.min(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      bmp.close && bmp.close();
      return cv.toDataURL('image/jpeg', 0.9);
    } catch { return ''; }
  }

  /** The chart as a one-page portrait PDF (letter), the chart scaled to fit under the heading. */
  async function buildPdf(c, chart) {
    const R = root.CVReportPdf;
    const photos = new Map(); const icons = new Map();
    for (const n of chart.nodes) {
      if (n.kind === 'person' && n.photo && !photos.has(n.photo)) photos.set(n.photo, await photoData(c, n.photo));
      const ic = LC().iconOf(n);
      if (ic && !icons.has(ic)) icons.set(ic, await iconData(ic));
    }
    const { svg, width, height } = LC().toSvg(chart, { photoUrl: (n) => photos.get(n.photo) || '', iconUrl: (k) => icons.get(k) || '', pad: 6 });
    const PW = R.PAGE_W; const PH = R.PAGE_H; const M = 36;
    const top = PH - M - 46; const areaW = PW - 2 * M; const areaH = top - (M + 14);
    const k = Math.min(areaW / width, areaH / height, 1.6);
    const w = width * k; const hgt = height * k;
    // Drawn at about 200 dots per inch of the printed size.
    const dpi = 200 / 72;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * dpi)); cv.height = Math.max(1, Math.round(hgt * dpi));
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image(); img.src = url; await img.decode();
      g.drawImage(img, 0, 0, cv.width, cv.height);
    } finally { URL.revokeObjectURL(url); }
    const jpeg = new Uint8Array(await (await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
    const ops = [];
    const text = (x, y, s, size, bold) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${R.pdfString(s)} Tj ET`);
    text(M, PH - M - 14, 'Link Chart', 16, true);
    const sub = [chart.title, c.number ? `Case ${c.number}` : '', c.subject || ''].filter(Boolean).join(' · ');
    if (sub) text(M, PH - M - 30, sub, 10, false);
    ops.push(`0.6 w ${M} ${(top + 6).toFixed(2)} m ${PW - M} ${(top + 6).toFixed(2)} l S`);
    const x = M + (areaW - w) / 2; const y = top - hgt;
    ops.push(`q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`);
    const printed = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    text(M, M - 12, `Printed ${printed}`, 7.5, false);
    text(PW - M - R.width('Page 1 of 1', 8, false, 'helvetica'), M - 12, 'Page 1 of 1', 8, false);
    return R.assemble([{ ops, sigs: [], imgs: [0], signed: true }], { photos: [{ jpeg, w: cv.width, h: cv.height, index: 0 }], title: 'Link Chart' });
  }

  /* ---------- the tab ---------- */

  async function render(panel, c, token) {
    const { h, icon, field, toast, Save, openDialog } = ui;
    const chart = await load(c);
    const archived = Vault.isArchived(c.id);
    const files = archived ? [] : await Vault.listFiles(c.id).catch(() => []);
    if (token !== ui.state.renderToken) return;
    let images = files.filter((f) => IMAGE_RE.test(f.name));
    let selected = chart.nodes[0] ? chart.nodes[0].id : '';
    const urls = new Map(); // case photo path -> object URL, for the screen
    const photoUrl = (n) => {
      if (!n.photo) return '';
      if (!urls.has(n.photo)) {
        urls.set(n.photo, '');
        Vault.readFile(c.id, n.photo).then((f) => { urls.set(n.photo, URL.createObjectURL(f)); drawView(); }).catch(() => {});
      }
      return urls.get(n.photo);
    };

    const status = h('span', { class: 'note-save-status small muted', role: 'status', 'aria-live': 'polite' }, archived ? 'Archived: read only' : '✓ Saved on the SSD');
    const save = () => {
      if (archived) return;
      status.className = 'note-save-status small warn-text';
      status.textContent = 'Not saved yet…';
      Save.schedule(`linkchart:${c.id}`, async () => {
        chart.updated = new Date().toISOString();
        await Vault.writeCaseJSON(c.id, FILE, structuredClone(chart));
        status.className = 'note-save-status small ok-text';
        status.textContent = `✓ Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }, 600);
    };

    const tree = h('ul', { class: 'lc-tree', 'aria-label': 'Cards' });
    const form = h('div', { class: 'lc-form cv-boxed' });
    const linksBox = h('div', { class: 'lc-links cv-boxed' });
    const view = h('div', { class: 'lc-view', 'aria-label': 'The chart' });
    const nodeLabel = (n) => n.name || n.handle || (n.kind === 'person' ? 'Unknown person' : LC().subLine(n)) || 'Unnamed';

    function drawView() {
      const { svg } = LC().toSvg(chart, { photoUrl, iconUrl: (k) => `icons/color/${k}.png`, selected });
      view.innerHTML = chart.nodes.length ? svg : '';
      if (!chart.nodes.length) view.append(h('p', { class: 'muted lc-empty' }, archived ? 'No link chart for this case.' : 'Add the first person: Add Subject at the top left.'));
    }
    view.addEventListener('click', (e) => {
      const g = e.target.closest && e.target.closest('[data-node]');
      if (!g) return;
      selected = g.getAttribute('data-node');
      drawAll();
    });

    function drawTree() {
      const rows = LC().ordered(chart);
      tree.replaceChildren(...(rows.length ? rows.map(({ node: n, depth }) => {
        const ic = LC().iconOf(n);
        const b = h('button', { type: 'button', class: `lc-item${n.id === selected ? ' on' : ''}`, onclick: () => { selected = n.id; drawAll(); } },
          h('span', { class: 'lc-dot' }), ic ? icon(ic) : icon('person-badge'),
          h('span', { class: 'lc-item-name' }, nodeLabel(n)), h('span', { class: 'lc-item-sub muted small' }, LC().subLine(n)));
        b.style.setProperty('--depth', String(depth));
        b.style.setProperty('--lc', LC().colorOf(n));
        return h('li', {}, b);
      }) : [h('li', { class: 'muted small lc-none' }, 'No cards yet.')]));
    }

    function drawForm() {
      const n = chart.nodes.find((x) => x.id === selected);
      if (!n || archived) { form.replaceChildren(archived || !chart.nodes.length ? '' : h('p', { class: 'muted small' }, 'Pick a card to change it.')); return; }
      const changed = (redrawTree = true) => { save(); drawView(); if (redrawTree) drawTree(); };
      const input = (key, attrs = {}) => { const el = h('input', { value: n[key] || '', autocomplete: 'off', ...attrs }); el.addEventListener('input', () => { n[key] = el.value; changed(); }); return el; };
      const kind = h('select', { 'aria-label': 'Kind' }, LC().KINDS.map(([v, l]) => h('option', { value: v, selected: v === n.kind }, l)));
      kind.addEventListener('change', () => { n.kind = kind.value; if (n.kind === 'online' && !n.platform) n.platform = 'web'; if (n.kind === 'person' && !n.role) n.role = 'Associate'; changed(); drawForm(); });
      const role = h('select', { 'aria-label': 'Role' }, LC().ROLES.map((r) => h('option', { value: r, selected: r === n.role }, r)));
      role.addEventListener('change', () => { n.role = role.value; changed(); });
      const plat = h('select', { 'aria-label': 'Platform' }, LC().PLATFORMS.map(([v, l]) => h('option', { value: v, selected: v === n.platform }, l)));
      plat.addEventListener('change', () => { n.platform = plat.value; changed(); });
      // Under: any card but itself and the ones under it.
      const below = new Set(LC().subtree(chart, n.id));
      const parent = h('select', { 'aria-label': 'Under' }, h('option', { value: '' }, '— Top of the chart —'),
        ...LC().ordered(chart).filter(({ node }) => !below.has(node.id)).map(({ node, depth }) => h('option', { value: node.id, selected: node.id === n.parent }, `${'  '.repeat(depth)}${nodeLabel(node)}`)));
      parent.addEventListener('change', () => { n.parent = parent.value; changed(); });
      const photoSel = h('select', { 'aria-label': 'Photo' }, h('option', { value: '' }, '— No photo —'),
        ...images.map((f) => h('option', { value: f.name, selected: f.name === n.photo }, f.name.split('/').pop())));
      photoSel.addEventListener('change', () => { n.photo = photoSel.value; changed(false); });
      const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
      pick.addEventListener('change', async () => {
        const f = pick.files[0];
        pick.value = '';
        if (!f) return;
        try {
          const path = await Save.track(`file:${c.id}`, () => Vault.addFile(c.id, f, { folder: 'Subject Information', description: `${n.name || 'Subject'} photo` }));
          images = [...images, { name: path }];
          n.photo = path;
          changed(false); drawForm();
        } catch { /* reported by Save */ }
      });
      const person = n.kind === 'person'; const online = n.kind === 'online';
      const handleLabel = person ? 'Alias / Moniker' : online ? 'Handle or URL' : n.kind === 'phone' ? 'Number' : n.kind === 'crypto' ? 'Wallet Address' : n.kind === 'location' ? 'Address' : 'Details';
      form.replaceChildren(
        h('div', { class: 'lc-form-grid' },
          field('Kind', kind),
          person ? field('Role', role) : online ? field('Platform', plat) : h('span'),
          field(person ? 'Name' : online ? 'Moniker or Page Name' : 'Name', input('name', { maxlength: 120 }), 'span-2'),
          field(handleLabel, input('handle', { maxlength: 300 }), 'span-2'),
          field('Under', parent, 'span-2'),
          person ? field('Photo', photoSel, 'span-2') : null),
        h('div', { class: 'lc-form-actions' },
          person ? h('button', { class: 'btn small', type: 'button', icon: 'camera', title: 'Add a picture to the case files (Subject Information) and use it on this card', onclick: () => pick.click() }, 'Add Photo') : null, pick,
          h('button', { class: 'btn small', type: 'button', icon: 'person-plus', title: 'A person under this card (a courier, an associate…)', onclick: () => add('person', n.id) }, 'Add Person Under'),
          h('button', { class: 'btn small', type: 'button', icon: 'globe2', title: 'A moniker, webpage or dark-web name used by this card', onclick: () => add('online', n.id) }, 'Add Moniker / Page'),
          h('button', { class: 'btn small ghost danger-text', type: 'button', icon: 'trash3', title: 'Take this card off the chart. The cards under it move up.', onclick: () => {
            LC().removeNode(chart, n.id);
            selected = n.parent || (chart.nodes[0] ? chart.nodes[0].id : '');
            save(); drawAll();
          } }, 'Delete Card')));
    }

    function drawLinks() {
      if (archived) { linksBox.replaceChildren(); return; }
      const opts = (val) => [h('option', { value: '' }, '—'), ...LC().ordered(chart).map(({ node }) => h('option', { value: node.id, selected: node.id === val }, nodeLabel(node)))];
      linksBox.replaceChildren(
        h('h3', { title: 'A dashed line between two cards that aren\'t one under the other: the same phone, money sent, met at…' }, 'Other Connections'),
        ...chart.links.map((l, i) => {
          const from = h('select', { 'aria-label': `Connection ${i + 1} from` }, opts(l.from));
          const to = h('select', { 'aria-label': `Connection ${i + 1} to` }, opts(l.to));
          const label = h('input', { value: l.label, maxlength: 80, placeholder: 'Same phone, sends money…', 'aria-label': `Connection ${i + 1} label` });
          const upd = () => { l.from = from.value; l.to = to.value; l.label = label.value; save(); drawView(); };
          from.addEventListener('change', upd); to.addEventListener('change', upd); label.addEventListener('input', upd);
          return h('div', { class: 'lc-link-row' }, field('From', from), field('To', to), field('Label', label),
            h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove this connection', onclick: () => { chart.links.splice(i, 1); save(); drawAll(); } }, icon('trash3'), h('span', { class: 'sr-only' }, 'Remove')));
        }),
        chart.nodes.length > 1 ? h('button', { class: 'btn small', type: 'button', icon: 'link-45deg', onclick: () => {
          chart.links.push({ id: `l${Date.now().toString(36)}`, from: selected || '', to: '', label: '' });
          drawLinks();
        } }, 'Add Connection') : null);
    }

    function drawAll() { drawTree(); drawForm(); drawLinks(); drawView(); }
    function add(kind, parent) {
      const n = LC().newNode(kind, parent);
      chart.nodes.push(n);
      selected = n.id;
      save(); drawAll();
      const first = form.querySelector('input:not([type=file])');
      if (first) first.focus();
    }

    const title = h('input', { value: chart.title, maxlength: 200, placeholder: c.subject ? `${c.subject} organization` : 'Chart title', 'aria-label': 'Chart title', disabled: archived });
    title.addEventListener('input', () => { chart.title = title.value; save(); });
    const pdfView = async () => {
      if (!chart.nodes.length) { toast('Add a card first.', 'info'); return; }
      await Save.flushAll();
      const bytes = await buildPdf(c, chart);
      const viewer = CVPdfViewer.create(bytes, { h, icon, title: 'Link Chart', fileName: `${c.number || 'Case'} Link Chart.pdf` });
      await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', {}, 'Link Chart'), viewer,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
      viewer.destroy();
    };
    const savePdf = async () => {
      if (!chart.nodes.length) { toast('Add a card first.', 'info'); return; }
      await Save.flushAll();
      const bytes = await buildPdf(c, chart);
      const file = new File([bytes], 'Link Chart.pdf', { type: 'application/pdf' });
      try {
        const path = await Save.track(`file:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Link Charts', description: chart.title || 'Link Chart', replace: true }));
        toast(`Saved to Files: ${path.split('/').pop()}`, 'success', 4000);
      } catch { /* reported by Save */ }
    };

    panel.replaceChildren(h('section', { class: 'lc' },
      h('div', { class: 'lc-head' },
        h('label', { class: 'field lc-title' }, h('span', {}, 'Chart Title'), title),
        h('div', { class: 'spacer' }), status,
        h('button', { class: 'btn', type: 'button', icon: 'file-earmark-pdf', title: 'See it as a portrait page, to print', onclick: pdfView }, 'PDF View'),
        archived ? null : h('button', { class: 'btn primary', type: 'button', icon: 'save', title: 'Save the chart as a PDF in Files → Link Charts (saving again replaces it)', onclick: savePdf }, 'Save PDF to Case')),
      h('div', { class: 'lc-body' },
        h('aside', { class: 'lc-side' },
          archived ? null : h('div', { class: 'lc-add' },
            h('button', { class: 'btn small primary', type: 'button', icon: 'person-plus', title: 'A person at the top of the chart', onclick: () => add('person', '') }, 'Add Subject'),
            h('button', { class: 'btn small', type: 'button', icon: 'globe2', title: 'A webpage or dark-web name on its own at the top', onclick: () => add('online', '') }, 'Add Page')),
          tree, form, linksBox),
        view)));
    drawAll();
  }

  function init(kit) { ui = kit; }
  root.CVLinkChartUI = { init, render, buildPdf, load };
})(this);
