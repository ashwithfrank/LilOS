// LilOS — apps/browser.js
// A browser that runs inside LilOS, embedding pages via <iframe>. LilOS
// never attempts to bypass a site's framing restrictions — when a site
// refuses to be embedded, it offers to open the site in the real browser.

import { uid, escapeHtml, niceAppUrl } from "../core/utils.js";

const BM_KEY = "lilos.browser.bookmarks.v1";
const HIST_KEY = "lilos.browser.history.v1";
const HOME = "lilos://home";
const SHORTCUTS = [
  { name: "Wikipedia", url: "https://www.wikipedia.org", icon: "📚" },
  { name: "MDN Web Docs", url: "https://developer.mozilla.org", icon: "📘" },
  { name: "Example.com", url: "https://example.com", icon: "🌐" },
  { name: "Can I use", url: "https://caniuse.com", icon: "🧩" },
];

function loadJson(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function saveJson(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

export const browserApp = {
  id: "browser",
  name: "Browser",
  icon: "🧭",
  width: 760,
  height: 520,
  singleton: false,

  mount(container, winApi, ctx) {
    let bookmarks = loadJson(BM_KEY, []);
    let history = loadJson(HIST_KEY, []);
    let tabs = [];
    let activeTabId = null;

    container.innerHTML = `
      <div class="browser-tabs" id="br-tabs"></div>
      <div class="browser-addr-row">
        <button class="btn btn-icon" id="br-back" title="Back">←</button>
        <button class="btn btn-icon" id="br-fwd" title="Forward">→</button>
        <button class="btn btn-icon" id="br-reload" title="Reload">⟳</button>
        <button class="btn btn-icon" id="br-home" title="Home">⌂</button>
        <input class="field" id="br-addr" placeholder="Search or enter a website address" />
        <button class="btn btn-icon" id="br-bookmark" title="Bookmark this page">☆</button>
      </div>
      <div class="browser-bookmarks-bar" id="br-bm-bar"></div>
      <div class="browser-frame-wrap" id="br-frame-wrap"></div>`;

    const tabsEl = container.querySelector("#br-tabs");
    const addrEl = container.querySelector("#br-addr");
    const frameWrap = container.querySelector("#br-frame-wrap");
    const bmBar = container.querySelector("#br-bm-bar");

    function activeTab() { return tabs.find((t) => t.id === activeTabId); }

    function renderTabs() {
      tabsEl.innerHTML = tabs
        .map(
          (t) => `<div class="browser-tab ${t.id === activeTabId ? "active" : ""}" data-tab="${t.id}">
          <span class="t-title">${escapeHtml(t.title || "New Tab")}</span>
          <span class="t-close" data-close="${t.id}">✕</span>
        </div>`
        )
        .join("") + `<button class="browser-tab-new" id="br-new-tab">＋</button>`;
      tabsEl.querySelectorAll("[data-tab]").forEach((el) =>
        el.addEventListener("click", (e) => { if (!e.target.closest("[data-close]")) switchTab(el.dataset.tab); })
      );
      tabsEl.querySelectorAll("[data-close]").forEach((el) =>
        el.addEventListener("click", (e) => { e.stopPropagation(); closeTab(el.dataset.close); })
      );
      tabsEl.querySelector("#br-new-tab").addEventListener("click", () => newTab());
    }

    function renderBookmarksBar() {
      bmBar.innerHTML = bookmarks
        .map((b) => `<button data-url="${escapeHtml(b.url)}" title="${escapeHtml(b.url)}">${escapeHtml(b.title)}</button>`)
        .join("");
      bmBar.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.url)));
    }

    function renderHome() {
      frameWrap.innerHTML = `
        <div class="browser-home scrollpane">
          <h2>LilOS Browser</h2>
          <div class="browser-shortcuts">
            ${SHORTCUTS.map((s) => `<button data-url="${escapeHtml(s.url)}"><span class="icon-glyph">${s.icon}</span><span>${escapeHtml(s.name)}</span></button>`).join("")}
            <button id="br-show-history"><span class="icon-glyph">🕓</span><span>History</span></button>
            <button id="br-show-bookmarks"><span class="icon-glyph">⭐</span><span>Bookmarks</span></button>
          </div>
        </div>`;
      frameWrap.querySelectorAll("[data-url]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.url)));
      frameWrap.querySelector("#br-show-history").addEventListener("click", showHistoryPage);
      frameWrap.querySelector("#br-show-bookmarks").addEventListener("click", showBookmarksPage);
    }

    function showHistoryPage() {
      frameWrap.innerHTML = `<div class="browser-home scrollpane"><h2>History</h2>
        <div class="browser-history-list">
          ${history.length ? history.slice(0, 100).map((h) => `
            <div class="browser-history-item" data-url="${escapeHtml(h.url)}">
              <span>${escapeHtml(h.title || h.url)}</span><span class="h-url">${escapeHtml(h.url)}</span>
            </div>`).join("") : `<div class="fe-empty">No history yet.</div>`}
        </div></div>`;
      frameWrap.querySelectorAll("[data-url]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.url)));
    }

    function showBookmarksPage() {
      frameWrap.innerHTML = `<div class="browser-home scrollpane"><h2>Bookmarks</h2>
        <div class="browser-bm-manage-list">
          ${bookmarks.length ? bookmarks.map((b) => `
            <div class="browser-bm-manage-item">
              <span data-url="${escapeHtml(b.url)}" style="flex:1;cursor:pointer;">${escapeHtml(b.title)}</span>
              <span class="h-url">${escapeHtml(b.url)}</span>
              <button class="btn-icon" data-remove="${b.id}">✕</button>
            </div>`).join("") : `<div class="fe-empty">No bookmarks yet. Use the ☆ button to add one.</div>`}
        </div></div>`;
      frameWrap.querySelectorAll("[data-url]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.url)));
      frameWrap.querySelectorAll("[data-remove]").forEach((el) =>
        el.addEventListener("click", () => {
          bookmarks = bookmarks.filter((b) => b.id !== el.dataset.remove);
          saveJson(BM_KEY, bookmarks);
          renderBookmarksBar();
          showBookmarksPage();
        })
      );
    }

    function renderFrame(tab) {
      if (!tab || tab.url === HOME) { renderHome(); return; }
      frameWrap.innerHTML = "";
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
      iframe.referrerPolicy = "no-referrer";
      let blocked = false;
      const timer = setTimeout(() => {
        try {
          const loc = iframe.contentWindow?.location?.href;
          if (loc === "about:blank") showBlocked(tab.url);
        } catch {
          /* cross-origin access throwing means the page DID load elsewhere — treat as success */
        }
      }, 3500);
      iframe.addEventListener("load", () => clearTimeout(timer), { once: true });
      iframe.src = tab.url;
      frameWrap.appendChild(iframe);

      function showBlocked(url) {
        if (blocked) return;
        blocked = true;
        frameWrap.innerHTML = `
          <div class="browser-blocked">
            <div style="font-size:34px;">🚫</div>
            <div style="font-weight:600;">This site can't be shown inside LilOS</div>
            <p>${escapeHtml(new URL(url).hostname)} doesn't allow itself to be embedded in another page. This is a security setting the site controls, and LilOS won't try to bypass it.</p>
            <button class="btn btn-accent" id="br-open-real">Open in your browser ↗</button>
          </div>`;
        frameWrap.querySelector("#br-open-real").addEventListener("click", () => window.open(url, "_blank", "noopener,noreferrer"));
      }
    }

    function pushHistory(url, title) {
      if (url === HOME) return;
      history = [{ url, title, time: Date.now() }, ...history.filter((h) => h.url !== url)].slice(0, 200);
      saveJson(HIST_KEY, history);
    }

    function navigate(rawUrl) {
      const tab = activeTab();
      if (!tab) return;
      const url = rawUrl === HOME ? HOME : niceAppUrl(rawUrl);
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(url);
      tab.historyIndex = tab.history.length - 1;
      tab.url = url;
      tab.title = url === HOME ? "New Tab" : new URL(url).hostname;
      addrEl.value = url === HOME ? "" : url;
      updateBookmarkStar();
      renderTabs();
      renderFrame(tab);
      if (url !== HOME) pushHistory(url, tab.title);
    }

    function goBack() {
      const tab = activeTab();
      if (!tab || tab.historyIndex <= 0) return;
      tab.historyIndex--;
      tab.url = tab.history[tab.historyIndex];
      tab.title = tab.url === HOME ? "New Tab" : new URL(tab.url).hostname;
      addrEl.value = tab.url === HOME ? "" : tab.url;
      renderTabs(); renderFrame(tab); updateBookmarkStar();
    }
    function goForward() {
      const tab = activeTab();
      if (!tab || tab.historyIndex >= tab.history.length - 1) return;
      tab.historyIndex++;
      tab.url = tab.history[tab.historyIndex];
      tab.title = tab.url === HOME ? "New Tab" : new URL(tab.url).hostname;
      addrEl.value = tab.url === HOME ? "" : tab.url;
      renderTabs(); renderFrame(tab); updateBookmarkStar();
    }

    function updateBookmarkStar() {
      const tab = activeTab();
      const starBtn = container.querySelector("#br-bookmark");
      const isBm = tab && bookmarks.some((b) => b.url === tab.url);
      starBtn.textContent = isBm ? "★" : "☆";
    }

    function newTab(url = HOME) {
      const tab = { id: uid("tab"), url: HOME, title: "New Tab", history: [HOME], historyIndex: 0 };
      tabs.push(tab);
      activeTabId = tab.id;
      renderTabs();
      if (url !== HOME) navigate(url);
      else { addrEl.value = ""; renderFrame(tab); updateBookmarkStar(); }
      addrEl.focus();
    }

    function switchTab(id) {
      activeTabId = id;
      const tab = activeTab();
      addrEl.value = tab.url === HOME ? "" : tab.url;
      renderTabs();
      renderFrame(tab);
      updateBookmarkStar();
    }

    function closeTab(id) {
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      tabs.splice(idx, 1);
      if (!tabs.length) { winApi.close(); return; }
      if (activeTabId === id) switchTab(tabs[Math.max(0, idx - 1)].id);
      else renderTabs();
    }

    container.querySelector("#br-back").addEventListener("click", goBack);
    container.querySelector("#br-fwd").addEventListener("click", goForward);
    container.querySelector("#br-reload").addEventListener("click", () => renderFrame(activeTab()));
    container.querySelector("#br-home").addEventListener("click", () => navigate(HOME));
    container.querySelector("#br-bookmark").addEventListener("click", () => {
      const tab = activeTab();
      if (!tab || tab.url === HOME) return;
      const existing = bookmarks.find((b) => b.url === tab.url);
      if (existing) bookmarks = bookmarks.filter((b) => b.id !== existing.id);
      else bookmarks.push({ id: uid("bm"), url: tab.url, title: tab.title });
      saveJson(BM_KEY, bookmarks);
      renderBookmarksBar();
      updateBookmarkStar();
      ctx.notify(existing ? "Bookmark removed" : "Bookmark added", tab.title, "success");
    });
    addrEl.addEventListener("keydown", (e) => { if (e.key === "Enter") navigate(addrEl.value); });

    renderBookmarksBar();
    newTab();
  },
};
