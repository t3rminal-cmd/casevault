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
 *                                         dir: 'to' (arrow at "to"), 'from', 'both' or 'none'
 */
'use strict';

(function (root) {
  const KINDS = [['person', 'Person'], ['online', 'Moniker or Webpage'], ['phone', 'Phone'], ['crypto', 'Crypto Wallet'], ['location', 'Location'], ['other', 'Other']];
  const ROLES = ['Primary', 'Supplier', 'Courier', 'Associate', 'Customer', 'Source', 'Other'];
  const DIRS = [['to', 'Arrow To →'], ['from', '← Arrow From'], ['both', '↔ Both Ways'], ['none', 'No Arrow']];
  // Platforms of an online name, each with its picture (icons/color) and colour.
  const PLATFORMS = [
    ['web', 'Webpage', 'globe', '#1d6fd8'], ['darkweb', 'Dark Web', 'skull', '#b02a37'], ['google', 'Google', 'google', '#4285f4'],
    ['snapchat', 'Snapchat', 'snapchat', '#e6c200'], ['meta', 'Facebook / Instagram', 'meta', '#0866ff'], ['telegram', 'Telegram', 'telegram', '#229ed9'],
    ['other', 'Other', 'chain', '#5c6670'],
  ];
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

  function emptyChart() { return { version: 2, title: '', mode: 'tree', perRow: PER_ROW.default, nodes: [], links: [], updated: '' }; }

  /** A clean chart from whatever was saved: unknown fields dropped, broken parents and loops cut. */
  function normalize(raw) {
    const c = emptyChart();
    if (!raw || typeof raw !== 'object') return c;
    c.title = str(raw.title, 200);
    c.updated = str(raw.updated, 40);
    c.mode = raw.mode === 'free' ? 'free' : 'tree';
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
        name: str(n.name, 120), role: n.role === 'Subject' ? 'Primary' : str(n.role, 60), platform: plats.has(n.platform) ? n.platform : '',
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
    const dirs = new Set(DIRS.map((d) => d[0]));
    for (const l of Array.isArray(raw.links) ? raw.links : []) {
      if (!l || !seen.has(l.from) || !seen.has(l.to) || l.from === l.to) continue;
      c.links.push({ id: str(l.id || newId(), 60), from: l.from, to: l.to, label: str(l.label, 80), dir: dirs.has(l.dir) ? l.dir : 'none' });
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
  /** Click-to-link: adds an arrow from a to b, or takes the line away when there is one. -> 'linked' | 'unlinked' | '' */
  function toggleLink(chart, a, b) {
    if (!a || !b || a === b || !chart.nodes.some((n) => n.id === a) || !chart.nodes.some((n) => n.id === b)) return '';
    const l = linkBetween(chart, a, b);
    if (l) { chart.links = chart.links.filter((x) => x !== l); return 'unlinked'; }
    chart.links.push({ id: newId(), from: a, to: b, label: '', dir: 'to' });
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
    const links = chart.links.map((l) => ({ link: l, a: L.boxes.get(l.from), b: L.boxes.get(l.to) })).filter((e) => e.a && e.b);
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
    out.push('<defs><marker id="lc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#c98a12"/></marker></defs>');
    out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
    out.push(`<g transform="translate(${pad} ${pad})">`);
    for (const e of L.edges) out.push(`<polyline points="${e.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#7a8794" stroke-width="1.6"/>`);
    const labels = [];
    for (const { link, a, b } of L.links) {
      const [[x1, y1], [x2, y2]] = edgeBetween(a, b);
      const ends = `${link.dir === 'to' || link.dir === 'both' ? ' marker-end="url(#lc-arrow)"' : ''}${link.dir === 'from' || link.dir === 'both' ? ' marker-start="url(#lc-arrow)"' : ''}`;
      out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#c98a12" stroke-width="1.6" stroke-dasharray="6 4"${ends}/>`);
      if (link.label) {
        const ls = wrapLines(link.label, 150, 9, 2);
        const tw = Math.max(...ls.map((t) => t.length)) * 9 * 0.6 + 10; const th = ls.length * 11 + 5;
        const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
        labels.push(`<rect x="${(mx - tw / 2).toFixed(1)}" y="${(my - th / 2).toFixed(1)}" width="${tw.toFixed(1)}" height="${th}" fill="#fff8e6" stroke="#c98a12" stroke-width=".8"/>${ls.map((t, i) => `<text x="${mx.toFixed(1)}" y="${(my - th / 2 + 12 + i * 11).toFixed(1)}" font-size="9" text-anchor="middle" fill="#6b4f1d">${esc(t)}</text>`).join('')}`);
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

  const api = {
    KINDS, ROLES, DIRS, PLATFORMS, PER_ROW, CARD: { W, H: H_MAX, PHOTO }, cardHeight, emptyChart, normalize, newNode, childrenOf, subtree, removeNode, clear, ordered,
    moveSibling, linkBetween, toggleLink, iconOf, colorOf, subLine, layout, freeze, printScale, toSvg, fit, wrapLines, twoLines, embed, extract,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVLinkChart = api;
})(this);
