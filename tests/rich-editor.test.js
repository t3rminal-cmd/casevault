'use strict';
// Formatted editing (js/rich-editor.js): the formatted view turns back into the same Markdown.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/rich-editor.js');
const Markdown = require('../js/markdown.js');

// A tiny DOM-like tree, enough for toMarkdown.
const t = (text) => ({ nodeType: 3, nodeName: '#text', nodeValue: text, childNodes: [] });
const el = (tag, attrs, ...kids) => {
  const a = attrs || {};
  const n = { nodeType: 1, nodeName: tag.toUpperCase(), childNodes: kids.map((k) => (typeof k === 'string' ? t(k) : k)), getAttribute: (k) => (k in a ? a[k] : null) };
  n.textContent = (function text(x) { return x.nodeType === 3 ? x.nodeValue : x.childNodes.map(text).join(''); })(n);
  return n;
};
const body = (...kids) => el('div', null, ...kids);

test('bold, italic and underline become Markdown marks', () => {
  const md = R.toMarkdown(body(el('p', null, 'The ', el('b', null, 'subject'), ' was ', el('i', null, 'seen'), ' at ', el('u', null, 'noon'), '.')));
  assert.strictEqual(md, 'The **subject** was *seen* at ++noon++.');
});

test('spaces stay outside the marks; empty marks are dropped', () => {
  assert.strictEqual(R.toMarkdown(body(el('p', null, el('strong', null, 'word '), 'next', el('b', null, ' ')))), '**word** next ');
});

test('headings, lists, quotes, rules and paragraphs', () => {
  const md = R.toMarkdown(body(
    el('h2', null, 'SYNOPSIS'),
    el('p', null, 'First line', el('br'), 'second line'),
    el('ul', null, el('li', null, 'one'), el('li', null, el('b', null, 'two'))),
    el('ol', null, el('li', null, 'a'), el('li', null, 'b')),
    el('h3', null, 'DETAILS'),
    el('blockquote', null, 'quoted'),
    el('hr'),
  ));
  assert.strictEqual(md, '# SYNOPSIS\n\nFirst line\nsecond line\n\n- one\n- **two**\n\n1. a\n2. b\n\n## DETAILS\n\n> quoted\n\n---');
});

test('tables become Markdown tables, with | escaped', () => {
  const md = R.toMarkdown(body(el('table', null, el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', null, 'Weight'))),
    el('tbody', null, el('tr', null, el('td', null, 'Exhibit 1'), el('td', null, '28 g | net'))))));
  assert.strictEqual(md, '| Item | Weight |\n| --- | --- |\n| Exhibit 1 | 28 g \\| net |');
});

test('Word paste: styles count as bold/italic/underline; pictures, scripts and styles are dropped', () => {
  const md = R.toMarkdown(body(
    el('style', null, 'p { color: red }'),
    el('p', { class: 'MsoNormal' }, el('span', { style: 'font-weight:bold' }, 'Bold'), ' ', el('span', { style: 'font-style: italic' }, 'it'), ' ',
      el('span', { style: 'text-decoration: underline' }, 'u'), el('img', { src: 'x.png' }), el('script', null, 'alert(1)'), el('o:p', null)),
  ));
  assert.strictEqual(md, '**Bold** *it* ++u++');
});

test('new lines inside pasted text are spaces; in the editor they are line breaks', () => {
  const tree = () => body(el('p', null, 'one\ntwo'));
  assert.strictEqual(R.toMarkdown(tree()), 'one two');
  assert.strictEqual(R.toMarkdown(tree(), { editor: true }), 'one\ntwo');
});

test('text typed straight into the box (no paragraph) and Chrome divs', () => {
  assert.strictEqual(R.toMarkdown(body('Hello ', el('b', null, 'there'), el('div', null, 'next'), el('div', null, el('br')))), 'Hello **there**\n\nnext');
});

test('tabs are kept, and toHTML highlights [CONFIRM: ...] and keeps tabs', () => {
  assert.strictEqual(R.toMarkdown(body(el('p', null, '\tIndented'))), '\tIndented');
  const html = R.toHTML('\tIndented [CONFIRM: badge]\n\n**b**', Markdown.render);
  assert.match(html, /<p>\tIndented <mark class="confirm-mark">\[CONFIRM: badge\]<\/mark><\/p><p><strong>b<\/strong><\/p>/);
});

test('round trip: the Markdown from the formatting bar survives', () => {
  // The rendered HTML, read back through a tiny parser for the tags Markdown.render makes.
  const parse = (html) => {
    const rootNode = body();
    const stack = [rootNode];
    const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
    let m;
    const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    while ((m = re.exec(html))) {
      const top = stack[stack.length - 1];
      if (m[4]) top.childNodes.push(t(unesc(m[4])));
      else if (m[1]) stack.pop();
      else {
        const n = el(m[2], {});
        top.childNodes.push(n);
        if (!/^(br|hr)$/i.test(m[2])) stack.push(n);
      }
    }
    return rootNode;
  };
  const src = '# Report\n\nThe **subject** met ++SA Doe++ at *noon*.\n\n- one\n- two\n\n1. first\n2. second\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n\tIndented paragraph';
  const back = R.toMarkdown(parse(R.toHTML(src, Markdown.render)), { editor: true });
  assert.strictEqual(back, src);
});
