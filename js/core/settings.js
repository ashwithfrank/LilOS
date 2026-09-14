// LilOS — core/settings.js
// A tiny reactive settings store, persisted to localStorage, applied live to <html>.

import { bus } from "./utils.js";

const KEY = "lilos.settings.v1";

export const ACCENTS = [
  { id: "violet", h: 248, s: 92, l: 69 },
  { id: "blue", h: 210, s: 90, l: 60 },
  { id: "teal", h: 174, s: 62, l: 48 },
  { id: "rose", h: 340, s: 82, l: 62 },
  { id: "amber", h: 34, s: 92, l: 58 },
  { id: "green", h: 142, s: 55, l: 48 },
];

export const WALLPAPERS = [
  { id: "aurora", label: "Aurora" },
  { id: "sunset", label: "Sunset" },
  { id: "forest", label: "Forest" },
  { id: "ocean", label: "Ocean" },
  { id: "peach", label: "Peach" },
  { id: "mono", label: "Monochrome" },
];

const DEFAULTS = {
  themeMode: "dark", // 'dark' | 'light' | 'system'
  accent: "violet",
  wallpaper: "aurora",
  transparency: "high", // 'high' | 'low' | 'off'
  blur: 22,
  animations: true,
  showDesktopIcons: true,
  taskbarBehavior: "always", // 'always' | 'autohide'
  clockFormat: "12h",
  version: "1.0.0",
};

let state = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    state = { ...DEFAULTS };
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[LilOS] could not persist settings:", err);
  }
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyToDom() {
  const root = document.documentElement;
  const effectiveMode = state.themeMode === "system" ? (systemPrefersDark() ? "dark" : "light") : state.themeMode;
  root.setAttribute("data-theme", effectiveMode);
  root.setAttribute("data-transparency", state.transparency);
  root.setAttribute("data-anim", state.animations ? "on" : "off");
  root.setAttribute("data-taskbar", state.taskbarBehavior);
  root.style.setProperty("--blur-amount", `${state.blur}px`);

  const accent = ACCENTS.find((a) => a.id === state.accent) || ACCENTS[0];
  root.style.setProperty("--accent-h", accent.h);
  root.style.setProperty("--accent-s", `${accent.s}%`);
  root.style.setProperty("--accent-l", `${accent.l}%`);

  const wallpaperEl = document.querySelector(".wallpaper");
  if (wallpaperEl) wallpaperEl.setAttribute("data-wallpaper", state.wallpaper);

  const iconsEl = document.getElementById("desktop-icons");
  if (iconsEl) iconsEl.classList.toggle("hidden", !state.showDesktopIcons);
}

export const settings = {
  init() {
    load();
    applyToDom();
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
        if (state.themeMode === "system") applyToDom();
      });
    }
  },
  get(key) {
    return state[key];
  },
  getAll() {
    return { ...state };
  },
  set(key, value) {
    state[key] = value;
    save();
    applyToDom();
    bus.emit("settings:change", { key, value, all: this.getAll() });
  },
  update(partial) {
    Object.assign(state, partial);
    save();
    applyToDom();
    bus.emit("settings:change", { all: this.getAll() });
  },
  reset() {
    state = { ...DEFAULTS };
    save();
    applyToDom();
    bus.emit("settings:change", { all: this.getAll() });
  },
};
