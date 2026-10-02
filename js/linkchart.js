/* CaseVault — link chart (v1.52). Who is under whom in a case: subjects at the top, their
 * suppliers, couriers and associates under them, and their monikers, webpages, dark-web names,
 * phones and wallets hanging off the person who uses them. Kept per case in linkchart.json; the
 * PDF (portrait, letter) goes to Files → Link Charts.
 *
 * Plain logic (the chart, its layout, the drawing as SVG text) with no DOM, so the tests run it
 * under Node. js/linkchart-ui.js is the screen.
 *
 *   chart = { version: 1, title, nodes: [node], links: [link], updated }
 *   node  = { id, parent, kind, name, role, platform, handle, photo, note }
 *   link  = { id, from, to, label }   an extra line between two cards (not part of the tree)
 */
'use strict';

(function (root) {
  const KINDS = [['person', 'Person'], ['online', 'Moniker or Webpage'], ['phone', 'Phone'], ['crypto', 'Crypto Wallet'], ['location', 'Location'], ['other', 'Other']];
  const ROLES = ['Subject', 'Supplier', 'Courier', 'Associate', 'Customer', 'Source', 'Other'];
  // Platforms of an online name, each with its picture (icons/color) and colour.
  const PLATFORMS = [
    ['web', 'Webpage', 'globe', '#1d6fd8'], ['darkweb', 'Dark Web', 'skull', '#b02a37'], ['google', 'Google', 'google', '#4285f4'],
    ['snapchat', 'Snapchat', 'snapchat', '#e6c200'], ['meta', 'Facebook / Instagram', 'meta', '#0866ff'], ['telegram', 'Telegram', 'telegram', '#229ed9'],
    ['other', 'Other', 'chain', '#5c6670'],
  ];
  const KIND_ICON = { phone: 'phone', crypto: 'crypto', location: 'pin', other: 'target' };
  const ROLE_COLOR = { Subject: '#b02a37', Supplier: '#6f42c1', Courier: '#0d6efd', Associate: '#5c6670', Customer: '#198754', Source: '#c98a12', Other: '#5c6670' };
  const KIND_COLOR = { phone: '#0b7285', crypto: '#c98a12', location: '#1d6fd8', other: '#5c6670' };

  // Card and spacing, in chart units (1 unit = 1 px on screen; the PDF scales it to the page).
  const W = 132; const H = 138; const PHOTO = 76; const GX = 22; const GY = 46; const ROW = 4;

  const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const str = (v, n = 300) => String(v == null ? '' : v).slice(0, n);

  function emptyChart() { return { version: 1, title: '', nodes: [], links: [], updated: '' }; }

  /** A clean chart from whatever was saved: unknown fields dropped, broken parents and loops cut. */
  function normalize(raw) {
    const c = emptyChart();
    if (!raw || typeof raw !== 'object') return c;
    c.title = str(raw.title, 200);
    c.updated = str(raw.updated, 40);
    const kinds = new Set(KINDS.map((k) => k[0]));
    const plats = new Set(PLATFORMS.map((p) => p[0]));
    const seen = new Set();
    for (const n of Array.isArray(raw.nodes) ? raw.nodes : []) {
      if (!n || typeof n !== 'object' || !n.id || seen.has(String(n.id))) continue;
      seen.add(String(n.id));
      c.nodes.push({
        id: str(n.id, 60), parent: str(n.parent, 60), kind: kinds.has(n.kind) ? n.kind : 'person',
        name: str(n.name, 120), role: str(n.role, 60), platform: plats.has(n.platform) ? n.platform : '',
        handle: str(n.handle, 300), photo: str(n.photo, 400), note: str(n.note, 500),
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
      c.links.push({ id: str(l.id || newId(), 60), from: l.from, to: l.to, label: str(l.label, 80) });
    }
    return c;
  }

  function newNode(kind = 'person', parent = '') {
    return { id: newId(), parent, kind, name: '', role: kind === 'person' ? (parent ? 'Courier' : 'Subject') : '', platform: kind === 'online' ? 'web' : '', handle: '', photo: '', note: '' };
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
  /** Depth-first order with depth, for the list on the left. */
  function ordered(chart) {
    const out = [];
    const walk = (parent, depth) => { for (const n of childrenOf(chart, parent)) { out.push({ node: n, depth }); walk(n.id, depth + 1); } };
    walk('', 0);
    return out;
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

  /* ---------- layout ----------
   * Top down. A card whose children are all ends of the tree and are 5 or more puts them in rows
   * of 4 under it (a grid), so a wide crew of couriers stays narrow enough for a portrait page;
   * otherwise its children sit side by side under it. Lines are square elbows. */
  function layout(chart) {
    const kids = (id) => childrenOf(chart, id);
    const isLeaf = (id) => !kids(id).length;
    const memo = new Map();
    const measure = (id) => {
      if (memo.has(id)) return memo.get(id);
      const ks = kids(id);
      let m;
      if (!ks.length) m = { w: W, h: H, grid: false };
      else if (ks.length >= 5 && ks.every((k) => isLeaf(k.id))) {
        const per = Math.min(ROW, ks.length); const rows = Math.ceil(ks.length / per);
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
    const width = roots.length ? x - GX * 2 : 0;
    const extra = chart.links.map((l) => ({ link: l, a: boxes.get(l.from), b: boxes.get(l.to) })).filter((e) => e.a && e.b);
    return { boxes, edges, links: extra, width, height };
  }

  /* ---------- drawing (SVG text) ---------- */

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /** Text cut to fit a width (monospace: about 0.6 em a character), with an ellipsis. */
  function fit(text, px, size) {
    const max = Math.max(3, Math.floor(px / (size * 0.6)));
    const t = String(text || '');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  /** A name over two lines at most. */
  function twoLines(text, px, size) {
    const max = Math.max(3, Math.floor(px / (size * 0.6)));
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [''];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (!cur) lines[lines.length - 1] = w;
      else if (`${cur} ${w}`.length <= max) lines[lines.length - 1] = `${cur} ${w}`;
      else if (lines.length < 2) lines.push(w);
      else { lines[1] = `${lines[1]} ${w}`; }
    }
    return lines.map((l) => fit(l, px, size)).filter(Boolean);
  }

  /**
   * The chart as SVG text. opts: { photoUrl(node) -> url|'' , iconUrl(name) -> url, selected, pad, font }.
   * -> { svg, width, height }
   */
  function toSvg(chart, opts = {}) {
    const L = layout(chart);
    const pad = opts.pad == null ? 16 : opts.pad;
    const font = opts.font || 'Consolas, "Courier New", monospace';
    const width = Math.max(W, L.width) + pad * 2; const height = Math.max(H, L.height) + pad * 2;
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family='${font}'>`);
    out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
    out.push(`<g transform="translate(${pad} ${pad})">`);
    for (const e of L.edges) out.push(`<polyline points="${e.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#7a8794" stroke-width="1.6"/>`);
    for (const { link, a, b } of L.links) {
      const x1 = a.x + a.w / 2; const y1 = a.y + a.h / 2; const x2 = b.x + b.w / 2; const y2 = b.y + b.h / 2;
      out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c98a12" stroke-width="1.6" stroke-dasharray="6 4"/>`);
      if (link.label) {
        const t = fit(link.label, 120, 9); const tw = t.length * 9 * 0.6 + 8; const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
        out.push(`<rect x="${mx - tw / 2}" y="${my - 8}" width="${tw}" height="14" fill="#fff8e6" stroke="#c98a12" stroke-width=".8"/><text x="${mx}" y="${my + 2.5}" font-size="9" text-anchor="middle" fill="#6b4f1d">${esc(t)}</text>`);
      }
    }
    for (const n of chart.nodes) {
      const bx = L.boxes.get(n.id);
      if (!bx) continue;
      const col = colorOf(n);
      const sel = opts.selected === n.id;
      out.push(`<g data-node="${esc(n.id)}" class="lc-card">`);
      out.push(`<rect x="${bx.x}" y="${bx.y}" width="${W}" height="${H}" fill="#ffffff" stroke="${sel ? '#0d6efd' : '#c3ccd6'}" stroke-width="${sel ? 2.4 : 1}"/>`);
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
        if (url) out.push(`<image href="${esc(url)}" x="${px + 12}" y="${py + 12}" width="${PHOTO - 24}" height="${PHOTO - 24}" preserveAspectRatio="xMidYMid meet"/>`);
        else {
          // A head-and-shoulders outline for a person without a photo.
          const cx = px + PHOTO / 2;
          out.push(`<circle cx="${cx}" cy="${py + 28}" r="14" fill="#b8c2cd"/><path d="M${cx - 27} ${py + PHOTO} C${cx - 27} ${py + 50} ${cx + 27} ${py + 50} ${cx + 27} ${py + PHOTO} Z" fill="#b8c2cd"/>`);
        }
      }
      const names = twoLines(n.name || (n.kind === 'person' ? 'Unknown' : n.handle || 'Unnamed'), W - 10, 10.5);
      let ty = py + PHOTO + 14;
      for (const l of names) { out.push(`<text x="${bx.x + W / 2}" y="${ty}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#1f2933">${esc(l)}</text>`); ty += 12; }
      const sub = subLine(n);
      if (sub) { out.push(`<text x="${bx.x + W / 2}" y="${ty}" font-size="9" text-anchor="middle" fill="${col}" font-weight="700">${esc(fit(sub, W - 10, 9))}</text>`); ty += 11; }
      if (n.handle && (n.name || n.kind === 'person') && ty < bx.y + H - 2) out.push(`<text x="${bx.x + W / 2}" y="${ty}" font-size="8.5" text-anchor="middle" fill="#52606d">${esc(fit(n.handle, W - 10, 8.5))}</text>`);
      out.push('</g>');
    }
    out.push('</g></svg>');
    return { svg: out.join(''), width, height };
  }

  const api = { KINDS, ROLES, PLATFORMS, CARD: { W, H, PHOTO }, emptyChart, normalize, newNode, childrenOf, subtree, removeNode, ordered, iconOf, colorOf, subLine, layout, toSvg, fit, twoLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVLinkChart = api;
})(this);
