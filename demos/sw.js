/* Beacon Studio — service worker
   Makes every business site installable + resilient offline.
   Strategy:
     • Supabase API (REST / functions / auth)  -> network only (bookings must be live; never cached)
     • hero videos (*.mp4/webm/mov)            -> network only (too large to cache; streamed each visit)
     • navigations (HTML pages)                -> network-first, fall back to cache, then offline.html
     • same-origin static (css/js/img/icons)   -> stale-while-revalidate
     • cross-origin CDN (fonts, sb-js)         -> stale-while-revalidate
   Bump CACHE to invalidate everything on the next visit. */
'use strict';

var VERSION = 'beacon-v2';
var SHELL = VERSION + '-shell';
var RUNTIME = VERSION + '-runtime';

/* Minimal, always-present shell. Pages + images are filled in at runtime so a
   missing optional file can never break install. */
var PRECACHE = [
  'assets/demo.css',
  'assets/booking.css',
  'assets/demo.js',
  'assets/booking.js',
  'assets/pwa.js',
  'offline.html'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // addAll is atomic; use individual puts so one 404 can't abort install.
      return Promise.all(PRECACHE.map(function (url) {
        return fetch(url, { cache: 'no-cache' })
          .then(function (r) { if (r.ok) return c.put(url, r); })
          .catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isSupabase(url) {
  return url.hostname.indexOf('supabase.co') !== -1 ||
         url.hostname.indexOf('supabase.in') !== -1;
}

function staleWhileRevalidate(req) {
  return caches.open(RUNTIME).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone()).catch(function () {});
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // never cache writes (bookings, payments)
  var url;
  try { url = new URL(req.url); } catch (_) { return; }

  // 1) Supabase — always live, no caching.
  if (isSupabase(url)) return;                      // let the browser handle it

  // 1b) Hero videos — stream from network, never cache (avoids multi-MB cache bloat;
  //     also lets the browser do proper Range requests for smooth playback).
  if (req.destination === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(url.pathname)) return;

  // 2) Page navigations — network-first with offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(RUNTIME).then(function (c) { c.put(req, copy).catch(function () {}); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('offline.html');
        });
      })
    );
    return;
  }

  // 3) Everything else (same-origin assets + CDN) — stale-while-revalidate.
  e.respondWith(staleWhileRevalidate(req));
});
