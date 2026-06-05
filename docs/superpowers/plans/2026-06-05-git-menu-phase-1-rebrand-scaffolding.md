# Git Menu — Phase 1: Rebrand + Repo + Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the existing `repobar_2` app to **Git Menu**, strip template cruft, add open-source scaffolding (MIT, README, .gitignore), and publish it as a public GitHub repo `Artim-Nayas/git-menu` with a valid electron-builder config — leaving a working, launchable, renamed app.

**Architecture:** No behavior change in this phase. Pure rename + scaffolding: update identity strings (`package.json`, `main.js` tray tooltip, `index.html` title), remove unused Vite-template files, add an electron-builder `build` block targeting an unsigned macOS DMG+ZIP that publishes to GitHub Releases (consumed by later phases), then init git and push.

**Tech Stack:** Electron 41, Vite 8, electron-builder 26, `gh` CLI, vanilla JS.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` (§10, §10.1, §11 publish target).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `package.json` | Modify | New name/identity, version `0.1.0`, electron-builder `build` config, `pack` script |
| `main.js` | Modify (line 96) | Tray tooltip `RepoBar` → `Git Menu` |
| `index.html` | Modify (line 7) | `<title>` → `Git Menu` |
| `.gitignore` | Modify | Add `.superpowers/`, `release/` |
| `src/counter.js` | Delete | Unused Vite template leftover (not imported anywhere) |
| `test-tray.js` | Delete | Scratch file, not part of the app |
| `LICENSE` | Create | MIT license text |
| `README.md` | Create | Project intro, install, build, contributing |

> Verification before deleting `src/counter.js` / `test-tray.js`: a grep confirms nothing imports them (Step in Task 4).

---

## Task 1: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append ignore entries**

Add these lines to the end of `.gitignore`:

```gitignore

# Brainstorm companion artifacts
.superpowers/

# electron-builder output
release/
```

- [ ] **Step 2: Verify**

Run: `tail -6 .gitignore`
Expected: shows the `.superpowers/` and `release/` entries.

---

## Task 2: Rebrand `package.json` + add electron-builder config

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace the whole file**

Write `package.json` with this exact content:

```json
{
  "name": "git-menu",
  "version": "0.1.0",
  "private": true,
  "description": "A macOS menu-bar app for your GitHub pull requests, reviews, notifications, and contributions — powered by the gh CLI.",
  "author": "Artim-Nayas",
  "license": "MIT",
  "homepage": "https://github.com/Artim-Nayas/git-menu",
  "repository": {
    "type": "git",
    "url": "https://github.com/Artim-Nayas/git-menu.git"
  },
  "type": "module",
  "main": "main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"sleep 2 && cross-env NODE_ENV=development electron .\"",
    "build": "vite build && electron-builder",
    "pack": "vite build && electron-builder --dir",
    "preview": "vite preview"
  },
  "build": {
    "appId": "com.artimnayas.gitmenu",
    "productName": "Git Menu",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "main.js",
      "preload.js",
      "iconTemplate.png",
      "iconTemplate@2x.png",
      "package.json"
    ],
    "mac": {
      "target": [
        "dmg",
        "zip"
      ],
      "category": "public.app-category.developer-tools",
      "identity": null
    },
    "publish": [
      {
        "provider": "github",
        "owner": "Artim-Nayas",
        "repo": "git-menu"
      }
    ]
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "cross-env": "^10.1.0",
    "electron": "^41.7.1",
    "electron-builder": "^26.8.1",
    "vite": "^8.0.12"
  },
  "dependencies": {
    "canvas": "^3.2.3"
  }
}
```

> Note: `"mac.identity": null` forces an **unsigned** build (the "Free & light" decision — no Apple account). `"directories.output": "release"` keeps electron-builder output out of Vite's `dist/`.

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "const p=require('./package.json'); console.log(p.name, p.version, p.build.productName, p.build.mac.identity)"`
Expected: `git-menu 0.1.0 Git Menu null`

---

## Task 3: Rename in-app strings

**Files:**
- Modify: `main.js:96`
- Modify: `index.html:7`

- [ ] **Step 1: Tray tooltip in `main.js`**

Find (around line 96):

```js
  tray.setToolTip('RepoBar');
```

Replace with:

```js
  tray.setToolTip('Git Menu');
```

- [ ] **Step 2: Window title in `index.html`**

Find (line 7):

```html
    <title>RepoBar</title>
```

Replace with:

```html
    <title>Git Menu</title>
```

- [ ] **Step 3: Verify no stale "RepoBar" references remain in source**

Run: `grep -rn "RepoBar" --include="*.js" --include="*.html" --include="*.css" . | grep -v node_modules | grep -v dist`
Expected: no output (empty).

---

## Task 4: Remove Vite-template cruft

**Files:**
- Delete: `src/counter.js`
- Delete: `test-tray.js`

- [ ] **Step 1: Confirm nothing imports them**

Run: `grep -rn "counter\|test-tray" --include="*.js" --include="*.html" . | grep -v node_modules | grep -v dist`
Expected: no output (empty) — confirms they are unreferenced.

- [ ] **Step 2: Delete the files**

Run:
```bash
rm src/counter.js test-tray.js
```

- [ ] **Step 3: Verify the app's renderer still resolves its imports**

Run: `grep -n "import" src/main.js`
Expected: only `import './style.css';` — no reference to the deleted files.

---

## Task 5: Add MIT `LICENSE`

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Write the file**

Write `LICENSE` with this exact content:

```text
MIT License

Copyright (c) 2026 Artim-Nayas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Verify**

Run: `head -1 LICENSE`
Expected: `MIT License`

---

## Task 6: Add `README.md`

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the file**

Write `README.md` with this exact content:

````markdown
# Git Menu

A lightweight macOS menu-bar app for your GitHub work — pull requests, review
requests, a notifications inbox, and your contribution activity — without
leaving the menu bar. Powered entirely by the [`gh`](https://cli.github.com)
CLI, so it uses your existing GitHub auth.

> Status: early (`v0.1.0`). macOS (Apple Silicon) only for now.

## Install

1. Install and authenticate the GitHub CLI:
   ```bash
   brew install gh
   gh auth login
   ```
2. Download the latest **`Git Menu-*.dmg`** from
   [Releases](https://github.com/Artim-Nayas/git-menu/releases).
3. Open the DMG and drag **Git Menu** to Applications.
4. **First launch:** the app is unsigned (free, no Apple Developer account), so
   macOS Gatekeeper will warn you. **Right-click the app → Open** once to allow it.
   After that it launches normally.

The app lives in your menu bar (no Dock icon). Click the icon to see your PRs.

## Features

- **Mine / Reviews / Inbox** tabs — your open PRs, PRs awaiting your review, and
  a smart notifications inbox (review requests, mentions, replies).
- **Contribution activity** — streak, today, and an expandable heatmap.
- **At-a-glance status** — CI state, review decision, diffstat, labels.
- **Menu-bar count** of items that actually need you.
- **Keyboard-first** — global hotkey, `j`/`k` navigation, quick search.
- **Self-updating** — check for and install updates from Settings.

## Build from source

```bash
git clone https://github.com/Artim-Nayas/git-menu.git
cd git-menu
npm install
npm run dev      # run locally
npm run build    # produce an unsigned DMG + ZIP in ./release
```

## Contributing

Issues and PRs welcome. This is an open-source MIT project — see [LICENSE](LICENSE).

## License

[MIT](LICENSE) © 2026 Artim-Nayas
````

- [ ] **Step 2: Verify**

Run: `head -1 README.md`
Expected: `# Git Menu`

---

## Task 7: Initialize git and make the first commit

**Files:** none (git metadata)

- [ ] **Step 1: Initialize the repo on a `main` branch**

Run:
```bash
git init -b main
```
Expected: `Initialized empty Git repository in .../repobar_2/.git/`

- [ ] **Step 2: Confirm ignored paths are not staged**

Run:
```bash
git add -A && git status --short | grep -E "node_modules|^.. dist/|\.superpowers|^.. release/" || echo "CLEAN"
```
Expected: `CLEAN` (none of node_modules/dist/.superpowers/release are staged).

- [ ] **Step 3: Commit**

Run:
```bash
git commit -m "chore: rebrand to Git Menu + open-source scaffolding

Rename repobar_2 -> Git Menu (package identity, tray tooltip, window title).
Add electron-builder config (unsigned macOS dmg+zip, GitHub publish target).
Add MIT LICENSE, README, .gitignore entries. Remove Vite-template cruft.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: a commit is created listing the changed/added files.

---

## Task 8: Create the public GitHub repo and push

**Files:** none (remote)

- [ ] **Step 1: Confirm the name is still free**

Run: `gh repo view Artim-Nayas/git-menu 2>&1 | head -1`
Expected: `Could not resolve to a Repository ...` (i.e., still available). If it already exists and is yours, skip creation and just add the remote in Step 2's alternate.

- [ ] **Step 2: Create + push**

Run:
```bash
gh repo create Artim-Nayas/git-menu \
  --public \
  --source=. \
  --remote=origin \
  --description "macOS menu-bar app for GitHub PRs, reviews, inbox & contributions (gh-powered)" \
  --push
```
Expected: repo created, `main` pushed, `origin` remote set.

> Alternate if the repo already exists:
> `git remote add origin https://github.com/Artim-Nayas/git-menu.git && git push -u origin main`

- [ ] **Step 3: Verify remote + visibility**

Run: `gh repo view Artim-Nayas/git-menu --json name,visibility,defaultBranchRef -q '.name+" "+.visibility+" "+.defaultBranchRef.name'`
Expected: `git-menu PUBLIC main`

---

## Task 9: Verify the renamed app builds and packages

**Files:** none (build verification)

- [ ] **Step 1: Install deps (if not already)**

Run: `npm ci 2>/dev/null || npm install`
Expected: completes without error (canvas may compile native bits — that's normal).

- [ ] **Step 2: Package an unsigned `.app` (fast, no DMG)**

Run: `npm run pack`
Expected: Vite build succeeds, then electron-builder writes `release/mac-arm64/Git Menu.app` (note the **new product name**). No signing step runs (identity null).

- [ ] **Step 3: Confirm the bundle is named "Git Menu"**

Run: `ls release/mac-arm64/ | grep "Git Menu.app"`
Expected: `Git Menu.app`

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev`
Expected: a menu-bar icon appears; clicking it opens the popover; hovering the
icon shows the tooltip **"Git Menu"**. Quit with the in-app quit button.

- [ ] **Step 5: Commit any lockfile/build-config adjustments**

Run:
```bash
git add -A
git commit -m "chore: verify Git Menu packaging (unsigned)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "nothing to commit"
git push
```
Expected: pushed (or "nothing to commit" if Step 2 changed no tracked files).

---

## Phase 1 Acceptance

- `git-menu` exists as a **public** GitHub repo with `main` pushed.
- The app builds unsigned and the bundle is **`Git Menu.app`**.
- Tray tooltip and window title read **Git Menu**; no `RepoBar` strings remain.
- `LICENSE` (MIT), `README.md`, updated `.gitignore` present; cruft removed.
- electron-builder `build` config targets dmg+zip with GitHub publish (used by Phase 8 CI).

**Next phase:** Phase 2 — Data + error layer (structured `runGH`, extended PR GraphQL query, not-authed/no-gh setup screen).
