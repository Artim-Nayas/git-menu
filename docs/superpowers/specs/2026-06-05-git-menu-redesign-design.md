# Git Menu — Redesign + Open-Source Release Design

**Date:** 2026-06-05
**Status:** Approved (brainstorm) — pending written-spec review
**Author:** Artim-Nayas (with Claude)

## 1. Overview

`repobar_2` is a macOS menu-bar app (Electron + Vite, vanilla JS renderer) that
shows your GitHub pull requests and contribution activity, driven entirely by the
`gh` CLI. This effort:

1. **Rebrands** it to **Git Menu** (repo `git-menu`).
2. **Refreshes the UI** of the PR list.
3. Adds a **GitHub Inbox tab** (notifications, smart subset).
4. Adds a **power-user layer** (global hotkey, keyboard nav, launch-at-login, Settings).
5. **Re-imagines the contributions widget** (activity ring + tallies, expandable heatmap).
6. Bakes an **honest count into a redesigned menubar icon** (branch glyph + red corner badge).
7. Ships it **open source (MIT)** with **GitHub Actions CI** and an **in-app self-updater**.

### Guiding constraints
- **Stay light.** No UI framework. Renderer remains vanilla ES modules.
- **No `electron-updater`.** Self-update is a small custom module over the GitHub
  Releases API (chosen "Free & light" path — no Apple Developer account, $0).
- `canvas` is already a dependency (icon generation) and is reused for the dynamic
  tray icon. No other new runtime deps.

### Non-goals
- Native OS notifications / alerting (explicitly descoped by the user).
- macOS code signing & notarization (descoped; documented Gatekeeper caveat instead).
- Windows/Linux builds (macOS-only for now; code stays portable where free).
- Writing actions (approve/comment/merge) from the menubar — read + open only.

## 2. Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Product name / repo | **Git Menu** / `Artim-Nayas/git-menu`, **public** |
| License | **MIT** |
| Inbox scope | **Smart subset**: unread `review_requested`, `mention`, `comment` (reply to your threads), `assign` |
| Updates | **Free & light**: unsigned DMG built by CI on version tag → GitHub Release; in-app updater checks Releases API; one-click download+install from Settings |
| Code signing | **None** (document right-click→Open once on first launch) |
| Contributions | **Ring + tallies** default; **expandable heatmap** with **3M / 6M / 1Y** dropdown |
| Menubar glyph | **Git branch** |
| Count integration | **S4 — red corner badge** baked into the icon image (colored, non-template) |
| Smart badge meaning | Count of items needing **you** = review-requested PRs + unread inbox threads; hidden at 0 |

## 3. Architecture

Keep the Electron **main / preload / renderer** split. The current `src/main.js`
(357 lines) does too much; **break the renderer into focused ES modules**. Vite
bundles them — no runtime cost.

```
main.js                  Electron main: window, tray, IPC, gh calls, hotkey,
                         login-item, settings file, dynamic tray icon, updater
preload.js               contextBridge API surface (extended)
src/
  main.js                renderer entry: wiring, tab/router, auto-refresh
  render/
    prs.js               PR list: grouping, rows, filter chips
    contributions.js     ring + tallies + expandable heatmap + range dropdown
    inbox.js             notifications: grouping, render, mark-read
    settings.js          Settings view: render + bind to IPC
    keyboard.js          keyboard navigation + shortcuts
    setup.js             not-authed / gh-missing setup screen
  lib/
    api.js               thin wrapper over window.api (renderer side)
    time.js              relative-time formatting (pure)
    stats.js             streak / today / week / best from calendar (pure)
    notifications.js     filter + group notifications by reason (pure)
    levels.js            contribution count → level 0..4 (pure)
  icon/
    render-icon.js       (main-side) canvas → nativeImage compositor for tray
  style.css              extended
index.html               structural additions (tabs, chips, settings, setup)
```

`lib/*` pure functions are unit-tested with plain `node --test` (no test framework dep).

## 4. Data layer (main process, via `gh`)

### 4.1 Existing, extended
`prQuery` GraphQL gains fields:
```
author { login avatarUrl }
additions
deletions
labels(first: 3) { nodes { name color } }
```
(`reviewDecision`, `isDraft`, `commits…statusCheckRollup.state` already present.)

These power: **avatars**, **diffstat (+N −M)**, **labels**, and the **status filter chips**.

### 4.2 New IPC
| Channel | Action |
|---|---|
| `get-inbox` | `gh api notifications` → filter to reasons {`review_requested`,`mention`,`comment`,`assign`}, unread; normalize to `{id, reason, title, repo, number, url, updatedAt, unread}` |
| `mark-read` | `gh api -X PATCH notifications/threads/:id` |
| `mark-all-read` | loop `mark-read` over the **currently displayed** threads (not the global `PUT notifications`, which would mark unrelated threads read) |
| `get-settings` / `set-settings` | read/write settings JSON in `userData` |
| `set-login-item` | `app.setLoginItemSettings({ openAtLogin })` |
| `check-update` / `download-update` | self-updater (§9) |

### 4.3 Error / auth handling (currently silent — fix)
`runGH` returns a **structured result** instead of swallowing errors:
```
{ ok: true, data } | { ok: false, kind: 'no-gh' | 'no-auth' | 'network' | 'api', message }
```
- `no-gh`: `gh` not found on PATH.
- `no-auth`: detected via `gh auth status` non-zero / "not logged into".
- `network` / `api`: transport or GraphQL errors.

Renderer behavior:
- **First load fails with `no-gh`/`no-auth`** → render **Setup screen** (`setup.js`):
  explains install `gh` / run `gh auth login`, with a **copy-command** button and a
  **link to docs**. No more blank "No pull requests".
- **Silent refresh fails** → keep stale data, show a subtle inline "Couldn't refresh ·
  retry" affordance. Never wipe the list.

## 5. PR list (UI refresh)

Retain the **Org → Repo accordion** grouping and collapse memory. Each PR row gains:
- **Avatar** (`author.avatarUrl`, 18px, rounded; lazy `<img>` with a neutral fallback
  on error). CSP already allows images (`script-src` only); no change needed.
- **Relative time** ("2h ago", "3d ago") via `lib/time.js`, refreshed on each render.
- **Diffstat** `+86 −12` (green/red) when available.
- **Labels** (up to 3 chips, colored from GitHub label color, contrast-adjusted).
- Existing CI dot + review badge retained, restyled.

### 5.1 Status filter chips
Row above the search: **All · ⚠ Failing · 👀 Review · ✓ Approved · Draft**. Pure
client-side filter over the already-fetched list (combines with search text):
- Failing → `statusCheckRollup.state ∈ {FAILURE, ERROR}`
- Review → `reviewDecision = REVIEW_REQUIRED`
- Approved → `reviewDecision = APPROVED`
- Draft → `isDraft`
Selected chip persists per-session (not saved).

### 5.2 Org / repo header actions (Phase 3)
Each **org** and **repo** accordion header gets a **clickable "open on GitHub" icon**
(appears on hover, `-webkit-app-region: no-drag`) that opens the org/repo page in the
browser via `openExternal` — without toggling the accordion (`stopPropagation`):
- Org header icon → `https://github.com/<org>`
- Repo header icon → `https://github.com/<org>/<repo>`

### 5.3 Show all contributed-to repos, even with no open PRs (Phase 3)
The list is no longer limited to repos that currently have open PRs. On the **Mine** tab it
also surfaces every repo the user has recently contributed to:
- New best-effort query `get-contributed-repos` →
  `viewer.repositoriesContributedTo(first: 100, contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW], includeUserRepositories: true)` returning `{nameWithOwner}`.
- Merge these into the Org → Repo grouping. Repos with open PRs render their PRs as today;
  repos with **none** render an empty repo row with a muted **"No open PRs"** placeholder and
  the repo-visit icon from §5.2.
- To avoid a heavy/long list, **empty repos default to collapsed** and sort **below** repos
  that have open PRs within each org. The whole "include empty repos" behavior is gated by a
  Settings toggle (**Show all contributed repos**, default on) added to the §8.1 schema as
  `"showEmptyRepos": true`.
- This is best-effort: if `get-contributed-repos` fails, fall back to the PR-only list
  (never block rendering).

## 6. Inbox tab

Third segmented tab **Inbox** with an unread count badge. Data = `get-inbox`
(smart subset). Rendered **grouped by reason**:
- **Review requested** · **Mentioned** · **Reply to your thread** · **Assigned**

Each row: unread dot, avatar, `repo #num`, title, relative time, short reason text.
- **Click** → open the thread URL **and** `mark-read` (optimistic: remove dot, decrement badge).
- **Mark all read** in the footer → `mark-all-read` for shown threads.
- Empty → "Inbox zero" state.

## 7. Contributions widget (re-imagined — option D)

Replaces the always-on 15-week heatmap.

**Default (collapsed):** an **activity ring** (today's count vs. a rolling typical-day
baseline = recent daily average; purely cosmetic fill) with the number in the center,
beside **tallies**: Current streak 🔥, This week, Best day, This year.

**Expandable heatmap:** a **Heatmap** disclosure row carries a **range dropdown
(Last 3 months / 6 months / 1 year)**. Expanding reveals the GitHub-style grid for the
selected slice of the existing calendar, with month labels and a Less▢▢▢▢More legend.
Wider ranges fit by shrinking blocks / horizontal scroll. Expanded state + chosen range
**persist** in settings.

All derived from the **existing** `get-contributions` calendar — no new fetch.
`lib/stats.js` computes streak/today/week/best; `lib/levels.js` maps counts to levels.

The whole widget is **toggleable** in Settings (off → reclaims the vertical space).

## 8. Power-user layer

- **Global hotkey** to toggle the window: `globalShortcut.register`, default **⌥G**,
  reconfigurable in Settings (record-key field). Unregister on quit / re-register on change.
- **Keyboard navigation** (`keyboard.js`) when the window is focused:
  - `j` / `k` or ↓/↑ — move selection · `↵` — open selected · `c` — copy URL ·
    `⌘F` or `/` — focus search · `1/2/3` — switch tabs · `Esc` — clear search / hide window.
  - Selected row is visually highlighted (left accent bar); auto-scrolls into view.
- **Launch at login** — `setLoginItemSettings`, toggle in Settings.
- **Settings** — an in-popover view (slides over the list; back chevron returns):
  - Launch at login (toggle)
  - Contributions widget (toggle)
  - Smart badge (toggle)
  - Refresh interval (1 / 5 / 15 / 30 min)
  - Global hotkey (record field)
  - Tabs shown (Mine / Reviews / Inbox checkboxes)
  - About: version + **Check for updates** (§9)

### 8.1 Settings persistence
JSON file at `app.getPath('userData')/settings.json`. Schema:
```jsonc
{
  "version": 1,
  "launchAtLogin": false,
  "showContributions": true,
  "smartBadge": true,
  "refreshMinutes": 5,
  "hotkey": "Alt+G",
  "showEmptyRepos": true,
  "tabs": { "mine": true, "reviews": true, "inbox": true },
  "contrib": { "expanded": false, "range": "6m" }
}
```
Loaded on startup (applies hotkey, login-item, refresh timer, tab visibility, widget).
Missing/corrupt file → defaults. Written atomically on change.

## 9. Menubar icon + integrated count

### 9.1 Glyph
New **git-branch** template glyph (two nodes + branch curve + tip node), replacing the
current `iconTemplate.png`. Shipped as `iconTemplate.png` + `@2x` (monochrome template
for the count-zero state, so macOS handles light/dark).

### 9.2 Count baked in (S4 red corner badge)
When the smart count > 0, the tray icon becomes a **composite colored image** rendered
at runtime via **canvas** (already a dep) in the main process (`icon/render-icon.js`):
- Base: the branch glyph in the current menubar foreground color
  (`nativeTheme.shouldUseDarkColors` → white, else black).
- Overlay: a **red rounded badge** at the top-right with the count (white digits),
  **capped at "9+"** for ≥10.
- Output a `@2x` PNG buffer → `nativeImage.createFromBuffer(buf, { scaleFactor: 2 })`,
  `tray.setImage(...)`, and **`setTemplateImage(false)`** (it's colored).
- Count **0** → revert to the monochrome **template** glyph (`setTemplateImage(true)`),
  no badge.
- Re-render on count change **and** on `nativeTheme.on('updated')` (theme switch).
- **Stop using `tray.setTitle`** for the count (that was the space-eating text).

### 9.3 Smart count source
Main computes the badge count from the data it already fetches per refresh:
`reviewRequestedCount + unreadInboxCount` (review-requested PRs you owe + unread inbox).
Respects the `smartBadge` setting (off → never badge).

## 10. Open-source release

- **Repo:** create `Artim-Nayas/git-menu`, public.
- **LICENSE:** MIT (© 2026 Artim-Nayas).
- **README.md:** what it is, screenshot, install (download DMG from Releases →
  right-click→Open first launch, since unsigned), `gh auth login` prerequisite,
  features, build-from-source, contributing.
- **.gitignore:** `node_modules`, `dist`, `.superpowers/`, `.DS_Store`.
- **package.json:** `name`/`productName` → Git Menu; `version` → `0.1.0`;
  `build` (electron-builder) config: `appId`, `productName`, `mac.target` dmg+zip,
  `publish: github`, `mac.identity: null` (explicitly unsigned).
- Existing `dist/` build artifacts are removed from version control (gitignored).

### 10.1 Rename touchpoints (RepoBar → Git Menu)
Every user-visible and identity string is updated:
- `package.json`: `name` (`git-menu`), `productName` (`Git Menu`), `build.appId`
  (`com.artimnayas.gitmenu`), `build.productName`.
- `main.js`: `tray.setToolTip('RepoBar')` → `'Git Menu'`; any window/app references.
- `index.html`: `<title>RepoBar</title>` → `Git Menu`.
- Tray `app.dock`/app name, About screen string, README, and built artifact names
  (`Git Menu-0.1.0-arm64.dmg`) all reflect the new name.
- Internal folder stays `repobar_2` until the repo is created as `git-menu`
  (the directory name is cosmetic; the git remote is what ships).

## 11. CI/CD (GitHub Actions)

`.github/workflows/release.yml`:
- **Trigger:** push of a tag matching `v*` (e.g. `v0.1.0`).
- **Runner:** `macos-latest`.
- **Steps:** checkout → setup-node → `npm ci` → `npm run build` (vite + electron-builder,
  unsigned) → publish the **`.dmg` + `.zip`** assets to a **GitHub Release** for that tag
  (electron-builder `--publish always`, or `softprops/action-gh-release`). The custom
  updater (§12) consumes those assets via the Releases API — no `latest-mac.yml` consumer
  exists, so any metadata electron-builder emits is simply ignored.
- **CSC_IDENTITY_AUTO_DISCOVERY: false** so it never tries to sign.
- Optional `ci.yml` on PRs: `npm ci` + lint/build sanity + run `node --test`.

Release flow for a maintainer: bump `version`, tag `vX.Y.Z`, push tag → CI publishes the
Release. (A small `npm version` helper documented in README.)

## 12. In-app self-update (custom, no `electron-updater`)

`updater` module in main:
- **Check:** `GET https://api.github.com/repos/Artim-Nayas/git-menu/releases/latest`
  (via `gh api` to reuse auth & avoid rate limits, fallback to anonymous fetch). Compare
  `tag_name` (semver) to app `version`.
- **Surface:** Settings "About" shows current version + **Check for updates**. On a newer
  version: "Update available: vX.Y.Z → Download & install" + release notes link. Also a
  silent check on launch + every ~6h; if newer, mark the Settings gear with a dot.
- **Install (unsigned path):** download the release **`.zip`** asset to a temp dir →
  unzip → replace the running `.app` bundle in place → relaunch (`app.relaunch(); app.quit()`).
  - **Fallback** if in-place replace fails (permissions / app translocation): download the
    **`.dmg`**, `shell.openPath` it, and show "drag Git Menu to Applications, then reopen."
- **Honest UX:** progress + clear success/failure messaging; never claim success on a failed
  swap. This in-place-replace-on-unsigned path is the **main implementation risk** (§14).

## 13. Data flow (summary)

```
renderer (tab/refresh/keypress)
  → window.api.* (preload)
    → ipcMain handler (main)
      → runGH('gh', …)  → GitHub (GraphQL / REST)
      ← structured {ok,…}
  ← data → render module → DOM
main, per refresh: compute smart count → render-icon → tray.setImage
settings change → set-settings → write JSON → apply (hotkey/login/timer/badge/widget)
```

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Unsigned in-place self-update fails (translocation/permissions) | DMG-open fallback + clear instructions; document; consider signing later |
| Gatekeeper "unidentified developer" on first launch | Documented in README + first-run note; right-click→Open |
| Notifications API rate limits | Route through `gh api` (authed); respect refresh interval; cache last result |
| Remote avatar load failures / privacy | Neutral fallback on error; avatars only (no tracking) |
| 2-digit counts in corner badge | Cap at "9+"; badge auto-sizes for single vs `9+` |
| `src/main.js` growth | Module split (§3) keeps each unit focused & testable |

## 15. Testing

- **Pure units** (`node --test`, no deps): `time.js` (relative time boundaries),
  `stats.js` (streak incl. today-zero edge, week/best/year), `notifications.js`
  (reason filter + grouping), `levels.js`, smart-count calc.
- **Icon compositor**: assert it returns a non-empty `@2x` buffer for count 0 / 3 / 12,
  and template vs colored mode flag.
- **UI**: manual smoke checklist (tabs, filters, inbox mark-read, keyboard nav,
  settings persistence, hotkey, setup screen when logged out).

## 16. Decomposition (suggested build order)

1. **Rebrand + repo + scaffolding** — rename to Git Menu, MIT, README, .gitignore,
   git init, create public `git-menu`, push. (Unblocks CI.)
2. **Data + error layer** — structured `runGH`, extended PR query, setup screen.
3. **UI refresh** — module split, avatars/relative-time/diffstat/labels, filter chips.
4. **Contributions widget** — ring + tallies + expandable heatmap + range.
5. **Inbox tab** — notifications IPC + render + mark-read.
6. **Power-user** — settings store + view, launch-at-login, hotkey, keyboard nav.
7. **Menubar icon** — branch glyph + canvas red-corner-badge compositor + smart count.
8. **CI** — `release.yml` (+ `ci.yml`), first tagged release `v0.1.0`.
9. **Self-updater** — check + download + install + fallback, wired into Settings.

Each step is independently shippable and testable.
