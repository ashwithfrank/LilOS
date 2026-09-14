// LilOS — filesystem/vfs.js
// A small tree-shaped virtual filesystem persisted in IndexedDB.
// Every node lives under a single "root" node, so there is no way to
// address anything outside of it — that is the path-traversal protection.

import { idb } from "./idb.js";
import { uid, splitPath, bus } from "../core/utils.js";

export const ROOT_ID = "root";

const DEFAULT_FOLDERS = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos", "Apps"];

const WELCOME_TXT = `Welcome to LilOS!

This is your personal virtual filesystem. Everything you create here
is stored locally in your browser (IndexedDB) and will still be here
the next time you open LilOS on this device and browser.

Things to try:
  - Open the Terminal and run "help"
  - Drop a few files in Documents with the Text Editor
  - Right-click the desktop or any file for more options

Nothing here ever leaves your browser.
`;

let cache = null; // id -> node, kept in sync with IndexedDB
let ready = null;

function validateName(name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Name cannot be empty.");
  if (n === "." || n === "..") throw new Error("That name is reserved.");
  if (/[\/\\]/.test(n)) throw new Error("Names cannot contain \"/\" or \"\\\".");
  if (n.length > 120) throw new Error("Name is too long.");
  return n;
}

async function loadCache() {
  const all = await idb.all();
  cache = new Map(all.map((n) => [n.id, n]));
}

async function persist(node) {
  cache.set(node.id, node);
  await idb.put(node);
  bus.emit("fs:change", { id: node.id });
  return node;
}

async function ensureReady() {
  if (ready) return ready;
  ready = (async () => {
    await loadCache();
    if (!cache.has(ROOT_ID)) {
      await persist({
        id: ROOT_ID,
        name: "LilOS",
        type: "folder",
        parentId: null,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      });
      for (const folder of DEFAULT_FOLDERS) {
        await createFolder(ROOT_ID, folder, { silent: true });
      }
      const docs = childrenSync(ROOT_ID).find((n) => n.name === "Documents");
      if (docs) await createFile(docs.id, "Welcome.txt", WELCOME_TXT, { silent: true });
    }
  })();
  return ready;
}

function childrenSync(parentId) {
  return [...cache.values()].filter((n) => n.parentId === parentId);
}

function uniqueName(parentId, baseName) {
  const siblings = new Set(childrenSync(parentId).map((n) => n.name));
  if (!siblings.has(baseName)) return baseName;
  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : "";
  let i = 2;
  while (siblings.has(`${stem} (${i})${ext}`)) i++;
  return `${stem} (${i})${ext}`;
}

export async function getNode(id) {
  await ensureReady();
  return cache.get(id) || null;
}

export async function getChildren(parentId) {
  await ensureReady();
  return childrenSync(parentId).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

export async function getPath(id) {
  await ensureReady();
  const parts = [];
  let node = cache.get(id);
  while (node && node.id !== ROOT_ID) {
    parts.unshift(node.name);
    node = cache.get(node.parentId);
  }
  return "/" + parts.join("/");
}

export async function getBreadcrumb(id) {
  await ensureReady();
  const chain = [];
  let node = cache.get(id);
  while (node) {
    chain.unshift(node);
    node = node.parentId ? cache.get(node.parentId) : null;
  }
  return chain;
}

// Resolve a path string (absolute "/Documents/x" or relative "x/y", supports "..")
// starting from cwdId. Never escapes root. Returns the node or null.
export async function resolvePath(pathStr, cwdId = ROOT_ID) {
  await ensureReady();
  const isAbsolute = pathStr.trim().startsWith("/");
  let current = isAbsolute ? ROOT_ID : cwdId;
  const segs = splitPath(pathStr);
  for (const seg of segs) {
    if (seg === ".") continue;
    if (seg === "..") {
      const node = cache.get(current);
      current = node && node.parentId ? node.parentId : ROOT_ID;
      continue;
    }
    const node = cache.get(current);
    if (!node || node.type !== "folder") return null;
    const match = childrenSync(current).find((c) => c.name === seg);
    if (!match) return null;
    current = match.id;
  }
  return cache.get(current) || null;
}

export async function createFolder(parentId, name, opts = {}) {
  await ensureReady();
  const parent = cache.get(parentId);
  if (!parent || parent.type !== "folder") throw new Error("Destination is not a folder.");
  const clean = opts.silent ? name : uniqueName(parentId, validateName(name));
  const node = {
    id: uid("f"),
    name: clean,
    type: "folder",
    parentId,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  return persist(node);
}

export async function createFile(parentId, name, content = "", opts = {}) {
  await ensureReady();
  const parent = cache.get(parentId);
  if (!parent || parent.type !== "folder") throw new Error("Destination is not a folder.");
  const clean = opts.silent ? name : uniqueName(parentId, validateName(name));
  const node = {
    id: uid("file"),
    name: clean,
    type: "file",
    parentId,
    content,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  return persist(node);
}

export async function writeFile(id, content) {
  await ensureReady();
  const node = cache.get(id);
  if (!node || node.type !== "file") throw new Error("Not a file.");
  node.content = content;
  node.modifiedAt = Date.now();
  return persist(node);
}

export async function rename(id, newName) {
  await ensureReady();
  const node = cache.get(id);
  if (!node) throw new Error("Not found.");
  if (node.id === ROOT_ID) throw new Error("Cannot rename root.");
  const clean = validateName(newName);
  const clash = childrenSync(node.parentId).some((c) => c.id !== id && c.name === clean);
  if (clash) throw new Error(`"${clean}" already exists here.`);
  node.name = clean;
  node.modifiedAt = Date.now();
  return persist(node);
}

function collectDescendants(id, acc = []) {
  for (const child of childrenSync(id)) {
    acc.push(child);
    if (child.type === "folder") collectDescendants(child.id, acc);
  }
  return acc;
}

export async function deleteNode(id) {
  await ensureReady();
  if (id === ROOT_ID) throw new Error("Cannot delete root.");
  const node = cache.get(id);
  if (!node) return;
  const doomed = [node, ...collectDescendants(id)];
  for (const n of doomed) {
    cache.delete(n.id);
    await idb.delete(n.id);
  }
  bus.emit("fs:change", { id: node.parentId });
}

function isDescendantOf(candidateId, ancestorId) {
  let node = cache.get(candidateId);
  while (node && node.parentId) {
    if (node.parentId === ancestorId) return true;
    node = cache.get(node.parentId);
  }
  return false;
}

export async function moveNode(id, destParentId) {
  await ensureReady();
  if (id === ROOT_ID) throw new Error("Cannot move root.");
  const node = cache.get(id);
  const dest = cache.get(destParentId);
  if (!node || !dest || dest.type !== "folder") throw new Error("Invalid destination.");
  if (id === destParentId || isDescendantOf(destParentId, id)) {
    throw new Error("Cannot move a folder into itself.");
  }
  node.name = uniqueName(destParentId, node.name);
  node.parentId = destParentId;
  node.modifiedAt = Date.now();
  return persist(node);
}

export async function copyNode(id, destParentId) {
  await ensureReady();
  const node = cache.get(id);
  const dest = cache.get(destParentId);
  if (!node || !dest || dest.type !== "folder") throw new Error("Invalid destination.");
  if (isDescendantOf(destParentId, id) || id === destParentId) {
    // still allowed (duplicate in place) unless copying into own descendant
    if (isDescendantOf(destParentId, id)) throw new Error("Cannot copy a folder into itself.");
  }
  async function cloneInto(src, targetParentId) {
    const name = uniqueName(targetParentId, src.name);
    if (src.type === "file") {
      return createFile(targetParentId, name, src.content || "", { silent: true });
    }
    const folder = await createFolder(targetParentId, name, { silent: true });
    for (const child of childrenSync(src.id)) {
      await cloneInto(child, folder.id);
    }
    return folder;
  }
  return cloneInto(node, destParentId);
}

export async function search(query, startId = ROOT_ID) {
  await ensureReady();
  const q = query.toLowerCase();
  const results = [];
  function walk(id) {
    for (const child of childrenSync(id)) {
      if (child.name.toLowerCase().includes(q)) results.push(child);
      if (child.type === "folder") walk(child.id);
    }
  }
  walk(startId);
  return results;
}

export async function tree(id = ROOT_ID, depth = Infinity) {
  await ensureReady();
  function build(nodeId, d) {
    const node = cache.get(nodeId);
    const line = { node, children: [] };
    if (node.type === "folder" && d < depth) {
      for (const child of childrenSync(nodeId)) {
        line.children.push(build(child.id, d + 1));
      }
    }
    return line;
  }
  return build(id, 0);
}

export async function storageUsage() {
  await ensureReady();
  let bytes = 0;
  let files = 0;
  let folders = 0;
  for (const n of cache.values()) {
    if (n.type === "file") {
      bytes += new Blob([n.content || ""]).size;
      files++;
    } else {
      folders++;
    }
  }
  return { bytes, files, folders };
}

export async function resetAll() {
  await idb.clearAll();
  cache = null;
  ready = null;
  await ensureReady();
}

export async function getWellKnownFolder(name) {
  const kids = await getChildren(ROOT_ID);
  return kids.find((n) => n.name === name) || null;
}
