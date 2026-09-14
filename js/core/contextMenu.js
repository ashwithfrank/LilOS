// LilOS — core/contextMenu.js
// A single shared context-menu element, positioned near the cursor and
// clamped to the viewport, closed on outside click / Escape / scroll.

import { escapeHtml } from "./utils.js";

let menuEl = null;

function close() {
  menuEl?.remove();
  menuEl = null;
  document.removeEventListener("pointerdown", onOutside, true);
  document.removeEventListener("keydown", onKey, true);
}

function onOutside(e) {
  if (menuEl && !menuEl.contains(e.target)) close();
}
function onKey(e) {
  if (e.key === "Escape") close();
}

// items: [{ label, action, icon?, danger?, disabled?, separator? }]
export function showContextMenu(x, y, items) {
  close();
  menuEl = document.createElement("div");
  menuEl.className = "context-menu glass";
  menuEl.innerHTML = items
    .map((it) => {
      if (it.separator) return "<hr/>";
      return `<button data-idx="${items.indexOf(it)}" ${it.disabled ? "disabled" : ""} style="${it.danger ? "color:#ff8a80" : ""}">
        <span>${it.icon ? it.icon + " " : ""}${escapeHtml(it.label)}</span>
      </button>`;
    })
    .join("");

  document.body.appendChild(menuEl);
  const rect = menuEl.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  menuEl.style.left = `${Math.min(x, vw - rect.width - 8)}px`;
  menuEl.style.top = `${Math.min(y, vh - rect.height - 8)}px`;

  menuEl.querySelectorAll("button[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = items[Number(btn.dataset.idx)];
      close();
      item.action?.();
    });
  });

  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}

export function closeContextMenu() {
  close();
}
