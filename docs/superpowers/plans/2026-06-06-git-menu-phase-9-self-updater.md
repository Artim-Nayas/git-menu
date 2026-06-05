# Git Menu — Phase 9: In-App Self-Updater — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Git Menu notice when a newer release exists and help the user install it — a "Check for updates" in Settings that compares against the GitHub Releases API, and a "Download & install" that fetches the new DMG and opens it (guiding the drag-to-Applications), plus a subtle update dot on the gear at launch.

**Architecture:** A pure, unit-tested `lib/updater-core.js` (semver compare + release-payload parse). Two main IPC handlers: `check-update` (`gh api releases/latest` → parse → compare `app.getVersion()`) and `download-update` (`gh release download` the DMG to temp → `shell.openPath`). The Settings "About" block hosts the updater UI; `src/main.js` does a launch-time silent check to flag the gear. No new runtime deps.

**Install strategy (deliberate):** Rather than the spec's fragile in-place `.app` swap (untestable + risky for an unsigned app — translocation/permissions can brick an install), this implements the spec's **DMG-assisted fallback as the primary path**: download the DMG, open it, and guide the user to drag + reopen. Robust, never bricks, reuses `gh`. True silent auto-update remains the signed-app future path.

**Tech Stack:** Electron main (ESM) + `gh` + `shell`, vanilla ESM renderer, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §12 (self-update). The `v0.1.0` GitHub Release (Phase 8) is the data source.

**Branch:** subagent-driven-development should create/work on `phase-9-self-updater` off `main`.

> **Scope note:** launch-time + manual checks only (no background polling timer) to stay light; a periodic
> check can be added later. The in-place bundle swap is intentionally out of scope (see above).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/updater-core.js` | Create | `compareVersions`, `isUpdateAvailable`, `parseLatestRelease` (pure) |
| `test/updater-core.test.js` | Create | unit tests |
| `main.js` (root) | Modify | `check-update` + `download-update` IPC |
| `preload.js` | Modify | expose `checkUpdate`/`downloadUpdate` |
| `src/render/settings.js` | Modify | About block: check / download / quit UI |
| `src/style.css` | Modify (append) | updater UI + gear update-dot |
| `src/main.js` | Modify | launch-time silent check → gear dot |

---

## Task 1: `lib/updater-core.js` (TDD)

**Files:**
- Create: `lib/updater-core.js`
- Test: `test/updater-core.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/updater-core.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isUpdateAvailable, parseLatestRelease } from '../lib/updater-core.js';

test('compareVersions orders dotted numeric versions', () => {
  assert.equal(compareVersions('0.1.0', '0.1.1'), -1);
  assert.equal(compareVersions('0.1.1', '0.1.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1); // numeric, not lexical
  assert.equal(compareVersions('0.1', '0.1.0'), 0);     // missing segments = 0
});

test('isUpdateAvailable is true only for a strictly newer latest', () => {
  assert.equal(isUpdateAvailable('0.1.0', '0.1.1'), true);
  assert.equal(isUpdateAvailable('0.1.1', '0.1.1'), false);
  assert.equal(isUpdateAvailable('0.2.0', '0.1.9'), false);
  assert.equal(isUpdateAvailable('0.1.0', ''), false);  // no latest
});

test('parseLatestRelease reduces the GitHub payload', () => {
  const raw = {
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/Artim-Nayas/git-menu/releases/tag/v0.2.0',
    assets: [
      { name: 'Git-Menu-0.2.0-arm64.dmg' },
      { name: 'Git-Menu-0.2.0-arm64-mac.zip' },
      { name: 'latest-mac.yml' },
    ],
  };
  assert.deepEqual(parseLatestRelease(raw), {
    tag: 'v0.2.0',
    version: '0.2.0',
    notesUrl: 'https://github.com/Artim-Nayas/git-menu/releases/tag/v0.2.0',
    hasDmg: true,
  });
});

test('parseLatestRelease tolerates a missing/odd payload', () => {
  assert.deepEqual(parseLatestRelease({}), { tag: '', version: '', notesUrl: '', hasDmg: false });
  assert.doesNotThrow(() => parseLatestRelease(undefined));
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/updater-core.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/updater-core.js`:

```js
// Pure helpers for the self-updater. No I/O.

// Compare dotted numeric versions. Returns -1, 0, or 1.
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function isUpdateAvailable(current, latest) {
  if (!latest) return false;
  return compareVersions(latest, current) > 0;
}

// Reduce a GitHub "latest release" payload to what the updater needs.
export function parseLatestRelease(raw) {
  const tag = raw?.tag_name || '';
  const assets = raw?.assets || [];
  return {
    tag,
    version: tag.replace(/^v/, ''),
    notesUrl: raw?.html_url || '',
    hasDmg: assets.some((a) => /\.dmg$/i.test(a?.name || '')),
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/updater-core.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/updater-core.js test/updater-core.test.js
git commit -m "feat: updater-core (semver compare + release parse) with tests"
```

---

## Task 2: Updater IPC + preload

**Files:**
- Modify: `main.js` (root)
- Modify: `preload.js`

- [ ] **Step 1: Import the core**

In `main.js`, add (with the other `./lib/*` imports):

```js
import { isUpdateAvailable, parseLatestRelease } from './lib/updater-core.js';
```

- [ ] **Step 2: Add the IPC handlers (after the `get-version` handler)**

```js
ipcMain.handle('check-update', async () => {
  const res = await runGH('gh', ['api', 'repos/Artim-Nayas/git-menu/releases/latest']);
  if (!res.ok) return res;
  const info = parseLatestRelease(res.data);
  const current = app.getVersion();
  return { ok: true, data: { ...info, current, available: isUpdateAvailable(current, info.version) } };
});

ipcMain.handle('download-update', async (event, tag) => {
  if (!tag) return { ok: false, kind: 'api', message: 'No release tag provided' };
  const dir = path.join(app.getPath('temp'), 'git-menu-update');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    return { ok: false, kind: 'api', message: String(error) };
  }
  const res = await runGH('gh', [
    'release', 'download', tag,
    '--repo', 'Artim-Nayas/git-menu',
    '--pattern', '*.dmg',
    '--dir', dir,
    '--clobber',
  ]);
  if (!res.ok) return res;
  let dmg;
  try {
    dmg = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.dmg'));
  } catch {
    dmg = null;
  }
  if (!dmg) return { ok: false, kind: 'api', message: 'DMG not found after download' };
  const dmgPath = path.join(dir, dmg);
  await shell.openPath(dmgPath);
  return { ok: true, data: { path: dmgPath } };
});
```

> `gh release download` writes no stdout on success — the Phase 5 `runGH` empty-body guard already
> returns `{ok:true,data:null}` for that, so these handlers work.

- [ ] **Step 3: Expose them in `preload.js`**

After `getVersion`, add:

```js
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: (tag) => ipcRenderer.invoke('download-update', tag),
```

- [ ] **Step 4: Verify**

Run: `node --check main.js && node --check preload.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js
git commit -m "feat: check-update + download-update IPC (GitHub Releases API + gh download)"
```

---

## Task 3: Updater UI in the Settings About block

**Files:**
- Modify: `src/render/settings.js`

- [ ] **Step 1: Replace the About line with the updater block**

In `src/render/settings.js`, find the About line in the `view.innerHTML` template:

```js
      <div class="settings-about">Git Menu v${escapeHtml(version || '')}</div>
```

and replace it with:

```js
      <div class="settings-about">
        <span class="about-version">Git Menu v${escapeHtml(version || '')}</span>
        <button class="check-update" type="button">Check for updates</button>
        <div class="update-status"></div>
      </div>
```

- [ ] **Step 2: Wire the updater (add at the end of `renderSettingsView`, after the existing listener blocks)**

```js
  const checkBtn = view.querySelector('.check-update');
  const status = view.querySelector('.update-status');
  if (checkBtn && status) {
    checkBtn.addEventListener('click', async () => {
      status.textContent = 'Checking…';
      let res;
      try {
        res = await window.api.checkUpdate();
      } catch {
        res = null;
      }
      if (!res || !res.ok) {
        status.textContent = "Couldn't check for updates.";
        return;
      }
      const u = res.data;
      if (!u.available) {
        status.textContent = `You're up to date (v${u.current}).`;
        return;
      }
      status.innerHTML = `
        <div class="update-available">Update available: v${escapeHtml(u.version)}</div>
        <div class="update-actions">
          <button class="download-update" type="button">Download &amp; install</button>
          <a class="update-notes" data-url="${escapeHtml(u.notesUrl)}">Release notes</a>
        </div>`;
      status.querySelector('.update-notes').addEventListener('click', (e) => {
        window.api.openExternal(e.currentTarget.dataset.url);
      });
      status.querySelector('.download-update').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Downloading…';
        let dl;
        try {
          dl = await window.api.downloadUpdate(u.tag);
        } catch {
          dl = null;
        }
        if (!dl || !dl.ok) {
          status.innerHTML = '<div class="update-available">Download failed — open the Releases page instead.</div>';
          return;
        }
        status.innerHTML = `
          <div class="update-available">Installer opened.</div>
          <div class="update-hint">Drag <strong>Git Menu</strong> to Applications (replacing the old one), then quit &amp; reopen.</div>
          <button class="quit-now" type="button">Quit Git Menu</button>`;
        status.querySelector('.quit-now').addEventListener('click', () => window.api.quitApp());
      });
    });
  }
```

- [ ] **Step 3: Confirm references exist**

Run: `grep -c "check-update\|download-update\|update-status" src/render/settings.js`
Expected: a count ≥ 3.

> No commit yet — built with styles + the dot in Tasks 4–5.

---

## Task 4: Updater styles

**Files:**
- Modify: `src/style.css` (append)

- [ ] **Step 1: Append styles**

Append to `src/style.css`:

```css

/* Self-updater (Settings About) */
.settings-about { display: flex; flex-direction: column; gap: 6px; }
.about-version { color: var(--text-secondary); }
.check-update {
  -webkit-app-region: no-drag;
  align-self: flex-start;
  background: var(--seg-bg);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 11px;
  border-radius: 5px;
  padding: 3px 8px;
  cursor: pointer;
}
.check-update:hover { background: var(--bg-color-hover); }
.update-status { font-size: 11px; color: var(--text-secondary); }
.update-available { color: var(--text-primary); font-weight: 600; }
.update-actions { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.download-update {
  -webkit-app-region: no-drag;
  background: var(--accent-color);
  border: none;
  color: #fff;
  font-size: 11px;
  border-radius: 5px;
  padding: 3px 10px;
  cursor: pointer;
}
.download-update:disabled { opacity: 0.6; cursor: default; }
.update-notes { color: var(--accent-color); cursor: pointer; }
.update-hint { margin-top: 4px; line-height: 1.4; }
.quit-now {
  -webkit-app-region: no-drag;
  align-self: flex-start;
  margin-top: 6px;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 11px;
  border-radius: 5px;
  padding: 3px 8px;
  cursor: pointer;
}

/* Gear "update available" dot */
#settings-btn.has-update { position: relative; }
#settings-btn.has-update::after {
  content: '';
  position: absolute;
  top: 1px;
  right: 1px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #388bfd;
}
```

- [ ] **Step 2: Verify**

Run: `grep -c "check-update\|update-status\|download-update\|has-update" src/style.css`
Expected: a count ≥ 4.

---

## Task 5: Launch-time silent check (gear dot)

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add the silent check**

Add this function near `updateBadges` in `src/main.js`:

```js
// Quietly check for a newer release on launch; flag the gear if one exists.
async function checkForUpdateDot() {
  try {
    const res = await window.api.checkUpdate();
    if (res && res.ok && res.data.available) {
      document.getElementById('settings-btn').classList.add('has-update');
    }
  } catch (error) {
    console.error('update check failed:', error);
  }
}
```

- [ ] **Step 2: Call it once on load**

In the `DOMContentLoaded` handler, after `loadData();`, add the fire-and-forget call:

```js
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupFilterChips();
  setupKeyboardNav();
  await initSettings();
  loadData();
  checkForUpdateDot();
});
```

- [ ] **Step 3: Verify build + references**

Run: `grep -n "checkForUpdateDot\|has-update" src/main.js`
Expected: the definition + the call.

Run: `npx vite build`
Expected: builds with no error.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`
Expected: all suites pass (incl. the new updater-core suite).

- [ ] **Step 5: Commit**

```bash
git add src/render/settings.js src/style.css src/main.js
git commit -m "feat: self-updater UI (check/download/quit in Settings) + launch update dot"
```

---

## Task 6: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` is produced.

- [ ] **Step 2: Manual smoke (recommended)**

Run: `npm run dev`. In Settings → About:
- **Check for updates** shows "You're up to date (v0.1.0)." (dev `app.getVersion()` is `0.1.0`, matching the published release).
- To exercise the "available" path, temporarily publish a higher release OR run a build whose `package.json` version is lower than the latest release, then **Check for updates** shows "Update available: vX.Y.Z" with **Download & install** + **Release notes**.
- **Download & install** fetches the DMG via `gh` and opens it; the UI then shows the drag-to-Applications hint + **Quit Git Menu**.
- **Release notes** opens the GitHub release page.
- If a newer release exists at launch, the footer **gear shows a blue dot**.

> Note: the real cross-version flow is only fully exercisable against an actual newer GitHub Release;
> `compareVersions`/`parseLatestRelease` are unit-tested, and the IPC paths degrade gracefully on error.

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-9-self-updater` into `main` and push. Delete the feature branch. (Optionally cut `v0.1.1` via `npm run release` afterward to see the updater light up for `v0.1.0` users.)

---

## Phase 9 Acceptance

- `lib/updater-core.js` pure + unit-tested (numeric semver compare; release-payload parse; missing-field safety).
- `check-update` compares the GitHub `releases/latest` tag to `app.getVersion()`; `download-update` fetches the DMG via `gh release download` and opens it.
- Settings → About: **Check for updates** → up-to-date / **Update available** with **Download & install** (opens DMG + drag hint + Quit) and **Release notes**.
- Launch-time silent check flags the gear with a dot when an update exists.
- `npm test` (10 suites) and `npm run pack` green; merged to `main`.

**This completes the 9-phase build** (spec §16). Remaining polish/extensions (background poll, signed silent auto-update, Windows/Linux) are future work.
