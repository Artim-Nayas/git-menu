# Git Menu — Phase 7: Menubar Icon + Smart Badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the menubar icon (git-branch glyph) and bake the count into it as an **S4 red corner badge** rendered via `canvas` — replacing `tray.setTitle`. Drive it with an **honest smart count** = review-requested PRs + unread inbox threads (toggleable via the `smartBadge` setting), which also makes the **inbox tab badge populate every refresh** without first opening the tab.

**Architecture:** A new main-side `lib/render-icon.js` (uses the existing `canvas` dep) exports `drawGlyph(ctx, color)` (the shared branch glyph) and `renderTrayIcon({count, dark})` → a `@2x` PNG buffer (glyph + optional red corner badge). The icon-template generator is rewritten to share `drawGlyph`. `main.js` renders the tray icon: count 0 → monochrome **template** glyph (auto light/dark); count > 0 → the **colored composite** (re-rendered on theme change). The renderer computes the smart count each refresh and sends it via the existing `update-tray-count` IPC; it also updates the inbox tab badge. No new runtime deps (canvas already present).

**Tech Stack:** Electron main (ESM) + `canvas` + `nativeTheme`/`nativeImage`, vanilla ESM renderer, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §9 (icon), §9.2 (S4 corner badge via canvas), §9.3 (smart count).

**Branch:** subagent-driven-development should create/work on `phase-7-menubar-icon` off `main`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/render-icon.js` | Create | `drawGlyph` + `renderTrayIcon` (canvas → `@2x` PNG buffer) |
| `test/render-icon.test.js` | Create | unit tests (buffer non-empty; badge variants differ) |
| `generate-icon.js` | Create | ESM template-PNG generator sharing `drawGlyph` |
| `generate-icon.cjs` | Delete | replaced by the ESM version |
| `iconTemplate.png`, `iconTemplate@2x.png` | Regenerate | new branch glyph (template) |
| `main.js` (root) | Modify | tray render: template (count 0) vs composite (count>0); theme listener; `update-tray-count` swap |
| `src/render/prs.js` | Modify | stop setting the tray count from the PR list |
| `src/main.js` | Modify | `updateBadges()` (smart count + inbox badge), called each refresh |

---

## Task 1: `lib/render-icon.js` (+ tests)

**Files:**
- Create: `lib/render-icon.js`
- Test: `test/render-icon.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/render-icon.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrayIcon } from '../lib/render-icon.js';

test('renders a non-empty PNG buffer for the glyph (count 0)', () => {
  const buf = renderTrayIcon({ count: 0, dark: true });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 0);
});

test('a badge changes the rendered pixels vs no badge', () => {
  const none = renderTrayIcon({ count: 0, dark: true });
  const three = renderTrayIcon({ count: 3, dark: true });
  assert.ok(three.length > 0);
  assert.notDeepEqual(none, three);
});

test('counts over 9 and light theme render without throwing', () => {
  assert.ok(renderTrayIcon({ count: 42, dark: true }).length > 0); // "9+"
  assert.ok(renderTrayIcon({ count: 5, dark: false }).length > 0);
});

test('defaults are safe (no args)', () => {
  assert.ok(renderTrayIcon().length > 0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/render-icon.test.js`
Expected: FAIL — `Cannot find module '../lib/render-icon.js'`.

- [ ] **Step 3: Implement**

Create `lib/render-icon.js`:

```js
import { createCanvas } from 'canvas';

const SCALE = 2;
const W = 22; // logical width (room for the corner badge)
const H = 16; // logical height

// Draw the git-branch glyph within a 16x16 logical box, stroked/filled in `color`.
export function drawGlyph(ctx, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(5, 4.5); ctx.lineTo(5, 11.5); ctx.stroke();            // trunk
  ctx.beginPath(); ctx.arc(5, 3.3, 1.9, 0, Math.PI * 2); ctx.fill();                 // top-left node
  ctx.beginPath(); ctx.arc(5, 12.7, 1.9, 0, Math.PI * 2); ctx.fill();                // bottom-left node
  ctx.beginPath(); ctx.moveTo(5, 9); ctx.bezierCurveTo(10.5, 9, 11, 5.5, 11, 5.5); ctx.stroke(); // branch
  ctx.beginPath(); ctx.arc(11, 4.3, 1.9, 0, Math.PI * 2); ctx.fill();                // right node
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBadge(ctx, count) {
  const label = count > 9 ? '9+' : String(count);
  const w = label.length > 1 ? 11 : 9;
  const h = 9;
  const x = W - w;
  const y = 0;
  ctx.save();
  ctx.fillStyle = '#e5484d';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 7px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
}

// Render the tray icon as a @2x PNG buffer. count>0 adds the red corner badge
// (capped at "9+"); `dark` picks the glyph color (white on a dark menubar).
export function renderTrayIcon({ count = 0, dark = true } = {}) {
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.clearRect(0, 0, W, H);
  drawGlyph(ctx, dark ? '#ffffff' : '#000000');
  if (count > 0) drawBadge(ctx, count);
  return canvas.toBuffer('image/png');
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/render-icon.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/render-icon.js test/render-icon.test.js
git commit -m "feat: canvas tray-icon compositor (branch glyph + red corner badge) with tests"
```

---

## Task 2: Regenerate the template PNGs from the shared glyph

**Files:**
- Create: `generate-icon.js`
- Delete: `generate-icon.cjs`
- Regenerate: `iconTemplate.png`, `iconTemplate@2x.png`

- [ ] **Step 1: Create the ESM generator**

Create `generate-icon.js`:

```js
// Regenerate the monochrome template PNGs from the shared branch glyph.
// Run with: node generate-icon.js
import { createCanvas } from 'canvas';
import fs from 'fs';
import { drawGlyph } from './lib/render-icon.js';

function writeTemplate(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.scale(size / 16, size / 16);
  drawGlyph(ctx, 'black'); // template image: black on transparent; macOS inverts for the menubar
  fs.writeFileSync(filename, canvas.toBuffer('image/png'));
  console.log(`${filename} written`);
}

writeTemplate(16, 'iconTemplate.png');
writeTemplate(32, 'iconTemplate@2x.png');
```

- [ ] **Step 2: Remove the old generator and regenerate the PNGs**

Run:
```bash
rm generate-icon.cjs
node generate-icon.js
```
Expected: prints `iconTemplate.png written` and `iconTemplate@2x.png written`; both files are updated.

- [ ] **Step 3: Verify the PNGs are valid 16/32px images**

Run: `file iconTemplate.png iconTemplate@2x.png`
Expected: `iconTemplate.png: PNG image data, 16 x 16, ...` and `iconTemplate@2x.png: PNG image data, 32 x 32, ...`.

- [ ] **Step 4: Commit (including the regenerated binaries)**

```bash
git add generate-icon.js iconTemplate.png iconTemplate@2x.png
git rm --cached generate-icon.cjs 2>/dev/null || true
git add -A
git commit -m "feat: regenerate template icon from shared branch glyph (ESM generator)"
```

---

## Task 3: Tray rendering in `main.js`

**Files:**
- Modify: `main.js` (root)

- [ ] **Step 1: Imports**

Add `nativeTheme` to the electron import and import the compositor. Change:

```js
import { app, BrowserWindow, Tray, ipcMain, shell, nativeImage, globalShortcut } from 'electron';
```

to:

```js
import { app, BrowserWindow, Tray, ipcMain, shell, nativeImage, globalShortcut, nativeTheme } from 'electron';
```

And add, with the other local imports:

```js
import { renderTrayIcon } from './lib/render-icon.js';
```

- [ ] **Step 2: Tray state + `updateTrayIcon` (add near the settings helpers, before `runGH` or after `applyMainSettings`)**

```js
let trayTemplateIcon = null;
let lastBadgeCount = 0;

function updateTrayIcon(count) {
  lastBadgeCount = count;
  if (!tray) return;
  if (count > 0) {
    const buf = renderTrayIcon({ count, dark: nativeTheme.shouldUseDarkColors });
    const img = nativeImage.createFromBuffer(buf, { scaleFactor: 2 });
    img.setTemplateImage(false);
    tray.setImage(img);
  } else if (trayTemplateIcon) {
    tray.setImage(trayTemplateIcon);
  }
}
```

- [ ] **Step 3: Initialize the tray with the template icon + theme listener**

In `app.whenReady`, replace the tray creation:

```js
  const iconPath = path.join(__dirname, 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('Git Menu');
```

with:

```js
  const iconPath = path.join(__dirname, 'iconTemplate.png');
  trayTemplateIcon = nativeImage.createFromPath(iconPath);
  trayTemplateIcon.setTemplateImage(true);

  tray = new Tray(trayTemplateIcon);
  tray.setToolTip('Git Menu');

  // Re-render the composite icon when the system theme flips (glyph color follows the menubar).
  nativeTheme.on('updated', () => updateTrayIcon(lastBadgeCount));
```

- [ ] **Step 4: Swap the `update-tray-count` IPC to render the icon**

Replace:

```js
ipcMain.on('update-tray-count', (event, count) => {
  if (tray) {
    if (count > 0) {
      tray.setTitle(count.toString());
    } else {
      tray.setTitle('');
    }
  }
});
```

with:

```js
ipcMain.on('update-tray-count', (event, count) => {
  updateTrayIcon(count);
});
```

- [ ] **Step 5: Verify**

Run: `node --check main.js`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: tray icon renders count as red corner badge (template at 0; theme-aware)"
```

---

## Task 4: Stop setting the tray count from the PR list

**Files:**
- Modify: `src/render/prs.js`

- [ ] **Step 1: Remove the tray-count line**

In `src/render/prs.js`, delete the line in `renderPRList`:

```js
  // Tray count = unfiltered PR total (smart count comes in a later phase).
  if (window.api.updateTrayCount) window.api.updateTrayCount(prs.length);
```

(The smart count is now owned by `src/main.js`'s `updateBadges`.)

- [ ] **Step 2: Verify**

Run: `grep -c "updateTrayCount" src/render/prs.js`
Expected: `0`

---

## Task 5: Smart count + inbox badge in `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Re-import `updateInboxBadge`**

Change:

```js
import { renderInbox } from './render/inbox.js';
```

to:

```js
import { renderInbox, updateInboxBadge } from './render/inbox.js';
```

- [ ] **Step 2: Add `updateBadges` (place near `loadData`)**

```js
// Smart badge = review-requested PRs + unread inbox threads. Fetched every refresh
// regardless of the active tab, so the menubar count and inbox tab badge are always live.
async function updateBadges() {
  try {
    let reviewCount = 0;
    let unread = 0;
    const rev = await window.api.getReviewRequests();
    if (rev && rev.ok) reviewCount = (rev.data || []).length;
    const inbox = await window.api.getInbox();
    if (inbox && inbox.ok) unread = (inbox.data || []).filter((n) => n.unread).length;
    updateInboxBadge(unread);
    window.api.updateTrayCount(settings.smartBadge ? reviewCount + unread : 0);
  } catch (error) {
    console.error('updateBadges failed:', error);
  }
}
```

- [ ] **Step 3: Call it after each load**

In `loadData`, at the very end of the `try` block (after the contributions render line `renderContributions(contribRes && contribRes.ok ? contribRes.data : null);`), add a fire-and-forget call:

```js
    // Contributions are best-effort: never gate the list on them.
    const contribRes = await window.api.getContributions();
    renderContributions(contribRes && contribRes.ok ? contribRes.data : null);

    updateBadges();
```

- [ ] **Step 4: Refresh badges immediately when settings change**

In `onSettingsChange`, after `applySettings(settings, true);`, add:

```js
  applySettings(settings, true);
  updateBadges();
```

- [ ] **Step 5: Verify build + references**

Run: `grep -n "updateBadges\|updateInboxBadge" src/main.js`
Expected: shows the import, the `updateBadges` definition, the two call sites.

Run: `npx vite build`
Expected: builds with no error.

- [ ] **Step 6: Run all unit tests**

Run: `npm test`
Expected: all suites pass (incl. the new render-icon suite).

- [ ] **Step 7: Commit**

```bash
git add src/main.js
git commit -m "feat: smart menubar badge (review-requested + unread inbox) + live inbox badge"
```

---

## Task 6: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` is produced (canvas native module rebuilt as before).

- [ ] **Step 2: Manual smoke (recommended)**

Run: `npm run dev`
Expected:
- The menubar shows the **branch glyph** (no number text beside it).
- When you have review requests and/or unread notifications, a **red corner badge** with the count appears baked into the icon (10+ shows "9+").
- The **Inbox tab badge** shows the unread count immediately on launch (without opening the tab first).
- Turning **Smart badge** off in Settings removes the red badge (icon reverts to the plain glyph); turning it on restores it.
- Switching the system appearance (Dark/Light) keeps the glyph legible (re-renders).
- With nothing actionable, the icon is the plain monochrome glyph.

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-7-menubar-icon` into `main` and push. Delete the feature branch.

---

## Phase 7 Acceptance

- `lib/render-icon.js` renders the branch glyph + an optional red corner badge to a `@2x` PNG buffer (unit-tested; "9+" cap; light/dark glyph).
- The template PNGs are regenerated from the shared `drawGlyph` (ESM generator; old `.cjs` removed).
- `main.js` shows the monochrome template glyph at count 0 and the colored composite (re-rendered on theme change) at count > 0; `tray.setTitle` is gone.
- The renderer computes the smart count (review-requested + unread inbox) every refresh, sends it via `update-tray-count` (or 0 when `smartBadge` is off), and keeps the **inbox tab badge live** regardless of the active tab.
- `npm test` (9 suites) and `npm run pack` green; merged to `main`.

**Next phase:** Phase 8 — CI (GitHub Actions `release.yml`: build unsigned dmg+zip on a `v*` tag, publish to a GitHub Release), then Phase 9 — in-app self-updater.
