// LilOS — desktop.js
// Wires together the desktop surface: icons, taskbar, launcher, the
// notification panel, right-click menus, and the login <-> desktop flow.

import { windowManager } from "./window-manager/windowManager.js";
import { APPS, launchApp, getRecentApps, getApp } from "./apps/registry.js";
import * as vfs from "./filesystem/vfs.js";
import { settings } from "./core/settings.js";
import { notifications } from "./core/notifications.js";
import { showContextMenu, closeContextMenu } from "./core/contextMenu.js";
import { promptDialog, confirmDialog } from "./core/dialog.js";
import { escapeHtml, formatTime, formatDate, bus, fileExt } from "./core/utils.js";

const PINNED_DESKTOP_APPS = ["fileexplorer", "browser", "terminal"];
const PINNED_TASKBAR_APPS = ["browser", "fileexplorer", "terminal"];
const TEXTY_EXT = new Set(["txt", "md", "js", "json", "css", "html", "csv", "log", "xml", "yml", "yaml", ""]);

function iconForNode(node) {
  if (node.type === "folder") return "📁";
  const map = { txt: "📄", md: "📝", js: "📜", json: "🧾", css: "🎨", html: "🌐", png: "🖼️", jpg: "🖼️", svg: "🖼️" };
  return map[fileExt(node.name)] || "📄";
}

async function openDesktopNode(node) {
  if (node.type === "folder") {
    launchApp("fileexplorer", { openFolderId: node.id });
    return;
  }
  const ext = fileExt(node.name);
  if (TEXTY_EXT.has(ext)) launchApp("texteditor", { fileId: node.id });
  else notifications.push("Can't open this file", `No built-in viewer for .${ext || "this"} files.`, "warning");
}

/* -------------------------------------------------------------------- */
/*  Desktop icons                                                        */
/* -------------------------------------------------------------------- */

async function renderDesktopIcons() {
  const grid = document.getElementById("desktop-icons");
  if (!grid) return;
  let html = PINNED_DESKTOP_APPS.map((id) => {
    const app = getApp(id);
    return `<div class="desktop-icon" data-app="${id}">
      <div class="icon-glyph">${app.icon}</div>
      <div class="icon-label">${escapeHtml(app.name)}</div>
    </div>`;
  }).join("");

  const desktopFolder = await vfs.getWellKnownFolder("Desktop");
  if (desktopFolder) {
    const kids = await vfs.getChildren(desktopFolder.id);
    html += kids
      .map(
        (n) => `<div class="desktop-icon" data-node="${n.id}">
        <div class="icon-glyph">${iconForNode(n)}</div>
        <div class="icon-label">${escapeHtml(n.name)}</div>
      </div>`
      )
      .join("");
  }
  grid.innerHTML = html;
  wireDesktopIconEvents(desktopFolder?.id);
}

function wireDesktopIconEvents(desktopFolderId) {
  const grid = document.getElementById("desktop-icons");
  let selected = null;

  grid.querySelectorAll(".desktop-icon").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      grid.querySelectorAll(".desktop-icon").forEach((x) => x.classList.remove("selected"));
      el.classList.add("selected");
      selected = el;
    });
    el.addEventListener("dblclick", async () => {
      if (el.dataset.app) launchApp(el.dataset.app);
      else {
        const node = await vfs.getNode(el.dataset.node);
        if (node) openDesktopNode(node);
      }
    });
    el.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      grid.querySelectorAll(".desktop-icon").forEach((x) => x.classList.remove("selected"));
      el.classList.add("selected");
      if (el.dataset.app) {
        showContextMenu(e.clientX, e.clientY, [{ label: "Open", action: () => launchApp(el.dataset.app) }]);
        return;
      }
      const node = await vfs.getNode(el.dataset.node);
      if (!node) return;
      showContextMenu(e.clientX, e.clientY, [
        { label: "Open", action: () => openDesktopNode(node) },
        { label: "Rename", action: async () => {
            const name = await promptDialog("Rename", "", node.name);
            if (name && name !== node.name) { await vfs.rename(node.id, name).catch((err) => notifications.push("Couldn't rename", err.message, "error")); }
          } },
        { separator: true },
        { label: "Delete", danger: true, action: async () => {
            const ok = await confirmDialog("Delete this item?", "This can't be undone.", { danger: true, okLabel: "Delete" });
            if (ok) await vfs.deleteNode(node.id);
          } },
      ]);
    });
  });

  grid.addEventListener("click", () => {
    grid.querySelectorAll(".desktop-icon").forEach((x) => x.classList.remove("selected"));
    selected = null;
  });
}

function wireDesktopBackgroundMenu() {
  const desktop = document.getElementById("desktop");
  desktop.addEventListener("contextmenu", async (e) => {
    if (e.target.closest(".lil-window") || e.target.closest("#desktop-icons") || e.target.closest("#taskbar") || e.target.closest("#launcher")) return;
    e.preventDefault();
    const desktopFolder = await vfs.getWellKnownFolder("Desktop");
    showContextMenu(e.clientX, e.clientY, [
      { label: "New Folder", action: async () => {
          const name = await promptDialog("New folder", "Name your folder:", "New Folder");
          if (name && desktopFolder) { await vfs.createFolder(desktopFolder.id, name); renderDesktopIcons(); }
        } },
      { label: "New File", action: async () => {
          const name = await promptDialog("New file", "Name your file:", "New File.txt");
          if (name && desktopFolder) { await vfs.createFile(desktopFolder.id, name, ""); renderDesktopIcons(); }
        } },
      { separator: true },
      { label: "Open Settings", action: () => launchApp("settings") },
      { label: "Refresh", action: renderDesktopIcons },
    ]);
  });
}

/* -------------------------------------------------------------------- */
/*  Taskbar                                                               */
/* -------------------------------------------------------------------- */

function renderTaskbarRunning() {
  const wrap = document.getElementById("taskbar-running");
  if (!wrap) return;
  const wins = windowManager.list();
  const pinnedNotRunning = PINNED_TASKBAR_APPS.filter((id) => !wins.some((w) => w.appId === id));

  const pinnedHtml = pinnedNotRunning
    .map((id) => {
      const app = getApp(id);
      return `<button class="taskbar-btn" data-app="${id}" title="${escapeHtml(app.name)}">${app.icon}</button>`;
    })
    .join("");

  const runningHtml = wins
    .map((w) => {
      const app = getApp(w.appId);
      const focused = w.el.classList.contains("focused") && !w.minimized;
      return `<button class="taskbar-btn running ${focused ? "active" : ""}" data-win="${w.id}" title="${escapeHtml(w.title)}">${app?.icon || w.icon}</button>`;
    })
    .join("");

  wrap.innerHTML = pinnedHtml + runningHtml;

  wrap.querySelectorAll("[data-app]").forEach((b) => b.addEventListener("click", () => launchApp(b.dataset.app)));
  wrap.querySelectorAll("[data-win]").forEach((b) =>
    b.addEventListener("click", () => windowManager.toggleMinimizeOrFocus(b.dataset.win))
  );
}

function renderClock() {
  const el = document.getElementById("taskbar-clock");
  if (!el) return;
  const now = new Date();
  const hour12 = settings.get("clockFormat") !== "24h";
  el.innerHTML = `<div>${formatTime(now, { hour12 })}</div><div class="tb-date">${formatDate(now)}</div>`;
}

function initTaskbar() {
  renderTaskbarRunning();
  renderClock();
  setInterval(renderClock, 15000);
  bus.on("wm:open", renderTaskbarRunning);
  bus.on("wm:close", renderTaskbarRunning);
  bus.on("wm:focus", renderTaskbarRunning);
  bus.on("wm:minimize", renderTaskbarRunning);
  bus.on("wm:restore", renderTaskbarRunning);
  bus.on("wm:title", renderTaskbarRunning);
  bus.on("settings:change", renderClock);

  document.getElementById("launcher-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLauncher();
  });
  document.getElementById("notif-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNotifPanel();
  });

  // Auto-hide peek support
  const taskbar = document.getElementById("taskbar");
  document.addEventListener("pointermove", (e) => {
    if (settings.get("taskbarBehavior") !== "autohide") return;
    if (window.innerHeight - e.clientY < 60) taskbar.classList.add("peek");
    else if (!taskbar.matches(":hover")) taskbar.classList.remove("peek");
  });
}

/* -------------------------------------------------------------------- */
/*  Launcher                                                             */
/* -------------------------------------------------------------------- */

function renderLauncherGrid(filter = "") {
  const grid = document.getElementById("launcher-grid");
  const q = filter.trim().toLowerCase();
  const list = APPS.filter((a) => a.name.toLowerCase().includes(q));
  grid.innerHTML = list
    .map((a) => `<button class="launcher-app" data-app="${a.id}"><span class="icon-glyph">${a.icon}</span><span>${escapeHtml(a.name)}</span></button>`)
    .join("") || `<div class="fe-empty">No apps match "${escapeHtml(filter)}"</div>`;
  grid.querySelectorAll("[data-app]").forEach((b) =>
    b.addEventListener("click", () => {
      launchApp(b.dataset.app);
      closeLauncher();
    })
  );
}

function renderLauncherRecent() {
  const row = document.getElementById("launcher-recent");
  const recents = getRecentApps();
  row.innerHTML = recents.length
    ? recents.map((a) => `<button class="launcher-app" data-app="${a.id}"><span class="icon-glyph">${a.icon}</span><span>${escapeHtml(a.name)}</span></button>`).join("")
    : `<div style="font-size:11.5px;color:var(--text-2);padding:6px 2px;">Nothing opened yet</div>`;
  row.querySelectorAll("[data-app]").forEach((b) =>
    b.addEventListener("click", () => {
      launchApp(b.dataset.app);
      closeLauncher();
    })
  );
}

function toggleLauncher() {
  const el = document.getElementById("launcher");
  el.classList.contains("open") ? closeLauncher() : openLauncher();
}
function openLauncher() {
  closeNotifPanel();
  const el = document.getElementById("launcher");
  const search = document.getElementById("launcher-search");
  search.value = "";
  renderLauncherGrid();
  renderLauncherRecent();
  el.classList.add("open");
  setTimeout(() => search.focus(), 30);
}
function closeLauncher() {
  document.getElementById("launcher").classList.remove("open");
}

function initLauncher() {
  const search = document.getElementById("launcher-search");
  search.addEventListener("input", () => renderLauncherGrid(search.value));

  document.getElementById("power-lock").addEventListener("click", () => {
    closeLauncher();
    showLoginScreen();
  });
  document.getElementById("power-restart").addEventListener("click", () => window.location.reload());
  document.getElementById("power-sleep").addEventListener("click", () => {
    closeLauncher();
    showSleepOverlay();
  });

  document.addEventListener("click", (e) => {
    const launcher = document.getElementById("launcher");
    if (launcher.classList.contains("open") && !launcher.contains(e.target) && e.target.id !== "launcher-btn") closeLauncher();
  });
}

/* -------------------------------------------------------------------- */
/*  Notification panel                                                   */
/* -------------------------------------------------------------------- */

function toggleNotifPanel() {
  const el = document.getElementById("notif-panel");
  el.classList.contains("open") ? closeNotifPanel() : openNotifPanel();
}
function openNotifPanel() {
  closeLauncher();
  notifications.renderPanel();
  document.getElementById("notif-panel").classList.add("open");
}
function closeNotifPanel() {
  document.getElementById("notif-panel").classList.remove("open");
}

function initNotifPanel() {
  document.getElementById("notif-clear").addEventListener("click", () => notifications.clearAll());
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("notif-panel");
    if (panel.classList.contains("open") && !panel.contains(e.target) && e.target.id !== "notif-btn") closeNotifPanel();
  });
}

/* -------------------------------------------------------------------- */
/*  Sleep overlay (power control)                                        */
/* -------------------------------------------------------------------- */

function showSleepOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "sleep-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:900;background:#000;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;";
  overlay.textContent = "LilOS is asleep — click to wake";
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}

/* -------------------------------------------------------------------- */
/*  Login <-> desktop flow                                               */
/* -------------------------------------------------------------------- */

function tickLoginClock() {
  const el = document.getElementById("login-clock");
  if (!el) return;
  const now = new Date();
  el.textContent = `${formatTime(now)} · ${formatDate(now, "long")}`;
}

function showLoginScreen() {
  windowManager.closeAll();
  closeLauncher();
  closeNotifPanel();
  const login = document.getElementById("login-screen");
  const desktop = document.getElementById("desktop");
  login.style.display = "grid";
  login.classList.remove("leaving");
  desktop.classList.remove("entering");
  desktop.style.opacity = "0";
}

function enterDesktop() {
  const login = document.getElementById("login-screen");
  const desktop = document.getElementById("desktop");
  login.classList.add("leaving");
  setTimeout(() => {
    login.style.display = "none";
    desktop.style.opacity = "";
    desktop.classList.add("entering");
    renderDesktopIcons();
    notifications.push("Welcome to LilOS", "Right-click the desktop or open the launcher to get started.", "info");
  }, 560);
}

function initLoginScreen() {
  tickLoginClock();
  setInterval(tickLoginClock, 30000);
  document.getElementById("login-btn").addEventListener("click", enterDesktop);
}

/* -------------------------------------------------------------------- */
/*  Boot                                                                 */
/* -------------------------------------------------------------------- */

export async function initDesktop() {
  await vfs.getNode(vfs.ROOT_ID); // warms the VFS cache
  initLoginScreen();
  initTaskbar();
  initLauncher();
  initNotifPanel();
  wireDesktopBackgroundMenu();
  bus.on("fs:change", renderDesktopIcons);

  window.addEventListener("resize", () => closeContextMenu());
}
