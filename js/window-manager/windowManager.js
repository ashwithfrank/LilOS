// LilOS — window-manager/windowManager.js
// A small but real window manager: dragging, resizing, focus/z-index,
// minimize/maximize/restore, and viewport-containment.

import { uid, clamp, bus, escapeHtml } from "../core/utils.js";

const MIN_W = 300;
const MIN_H = 200;
let layer = null;
let zTop = 20;
let cascadeIndex = 0;
const windows = new Map(); // id -> record

function getLayer() {
  if (!layer) layer = document.getElementById("window-layer");
  return layer;
}

function viewportSize() {
  const layerEl = getLayer();
  const rect = layerEl.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function clampPosition(rec) {
  const { w: vw, h: vh } = viewportSize();
  const minVisible = 80;
  rec.x = clamp(rec.x, minVisible - rec.w, vw - minVisible);
  rec.y = clamp(rec.y, 0, vh - 44);
}

function applyRect(rec) {
  rec.el.style.left = `${rec.x}px`;
  rec.el.style.top = `${rec.y}px`;
  rec.el.style.width = `${rec.w}px`;
  rec.el.style.height = `${rec.h}px`;
}

function focus(id) {
  const rec = windows.get(id);
  if (!rec) return;
  zTop += 1;
  rec.el.style.zIndex = zTop;
  for (const other of windows.values()) other.el.classList.toggle("focused", other.id === id);
  bus.emit("wm:focus", { id });
}

function buildResizeHandles(rec) {
  const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  for (const dir of dirs) {
    const handle = document.createElement("div");
    handle.className = `win-resize-handle rh-${dir}`;
    handle.addEventListener("pointerdown", (e) => startResize(e, rec, dir));
    rec.el.appendChild(handle);
  }
}

function startResize(e, rec, dir) {
  if (rec.maximized) return;
  e.preventDefault();
  e.stopPropagation();
  focus(rec.id);
  rec.el.classList.add("resizing");
  const startX = e.clientX;
  const startY = e.clientY;
  const start = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let { x, y, w, h } = start;
    if (dir.includes("e")) w = Math.max(MIN_W, start.w + dx);
    if (dir.includes("s")) h = Math.max(MIN_H, start.h + dy);
    if (dir.includes("w")) {
      w = Math.max(MIN_W, start.w - dx);
      x = start.x + (start.w - w);
    }
    if (dir.includes("n")) {
      h = Math.max(MIN_H, start.h - dy);
      y = Math.max(0, start.y + (start.h - h));
    }
    rec.x = x; rec.y = y; rec.w = w; rec.h = h;
    applyRect(rec);
  }
  function onUp() {
    rec.el.classList.remove("resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function startDrag(e, rec) {
  if (rec.maximized) return;
  if (e.target.closest("button")) return;
  focus(rec.id);
  rec.el.classList.add("dragging");
  const startX = e.clientX;
  const startY = e.clientY;
  const start = { x: rec.x, y: rec.y };

  function onMove(ev) {
    rec.x = start.x + (ev.clientX - startX);
    rec.y = Math.max(0, start.y + (ev.clientY - startY));
    applyRect(rec);
  }
  function onUp() {
    rec.el.classList.remove("dragging");
    clampPosition(rec);
    applyRect(rec);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

export const windowManager = {
  list() {
    return [...windows.values()];
  },

  findByAppId(appId) {
    return [...windows.values()].find((w) => w.appId === appId);
  },

  open(opts) {
    const {
      appId,
      title = "Untitled",
      icon = "🗔",
      width = 560,
      height = 400,
      minWidth = MIN_W,
      minHeight = MIN_H,
      mount,
      singleton = false,
    } = opts;

    if (singleton) {
      const existing = this.findByAppId(appId);
      if (existing) {
        this.restore(existing.id);
        focus(existing.id);
        existing.reopenHandler?.(opts.payload);
        return existing.api;
      }
    }

    const id = uid("win");
    const { w: vw, h: vh } = viewportSize();
    const isSmallScreen = vw < 640;
    const effWidth = Math.min(width, Math.max(minWidth, vw - 20));
    const effHeight = Math.min(height, Math.max(minHeight, vh - 20));
    const cascadeOffset = (cascadeIndex++ % 6) * 26;
    const x = clamp((vw - effWidth) / 2 + cascadeOffset - 60, 10, Math.max(10, vw - effWidth - 10));
    const y = clamp((vh - effHeight) / 2 + cascadeOffset - 40, 8, Math.max(8, vh - effHeight - 8));

    const el = document.createElement("div");
    el.className = "lil-window glass";
    el.style.width = `${effWidth}px`;
    el.style.height = `${effHeight}px`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.minWidth = `${Math.min(minWidth, effWidth)}px`;
    el.style.minHeight = `${Math.min(minHeight, effHeight)}px`;
    el.innerHTML = `
      <div class="win-titlebar">
        <div class="win-traffic">
          <button class="win-close" title="Close">✕</button>
          <button class="win-min" title="Minimize">-</button>
          <button class="win-max" title="Maximize">+</button>
        </div>
        <div class="win-title"><span class="win-icon">${icon}</span><span class="win-title-text">${escapeHtml(title)}</span></div>
        <div style="width:54px"></div>
      </div>
      <div class="win-body"></div>
    `;
    getLayer().appendChild(el);

    const rec = { id, appId, title, icon, el, x, y, w: effWidth, h: effHeight, minimized: false, maximized: false, prevRect: null };
    windows.set(id, rec);
    buildResizeHandles(rec);

    if (isSmallScreen) {
      rec.prevRect = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
      rec.maximized = true;
      el.classList.add("maximized");
    }

    el.querySelector(".win-titlebar").addEventListener("pointerdown", (e) => startDrag(e, rec));
    el.addEventListener("pointerdown", () => focus(id), { capture: true });
    el.querySelector(".win-close").addEventListener("click", () => this.close(id));
    el.querySelector(".win-min").addEventListener("click", () => this.minimize(id));
    el.querySelector(".win-max").addEventListener("click", () => this.toggleMaximize(id));
    el.querySelector(".win-titlebar").addEventListener("dblclick", (e) => {
      if (!e.target.closest("button")) this.toggleMaximize(id);
    });

    const body = el.querySelector(".win-body");
    const api = {
      id,
      el,
      body,
      setTitle: (t) => {
        rec.title = t;
        el.querySelector(".win-title-text").textContent = t;
        bus.emit("wm:title", { id, title: t });
      },
      close: () => this.close(id),
      minimize: () => this.minimize(id),
      focus: () => focus(id),
      onClose: (fn) => {
        rec.onClose = fn;
      },
      onReopen: (fn) => {
        rec.reopenHandler = fn;
      },
    };
    rec.api = api;

    try {
      mount(body, api);
    } catch (err) {
      console.error(`[LilOS] app "${appId}" failed to mount:`, err);
      body.innerHTML = `<div class="app-empty">This app hit an error and couldn't load.</div>`;
    }

    focus(id);
    bus.emit("wm:open", { id, appId, title, icon });
    return api;
  },

  close(id) {
    const rec = windows.get(id);
    if (!rec) return;
    rec.el.classList.add("closing");
    rec.onClose?.();
    setTimeout(() => {
      rec.el.remove();
      windows.delete(id);
      bus.emit("wm:close", { id });
    }, 150);
  },

  minimize(id) {
    const rec = windows.get(id);
    if (!rec) return;
    rec.minimized = true;
    rec.el.classList.add("minimized");
    bus.emit("wm:minimize", { id });
  },

  restore(id) {
    const rec = windows.get(id);
    if (!rec) return;
    rec.minimized = false;
    rec.el.classList.remove("minimized");
    focus(id);
    bus.emit("wm:restore", { id });
  },

  toggleMinimizeOrFocus(id) {
    const rec = windows.get(id);
    if (!rec) return;
    if (rec.minimized) {
      this.restore(id);
    } else if (rec.el.classList.contains("focused")) {
      this.minimize(id);
    } else {
      focus(id);
    }
  },

  toggleMaximize(id) {
    const rec = windows.get(id);
    if (!rec) return;
    if (rec.maximized) {
      rec.maximized = false;
      rec.el.classList.remove("maximized");
      if (rec.prevRect) Object.assign(rec, rec.prevRect);
      applyRect(rec);
    } else {
      rec.prevRect = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
      rec.maximized = true;
      rec.el.classList.add("maximized");
    }
    bus.emit("wm:maximize", { id, maximized: rec.maximized });
  },

  focus,

  closeAll() {
    [...windows.keys()].forEach((id) => this.close(id));
  },
};
