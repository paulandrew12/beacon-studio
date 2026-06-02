/* Beacon Studio — PWA bootstrap
   Registers the service worker and offers a tasteful "Install app" prompt.
   No build step; safe to include on every page. */
(function () {
  'use strict';

  // ---- register the service worker (relative path => works at any deploy sub-path)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('[beacon] SW registration failed', err);
      });
    });
  }

  // ---- install prompt (Android/desktop Chromium fire beforeinstallprompt)
  var deferred = null;
  var KEY = 'beacon_install_dismissed';

  function alreadyInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function makeChip(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pwa-install';
    b.innerHTML = '<span class="pwa-ic">⤓</span><span>' + label + '</span>' +
                  '<span class="pwa-x" aria-label="Dismiss">×</span>';
    b.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('pwa-x')) {
        try { localStorage.setItem(KEY, '1'); } catch (_) {}
        b.remove();
        return;
      }
      onClick();
    });
    document.body.appendChild(b);
    requestAnimationFrame(function () { b.classList.add('show'); });
    return b;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    try { if (localStorage.getItem(KEY)) return; } catch (_) {}
    if (alreadyInstalled()) return;
    var chip = makeChip('Install app', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; chip.remove(); });
    });
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    var c = document.querySelector('.pwa-install'); if (c) c.remove();
  });

  // ---- iOS Safari has no install event: show a one-time Add-to-Home-Screen hint
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }
  function isSafari() {
    return /^((?!chrome|crios|fxios|android).)*safari/i.test(navigator.userAgent);
  }
  window.addEventListener('load', function () {
    if (!isIOS() || !isSafari() || alreadyInstalled()) return;
    try { if (localStorage.getItem(KEY)) return; } catch (_) {}
    setTimeout(function () {
      makeChip('Add to Home Screen', function () {
        alert('To install: tap the Share icon, then "Add to Home Screen".');
      });
    }, 2600);
  });
})();
