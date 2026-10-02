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
  for (const s of ['John Doe', 'Subject', 'Rick Roe', 'Courier', 'Telegram', 'icons/color/telegram.png', 'icons/color/phone.png', 'xMidYMid slice', 'Same subscriber', 'stroke-dasharray']) assert.ok(svg.includes(s), s);
  assert.ok(!/<script/i.test(LC.toSvg(LC.normalize({ nodes: [{ id: 'q', name: '<script>x</script>' }] })).svg), 'names are escaped');
});

test('long names fit the card', () => {
  assert.deepStrictEqual(LC.twoLines('Jonathan Alexander Doe-Example Junior', 122, 10.5).length, 2);
  assert.ok(LC.fit('https://example.com/a/very/long/path/that/goes/on', 122, 8.5).endsWith('…'));
});
