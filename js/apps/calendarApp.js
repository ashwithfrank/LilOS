// LilOS — apps/calendarApp.js

import { escapeHtml, uid } from "../core/utils.js";

const KEY = "lilos.calendar.v1";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
function dateKey(y, m, d) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }

export const calendarApp = {
  id: "calendar",
  name: "Calendar",
  icon: "📅",
  width: 620,
  height: 480,
  singleton: true,

  mount(container, winApi, ctx) {
    let events = load();
    const today = new Date();
    let viewY = today.getFullYear();
    let viewM = today.getMonth();
    let selectedKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

    container.innerHTML = `
      <div class="app-toolbar">
        <button class="btn btn-icon" id="cal-prev">‹</button>
        <div style="font-weight:600; min-width:150px; text-align:center;" id="cal-label"></div>
        <button class="btn btn-icon" id="cal-next">›</button>
        <div class="grow"></div>
        <button class="btn" id="cal-today">Today</button>
      </div>
      <div class="cal-body-flex">
        <div class="cal-main">
          <div class="cal-header"></div>
          <div class="cal-grid" id="cal-grid"></div>
        </div>
        <div class="cal-events-panel" id="cal-events"></div>
      </div>`;

    const gridEl = container.querySelector("#cal-grid");
    const labelEl = container.querySelector("#cal-label");
    const eventsEl = container.querySelector("#cal-events");

    function renderEventsPanel() {
      const list = events[selectedKey] || [];
      const [y, m, d] = selectedKey.split("-").map(Number);
      eventsEl.innerHTML = `
        <div style="font-weight:600; font-size:12.5px; margin-bottom:8px;">${MONTHS[m - 1]} ${d}, ${y}</div>
        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
          ${list.length ? list.map((ev) => `
            <div style="background:var(--surface-a1); border-radius:8px; padding:7px 8px; display:flex; justify-content:space-between; gap:6px;">
              <span style="font-size:12px;">${escapeHtml(ev.text)}</span>
              <button class="btn-icon" data-del="${ev.id}" style="width:20px;height:20px;font-size:11px;">✕</button>
            </div>`).join("") : `<div style="font-size:11.5px;color:var(--text-2);">No events</div>`}
        </div>
        <div style="display:flex; gap:6px;">
          <input class="field" id="cal-new-event" placeholder="Add event…" style="font-size:12px;"/>
          <button class="btn btn-accent" id="cal-add-event">Add</button>
        </div>`;
      eventsEl.querySelectorAll("[data-del]").forEach((b) => {
        b.addEventListener("click", () => {
          events[selectedKey] = (events[selectedKey] || []).filter((e) => e.id !== b.dataset.del);
          save(events);
          renderEventsPanel();
          renderGrid();
        });
      });
      const input = eventsEl.querySelector("#cal-new-event");
      function addEvent() {
        const text = input.value.trim();
        if (!text) return;
        events[selectedKey] = events[selectedKey] || [];
        events[selectedKey].push({ id: uid("ev"), text });
        save(events);
        input.value = "";
        renderEventsPanel();
        renderGrid();
        ctx.notify("Event added", text, "success");
      }
      eventsEl.querySelector("#cal-add-event").addEventListener("click", addEvent);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") addEvent(); });
    }

    function renderGrid() {
      labelEl.textContent = `${MONTHS[viewM]} ${viewY}`;
      const firstDow = new Date(viewY, viewM, 1).getDay();
      const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
      const daysInPrev = new Date(viewY, viewM, 0).getDate();
      let cells = "";
      cells += DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");

      const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
      for (let i = 0; i < totalCells; i++) {
        const dayNum = i - firstDow + 1;
        let y = viewY, m = viewM, d, muted = false;
        if (dayNum < 1) { d = daysInPrev + dayNum; m = viewM - 1; muted = true; if (m < 0) { m = 11; y--; } }
        else if (dayNum > daysInMonth) { d = dayNum - daysInMonth; m = viewM + 1; muted = true; if (m > 11) { m = 0; y++; } }
        else d = dayNum;
        const key = dateKey(y, m, d);
        const isToday = key === dateKey(today.getFullYear(), today.getMonth(), today.getDate());
        const hasEvents = (events[key] || []).length > 0;
        cells += `<div class="cal-cell ${muted ? "muted" : ""} ${isToday ? "today" : ""} ${key === selectedKey ? "selected" : ""}" data-key="${key}" data-y="${y}" data-m="${m}">
          <span class="cal-num">${d}</span>
          ${hasEvents ? `<span class="cal-event-dot"></span>` : ""}
        </div>`;
      }
      gridEl.innerHTML = cells;
      gridEl.querySelectorAll(".cal-cell[data-key]").forEach((cell) => {
        cell.addEventListener("click", () => {
          selectedKey = cell.dataset.key;
          const y = Number(cell.dataset.y), m = Number(cell.dataset.m);
          if (m !== viewM || y !== viewY) { viewY = y; viewM = m; renderGrid(); }
          else { gridEl.querySelectorAll(".cal-cell").forEach((c) => c.classList.remove("selected")); cell.classList.add("selected"); }
          renderEventsPanel();
        });
      });
    }

    container.querySelector("#cal-prev").addEventListener("click", () => {
      viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderGrid();
    });
    container.querySelector("#cal-next").addEventListener("click", () => {
      viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderGrid();
    });
    container.querySelector("#cal-today").addEventListener("click", () => {
      viewY = today.getFullYear(); viewM = today.getMonth();
      selectedKey = dateKey(viewY, viewM, today.getDate());
      renderGrid(); renderEventsPanel();
    });

    renderGrid();
    renderEventsPanel();
  },
};
