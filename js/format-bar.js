/* CaseVault — the formatting bar over Notes and Drafts: bold, italic, underline, heading,
 * bulleted and numbered lists, and tables. It writes the Markdown the preview and the Word export
 * understand (**bold**, *italic*, ++underline++, # heading, - item, 1. item, | a | b |), so the
 * text stays plain on the SSD. Ctrl+B, Ctrl+I and Ctrl+U work in the text too.
 *
 * The text edits (wrap, prefixLines, tableMarkdown) are plain functions the tests run under Node.
 */
'use strict';

(function (root) {
  /** Wrap the selection in a marker, or unwrap it when it already is: -> { text, start, end }. */
  function wrap(text, start, end, marker, placeholder = 'text') {
    const before = text.slice(0, start);
    const sel = text.slice(start, end);
    const after = text.slice(end);
    const n = marker.length;
    // Already wrapped, inside or around the selection: take the markers off.
    if (sel.length >= 2 * n && sel.startsWith(marker) && sel.endsWith(marker)) {
      const inner = sel.slice(n, -n);
      return { text: before + inner + after, start, end: start + inner.length };
    }
    if (before.endsWith(marker) && after.startsWith(marker)) {
      return { text: before.slice(0, -n) + sel + after.slice(n), start: start - n, end: end - n };
    }
    // Keep the spaces at the edges of the selection outside the markers ("**word** " not "**word **").
    const lead = sel.match(/^\s*/)[0];
    const trail = sel.slice(lead.length).match(/\s*$/)[0];
    const core = sel.slice(lead.length, sel.length - trail.length) || placeholder;
    const inserted = `${lead}${marker}${core}${marker}${trail}`;
    const s = start + lead.length + n;
    return { text: before + inserted + after, start: s, end: s + core.length };
  }

  /** Add (or take off) a prefix on every selected line: "# ", "- ", "1. ". */
  function prefixLines(text, start, end, kind) {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', Math.max(end - (end > start && text[end - 1] === '\n' ? 1 : 0), start));
    if (lineEnd < 0) lineEnd = text.length;
    const lines = text.slice(lineStart, lineEnd).split('\n');
    const RE = { heading: /^#{1,6}\s+/, bullet: /^\s*[-*+]\s+/, number: /^\s*\d+[.)]\s+/ }[kind];
    const all = lines.filter((l) => l.trim()).every((l) => RE.test(l));
    let k = 0;
    const out = lines.map((l) => {
      if (!l.trim()) return l;
      const bare = l.replace(/^#{1,6}\s+|^\s*[-*+]\s+|^\s*\d+[.)]\s+/, '');
      if (all) return bare;
      k += 1;
      return `${kind === 'heading' ? '## ' : kind === 'bullet' ? '- ' : `${k}. `}${bare}`;
    }).join('\n');
    return { text: text.slice(0, lineStart) + out + text.slice(lineEnd), start: lineStart, end: lineStart + out.length };
  }

  /** An empty table: a header row, the |---| line, and body rows. */
  function tableMarkdown(rows, cols) {
    const r = Math.max(1, Math.min(20, rows | 0));
    const c = Math.max(1, Math.min(10, cols | 0));
    const head = `| ${Array.from({ length: c }, (_, j) => `Column ${j + 1}`).join(' | ')} |`;
    const rule = `|${' --- |'.repeat(c)}`;
    const body = Array.from({ length: r - 1 }, () => `|${'   |'.repeat(c)}`);
    return [head, rule, ...body].join('\n');
  }

  /** Insert a table on its own lines at the cursor. */
  function insertTable(text, start, end, rows, cols) {
    const before = text.slice(0, start);
    const after = text.slice(end);
    const pre = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const post = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const t = tableMarkdown(rows, cols);
    const s = before.length + pre.length + 2; // on "Column 1"
    return { text: before + pre + t + post + after, start: s, end: s + 'Column 1'.length };
  }

  /* ---------------- the bar (browser only) ---------------- */

  // Replace the text through the browser's editing command, so Ctrl+Z undoes it.
  function apply(ta, r) {
    ta.focus();
    const oldText = ta.value;
    let a = 0;
    while (a < oldText.length && a < r.text.length && oldText[a] === r.text[a]) a++;
    let b = 0;
    while (b < oldText.length - a && b < r.text.length - a && oldText[oldText.length - 1 - b] === r.text[r.text.length - 1 - b]) b++;
    ta.setSelectionRange(a, oldText.length - b);
    const piece = r.text.slice(a, r.text.length - b);
    let ok = false;
    try { ok = root.document.execCommand('insertText', false, piece); } catch { ok = false; }
    if (!ok || ta.value !== r.text) { ta.value = r.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    ta.setSelectionRange(r.start, r.end);
  }

  function attach(ta, { h, icon }) {
    const act = (fn) => () => { if (ta.readOnly || ta.disabled) return; apply(ta, fn(ta.value, ta.selectionStart, ta.selectionEnd)); };
    const bold = act((t, s, e) => wrap(t, s, e, '**'));
    const italic = act((t, s, e) => wrap(t, s, e, '*'));
    const underline = act((t, s, e) => wrap(t, s, e, '++'));
    const btn = (ic, label, key, fn) => h('button', { type: 'button', class: 'fmt-btn', title: `${label}${key ? ` (${key})` : ''}`, onmousedown: (e) => e.preventDefault(), onclick: fn }, icon(ic), h('span', { class: 'sr-only' }, label));

    // Table: a grid to pick the size, like Word's.
    const grid = h('div', { class: 'fmt-grid', hidden: true, role: 'dialog', 'aria-label': 'Table size' });
    const gridLabel = h('div', { class: 'fmt-grid-label small' }, 'Table');
    const cellsEl = [];
    for (let r = 1; r <= 8; r++) {
      for (let c = 1; c <= 6; c++) {
        const cell = h('button', { type: 'button', class: 'fmt-cell', 'aria-label': `${r} rows by ${c} columns`, onmousedown: (e) => e.preventDefault(), onclick: () => { grid.hidden = true; if (!ta.readOnly) apply(ta, insertTable(ta.value, ta.selectionStart, ta.selectionEnd, r, c)); } });
        cell.addEventListener('mouseenter', () => { gridLabel.textContent = `${r} × ${c}`; for (const x of cellsEl) x.el.classList.toggle('on', x.r <= r && x.c <= c); });
        cellsEl.push({ el: cell, r, c });
      }
    }
    grid.append(gridLabel, h('div', { class: 'fmt-cells' }, cellsEl.map((x) => x.el)));
    const tableBtn = btn('table', 'Insert a table', '', () => { grid.hidden = !grid.hidden; gridLabel.textContent = 'Table'; });
    root.document.addEventListener('pointerdown', (e) => { if (!grid.hidden && !grid.contains(e.target) && !tableBtn.contains(e.target)) grid.hidden = true; });

    ta.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); bold(); } else if (k === 'i') { e.preventDefault(); italic(); } else if (k === 'u') { e.preventDefault(); underline(); }
    });

    return h('div', { class: 'fmt-bar', role: 'toolbar', 'aria-label': 'Formatting' },
      btn('type-bold', 'Bold', 'Ctrl+B', bold),
      btn('type-italic', 'Italic', 'Ctrl+I', italic),
      btn('type-underline', 'Underline', 'Ctrl+U', underline),
      h('span', { class: 'fmt-sep', 'aria-hidden': 'true' }),
      btn('type-h2', 'Heading', '', act((t, s, e) => prefixLines(t, s, e, 'heading'))),
      btn('list-ul', 'Bulleted list', '', act((t, s, e) => prefixLines(t, s, e, 'bullet'))),
      btn('list-ol', 'Numbered list', '', act((t, s, e) => prefixLines(t, s, e, 'number'))),
      h('span', { class: 'fmt-sep', 'aria-hidden': 'true' }),
      h('span', { class: 'fmt-table' }, tableBtn, grid));
  }

  const api = { wrap, prefixLines, tableMarkdown, insertTable, attach };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVFormatBar = api;
})(this);
