# Git Menu — Phase 6b: Keyboard Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the popover from the keyboard — `j`/`k` (or ↑/↓) to move a selection through the visible rows, `↵` to open, `c` to copy a PR URL, `⌘F` / `/` to focus search, `Esc` to clear search or hide the window, and `1`/`2`/`3` to switch tabs.

**Architecture:** A single self-contained `src/render/keyboard.js` attaches one document `keydown` listener; it queries the live DOM for the currently-visible selectable rows (`.pr-item` excluding empty placeholders, and `.inbox-item`), tracks a selection index, and highlights/scrolls the current row. A small `hide-window` IPC lets `Esc` dismiss the popover. No new runtime deps. Keyboard behavior is manual-tested (DOM-coupled), consistent with the project's "UI stays manual" testing approach.

**Tech Stack:** vanilla ESM renderer (Vite), Electron IPC.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §8 (keyboard navigation bullet).

**Branch:** subagent-driven-development should create/work on `phase-6b-keyboard-nav` off `main`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `main.js` (root) | Modify | `hide-window` IPC (Esc → hide the popover) |
| `preload.js` | Modify | expose `hideWindow` |
| `src/render/keyboard.js` | Create | keydown handling, selection state, row highlight |
| `src/style.css` | Modify (append) | `.kb-selected` row highlight |
| `src/main.js` | Modify | call `setupKeyboardNav()` once on load |

---

## Task 1: `hide-window` IPC + preload

**Files:**
- Modify: `main.js` (root)
- Modify: `preload.js`

- [ ] **Step 1: Add the IPC handler in `main.js`**

In `main.js`, after the existing `ipcMain.on('quit-app', ...)` handler, add:

```js
ipcMain.on('hide-window', () => {
  if (window) window.hide();
});
```

- [ ] **Step 2: Expose it in `preload.js`**

In `preload.js`, add a `hideWindow` line (next to `quitApp`):

```js
  quitApp: () => ipcRenderer.send('quit-app'),
  hideWindow: () => ipcRenderer.send('hide-window'),
```

(Ensure the object stays valid — `quitApp` keeps its trailing comma.)

- [ ] **Step 3: Verify**

Run: `node --check main.js && node --check preload.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat: hide-window IPC for keyboard Esc dismiss"
```

---

## Task 2: `src/render/keyboard.js`

**Files:**
- Create: `src/render/keyboard.js`

- [ ] **Step 1: Create the module (full content)**

Create `src/render/keyboard.js`:

```js
// Keyboard navigation for the popover. One document-level keydown listener that
// operates on whichever list is currently visible (PR list or inbox).
//
// j / ArrowDown  move down      k / ArrowUp  move up
// Enter          open selected   c           copy selected PR url
// / or Cmd/Ctrl+F focus search    Esc         clear search, else hide window
// 1 / 2 / 3      switch tab (Mine / Reviews / Inbox)

const SELECTABLE = '.pr-item:not(.pr-empty), .inbox-item';
let selectedIndex = -1;

export function setupKeyboardNav() {
  document.addEventListener('keydown', onKeyDown);
}

// Rows that are actually on screen (collapsed/hidden rows have no offsetParent).
function visibleRows() {
  return Array.from(document.querySelectorAll(SELECTABLE)).filter((el) => el.offsetParent !== null);
}

function highlight(rows) {
  rows.forEach((el, i) => el.classList.toggle('kb-selected', i === selectedIndex));
  const el = rows[selectedIndex];
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function move(delta) {
  const rows = visibleRows();
  if (rows.length === 0) {
    selectedIndex = -1;
    return;
  }
  const start = selectedIndex < 0 ? -1 : selectedIndex;
  selectedIndex = Math.max(0, Math.min(rows.length - 1, start + delta));
  highlight(rows);
}

function currentRow() {
  return visibleRows()[selectedIndex] || null;
}

function focusSearch() {
  const s = document.getElementById('search-input');
  if (s) s.focus();
}

function selectTab(i) {
  const ids = ['tab-my-prs', 'tab-review', 'tab-inbox'];
  const input = document.getElementById(ids[i]);
  const label = document.querySelector(`label[for="${ids[i]}"]`);
  if (!input || (label && label.style.display === 'none')) return; // skip hidden tabs
  if (!input.checked) {
    input.checked = true;
    input.dispatchEvent(new Event('change'));
  }
}

function onKeyDown(e) {
  // Cmd/Ctrl+F focuses search from anywhere.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    focusSearch();
    return;
  }

  // Esc: clear a non-empty search, otherwise hide the window.
  if (e.key === 'Escape') {
    e.preventDefault();
    const s = document.getElementById('search-input');
    if (s && s.value) {
      s.value = '';
      s.dispatchEvent(new Event('input'));
      s.blur();
    } else {
      if (s) s.blur();
      if (window.api.hideWindow) window.api.hideWindow();
    }
    return;
  }

  // Don't hijack keys while typing in a field (Esc/Cmd+F handled above).
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      move(1);
      break;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      move(-1);
      break;
    case 'Enter': {
      const el = currentRow();
      if (el) {
        e.preventDefault();
        el.click();
      }
      break;
    }
    case 'c': {
      const el = currentRow();
      const btn = el && el.querySelector('.copy-btn');
      if (btn) {
        e.preventDefault();
        btn.click();
      }
      break;
    }
    case '/':
      e.preventDefault();
      focusSearch();
      break;
    case '1':
      selectTab(0);
      break;
    case '2':
      selectTab(1);
      break;
    case '3':
      selectTab(2);
      break;
    default:
      break;
  }
}
```

- [ ] **Step 2: Confirm the file exists (built in Task 4)**

Run: `test -f src/render/keyboard.js && echo OK`
Expected: `OK`

---

## Task 3: Selected-row style

**Files:**
- Modify: `src/style.css` (append)

- [ ] **Step 1: Append the highlight style**

Append to `src/style.css`:

```css

/* Keyboard-selected row */
.pr-item.kb-selected,
.inbox-item.kb-selected {
  background: rgba(56, 139, 253, 0.16);
  box-shadow: inset 2px 0 0 #388bfd;
}
```

- [ ] **Step 2: Verify**

Run: `grep -c "kb-selected" src/style.css`
Expected: a count ≥ 1.

---

## Task 4: Wire `setupKeyboardNav` in `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Import the module**

Add to the imports at the top of `src/main.js` (after the settings import):

```js
import { renderSettingsView, openSettings } from './render/settings.js';
import { setupKeyboardNav } from './render/keyboard.js';
import { defaultSettings } from '../lib/settings.js';
```

- [ ] **Step 2: Call it on load**

In the `DOMContentLoaded` handler, add `setupKeyboardNav()` alongside the other setup calls:

```js
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupFilterChips();
  setupKeyboardNav();
  await initSettings();
  loadData();
});
```

- [ ] **Step 3: Verify build**

Run: `npx vite build`
Expected: builds with no error.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`
Expected: all suites pass (47 — no new tests; keyboard nav is manual-tested).

- [ ] **Step 5: Commit**

```bash
git add src/render/keyboard.js src/style.css src/main.js
git commit -m "feat: keyboard navigation (j/k move, enter open, c copy, /+CmdF search, esc, 1/2/3 tabs)"
```

---

## Task 5: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` is produced.

- [ ] **Step 2: Manual smoke (the real test for this phase)**

Run: `npm run dev`. With some PRs visible (expand a repo if collapsed), confirm:
- `j` / `k` (and ↓ / ↑) move a highlighted selection through the visible rows; the selection scrolls into view.
- `Enter` opens the selected PR/notification in the browser.
- `c` copies the selected PR's URL (the copy button flashes a check).
- `/` and `⌘F` focus the search box; typing filters; `Esc` clears the search (and a second `Esc` hides the window).
- `1` / `2` / `3` switch to Mine / Reviews / Inbox (hidden tabs are skipped).
- Typing in the search box does NOT trigger j/k/c/1-2-3 navigation (only Esc / ⌘F act while typing).
- On the Inbox tab, `j`/`k`/`Enter` navigate + open notifications; `c` is a no-op (no copy button there).

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-6b-keyboard-nav` into `main` and push. Delete the feature branch.

---

## Phase 6b Acceptance

- `src/render/keyboard.js` attaches one keydown listener; navigates the visible PR/inbox rows with `j`/`k`/↑/↓, opens with `↵`, copies with `c`, focuses search with `/`+`⌘F`, and `Esc` clears search / hides the window; `1`/`2`/`3` switch tabs (skipping hidden ones).
- Selection is highlighted and scrolled into view; navigation keys don't fire while typing in a field.
- `hide-window` IPC dismisses the popover on `Esc`.
- `npm test` (47) and `npm run pack` green; merged to `main`.

**Next phase:** Phase 7 — menubar icon (branch glyph + the S4 red corner count badge, rendered via canvas) + the honest smart badge count (review-requested + unread inbox), which also makes the inbox badge populate without first opening the tab.
