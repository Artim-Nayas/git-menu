# Git Menu — Phase 6a: Settings, Launch-at-Login, Global Hotkey — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted settings store + an in-popover Settings view, wire launch-at-login and a configurable global hotkey, and connect the previously-deferred toggles (refresh interval, tab visibility, contributions on/off + `expanded`/`range`, `showEmptyRepos`).

**Architecture:** A pure, unit-tested `lib/settings.js` (defaults + validating merge, shared by main and renderer). The main process loads/saves `userData/settings.json`, applies main-side effects (`setLoginItemSettings`, `globalShortcut`), and exposes `get-settings`/`set-settings`/`get-version` IPC. A new `src/render/settings.js` renders the Settings overlay; `src/main.js` applies renderer-side effects (refresh timer, tab visibility, contributions config, `showEmptyRepos`). `src/render/contributions.js` gains a `configureContributions` entry point so the widget's state persists. No new runtime deps.

**Tech Stack:** Electron main (ESM) + `globalShortcut`/`setLoginItemSettings`, vanilla ESM renderer (Vite bundles `lib/settings.js` for the renderer too), `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §8 (power-user) + §8.1 (settings schema). Keyboard navigation (§8 bullet) is **Phase 6b**, not here.

**Branch:** subagent-driven-development should create/work on `phase-6a-settings` off `main`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/settings.js` | Create | `defaultSettings`, `mergeSettings`, `SETTINGS_CHOICES` (pure; shared main+renderer) |
| `test/settings.test.js` | Create | unit tests |
| `main.js` (root) | Modify | load/save/apply settings; login-item; global hotkey; `get-settings`/`set-settings`/`get-version` IPC |
| `preload.js` | Modify | expose `getSettings`/`setSettings`/`getVersion` |
| `index.html` | Modify | footer gear button + `#settings-view` overlay |
| `src/render/settings.js` | Create | render the Settings overlay; open/close |
| `src/render/contributions.js` | Modify | `configureContributions({enabled,expanded,range,onChange})` + persist-on-change |
| `src/style.css` | Modify (append) | settings overlay, switch toggle, rows |
| `src/main.js` | Modify | load settings on startup; `applySettings`; wire gear + onChange; `showEmptyRepos` from settings |

> `lib/settings.js` lives in root `lib/` (shipped to main via `build.files`). The renderer imports it
> as `../lib/settings.js` (from `src/main.js`) / `../../lib/settings.js` (from `src/render/settings.js`);
> Vite bundles it into the renderer build.

---

## Task 1: `lib/settings.js` (TDD)

**Files:**
- Create: `lib/settings.js`
- Test: `test/settings.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/settings.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, mergeSettings, SETTINGS_CHOICES } from '../lib/settings.js';

test('defaultSettings has the documented shape', () => {
  const d = defaultSettings();
  assert.equal(d.version, 1);
  assert.equal(d.launchAtLogin, false);
  assert.equal(d.showContributions, true);
  assert.equal(d.smartBadge, true);
  assert.equal(d.refreshMinutes, 5);
  assert.equal(d.hotkey, 'Alt+G');
  assert.equal(d.showEmptyRepos, true);
  assert.deepEqual(d.tabs, { mine: true, reviews: true, inbox: true });
  assert.deepEqual(d.contrib, { expanded: false, range: '6m' });
});

test('mergeSettings returns defaults for empty/garbage input', () => {
  assert.deepEqual(mergeSettings(undefined), defaultSettings());
  assert.deepEqual(mergeSettings(null), defaultSettings());
  assert.deepEqual(mergeSettings('nope'), defaultSettings());
});

test('mergeSettings keeps valid values and rejects invalid ones', () => {
  const merged = mergeSettings({
    launchAtLogin: true,
    refreshMinutes: 15,
    hotkey: 'None',
    showEmptyRepos: false,
    tabs: { mine: false },
    contrib: { expanded: true, range: '1y' },
    smartBadge: 'yes',          // invalid -> default true
    refreshMinutes_typo: 7,
  });
  assert.equal(merged.launchAtLogin, true);
  assert.equal(merged.refreshMinutes, 15);
  assert.equal(merged.hotkey, 'None');
  assert.equal(merged.showEmptyRepos, false);
  assert.equal(merged.tabs.mine, false);
  assert.equal(merged.tabs.reviews, true);   // untouched -> default
  assert.equal(merged.contrib.expanded, true);
  assert.equal(merged.contrib.range, '1y');
  assert.equal(merged.smartBadge, true);      // invalid coerced to default
});

test('mergeSettings rejects out-of-set refresh/hotkey/range', () => {
  const m = mergeSettings({ refreshMinutes: 7, hotkey: 'Bogus', contrib: { range: '5y' } });
  assert.equal(m.refreshMinutes, 5);
  assert.equal(m.hotkey, 'Alt+G');
  assert.equal(m.contrib.range, '6m');
});

test('SETTINGS_CHOICES exposes the allowed option lists', () => {
  assert.deepEqual(SETTINGS_CHOICES.refresh, [1, 5, 15, 30]);
  assert.deepEqual(SETTINGS_CHOICES.range, ['3m', '6m', '1y']);
  assert.ok(SETTINGS_CHOICES.hotkey.includes('Alt+G'));
  assert.ok(SETTINGS_CHOICES.hotkey.includes('None'));
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/settings.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/settings.js`:

```js
// Settings schema + validating merge. Pure; shared by the main process (runtime)
// and the renderer (bundled by Vite). No I/O here.

export const SETTINGS_VERSION = 1;

const REFRESH_CHOICES = [1, 5, 15, 30];
const RANGE_CHOICES = ['3m', '6m', '1y'];
const HOTKEY_CHOICES = ['Alt+G', 'Alt+Shift+R', 'Control+Alt+G', 'CommandOrControl+Shift+G', 'None'];

export const SETTINGS_CHOICES = {
  refresh: REFRESH_CHOICES,
  range: RANGE_CHOICES,
  hotkey: HOTKEY_CHOICES,
};

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    launchAtLogin: false,
    showContributions: true,
    smartBadge: true,
    refreshMinutes: 5,
    hotkey: 'Alt+G',
    showEmptyRepos: true,
    tabs: { mine: true, reviews: true, inbox: true },
    contrib: { expanded: false, range: '6m' },
  };
}

const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);

export function mergeSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const tabs = raw.tabs && typeof raw.tabs === 'object' ? raw.tabs : {};
  const contrib = raw.contrib && typeof raw.contrib === 'object' ? raw.contrib : {};
  return {
    version: SETTINGS_VERSION,
    launchAtLogin: bool(raw.launchAtLogin, d.launchAtLogin),
    showContributions: bool(raw.showContributions, d.showContributions),
    smartBadge: bool(raw.smartBadge, d.smartBadge),
    refreshMinutes: REFRESH_CHOICES.includes(raw.refreshMinutes) ? raw.refreshMinutes : d.refreshMinutes,
    hotkey: HOTKEY_CHOICES.includes(raw.hotkey) ? raw.hotkey : d.hotkey,
    showEmptyRepos: bool(raw.showEmptyRepos, d.showEmptyRepos),
    tabs: {
      mine: bool(tabs.mine, d.tabs.mine),
      reviews: bool(tabs.reviews, d.tabs.reviews),
      inbox: bool(tabs.inbox, d.tabs.inbox),
    },
    contrib: {
      expanded: bool(contrib.expanded, d.contrib.expanded),
      range: RANGE_CHOICES.includes(contrib.range) ? contrib.range : d.contrib.range,
    },
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/settings.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings.js test/settings.test.js
git commit -m "feat: settings schema + validating merge with tests"
```

---

## Task 2: Settings store + effects + IPC (main)

**Files:**
- Modify: `main.js` (root)

- [ ] **Step 1: Add imports**

In `main.js`, add `globalShortcut` to the electron import and add `fs` + the settings helpers. Change:

```js
import { app, BrowserWindow, Tray, ipcMain, shell, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import util from 'util';
import { classifyGhFailure } from './lib/gh-errors.js';
import { filterInbox, normalizeNotification } from './lib/notifications.js';
```

to:

```js
import { app, BrowserWindow, Tray, ipcMain, shell, nativeImage, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import util from 'util';
import { classifyGhFailure } from './lib/gh-errors.js';
import { filterInbox, normalizeNotification } from './lib/notifications.js';
import { defaultSettings, mergeSettings } from './lib/settings.js';
```

- [ ] **Step 2: Add settings state + load/save/apply (place after the `ghEnv` line, before `runGH`)**

```js
let settings = defaultSettings();

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    settings = mergeSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    settings = defaultSettings();
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function applyMainSettings() {
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  globalShortcut.unregisterAll();
  if (settings.hotkey && settings.hotkey !== 'None') {
    try {
      globalShortcut.register(settings.hotkey, toggleWindow);
    } catch (error) {
      console.error('Failed to register hotkey:', settings.hotkey, error);
    }
  }
}
```

- [ ] **Step 3: Load + apply settings in `app.whenReady`**

In the `app.whenReady().then(() => { ... })` callback, call `loadSettings()` as the first line, and `applyMainSettings()` after `createWindow();`:

```js
app.whenReady().then(() => {
  loadSettings();

  const iconPath = path.join(__dirname, 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('Git Menu');

  tray.on('right-click', toggleWindow);
  tray.on('double-click', toggleWindow);
  tray.on('click', function (event) {
    toggleWindow();
  });

  createWindow();
  applyMainSettings();

  app.dock.hide(); // Hide from the dock as it's a menu bar app
});
```

- [ ] **Step 4: Unregister the hotkey on quit**

After the existing `app.on('window-all-closed', ...)` block, add:

```js
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

- [ ] **Step 5: Add the IPC handlers (after the `mark-all-read` handler)**

```js
ipcMain.handle('get-settings', () => settings);

ipcMain.handle('set-settings', (event, next) => {
  settings = mergeSettings(next);
  saveSettings();
  applyMainSettings();
  return settings;
});

ipcMain.handle('get-version', () => app.getVersion());
```

- [ ] **Step 6: Verify**

Run: `node --check main.js`
Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add main.js
git commit -m "feat: settings store, launch-at-login, global hotkey + settings/version IPC"
```

---

## Task 3: Preload exposure

**Files:**
- Modify: `preload.js`

- [ ] **Step 1: Add the methods**

In `preload.js`, after the inbox methods, add:

```js
  markAllRead: (ids) => ipcRenderer.invoke('mark-all-read', ids),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (next) => ipcRenderer.invoke('set-settings', next),
  getVersion: () => ipcRenderer.invoke('get-version'),
```

(Adjust so `markAllRead` keeps its trailing comma and the three new lines follow it; ensure the object remains valid.)

- [ ] **Step 2: Verify**

Run: `node --check preload.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add preload.js
git commit -m "feat: expose settings/version IPC on window.api"
```

---

## Task 4: Markup — gear button + settings overlay

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add a settings (gear) button to the footer**

Replace the footer's opening (the refresh button) so a gear button precedes it. Change:

```html
      <footer class="footer">
        <button id="refresh-btn" class="icon-btn" title="Refresh">
```

to:

```html
      <footer class="footer">
        <button id="settings-btn" class="icon-btn" title="Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button id="refresh-btn" class="icon-btn" title="Refresh">
```

- [ ] **Step 2: Add the settings overlay as the last child of `.app-container`**

Find the closing of the app container (the `</div>` that closes `<div class="app-container">`, right before `<script type="module" src="/src/main.js">`). Insert the overlay just before that closing `</div>`:

```html
      <div id="settings-view" class="settings-view hidden"></div>
    </div>
    <script type="module" src="/src/main.js"></script>
```

- [ ] **Step 3: Verify**

Run: `grep -c "settings-btn\|settings-view" index.html`
Expected: `2`

---

## Task 5: `src/render/settings.js`

**Files:**
- Create: `src/render/settings.js`

- [ ] **Step 1: Create the module (full content)**

Create `src/render/settings.js`:

```js
import { escapeHtml } from '../lib/escape.js';
import { SETTINGS_CHOICES } from '../../lib/settings.js';

let current = null;
let emit = null;

const HOTKEY_LABELS = {
  'Alt+G': '⌥G',
  'Alt+Shift+R': '⌥⇧R',
  'Control+Alt+G': '⌃⌥G',
  'CommandOrControl+Shift+G': '⌘⇧G',
  None: 'Off',
};

export function openSettings() {
  document.getElementById('settings-view').classList.remove('hidden');
}
export function closeSettings() {
  document.getElementById('settings-view').classList.add('hidden');
}

// settings: the current settings object. version: app version string.
// onChange(next): called with a full updated settings object on any change.
export function renderSettingsView(settings, version, onChange) {
  current = JSON.parse(JSON.stringify(settings));
  emit = onChange;
  const view = document.getElementById('settings-view');

  const refreshOpts = SETTINGS_CHOICES.refresh
    .map((m) => `<option value="${m}" ${settings.refreshMinutes === m ? 'selected' : ''}>${m} min</option>`)
    .join('');
  const hotkeyOpts = SETTINGS_CHOICES.hotkey
    .map((h) => `<option value="${escapeHtml(h)}" ${settings.hotkey === h ? 'selected' : ''}>${escapeHtml(HOTKEY_LABELS[h] || h)}</option>`)
    .join('');

  view.innerHTML = `
    <div class="settings-header">
      <button class="settings-back" type="button">‹ Settings</button>
    </div>
    <div class="settings-body">
      ${toggleRow('launchAtLogin', 'Launch at login', 'Start Git Menu on sign-in', settings.launchAtLogin)}
      ${toggleRow('showContributions', 'Contributions widget', 'Show the activity ring + heatmap', settings.showContributions)}
      ${toggleRow('smartBadge', 'Smart badge', 'Count items needing action', settings.smartBadge)}
      ${toggleRow('showEmptyRepos', 'Show all contributed repos', 'Include repos with no open PRs', settings.showEmptyRepos)}
      ${selectRow('refreshMinutes', 'Refresh every', refreshOpts)}
      ${selectRow('hotkey', 'Global hotkey', hotkeyOpts)}
      <div class="settings-row">
        <div class="settings-label">Tabs shown</div>
        <div class="settings-tabs">
          ${tabCheck('mine', 'Mine', settings.tabs.mine)}
          ${tabCheck('reviews', 'Reviews', settings.tabs.reviews)}
          ${tabCheck('inbox', 'Inbox', settings.tabs.inbox)}
        </div>
      </div>
      <div class="settings-about">Git Menu v${escapeHtml(version || '')}</div>
    </div>
  `;

  view.querySelector('.settings-back').addEventListener('click', closeSettings);

  view.querySelectorAll('.switch').forEach((cb) => {
    cb.addEventListener('change', () => {
      current[cb.dataset.key] = cb.checked;
      emit(JSON.parse(JSON.stringify(current)));
    });
  });

  view.querySelectorAll('.settings-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.key;
      current[key] = key === 'refreshMinutes' ? Number(sel.value) : sel.value;
      emit(JSON.parse(JSON.stringify(current)));
    });
  });

  view.querySelectorAll('[data-tab]').forEach((cb) => {
    cb.addEventListener('change', () => {
      current.tabs[cb.dataset.tab] = cb.checked;
      emit(JSON.parse(JSON.stringify(current)));
    });
  });
}

function toggleRow(key, title, sub, checked) {
  return `<label class="settings-row" for="set-${key}">
    <div class="settings-label">${escapeHtml(title)}<div class="settings-sub">${escapeHtml(sub)}</div></div>
    <input type="checkbox" class="switch" id="set-${key}" data-key="${key}" ${checked ? 'checked' : ''}>
  </label>`;
}

function selectRow(key, title, optionsHtml) {
  return `<div class="settings-row">
    <div class="settings-label">${escapeHtml(title)}</div>
    <select class="settings-select" data-key="${key}">${optionsHtml}</select>
  </div>`;
}

function tabCheck(key, label, checked) {
  return `<label class="tab-check"><input type="checkbox" data-tab="${key}" ${checked ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
}
```

- [ ] **Step 2: Confirm the file exists (built in Task 8)**

Run: `test -f src/render/settings.js && echo OK`
Expected: `OK`

---

## Task 6: Contributions config hook

**Files:**
- Modify: `src/render/contributions.js`

- [ ] **Step 1: Add an `enabled` flag + `onChange` + `configureContributions`**

In `src/render/contributions.js`, change the state block:

```js
// View state (persisted to settings in a later phase).
let expanded = false;
let range = '6m';
let lastCalendar = null;
```

to:

```js
// View state (persisted via settings — see configureContributions).
let enabled = true;
let expanded = false;
let range = '6m';
let lastCalendar = null;
let onChange = null;

// Configure persisted state + a change callback. Re-renders if data is present.
export function configureContributions(opts = {}) {
  if (opts.enabled != null) enabled = opts.enabled;
  if (opts.expanded != null) expanded = opts.expanded;
  if (opts.range != null) range = opts.range;
  if (opts.onChange) onChange = opts.onChange;
  if (lastCalendar != null) renderContributions(lastCalendar);
}
```

- [ ] **Step 2: Respect `enabled` in `renderContributions`**

Change the guard at the top of `renderContributions`:

```js
  lastCalendar = calendar;
  const container = document.getElementById('contributions-container');
  if (!calendar) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
```

to:

```js
  lastCalendar = calendar;
  const container = document.getElementById('contributions-container');
  if (!enabled || !calendar) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
```

- [ ] **Step 3: Emit changes from the toggle + range handlers**

Change:

```js
  container.querySelector('.contrib-toggle').addEventListener('click', () => {
    expanded = !expanded;
    renderContributions(lastCalendar);
  });
  container.querySelector('.contrib-range').addEventListener('change', (e) => {
    range = e.target.value;
    expanded = true; // changing the range implies you want to see it
    renderContributions(lastCalendar);
  });
```

to:

```js
  container.querySelector('.contrib-toggle').addEventListener('click', () => {
    expanded = !expanded;
    if (onChange) onChange({ expanded, range });
    renderContributions(lastCalendar);
  });
  container.querySelector('.contrib-range').addEventListener('change', (e) => {
    range = e.target.value;
    expanded = true; // changing the range implies you want to see it
    if (onChange) onChange({ expanded, range });
    renderContributions(lastCalendar);
  });
```

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: builds with no error.

> No commit yet — committed with the wiring in Task 8.

---

## Task 7: Settings styles

**Files:**
- Modify: `src/style.css` (append)

- [ ] **Step 1: Append styles**

Append to `src/style.css`:

```css

/* Settings overlay */
.settings-view {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: rgba(28, 33, 40, 0.98);
  overflow-y: auto;
}
@media (prefers-color-scheme: light) {
  .settings-view { background: rgba(246, 248, 250, 0.98); }
}
.settings-view::-webkit-scrollbar { width: 0; }
.settings-header {
  -webkit-app-region: drag;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}
.settings-back {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.settings-body { padding: 4px 0 12px; }
.settings-row {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-primary);
}
.settings-row:first-child { border-top: none; }
.settings-label { flex: 1; }
.settings-sub { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.settings-select {
  -webkit-app-region: no-drag;
  font-size: 11px;
  background: var(--seg-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 3px 6px;
}
.settings-tabs { display: flex; gap: 10px; }
.tab-check { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-secondary); }

/* Switch toggle (checkbox) */
.switch {
  -webkit-app-region: no-drag;
  -webkit-appearance: none;
  appearance: none;
  width: 32px;
  height: 18px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.15);
  position: relative;
  cursor: pointer;
  flex: 0 0 auto;
  transition: background 0.15s ease;
}
@media (prefers-color-scheme: light) {
  .switch { background: rgba(0, 0, 0, 0.15); }
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s ease;
}
.switch:checked { background: var(--accent-color); }
.switch:checked::after { left: 16px; }
.settings-about { padding: 12px; font-size: 11px; color: var(--text-muted); }
```

- [ ] **Step 2: Verify**

Run: `grep -c "settings-view\|settings-row\|\.switch\|settings-select\|tab-check" src/style.css`
Expected: a count ≥ 5.

---

## Task 8: Wire settings into `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Imports + default settings state**

Add to the imports at the top of `src/main.js`:

```js
import { renderInbox } from './render/inbox.js';
import { renderSettingsView, openSettings } from './render/settings.js';
import { configureContributions } from './render/contributions.js';
import { defaultSettings } from '../lib/settings.js';
```

Add to the module state (with the other `let` declarations near the top):

```js
let settings = defaultSettings();
let appVersion = '';
```

- [ ] **Step 2: Make `startAutoRefresh` honor the configured interval**

Replace `startAutoRefresh`:

```js
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    loadData(true);
  }, 300000);
}
```

with:

```js
function startAutoRefresh(minutes = 5) {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    loadData(true);
  }, minutes * 60000);
}
```

- [ ] **Step 3: Load + apply settings on startup**

Replace the `DOMContentLoaded` handler:

```js
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupFilterChips();
  loadData();
  startAutoRefresh();
});
```

with:

```js
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupFilterChips();
  await initSettings();
  loadData();
});

async function initSettings() {
  try {
    settings = (await window.api.getSettings()) || defaultSettings();
    appVersion = await window.api.getVersion();
  } catch (error) {
    console.error('Failed to load settings:', error);
    settings = defaultSettings();
  }
  applySettings(settings, false);
}

function applySettings(s, reload = true) {
  startAutoRefresh(s.refreshMinutes);
  configureContributions({
    enabled: s.showContributions,
    expanded: s.contrib.expanded,
    range: s.contrib.range,
    onChange: onContribChange,
  });
  applyTabVisibility(s.tabs, reload);
}

function onContribChange(c) {
  settings.contrib = { ...settings.contrib, ...c };
  window.api.setSettings(settings);
}

function applyTabVisibility(tabsCfg, reload) {
  const entries = [
    ['tab-my-prs', 'my-prs', tabsCfg.mine],
    ['tab-review', 'review-requests', tabsCfg.reviews],
    ['tab-inbox', 'inbox', tabsCfg.inbox],
  ];
  let firstVisible = null;
  entries.forEach(([id, value, show]) => {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) label.style.display = show ? '' : 'none';
    if (show && !firstVisible) firstVisible = { id, value };
  });
  const activeVisible = entries.some(([, value, show]) => show && value === currentTab);
  if (!activeVisible && firstVisible) {
    document.getElementById(firstVisible.id).checked = true;
    currentTab = firstVisible.value;
    if (reload) loadData();
  }
}
```

- [ ] **Step 4: Wire the gear button (in `setupEventListeners`)**

Add, after the existing `refresh-btn` listener inside `setupEventListeners`:

```js
  document.getElementById('settings-btn').addEventListener('click', () => {
    renderSettingsView(settings, appVersion, onSettingsChange);
    openSettings();
  });
```

And define `onSettingsChange` near `applySettings`:

```js
async function onSettingsChange(next) {
  try {
    settings = (await window.api.setSettings(next)) || next;
  } catch (error) {
    console.error('Failed to save settings:', error);
    settings = next;
  }
  applySettings(settings, true);
}
```

- [ ] **Step 5: Use `settings.showEmptyRepos` instead of the hardcoded `true`**

There are two `renderPRList({ ..., showEmptyRepos: true })` call sites (the search handler and `loadData`). Change both `showEmptyRepos: true` to `showEmptyRepos: settings.showEmptyRepos`.

- [ ] **Step 6: Verify build + references**

Run: `grep -n "showEmptyRepos: settings.showEmptyRepos" src/main.js`
Expected: two lines.

Run: `npx vite build`
Expected: builds with no error.

- [ ] **Step 7: Run all unit tests**

Run: `npm test`
Expected: all suites pass (incl. the new settings suite).

- [ ] **Step 8: Commit**

```bash
git add index.html src/render/settings.js src/render/contributions.js src/style.css src/main.js
git commit -m "feat: Settings view + apply (launch-at-login, hotkey, refresh, tabs, contributions, showEmptyRepos)"
```

---

## Task 9: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` is produced.

- [ ] **Step 2: Manual smoke (recommended)**

Run: `npm run dev`
Expected:
- A **gear** button in the footer opens a **Settings** overlay; **‹ Settings** returns.
- Toggling **Launch at login** persists (re-open Settings to confirm it stays).
- **Contributions widget** off hides the widget; on restores it.
- **Show all contributed repos** off removes the empty repos from the Mine tab.
- **Refresh every** changes the auto-refresh interval; **Global hotkey** changes the toggle shortcut (test the new combo opens/closes the window); **Off** disables it.
- **Tabs shown** hides/shows tabs; hiding the active tab switches to the first visible one.
- The contributions **heatmap expanded state + range persist** across an app restart (they're saved to settings).
- Settings survive a restart (written to `userData/settings.json`).

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-6a-settings` into `main` and push. Delete the feature branch.

---

## Phase 6a Acceptance

- `lib/settings.js` pure + unit-tested (defaults, validating merge, choices).
- Settings persist to `userData/settings.json`; `get-settings`/`set-settings`/`get-version` IPC.
- **Launch at login** via `setLoginItemSettings`; **global hotkey** via `globalShortcut` (configurable, "Off" disables), unregistered on quit.
- Settings overlay: toggles (launch/contributions/smart-badge/show-empty-repos), selects (refresh/hotkey), tab checkboxes, version.
- Renderer applies: refresh interval, tab visibility (auto-switch off a hidden active tab), contributions on/off + persisted `expanded`/`range`, `showEmptyRepos`.
- `npm test` (8 suites) and `npm run pack` green; merged to `main`.

**Next phase:** Phase 6b — keyboard navigation (j/k move, ↵ open, c copy, ⌘F/`/` search, esc, 1/2/3 tabs).
