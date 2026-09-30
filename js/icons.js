/* CaseVault — icons. Draws Bootstrap Icons (js/icons-data.js) as inline SVG, so they follow the
 * text color and work offline under the Content-Security-Policy.
 *
 *   CVIcons.icon('folder')                    decorative (hidden from screen readers)
 *   CVIcons.icon('trash3', { label: 'Delete' }) announced as "Delete"
 *   <button data-icon="gear">Vault</button>  in index.html: the icon is added after the words at startup
 */
'use strict';

(function (root) {
  const NS = 'http://www.w3.org/2000/svg';

  function icon(name, { label = '', size = null, cls = '' } = {}) {
    const doc = root.document;
    const data = (root.CVIconData || {})[name];
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', `bi${cls ? ` ${cls}` : ''}`);
    svg.dataset.icon = name;
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('focusable', 'false');
    if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of data || []) {
      const el = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.append(el);
    }
    return svg;
  }

  /** Put the icon named in data-icon after each element's text (index.html's static buttons). */
  function decorate(scope = root.document) {
    for (const el of scope.querySelectorAll('[data-icon]')) {
      if (el.querySelector(':scope > svg')) continue;
      if (el.childNodes.length) el.append(' ');
      el.append(icon(el.dataset.icon)); // on the right of the words (v1.21)
    }
  }

  const has = (name) => !!(root.CVIconData || {})[name];

  root.CVIcons = { icon, decorate, has };
})(this);
