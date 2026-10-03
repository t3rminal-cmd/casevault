/* CaseVault — link chart (v1.52, v1.56). Who is under whom in a case: the primaries at the top,
 * their suppliers, couriers and associates under them, and their monikers, webpages, dark-web
 * names, phones and wallets hanging off the person who uses them. Kept per case in
 * linkchart.json; the PDF (portrait, letter) goes to Files → Link Charts, with the chart itself
 * inside it so it can be opened back in the Link Chart tab.
 *
 * Two ways to lay it out (v1.56):
 *   tree  top down, CaseVault places the cards (Move Left / Move Right change the order);
 *   free  every card where you drag it (it starts from the tree's places).
 *
 * Plain logic (the chart, its layout, the drawing as SVG text) with no DOM, so the tests run it
 * under Node. js/linkchart-ui.js is the screen.
 *
 *   chart = { version: 2, title, mode, perRow, nodes: [node], links: [link], updated }
 *   node  = { id, parent, kind, name, role, platform, handle, photo, note, x, y }
 *   link  = { id, from, to, label, dir }   an extra line between two cards (not part of the tree);
 *                                         dir: 'to' (arrow at "to") or 'none' (v1.62: one line
 *                                         per direction; old 'from' is turned round, old 'both' becomes two lines)
 */
'use strict';

(function (root) {
  const KINDS = [['person', 'Person'], ['online', 'Moniker or Webpage'], ['phone', 'Phone'], ['crypto', 'Crypto Wallet'], ['location', 'Location'], ['other', 'Other']];
  const ROLES = ['Primary', 'Supplier', 'Courier', 'Associate', 'Customer', 'Source', 'Other'];
  const DIRS = [['to', 'Arrow →'], ['none', 'No Arrow']];
  /** v1.62: the other flow for a return line (narcotics one way, money back). */
  const otherFlow = (f) => (f === 'narcotics' ? 'money' : f === 'money' ? 'narcotics' : '');
  // Platforms of an online name, each with its picture (icons/color) and colour.
  const PLATFORMS = [
    ['web', 'Webpage', 'globe', '#1d6fd8'], ['darkweb', 'Dark Web', 'skull', '#b02a37'], ['google', 'Google', 'google', '#4285f4'],
    ['snapchat', 'Snapchat', 'snapchat', '#e6c200'], ['facebook', 'Facebook', 'facebook', '#1877f2'], ['instagram', 'Instagram', 'instagram', '#d62976'],
    ['telegram', 'Telegram', 'telegram', '#229ed9'], ['grindr', 'Grindr', 'grindr', '#c9a400'],
    // v1.58: payment apps and exchanges
    ['cashapp', 'Cash App', 'cashapp', '#00a92a'], ['venmo', 'Venmo', 'venmo', '#3d95ce'], ['zelle', 'Zelle', 'zelle', '#6d1ed4'],
    ['applepay', 'Apple Pay', 'applepay', '#111111'], ['coinbase', 'Coinbase', 'coinbase', '#0052ff'], ['moonpay', 'MoonPay', 'moonpay', '#7d00ff'],
    ['other', 'Other', 'chain', '#5c6670'],
  ];
  // v1.58: what goes along an extra line: nothing said, money or narcotics (a small round badge on it).
  const FLOWS = [['', 'Nothing'], ['money', 'Money'], ['narcotics', 'Narcotics']];
  const FLOW_COLOR = { '': '#c98a12', money: '#1f9d55', narcotics: '#c2410c' };
  const KIND_ICON = { phone: 'phone', crypto: 'crypto', location: 'pin', other: 'target' };
  const ROLE_COLOR = { Primary: '#b02a37', Supplier: '#6f42c1', Courier: '#0d6efd', Associate: '#5c6670', Customer: '#198754', Source: '#c98a12', Other: '#5c6670' };
  const KIND_COLOR = { phone: '#0b7285', crypto: '#c98a12', location: '#1d6fd8', other: '#5c6670' };

  // Card and spacing, in chart units (1 unit = 1 px on screen at 100%; the PDF scales it to the page).
  const W = 150; const H_MAX = 162; const PHOTO = 70; const GX = 24; const GY = 50;
  // Cards in a row under one card. 4 prints at full size on a portrait page; up to 6 stays
  // readable; more makes the names small (the tab says so, from printScale()).
  const PER_ROW = { min: 2, max: 8, default: 4, readable: 6 };
  // The space for the chart on the portrait letter page, in points (see linkchart-ui.js buildPdf).
  const PAGE_AREA = { w: 540, h: 660 };
  const NAME_SIZE = 10.5;

  const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const str = (v, n = 300) => String(v == null ? '' : v).slice(0, n);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

  function emptyChart() { return { version: 2, title: '', mode: 'tree', perRow: PER_ROW.default, snap: true, nodes: [], links: [], updated: '' }; }

  /** A clean chart from whatever was saved: unknown fields dropped, broken parents and loops cut. */
  function normalize(raw) {
    const c = emptyChart();
    if (!raw || typeof raw !== 'object') return c;
    c.title = str(raw.title, 200);
    c.updated = str(raw.updated, 40);
    c.mode = raw.mode === 'free' ? 'free' : 'tree';
    c.snap = raw.snap !== false;
    const pr = Number(raw.perRow);
    c.perRow = Number.isInteger(pr) && pr >= PER_ROW.min && pr <= PER_ROW.max ? pr : PER_ROW.default;
    const kinds = new Set(KINDS.map((k) => k[0]));
    const plats = new Set(PLATFORMS.map((p) => p[0]));
    const seen = new Set();
    for (const n of Array.isArray(raw.nodes) ? raw.nodes : []) {
      if (!n || typeof n !== 'object' || !n.id || seen.has(String(n.id))) continue;
      seen.add(String(n.id));
      c.nodes.push({
        id: str(n.id, 60), parent: str(n.parent, 60), kind: kinds.has(n.kind) ? n.kind : 'person',
        name: str(n.name, 120), role: n.role === 'Subject' ? 'Primary' : str(n.role, 60), platform: n.platform === 'meta' ? 'facebook' : plats.has(n.platform) ? n.platform : '',
        handle: str(n.handle, 300), photo: str(n.photo, 400), note: str(n.note, 500), x: num(n.x), y: num(n.y),
      });
    }
    for (const n of c.nodes) if (n.parent && !seen.has(n.parent)) n.parent = '';
    // A parent chain that comes back to itself is cut at the node.
    for (const n of c.nodes) {
      const path = new Set([n.id]);
      let p = c.nodes.find((x) => x.id === n.parent);
      while (p) { if (path.has(p.id)) { n.parent = ''; break; } path.add(p.id); p = c.nodes.find((x) => x.id === p.parent); }
    }
    for (const l of Array.isArray(raw.links) ? raw.links : []) {
      if (!l || !seen.has(l.from) || !seen.has(l.to) || l.from === l.to) continue;
      const flow = l.flow === 'money' || l.flow === 'narcotics' ? l.flow : '';
      const one = { id: str(l.id || newId(), 60), from: l.from, to: l.to, label: str(l.label, 80), dir: ['to', 'from', 'both'].includes(l.dir) ? 'to' : 'none', flow,
        route: l.route === 'straight' ? 'straight' : 'elbow', hidden: l.hidden === true };
      // v1.62: an arrow pointing back is the same line turned round; both ways is two lines.
      if (l.dir === 'from') { one.from = l.to; one.to = l.from; }
      c.links.push(one);
      if (l.dir === 'both') c.links.push({ ...one, id: `${one.id}r`.slice(0, 60), from: one.to, to: one.from, label: '', flow: otherFlow(flow) });
    }
    return c;
  }

  function newNode(kind = 'person', parent = '') {
    return { id: newId(), parent, kind, name: '', role: kind === 'person' ? (parent ? 'Courier' : 'Primary') : '', platform: kind === 'online' ? 'web' : '', handle: '', photo: '', note: '', x: null, y: null };
  }

  const childrenOf = (chart, id) => chart.nodes.filter((n) => n.parent === id);
  /** The id and every id under it. */
  function subtree(chart, id) {
    const out = [id];
    for (let i = 0; i < out.length; i++) for (const k of childrenOf(chart, out[i])) out.push(k.id);
    return out;
  }
  /** Take a card off; the cards under it move up to its parent. Its extra lines go too. */
  function removeNode(chart, id) {
    const n = chart.nodes.find((x) => x.id === id);
    if (!n) return chart;
    for (const k of childrenOf(chart, id)) k.parent = n.parent;
    chart.nodes = chart.nodes.filter((x) => x.id !== id);
    chart.links = chart.links.filter((l) => l.from !== id && l.to !== id);
    return chart;
  }
  /** Everything off the chart (the title and the settings stay). */
  function clear(chart) { chart.nodes = []; chart.links = []; return chart; }
  /** Depth-first order with depth, for the list on the left. */
  function ordered(chart) {
    const out = [];
    const walk = (parent, depth) => { for (const n of childrenOf(chart, parent)) { out.push({ node: n, depth }); walk(n.id, depth + 1); } };
    walk('', 0);
    return out;
  }
  /** Swaps a card with the one before (-1) or after (+1) it under the same card. -> moved? */
  function moveSibling(chart, id, dir) {
    const n = chart.nodes.find((x) => x.id === id);
    if (!n) return false;
    const sibs = childrenOf(chart, n.parent);
    const i = sibs.indexOf(n); const j = i + dir;
    if (j < 0 || j >= sibs.length) return false;
    const a = chart.nodes.indexOf(n); const b = chart.nodes.indexOf(sibs[j]);
    [chart.nodes[a], chart.nodes[b]] = [chart.nodes[b], chart.nodes[a]];
    return true;
  }
  /** The extra line between two cards (either way round), or null. */
  const linkBetween = (chart, a, b) => chart.links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a)) || null;
  /** Click-to-link: adds an arrow from a to b, or takes it away when there is one from a to b. -> 'linked' | 'unlinked' | '' */
  function toggleLink(chart, a, b, flow = '') {
    if (!a || !b || a === b || !chart.nodes.some((n) => n.id === a) || !chart.nodes.some((n) => n.id === b)) return '';
    // v1.59: the same way again takes the line away; the other way adds a line back (narcotics one
    // way, money the other), drawn beside the first.
    const l = chart.links.find((x) => x.from === a && x.to === b);
    if (l) { chart.links = chart.links.filter((x) => x !== l); return 'unlinked'; }
    // v1.62: a return line (B then A) carries the other flow when none is picked: narcotics one way, money back.
    const back = chart.links.find((x) => x.from === b && x.to === a);
    const f = flow === 'money' || flow === 'narcotics' ? flow : back ? otherFlow(back.flow) : '';
    chart.links.push({ id: newId(), from: a, to: b, label: '', dir: 'to', flow: f, route: back ? back.route : 'elbow', hidden: false });
    return 'linked';
  }

  const platformOf = (n) => PLATFORMS.find((p) => p[0] === n.platform) || PLATFORMS[0];
  /** The picture name (icons/color) for a card without a photo, or '' for a person. */
  function iconOf(n) {
    if (n.kind === 'online') return platformOf(n)[2];
    return KIND_ICON[n.kind] || '';
  }
  function colorOf(n) {
    if (n.kind === 'person') return ROLE_COLOR[n.role] || ROLE_COLOR.Other;
    if (n.kind === 'online') return platformOf(n)[3];
    return KIND_COLOR[n.kind] || '#5c6670';
  }
  /** The small line under the name: the role, the platform, or the kind. */
  function subLine(n) {
    if (n.kind === 'person') return n.role || '';
    if (n.kind === 'online') return platformOf(n)[1];
    return (KINDS.find((k) => k[0] === n.kind) || ['', ''])[1];
  }

  /** What a card shows under its picture: name lines, the role line, alias / handle lines. */
  function cardText(n) {
    const names = wrapLines(n.name || (n.kind === 'person' ? 'Unknown' : n.handle || 'Unnamed'), W - 10, NAME_SIZE, 3);
    const sub = subLine(n);
    const handle = n.handle && (n.name || n.kind === 'person') ? wrapLines(n.handle, W - 10, 8.5, 2) : [];
    return { names, sub, handle };
  }
  /** v1.56: every card is as tall as the fullest card on the chart needs (no cut text, no empty space). */
  function cardHeight(chart) {
    let h = 124;
    for (const n of chart.nodes) { const t = cardText(n); h = Math.max(h, 92 + 12.5 * t.names.length + (t.sub ? 11 : 0) + 10 * t.handle.length); }
    return Math.min(H_MAX, Math.ceil(h));
  }

  /* ---------- layout ----------
   * Tree: top down. A card whose children are all ends of the tree and are more than perRow puts
   * them in rows of perRow under it (a grid), so a wide crew stays narrow enough for a portrait
   * page; otherwise its children sit side by side under it. Lines are square elbows.
   * Free: each card at its x/y (a card without one takes its tree place); straight lines. */
  function treeLayout(chart) {
    const H = cardHeight(chart);
    const per = chart.perRow || PER_ROW.default;
    const kids = (id) => childrenOf(chart, id);
    const isLeaf = (id) => !kids(id).length;
    const memo = new Map();
    const measure = (id) => {
      if (memo.has(id)) return memo.get(id);
      const ks = kids(id);
      let m;
      if (!ks.length) m = { w: W, h: H, grid: false };
      else if (ks.length > per && ks.every((k) => isLeaf(k.id))) {
        const rows = Math.ceil(ks.length / per);
        m = { w: Math.max(W, 16 + per * W + (per - 1) * GX), h: H + GY + rows * H + (rows - 1) * GY, grid: true, per, rows };
      } else {
        const ms = ks.map((k) => measure(k.id));
        m = { w: Math.max(W, ms.reduce((s, x) => s + x.w, 0) + GX * (ms.length - 1)), h: H + GY + Math.max(...ms.map((x) => x.h)), grid: false };
      }
      memo.set(id, m);
      return m;
    };
    const boxes = new Map(); const edges = [];
    const place = (id, x, y) => {
      const m = measure(id); const ks = kids(id);
      const nx = x + (m.w - W) / 2;
      boxes.set(id, { x: nx, y, w: W, h: H });
      if (!ks.length) return;
      const top = { x: nx + W / 2, y: y + H };
      if (m.grid) {
        const gridLeft = x + (m.w - (16 + m.per * W + (m.per - 1) * GX)) / 2;
        const trunk = gridLeft + 6;
        const buses = [];
        ks.forEach((k, i) => {
          const r = Math.floor(i / m.per); const col = i % m.per;
          const cy = y + H + GY + r * (H + GY);
          const cx = gridLeft + 16 + col * (W + GX);
          boxes.set(k.id, { x: cx, y: cy, w: W, h: H });
          const busY = cy - GY / 2;
          if (!buses[r]) buses[r] = { y: busY, x2: cx + W / 2 };
          buses[r].x2 = cx + W / 2;
          edges.push([[cx + W / 2, busY], [cx + W / 2, cy]]);
        });
        edges.push([[top.x, top.y], [top.x, buses[0].y]]);
        edges.push([[trunk, buses[0].y], [trunk, buses[buses.length - 1].y]]);
        for (const b of buses) edges.push([[trunk, b.y], [Math.max(b.x2, top.x), b.y]]);
        return;
      }
      const ms = ks.map((k) => measure(k.id));
      const total = ms.reduce((s, q) => s + q.w, 0) + GX * (ms.length - 1);
      let cx = x + (m.w - total) / 2;
      const busY = y + H + GY / 2;
      const centers = [];
      ks.forEach((k, i) => { place(k.id, cx, y + H + GY); centers.push(boxes.get(k.id).x + W / 2); cx += ms[i].w + GX; });
      edges.push([[top.x, top.y], [top.x, busY]]);
      if (centers.length > 1) edges.push([[Math.min(...centers, top.x), busY], [Math.max(...centers, top.x), busY]]);
      for (const c of centers) edges.push([[c, busY], [c, y + H + GY]]);
    };
    const roots = kids('');
    let x = 0; let height = 0;
    for (const r of roots) { const m = measure(r.id); place(r.id, x, 0); x += m.w + GX * 2; height = Math.max(height, m.h); }
    return { boxes, edges, width: roots.length ? x - GX * 2 : 0, height, cardH: H };
  }

  function freeLayout(chart) {
    const T = treeLayout(chart); const H = T.cardH;
    const boxes = new Map();
    for (const n of chart.nodes) {
      const t = T.boxes.get(n.id) || { x: 0, y: 0 };
      boxes.set(n.id, { x: n.x == null ? t.x : n.x, y: n.y == null ? t.y : n.y, w: W, h: H });
    }
    // Everything moved so the top-left card starts at 0,0; offset says by how much.
    let minX = Infinity; let minY = Infinity; let maxX = 0; let maxY = 0;
    for (const b of boxes.values()) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); }
    if (!boxes.size) { minX = 0; minY = 0; }
    for (const b of boxes.values()) { b.x -= minX; b.y -= minY; maxX = Math.max(maxX, b.x + W); maxY = Math.max(maxY, b.y + H); }
    const edges = [];
    for (const n of chart.nodes) {
      const a = boxes.get(n.parent); const b = boxes.get(n.id);
      if (!a || !b) continue;
      edges.push(edgeBetween(a, b));
    }
    return { boxes, edges, width: maxX, height: maxY, offset: { x: minX, y: minY }, cardH: H };
  }

  /**
   * v1.59: the path of an extra line. Lines between the same two cards sit side by side (`offset`
   * apart), so money one way and narcotics the other don't cover each other. Right angles
   * (the default) leave and enter a card from its side, top or bottom, never across its photo.
   * -> { points: [[x, y]…], mid: [x, y], side: 'h' | 'v' }
   */
  function linkPath(link, a, b, offset = 0) {
    // v1.62: two lines between the same cards are worked out the same way round (then the
    // second is reversed), so they run side by side and never cross at a corner.
    if (link.from > link.to) {
      const r = linkPath({ ...link, from: link.to, to: link.from }, b, a, offset);
      return { ...r, points: r.points.slice().reverse() };
    }
    const ca = [a.x + a.w / 2, a.y + a.h / 2]; const cb = [b.x + b.w / 2, b.y + b.h / 2];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (link.route === 'straight') {
      const dx = cb[0] - ca[0]; const dy = cb[1] - ca[1]; const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * offset; const ny = dx / len * offset;
      const [p1, p2] = edgeBetween({ ...a, x: a.x + nx, y: a.y + ny }, { ...b, x: b.x + nx, y: b.y + ny });
      return { points: [p1, p2], mid: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], side: Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v' };
    }
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (gapX >= gapY) {
      const right = cb[0] >= ca[0];
      const sx = right ? a.x + a.w : a.x; const ex = right ? b.x : b.x + b.w;
      const sy = clamp(ca[1] + offset, a.y + 10, a.y + a.h - 10); const ey = clamp(cb[1] + offset, b.y + 10, b.y + b.h - 10);
      // Not level with the other card: across, then into its top or bottom (an L), so it doesn't
      // arrive between lines already at its side.
      // Of two lines side by side, the outer one turns outside the inner one (k), so they don't cross.
      const k = right === (cb[1] > ca[1]) ? -1 : 1;
      if (gapY > 0) {
        const tx = clamp(cb[0] + offset * k, b.x + 10, b.x + b.w - 10); const ty = cb[1] > ca[1] ? b.y : b.y + b.h;
        return { points: [[sx, sy], [tx, sy], [tx, ty]], mid: [(sx + tx) / 2, sy], side: 'h' };
      }
      if (Math.abs(sy - ey) < 1) return { points: [[sx, sy], [ex, sy]], mid: [(sx + ex) / 2, sy], side: 'h' };
      const mx = (sx + ex) / 2 + offset * k;
      return { points: [[sx, sy], [mx, sy], [mx, ey], [ex, ey]], mid: [mx, (sy + ey) / 2], side: 'v' };
    }
    const down = cb[1] >= ca[1];
    const sy = down ? a.y + a.h : a.y; const ey = down ? b.y : b.y + b.h;
    const sx = clamp(ca[0] + offset, a.x + 10, a.x + a.w - 10); const ex = clamp(cb[0] + offset, b.x + 10, b.x + b.w - 10);
    const k = down === (cb[0] > ca[0]) ? -1 : 1;
    if (gapX > 0) {
      const ty = clamp(cb[1] + offset * k, b.y + 10, b.y + b.h - 10); const tx = cb[0] > ca[0] ? b.x : b.x + b.w;
      return { points: [[sx, sy], [sx, ty], [tx, ty]], mid: [sx, (sy + ty) / 2], side: 'v' };
    }
    if (Math.abs(sx - ex) < 1) return { points: [[sx, sy], [sx, ey]], mid: [sx, (sy + ey) / 2], side: 'v' };
    const my = (sy + ey) / 2 + offset * k;
    return { points: [[sx, sy], [sx, my], [ex, my], [ex, ey]], mid: [(sx + ex) / 2, my], side: 'h' };
  }
  /** How far each extra line sits from the middle when two cards have more than one. */
  function linkOffsets(links) {
    const groups = new Map();
    for (const l of links) { const k = [l.from, l.to].sort().join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
    const out = new Map();
    for (const g of groups.values()) g.forEach((l, i) => out.set(l, (i - (g.length - 1) / 2) * 26));
    return out;
  }

  /** The two points where the line between two cards' centres leaves each card. */
  function edgeBetween(a, b) {
    const ca = [a.x + a.w / 2, a.y + a.h / 2]; const cb = [b.x + b.w / 2, b.y + b.h / 2];
    const out = (c, box, to) => {
      const dx = to[0] - c[0]; const dy = to[1] - c[1];
      if (!dx && !dy) return c;
      const k = Math.min(dx ? (box.w / 2) / Math.abs(dx) : Infinity, dy ? (box.h / 2) / Math.abs(dy) : Infinity);
      return [c[0] + dx * k, c[1] + dy * k];
    };
    return [out(ca, a, cb), out(cb, b, ca)];
  }

  function layout(chart) {
    const L = chart.mode === 'free' ? freeLayout(chart) : { ...treeLayout(chart), offset: { x: 0, y: 0 } };
    const shown = chart.links.filter((l) => !l.hidden);
    const offs = linkOffsets(shown);
    const links = shown.map((l) => ({ link: l, a: L.boxes.get(l.from), b: L.boxes.get(l.to), offset: offs.get(l) || 0 })).filter((e) => e.a && e.b);
    return { ...L, links };
  }

  /** Free mode from the tree: every card keeps the place it has now. */
  function freeze(chart) {
    const L = treeLayout(chart);
    for (const n of chart.nodes) { const b = L.boxes.get(n.id); if (b) { n.x = Math.round(b.x); n.y = Math.round(b.y); } }
    chart.mode = 'free';
    return chart;
  }

  /** How big the chart prints on the portrait page: { scale, nameSize, readable }. */
  function printScale(chart, pad = 6) {
    const L = layout(chart);
    const w = Math.max(W, L.width) + pad * 2; const h = Math.max(L.cardH, L.height) + pad * 2;
    const scale = Math.min(PAGE_AREA.w / w, PAGE_AREA.h / h, 1.6);
    const nameSize = Math.round(NAME_SIZE * scale * 10) / 10;
    return { scale, nameSize, readable: nameSize >= 6 };
  }

  /* ---------- drawing (SVG text) ---------- */

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const charsIn = (px, size) => Math.max(3, Math.floor(px / (size * 0.6)));
  /** Text cut to fit a width (monospace: about 0.6 em a character), with an ellipsis. */
  function fit(text, px, size) {
    const max = charsIn(px, size);
    const t = String(text || '');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  /**
   * Text over up to `lines` lines: whole words where they fit, a word longer than a line is split
   * (a web address, a wallet). Only what is left past the last line gets an ellipsis.
   */
  function wrapLines(text, px, size, lines = 2) {
    const max = charsIn(px, size);
    const out = [];
    let cur = '';
    for (let w of String(text || '').split(/\s+/).filter(Boolean)) {
      if (cur && `${cur} ${w}`.length <= max) { cur = `${cur} ${w}`; continue; }
      if (cur) { out.push(cur); cur = ''; }
      while (w.length > max) { out.push(w.slice(0, max)); w = w.slice(max); }
      cur = w;
    }
    if (cur) out.push(cur);
    if (out.length > lines) { const keep = out.slice(0, lines); keep[lines - 1] = fit(`${keep[lines - 1]} ${out.slice(lines).join(' ')}`, px, size); return keep; }
    return out;
  }
  const twoLines = (text, px, size) => wrapLines(text, px, size, 2);

  /** The round badge on a money or narcotics line: a dollar sign, or a capsule. */
  function longestMid(points) {
    let best = null; let len = -1;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > len) { len = d; best = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    }
    return best;
  }
  function flowBadge(flow, x, y) {
    const c = FLOW_COLOR[flow];
    const ring = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10.5" fill="${c}" stroke="#ffffff" stroke-width="2"/>`;
    if (flow === 'money') return `<g class="lc-flow lc-flow-money" pointer-events="none">${ring}<text x="${x.toFixed(1)}" y="${(y + 4.6).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" text-anchor="middle" fill="#ffffff">$</text></g>`;
    return `<g class="lc-flow lc-flow-narcotics" pointer-events="none">${ring}<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(-35)"><rect x="-7" y="-3.4" width="14" height="6.8" rx="3.4" fill="#ffffff"/><rect x="0" y="-3.4" width="7" height="6.8" rx="3.4" fill="#fde2d4"/><path d="M0 -3.4 V3.4" stroke="${c}" stroke-width="1"/></g></g>`;
  }

  /**
   * The chart as SVG text. opts: { photoUrl(node) -> url|'' , iconUrl(name) -> url, selected, linkFrom, pad, font }.
   * -> { svg, width, height, offset, pad }
   */
  function toSvg(chart, opts = {}) {
    const L = layout(chart); const H = L.cardH;
    const pad = opts.pad == null ? 16 : opts.pad;
    const font = opts.font || 'Consolas, "Courier New", monospace';
    const width = Math.max(W, L.width) + pad * 2; const height = Math.max(H, L.height) + pad * 2;
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family='${font}'>`);
    const marker = (id, c) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${c}"/></marker>`;
    // v1.58: on screen, small faint olive-green squares (opts.grid); the PDF stays white.
    const grid = opts.grid ? '<pattern id="lc-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0 H0 V10" fill="none" stroke="#c7d3ad" stroke-width=".6"/></pattern><pattern id="lc-grid5" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#lc-grid)"/><path d="M50 0 H0 V50" fill="none" stroke="#a9ba86" stroke-width=".9"/></pattern>' : '';
    out.push(`<defs>${marker('lc-arrow', FLOW_COLOR[''])}${marker('lc-arrow-money', FLOW_COLOR.money)}${marker('lc-arrow-narcotics', FLOW_COLOR.narcotics)}${grid}</defs>`);
    out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${opts.grid ? '#f3f6ec' : '#ffffff'}"/>`);
    if (opts.grid) out.push(`<rect x="${pad % 10}" y="${pad % 10}" width="${width}" height="${height}" fill="url(#lc-grid5)"/>`);
    out.push(`<g transform="translate(${pad} ${pad})">`);
    for (const e of L.edges) out.push(`<polyline points="${e.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#7a8794" stroke-width="1.6"/>`);
    const labels = [];
    for (const { link, a, b, offset } of L.links) {
      const P = linkPath(link, a, b, offset);
      const flow = link.flow || ''; const lc = FLOW_COLOR[flow] || FLOW_COLOR['']; const mk = flow ? `lc-arrow-${flow}` : 'lc-arrow';
      const ends = link.dir === 'to' ? ` marker-end="url(#${mk})"` : '';
      out.push(`<polyline points="${P.points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="${lc}" stroke-width="${flow ? 2 : 1.6}" stroke-dasharray="6 4" stroke-linejoin="round"${ends}/>`);
      // v1.62: the badge and label sit in the middle of the longest leg, clear of the cards.
      const [mx, my] = longestMid(P.points) || P.mid;
      // v1.58: money or narcotics: a small round badge in the middle of the line (the arrow says who sends).
      if (flow) labels.push(flowBadge(flow, mx, my));
      if (link.label) {
        const ls = wrapLines(link.label, 150, 9, 2);
        const tw = Math.max(...ls.map((t) => t.length)) * 9 * 0.6 + 10; const th = ls.length * 11 + 5;
        // v1.59: beside its badge; of two side-by-side lines, one label above and one below.
        const gap = (flow ? 14 : 4) + th / 2;
        const ly = offset < 0 ? my - gap : flow || offset > 0 ? my + gap : my;
        labels.push(`<g class="lc-label" pointer-events="none"><rect x="${(mx - tw / 2).toFixed(1)}" y="${(ly - th / 2).toFixed(1)}" width="${tw.toFixed(1)}" height="${th}" fill="#fff8e6" stroke="${lc}" stroke-width=".8"/>${ls.map((t, i) => `<text x="${mx.toFixed(1)}" y="${(ly - th / 2 + 12 + i * 11).toFixed(1)}" font-size="9" text-anchor="middle" fill="#3f3320">${esc(t)}</text>`).join('')}</g>`);
      }
    }
    for (const n of chart.nodes) {
      const bx = L.boxes.get(n.id);
      if (!bx) continue;
      const col = colorOf(n);
      const sel = opts.selected === n.id; const from = opts.linkFrom === n.id;
      out.push(`<g data-node="${esc(n.id)}" class="lc-card${from ? ' lc-from' : ''}">`);
      out.push(`<rect x="${bx.x}" y="${bx.y}" width="${W}" height="${H}" fill="#ffffff" stroke="${from ? '#c98a12' : sel ? '#0d6efd' : '#c3ccd6'}" stroke-width="${sel || from ? 2.4 : 1}"/>`);
      out.push(`<rect x="${bx.x}" y="${bx.y}" width="${W}" height="4" fill="${col}"/>`);
      const px = bx.x + (W - PHOTO) / 2; const py = bx.y + 10;
      const photo = n.kind === 'person' && opts.photoUrl ? opts.photoUrl(n) : '';
      const clip = `lcclip-${esc(n.id)}`;
      if (photo) {
        out.push(`<clipPath id="${clip}"><rect x="${px}" y="${py}" width="${PHOTO}" height="${PHOTO}"/></clipPath>`);
        out.push(`<image href="${esc(photo)}" x="${px}" y="${py}" width="${PHOTO}" height="${PHOTO}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`);
        out.push(`<rect x="${px}" y="${py}" width="${PHOTO}" height="${PHOTO}" fill="none" stroke="#c3ccd6"/>`);
      } else {
        out.push(`<rect x="${px}" y="${py}" width="${PHOTO}" height="${PHOTO}" fill="#eef1f5" stroke="#d5dbe2"/>`);
        const ic = iconOf(n); const url = ic && opts.iconUrl ? opts.iconUrl(ic) : '';
        if (url) out.push(`<image href="${esc(url)}" x="${px + 11}" y="${py + 11}" width="${PHOTO - 22}" height="${PHOTO - 22}" preserveAspectRatio="xMidYMid meet"/>`);
        else {
          // A head-and-shoulders outline for a person without a photo.
          const cx = px + PHOTO / 2;
          out.push(`<circle cx="${cx}" cy="${py + 26}" r="13" fill="#b8c2cd"/><path d="M${cx - 25} ${py + PHOTO} C${cx - 25} ${py + 46} ${cx + 25} ${py + 46} ${cx + 25} ${py + PHOTO} Z" fill="#b8c2cd"/>`);
        }
      }
      // Name (up to 3 lines), the role or platform, then the alias / handle (up to 2 lines).
      const { names, sub, handle } = cardText(n);
      let ty = py + PHOTO + 14;
      for (const l of names) { out.push(`<text x="${bx.x + W / 2}" y="${ty}" font-size="${NAME_SIZE}" font-weight="700" text-anchor="middle" fill="#1f2933">${esc(l)}</text>`); ty += 12.5; }
      if (sub) { out.push(`<text x="${bx.x + W / 2}" y="${ty}" font-size="9" text-anchor="middle" fill="${col}" font-weight="700">${esc(fit(sub, W - 10, 9))}</text>`); ty += 11; }
      {
        for (const l of handle) { if (ty > bx.y + H - 3) break; out.push(`<text x="${bx.x + W / 2}" y="${ty}" font-size="8.5" text-anchor="middle" fill="#52606d">${esc(l)}</text>`); ty += 10; }
      }
      out.push('</g>');
    }
    out.push(...labels);
    out.push('</g></svg>');
    return { svg: out.join(''), width, height, offset: L.offset, pad };
  }

  /* ---------- the chart inside its PDF (v1.56) ----------
   * The saved PDF carries the chart as a PDF comment just before "startxref" (no offsets
   * change; PDF readers skip comments), so Files → Link Charts can send it back to the tab. */
  const MARK = '%CaseVault-LinkChart:';
  const toB64 = (s) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : root.btoa(bytesToStr(new TextEncoder().encode(s))));
  const fromB64 = (b) => (typeof Buffer !== 'undefined' ? Buffer.from(b, 'base64').toString('utf8') : new TextDecoder().decode(Uint8Array.from(root.atob(b), (ch) => ch.charCodeAt(0))));
  function bytesToStr(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; }
  function embed(pdfBytes, chart) {
    const s = bytesToStr(pdfBytes);
    const at = s.lastIndexOf('startxref');
    if (at < 0) return pdfBytes;
    const keep = normalize(chart); delete keep.updated;
    const line = `${MARK}${toB64(JSON.stringify(keep))}\n`;
    const out = new Uint8Array(pdfBytes.length + line.length);
    out.set(pdfBytes.subarray(0, at), 0);
    for (let i = 0; i < line.length; i++) out[at + i] = line.charCodeAt(i);
    out.set(pdfBytes.subarray(at), at + line.length);
    return out;
  }
  /** The chart from a Link Chart PDF, or null. */
  function extract(pdfBytes) {
    const s = bytesToStr(pdfBytes);
    const i = s.lastIndexOf(MARK);
    if (i < 0) return null;
    const end = s.indexOf('\n', i);
    try { return normalize(JSON.parse(fromB64(s.slice(i + MARK.length, end < 0 ? undefined : end).trim()))); } catch { return null; }
  }

  /** v1.59: the chart in words, kept under Reports with its PDF: who is under whom, and the connections. */
  function summaryMarkdown(chart) {
    const name = (n) => (n ? n.name || n.handle || subLine(n) || 'Unnamed' : '?');
    const byId = new Map(chart.nodes.map((n) => [n.id, n]));
    const lines = [`# ${chart.title || 'Link Chart'}`, '', '## People and Accounts', ''];
    for (const { node: n, depth } of ordered(chart)) lines.push(`${'  '.repeat(depth)}- **${name(n)}**${subLine(n) ? ` (${subLine(n)})` : ''}${n.handle && n.name ? `: ${n.handle}` : ''}`);
    const shown = chart.links.filter((l) => !l.hidden);
    if (shown.length) {
      lines.push('', '## Connections', '');
      for (const l of shown) {
        const a = name(byId.get(l.from)); const b = name(byId.get(l.to));
        const what = l.flow === 'money' ? 'money' : l.flow === 'narcotics' ? 'narcotics' : '';
        const arrow = l.dir === 'none' ? `${a} — ${b}` : `${a} → ${b}`;
        lines.push(`- ${arrow}${what ? `: ${what}` : ''}${l.label ? ` (${l.label})` : ''}`);
      }
    }
    return lines.join('\n');
  }

  const api = {
    KINDS, ROLES, DIRS, FLOWS, otherFlow, PLATFORMS, PER_ROW, CARD: { W, H: H_MAX, PHOTO }, cardHeight, emptyChart, normalize, newNode, childrenOf, subtree, removeNode, clear, ordered,
    moveSibling, linkBetween, toggleLink, linkPath, linkOffsets, summaryMarkdown, iconOf, colorOf, subLine, layout, freeze, printScale, toSvg, fit, wrapLines, twoLines, embed, extract,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVLinkChart = api;
})(this);
