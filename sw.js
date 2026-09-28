/* CaseVault service worker.
 * Caches the app's own files so CaseVault opens with no internet connection.
 * It never stores case data: in direct mode that is read from the SSD by the page, and in helper
 * mode the helper's /api/ requests are passed through untouched and never cached.
 * Requests to any other origin (for example the local Ollama engine in v1.5) are not touched.
 */
'use strict';

// Replaced with the commit SHA by the GitHub Pages workflow so each deploy refreshes the cache.
const BUILD = 'dev';
const CACHE = `casevault-${BUILD}`;

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/fs.js',
  './js/helper-fs.js',
  './js/vault.js',
  './js/markdown.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
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

  // Cache first for the app's own files only. Anything else goes to the network uncached.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    return cached || fetch(req);
  })());
});
