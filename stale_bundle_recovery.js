console.warn("[taxiHUB] Bundle desfasado solicitado. Purgando almacenamiento en caché y forzando recarga...");
if (typeof window !== "undefined") {
  try {
    if ("caches" in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(n) { return caches.delete(n); }));
      });
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        for (var i = 0; i < regs.length; i++) regs[i].unregister();
      });
    }
  } catch(e) {}
  setTimeout(function() {
    window.location.reload(true);
  }, 150);
}
