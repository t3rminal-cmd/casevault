/* CaseVault — the Link Chart tab (v1.52, v1.56). The cards on the left (who is under whom), the
 * card you picked in a form under them, and the chart on the right as it will print. PDF View
 * shows it as a portrait page; Save PDF to Case puts it in Files → Link Charts, ready to attach,
 * with the chart inside so Files can send it back here (Open in Link Chart).
 * v1.56: Tree or Free layout (drag the cards), cards per row, Link Cards (click one card, then
 * another: an arrow; click two linked cards: the line goes), zoom, Clear Chart.
 * Kept in the case folder as linkchart.json; photos are the case's own pictures (Subject Information).
 */
'use strict';

(function (root) {
  let ui = null;
  const FILE = 'linkchart.json';
  const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;
  const LC = () => root.CVLinkChart;
  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2];
  const SNAP = 10;

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
  /** A case photo, made small (the card is 70 units; 300 px is plenty at print size). */
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
    // Drawn at about 200 dots per inch of the printed size (more when the chart is shrunk a lot).
    const dpi = Math.min(400, 200 / Math.max(0.5, Math.min(1, k * 2))) / 72;
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
    const pdf = R.assemble([{ ops, sigs: [], imgs: [0], signed: true }], { photos: [{ jpeg, w: cv.width, h: cv.height, index: 0 }], title: 'Link Chart' });
    // v1.56: the chart rides inside, so Files can send it back to the tab.
    return LC().embed(pdf, chart);
  }

  /** v1.56: Files → Link Charts → Open in Link Chart. Puts the chart in that PDF back in the tab. -> opened? */
  async function openFromFile(c, path) {
    const { toast, confirmDialog } = ui;
    let chart = null;
    try { chart = LC().extract(new Uint8Array(await (await Vault.readFile(c.id, path)).arrayBuffer())); } catch (err) { if (FS.isDisconnectError(err)) { ui.onDriveLost(); return false; } }
    if (!chart) { toast('This PDF has no Link Chart in it. Only Link Charts saved with CaseVault 1.56 or later can be opened again.', 'error', 6000); return false; }
    const now = await load(c);
    if (now.nodes.length && !(await confirmDialog({ title: 'Open This Link Chart?', message: `The Link Chart tab has ${now.nodes.length} card${now.nodes.length === 1 ? '' : 's'} now. They are replaced by the ${chart.nodes.length} in "${path.split('/').pop()}". The chart now on the tab is still in Files if you saved its PDF.`, confirmText: 'Open It' }))) return false;
    chart.updated = new Date().toISOString();
    await Vault.writeCaseJSON(c.id, FILE, chart);
    toast('Link Chart opened from Files.', 'success');
    return true;
  }

  /* ---------- the tab ---------- */

  async function render(panel, c, token) {
    const { h, icon, field, toast, Save, openDialog, confirmDialog } = ui;
    const chart = await load(c);
    const archived = Vault.isArchived(c.id);
    const files = archived ? [] : await Vault.listFiles(c.id).catch(() => []);
    if (token !== ui.state.renderToken) return;
    let images = files.filter((f) => IMAGE_RE.test(f.name));
    let selected = chart.nodes[0] ? chart.nodes[0].id : '';
    let linking = false; let linkFrom = '';
    let zoom = 1;
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
    const note = h('p', { class: 'lc-note small' });
    const nodeLabel = (n) => n.name || n.handle || (n.kind === 'person' ? 'Unknown person' : LC().subLine(n)) || 'Unnamed';

    /* --- the toolbar over the chart --- */
    const modeBtn = (m, label, ic, tip) => h('button', { type: 'button', class: 'btn small lc-seg', 'data-mode': m, icon: ic, title: tip, 'aria-pressed': 'false', disabled: archived, onclick: () => setMode(m) }, label);
    const treeBtn = modeBtn('tree', 'Tree', 'diagram-3-fill', 'CaseVault places the cards top down. Move Left / Move Right in the card\'s form change the order.');
    const freeBtn = modeBtn('free', 'Free', 'arrows-move', 'Drag every card where you want it. It starts from where the tree put it.');
    const perRow = h('select', { 'aria-label': 'Cards per row', title: 'How many cards side by side before a crew goes into rows', disabled: archived },
      Array.from({ length: LC().PER_ROW.max - LC().PER_ROW.min + 1 }, (_, i) => i + LC().PER_ROW.min).map((n) => h('option', { value: String(n), selected: n === chart.perRow }, String(n))));
    perRow.addEventListener('change', () => { chart.perRow = Number(perRow.value); save(); drawView(); });
    const perRowWrap = h('label', { class: 'lc-perrow' }, h('span', { class: 'small' }, 'Per Row'), perRow);
    const linkBtn = h('button', { type: 'button', class: 'btn small', icon: 'link-45deg', 'aria-pressed': 'false', disabled: archived, title: 'Click one card, then another: an arrow from the first to the second. Click two linked cards: the line goes. Esc or this button stops.', onclick: () => setLinking(!linking) }, 'Link Cards');
    // v1.58: Snap (cards land on the grid squares when dragged) and what a new link carries.
    const snapBtn = h('button', { type: 'button', class: 'btn small', icon: 'grid-3x3', 'aria-pressed': String(chart.snap !== false), disabled: archived, title: 'Free layout: dragged cards land on the small grid squares, so they line up. Off: they go exactly where you let go.', onclick: () => { chart.snap = !(chart.snap !== false); save(); drawToolbar(); } }, 'Snap');
    const carries = h('select', { 'aria-label': 'New links carry', title: 'What a link made with Link Cards shows: nothing, money ($) or narcotics (a capsule). The arrow shows who sends it.' },
      LC().FLOWS.map(([v, l]) => h('option', { value: v }, l)));
    const carriesWrap = h('label', { class: 'lc-perrow lc-carries', hidden: true }, h('span', { class: 'small' }, 'Carries'), carries);
    const zoomPct = h('span', { class: 'lc-zoom-pct small', 'aria-live': 'polite' }, '100%');
    const zoomBy = (dir) => { const i = ZOOMS.findIndex((z) => z >= zoom - 0.001); const j = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + dir)); setZoom(ZOOMS[j]); };
    const fitBtn = h('button', { type: 'button', class: 'btn small ghost', title: 'Show the whole chart', onclick: () => fitZoom() }, 'Fit');
    const toolbar = h('div', { class: 'lc-toolbar' },
      h('div', { class: 'lc-segs', role: 'group', 'aria-label': 'Layout' }, treeBtn, freeBtn),
      perRowWrap, snapBtn, linkBtn, carriesWrap,
      h('div', { class: 'spacer' }),
      h('div', { class: 'lc-zoom', role: 'group', 'aria-label': 'Zoom' },
        h('button', { type: 'button', class: 'icon-btn', title: 'Zoom out', onclick: () => zoomBy(-1) }, icon('dash-lg'), h('span', { class: 'sr-only' }, 'Zoom out')),
        zoomPct,
        h('button', { type: 'button', class: 'icon-btn', title: 'Zoom in', onclick: () => zoomBy(1) }, icon('plus-lg'), h('span', { class: 'sr-only' }, 'Zoom in')),
        fitBtn));

    function setMode(m) {
      if (m === chart.mode) return;
      if (m === 'free') LC().freeze(chart);
      else chart.mode = 'tree';
      save(); drawAll();
    }
    function setLinking(on) {
      linking = on; linkFrom = '';
      linkBtn.setAttribute('aria-pressed', String(on));
      linkBtn.classList.toggle('on', on);
      view.classList.toggle('linking', on);
      carriesWrap.hidden = !on;
      drawView();
    }
    function setZoom(z) {
      zoom = Math.max(0.1, Math.min(2, z));
      zoomPct.textContent = `${Math.round(zoom * 100)}%`;
      sizeSvg();
    }
    function fitZoom() {
      const svg = view.querySelector('svg');
      if (!svg) return;
      const w = Number(svg.getAttribute('width')); const hh = Number(svg.getAttribute('height'));
      setZoom(Math.min(1, (view.clientWidth - 24) / w, Math.max(320, view.clientHeight - 24) / hh));
    }
    function sizeSvg() {
      const svg = view.querySelector('svg');
      if (!svg) return;
      svg.style.setProperty('width', `${Math.round(Number(svg.getAttribute('width')) * zoom)}px`);
      svg.style.setProperty('height', `${Math.round(Number(svg.getAttribute('height')) * zoom)}px`);
    }
    function drawToolbar() {
      for (const b of [treeBtn, freeBtn]) { const on = b.dataset.mode === chart.mode; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }
      perRowWrap.hidden = chart.mode !== 'tree';
      snapBtn.hidden = chart.mode !== 'free';
      snapBtn.setAttribute('aria-pressed', String(chart.snap !== false));
      snapBtn.classList.toggle('on', chart.snap !== false);
    }
    function drawNote() {
      if (!chart.nodes.length) { note.replaceChildren(); return; }
      const s = LC().printScale(chart);
      const R = LC().PER_ROW;
      note.className = `lc-note small${s.readable ? '' : ' warn-text'}`;
      note.replaceChildren(icon(s.readable ? 'info-circle' : 'exclamation-triangle-fill'), ' ',
        `On the portrait page: up to ${R.default} cards in a row print full size, up to ${R.readable} stay readable. `,
        h('strong', {}, `Names print at ${s.nameSize} pt now`),
        s.readable ? '.' : ': too small to read. Use fewer per row, split the chart (one PDF per crew), or take cards off.');
    }

    let lastSvg = null;
    function drawView() {
      const { svg } = LC().toSvg(chart, { photoUrl, iconUrl: (k) => `icons/color/${k}.png`, selected, linkFrom, grid: true });
      view.innerHTML = chart.nodes.length ? svg : '';
      if (!chart.nodes.length) view.append(h('p', { class: 'muted lc-empty' }, archived ? 'No link chart for this case.' : 'Add the first person: Add Primary at the top left.'));
      view.classList.toggle('free', chart.mode === 'free');
      lastSvg = view.querySelector('svg');
      sizeSvg();
      drawNote();
    }

    /* --- clicking and dragging on the chart --- */
    let drag = null;
    const unitScale = () => (lastSvg ? lastSvg.getBoundingClientRect().width / Number(lastSvg.getAttribute('width')) : 1) || 1;
    // v1.58: drag the empty background to move around a big chart.
    let pan = null;
    view.addEventListener('pointerdown', (e) => {
      const g = e.target.closest && e.target.closest('[data-node]');
      if (!g && e.button === 0 && view.querySelector('svg')) {
        pan = { x: e.clientX, y: e.clientY, l: view.scrollLeft, t: view.scrollTop };
        view.setPointerCapture(e.pointerId); view.classList.add('panning');
        return;
      }
      if (!g || e.button !== 0) return;
      const id = g.getAttribute('data-node');
      e.preventDefault();
      if (linking && !archived) {
        if (!linkFrom) { linkFrom = id; drawView(); return; }
        if (linkFrom === id) { linkFrom = ''; drawView(); return; }
        const r = LC().toggleLink(chart, linkFrom, id, carries.value);
        const a = chart.nodes.find((n) => n.id === linkFrom); const b = chart.nodes.find((n) => n.id === id);
        toast(r === 'linked' ? `Linked: ${nodeLabel(a)} → ${nodeLabel(b)}` : `Unlinked: ${nodeLabel(a)} and ${nodeLabel(b)}`, 'info', 2500);
        linkFrom = '';
        save(); drawLinks(); drawView();
        return;
      }
      const n = chart.nodes.find((x) => x.id === id);
      if (chart.mode === 'free' && !archived && n) {
        const L = LC().layout(chart); const bx = L.boxes.get(id);
        drag = { id, n, sx: e.clientX, sy: e.clientY, x0: bx.x + L.offset.x, y0: bx.y + L.offset.y, moved: false, k: unitScale() };
        view.setPointerCapture(e.pointerId);
      } else { selected = id; drawAll(); }
    });
    view.addEventListener('pointermove', (e) => {
      if (pan) { view.scrollLeft = pan.l - (e.clientX - pan.x); view.scrollTop = pan.t - (e.clientY - pan.y); return; }
      if (!drag) return;
      const dx = (e.clientX - drag.sx) / drag.k; const dy = (e.clientY - drag.sy) / drag.k;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      const step = chart.snap !== false ? SNAP : 1;
      drag.n.x = Math.max(0, Math.round((drag.x0 + dx) / step) * step);
      drag.n.y = Math.max(0, Math.round((drag.y0 + dy) / step) * step);
      drawView();
    });
    const endDrag = () => {
      if (pan) { pan = null; view.classList.remove('panning'); return; }
      if (!drag) return;
      const { id, moved } = drag;
      drag = null;
      if (moved) save();
      selected = id; drawAll();
    };
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);
    // v1.58: the mouse wheel zooms in and out around the pointer (drag the background to move).
    view.addEventListener('wheel', (e) => {
      if (!view.querySelector('svg')) return;
      e.preventDefault();
      const r = view.getBoundingClientRect();
      const mx = e.clientX - r.left; const my = e.clientY - r.top;
      const before = zoom;
      const ux = (view.scrollLeft + mx) / before; const uy = (view.scrollTop + my) / before;
      setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      view.scrollLeft = ux * zoom - mx; view.scrollTop = uy * zoom - my;
    }, { passive: false });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && linking) { e.stopPropagation(); setLinking(false); } });

    function drawTree() {
      const rows = LC().ordered(chart);
      tree.replaceChildren(...(rows.length ? rows.map(({ node: n, depth }) => {
        const ic = LC().iconOf(n);
        const b = h('button', { type: 'button', class: `lc-item${n.id === selected ? ' on' : ''}`, onclick: () => { selected = n.id; drawAll(); } },
          h('span', { class: 'lc-dot' }), ic ? icon(ic) : icon('person-badge'),
          h('span', { class: 'lc-item-name', title: nodeLabel(n) }, nodeLabel(n)), h('span', { class: 'lc-item-sub muted small' }, LC().subLine(n)));
        b.style.setProperty('--depth', String(Math.min(depth, 6)));
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
      const person = n.kind === 'person'; const online = n.kind === 'online'; const phone = n.kind === 'phone';
      const handleLabel = person ? 'Alias / Moniker' : online ? 'Handle or URL' : phone ? 'Phone Number' : n.kind === 'crypto' ? 'Wallet Address' : n.kind === 'location' ? 'Address' : 'Details';
      // v1.56: a phone number formats itself like every phone box in CaseVault (123.456.7890).
      const handle = input('handle', { maxlength: 300, ...(phone ? { type: 'tel' } : {}) });
      const sibs = LC().childrenOf(chart, n.parent); const at = sibs.indexOf(n);
      const move = (dir) => { if (LC().moveSibling(chart, n.id, dir)) { save(); drawAll(); } };
      form.replaceChildren(...[
        h('div', { class: 'lc-form-grid' },
          field('Kind', kind, person || online ? '' : 'span-2'),
          person ? field('Role', role) : online ? field('Platform', plat) : null,
          field(person ? 'Name' : online ? 'Moniker or Page Name' : 'Name', input('name', { maxlength: 120 }), 'span-2'),
          field(handleLabel, handle, 'span-2'),
          field('Under', parent, 'span-2'),
          person ? field('Photo', photoSel, 'span-2') : null),
        chart.mode === 'tree' && sibs.length > 1 ? h('div', { class: 'lc-form-move' },
          h('button', { class: 'btn small', type: 'button', icon: 'arrow-left', disabled: at <= 0, title: 'Swap with the card to its left', onclick: () => move(-1) }, 'Move Left'),
          h('span', { class: 'muted small' }, `${at + 1} of ${sibs.length}`),
          h('button', { class: 'btn small', type: 'button', icon: 'arrow-right', disabled: at >= sibs.length - 1, title: 'Swap with the card to its right', onclick: () => move(1) }, 'Move Right')) : null,
        h('div', { class: 'lc-form-actions' },
          person ? h('button', { class: 'btn small', type: 'button', icon: 'camera', title: 'Add a picture to the case files (Subject Information) and use it on this card', onclick: () => pick.click() }, 'Add Photo') : null, pick,
          h('button', { class: 'btn small', type: 'button', icon: 'person-plus', title: 'A person under this card (a courier, an associate…)', onclick: () => add('person', n.id) }, 'Add Person Under'),
          h('button', { class: 'btn small', type: 'button', icon: 'globe2', title: 'A moniker, webpage or dark-web name used by this card', onclick: () => add('online', n.id) }, 'Add Moniker'),
          h('button', { class: 'btn small', type: 'button', icon: 'telephone', title: 'A phone used by this card', onclick: () => add('phone', n.id) }, 'Add Phone'),
          h('button', { class: 'btn small ghost danger-text', type: 'button', icon: 'trash3', title: 'Take this card off the chart. The cards under it move up.', onclick: () => {
            LC().removeNode(chart, n.id);
            selected = n.parent || (chart.nodes[0] ? chart.nodes[0].id : '');
            save(); drawAll();
          } }, 'Delete Card'))].filter(Boolean));
    }

    const openLinks = new Set(); // connections opened on screen (they start folded)
    function drawLinks() {
      if (archived) { linksBox.replaceChildren(); return; }
      const opts = (val) => [h('option', { value: '' }, '—'), ...LC().ordered(chart).map(({ node }) => h('option', { value: node.id, selected: node.id === val }, nodeLabel(node)))];
      linksBox.replaceChildren(...[
        h('h3', { title: 'A dashed line between two cards that aren\'t one under the other: the same phone, money sent, met at…' }, 'Other Connections'),
        chart.nodes.length > 1 ? h('p', { class: 'muted small lc-hint' }, 'Quickest: Link Cards above the chart, then click one card and another. Click the same two again (same order) to unlink; the other way round adds a second line back beside the first, with its own arrow (narcotics one way, money the other). Or open a connection and click Add Return Line.') : null,
        ...chart.links.map((l, i) => {
          const from = h('select', { 'aria-label': `Connection ${i + 1} from` }, opts(l.from));
          const to = h('select', { 'aria-label': `Connection ${i + 1} to` }, opts(l.to));
          const dir = h('select', { 'aria-label': `Connection ${i + 1} arrow` }, LC().DIRS.map(([v, lab]) => h('option', { value: v, selected: v === l.dir }, lab)));
          const label = h('textarea', { rows: 2, maxlength: 80, placeholder: 'Same phone, sends money…', 'aria-label': `Connection ${i + 1} label` }, l.label);
          const flow = h('select', { 'aria-label': `Connection ${i + 1} carries` }, LC().FLOWS.map(([v, lab]) => h('option', { value: v, selected: v === (l.flow || '') }, lab)));
          const route = h('select', { 'aria-label': `Connection ${i + 1} line` }, [['elbow', 'Right Angles'], ['straight', 'Straight']].map(([v, lab]) => h('option', { value: v, selected: v === (l.route || 'elbow') }, lab)));
          // v1.59: each connection is a card that starts folded: its summary line, an eye that
          // shows or hides the line on the chart (and the PDF), and the arrow to open it.
          const nameOf = (id) => { const n = chart.nodes.find((x) => x.id === id); return n ? nodeLabel(n) : '—'; };
          const summary = h('span', { class: 'lc-link-sum' });
          const drawSum = () => {
            const arrow = l.dir === 'none' ? '—' : '→';
            summary.replaceChildren(...[h('span', { class: 'lc-link-names' }, `${nameOf(l.from)} ${arrow} ${nameOf(l.to)}`),
              l.flow ? h('span', { class: `lc-link-flow lc-link-flow-${l.flow}` }, l.flow === 'money' ? '$ Money' : 'Narcotics') : null,
              l.hidden ? h('span', { class: 'muted small' }, 'Hidden') : null].filter(Boolean));
          };
          drawSum();
          const upd = () => { l.from = from.value; l.to = to.value; l.dir = dir.value; l.flow = flow.value; l.route = route.value; l.label = label.value; save(); drawView(); drawSum(); };
          for (const el of [from, to, dir, flow, route]) el.addEventListener('change', upd);
          label.addEventListener('input', upd);
          const body = h('div', { class: 'lc-link-row', hidden: !openLinks.has(l.id) }, field('From', from), field('To', to), field('Arrow', dir), field('Carries', flow), field('Line', route), h('span'), field('Label', label, 'span-2'),
            // v1.62: one line per direction: turn this one round, or add the line coming back.
            h('div', { class: 'lc-link-acts span-2' },
              h('button', { class: 'btn small', type: 'button', icon: 'arrow-left-right', title: 'Point this line the other way', onclick: () => { [l.from, l.to] = [l.to, l.from]; save(); drawAll(); } }, 'Turn Around'),
              chart.links.some((x) => x.from === l.to && x.to === l.from) ? null : h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: 'A second line back the other way, beside this one (money back for narcotics, and so on)', disabled: !l.from || !l.to, onclick: () => {
                const id = `l${Date.now().toString(36)}`;
                chart.links.push({ id, from: l.to, to: l.from, label: '', dir: 'to', flow: LC().otherFlow(l.flow), route: l.route || 'elbow', hidden: false });
                openLinks.add(id); save(); drawAll();
              } }, 'Add Return Line')),
            h('button', { class: 'btn small ghost danger-text lc-link-del', type: 'button', icon: 'trash3', title: 'Remove this connection', onclick: () => { chart.links.splice(i, 1); save(); drawAll(); } }, 'Remove'));
          const eye = h('button', { class: 'icon-btn', type: 'button', title: l.hidden ? 'Show this line on the chart' : 'Hide this line on the chart (and the PDF)', 'aria-pressed': String(!l.hidden), onclick: () => { l.hidden = !l.hidden; save(); drawLinks(); drawView(); } }, icon(l.hidden ? 'eye-slash' : 'eye'), h('span', { class: 'sr-only' }, l.hidden ? 'Show line' : 'Hide line'));
          const foldBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-expanded': String(openLinks.has(l.id)), title: openLinks.has(l.id) ? 'Fold this connection' : 'Open this connection', onclick: () => { if (openLinks.has(l.id)) openLinks.delete(l.id); else openLinks.add(l.id); drawLinks(); } }, icon(openLinks.has(l.id) ? 'chevron-down' : 'chevron-right'), h('span', { class: 'sr-only' }, 'Open or fold'));
          return h('div', { class: `lc-link-card${l.hidden ? ' off' : ''}` }, h('div', { class: 'lc-link-head' }, summary, h('div', { class: 'spacer' }), eye, foldBtn), body);
        }),
        chart.nodes.length > 1 ? h('button', { class: 'btn small', type: 'button', icon: 'link-45deg', onclick: () => {
          const id = `l${Date.now().toString(36)}`;
          chart.links.push({ id, from: selected || '', to: '', label: '', dir: 'to', flow: '', route: 'elbow', hidden: false });
          openLinks.add(id);
          drawLinks();
        } }, 'Add Connection') : null].flat().filter(Boolean));
    }

    function drawAll() { drawToolbar(); drawTree(); drawForm(); drawLinks(); drawView(); }
    function add(kind, parent) {
      const n = LC().newNode(kind, parent);
      if (chart.mode === 'free') {
        // Under its card in Free layout, or at the right of everything at the top.
        const L = LC().layout(chart); const p = L.boxes.get(parent);
        const W = LC().CARD.W; const H = L.cardH;
        if (p) { const k = LC().childrenOf(chart, parent).length; n.x = Math.round(p.x + L.offset.x + k * (W + 24)); n.y = Math.round(p.y + L.offset.y + H + 50); }
        else { n.x = Math.round(L.width + L.offset.x + (chart.nodes.length ? 48 : 0)); n.y = Math.max(0, Math.round(L.offset.y)); }
      }
      chart.nodes.push(n);
      selected = n.id;
      save(); drawAll();
      const first = form.querySelector('input:not([type=file])');
      if (first) first.focus();
    }

    const title = h('input', { value: chart.title, maxlength: 200, 'aria-label': 'Chart title', disabled: archived });
    title.addEventListener('input', () => { chart.title = title.value; save(); });
    const pdfName = () => `${(chart.title || 'Link Chart').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Link Chart'}.pdf`;
    const pdfView = async () => {
      if (!chart.nodes.length) { toast('Add a card first.', 'info'); return; }
      await Save.flushAll();
      const bytes = await buildPdf(c, chart);
      const viewer = CVPdfViewer.create(bytes, { h, icon, title: 'Link Chart', fileName: `${c.number || 'Case'} ${pdfName()}` });
      await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', {}, 'Link Chart'), viewer,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
      viewer.destroy();
    };
    const savePdf = async () => {
      if (!chart.nodes.length) { toast('Add a card first.', 'info'); return; }
      await Save.flushAll();
      const bytes = await buildPdf(c, chart);
      const file = new File([bytes], pdfName(), { type: 'application/pdf' });
      try {
        const path = await Save.track(`file:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Link Charts', description: chart.title || 'Link Chart', replace: true }));
        // v1.59: and under Reports, with the chart in words; Send Back to Link Chart there (or
        // Open in Link Chart in Files) puts it back here to change it, then Save PDF to Case again.
        const slug = `link-chart-${CVDraft.slugify(chart.title || 'link chart')}`;
        const prev = await Vault.readDraft(c.id, slug).catch(() => null);
        const meta = { ...(prev ? prev.meta : { created: new Date().toISOString() }), title: chart.title || 'Link Chart', type: 'linkchart', ai: false, fromLinkChart: true, chartPath: path };
        await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, meta, LC().summaryMarkdown(chart)));
        toast(`Saved to Files → Link Charts and to Reports: ${path.split('/').pop()}. Send it back here from either to change it.`, 'success', 6000);
      } catch { /* reported by Save */ }
    };
    const clearChart = async () => {
      if (!chart.nodes.length) return;
      if (!(await confirmDialog({ title: 'Clear the Link Chart?', message: `All ${chart.nodes.length} card${chart.nodes.length === 1 ? '' : 's'} and their connections come off the chart. Photos stay in the case files, and a PDF saved to Files stays there (open it again from Files → Link Charts).`, confirmText: 'Clear Chart', danger: true }))) return;
      LC().clear(chart); chart.mode = 'tree'; selected = ''; setLinking(false);
      save(); drawAll();
    };

    panel.replaceChildren(h('section', { class: 'lc' },
      h('div', { class: 'lc-head cv-boxed' },
        h('label', { class: 'field lc-title' }, h('span', {}, 'Chart Title'), title),
        h('div', { class: 'lc-head-actions' }, status,
        archived ? null : h('button', { class: 'btn ghost danger-text', type: 'button', icon: 'trash3', title: 'Take every card off the chart and start again', onclick: clearChart }, 'Clear Chart'),
        h('button', { class: 'btn', type: 'button', icon: 'file-earmark-pdf', title: 'See it as a portrait page, to print', onclick: pdfView }, 'PDF View'),
        archived ? null : h('button', { class: 'btn primary', type: 'button', icon: 'save', title: 'Save the chart as a PDF in Files → Link Charts, named after the title (saving again replaces it)', onclick: savePdf }, 'Save PDF to Case'))),
      h('div', { class: 'lc-body' },
        h('aside', { class: 'lc-side' },
          archived ? null : h('div', { class: 'lc-add' },
            h('button', { class: 'btn small primary', type: 'button', icon: 'person-plus', title: 'A person at the top of the chart', onclick: () => add('person', '') }, 'Add Primary'),
            h('button', { class: 'btn small', type: 'button', icon: 'globe2', title: 'A webpage or dark-web name on its own at the top', onclick: () => add('online', '') }, 'Add Page')),
          tree, form, linksBox),
        h('div', { class: 'lc-main' }, toolbar, view, note))));
    drawAll();
  }

  function init(kit) {
    ui = kit;
    // v1.74: the narcotics and money badges use the app's colour icons.
    const toData = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url); const b = await r.blob(); return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
    Promise.all([toData('icons/color/cannabis.png'), toData('icons/color/money.png')])
      .then(([narcotics, money]) => CVLinkChart.setFlowImages({ narcotics, money })).catch(() => { /* the drawn badges stay */ });
  }
  root.CVLinkChartUI = { init, render, buildPdf, load, openFromFile };
})(this);
