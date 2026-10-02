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

  /* v1.51: CaseVault's colour icons (icons/color/*.png, 96 px, cut from the artwork provided for the app).
   * An icon with a colour version draws the picture; its plain one-colour shape stays in the same
   * <svg> underneath, for places that need a single colour (white on a blue button, the Overview
   * banner): app.css shows one or the other. Names without a Bootstrap shape are colour only. */
  const COLOR = {
    'trash3': 'trash', 'archive': 'archive-box', 'hourglass-split': 'hourglass', 'geo-alt': 'pin', 'geo': 'pin',
    'calculator': 'calculator', 'calculator-fill': 'calculator', 'fingerprint': 'fingerprint', 'map': 'map',
    'telephone': 'phone', 'currency-bitcoin': 'crypto', 'image': 'image', 'file-earmark-image': 'image',
    'google': 'google', 'snapchat': 'snapchat', 'meta': 'meta', 'send': 'send', 'telegram': 'telegram',
    'calendar-event': 'calendar', 'calendar-check': 'calendar', 'tools': 'tools', 'paperclip': 'paperclip',
    'bell-fill': 'bell', 'skull-crossbones': 'skull', 'lightning-charge': 'lightning', 'link-45deg': 'chain',
    'globe2': 'globe', 'globe-americas': 'globe', 'stars': 'sparkles', 'magic': 'sparkles',
    'hdd': 'drive', 'hdd-fill': 'drive', 'usb-drive': 'drive', 'chat-dots-fill': 'chat', 'chat-left-text': 'chat',
    'journal-text': 'notebook', 'circle-half': 'theme', 'gear': 'gear', 'bug': 'bug', 'lock-fill': 'lock', 'unlock': 'unlock',
    'house-door': 'home', 'safe2': 'safe', 'bookshelf': 'bookshelf', 'book': 'book', 'person-badge': 'id-card', 'person-vcard': 'id-card',
    'x-circle': 'x-circle', 'envelope': 'envelope', 'envelope-at': 'envelope', 'envelope-paper': 'envelope',
    'upload': 'cloud-upload', 'box-arrow-up-right': 'external', 'floppy': 'floppy', 'save': 'floppy',
    'folder': 'folder-purple', 'folder2': 'folder-purple', 'folder2-open': 'folder-purple', 'folder-fill': 'folder-yellow', 'op-folder': 'folder-blue',
    'capsule-pill': 'cannabis', 'cash-coin': 'money', 'bank2': 'scales', 'diagram-3-fill': 'link-nodes', 'sliders2': 'wrench',
    'shield-check': 'shield-person', 'bullseye': 'target',
    // colour only
    'folder-closed': 'folder-green', 'folder-archived': 'folder-dark', 'link-chart': 'doc-network', 'target': 'target', 'shield-person': 'shield-person',
    'badge-dea': 'badge-dea', 'badge-fbi': 'badge-fbi', 'badge-atf': 'badge-atf', 'badge-usms': 'badge-usms', 'badge-irs': 'badge-irs',
    'badge-cbp': 'badge-cbp', 'badge-hsi': 'badge-hsi', 'badge-ice': 'badge-ice', 'badge-usss': 'badge-usss', 'badge-uspis': 'badge-uspis',
    'badge-state-pd': 'badge-state-pd', 'badge-local-pd': 'badge-local-pd', 'badge-sheriff': 'badge-sheriff',
  };
  const colorUrl = (name) => (COLOR[name] ? `icons/color/${COLOR[name]}.png` : '');

  function icon(name, { label = '', size = null, cls = '' } = {}) {
    const doc = root.document;
    const data = (root.CVIconData || {})[name];
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    const color = colorUrl(name);
    svg.setAttribute('class', `bi${color ? ' ci' : ''}${color && !data ? ' ci-only' : ''}${cls ? ` ${cls}` : ''}`);
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
    if (color) {
      const im = doc.createElementNS(NS, 'image');
      im.setAttribute('href', color);
      im.setAttribute('width', '16');
      im.setAttribute('height', '16');
      im.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.append(im);
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

  const has = (name) => !!((root.CVIconData || {})[name] || COLOR[name]);

  root.CVIcons = { icon, decorate, has, colorUrl, COLOR };
})(this);
