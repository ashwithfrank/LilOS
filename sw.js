// LilOS — sw.js
// A small cache-first service worker for the app shell. This is what makes
// "works offline after the site has been loaded" actually true, not just a
// claim — once installed, LilOS's own HTML/CSS/JS are served from cache
// even with no network at all. It never touches cross-origin requests
// (e.g. pages loaded inside the in-OS Browser app's <iframe>), since those
// are the open web, not LilOS itself.

const CACHE_NAME = "lilos-cache-v1";

const ASSET_PATHS = [
  ".",
  "index.html",
  "css/main.css",
  "css/login.css",
  "css/desktop.css",
  "css/windows.css",
  "css/apps.css",
  "css/themes.css",
  "js/main.js",
  "js/desktop.js",
  "js/core/utils.js",
  "js/core/settings.js",
  "js/core/notifications.js",
  "js/core/contextMenu.js",
  "js/core/dialog.js",
  "js/filesystem/idb.js",
  "js/filesystem/vfs.js",
  "js/window-manager/windowManager.js",
  "js/apps/registry.js",
  "js/apps/fileExplorer.js",
  "js/apps/textEditor.js",
  "js/apps/terminal.js",
  "js/apps/browser.js",
  "js/apps/calculator.js",
  "js/apps/notes.js",
  "js/apps/clockApp.js",
  "js/apps/calendarApp.js",
  "js/apps/settingsApp.js",
  "js/apps/about.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSET_PATHS.map((p) => new URL(p, self.location).href)))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[LilOS SW] pre-cache failed:", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // leave third-party/browser-app requests alone

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
