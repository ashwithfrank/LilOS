// LilOS — apps/registry.js
// Central catalog of built-in apps, plus the launch() entry point every
// other module (desktop icons, taskbar, launcher, file explorer "open
// with", terminal) uses to open one.

import { windowManager } from "../window-manager/windowManager.js";
import { notifications } from "../core/notifications.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/utils.js";

import { fileExplorerApp } from "./fileExplorer.js";
import { browserApp } from "./browser.js";
import { terminalApp } from "./terminal.js";
import { textEditorApp } from "./textEditor.js";
import { calculatorApp } from "./calculator.js";
import { notesApp } from "./notes.js";
import { clockApp } from "./clockApp.js";
import { calendarApp } from "./calendarApp.js";
import { settingsApp } from "./settingsApp.js";
import { aboutApp } from "./about.js";

export const APPS = [
  fileExplorerApp,
  browserApp,
  terminalApp,
  textEditorApp,
  calculatorApp,
  notesApp,
  clockApp,
  calendarApp,
  settingsApp,
  aboutApp,
];

const APP_BY_ID = new Map(APPS.map((a) => [a.id, a]));
const RECENT_KEY = "lilos.recentApps.v1";

function pushRecent(appId) {
  try {
    let recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    recent = [appId, ...recent.filter((id) => id !== appId)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* non-fatal */
  }
}

export function getRecentApps() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return ids.map((id) => APP_BY_ID.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

const ctx = {
  notify: (title, message, type) => notifications.push(title, message, type),
  settings,
  launch: (appId, payload) => launchApp(appId, payload),
};

export function launchApp(appId, payload) {
  const app = APP_BY_ID.get(appId);
  if (!app) {
    notifications.push("App not found", `"${appId}" isn't a known LilOS app.`, "error");
    return null;
  }
  pushRecent(appId);
  const api = windowManager.open({
    appId: app.id,
    title: app.name,
    icon: app.icon,
    width: app.width,
    height: app.height,
    minWidth: app.minWidth,
    minHeight: app.minHeight,
    singleton: !!app.singleton,
    payload,
    mount: (container, winApi) => {
      const cleanup = app.mount(container, winApi, ctx, payload);
      if (typeof cleanup?.then === "function") {
        cleanup.catch((err) => console.error(`[LilOS] ${app.id} mount failed:`, err));
      } else if (typeof cleanup === "function") {
        winApi.onClose(cleanup);
      }
    },
  });
  bus.emit("apps:launched", { appId });
  return api;
}

export function getApp(appId) {
  return APP_BY_ID.get(appId);
}
