// LilOS — core/notifications.js
// Toast popups + a persistent notification history panel.

import { escapeHtml, uid, formatTime, bus } from "./utils.js";

const KEY = "lilos.notifications.v1";
const MAX_HISTORY = 50;
const ICONS = { info: "ℹ️", success: "✅", warning: "⚠️", error: "⛔️" };

let history = [];

function load() {
  try {
    history = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    history = [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    /* storage full or unavailable — non-fatal for notifications */
  }
}

function renderPanel() {
  const list = document.getElementById("notif-list");
  if (!list) return;
  if (!history.length) {
    list.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
    return;
  }
  list.innerHTML = history
    .map(
      (n) => `
      <div class="notif-item">
        <div class="n-title">${ICONS[n.type] || ICONS.info} ${escapeHtml(n.title)}</div>
        ${n.message ? `<div class="n-msg">${escapeHtml(n.message)}</div>` : ""}
        <div class="n-time">${formatTime(new Date(n.time))}</div>
      </div>`
    )
    .join("");
}

function toast(n) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast glass";
  el.innerHTML = `
    <div class="toast-icon">${ICONS[n.type] || ICONS.info}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(n.title)}</div>
      ${n.message ? `<div class="toast-msg">${escapeHtml(n.message)}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Dismiss">✕</button>`;
  stack.appendChild(el);
  const remove = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector(".toast-close").addEventListener("click", remove);
  setTimeout(remove, 4600);
}

export const notifications = {
  init() {
    load();
  },
  push(title, message = "", type = "info") {
    const entry = { id: uid("n"), title, message, type, time: Date.now() };
    history.unshift(entry);
    history = history.slice(0, MAX_HISTORY);
    save();
    toast(entry);
    renderPanel();
    bus.emit("notif:new", entry);
    return entry.id;
  },
  clearAll() {
    history = [];
    save();
    renderPanel();
  },
  renderPanel,
  count() {
    return history.length;
  },
};
