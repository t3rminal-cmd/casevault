/* CaseVault — a PDF viewer inside the app (v1.25), for the Supplementary Report.
 *
 * The browser's own PDF viewer, shown in a frame, sizes itself and its scroll bar by the browser's
 * rules, and on some screens and zoom levels the bottom of the last page (the signatures) couldn't
 * be reached. This one draws the pages with the bundled pdf.js into our own scrolling area, so the
 * whole report can always be scrolled to, with zoom buttons and the zoom in percent (starts at
 * 100%), Fit Width, Print and Download.
 *
 * Where pdf.js can't load (the file:// copy on the SSD), the browser's viewer is used as before.
 */
'use strict';

(function (root) {
  const STEPS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];
  const PT = 96 / 72; // 100% = the page's real size on screen

  /** The viewer element. opts: { h, icon, title, fileName }. Call .destroy() when it closes. */
  function create(bytes, opts) {
    const { h, icon } = opts;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    let zoom = 100;
    let doc = null;
    let task = null;
    let renderId = 0;
    const pages = h('div', { class: 'pv-pages', tabindex: 0, 'aria-label': `${opts.title || 'PDF'} pages` });
    const pct = h('output', { class: 'pv-pct', 'aria-live': 'polite' }, '100%');
    const iconBtn = (name, label, onclick) => h('button', { class: 'icon-btn', type: 'button', title: label, onclick }, icon(name), h('span', { class: 'sr-only' }, label));
    const zoomTo = (z) => { zoom = Math.max(STEPS[0], Math.min(STEPS[STEPS.length - 1], Math.round(z))); pct.textContent = `${zoom}%`; redraw(); };
    const out = iconBtn('dash-lg', 'Zoom out', () => zoomTo([...STEPS].reverse().find((s) => s < zoom) || STEPS[0]));
    const inn = iconBtn('plus-lg', 'Zoom in', () => zoomTo(STEPS.find((s) => s > zoom) || STEPS[STEPS.length - 1]));
    const reset = h('button', { class: 'btn small ghost', type: 'button', title: 'Actual size', onclick: () => zoomTo(100) }, '100%');
    const fit = h('button', { class: 'btn small ghost', type: 'button', title: 'Make the page as wide as the window', onclick: async () => {
      if (!doc) return;
      const p = await doc.getPage(1);
      const w = p.getViewport({ scale: 1 }).width * PT;
      zoomTo(((pages.clientWidth - 40) / w) * 100);
    } }, 'Fit Width');
    const printBtn = h('button', { class: 'btn small', type: 'button', icon: 'printer', title: 'Print the report', onclick: () => print() }, 'Print');
    const dl = h('a', { class: 'btn small', href: url, download: opts.fileName || 'report.pdf', title: 'Save the PDF to this computer' }, 'Download');
    const pageInfo = h('span', { class: 'muted small pv-info' });
    const bar = h('div', { class: 'pv-bar' }, out, pct, inn, reset, fit, h('div', { class: 'spacer' }), pageInfo, printBtn, dl);
    const el = h('div', { class: 'pv' }, bar, pages);

    // Ctrl + mouse wheel zooms the pages (not the whole app).
    pages.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(e.deltaY < 0 ? (STEPS.find((s) => s > zoom) || zoom) : ([...STEPS].reverse().find((s) => s < zoom) || zoom));
    }, { passive: false });

    async function draw() {
      if (!doc) return;
      const id = ++renderId;
      const keep = pages.scrollHeight ? pages.scrollTop / pages.scrollHeight : 0;
      const ratio = Math.min(root.devicePixelRatio || 1, 2);
      const canvases = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (id !== renderId) return;
        const vp = page.getViewport({ scale: (zoom / 100) * PT });
        const cv = h('canvas', { class: 'pv-page', 'aria-label': `Page ${n} of ${doc.numPages}` });
        cv.width = Math.floor(vp.width * ratio);
        cv.height = Math.floor(vp.height * ratio);
        cv.style.width = `${Math.floor(vp.width)}px`;
        cv.style.height = `${Math.floor(vp.height)}px`;
        canvases.push([cv, page, vp]);
      }
      pages.replaceChildren(...canvases.map(([cv]) => cv));
      pages.scrollTop = keep * pages.scrollHeight;
      for (const [cv, page, vp] of canvases) {
        if (id !== renderId) return;
        try {
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
        } catch (err) {
          if (id === renderId) throw err; // a newer zoom took over: nothing wrong
        }
      }
    }
    const redraw = () => draw().catch(() => { /* the next zoom draws again */ });

    function print() {
      // The PDF itself goes to the printer (not this screen): a hidden frame with the file.
      const frame = h('iframe', { class: 'pv-print', src: url, title: 'Printing' });
      frame.addEventListener('load', () => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { root.open(url, '_blank'); }
        setTimeout(() => frame.remove(), 60000);
      });
      document.body.append(frame);
    }

    function fallback(why) {
      // The browser's viewer, as before (it has its own zoom, print and download).
      bar.replaceChildren(h('span', { class: 'muted small' }, why), h('div', { class: 'spacer' }), dl);
      pages.replaceChildren(h('iframe', { class: 'pv-frame', src: url, title: opts.title || 'PDF' }));
      pages.classList.add('pv-framed');
    }

    (async () => {
      try {
        const lib = await root.CVExtract.loadPdfjs();
        task = root.CVExtract.openPdf(lib, new Uint8Array(bytes));
        doc = await task.promise;
        pageInfo.textContent = `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
        await draw();
        // v1.89: opts.page starts on that page (a Files preview from a check result).
        const start = Number(opts.page) || 0;
        if (start > 1) { const cv = pages.children[Math.min(start, pages.children.length) - 1]; if (cv) pages.scrollTop = cv.offsetTop - pages.offsetTop - 8; }
      } catch (err) {
        fallback('Use the printer button above the page to print, or the download button to save a PDF.');
      }
    })();

    el.destroy = () => { renderId++; try { if (task) Promise.resolve(task.destroy()).catch(() => {}); } catch { /* already closed */ } setTimeout(() => URL.revokeObjectURL(url), 60000); };
    el.zoomTo = zoomTo;
    return el;
  }

  root.CVPdfViewer = { create, STEPS };
})(this);
