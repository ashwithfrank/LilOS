// LilOS — apps/fileExplorer.js
// A functional virtual file manager over the IndexedDB-backed VFS.

import * as vfs from "../filesystem/vfs.js";
import { escapeHtml, fileExt, formatBytes, bus } from "../core/utils.js";
import { showContextMenu } from "../core/contextMenu.js";
import { confirmDialog, promptDialog } from "../core/dialog.js";

const FOLDER_ICON = "📁";
const ICONS_BY_EXT = {
  txt: "📄", md: "📝", js: "📜", json: "🧾", css: "🎨", html: "🌐",
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️",
  mp3: "🎵", wav: "🎵", mp4: "🎬",
};
const TEXTY_EXT = new Set(["txt", "md", "js", "json", "css", "html", "csv", "log", "xml", "yml", "yaml", ""]);

function iconFor(node) {
  if (node.type === "folder") return FOLDER_ICON;
  return ICONS_BY_EXT[fileExt(node.name)] || "📄";
}

export const fileExplorerApp = {
  id: "fileexplorer",
  name: "File Explorer",
  icon: "🗂️",
  width: 680,
  height: 460,
  singleton: false,

  async mount(container, winApi, ctx, payload) {
    let currentId = payload?.openFolderId || vfs.ROOT_ID;
    let view = "grid";
    let sortBy = "name";
    let selection = new Set();
    let clipboard = null; // { mode: 'copy'|'cut', ids: [] }
    let searchQuery = "";
    let lastClickedIndex = -1;

    container.innerHTML = `
      <div class="app-toolbar">
        <button class="btn btn-icon" id="fe-back" title="Up">⬆️</button>
        <button class="btn" id="fe-new-folder">＋ Folder</button>
        <button class="btn" id="fe-new-file">＋ File</button>
        <div class="grow"></div>
        <input class="field" id="fe-search" placeholder="Search this OS…" style="max-width:160px;" />
        <select class="field" id="fe-sort" style="max-width:110px;">
          <option value="name">Name</option>
          <option value="modified">Modified</option>
          <option value="type">Type</option>
        </select>
        <button class="btn btn-icon" id="fe-view" title="Toggle view">▦</button>
      </div>
      <div class="fe-layout">
        <div class="fe-sidebar scrollpane" id="fe-sidebar"></div>
        <div class="fe-main">
          <div class="app-toolbar" style="border-top:none;">
            <div class="fe-breadcrumb" id="fe-breadcrumb"></div>
          </div>
          <div class="fe-items grid scrollpane" id="fe-items"></div>
          <div class="app-statusbar" id="fe-status"></div>
        </div>
      </div>`;

    const itemsEl = container.querySelector("#fe-items");
    const breadcrumbEl = container.querySelector("#fe-breadcrumb");
    const sidebarEl = container.querySelector("#fe-sidebar");
    const statusEl = container.querySelector("#fe-status");
    const searchEl = container.querySelector("#fe-search");
    const sortEl = container.querySelector("#fe-sort");

    async function renderSidebar() {
      const root = await vfs.getChildren(vfs.ROOT_ID);
      const wellKnown = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos", "Apps"];
      const items = wellKnown
        .map((name) => root.find((n) => n.name === name))
        .filter(Boolean);
      sidebarEl.innerHTML =
        `<button data-id="${vfs.ROOT_ID}" class="${currentId === vfs.ROOT_ID ? "active" : ""}">🏠 LilOS</button>` +
        items.map((n) => `<button data-id="${n.id}" class="${currentId === n.id ? "active" : ""}">${FOLDER_ICON} ${escapeHtml(n.name)}</button>`).join("");
      sidebarEl.querySelectorAll("button").forEach((b) => {
        b.addEventListener("click", () => openFolder(b.dataset.id));
        b.addEventListener("dragover", (e) => e.preventDefault());
        b.addEventListener("drop", async (e) => {
          e.preventDefault();
          const ids = getDraggedIds(e);
          for (const id of ids) await vfs.moveNode(id, b.dataset.id).catch(() => {});
          refresh();
        });
      });
    }

    async function renderBreadcrumb() {
      const chain = await vfs.getBreadcrumb(currentId);
      breadcrumbEl.innerHTML = chain
        .map((n, i) => `${i > 0 ? '<span class="sep">/</span>' : ""}<button data-id="${n.id}">${i === 0 ? "🏠 " : ""}${escapeHtml(n.name)}</button>`)
        .join("");
      breadcrumbEl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => openFolder(b.dataset.id)));
    }

    function getDraggedIds(e) {
      try {
        return JSON.parse(e.dataTransfer.getData("text/lilos-ids") || "[]");
      } catch {
        return [];
      }
    }

    async function renderItems() {
      let items;
      if (searchQuery.trim()) {
        items = await vfs.search(searchQuery.trim(), vfs.ROOT_ID);
      } else {
        items = await vfs.getChildren(currentId);
      }
      items = [...items].sort((a, b) => {
        if (sortBy === "modified") return b.modifiedAt - a.modifiedAt;
        if (sortBy === "type") return fileExt(a.name).localeCompare(fileExt(b.name)) || a.name.localeCompare(b.name);
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });

      if (!items.length) {
        itemsEl.innerHTML = `<div class="fe-empty">${searchQuery ? "No matches found." : "This folder is empty."}</div>`;
      } else {
        itemsEl.innerHTML = items
          .map(
            (n) => `
          <div class="fe-item ${selection.has(n.id) ? "selected" : ""}" draggable="true" data-id="${n.id}" data-type="${n.type}">
            <span class="fi-icon">${iconFor(n)}</span>
            <span class="fi-name">${escapeHtml(n.name)}</span>
            ${view === "list" ? `<span class="fi-meta">${n.type === "file" ? formatBytes(new Blob([n.content || ""]).size) : "Folder"}</span>` : ""}
          </div>`
          )
          .join("");
      }
      wireItemEvents(items);
      statusEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"}${selection.size ? ` · ${selection.size} selected` : ""}`;
    }

    function wireItemEvents(items) {
      const els = [...itemsEl.querySelectorAll(".fe-item")];
      els.forEach((el, idx) => {
        const id = el.dataset.id;
        el.addEventListener("click", (e) => {
          if (e.shiftKey && lastClickedIndex >= 0) {
            const [a, b] = [lastClickedIndex, idx].sort((x, y) => x - y);
            selection = new Set(els.slice(a, b + 1).map((x) => x.dataset.id));
          } else if (e.metaKey || e.ctrlKey) {
            selection.has(id) ? selection.delete(id) : selection.add(id);
            lastClickedIndex = idx;
          } else {
            selection = new Set([id]);
            lastClickedIndex = idx;
          }
          renderItems();
        });
        el.addEventListener("dblclick", () => openItem(items.find((n) => n.id === id)));
        el.addEventListener("dragstart", (e) => {
          const ids = selection.has(id) ? [...selection] : [id];
          e.dataTransfer.setData("text/lilos-ids", JSON.stringify(ids));
        });
        el.addEventListener("dragover", (e) => {
          if (el.dataset.type === "folder") e.preventDefault();
        });
        el.addEventListener("drop", async (e) => {
          if (el.dataset.type !== "folder") return;
          e.preventDefault();
          const ids = getDraggedIds(e);
          for (const mid of ids) if (mid !== id) await vfs.moveNode(mid, id).catch(() => {});
          refresh();
        });
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (!selection.has(id)) selection = new Set([id]);
          renderItems();
          openItemMenu(e.clientX, e.clientY, items.find((n) => n.id === id));
        });
      });
      itemsEl.oncontextmenu = (e) => {
        if (e.target !== itemsEl) return;
        e.preventDefault();
        selection = new Set();
        renderItems();
        openBackgroundMenu(e.clientX, e.clientY);
      };
    }

    async function openItem(node) {
      if (!node) return;
      if (node.type === "folder") {
        openFolder(node.id);
        return;
      }
      const ext = fileExt(node.name);
      if (TEXTY_EXT.has(ext)) {
        ctx.launch("texteditor", { fileId: node.id });
      } else {
        ctx.notify("Can't open this file", `LilOS doesn't have a built-in viewer for .${ext || "this"} files yet.`, "warning");
      }
    }

    function openFolder(id) {
      currentId = id;
      searchQuery = "";
      searchEl.value = "";
      selection = new Set();
      refresh();
    }

    async function refresh() {
      await renderSidebar();
      await renderBreadcrumb();
      await renderItems();
    }

    async function doNewFolder() {
      const name = await promptDialog("New folder", "Name your folder:", "New Folder");
      if (!name) return;
      try {
        await vfs.createFolder(currentId, name);
        ctx.notify("Folder created", name, "success");
        refresh();
      } catch (err) {
        ctx.notify("Couldn't create folder", err.message, "error");
      }
    }

    async function doNewFile() {
      const name = await promptDialog("New file", "Name your file:", "New File.txt");
      if (!name) return;
      try {
        await vfs.createFile(currentId, name, "");
        ctx.notify("File created", name, "success");
        refresh();
      } catch (err) {
        ctx.notify("Couldn't create file", err.message, "error");
      }
    }

    async function doRename(node) {
      const name = await promptDialog("Rename", "", node.name);
      if (!name || name === node.name) return;
      try {
        await vfs.rename(node.id, name);
        refresh();
      } catch (err) {
        ctx.notify("Couldn't rename", err.message, "error");
      }
    }

    async function doDelete(ids) {
      const ok = await confirmDialog(
        ids.length > 1 ? `Delete ${ids.length} items?` : "Delete this item?",
        "This can't be undone inside LilOS.",
        { danger: true, okLabel: "Delete" }
      );
      if (!ok) return;
      for (const id of ids) await vfs.deleteNode(id);
      selection = new Set();
      ctx.notify("Deleted", `${ids.length} item${ids.length > 1 ? "s" : ""} removed.`, "success");
      refresh();
    }

    async function doPaste() {
      if (!clipboard || !clipboard.ids.length) return;
      for (const id of clipboard.ids) {
        if (clipboard.mode === "copy") await vfs.copyNode(id, currentId).catch((e) => ctx.notify("Copy failed", e.message, "error"));
        else await vfs.moveNode(id, currentId).catch((e) => ctx.notify("Move failed", e.message, "error"));
      }
      if (clipboard.mode === "cut") clipboard = null;
      refresh();
    }

    async function showProperties(node) {
      const path = await vfs.getPath(node.id);
      const size = node.type === "file" ? formatBytes(new Blob([node.content || ""]).size) : `${(await vfs.getChildren(node.id)).length} items`;
      await promptDialog(
        `${node.name}`,
        `Type: ${node.type === "folder" ? "Folder" : "File"}\nPath: ${path}\nSize: ${size}\nModified: ${new Date(node.modifiedAt).toLocaleString()}`,
        path
      );
    }

    function openItemMenu(x, y, node) {
      const multi = selection.size > 1;
      showContextMenu(x, y, [
        { label: "Open", action: () => openItem(node), disabled: multi },
        { label: "Rename", action: () => doRename(node), disabled: multi },
        { separator: true },
        { label: "Cut", action: () => (clipboard = { mode: "cut", ids: [...selection] }) },
        { label: "Copy", action: () => (clipboard = { mode: "copy", ids: [...selection] }) },
        { label: "Paste", action: doPaste, disabled: !clipboard },
        { label: "Duplicate", action: async () => { for (const id of selection) await vfs.copyNode(id, currentId); refresh(); } },
        { separator: true },
        { label: "Delete", danger: true, action: () => doDelete([...selection]) },
        { separator: true },
        { label: "Properties", action: () => showProperties(node), disabled: multi },
      ]);
    }

    function openBackgroundMenu(x, y) {
      showContextMenu(x, y, [
        { label: "New Folder", action: doNewFolder },
        { label: "New File", action: doNewFile },
        { separator: true },
        { label: "Paste", action: doPaste, disabled: !clipboard },
        { separator: true },
        { label: view === "grid" ? "Switch to List View" : "Switch to Grid View", action: toggleView },
      ]);
    }

    function toggleView() {
      view = view === "grid" ? "list" : "grid";
      itemsEl.classList.toggle("grid", view === "grid");
      itemsEl.classList.toggle("list", view === "list");
      renderItems();
    }

    container.querySelector("#fe-back").addEventListener("click", async () => {
      const node = await vfs.getNode(currentId);
      if (node && node.parentId) openFolder(node.parentId);
    });
    container.querySelector("#fe-new-folder").addEventListener("click", doNewFolder);
    container.querySelector("#fe-new-file").addEventListener("click", doNewFile);
    container.querySelector("#fe-view").addEventListener("click", toggleView);
    sortEl.addEventListener("change", () => { sortBy = sortEl.value; renderItems(); });
    searchEl.addEventListener("input", () => { searchQuery = searchEl.value; renderItems(); });

    container.addEventListener("keydown", (e) => {
      if (e.key === "Delete" && selection.size) doDelete([...selection]);
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selection.size) clipboard = { mode: "copy", ids: [...selection] };
      if ((e.ctrlKey || e.metaKey) && e.key === "x" && selection.size) clipboard = { mode: "cut", ids: [...selection] };
      if ((e.ctrlKey || e.metaKey) && e.key === "v") doPaste();
    });
    container.tabIndex = 0;

    const unsub = bus.on("fs:change", refresh);
    winApi.onClose(() => unsub());

    itemsEl.classList.add("grid");
    await refresh();
  },
};
