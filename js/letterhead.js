/* CaseVault — the department letterhead (v1.85).
 *
 * A clickable square for the department logo, and the Department Header to its right (up to four
 * lines: the department, the division or unit, an address and phone). It sits at the top of the
 * Draft tab (the Report), the Arrest details tab and the Link Chart tab, and goes across the top of
 * their PDFs. One letterhead for the whole vault: the logo is kept as CaseVault-Data\branding\logo.jpg
 * and the header text in the vault's settings. Nothing is built in: no agency's name or seal.
 * Uses the small UI kit app.js exposes as window.CaseVaultUI.
 */
'use strict';

(function (root) {
  let ui = null;
  const MAX_SIDE = 600;
  let cache = null; // { key, data: { jpeg, w, h } }

  const headerText = () => String(((Vault.data && Vault.data.settings && Vault.data.settings.letterhead) || {}).header || '');

  /** Any picture -> a JPEG (white behind transparent parts), at most 600 px on its longest side. */
  async function toJpeg(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k));
    cv.height = Math.max(1, Math.round(bmp.height * k));
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(bmp, 0, 0, cv.width, cv.height);
    if (bmp.close) bmp.close();
    return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be read.'))), 'image/jpeg', 0.92));
  }

  /** -> { header, logo: { jpeg, w, h } | null } for the PDF builders, or null when there is none. */
  async function forPdf() {
    const header = headerText().trim();
    let logo = null;
    try {
      const f = await Vault.readLetterheadLogo();
      if (f) {
        const key = `${f.size}:${f.lastModified}`;
        if (!cache || cache.key !== key) {
          const bmp = await createImageBitmap(f);
          cache = { key, data: { jpeg: new Uint8Array(await f.arrayBuffer()), w: bmp.width, h: bmp.height } };
          if (bmp.close) bmp.close();
        }
        logo = cache.data;
      }
    } catch { /* no logo */ }
    return header || logo ? { header, logo } : null;
  }

  /** The square and the header box, for the top of a tab. */
  function editor() {
    const { h, icon, toast, Save } = ui;
    const img = h('img', { alt: 'Department logo', hidden: true });
    const empty = h('span', { class: 'lh-empty' }, icon('image'), h('span', {}, 'Logo'));
    const pick = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp', hidden: true });
    const square = h('button', { class: 'lh-logo', type: 'button', title: 'Click to add the department logo (PNG or JPEG). It goes on the Report, Arrest Report and Link Chart PDFs.', onclick: () => pick.click() }, img, empty);
    const remove = h('button', { class: 'icon-btn lh-remove', type: 'button', title: 'Take the logo off', hidden: true, onclick: async () => {
      try {
        await Save.track('letterhead', () => Vault.deleteLetterheadLogo());
        cache = null;
        show(null);
        toast('Logo taken off the letterhead.', 'success');
      } catch { /* reported by Save */ }
    } }, icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove logo'));
    const show = (file) => {
      if (img.src) URL.revokeObjectURL(img.src);
      if (file) { img.src = URL.createObjectURL(file); img.hidden = false; empty.hidden = true; remove.hidden = false; square.classList.add('has-logo'); }
      else { img.removeAttribute('src'); img.hidden = true; empty.hidden = false; remove.hidden = true; square.classList.remove('has-logo'); }
    };
    pick.addEventListener('change', async () => {
      const f = pick.files && pick.files[0];
      pick.value = '';
      if (!f) return;
      try {
        const jpeg = await toJpeg(f);
        await Save.track('letterhead', () => Vault.saveLetterheadLogo(jpeg));
        cache = null;
        show(jpeg);
        toast('Logo added to the letterhead.', 'success');
      } catch (err) { toast(`The logo was not added: ${err.message}`, 'error'); }
    });
    Vault.readLetterheadLogo().then((f) => { if (f) show(f); }).catch(() => {});

    const text = h('textarea', { class: 'lh-text', rows: 3, maxlength: 400, spellcheck: 'false', placeholder: 'Department Header\nDivision or unit\nAddress · Phone', 'aria-label': 'Department Header' });
    text.value = headerText();
    let timer = null;
    text.addEventListener('input', () => {
      // Four lines at most.
      const lines = text.value.split('\n');
      if (lines.length > 4) { const at = text.selectionStart; text.value = lines.slice(0, 4).join('\n'); text.setSelectionRange(at, at); }
      clearTimeout(timer);
      timer = setTimeout(() => {
        Save.track('settings', () => Vault.updateSettings({ letterhead: { ...((Vault.data.settings || {}).letterhead || {}), header: text.value } })).catch(() => {});
      }, 600);
    });
    return h('div', { class: 'lh-editor', 'data-ro-ok': 'true' },
      h('div', { class: 'lh-square-wrap' }, square, remove, pick),
      h('label', { class: 'lh-header' }, h('span', { class: 'lh-label' }, 'Department Header'), text,
        h('span', { class: 'muted small' }, 'On the Report, Arrest Report and Link Chart PDFs. One letterhead for every case.')));
  }

  function init(kit) { ui = kit; }

  root.CVLetterhead = { init, editor, forPdf, toJpeg };
})(this);
