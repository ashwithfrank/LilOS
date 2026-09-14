// LilOS — core/utils.js
// Small dependency-free helpers shared across modules.

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function debounce(fn, wait = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Escape user content before it is ever placed via innerHTML.
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function formatTime(date, { seconds = false, hour12 = true } = {}) {
  const opts = { hour: "numeric", minute: "2-digit", hour12 };
  if (seconds) opts.second = "2-digit";
  return date.toLocaleTimeString([], opts);
}

export function formatDate(date, style = "medium") {
  if (style === "long") {
    return date.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  if (style === "short") {
    return date.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
  }
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

// Very small event bus so modules can talk without hard imports both ways.
export class EventBus {
  constructor() {
    this._map = new Map();
  }
  on(evt, fn) {
    if (!this._map.has(evt)) this._map.set(evt, new Set());
    this._map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    this._map.get(evt)?.delete(fn);
  }
  emit(evt, payload) {
    this._map.get(evt)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[LilOS] listener for "${evt}" failed:`, err);
      }
    });
  }
}

export const bus = new EventBus();

// Splits a virtual path like "/Documents/notes.txt" into clean segments.
export function splitPath(path) {
  return String(path)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinPath(...parts) {
  const segs = parts.flatMap((p) => splitPath(p));
  return "/" + segs.join("/");
}

export function fileExt(name) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function niceAppUrl(raw) {
  let v = raw.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v) && !v.includes(" ")) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}&igu=1`;
}
