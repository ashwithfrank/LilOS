// LilOS — apps/notes.js
// A lightweight sticky-notes style app. Persists to localStorage as its
// own small store (separate from the virtual filesystem, like a real
// bundled Notes app rather than a filesystem browser).

import { uid, escapeHtml, formatDate, debounce } from "../core/utils.js";

const KEY = "lilos.notes.v1";

function load() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(notes) {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

export const notesApp = {
  id: "notes",
  name: "Notes",
  icon: "🗒️",
  width: 620,
  height: 440,
  singleton: true,

  mount(container, winApi, ctx) {
    let notes = load();
    if (!notes.length) {
      notes = [{ id: uid("note"), title: "My first note", body: "Write anything here — it saves automatically.", updated: Date.now() }];
      save(notes);
    }
    let activeId = notes[0].id;

    container.innerHTML = `
      <div class="app-toolbar">
        <button class="btn" id="notes-new">＋ New note</button>
        <div class="grow"></div>
        <button class="btn btn-danger" id="notes-delete">Delete</button>
      </div>
      <div class="notes-layout">
        <div class="notes-list scrollpane" id="notes-list"></div>
        <div class="notes-editor">
          <input class="notes-title-input" id="notes-title" placeholder="Title" />
          <textarea class="notes-body-input" id="notes-body" placeholder="Start typing…"></textarea>
        </div>
      </div>`;

    const listEl = container.querySelector("#notes-list");
    const titleEl = container.querySelector("#notes-title");
    const bodyEl = container.querySelector("#notes-body");

    function renderList() {
      const sorted = [...notes].sort((a, b) => b.updated - a.updated);
      listEl.innerHTML = sorted
        .map(
          (n) => `
        <div class="notes-list-item ${n.id === activeId ? "active" : ""}" data-id="${n.id}">
          <div class="nl-title">${escapeHtml(n.title || "Untitled")}</div>
          <div class="nl-preview">${escapeHtml((n.body || "").slice(0, 60) || "No additional text")}</div>
        </div>`
        )
        .join("");
    }

    function loadActive() {
      const n = notes.find((x) => x.id === activeId) || notes[0];
      if (!n) return;
      activeId = n.id;
      titleEl.value = n.title;
      bodyEl.value = n.body;
    }

    const persist = debounce(() => {
      save(notes);
      renderList();
    }, 300);

    function updateActive(field, value) {
      const n = notes.find((x) => x.id === activeId);
      if (!n) return;
      n[field] = value;
      n.updated = Date.now();
      persist();
    }

    listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".notes-list-item");
      if (!item) return;
      activeId = item.dataset.id;
      loadActive();
      renderList();
    });

    container.querySelector("#notes-new").addEventListener("click", () => {
      const n = { id: uid("note"), title: "New note", body: "", updated: Date.now() };
      notes.unshift(n);
      activeId = n.id;
      save(notes);
      renderList();
      loadActive();
      titleEl.focus();
      titleEl.select();
    });

    container.querySelector("#notes-delete").addEventListener("click", () => {
      if (notes.length <= 1) {
        ctx.notify("Can't delete", "Keep at least one note.", "warning");
        return;
      }
      notes = notes.filter((n) => n.id !== activeId);
      save(notes);
      activeId = notes[0].id;
      renderList();
      loadActive();
    });

    titleEl.addEventListener("input", () => updateActive("title", titleEl.value));
    bodyEl.addEventListener("input", () => updateActive("body", bodyEl.value));

    renderList();
    loadActive();
  },
};
