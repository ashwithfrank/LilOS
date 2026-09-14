// LilOS — apps/about.js

import { formatBytes } from "../core/utils.js";
import { storageUsage } from "../filesystem/vfs.js";

export const aboutApp = {
  id: "about",
  name: "About LilOS",
  icon: "🛈",
  width: 380,
  height: 420,
  singleton: true,

  mount(container, winApi, ctx) {
    container.innerHTML = `
      <div class="about-wrap">
        <div class="about-logo">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" stroke="white" stroke-width="1.6" fill="none"/>
            <circle cx="12" cy="12" r="3.2" fill="white"/>
          </svg>
        </div>
        <h2>LilOS</h2>
        <div class="about-version">Version ${ctx.settings.get("version")} · Web Edition</div>
        <p style="font-size:12.5px;color:var(--text-1);max-width:280px;margin-top:10px;line-height:1.6;">
          A tiny operating system that lives entirely inside your browser tab.
          Every file, note, and setting is stored on this device — nothing is
          ever sent anywhere.
        </p>
        <div class="about-stats" id="about-stats"></div>
        <div style="margin-top:16px;font-size:11px;color:var(--text-2);">Built with HTML, CSS &amp; vanilla JavaScript.</div>
      </div>`;

    storageUsage().then(({ bytes, files, folders }) => {
      container.querySelector("#about-stats").innerHTML = `
        <div><b>${files}</b>Files</div>
        <div><b>${folders}</b>Folders</div>
        <div><b>${formatBytes(bytes)}</b>Used</div>
        <div><b>Local</b>Storage</div>
      `;
    });
  },
};
