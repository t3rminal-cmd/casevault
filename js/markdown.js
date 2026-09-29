/* CaseVault — a tiny, safe Markdown previewer for notes.md.
 * Everything is HTML-escaped first, so nothing in a note can run as code.
 * Supports: # headings, **bold**, *italic*, ++underline++, `code`, ``` blocks, - / 1. lists,
 * > quotes, --- rules, and | tables | (a header row, then a |---| line).
 */
'use strict';

const Markdown = (() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\+\+([^+\n]+)\+\+/g, '<u>$1</u>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
  }

  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isRule = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  /** "| a | b\\|c |" -> ["a", "b|c"] */
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let list = null; // 'ul' | 'ol'
    let para = [];

    const flushPara = () => {
      // A tab at the start of a line indents it (Tab in Notes and Drafts).
      if (para.length) out.push('<p>' + para.map((l) => inline(l.replace(/^\t+/, (t) => '\u2003\u2003'.repeat(t.length)))).join('<br>') + '</p>');
      para = [];
    };
    const closeList = () => {
      if (list) out.push(`</${list}>`);
      list = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^```/.test(line)) {
        flushPara(); closeList();
        const code = [];
        while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
        out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }

      let m;
      if (!line.trim()) { flushPara(); closeList(); continue; }
      // | a | b |  followed by  |---|---|  starts a table.
      if (isRow(line) && i + 1 < lines.length && isRule(lines[i + 1])) {
        flushPara(); closeList();
        const head = cells(line);
        const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
        const body = [];
        i += 1;
        while (i + 1 < lines.length && isRow(lines[i + 1])) body.push(cells(lines[++i]));
        const td = (tag, c, j) => `<${tag}${align[j] ? ` class="al-${align[j]}"` : ''}>${inline(c)}</${tag}>`;
        out.push(`<div class="md-table-wrap"><table class="md-table"><thead><tr>${head.map((c, j) => td('th', c, j)).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${head.map((_, j) => td('td', r[j] || '', j)).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        flushPara(); closeList();
        const level = Math.min(m[1].length + 1, 6); // h1 in notes renders as h2 on the page
        out.push(`<h${level}>${inline(m[2])}</h${level}>`);
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); closeList(); out.push('<hr>'); continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      if ((m = line.match(/^\s*[-*+]\s+(\[( |x|X)\]\s+)?(.*)$/))) {
        flushPara();
        if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
        const box = m[1] ? (m[2].trim() ? '☑ ' : '☐ ') : '';
        out.push(`<li>${box}${inline(m[3])}</li>`);
        continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
        out.push(`<li>${inline(m[1])}</li>`);
        continue;
      }
      closeList();
      para.push(line);
    }
    flushPara(); closeList();
    return out.join('\n');
  }

  return { render, escape: esc, cells, isRow, isRule };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Markdown;
