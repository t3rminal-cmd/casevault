/* CaseVault — formatted editing for reports and notes (v1.19): bold shows bold, underline shows
 * underlined, headings, lists and tables look like they will in Word, with no ** or ++ on screen.
 *
 * The text on the SSD stays the same Markdown as before (so the Word export, templates, the AI,
 * checks and [CONFIRM: ...] all work unchanged). The formatted view is a box you can type in
 * (contenteditable) laid over the hidden text box: what you type there is turned back into
 * Markdown and put into the text box, and when something else changes the text box (Draft with
 * AI, Insert from Ask AI), the formatted view is drawn again from it. "Markdown" shows the plain
 * text, as before.
 *
 * Pasting from Word keeps bold, italic, underline, headings, lists and tables, and nothing else
 * (no fonts, colours, pictures or scripts). Copying from the formatted view pastes into Word with
 * its formatting.
 *
 * toMarkdown() reads any DOM-like tree (nodeType, nodeName, childNodes, nodeValue, getAttribute),
 * so the tests run it under Node.
 */
'use strict';

(function (root) {
  const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'TITLE', 'HEAD', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'NOSCRIPT', 'XML']);
  const kids = (n) => Array.from(n.childNodes || []);
  const name = (n) => String(n.nodeName || '').toUpperCase().replace(/^.*:/, ''); // o:p → P
  const style = (n) => (n.getAttribute && (n.getAttribute('style') || n.getAttribute('data-cv-style'))) || '';
  const isBlock = (n) => n.nodeType === 1 && BLOCKS.has(name(n));

  // Word's pasted HTML marks bold/italic/underline with styles as often as with tags.
  function marks(n) {
    const tag = name(n);
    const s = style(n).toLowerCase();
    return {
      b: tag === 'B' || tag === 'STRONG' || /font-weight\s*:\s*(bold|[6-9]00)/.test(s),
      i: tag === 'I' || tag === 'EM' || /font-style\s*:\s*italic/.test(s),
      u: tag === 'U' || tag === 'INS' || /text-decoration[^;]*underline/.test(s),
      code: tag === 'CODE' || tag === 'KBD' || tag === 'SAMP',
    };
  }

  // Wrap text in a marker, keeping the spaces at its edges outside ("**word** ", not "**word **").
  function wrapIn(text, marker) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (!m[2]) return text;
    // Bold across a line break: mark each line, as the Markdown needs.
    return m[1] + m[2].split('\n').map((l) => (l.trim() ? `${marker}${l}${marker}` : l)).join('\n') + m[3];
  }

  /** The inline text of a node: **bold**, *italic*, ++underline++, `code`; <br> is a new line. */
  let keepNewlines = false; // the editor's own text: a new line is a new line; pasted HTML: a space
  function inline(n) {
    if (n.nodeType === 3) { const t = String(n.nodeValue || '').replace(/\u00a0/g, ' '); return keepNewlines ? t.replace(/\r\n?/g, '\n') : t.replace(/\s*\r?\n\s*/g, ' '); }
    if (n.nodeType !== 1) return '';
    const tag = name(n);
    if (SKIP.has(tag)) return '';
    if (tag === 'BR') return '\n';
    let s = kids(n).map((k) => (isBlock(k) ? `${inline(k)}\n` : inline(k))).join('');
    if (isBlock(n)) s = s.replace(/\n$/, '');
    const m = marks(n);
    if (m.code) return s.trim() ? `\`${s.replace(/`/g, "'")}\`` : s;
    // Markers already inside (a <b> in a <b>) aren't doubled.
    if (m.u && !/^\s*\+\+[\s\S]*\+\+\s*$/.test(s)) s = wrapIn(s, '++');
    if (m.i && !m.b) s = wrapIn(s, '*');
    if (m.b && !/^\s*\*\*[\s\S]*\*\*\s*$/.test(s)) s = wrapIn(s, m.i ? '***' : '**');
    return s;
  }
  // Tidy runs that Chrome splits: "**a****b**" → "**ab**".
  const tidy = (s) => s.replace(/\*\*\*\*/g, '').replace(/\+\+\+\+/g, '');

  const cellText = (n) => tidy(inline(n)).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();

  /** Blocks of Markdown from the children of a node. */
  function blocks(n, out) {
    let para = [];
    const flush = () => {
      const t = tidy(para.map(inline).join(''));
      para = [];
      if (t.replace(/\n/g, '').trim()) out.push(t.replace(/^\n+|\n+$/g, ''));
    };
    for (const k of kids(n)) {
      if (k.nodeType === 1 && SKIP.has(name(k))) continue;
      if (!isBlock(k)) { para.push(k); continue; }
      flush();
      const tag = name(k);
      if (/^H[1-6]$/.test(tag)) {
        const t = cellText(k);
        if (t) out.push(`${'#'.repeat(Math.max(1, Number(tag[1]) - 1))} ${t.replace(/\\\|/g, '|')}`);
      } else if (tag === 'UL' || tag === 'OL') {
        let i = 0;
        const items = [];
        const walk = (list, depth) => {
          for (const li of kids(list)) {
            if (li.nodeType !== 1) continue;
            if (name(li) === 'UL' || name(li) === 'OL') { walk(li, depth + 1); continue; }
            const nested = kids(li).filter((x) => x.nodeType === 1 && (name(x) === 'UL' || name(x) === 'OL'));
            const own = { nodeType: 1, nodeName: 'SPAN', childNodes: kids(li).filter((x) => !nested.includes(x)) };
            const t = tidy(inline(own)).replace(/\n+/g, ' ').trim();
            if (t) { i += 1; items.push(`${'\t'.repeat(depth)}${tag === 'OL' ? `${i}.` : '-'} ${t}`); }
            for (const x of nested) walk(x, depth + 1);
          }
        };
        walk(k, 0);
        if (items.length) out.push(items.join('\n'));
      } else if (tag === 'BLOCKQUOTE') {
        const inner = [];
        blocks(k, inner);
        if (inner.length) out.push(inner.join('\n\n').split('\n').map((l) => `> ${l}`).join('\n'));
      } else if (tag === 'PRE') {
        out.push(`\`\`\`\n${String(k.textContent != null ? k.textContent : inline(k)).replace(/\n$/, '')}\n\`\`\``);
      } else if (tag === 'HR') {
        out.push('---');
      } else if (tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT' || tag === 'TR') {
        const rows = [];
        const collect = (x) => { for (const r of kids(x)) { if (r.nodeType !== 1) continue; if (name(r) === 'TR') rows.push(r); else if (/^(THEAD|TBODY|TFOOT)$/.test(name(r))) collect(r); } };
        if (tag === 'TR') rows.push(k); else collect(k);
        const cells = rows.map((r) => kids(r).filter((c) => c.nodeType === 1 && (name(c) === 'TD' || name(c) === 'TH')).map(cellText)).filter((r) => r.length);
        if (cells.length) {
          const w = Math.max(...cells.map((r) => r.length));
          const line = (r) => `| ${Array.from({ length: w }, (_, j) => r[j] || '').join(' | ')} |`;
          out.push([line(cells[0]), `|${' --- |'.repeat(w)}`, ...cells.slice(1).map(line)].join('\n'));
        }
      } else {
        // P, DIV, LI out of a list…: a paragraph, or a container of blocks.
        if (kids(k).some(isBlock)) blocks(k, out);
        else { para.push(k); flush(); }
      }
    }
    flush();
    return out;
  }

  /** Markdown from a formatted (DOM) tree. */
  function toMarkdown(node, { editor = false } = {}) {
    keepNewlines = editor;
    try { return blocks(node, []).join('\n\n'); } finally { keepNewlines = false; }
  }

  /** The formatted view's HTML for Markdown text: the preview's (everything escaped), with tabs
   * kept as tabs and every [CONFIRM: ...] highlighted, as in the Word export. */
  function toHTML(md, render) {
    return render(String(md || ''))
      .replace(/\u2003\u2003/g, '\t')
      .replace(/>\n</g, '><')
      .replace(/\[CONFIRM:[^\]<]*\]/g, (m) => `<mark class="confirm-mark">${m}</mark>`);
  }

  /* ---------------- the editor (browser only) ---------------- */

  const MODE_KEY = 'cv.editMode';
  const readMode = () => { try { return root.localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'rich'; } catch { return 'rich'; } };
  const writeMode = (m) => { try { root.localStorage.setItem(MODE_KEY, m); } catch { /* per-PC preference only */ } };

  /**
   * Formatted editing over a textarea. -> { el, toggle, mode(), setMode(m), active(), exec(cmd),
   * heading(), table(r, c), indent(out), insertMarkdown(md), selectionText(), replaceSelection(md),
   * selectText(text, nth), focus(), render() }. Put `el` next to the textarea and `toggle` in the
   * toolbar.
   */
  function create(ta, { h, icon, label = 'Text' }) {
    const doc = root.document;
    const el = h('div', { class: `rich-editor ${ta.className.split(/\s+/).filter(Boolean).map((c) => `${c}-rich`).join(' ')}`, contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, spellcheck: 'true', 'data-placeholder': 'Write here. Use the bar above for bold, headings, lists and tables.' });
    el.cvRich = null;
    // js/markdown.js declares a global const, which isn't a property of window.
    const R = () => (typeof Markdown !== 'undefined' ? Markdown : root.Markdown); // eslint-disable-line no-undef
    let mode = readMode();
    let dirty = false;
    let syncing = false;
    let renderTimer = null;
    let savedRange = null;

    // Reading ta.value always gives what is on screen: pending formatted edits are written first.
    const desc = Object.getOwnPropertyDescriptor(root.HTMLTextAreaElement.prototype, 'value');
    Object.defineProperty(ta, 'value', {
      configurable: true,
      get() { if (dirty) flush(); return desc.get.call(ta); },
      set(v) { desc.set.call(ta, v); if (!syncing && mode === 'rich') scheduleRender(); },
    });

    function flush() {
      if (!dirty) return;
      dirty = false;
      const md = toMarkdown(el, { editor: true });
      if (md === desc.get.call(ta)) return;
      syncing = true;
      try {
        desc.set.call(ta, md);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } finally { syncing = false; }
    }

    function render() {
      clearTimeout(renderTimer);
      renderTimer = null;
      dirty = false;
      el.innerHTML = toHTML(desc.get.call(ta), R().render); // Markdown.render escapes everything
      el.classList.toggle('empty', !desc.get.call(ta).trim());
    }
    function scheduleRender() {
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
        render();
        if (atEnd) el.scrollTop = el.scrollHeight; // follows Draft with AI as it writes
      }, 60);
    }

    el.addEventListener('input', () => changed());
    el.addEventListener('blur', flush);
    // Something else changed the text (a Markdown-mode edit, Insert from Ask AI…): draw it again.
    ta.addEventListener('input', () => { if (!syncing && mode === 'rich' && !dirty) scheduleRender(); });

    // Remember where the cursor was, for the buttons and for Re-phrase after a dialog.
    doc.addEventListener('selectionchange', () => {
      const sel = doc.getSelection();
      if (sel && sel.rangeCount && el.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
    });
    // Back to where the cursor was, unless it's already in the text (a button or dialog took focus).
    function restore() {
      const sel = doc.getSelection();
      const inside = sel.rangeCount && el.contains(sel.anchorNode);
      el.focus({ preventScroll: true });
      if (!inside && savedRange && el.contains(savedRange.startContainer)) { sel.removeAllRanges(); sel.addRange(savedRange); }
    }
    function currentRange() {
      restore();
      const sel = doc.getSelection();
      if (sel.rangeCount && el.contains(sel.anchorNode)) return sel.getRangeAt(0);
      const r = doc.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      return r;
    }
    function changed() {
      el.classList.toggle('empty', !el.textContent.trim() && !el.querySelector('li, table, hr'));
      dirty = true;
      clearTimeout(el.cvFlushTimer);
      el.cvFlushTimer = setTimeout(flush, 150);
    }
    const cmd = (c, v = null) => { try { doc.execCommand(c, false, v); } catch { /* old browser */ } };

    // Paste: keep bold, italic, underline, headings, lists and tables (from Word too), drop the rest.
    el.addEventListener('paste', (e) => {
      if (ta.readOnly) { e.preventDefault(); return; }
      const cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const html = cd.getData('text/html');
      let md;
      if (html) {
        // Inert: nothing runs. Word's style="…" attributes are renamed first, so the page's
        // Content Security Policy has nothing to refuse; marks() still reads them.
        const safe = html.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' data-cv-style=$1');
        const parsed = new root.DOMParser().parseFromString(safe, 'text/html');
        md = toMarkdown(parsed.body);
      } else md = cd.getData('text/plain');
      insertMarkdown(md);
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if (ta.readOnly) return;
      const t = e.dataTransfer && e.dataTransfer.getData('text/plain');
      if (t) insertMarkdown(t);
    });

    /** Put Markdown in at the cursor, formatted. */
    // It goes into the Markdown where a marker was put at the cursor, and the view is drawn again
    // with the cursor just after it. (The browser's own insertHTML nests blocks inside lines and
    // adds inline styles, which the Content Security Policy refuses.)
    const AT = '\uE000'; const CARET = '\uE001';
    function insertMarkdown(md) {
      const text = String(md || '').replace(/\r\n?/g, '\n').replace(/[\uE000\uE001]/g, '');
      if (!text.trim() || ta.readOnly) return;
      const block = /\n/.test(text.trim()) || /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|---)/.test(text);
      const range = currentRange();
      range.deleteContents();
      const at = doc.createTextNode(AT);
      range.insertNode(at);
      // Blocks (a table, a list, paragraphs) don't go inside bold or underlined text: the marker
      // moves out, after the formatting it was in.
      if (block) {
        while (at.parentNode && at.parentNode !== el && !isBlock(at.parentNode)) {
          const up = at.parentNode;
          up.parentNode.insertBefore(at, up.nextSibling);
          if (!up.textContent) up.remove();
        }
      }
      const cur = toMarkdown(el, { editor: true });
      const i = cur.indexOf(AT);
      let next = i < 0 ? `${cur}\n\n${text.trim()}\n\n${CARET}` : cur.slice(0, i) + (block ? `\n\n${text.trim()}\n\n${CARET}` : text + CARET) + cur.slice(i + 1);
      if (block) next = next.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
      const md2 = next.replace(CARET, '').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
      dirty = false;
      syncing = true;
      try {
        desc.set.call(ta, md2);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } finally { syncing = false; }
      clearTimeout(renderTimer); renderTimer = null;
      el.innerHTML = toHTML(next, R().render);
      el.classList.remove('empty');
      placeCaret(); // the cursor where the marker is; the marker itself goes
    }

    /** Draw the view again from its Markdown, keeping the cursor: after a heading or list command
     * the browser can leave odd nesting (a list inside a paragraph); this tidies it. */
    function normalize() {
      const sel = doc.getSelection();
      if (!(sel.rangeCount && el.contains(sel.anchorNode))) { flush(); render(); return; }
      const r = sel.getRangeAt(0);
      r.collapse(false);
      const mark = doc.createTextNode(CARET);
      r.insertNode(mark);
      const next = toMarkdown(el, { editor: true });
      mark.remove();
      el.innerHTML = toHTML(next, R().render);
      placeCaret();
      const md2 = next.replace(CARET, '');
      dirty = false;
      if (md2 !== desc.get.call(ta)) {
        syncing = true;
        try { desc.set.call(ta, md2); ta.dispatchEvent(new Event('input', { bubbles: true })); } finally { syncing = false; }
      }
    }
    function placeCaret() {
      const w = doc.createTreeWalker(el, 4);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const k = n.nodeValue.indexOf(CARET);
        if (k < 0) continue;
        n.nodeValue = n.nodeValue.replace(CARET, '');
        const r = doc.createRange();
        const parent = n.parentNode;
        if (!n.nodeValue && parent && !parent.textContent) { const br = doc.createElement('br'); parent.append(br); r.setStartBefore(br); } else r.setStart(n, k);
        r.collapse(true);
        const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        savedRange = r.cloneRange();
        return;
      }
    }

    // Plain text at the cursor, without the browser's styled spans (a tab, for instance).
    function insertText(t) {
      const range = currentRange();
      range.deleteContents();
      const node = doc.createTextNode(t);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      changed();
    }

    // Tab indents (a tab at the cursor); Shift+Tab takes one off the start of the line.
    let leaving = false;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { leaving = true; return; }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^[biu]$/i.test(e.key)) {
        // Bold/italic/underline as tags (not styles), so they turn back into Markdown.
        e.preventDefault();
        exec({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
        return;
      }
      if (e.key !== 'Tab') { leaving = false; return; }
      if (leaving || e.ctrlKey || e.altKey || e.metaKey || ta.readOnly) { leaving = false; return; }
      e.preventDefault();
      indent(e.shiftKey);
    });

    function indent(out) {
      if (!out) { insertText('\t'); return; }
      restore();
      const sel = doc.getSelection();
      let block = sel.anchorNode;
      while (block && block !== el && !(block.nodeType === 1 && BLOCKS.has(block.nodeName))) block = block.parentNode;
      if (!block || block === el) block = el;
      const w = doc.createTreeWalker(block, 4);
      const first = w.nextNode();
      if (first && /^(\t| {1,4})/.test(first.nodeValue)) {
        first.nodeValue = first.nodeValue.replace(/^(\t| {1,4})/, '');
        changed();
      }
    }

    function exec(c) {
      if (ta.readOnly) return;
      restore();
      // Headings are bold already; the browser would "un-bold" them with a style the CSP refuses.
      if (c === 'bold' && currentBlockTag()) return;
      cmd('styleWithCSS', false);
      cmd(c);
      dirty = true;
      if (/List$/.test(c)) normalize(); else flush();
    }

    function currentBlockTag() {
      const sel = doc.getSelection();
      let n = sel && sel.anchorNode;
      while (n && n !== el) { if (n.nodeType === 1 && /^H[1-6]$/.test(n.nodeName)) return n.nodeName; n = n.parentNode; }
      return '';
    }
    function heading() {
      if (ta.readOnly) return;
      restore();
      cmd('formatBlock', currentBlockTag() ? 'p' : 'h3');
      dirty = true;
      normalize();
    }
    function table(rows, cols) {
      if (ta.readOnly) return;
      insertMarkdown(root.CVFormatBar ? root.CVFormatBar.tableMarkdown(rows, cols) : '');
    }

    function selectionText() {
      const sel = doc.getSelection();
      if (sel && sel.rangeCount && el.contains(sel.anchorNode) && !sel.isCollapsed) return sel.toString();
      if (savedRange && !savedRange.collapsed && el.contains(savedRange.startContainer)) return savedRange.toString();
      return '';
    }
    function replaceSelection(md) { insertMarkdown(md); }

    /** Select the nth (0-based) occurrence of a piece of text, e.g. a [CONFIRM: ...]. */
    function selectText(text, nth = 0) {
      const w = doc.createTreeWalker(el, 4);
      const nodes = [];
      let all = '';
      for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push([n, all.length]); all += n.nodeValue; }
      let at = -1;
      for (let i = 0; i <= nth; i++) { at = all.indexOf(text, at + 1); if (at < 0) return false; }
      const find = (pos) => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i][1] <= pos) return [nodes[i][0], pos - nodes[i][1]]; return null; };
      const a = find(at); const b = find(at + text.length);
      if (!a || !b) return false;
      const r = doc.createRange();
      r.setStart(a[0], a[1]);
      r.setEnd(b[0], Math.min(b[1], b[0].nodeValue.length));
      el.focus();
      const sel = doc.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      savedRange = r.cloneRange();
      const box = r.getBoundingClientRect(); const view = el.getBoundingClientRect();
      if (box.top < view.top || box.bottom > view.bottom) el.scrollTop += box.top - view.top - el.clientHeight / 3;
      return true;
    }

    // ---- Formatted | Markdown
    const bFmt = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', title: 'See and edit the text as it will look in Word: bold, underline, headings, lists and tables.' }, 'Formatted');
    const bMd = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', title: 'The plain text with its Markdown marks (**bold**, ++underline++, # heading). AI suggestions work here.' }, 'Markdown');
    const toggle = h('div', { class: 'segmented edit-mode', role: 'group', 'aria-label': 'How to show the text' }, bFmt, bMd);
    const listeners = [];
    function setMode(m, focus = false) {
      flush();
      mode = m === 'markdown' ? 'markdown' : 'rich';
      writeMode(mode);
      if (mode === 'rich') render();
      el.hidden = mode !== 'rich';
      ta.hidden = mode === 'rich';
      bFmt.classList.toggle('active', mode === 'rich');
      bMd.classList.toggle('active', mode !== 'rich');
      bFmt.setAttribute('aria-pressed', String(mode === 'rich'));
      bMd.setAttribute('aria-pressed', String(mode !== 'rich'));
      for (const fn of listeners) fn(mode);
      if (focus) (mode === 'rich' ? el : ta).focus();
    }
    bFmt.addEventListener('click', () => setMode('rich', true));
    bMd.addEventListener('click', () => setMode('markdown', true));

    // Read-only follows the textarea (while Draft with AI writes, and for archived cases).
    new root.MutationObserver(() => { el.contentEditable = ta.readOnly || ta.disabled ? 'false' : 'true'; })
      .observe(ta, { attributes: true, attributeFilter: ['readonly', 'disabled'] });
    el.contentEditable = ta.readOnly || ta.disabled ? 'false' : 'true';

    const api = {
      el, ta, toggle, render, flush, exec, heading, table, indent, insertMarkdown, selectionText, replaceSelection, selectText,
      mode: () => mode, active: () => mode === 'rich' && !el.hidden, setMode,
      onMode: (fn) => listeners.push(fn),
      focus: () => (mode === 'rich' ? el : ta).focus(),
    };
    el.cvRich = api;
    ta.cvRich = api;
    setMode(mode);
    return api;
  }

  /** The text as HTML for the clipboard, so it pastes into Word formatted. */
  function clipboardHTML(md, render) {
    return `<html><body>${render(String(md || '')).replace(/\u2003/g, '&emsp;')}</body></html>`;
  }

  const api = { toMarkdown, toHTML, create, clipboardHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVRichEditor = api;
})(this);
