// LilOS — apps/textEditor.js

import * as vfs from "../filesystem/vfs.js";
import { uid, escapeHtml } from "../core/utils.js";
import { confirmDialog, promptDialog } from "../core/dialog.js";

export const textEditorApp = {
  id: "texteditor",
  name: "Text Editor",
  icon: "📝",
  width: 620,
  height: 460,
  singleton: true,

  async mount(container, winApi, ctx, payload) {
    // docs: { tabId, fileId|null, name, content, dirty }
    let docs = [];
    let activeTabId = null;

    container.innerHTML = `
      <div class="app-toolbar">
        <div class="editor-tabs" id="editor-tabs"></div>
        <div class="grow"></div>
        <button class="btn" id="ed-new">＋ New</button>
        <button class="btn" id="ed-open">Open…</button>
        <button class="btn btn-accent" id="ed-save">Save</button>
        <button class="btn" id="ed-saveas">Save As</button>
        <button class="btn" id="ed-find">Find</button>
      </div>
      <div class="app-toolbar editor-find" id="ed-find-row" style="display:none;">
        <input class="field" id="ed-find-input" placeholder="Find" />
        <input class="field" id="ed-replace-input" placeholder="Replace with" />
        <button class="btn" id="ed-find-next">Next</button>
        <button class="btn" id="ed-replace-all">Replace All</button>
        <button class="btn btn-icon" id="ed-find-close">✕</button>
      </div>
      <textarea class="editor-textarea" id="ed-textarea" spellcheck="false"></textarea>
      <div class="app-statusbar" id="ed-status"></div>`;

    const tabsEl = container.querySelector("#editor-tabs");
    const textarea = container.querySelector("#ed-textarea");
    const statusEl = container.querySelector("#ed-status");
    const findRow = container.querySelector("#ed-find-row");

    function activeDoc() {
      return docs.find((d) => d.tabId === activeTabId);
    }

    function renderTabs() {
      tabsEl.innerHTML = docs
        .map(
          (d) => `<div class="editor-tab ${d.tabId === activeTabId ? "active" : ""} ${d.dirty ? "dirty" : ""}" data-tab="${d.tabId}">
          <span class="dot"></span><span>${escapeHtml(d.name)}</span><span class="x" data-close="${d.tabId}">✕</span>
        </div>`
        )
        .join("");
      tabsEl.querySelectorAll("[data-tab]").forEach((el) =>
        el.addEventListener("click", (e) => {
          if (e.target.closest("[data-close]")) return;
          switchTab(el.dataset.tab);
        })
      );
      tabsEl.querySelectorAll("[data-close]").forEach((el) =>
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          closeTab(el.dataset.close);
        })
      );
    }

    function updateStatus() {
      const d = activeDoc();
      if (!d) { statusEl.textContent = ""; return; }
      const words = d.content.trim() ? d.content.trim().split(/\s+/).length : 0;
      statusEl.textContent = `${words} words · ${d.content.length} characters${d.dirty ? " · Unsaved changes" : " · Saved"}`;
    }

    function switchTab(tabId) {
      const prev = activeDoc();
      if (prev) prev.content = textarea.value;
      activeTabId = tabId;
      const d = activeDoc();
      textarea.value = d ? d.content : "";
      textarea.disabled = !d;
      renderTabs();
      updateStatus();
    }

    function addDoc(doc) {
      docs.push(doc);
      activeTabId = doc.tabId;
      textarea.value = doc.content;
      textarea.disabled = false;
      renderTabs();
      updateStatus();
      textarea.focus();
    }

    async function newDoc() {
      addDoc({ tabId: uid("tab"), fileId: null, name: "Untitled.txt", content: "", dirty: false });
    }

    async function openFileById(fileId) {
      const existing = docs.find((d) => d.fileId === fileId);
      if (existing) { switchTab(existing.tabId); return; }
      const node = await vfs.getNode(fileId);
      if (!node || node.type !== "file") { ctx.notify("Can't open file", "File not found.", "error"); return; }
      addDoc({ tabId: uid("tab"), fileId: node.id, name: node.name, content: node.content || "", dirty: false });
    }

    async function openPicker() {
      const docsFolder = await vfs.getWellKnownFolder("Documents");
      const kids = docsFolder ? await vfs.getChildren(docsFolder.id) : [];
      const files = kids.filter((n) => n.type === "file");
      if (!files.length) { ctx.notify("No files yet", "Create a file first from File Explorer or Save As here.", "info"); return; }
      const choice = await promptDialog(
        "Open from Documents",
        `Type an exact file name:\n${files.map((f) => "• " + f.name).join("\n")}`,
        files[0].name
      );
      if (!choice) return;
      const match = files.find((f) => f.name === choice);
      if (match) openFileById(match.id);
      else ctx.notify("Not found", `No file named "${choice}" in Documents.`, "warning");
    }

    async function saveActive() {
      const d = activeDoc();
      if (!d) return;
      d.content = textarea.value;
      if (d.fileId) {
        await vfs.writeFile(d.fileId, d.content);
        d.dirty = false;
        ctx.notify("Saved", d.name, "success");
        renderTabs();
        updateStatus();
      } else {
        await saveAs();
      }
    }

    async function saveAs() {
      const d = activeDoc();
      if (!d) return;
      const name = await promptDialog("Save As", "File will be saved in Documents:", d.name);
      if (!name) return;
      const docsFolder = await vfs.getWellKnownFolder("Documents");
      const node = await vfs.createFile(docsFolder.id, name, textarea.value);
      d.fileId = node.id;
      d.name = node.name;
      d.dirty = false;
      renderTabs();
      updateStatus();
      ctx.notify("Saved", node.name, "success");
    }

    async function closeTab(tabId) {
      const d = docs.find((x) => x.tabId === tabId);
      if (!d) return;
      if (d.dirty) {
        const ok = await confirmDialog("Discard changes?", `"${d.name}" has unsaved changes.`, { danger: true, okLabel: "Discard" });
        if (!ok) return;
      }
      docs = docs.filter((x) => x.tabId !== tabId);
      if (activeTabId === tabId) activeTabId = docs[0]?.tabId || null;
      if (activeTabId) switchTab(activeTabId);
      else { textarea.value = ""; textarea.disabled = true; renderTabs(); updateStatus(); }
    }

    textarea.addEventListener("input", () => {
      const d = activeDoc();
      if (!d) return;
      d.content = textarea.value;
      d.dirty = true;
      renderTabs();
      updateStatus();
    });

    textarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveActive(); }
    });

    container.querySelector("#ed-new").addEventListener("click", newDoc);
    container.querySelector("#ed-open").addEventListener("click", openPicker);
    container.querySelector("#ed-save").addEventListener("click", saveActive);
    container.querySelector("#ed-saveas").addEventListener("click", saveAs);

    const findInput = container.querySelector("#ed-find-input");
    const replaceInput = container.querySelector("#ed-replace-input");
    container.querySelector("#ed-find").addEventListener("click", () => {
      findRow.style.display = findRow.style.display === "none" ? "flex" : "none";
      if (findRow.style.display === "flex") findInput.focus();
    });
    container.querySelector("#ed-find-close").addEventListener("click", () => (findRow.style.display = "none"));
    container.querySelector("#ed-find-next").addEventListener("click", () => {
      const q = findInput.value;
      if (!q) return;
      const from = textarea.selectionEnd || 0;
      let idx = textarea.value.indexOf(q, from);
      if (idx === -1) idx = textarea.value.indexOf(q, 0);
      if (idx === -1) { ctx.notify("Not found", `"${q}" not found.`, "info"); return; }
      textarea.focus();
      textarea.setSelectionRange(idx, idx + q.length);
    });
    container.querySelector("#ed-replace-all").addEventListener("click", () => {
      const q = findInput.value;
      if (!q) return;
      const d = activeDoc();
      if (!d) return;
      const count = textarea.value.split(q).length - 1;
      textarea.value = textarea.value.split(q).join(replaceInput.value);
      d.content = textarea.value;
      d.dirty = true;
      renderTabs();
      updateStatus();
      ctx.notify("Replaced", `${count} occurrence${count === 1 ? "" : "s"} replaced.`, "success");
    });

    if (payload?.fileId) await openFileById(payload.fileId);
    else await newDoc();

    winApi.onReopen((nextPayload) => {
      if (nextPayload?.fileId) openFileById(nextPayload.fileId);
      else newDoc();
    });
  },
};
