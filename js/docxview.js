/* CaseVault — Word (.docx) files, read without Word: a preview inside CaseVault, and conversion to
 * Markdown (to import a Word document as a template).
 *
 * parse() turns word/document.xml (plus word/numbering.xml, for numbered vs bulleted lists) into a
 * small model:
 *   { type: 'heading', level, runs } · { type: 'para', runs, list: { ordered, level } | null }
 *   { type: 'table', rows: [[ [blocks…] per cell ]] } · { type: 'break' } (page break)
 *   runs: [{ text, b, i, u }]
 * render() draws that model as plain, safe HTML (textContent only: nothing in a document can run).
 * toMarkdown() writes it as CaseVault Markdown.
 *
 * Pure logic except render(), so the tests run it under Node.
 */
'use strict';

(function (root) {
  const X = typeof module !== 'undefined' && module.exports ? require('./checker/xfa.js') : root.CVXfa;

  const els = (n) => (n && n.children ? n.children.filter((c) => typeof c !== 'string') : []);
  const kid = (n, local) => els(n).find((c) => c.local === local);
  const attr = (n, name) => (n && n.attrs ? (n.attrs[`w:${name}`] ?? n.attrs[name]) : undefined);
  const on = (n) => !!n && !/^(false|0|none)$/i.test(attr(n, 'val') || '');

  /** numId -> { level -> ordered? } from numbering.xml. */
  function readNumbering(xml) {
    const out = new Map();
    if (!xml) return out;
    const rootEl = els(X.parseXml(xml))[0];
    const abstract = new Map();
    for (const a of els(rootEl).filter((e) => e.local === 'abstractNum')) {
      const levels = new Map();
      for (const l of els(a).filter((e) => e.local === 'lvl')) {
        const fmt = attr(kid(l, 'numFmt'), 'val') || 'bullet';
        levels.set(Number(attr(l, 'ilvl') || 0), fmt !== 'bullet' && fmt !== 'none');
      }
      abstract.set(attr(a, 'abstractNumId'), levels);
    }
    for (const n of els(rootEl).filter((e) => e.local === 'num')) {
      out.set(attr(n, 'numId'), abstract.get(attr(kid(n, 'abstractNumId'), 'val')) || new Map());
    }
    return out;
  }

  function runsOf(p) {
    const runs = [];
    const walk = (node, fmt) => {
      for (const c of els(node)) {
        if (c.local === 'r') {
          const pr = kid(c, 'rPr');
          const f = { b: fmt.b || on(kid(pr, 'b')), i: fmt.i || on(kid(pr, 'i')), u: fmt.u || (!!kid(pr, 'u') && attr(kid(pr, 'u'), 'val') !== 'none') };
          for (const t of els(c)) {
            if (t.local === 't') runs.push({ text: t.children.filter((x) => typeof x === 'string').join(''), ...f });
            else if (t.local === 'tab') runs.push({ text: '\t', ...f });
            else if (t.local === 'br' && attr(t, 'type') !== 'page') runs.push({ text: '\n', ...f });
            else if (t.local === 'noBreakHyphen') runs.push({ text: '-', ...f });
          }
        } else if (c.local === 'del' || c.local === 'moveFrom' || c.local === 'pPr' || c.local === 'instrText') {
          // deleted text (tracked changes), paragraph settings, field codes: not shown
        } else {
          walk(c, fmt); // hyperlink, ins, smartTag, fldSimple, sdt/sdtContent…
        }
      }
    };
    walk(p, { b: false, i: false, u: false });
    // Merge neighbours with the same formatting.
    return runs.reduce((out, r) => {
      const last = out[out.length - 1];
      if (last && last.b === r.b && last.i === r.i && last.u === r.u) last.text += r.text;
      else out.push({ ...r });
      return out;
    }, []).filter((r) => r.text);
  }

  function blocksOf(container, numbering) {
    const out = [];
    for (const c of els(container)) {
      if (c.local === 'p') {
        const pr = kid(c, 'pPr');
        const style = String(attr(kid(pr, 'pStyle'), 'val') || '');
        const hasPageBreak = JSON.stringify(c).includes('"w:type":"page"');
        const runs = runsOf(c);
        const numPr = kid(pr, 'numPr');
        let heading = 0;
        const hm = /^(?:heading|berschrift|titre|titulo|kop)\s*(\d)$/i.exec(style.replace(/\s+/g, ''));
        if (hm) heading = Math.min(6, Number(hm[1]));
        else if (/^title$/i.test(style)) heading = 1;
        else if (/^subtitle$/i.test(style)) heading = 2;
        if (heading && runs.length) out.push({ type: 'heading', level: heading, runs });
        else if (numPr || /^list/i.test(style)) {
          const level = Number(attr(kid(numPr, 'ilvl'), 'val') || 0);
          const levels = numbering.get(attr(kid(numPr, 'numId'), 'val'));
          const ordered = levels ? !!levels.get(level) : /number/i.test(style);
          if (runs.length) out.push({ type: 'para', runs, list: { ordered, level } });
        } else out.push({ type: 'para', runs, list: null });
        if (hasPageBreak) out.push({ type: 'break' });
      } else if (c.local === 'tbl') {
        const rows = els(c).filter((r) => r.local === 'tr').map((tr) => els(tr).filter((tc) => tc.local === 'tc').map((tc) => blocksOf(tc, numbering)));
        out.push({ type: 'table', rows });
      } else if (c.local === 'sdt') {
        out.push(...blocksOf(kid(c, 'sdtContent'), numbering));
      }
    }
    return out;
  }

  /** document.xml (+ numbering.xml) -> blocks. Empty paragraphs are kept as spacing, trimmed at the ends. */
  function parse(documentXml, numberingXml = '') {
    const doc = els(X.parseXml(documentXml || ''))[0];
    const body = kid(doc, 'body');
    if (!body) return [];
    const blocks = blocksOf(body, readNumbering(numberingXml));
    while (blocks.length && blocks[0].type === 'para' && !blocks[0].runs.length) blocks.shift();
    while (blocks.length && blocks[blocks.length - 1].type === 'para' && !blocks[blocks.length - 1].runs.length) blocks.pop();
    return blocks;
  }

  const plain = (runs) => runs.map((r) => r.text).join('');

  /** Blocks -> CaseVault Markdown (# headings, **bold**, *italic*, - and 1. lists; tables as lines). */
  function toMarkdown(blocks) {
    const md = (runs) => runs.map((r) => {
      const t = r.text.replace(/\t/g, ' ').replace(/\n/g, '  \n');
      if (!t.trim()) return t;
      const lead = t.match(/^\s*/)[0];
      const trail = t.match(/\s*$/)[0];
      let core = t.trim();
      if (r.b && r.i) core = `***${core}***`;
      else if (r.b) core = `**${core}**`;
      else if (r.i) core = `*${core}*`;
      return lead + core + trail;
    }).join('');
    const out = [];
    let prevList = false;
    const counters = [];
    for (const b of blocks) {
      if (b.type === 'heading') { out.push('', `${'#'.repeat(b.level)} ${plain(b.runs).trim()}`, ''); prevList = false; continue; }
      if (b.type === 'break') { out.push('', '---', ''); prevList = false; continue; }
      if (b.type === 'table') {
        out.push('');
        for (const row of b.rows) out.push(row.map((cell) => cell.map((x) => (x.runs ? md(x.runs) : '')).join(' ').trim()).join(' | '));
        out.push('');
        prevList = false;
        continue;
      }
      if (b.list) {
        const lvl = b.list.level;
        counters.length = lvl + 1;
        counters[lvl] = (counters[lvl] || 0) + 1;
        if (!prevList) out.push('');
        out.push(`${'   '.repeat(lvl)}${b.list.ordered ? `${counters[lvl]}.` : '-'} ${md(b.runs).trim()}`);
        prevList = true;
        continue;
      }
      counters.length = 0;
      const text = md(b.runs).trim();
      if (prevList) out.push('');
      out.push(text, '');
      prevList = false;
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /** Blocks -> DOM, using only textContent (nothing in the document is treated as HTML). */
  function render(blocks, doc = root.document) {
    const el = (tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };
    const runsEl = (parent, runs) => {
      for (const r of runs) {
        let node = doc.createTextNode(r.text);
        if (r.u) { const u = el('u'); u.append(node); node = u; }
        if (r.i) { const i = el('em'); i.append(node); node = i; }
        if (r.b) { const s = el('strong'); s.append(node); node = s; }
        parent.append(node);
      }
      return parent;
    };
    const frag = el('div', 'docx-body');
    let list = null;
    for (const b of blocks) {
      if (b.list) {
        const tag = b.list.ordered ? 'ol' : 'ul';
        if (!list || list.tagName.toLowerCase() !== tag || list.dataset.level !== String(b.list.level)) {
          list = el(tag);
          list.dataset.level = String(b.list.level);
          list.style.marginLeft = `${b.list.level * 1.5}em`;
          frag.append(list);
        }
        list.append(runsEl(el('li'), b.runs));
        continue;
      }
      list = null;
      if (b.type === 'heading') frag.append(runsEl(el(`h${Math.min(6, b.level + 1)}`), b.runs));
      else if (b.type === 'break') frag.append(el('hr', 'docx-page-break'));
      else if (b.type === 'table') {
        const t = el('table', 'docx-table');
        for (const row of b.rows) {
          const tr = el('tr');
          for (const cell of row) {
            const td = el('td');
            td.append(render(cell, doc));
            tr.append(td);
          }
          t.append(tr);
        }
        frag.append(t);
      } else frag.append(b.runs.length ? runsEl(el('p'), b.runs) : el('p', 'docx-empty'));
    }
    return frag;
  }

  const api = { parse, toMarkdown, render, readNumbering, plain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVDocxView = api;
})(this);
