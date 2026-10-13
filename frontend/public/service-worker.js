// Self-destructing service worker to purge stale caches from previous builds
self.addEventListener("install", function() {
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.registration.unregister();
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll({ type: "window" });
    }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url && "navigate" in clients[i]) {
          clients[i].navigate(clients[i].url);
        }
      }
    })
  );
});

// Pass-through fetch without any caching
self.addEventListener("fetch", function(event) {
  event.respondWith(fetch(event.request));
});
