/* CaseVault service worker.
 * Caches the app's own files so CaseVault opens with no internet connection.
 * It never stores case data: in direct mode that is read from the SSD by the page, and in helper
 * mode the helper's /api/ requests are passed through untouched and never cached.
 * Requests to any other origin (the local Ollama engine, or api.anthropic.com when the user goes
 * online) are not touched, and never cached.
 */
'use strict';

// VERSION is bumped with each release; BUILD is replaced with the commit SHA by the GitHub Pages
// workflow. Either change gives a new cache, so the installed app picks up the update.
const VERSION = '1.52.0';
const BUILD = 'dev';
const CACHE = `casevault-${VERSION}-${BUILD}`;

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './vendor/poppins/poppins-latin-400-normal.woff2',
  './vendor/poppins/poppins-latin-500-normal.woff2',
  './vendor/poppins/poppins-latin-600-normal.woff2',
  './vendor/poppins/poppins-latin-700-normal.woff2',
  './js/theme.js',
  './js/options.js',
  './js/icons-data.js',
  './js/icons.js',
  './js/tooltip.js',
  './js/formats.js',
  './js/timefield.js',
  './js/fs.js',
  './js/helper-fs.js',
  './js/casefiles.js',
  './js/vault.js',
  './js/markdown.js',
  './js/format-bar.js',
  './js/rich-editor.js',
  './js/checker/nlp.js',
  './js/checker/rules.js',
  './js/checker/sheets.js',
  './js/checker/xfa.js',
  './js/docxview.js',
  './js/checker/extract.js',
  './js/checker/ai.js',
  './js/ai/activity.js',
  './js/ai/hardware.js',
  './js/ai/ollama-shim.js',
  './js/ai/webllm.js',
  './js/ai/webllm-worker.js',
  './js/checker/checks-ui.js',
  './js/drafts/draft-core.js',
  './js/drafts/docx.js',
  './js/drafts/ghost.js',
  './js/drafts/copilot.js',
  './js/drafts/review.js',
  './js/drafts/drafts-ui.js',
  './js/secure/pii.js',
  './js/secure/outbound.js',
  './js/secure/mail.js',
  './js/secure/apikey.js',
  './js/secure/apikey-ui.js',
  './js/secure/online-ui.js',
  './js/secure/mail-ui.js',
  './js/secure/settings-ui.js',
  './js/ai/memory.js',
  './js/privacy.js',
  './js/selftest.js',
  './js/closing.js',
  './js/closing-ui.js',
  './js/operation.js',
  './js/combo.js',
  './js/report-fields.js',
  './js/pdf-viewer.js',
  './js/discovery-core.js',
  './js/discovery-ui.js',
  './js/linkchart.js',
  './js/linkchart-ui.js',
  './discovery/viewer.html',
  './js/report-pdf.js',
  './js/arrest-pdf.js',
  './js/draft-pdf.js',
  './js/report-fields-ui.js',
  './js/ai/chat.js',
  './js/ai/chat-ui.js',
  './js/notes-float.js',
  './js/library.js',
  './js/library-ui.js',
  './js/reference/links.js',
  './js/reference/ref-data.js',
  './js/reference/reference.js',
  './js/reference/ref-ui.js',
  './js/app.js',
  './icons/icon-64.png',
  './icons/color/archive-box.png',
  './icons/color/badge-atf.png',
  './icons/color/badge-cbp.png',
  './icons/color/badge-dea.png',
  './icons/color/badge-fbi.png',
  './icons/color/badge-hsi.png',
  './icons/color/badge-ice.png',
  './icons/color/badge-irs.png',
  './icons/color/badge-local-pd.png',
  './icons/color/badge-sheriff.png',
  './icons/color/badge-state-pd.png',
  './icons/color/badge-usms.png',
  './icons/color/badge-uspis.png',
  './icons/color/badge-usss.png',
  './icons/color/bell.png',
  './icons/color/book.png',
  './icons/color/bookshelf.png',
  './icons/color/bug.png',
  './icons/color/calculator.png',
  './icons/color/calendar.png',
  './icons/color/cannabis.png',
  './icons/color/chain.png',
  './icons/color/chat.png',
  './icons/color/cloud-upload.png',
  './icons/color/crypto.png',
  './icons/color/doc-network.png',
  './icons/color/drive.png',
  './icons/color/envelope.png',
  './icons/color/external.png',
  './icons/color/fingerprint.png',
  './icons/color/floppy.png',
  './icons/color/folder-blue.png',
  './icons/color/folder-dark.png',
  './icons/color/folder-green.png',
  './icons/color/folder-purple.png',
  './icons/color/folder-yellow.png',
  './icons/color/gear.png',
  './icons/color/globe.png',
  './icons/color/google.png',
  './icons/color/home.png',
  './icons/color/hourglass.png',
  './icons/color/id-card.png',
  './icons/color/image.png',
  './icons/color/lightning.png',
  './icons/color/link-nodes.png',
  './icons/color/lock.png',
  './icons/color/map.png',
  './icons/color/meta.png',
  './icons/color/money.png',
  './icons/color/notebook.png',
  './icons/color/paperclip.png',
  './icons/color/phone.png',
  './icons/color/pin.png',
  './icons/color/safe.png',
  './icons/color/scales.png',
  './icons/color/send.png',
  './icons/color/shield-person.png',
  './icons/color/skull.png',
  './icons/color/snapchat.png',
  './icons/color/sparkles.png',
  './icons/color/target.png',
  './icons/color/telegram.png',
  './icons/color/theme.png',
  './icons/color/tools.png',
  './icons/color/trash.png',
  './icons/color/unlock.png',
  './icons/color/wrench.png',
  './icons/color/x-circle.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  // Document reading and OCR (large; downloaded once so the checker works offline)
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './vendor/pdfjs/wasm/jbig2.wasm',
  './vendor/pdfjs/wasm/openjpeg.wasm',
  './vendor/pdfjs/wasm/qcms_bg.wasm',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  './vendor/tesseract/lang/eng.traineddata.gz',
  // Spreadsheets (.xlsx/.xls/.csv), loaded only when one is opened
  './vendor/sheetjs/xlsx.full.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('casevault-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Helper mode: /api/ carries case data. Never cache it; let it go straight to the helper.
  if (url.pathname.includes('/api/')) return;
  // In-browser AI model files (gigabytes) come from the SSD through the helper: never cache them.
  if (url.pathname.includes('/webllm/')) return;

  // Cache first for the app's own files only. Anything else goes to the network uncached.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (cached) return cached;
    const res = await fetch(req);
    // Other bundled library files (PDF fonts, character maps) are cached the first time they are used.
    if (res.ok && res.type === 'basic' && url.pathname.includes('/vendor/')) cache.put(req, res.clone());
    return res;
  })());
});
