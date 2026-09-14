// LilOS — main.js
// Entry point. Loaded as a module from index.html.

import { settings } from "./core/settings.js";
import { notifications } from "./core/notifications.js";
import { initDesktop } from "./desktop.js";

async function boot() {
  settings.init();
  notifications.init();
  await initDesktop();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

window.addEventListener("error", (e) => {
  console.error("[LilOS] uncaught error:", e.error || e.message);
});

// Registering this makes LilOS keep working with no network at all once
// it's been opened here before. Relative path so it also works when the
// site is served from a GitHub Pages subpath (e.g. /LilOS/).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("[LilOS] service worker registration failed:", err);
    });
  });
}
