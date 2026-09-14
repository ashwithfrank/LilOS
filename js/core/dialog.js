// LilOS — core/dialog.js
// Small promise-based modal dialogs (confirm / prompt) so apps never need
// the browser's native confirm()/prompt() which look out of place.

import { escapeHtml } from "./utils.js";

function open(innerHtml, { onMount } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    overlay.innerHTML = `<div class="dialog-box glass">${innerHtml}</div>`;
    document.body.appendChild(overlay);

    function finish(value) {
      overlay.remove();
      resolve(value);
    }
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) finish(null);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish(null);
    });
    onMount?.(overlay.querySelector(".dialog-box"), finish);
    overlay.querySelector("input")?.focus();
    overlay.querySelector("input")?.select();
  });
}

export function confirmDialog(title, message, { danger = false, okLabel = "Confirm" } = {}) {
  return open(
    `<h3>${escapeHtml(title)}</h3>
     <p>${escapeHtml(message)}</p>
     <div class="dialog-actions">
       <button class="btn" data-act="cancel">Cancel</button>
       <button class="btn ${danger ? "btn-danger" : "btn-accent"}" data-act="ok">${escapeHtml(okLabel)}</button>
     </div>`,
    {
      onMount: (box, finish) => {
        box.querySelector('[data-act="cancel"]').addEventListener("click", () => finish(false));
        box.querySelector('[data-act="ok"]').addEventListener("click", () => finish(true));
      },
    }
  ).then((v) => !!v);
}

export function promptDialog(title, message, defaultValue = "") {
  return open(
    `<h3>${escapeHtml(title)}</h3>
     ${message ? `<p>${escapeHtml(message)}</p>` : ""}
     <input class="field" id="dlg-input" value="${escapeHtml(defaultValue)}" style="margin-top:10px;" />
     <div class="dialog-actions">
       <button class="btn" data-act="cancel">Cancel</button>
       <button class="btn btn-accent" data-act="ok">OK</button>
     </div>`,
    {
      onMount: (box, finish) => {
        const input = box.querySelector("#dlg-input");
        box.querySelector('[data-act="cancel"]').addEventListener("click", () => finish(null));
        box.querySelector('[data-act="ok"]').addEventListener("click", () => finish(input.value));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") finish(input.value);
        });
      },
    }
  );
}
