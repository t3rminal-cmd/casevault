/* CaseVault — small building blocks shared by the screens (v1.151).
 *
 * cancelRow(h, onCancel, ...buttons): the row at the bottom of a dialog, a Cancel button first and
 * then the others (Save, Delete…). It was written out the same way in some twenty places.
 * loadScripts(list): load parts of the app that are rarely used (Discovery, Link Chart) on first use.
 */
'use strict';

(function (root) {
  function cancelRow(h, onCancel, ...buttons) {
    return h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: onCancel }, 'Cancel'), ...buttons);
  }
  /** v1.151: load scripts when first needed (in this order, each once) instead of at start-up.
   * They are in the offline cache like every other file, so this works with no network. */
  const loading = new Map();
  function loadScript(src) {
    if (!loading.has(src)) {
      loading.set(src, new Promise((resolve, reject) => {
        const s = root.document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { loading.delete(src); reject(new Error(`Could not load ${src}`)); };
        root.document.head.append(s);
      }));
    }
    return loading.get(src);
  }
  async function loadScripts(list) { for (const src of list) await loadScript(src); }
  root.CVKit = { cancelRow, loadScripts };
})(this);
