// Service worker de mise en cache hors ligne pour Animate JS (TweenJS).
// Stratégies (même origine, GET uniquement) :
// - navigation (HTML) : réseau d'abord, repli cache — une mise à jour du
//   site s'applique dès qu'on est en ligne ;
// - ressources avec empreinte (assets/nom-HASH.js|css) : cache d'abord —
//   immuables par construction ;
// - le reste (bundle vanilla, libs locales, icônes, manifeste) : réseau
//   d'abord, repli cache — jamais de contenu périmé servi quand le serveur
//   répond, et l'ancien reste disponible hors ligne.
// Au premier chargement, la page transmet au SW la liste des ressources
// réellement utilisées (message CACHE_URLS, cf. index.html) : le hors-ligne
// est complet dès la PREMIÈRE visite — sans lui, seuls les chargements
// postérieurs à l'activation du SW passeraient par le fetch handler.
'use strict';

var CACHE_NAME = 'animatejs-v3';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (c) { return c.addAll(['./', './manifest.webmanifest']); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil((function () {
    return caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); });
  })());
});

function putInCache(request, response) {
  return caches.open(CACHE_NAME).then(function (c) {
    c.put(request, response);
  });
}

function cacheFirst(request) {
  return caches.match(request, { ignoreSearch: true }).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (res) {
      if (res && res.ok) putInCache(request, res.clone());
      return res;
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(function (res) {
    if (res && res.ok) putInCache(request, res.clone());
    return res;
  }).catch(function (err) {
    return caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        // Navigation hors ligne sans entrée directe : servir la racine.
        return caches.match('./').then(function (root) {
          if (root) return root;
          throw err;
        });
      }
      throw err;
    });
  });
}

var HASHED = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|svg)$/;

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
  if (HASHED.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req));
});

// Réception de la liste des ressources à mettre en cache (première visite).
self.addEventListener('message', function (e) {
  var data = e.data;
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  e.waitUntil((function () {
    return caches.open(CACHE_NAME).then(function (c) {
      var chain = Promise.resolve();
      data.urls.forEach(function (u) {
        chain = chain.then(function () {
          var url;
          try { url = new URL(u, self.location.href); } catch (err) { return; }
          if (url.origin !== self.location.origin) return;
          return c.match(url.href).then(function (hit) {
            if (hit) return;
            return fetch(url.href).then(function (res) {
              if (res && res.ok) return c.put(url.href, res);
            }).catch(function () { /* hors ligne : on garde ce qu'on a */ });
          });
        });
      });
      return chain;
    });
  })());
});
