/* CaseVault — a tiny, safe Markdown previewer for notes.md.
 * Everything is HTML-escaped first, so nothing in a note can run as code.
 * Supports: # headings, **bold**, *italic*, `code`, ``` blocks, - / 1. lists, > quotes, --- rules.
 */
'use strict';

const Markdown = (() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
  }

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let list = null; // 'ul' | 'ol'
    let para = [];

    const flushPara = () => {
      if (para.length) out.push('<p>' + para.map(inline).join('<br>') + '</p>');
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

  return { render, escape: esc };
})();
