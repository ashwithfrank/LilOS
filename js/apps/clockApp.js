// LilOS — apps/clockApp.js

import { formatTime, formatDate } from "../core/utils.js";

function fmtMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return h === "00" ? `${m}:${s}.${cs}` : `${h}:${m}:${s}`;
}

export const clockApp = {
  id: "clock",
  name: "Clock",
  icon: "🕒",
  width: 380,
  height: 420,
  singleton: true,

  mount(container) {
    container.innerHTML = `
      <div class="app-toolbar" style="justify-content:center; gap:6px;">
        <button class="btn active" data-tab="clock">Clock</button>
        <button class="btn" data-tab="stopwatch">Stopwatch</button>
        <button class="btn" data-tab="timer">Timer</button>
      </div>
      <div id="clock-panels" style="flex:1; display:flex; min-height:0;"></div>`;

    const panels = container.querySelector("#clock-panels");
    const tabBtns = [...container.querySelectorAll("[data-tab]")];
    let interval = null;

    function showTab(tab) {
      clearInterval(interval);
      tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
      if (tab === "clock") renderClock();
      if (tab === "stopwatch") renderStopwatch();
      if (tab === "timer") renderTimer();
    }

    function renderClock() {
      panels.innerHTML = `
        <div class="clock-wrap">
          <div class="clock-big" id="cw-time">--:--</div>
          <div class="clock-date" id="cw-date"></div>
          <div class="clock-tz">${Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
        </div>`;
      const timeEl = panels.querySelector("#cw-time");
      const dateEl = panels.querySelector("#cw-date");
      function tick() {
        const now = new Date();
        timeEl.textContent = formatTime(now, { seconds: true });
        dateEl.textContent = formatDate(now, "long");
      }
      tick();
      interval = setInterval(tick, 1000);
    }

    function renderStopwatch() {
      let running = false;
      let startedAt = 0;
      let elapsed = 0;
      panels.innerHTML = `
        <div class="clock-wrap">
          <div class="stopwatch-time" id="sw-time">00:00.00</div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-accent" id="sw-toggle">Start</button>
            <button class="btn" id="sw-reset">Reset</button>
          </div>
        </div>`;
      const timeEl = panels.querySelector("#sw-time");
      const toggleBtn = panels.querySelector("#sw-toggle");
      function tick() {
        timeEl.textContent = fmtMs(elapsed + (running ? Date.now() - startedAt : 0));
      }
      toggleBtn.addEventListener("click", () => {
        running = !running;
        if (running) { startedAt = Date.now(); toggleBtn.textContent = "Pause"; }
        else { elapsed += Date.now() - startedAt; toggleBtn.textContent = "Start"; }
      });
      panels.querySelector("#sw-reset").addEventListener("click", () => {
        running = false; elapsed = 0; toggleBtn.textContent = "Start"; tick();
      });
      tick();
      interval = setInterval(tick, 30);
    }

    function renderTimer() {
      let remaining = 0;
      let running = false;
      let target = 0;
      panels.innerHTML = `
        <div class="clock-wrap">
          <div class="stopwatch-time" id="tm-time">00:00</div>
          <div class="timer-presets">
            <button class="btn" data-sec="60">1m</button>
            <button class="btn" data-sec="300">5m</button>
            <button class="btn" data-sec="600">10m</button>
            <button class="btn" data-sec="1800">30m</button>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-accent" id="tm-toggle">Start</button>
            <button class="btn" id="tm-reset">Reset</button>
          </div>
        </div>`;
      const timeEl = panels.querySelector("#tm-time");
      const toggleBtn = panels.querySelector("#tm-toggle");
      function render() {
        timeEl.textContent = fmtMs(Math.max(0, remaining));
      }
      panels.querySelectorAll("[data-sec]").forEach((b) => {
        b.addEventListener("click", () => {
          remaining = Number(b.dataset.sec) * 1000;
          running = false;
          toggleBtn.textContent = "Start";
          render();
        });
      });
      toggleBtn.addEventListener("click", () => {
        if (remaining <= 0) return;
        running = !running;
        if (running) { target = Date.now() + remaining; toggleBtn.textContent = "Pause"; }
        else { remaining = target - Date.now(); toggleBtn.textContent = "Start"; }
      });
      panels.querySelector("#tm-reset").addEventListener("click", () => {
        running = false; remaining = 0; toggleBtn.textContent = "Start"; render();
      });
      render();
      interval = setInterval(() => {
        if (running) {
          remaining = target - Date.now();
          if (remaining <= 0) { remaining = 0; running = false; toggleBtn.textContent = "Start"; }
          render();
        }
      }, 200);
    }

    tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    showTab("clock");

    return () => clearInterval(interval);
  },
};
