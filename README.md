# LilOS

LilOS is a small operating-system-style desktop environment that runs entirely inside a single browser tab. There's no backend, no build step, and no account system — everything (files, notes, settings, browser history, bookmarks) is stored locally in your browser via `IndexedDB` and `localStorage`, and it's all still there the next time you open the page in the same browser on the same device.

It's built as a static site so it can be deployed for free on **GitHub Pages**.

> LilOS is a genuine simulation, not a screenshot mock-up. The windows really drag and resize, the terminal really runs commands against a real (virtual) filesystem, the text editor really saves files, and everything really persists across refreshes.

---

## Features

**Login screen**
- Animated gradient / "liquid glass" boot screen, no credentials required
- Smooth zoom transition into the desktop

**Desktop & window manager**
- Desktop icons (pinned apps + the contents of your virtual `Desktop/` folder)
- Draggable, resizable windows with minimize / maximize / restore / focus (z-order)
- Windows are kept from drifting completely off-screen
- On narrow/mobile viewports, apps open full-screen automatically

**Taskbar & launcher**
- Floating, centered, glass taskbar with running-app indicators and a live clock
- Launcher with app search, a grid of every app, a "recently used" row, and power controls (Log Out, Sleep, Restart)

**Notifications**
- Toast pop-ups plus a persistent notification history panel, used by every app for file operations, saves, errors, etc.

**Built-in Browser**
- Tabs, back/forward/reload/home, an address bar that treats plain text as a search, bookmarks (with a bookmarks bar), and history
- Pages load in a sandboxed `<iframe>`. When a site refuses to be framed (`X-Frame-Options` / `CSP frame-ancestors`), LilOS **does not** try to bypass that — it shows a clear "open in your real browser" fallback instead

**File Explorer**
- A real virtual filesystem (folders: `Desktop`, `Documents`, `Downloads`, `Pictures`, `Music`, `Videos`, `Apps`)
- Create, rename, delete, cut/copy/paste, duplicate, multi-select, drag-and-drop between folders and the sidebar, breadcrumb navigation, grid/list views, search, and a properties dialog
- Double-clicking a text-like file opens it in the Text Editor

**Text Editor**
- Multiple open documents (tabs), Save / Save As into `Documents/`, Find / Replace, word & character counts, an unsaved-changes indicator, and `Ctrl/Cmd+S` to save

**Terminal**
- A sandboxed shell over the *same* virtual filesystem the File Explorer uses
- Implements `help`, `clear`, `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo` (with `>` / `>>` redirection), `cp`, `mv`, `rm`, `rmdir`, `find`, `tree`, `whoami`, `hostname`, `date`, `uname`, `neofetch`, and `history`
- It never executes anything on your real computer — see [Limitations](#limitations)

**Other built-in apps**
- **Calculator** — a real four-function calculator (keyboard-friendly, no `eval()`)
- **Notes** — an autosaving list of notes
- **Clock** — live clock, stopwatch, and countdown timer
- **Calendar** — month view with per-day events
- **Settings** — theme (light/dark/system), 6 accent colors, 6 wallpapers, transparency & blur, animation toggle, desktop-icon visibility, taskbar auto-hide, clock format, live storage usage, and a "Reset LilOS" option
- **About LilOS**

**Offline support**
- A small service worker (`sw.js`) pre-caches the whole app shell on first visit, so reloading — or opening LilOS again with no network at all — still works

**Customization & persistence**
- Every preference above is saved to `localStorage` immediately and re-applied on load
- Files/folders live in `IndexedDB`; refreshing the page never loses your data
- Settings → System → **Reset LilOS** wipes everything (with a confirmation dialog) if you want a clean slate

---

## Screenshots

_Add your own screenshots here once you've deployed or opened the app locally — for example:_

```md
![Login screen](assets/screenshots/login.png)
![Desktop](assets/screenshots/desktop.png)
![File Explorer + Terminal](assets/screenshots/apps.png)
```

---

## Project structure

```
LilOS/
├── index.html
├── sw.js               # offline-support service worker
├── README.md
├── assets/
│   ├── icons/
│   └── wallpapers/
├── css/
│   ├── main.css        # design tokens, reset, glass/button utilities
│   ├── login.css        # boot/login screen
│   ├── desktop.css      # desktop icons, taskbar, launcher, notifications
│   ├── windows.css      # window chrome, resize handles, animations
│   ├── apps.css         # per-app UI (file explorer, terminal, editor, …)
│   └── themes.css       # wallpaper presets
└── js/
    ├── main.js                       # boot entry point
    ├── desktop.js                    # wires icons/taskbar/launcher/login flow
    ├── core/
    │   ├── utils.js                  # helpers, tiny event bus
    │   ├── settings.js               # persisted appearance settings
    │   ├── notifications.js          # toasts + notification panel
    │   ├── contextMenu.js            # shared right-click menu
    │   └── dialog.js                 # promise-based confirm/prompt modals
    ├── filesystem/
    │   ├── idb.js                    # thin IndexedDB wrapper
    │   └── vfs.js                    # virtual filesystem (CRUD, paths, search)
    ├── window-manager/
    │   └── windowManager.js          # open/close/drag/resize/focus/z-order
    └── apps/
        ├── registry.js                # app catalog + launch()
        ├── fileExplorer.js
        ├── textEditor.js
        ├── terminal.js
        ├── browser.js
        ├── calculator.js
        ├── notes.js
        ├── clockApp.js
        ├── calendarApp.js
        ├── settingsApp.js
        └── about.js
```

No bundler, no framework, no `node_modules` — just ES modules loaded directly by the browser.

---

## Local development

Because LilOS is written as native ES modules (`import`/`export`), opening `index.html` directly via `file://` will be blocked by the browser's CORS rules. Serve the folder over `http://` instead — any static server works:

```bash
# Python (usually already installed)
cd LilOS
python3 -m http.server 8080
# then open http://localhost:8080

# or Node's http-server, if you have it
npx http-server . -p 8080

# or VS Code's "Live Server" extension
```

No install step, no dependencies, no build — just serve the folder and refresh on changes.

---

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository (e.g. `LilOS`).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch".
4. Pick your default branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
5. GitHub will publish the site at:
   ```
   https://<your-username>.github.io/LilOS/
   ```

Everything in LilOS uses relative paths (`css/…`, `js/…`, `assets/…`), so it works correctly whether it's served from a domain root or from a subpath like `/LilOS/`. No environment variables, secrets, or server-side routing are involved.

---

## Technologies used

- **HTML5** — semantic structure, a single-page shell
- **CSS3** — custom properties for theming, `backdrop-filter` for the glass effect, CSS Grid/Flexbox for layout, no CSS framework
- **Vanilla JavaScript (ES2020+ modules)** — no React/Vue/build tooling
- **IndexedDB** — the virtual filesystem (files, folders, content)
- **localStorage** — settings, notes, calendar events, browser bookmarks/history, notification history, recent apps

---

## Limitations

Browser sandboxing means a few things can't be "real," and LilOS is upfront about each one rather than faking it:

- **The Terminal is a simulation.** It runs real logic against the virtual filesystem, but it cannot and does not execute commands on your actual computer or a real Linux/Unix shell.
- **The Browser app can't embed every website.** Sites that send `X-Frame-Options: DENY/SAMEORIGIN` or a restrictive `Content-Security-Policy: frame-ancestors` will refuse to load inside the in-OS browser's `<iframe>`. LilOS detects this where it can and offers a one-click "open in your real browser" link rather than attempting to bypass the restriction (which is neither possible nor desirable from client-side JavaScript).
- **Storage has real browser limits.** `localStorage` and `IndexedDB` quotas vary by browser and device, and can be cleared if the user clears site data, uses private/incognito mode, or runs very low on disk space.
- **No real multi-user accounts.** The login screen is a stylistic boot sequence, not authentication — by design, per the brief.
- **Service worker caching needs one real visit first.** `sw.js` pre-caches the whole app shell so LilOS works with the network fully off afterward, but that first visit has to succeed at least once (and service workers only register on `https://` or `localhost`, not a bare `file://` open).

---

## Future improvements

- Image/audio viewer apps so Pictures/Music files can be opened, not just text files
- An import/export (zip) feature for the virtual filesystem
- Snapping/tiling window layouts (drag to edge to half-screen)
- More terminal utilities (`grep`, `wc`, pipes)
- Home-screen widgets (weather, quick notes) on the desktop itself
