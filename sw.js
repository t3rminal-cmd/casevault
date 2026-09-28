/* CaseVault service worker.
 * Caches the app's own files so CaseVault opens with no internet connection.
 * It never sees case data: that is read from the SSD by the page, not fetched over the network.
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

  // Cache first: the app works the same online or offline. New versions arrive via a new BUILD.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});
