// LilOS — apps/settingsApp.js

import { settings, ACCENTS, WALLPAPERS } from "../core/settings.js";
import { formatBytes } from "../core/utils.js";
import { storageUsage, resetAll } from "../filesystem/vfs.js";
import { confirmDialog } from "../core/dialog.js";

const ACCENT_HEX = {
  violet: "#7c6cff", blue: "#4d8dff", teal: "#2fd6c4", rose: "#ff5f96", amber: "#ffb238", green: "#3ecf6b",
};

function switchRow(label, desc, checked, onChange) {
  const id = `sw-${Math.random().toString(36).slice(2, 8)}`;
  const wrap = document.createElement("div");
  wrap.className = "settings-row";
  wrap.innerHTML = `
    <div><div class="sr-label">${label}</div>${desc ? `<div class="sr-desc">${desc}</div>` : ""}</div>
    <label class="switch"><input type="checkbox" id="${id}" ${checked ? "checked" : ""}/><span class="slider"></span></label>`;
  wrap.querySelector("input").addEventListener("change", (e) => onChange(e.target.checked));
  return wrap;
}

export const settingsApp = {
  id: "settings",
  name: "Settings",
  icon: "⚙️",
  width: 640,
  height: 480,
  singleton: true,

  mount(container, winApi, ctx) {
    container.innerHTML = `
      <div class="settings-layout">
        <div class="settings-nav" id="set-nav">
          <button data-pane="appearance" class="active">🎨 Appearance</button>
          <button data-pane="desktop">🖥️ Desktop</button>
          <button data-pane="system">💾 System</button>
        </div>
        <div class="settings-pane scrollpane" id="set-pane"></div>
      </div>`;

    const nav = container.querySelector("#set-nav");
    const pane = container.querySelector("#set-pane");

    function renderAppearance() {
      pane.innerHTML = `<h2>Appearance</h2>`;
      const s = settings.getAll();

      const themeRow = document.createElement("div");
      themeRow.className = "settings-row";
      themeRow.innerHTML = `<div><div class="sr-label">Theme</div><div class="sr-desc">Light, dark, or match your system</div></div>`;
      const select = document.createElement("select");
      select.className = "field";
      select.innerHTML = `<option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option>`;
      select.value = s.themeMode;
      select.addEventListener("change", () => settings.set("themeMode", select.value));
      themeRow.appendChild(select);
      pane.appendChild(themeRow);

      const accentRow = document.createElement("div");
      accentRow.className = "settings-row";
      accentRow.innerHTML = `<div><div class="sr-label">Accent color</div><div class="sr-desc">Used for highlights and buttons</div></div>`;
      const swatchRow = document.createElement("div");
      swatchRow.className = "swatch-row";
      ACCENTS.forEach((a) => {
        const sw = document.createElement("button");
        sw.className = `swatch ${s.accent === a.id ? "active" : ""}`;
        sw.style.background = ACCENT_HEX[a.id];
        sw.title = a.id;
        sw.addEventListener("click", () => { settings.set("accent", a.id); renderAppearance(); });
        swatchRow.appendChild(sw);
      });
      accentRow.appendChild(swatchRow);
      pane.appendChild(accentRow);

      const wpRow = document.createElement("div");
      wpRow.innerHTML = `<div class="sr-label" style="margin-bottom:8px;">Wallpaper</div>`;
      const wpGrid = document.createElement("div");
      wpGrid.className = "wallpaper-grid";
      WALLPAPERS.forEach((w) => {
        const sw = document.createElement("div");
        sw.className = `wallpaper-swatch wallpaper ${s.wallpaper === w.id ? "active" : ""}`;
        sw.setAttribute("data-wallpaper", w.id);
        sw.title = w.label;
        sw.addEventListener("click", () => { settings.set("wallpaper", w.id); renderAppearance(); });
        wpGrid.appendChild(sw);
      });
      wpRow.appendChild(wpGrid);
      wpRow.style.padding = "12px 0";
      wpRow.style.borderBottom = "1px solid var(--border-a)";
      pane.appendChild(wpRow);

      const transRow = document.createElement("div");
      transRow.className = "settings-row";
      transRow.innerHTML = `<div><div class="sr-label">Transparency</div><div class="sr-desc">Glass-blur intensity of windows and menus</div></div>`;
      const transSelect = document.createElement("select");
      transSelect.className = "field";
      transSelect.innerHTML = `<option value="high">High</option><option value="low">Low</option><option value="off">Off</option>`;
      transSelect.value = s.transparency;
      transSelect.addEventListener("change", () => settings.set("transparency", transSelect.value));
      transRow.appendChild(transSelect);
      pane.appendChild(transRow);

      const blurRow = document.createElement("div");
      blurRow.className = "settings-row";
      blurRow.innerHTML = `<div><div class="sr-label">Blur intensity</div><div class="sr-desc">Fine-tune the glass blur radius</div></div>`;
      const blurRange = document.createElement("input");
      blurRange.type = "range"; blurRange.min = "4"; blurRange.max = "40"; blurRange.value = s.blur;
      blurRange.addEventListener("input", () => settings.set("blur", Number(blurRange.value)));
      blurRow.appendChild(blurRange);
      pane.appendChild(blurRow);

      pane.appendChild(switchRow("UI animations", "Window and menu transitions", s.animations, (v) => settings.set("animations", v)));
    }

    function renderDesktop() {
      pane.innerHTML = `<h2>Desktop</h2>`;
      const s = settings.getAll();
      pane.appendChild(switchRow("Show desktop icons", "Toggle icons on the desktop surface", s.showDesktopIcons, (v) => settings.set("showDesktopIcons", v)));

      const tbRow = document.createElement("div");
      tbRow.className = "settings-row";
      tbRow.innerHTML = `<div><div class="sr-label">Taskbar behavior</div><div class="sr-desc">Always visible, or hide until hovered</div></div>`;
      const tbSelect = document.createElement("select");
      tbSelect.className = "field";
      tbSelect.innerHTML = `<option value="always">Always show</option><option value="autohide">Auto-hide</option>`;
      tbSelect.value = s.taskbarBehavior;
      tbSelect.addEventListener("change", () => settings.set("taskbarBehavior", tbSelect.value));
      tbRow.appendChild(tbSelect);
      pane.appendChild(tbRow);

      const clockRow = document.createElement("div");
      clockRow.className = "settings-row";
      clockRow.innerHTML = `<div><div class="sr-label">Clock format</div><div class="sr-desc">Taskbar clock display</div></div>`;
      const clockSelect = document.createElement("select");
      clockSelect.className = "field";
      clockSelect.innerHTML = `<option value="12h">12-hour</option><option value="24h">24-hour</option>`;
      clockSelect.value = s.clockFormat;
      clockSelect.addEventListener("change", () => settings.set("clockFormat", clockSelect.value));
      clockRow.appendChild(clockSelect);
      pane.appendChild(clockRow);
    }

    async function renderSystem() {
      pane.innerHTML = `<h2>System</h2>`;
      const usage = await storageUsage();
      const estimateCap = 50 * 1024 * 1024; // rough visual reference, browsers vary
      const pct = Math.min(100, (usage.bytes / estimateCap) * 100);

      const storageBlock = document.createElement("div");
      storageBlock.className = "settings-row";
      storageBlock.style.flexDirection = "column";
      storageBlock.style.alignItems = "stretch";
      storageBlock.innerHTML = `
        <div class="sr-label">Virtual filesystem storage</div>
        <div class="storage-bar"><div class="storage-bar-fill" style="width:${pct}%"></div></div>
        <div class="sr-desc">${formatBytes(usage.bytes)} used · ${usage.files} files · ${usage.folders} folders</div>`;
      pane.appendChild(storageBlock);

      const infoRow = document.createElement("div");
      infoRow.className = "settings-row";
      infoRow.innerHTML = `<div><div class="sr-label">Browser storage status</div><div class="sr-desc">${"indexedDB" in window ? "IndexedDB available" : "IndexedDB unavailable"} · ${typeof localStorage !== "undefined" ? "localStorage available" : "localStorage unavailable"}</div></div>`;
      pane.appendChild(infoRow);

      const versionRow = document.createElement("div");
      versionRow.className = "settings-row";
      versionRow.innerHTML = `<div><div class="sr-label">LilOS version</div><div class="sr-desc">Web Edition</div></div><div>${settings.get("version")}</div>`;
      pane.appendChild(versionRow);

      const resetRow = document.createElement("div");
      resetRow.className = "settings-row";
      resetRow.innerHTML = `<div><div class="sr-label">Reset LilOS</div><div class="sr-desc">Erases all files, notes, settings and history on this device</div></div>`;
      const resetBtn = document.createElement("button");
      resetBtn.className = "btn btn-danger";
      resetBtn.textContent = "Reset everything";
      resetBtn.addEventListener("click", async () => {
        const ok = await confirmDialog("Reset LilOS?", "This deletes every file, note, and setting stored in this browser. This can't be undone.", { danger: true, okLabel: "Reset everything" });
        if (!ok) return;
        await resetAll();
        localStorage.clear();
        ctx.notify("LilOS reset", "Reloading…", "success");
        setTimeout(() => window.location.reload(), 700);
      });
      resetRow.appendChild(resetBtn);
      pane.appendChild(resetRow);
    }

    const panes = { appearance: renderAppearance, desktop: renderDesktop, system: renderSystem };
    nav.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        nav.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        panes[b.dataset.pane]();
      });
    });

    renderAppearance();
  },
};
