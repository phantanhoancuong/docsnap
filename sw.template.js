const APP_CACHE = "docsnap-app-__APP_VERSION__";
const MODEL_CACHE = "docsnap-model-__MODEL_VERSION__";
const MODEL_URL = "/seg-model/seg_model.onnx";

// Pre-cache the model on install so it is ready before the first scan.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(MODEL_CACHE).then((cache) => cache.add(MODEL_URL)),
  );
  self.skipWaiting();
});

// Delete caches from previous versions on activate.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_CACHE && key !== MODEL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

// Because the model and app shell is versioned automatically, always serve from cache.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === MODEL_URL) {
    event.respondWith(
      caches.open(MODEL_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      cache.put(event.request, response.clone());
      return response;
    }),
  );
});
