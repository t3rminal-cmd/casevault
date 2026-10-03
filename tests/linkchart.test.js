// v1.52 link chart: the chart kept clean, the tree laid out top down (rows for a big crew), the SVG.
// Everything here is made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LC = require('../js/linkchart.js');

const chart = () => LC.normalize({
  title: 'Example Sweep',
  nodes: [
    { id: 'a', kind: 'person', name: 'John Doe', role: 'Subject' },
    { id: 'b', parent: 'a', kind: 'person', name: 'Rick Roe', role: 'Courier' },
    { id: 'c', parent: 'a', kind: 'online', name: 'doe_plug', platform: 'telegram', handle: '@doe_plug' },
    { id: 'd', parent: 'b', kind: 'phone', handle: '(555) 010-0101' },
  ],
  links: [{ id: 'l1', from: 'c', to: 'd', label: 'Same subscriber' }],
});

test('normalize drops junk, cuts loops and broken parents', () => {
  const c = LC.normalize({ nodes: [{ id: 'x', parent: 'y', kind: 'bogus' }, { id: 'y', parent: 'x' }, { id: 'z', parent: 'gone' }, { id: 'x' }, null], links: [{ from: 'x', to: 'x' }, { from: 'x', to: 'nope' }] });
  assert.deepStrictEqual(c.nodes.map((n) => n.id), ['x', 'y', 'z']);
  assert.strictEqual(c.nodes[0].kind, 'person');
  assert.strictEqual(c.nodes.find((n) => n.id === 'z').parent, '');
  // x -> y -> x is a loop: one of them becomes a top card.
  assert.ok(c.nodes.some((n) => n.parent === ''));
  assert.deepStrictEqual(c.links, []);
  assert.deepStrictEqual(LC.normalize(null), LC.emptyChart());
});

test('tree order, subtree and removing a card moves its children up', () => {
  const c = chart();
  assert.deepStrictEqual(LC.ordered(c).map((x) => [x.node.id, x.depth]), [['a', 0], ['b', 1], ['d', 2], ['c', 1]]);
  assert.deepStrictEqual(LC.subtree(c, 'b'), ['b', 'd']);
  LC.removeNode(c, 'b');
  assert.strictEqual(c.nodes.find((n) => n.id === 'd').parent, 'a');
  assert.deepStrictEqual(c.links.map((l) => l.id), ['l1']);
  LC.removeNode(c, 'c');
  assert.deepStrictEqual(c.links, []);
});

test('layout: parents above children, no two cards overlap, a big crew goes in rows', () => {
  const c = chart();
  for (let i = 0; i < 9; i++) c.nodes.push({ ...LC.newNode('person', 'b'), name: `Courier ${i}` });
  c.nodes = c.nodes.filter((n) => n.id !== 'd');
  const L = LC.layout(c);
  const boxes = [...L.boxes.entries()];
  for (const [id, b] of boxes) { const n = c.nodes.find((x) => x.id === id); if (n.parent) assert.ok(L.boxes.get(n.parent).y < b.y, `${id} under its parent`); }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [, p] = boxes[i]; const [, q] = boxes[j];
    assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${boxes[i][0]} and ${boxes[j][0]} overlap`);
  }
  const rows = new Set(c.nodes.filter((n) => n.parent === 'b').map((n) => L.boxes.get(n.id).y));
  assert.strictEqual(rows.size, 3, '9 couriers in rows of 4');
  assert.ok(L.width < 4 * LC.CARD.W + 5 * 30 + 2 * LC.CARD.W, 'narrow enough for a portrait page');
});

test('SVG: names, roles, platform pictures, photos cropped square, the extra line', () => {
  const c = chart();
  c.nodes[0].photo = 'Subject Information/doe.jpg';
  const { svg, width, height } = LC.toSvg(c, { photoUrl: (n) => (n.photo ? 'data:image/jpeg;base64,AAAA' : ''), iconUrl: (k) => `icons/color/${k}.png`, selected: 'b' });
  assert.ok(width > 0 && height > 0);
  for (const s of ['John Doe', 'Primary', 'Rick Roe', 'Courier', 'Telegram', 'icons/color/telegram.png', 'icons/color/phone.png', 'xMidYMid slice', 'Same subscriber', 'stroke-dasharray']) assert.ok(svg.includes(s), s);
  assert.ok(!/<script/i.test(LC.toSvg(LC.normalize({ nodes: [{ id: 'q', name: '<script>x</script>' }] })).svg), 'names are escaped');
});

test('long names fit the card', () => {
  assert.deepStrictEqual(LC.twoLines('Jonathan Alexander Doe-Example Junior', 122, 10.5).length, 2);
  assert.ok(LC.fit('https://example.com/a/very/long/path/that/goes/on', 122, 8.5).endsWith('…'));
});

// v1.56
test('Subject becomes Primary; old links have no arrow; mode and per-row kept clean', () => {
  const c = chart();
  assert.strictEqual(c.nodes[0].role, 'Primary');
  assert.strictEqual(c.links[0].dir, 'none');
  assert.strictEqual(c.mode, 'tree');
  assert.strictEqual(c.perRow, 4);
  const d = LC.normalize({ mode: 'free', perRow: 99, nodes: [{ id: 'a', x: 10.4, y: 'no' }] });
  assert.strictEqual(d.mode, 'free'); assert.strictEqual(d.perRow, 4);
  assert.strictEqual(d.nodes[0].x, 10); assert.strictEqual(d.nodes[0].y, null);
  assert.strictEqual(LC.newNode('person').role, 'Primary');
});

test('per row decides when a crew goes into rows', () => {
  const c = LC.normalize({ perRow: 3, nodes: [{ id: 'a' }] });
  for (let i = 0; i < 6; i++) c.nodes.push({ ...LC.newNode('person', 'a') });
  const L = LC.layout(c);
  assert.strictEqual(new Set(c.nodes.slice(1).map((n) => L.boxes.get(n.id).y)).size, 2, '6 in rows of 3');
  c.perRow = 6;
  assert.strictEqual(new Set(c.nodes.slice(1).map((n) => LC.layout(c).boxes.get(n.id).y)).size, 1, '6 side by side');
  const big = LC.printScale(c); c.perRow = 2; const small = LC.printScale(c);
  assert.ok(small.nameSize >= big.nameSize);
  assert.strictEqual(typeof big.readable, 'boolean');
});

test('move left / right swaps cards under the same card', () => {
  const c = chart();
  assert.strictEqual(LC.moveSibling(c, 'c', -1), true);
  assert.deepStrictEqual(LC.ordered(c).map((x) => x.node.id), ['a', 'c', 'b', 'd']);
  assert.strictEqual(LC.moveSibling(c, 'c', -1), false, 'already first');
  assert.strictEqual(LC.moveSibling(c, 'a', 1), false, 'only top card');
});

test('click to link and unlink, arrows drawn', () => {
  const c = chart();
  assert.strictEqual(LC.toggleLink(c, 'b', 'c'), 'linked');
  const l = c.links.find((x) => x.from === 'b');
  assert.strictEqual(l.dir, 'to');
  assert.ok(LC.toSvg(c).svg.includes('marker-end="url(#lc-arrow)"'));
  // v1.62: never an arrow head at the start: a line back is its own line.
  assert.ok(!LC.toSvg(c).svg.includes('marker-start'));
  // v1.59: the other way round adds a return line beside it; the same way again takes it away.
  assert.strictEqual(LC.toggleLink(c, 'c', 'b'), 'linked', 'a line back');
  assert.strictEqual(c.links.filter((x) => [x.from, x.to].sort().join() === 'b,c').length, 2);
  assert.strictEqual(LC.toggleLink(c, 'c', 'b'), 'unlinked');
  assert.strictEqual(LC.toggleLink(c, 'b', 'c'), 'unlinked');
  assert.strictEqual(LC.toggleLink(c, 'b', 'b'), '');
  LC.clear(c);
  assert.deepStrictEqual([c.nodes.length, c.links.length, c.title], [0, 0, 'Example Sweep']);
});

test('free mode keeps each card where it was put', () => {
  const c = chart();
  const before = LC.layout(c).boxes.get('d');
  LC.freeze(c);
  assert.strictEqual(c.mode, 'free');
  assert.deepStrictEqual([LC.layout(c).boxes.get('d').x, LC.layout(c).boxes.get('d').y], [Math.round(before.x), Math.round(before.y)]);
  c.nodes.find((n) => n.id === 'd').x = -200;
  const L = LC.layout(c);
  assert.strictEqual(L.offset.x, -200);
  assert.strictEqual(L.boxes.get('d').x, 0, 'shifted so nothing is off the page');
  assert.ok(LC.toSvg(c).svg.includes('<polyline'), 'lines to parents');
});

test('names, handles and labels wrap instead of being cut', () => {
  const long = 'https://example.com/a/very/long/path/that/goes/on';
  const lines = LC.wrapLines(long, 140, 8.5, 2);
  assert.strictEqual(lines.join(''), long);
  assert.ok(lines.every((l) => l.length <= Math.floor(140 / (8.5 * 0.6))));
  assert.strictEqual(LC.wrapLines('Jonathan Alexander Doe-Example Junior', 140, 10.5, 3).join(' '), 'Jonathan Alexander Doe-Example Junior');
});

test('the chart rides inside its PDF and comes back', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\ntrailer\n<< >>\nstartxref\n9\n%%EOF\n');
  const c = chart(); c.title = 'Doé Crew'; LC.freeze(c);
  const out = LC.embed(pdf, c);
  const s = new TextDecoder().decode(out);
  assert.ok(s.indexOf('%CaseVault-LinkChart:') < s.lastIndexOf('startxref'));
  assert.ok(s.endsWith('startxref\n9\n%%EOF\n'));
  const back = LC.extract(out);
  assert.strictEqual(back.title, 'Doé Crew');
  assert.strictEqual(back.mode, 'free');
  assert.deepStrictEqual(back.nodes.map((n) => n.id), c.nodes.map((n) => n.id));
  assert.strictEqual(LC.extract(pdf), null);
});

// v1.58
test('platforms: Facebook and Instagram apart (old Facebook / Instagram cards become Facebook), payment apps', () => {
  const c = LC.normalize({ nodes: [{ id: 'm', kind: 'online', platform: 'meta' }, { id: 'v', kind: 'online', platform: 'venmo' }] });
  assert.strictEqual(c.nodes[0].platform, 'facebook');
  for (const p of ['facebook', 'instagram', 'grindr', 'cashapp', 'venmo', 'zelle', 'coinbase', 'moonpay', 'applepay', 'darkweb']) assert.ok(LC.PLATFORMS.some((x) => x[0] === p), p);
  assert.strictEqual(LC.iconOf(c.nodes[1]), 'venmo');
  assert.strictEqual(LC.subLine(c.nodes[1]), 'Venmo');
});

test('links carry money or narcotics: a badge on the line, coloured arrows', () => {
  const c = chart();
  assert.strictEqual(c.links[0].flow, '');
  assert.strictEqual(LC.toggleLink(c, 'b', 'c', 'money'), 'linked');
  const l = c.links.find((x) => x.from === 'b');
  assert.strictEqual(l.flow, 'money');
  let svg = LC.toSvg(c).svg;
  assert.ok(svg.includes('lc-flow-money') && svg.includes('url(#lc-arrow-money)'));
  l.flow = 'narcotics';
  svg = LC.toSvg(c).svg;
  assert.ok(svg.includes('lc-flow-narcotics') && svg.includes('url(#lc-arrow-narcotics)'));
  assert.strictEqual(LC.normalize({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ from: 'a', to: 'b', flow: 'bogus' }] }).links[0].flow, '');
});

test('grid on screen only, snap kept', () => {
  const c = chart();
  assert.strictEqual(c.snap, true);
  assert.strictEqual(LC.normalize({ snap: false }).snap, false);
  assert.ok(LC.toSvg(c, { grid: true }).svg.includes('id="lc-grid"'));
  assert.ok(!LC.toSvg(c).svg.includes('id="lc-grid"'), 'no grid in the PDF');
});

// v1.59
test('two lines between the same cards sit side by side; right angles leave from the side', () => {
  const c = LC.normalize({ mode: 'free', nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 400, y: 0 }] });
  LC.toggleLink(c, 'a', 'b', 'narcotics'); LC.toggleLink(c, 'b', 'a', 'money');
  const L = LC.layout(c);
  assert.strictEqual(L.links.length, 2);
  const [p, q] = L.links.map((e) => LC.linkPath(e.link, e.a, e.b, e.offset));
  assert.notStrictEqual(p.points[0][1], q.points[0][1], 'one above the other');
  const W = LC.CARD.W;
  assert.ok(p.points[0][0] === W || p.points[0][0] === 400, 'from the side of the card, not its middle');
  const svg = LC.toSvg(c).svg;
  assert.ok(svg.includes('lc-flow-money') && svg.includes('lc-flow-narcotics'));
  c.links[0].hidden = true;
  assert.ok(!LC.toSvg(c).svg.includes('lc-flow-narcotics'), 'a hidden line is not drawn');
  assert.strictEqual(LC.normalize(c).links[0].hidden, true);
  assert.strictEqual(LC.normalize({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ from: 'a', to: 'b' }] }).links[0].route, 'elbow');
  const d = LC.normalize({ mode: 'free', nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 500 }] });
  LC.toggleLink(d, 'a', 'b');
  const e = LC.layout(d).links[0];
  const r = LC.linkPath(e.link, e.a, e.b, 0);
  assert.ok(r.points[0][1] >= e.a.y + e.a.h - 0.5, 'below the card, not across the photo');
});

// v1.62
test('one line per direction: old two-way arrows become two lines, old back arrows are turned round', () => {
  const c = LC.normalize({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ id: 'x', from: 'a', to: 'b', dir: 'both', flow: 'narcotics' }, { id: 'y', from: 'a', to: 'b', dir: 'from' }] });
  assert.deepStrictEqual(c.links.map((l) => [l.from, l.to, l.dir, l.flow]), [['a', 'b', 'to', 'narcotics'], ['b', 'a', 'to', 'money'], ['b', 'a', 'to', '']]);
  assert.ok(!LC.DIRS.some((d) => d[0] === 'both' || d[0] === 'from'));
  assert.ok(!LC.toSvg(c).svg.includes('marker-start'), 'never two arrow heads on one line');
  const d = LC.normalize({ nodes: [{ id: 'a' }, { id: 'b' }] });
  LC.toggleLink(d, 'a', 'b', 'narcotics');
  LC.toggleLink(d, 'b', 'a');
  assert.strictEqual(d.links[1].flow, 'money', 'the line back carries the other flow');
});

test('two lines between cards that are not level never cross', () => {
  const cross = (p, q) => {
    const segs = (pts) => pts.slice(1).map((pt, i) => [pts[i], pt]);
    const hit = ([a, b], [c, d]) => {
      const o = (p1, p2, p3) => Math.sign((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]));
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    };
    return segs(p).some((s) => segs(q).some((t) => hit(s, t)));
  };
  for (const [bx, by] of [[400, 260], [400, -260], [-400, 260], [-400, -260], [120, 400], [-120, -400], [400, 60], [60, 400]]) {
    const c = LC.normalize({ mode: 'free', nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: bx, y: by }] });
    LC.toggleLink(c, 'a', 'b', 'narcotics'); LC.toggleLink(c, 'b', 'a');
    const L = LC.layout(c);
    const [p, q] = L.links.map((e) => LC.linkPath(e.link, e.a, e.b, e.offset).points);
    assert.ok(!cross(p, q), `cross at ${bx},${by}`);
    const end = (pts, box) => { const [x, y] = pts[pts.length - 1]; return x >= box.x - 0.5 && x <= box.x + box.w + 0.5 && y >= box.y - 0.5 && y <= box.y + box.h + 0.5; };
    assert.ok(end(p, L.boxes.get('b')) && end(q, L.boxes.get('a')), 'each arrow ends on its own card');
  }
});
