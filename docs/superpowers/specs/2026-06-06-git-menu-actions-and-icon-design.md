# Git Menu — Actions Monitoring + App Icon Design

**Date:** 2026-06-06
**Status:** Approved (brainstorm) — pending written-spec review
**Author:** Artim-Nayas (with Claude)

## 1. Overview

Two additions to the shipped Git Menu app:

1. **Actions monitoring** — see GitHub Actions you triggered and drill into their status:
   - a new **Actions tab** listing recent **workflow runs** you triggered, with status;
   - **step/job progression** inside a run (jobs → steps, with the in-progress step highlighted);
   - **per-PR check details** — expand a PR's CI indicator to see its individual checks.
2. **A proper app icon** — a macOS-style rounded-square branch glyph for the Dock/Finder/DMG
   (currently the default Electron icon).

### Constraints (unchanged)
- No new **runtime** deps. `canvas` (already present) renders the app icon at build time.
- Everything in the Actions feature is **lazy**: the Actions tab fetches only when opened; run
  jobs and PR checks fetch only on expand — so the existing tabs are never slowed.

### Non-goals
- Sub-minute "live" polling of running jobs (normal refresh + manual refresh only; a faster
  in-progress poll is a documented future stretch).
- Re-running / cancelling actions from the app (read-only, like the rest of the app).
- A global "all my workflow runs" view (GitHub has no such endpoint — see §4.1).

## 2. Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Actions scope | Workflow runs **for the repos you have open PRs in** (bounded ~8), fetched in parallel, **only when the Actions tab is active**. |
| Run detail | Expand a run → jobs → steps, in-progress step highlighted (lazy fetch). |
| PR checks | Expand a PR's CI indicator → individual checks (lazy fetch); main PR query unchanged. |
| App icon | White branch glyph on a **dark rounded-square gradient**, auto-generated via `canvas`. |
| Liveness | Updates on the normal refresh interval + manual refresh. |

## 3. Architecture

Follows the existing main/renderer split + pure-helper pattern.

```
lib/actions.js          (main-side, pure) runState(), normalizeRun(), normalizeJobs(),
                        normalizeChecks() — status mapping + payload reduction
main.js                 IPC: get-action-runs, get-run-jobs, get-pr-checks (+ cached login)
preload.js              expose getActionRuns / getRunJobs / getPrChecks
src/render/actions.js   Actions tab: run rows + expandable jobs/steps
src/render/prs.js       expandable per-PR checks panel under each PR row
src/lib/status.js       (renderer, pure) statusMeta(state) -> { symbol, className, label }
index.html              4th tab + #actions-list / #actions-empty
src/main.js             route the Actions tab; settings 4th tab
lib/settings.js         tabs gains `actions`
scripts/generate-app-icon.js  build-time canvas -> build/icon.png
build/icon.png          generated 1024² app icon (committed)
package.json            build.mac.icon = build/icon.png
```

## 4. App icon

- `scripts/generate-app-icon.js` (ESM, imports `drawGlyph` from `lib/render-icon.js`): renders a
  **1024×1024** PNG — a rounded-square (≈824² centered, corner radius ≈185, the macOS grid) filled
  with a dark diagonal gradient (`#2d333b` → `#1c2128`), with the **branch glyph in white** centered
  at ≈45% of the square. Writes `build/icon.png`.
- `package.json` `build.mac.icon: "build/icon.png"` — electron-builder generates the `.icns` from it
  for the Dock/Finder/DMG. (`build/` is added to `files`? No — the icon is a build input, not shipped
  in the asar; electron-builder reads `mac.icon` directly. `build/icon.png` is committed to the repo.)
- `build/icon.png` is committed so CI builds the icon without regenerating.

## 5. Actions data layer (main, via `gh`)

### 5.1 Why per-repo
GitHub exposes workflow runs only under `/repos/{owner}/{repo}/actions/runs`. There is no
"runs across all my repos" endpoint. So the renderer passes the **repos of your open PRs**
(deduped, capped at 8), and main fetches runs per repo **in parallel**, filtered to your runs.

### 5.2 Cached login
`actions/runs?actor={login}` needs your username. `main.js` caches it using `gh api user`
**without** `--jq` (so `runGH`'s JSON parse stays valid) and reads `.data.login`:
`let cachedLogin = null; async function ghLogin() { if (!cachedLogin) { const r = await runGH('gh', ['api','user']); cachedLogin = r.ok ? (r.data?.login || null) : null; } return cachedLogin; }`

### 5.3 IPC
| Channel | Action |
|---|---|
| `get-action-runs` | arg `repos: string[]` (≤8). For each, `gh api "repos/{repo}/actions/runs?actor={login}&per_page=5"`, in parallel; flatten + `normalizeRun`; sort by `updatedAt` desc; cap ~30. Returns `{ok,data:[run]}`. |
| `get-run-jobs` | arg `{repo, runId}` → `gh api repos/{repo}/actions/runs/{runId}/jobs` → `normalizeJobs`. |
| `get-pr-checks` | arg `{repo, number}` → GraphQL on the PR's last commit `statusCheckRollup.contexts` (CheckRun + StatusContext) → `normalizeChecks`. |

### 5.4 `lib/actions.js` (pure, unit-tested)
- `runState(status, conclusion)` → `'queued' | 'in_progress' | 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral'`.
  Rules: status not `completed` → `queued` (for queued/waiting/requested/pending) or `in_progress`;
  status `completed` → conclusion mapped (`success`; `failure`/`timed_out`/`startup_failure`/`action_required` → `failure`; `cancelled`; `skipped`; else `neutral`).
- `normalizeRun(raw)` → `{id, repo, name, state, branch, event, url, runNumber, updatedAt, title}`
  (from `name`/`head_branch`/`event`/`status`/`conclusion`/`html_url`/`run_number`/`updated_at`/`display_title`; `repo` passed in).
- `normalizeJobs(raw)` → `[{id, name, state, url, steps:[{name, state, number}]}]`
  (from `raw.jobs[].steps[]` with `runState`).
- `normalizeChecks(raw)` → `[{name, state, url}]` from the GraphQL contexts (CheckRun: `name/status/conclusion/detailsUrl`; StatusContext: `context/state(SUCCESS|FAILURE|PENDING|ERROR)/targetUrl` → map to our states).
- All null-safe; tested for each state + missing fields.

## 6. Renderer

### 6.1 `src/lib/status.js` (renderer, pure, tested)
`statusMeta(state)` → `{ symbol, className, label }` for the 7 states (e.g. `in_progress` → a
spinner/◐ with class `st-running`; `success` → `●`/`st-success`; `failure` → `●`/`st-failure`;
`queued` → `○`/`st-queued`; `cancelled`/`skipped`/`neutral` → muted). Shared by the Actions tab
and the PR-checks panel.

### 6.2 Actions tab (`src/render/actions.js`)
- 4th segmented tab **Actions** (Mine / Reviews / Inbox / Actions).
- `renderActions(runs, searchQuery)` — group runs by repo; each **run row**: status icon, workflow
  name (`#runNumber`), `branch · event · "2m ago"`; a chevron to expand; click the name → open the
  run URL. Search filters by workflow name / repo. Empty → "No recent actions".
- **Expand a run** → `getRunJobs(repo, runId)` (lazy, cached per run) → render **jobs**; under each
  job, its **steps** with `statusMeta` icons; the **in-progress** step gets an `st-running`
  highlight. Re-expanding uses the cached jobs unless refreshed.

### 6.3 Per-PR checks (`src/render/prs.js`)
- The CI status dot in a PR's meta becomes a **button** (`stopPropagation`). Clicking toggles an
  inline `.pr-checks` panel under the row; first open lazily calls `getPrChecks(repo, number)` and
  renders each check (`statusMeta` icon + name, click → check URL). A second click collapses it.

### 6.4 Routing (`src/main.js`)
- `loadData`: when `currentTab === 'actions'`, derive the repo set from `currentPRs`
  (`[...new Set(prs.map(p => p.repository.nameWithOwner))].slice(0,8)`) — but `currentPRs` is the
  Mine list; on the Actions tab we still want your PR repos, so fetch **My PRs** first to get the
  repos, then `get-action-runs`. (One extra call when the Actions tab is the active tab; lazy.)
- `setListMode` gains an `'actions'` mode toggling `#actions-list`/`#actions-empty`; `showLoading`
  and `showEmptyState` hide them too.
- Search routes to `renderActions` on the Actions tab.

### 6.5 Settings / tabs
- `lib/settings.js` `tabs` gains `actions: true`; default + merge + the ≥1-visible guard updated.
- `applyTabVisibility` handles the 4th tab; the settings "Tabs shown" UI gains an Actions checkbox.

## 7. Data flow

```
Actions tab open -> getMyPRs (repos) -> get-action-runs(repos) -> renderActions
expand run        -> get-run-jobs(repo,id) -> render jobs/steps
expand PR CI dot  -> get-pr-checks(repo,#) -> render checks
```

## 8. Error handling
- All new IPC return the `{ok,...}` envelope; failures degrade to an inline "couldn't load"
  message in the relevant panel (never the global Setup screen, except the primary tab fetch which
  reuses the existing auth gate). Empty results → friendly empty states.

## 9. Testing
- `lib/actions.js` (`runState`, `normalizeRun`, `normalizeJobs`, `normalizeChecks`) and
  `src/lib/status.js` (`statusMeta`) get `node --test` units. UI stays manual.
- The app-icon generator is verified by `file build/icon.png` → 1024×1024.

## 10. Decomposition (plan units)
1. **App icon** — generator + `build/icon.png` + `mac.icon` (independent, ship first).
2. **Actions data layer** — `lib/actions.js` + tests; `get-action-runs`/`get-run-jobs`/`get-pr-checks` IPC + cached login + preload.
3. **Actions tab UI** — 4th tab, `src/render/actions.js`, `src/lib/status.js`, styles, routing, settings 4th toggle.
4. **Per-PR checks** — expandable checks panel in `prs.js` + styles.

Each unit is independently shippable and testable.

## 11. Risks
| Risk | Mitigation |
|---|---|
| Many PR repos → many run calls | Cap at 8 repos, parallel, lazy (only on Actions tab) |
| `actions/runs?actor=` needs login | Cache `gh api user` login once |
| Repos with Actions disabled / 404 | Per-repo failure drops to `[]` for that repo, doesn't break the list |
| Large jobs payload | `runGH` already uses a 64 MB buffer |
| 4th tab crowds the segmented control | Tabs are toggleable; labels stay short (Mine/Reviews/Inbox/Actions) |
