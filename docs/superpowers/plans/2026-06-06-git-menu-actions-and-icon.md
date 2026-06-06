# Git Menu — Actions Monitoring + App Icon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a proper app icon, plus GitHub Actions monitoring — an **Actions tab** (your workflow runs + status), **step/job progression** inside a run, and **expandable per-PR checks**.

**Architecture:** Pure tested helpers (`lib/actions.js` main-side; `src/lib/status.js` renderer-side) + three new IPC channels (`get-action-runs`, `get-run-jobs`, `get-pr-checks`, with a cached login). A 4th "Actions" tab renders runs and lazily expands jobs/steps; the PR list's CI dot becomes an expandable checks panel. Everything is lazy (fetched only when its tab/row is active). The app icon is generated at build time via the existing `canvas` dep.

**Tech Stack:** Electron main (ESM) + `gh`, vanilla ESM renderer (Vite), `node --test`, `canvas`.

**Spec:** `docs/superpowers/specs/2026-06-06-git-menu-actions-and-icon-design.md`.

**Branch:** subagent-driven-development should create/work on `actions-and-icon` off `main`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `scripts/generate-app-icon.js` | Create | build-time canvas → `build/icon.png` |
| `build/icon.png` | Generate+commit | 1024² app icon |
| `package.json` | Modify | `build.mac.icon` |
| `lib/actions.js` | Create | `runState`, `normalizeRun`, `normalizeJobs`, `normalizeChecks` (pure) |
| `test/actions.test.js` | Create | unit tests |
| `src/lib/status.js` | Create | `statusMeta(state)` (pure) |
| `test/status.test.js` | Create | unit tests |
| `main.js` | Modify | cached login + 3 IPC handlers |
| `preload.js` | Modify | expose `getActionRuns`/`getRunJobs`/`getPrChecks` |
| `lib/settings.js` | Modify | `tabs.actions` |
| `test/settings.test.js` | Modify | tab tests for the 4th tab |
| `index.html` | Modify | Actions tab + containers |
| `src/render/actions.js` | Create | Actions tab render + expandable jobs/steps |
| `src/render/prs.js` | Modify | expandable per-PR checks panel |
| `src/render/settings.js` | Modify | Actions tab checkbox |
| `src/style.css` | Modify (append) | action/status/check styles |
| `src/main.js` | Modify | route the Actions tab; 3-mode `setListMode` |

---

## UNIT 1 — App icon

### Task 1: Generate the app icon + wire electron-builder

**Files:**
- Create: `scripts/generate-app-icon.js`
- Generate + commit: `build/icon.png`
- Modify: `package.json`

- [ ] **Step 1: Create the generator**

Create `scripts/generate-app-icon.js`:

```js
// Build-time: render the macOS app icon (1024²) — white branch glyph on a dark
// rounded-square gradient. Run: node scripts/generate-app-icon.js
import { createCanvas } from 'canvas';
import fs from 'fs';
import { drawGlyph } from '../lib/render-icon.js';

const SIZE = 1024;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, SIZE, SIZE);

// Rounded square on the macOS icon grid (~824 in 1024).
const margin = 100;
const side = SIZE - margin * 2;
const radius = 185;
const x = margin;
const y = margin;

const grad = ctx.createLinearGradient(x, y, x + side, y + side);
grad.addColorStop(0, '#2d333b');
grad.addColorStop(1, '#1c2128');

ctx.beginPath();
ctx.moveTo(x + radius, y);
ctx.arcTo(x + side, y, x + side, y + side, radius);
ctx.arcTo(x + side, y + side, x, y + side, radius);
ctx.arcTo(x, y + side, x, y, radius);
ctx.arcTo(x, y, x + side, y, radius);
ctx.closePath();
ctx.fillStyle = grad;
ctx.fill();

// Branch glyph (drawn in a 16-unit box) centered, ~46% of the square.
const glyph = side * 0.46;
const scale = glyph / 16;
ctx.save();
ctx.translate(SIZE / 2 - glyph / 2, SIZE / 2 - glyph / 2);
ctx.scale(scale, scale);
drawGlyph(ctx, '#ffffff');
ctx.restore();

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon.png', canvas.toBuffer('image/png'));
console.log('build/icon.png written');
```

- [ ] **Step 2: Generate the icon**

Run: `node scripts/generate-app-icon.js`
Expected: `build/icon.png written`.

- [ ] **Step 3: Verify dimensions**

Run: `file build/icon.png`
Expected: `build/icon.png: PNG image data, 1024 x 1024, ...`.

- [ ] **Step 4: Point electron-builder at it**

In `package.json` `build.mac`, add the `icon` key so it reads:

```json
    "mac": {
      "icon": "build/icon.png",
      "target": [
        "dmg",
        "zip"
      ],
      "category": "public.app-category.developer-tools",
      "identity": null
    },
```

- [ ] **Step 5: Verify packaging picks up the icon**

Run: `npm run pack 2>&1 | grep -i icon || echo "no icon errors"`
Expected: no icon error (electron-builder generates the `.icns` from `build/icon.png`).

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-app-icon.js build/icon.png package.json
git commit -m "feat: generated macOS app icon (branch glyph on dark rounded square)"
```

---

## UNIT 2 — Data layer

### Task 2: `lib/actions.js` (TDD)

**Files:**
- Create: `lib/actions.js`
- Test: `test/actions.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/actions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runState, normalizeRun, normalizeJobs, normalizeChecks } from '../lib/actions.js';

test('runState maps status + conclusion', () => {
  assert.equal(runState('queued', null), 'queued');
  assert.equal(runState('waiting', null), 'queued');
  assert.equal(runState('in_progress', null), 'in_progress');
  assert.equal(runState('completed', 'success'), 'success');
  assert.equal(runState('completed', 'failure'), 'failure');
  assert.equal(runState('completed', 'timed_out'), 'failure');
  assert.equal(runState('completed', 'startup_failure'), 'failure');
  assert.equal(runState('completed', 'cancelled'), 'cancelled');
  assert.equal(runState('completed', 'skipped'), 'skipped');
  assert.equal(runState('completed', 'neutral'), 'neutral');
  assert.equal(runState('COMPLETED', 'SUCCESS'), 'success'); // case-insensitive
});

test('normalizeRun reduces a runs payload', () => {
  const raw = {
    id: 7, name: 'CI', head_branch: 'main', event: 'push', status: 'in_progress',
    conclusion: null, html_url: 'https://x/run/7', run_number: 42, updated_at: '2026-06-06T01:00:00Z',
    display_title: 'fix: thing',
  };
  assert.deepEqual(normalizeRun(raw, 'acme/web'), {
    id: 7, repo: 'acme/web', name: 'CI', state: 'in_progress', branch: 'main', event: 'push',
    url: 'https://x/run/7', runNumber: 42, updatedAt: '2026-06-06T01:00:00Z', title: 'fix: thing',
  });
});

test('normalizeJobs flattens jobs + steps', () => {
  const raw = { jobs: [{
    id: 1, name: 'build', status: 'completed', conclusion: 'failure', html_url: 'https://x/job/1',
    steps: [{ name: 'checkout', status: 'completed', conclusion: 'success', number: 1 },
            { name: 'test', status: 'in_progress', conclusion: null, number: 2 }],
  }] };
  assert.deepEqual(normalizeJobs(raw), [{
    id: 1, name: 'build', state: 'failure', url: 'https://x/job/1',
    steps: [{ name: 'checkout', state: 'success', number: 1 }, { name: 'test', state: 'in_progress', number: 2 }],
  }]);
});

test('normalizeChecks handles CheckRun and StatusContext', () => {
  const ctx = [
    { __typename: 'CheckRun', name: 'lint', status: 'IN_PROGRESS', conclusion: null, detailsUrl: 'https://x/c1' },
    { __typename: 'StatusContext', context: 'ci/legacy', state: 'FAILURE', targetUrl: 'https://x/c2' },
  ];
  assert.deepEqual(normalizeChecks(ctx), [
    { name: 'lint', state: 'in_progress', url: 'https://x/c1' },
    { name: 'ci/legacy', state: 'failure', url: 'https://x/c2' },
  ]);
});

test('helpers tolerate missing input', () => {
  assert.equal(runState(undefined, undefined), 'queued');
  assert.deepEqual(normalizeJobs(undefined), []);
  assert.deepEqual(normalizeChecks(undefined), []);
  assert.doesNotThrow(() => normalizeRun({}, ''));
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/actions.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/actions.js`:

```js
// Pure helpers for GitHub Actions data. No I/O.

export function runState(status, conclusion) {
  const s = String(status || '').toLowerCase();
  if (s !== 'completed') return s === 'in_progress' ? 'in_progress' : 'queued';
  const c = String(conclusion || '').toLowerCase();
  if (c === 'success') return 'success';
  if (c === 'cancelled') return 'cancelled';
  if (c === 'skipped') return 'skipped';
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(c)) return 'failure';
  return 'neutral';
}

export function normalizeRun(raw, repo) {
  return {
    id: raw?.id,
    repo: repo || raw?.repository?.full_name || '',
    name: raw?.name || raw?.display_title || 'workflow',
    state: runState(raw?.status, raw?.conclusion),
    branch: raw?.head_branch || '',
    event: raw?.event || '',
    url: raw?.html_url || '',
    runNumber: raw?.run_number ?? null,
    updatedAt: raw?.updated_at || raw?.created_at || null,
    title: raw?.display_title || '',
  };
}

export function normalizeJobs(raw) {
  return (raw?.jobs || []).map((j) => ({
    id: j?.id,
    name: j?.name || 'job',
    state: runState(j?.status, j?.conclusion),
    url: j?.html_url || '',
    steps: (j?.steps || []).map((st) => ({
      name: st?.name || 'step',
      state: runState(st?.status, st?.conclusion),
      number: st?.number ?? 0,
    })),
  }));
}

// GraphQL statusCheckRollup contexts (CheckRun + StatusContext) -> [{name, state, url}]
export function normalizeChecks(contexts) {
  const fromStatus = { success: 'success', failure: 'failure', error: 'failure', pending: 'in_progress', expected: 'queued' };
  return (contexts || []).map((c) => {
    if (c?.__typename === 'CheckRun') {
      return { name: c.name || 'check', state: runState(c.status, c.conclusion), url: c.detailsUrl || '' };
    }
    const st = String(c?.state || '').toLowerCase();
    return { name: c?.context || 'status', state: fromStatus[st] || 'neutral', url: c?.targetUrl || '' };
  });
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/actions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions.js test/actions.test.js
git commit -m "feat: pure actions helpers (runState/normalizeRun/Jobs/Checks) with tests"
```

### Task 3: `src/lib/status.js` (TDD)

**Files:**
- Create: `src/lib/status.js`
- Test: `test/status.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/status.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusMeta } from '../src/lib/status.js';

test('statusMeta returns a class + symbol per state', () => {
  assert.equal(statusMeta('success').className, 'st-success');
  assert.equal(statusMeta('failure').className, 'st-failure');
  assert.equal(statusMeta('in_progress').className, 'st-running');
  assert.equal(statusMeta('queued').className, 'st-queued');
  assert.equal(statusMeta('cancelled').className, 'st-muted');
  assert.equal(statusMeta('skipped').className, 'st-muted');
  assert.equal(statusMeta('neutral').className, 'st-muted');
  assert.equal(statusMeta('anything-else').className, 'st-muted');
  assert.ok(statusMeta('success').symbol);
  assert.ok(statusMeta('success').label);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/status.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/status.js`:

```js
// Pure: map a normalized CI state to display metadata. No DOM.
export function statusMeta(state) {
  switch (state) {
    case 'success': return { symbol: '●', className: 'st-success', label: 'Passed' };
    case 'failure': return { symbol: '●', className: 'st-failure', label: 'Failed' };
    case 'in_progress': return { symbol: '◐', className: 'st-running', label: 'Running' };
    case 'queued': return { symbol: '○', className: 'st-queued', label: 'Queued' };
    case 'cancelled': return { symbol: '⊘', className: 'st-muted', label: 'Cancelled' };
    case 'skipped': return { symbol: '⊝', className: 'st-muted', label: 'Skipped' };
    default: return { symbol: '○', className: 'st-muted', label: 'Unknown' };
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/status.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/status.js test/status.test.js
git commit -m "feat: statusMeta display helper with tests"
```

### Task 4: IPC + preload

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Import the helpers in `main.js`**

After the other `./lib/*` imports in `main.js`, add:

```js
import { normalizeRun, normalizeJobs, normalizeChecks } from './lib/actions.js';
```

- [ ] **Step 2: Add the cached login + 3 handlers (after the `download-update` handler)**

```js
let cachedLogin = null;
async function ghLogin() {
  if (!cachedLogin) {
    const r = await runGH('gh', ['api', 'user']);
    cachedLogin = r.ok ? (r.data?.login || null) : null;
  }
  return cachedLogin;
}

ipcMain.handle('get-action-runs', async (event, repos) => {
  const login = await ghLogin();
  if (!login) return { ok: false, kind: 'no-auth', message: 'Could not resolve your GitHub login' };
  const list = (repos || []).slice(0, 8);
  const perRepo = await Promise.all(list.map(async (repo) => {
    const res = await runGH('gh', ['api', `repos/${repo}/actions/runs?actor=${login}&per_page=5`]);
    if (!res.ok) return [];
    return (res.data?.workflow_runs || []).map((r) => normalizeRun(r, repo));
  }));
  const runs = perRepo.flat()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 30);
  return { ok: true, data: runs };
});

ipcMain.handle('get-run-jobs', async (event, { repo, runId } = {}) => {
  if (!repo || !runId) return { ok: false, kind: 'api', message: 'Missing repo/runId' };
  const res = await runGH('gh', ['api', `repos/${repo}/actions/runs/${runId}/jobs`]);
  if (!res.ok) return res;
  return { ok: true, data: normalizeJobs(res.data) };
});

ipcMain.handle('get-pr-checks', async (event, { repo, number } = {}) => {
  if (!repo || !number) return { ok: false, kind: 'api', message: 'Missing repo/number' };
  const [owner, name] = String(repo).split('/');
  const q = `query {
    repository(owner: "${owner}", name: "${name}") {
      pullRequest(number: ${number}) {
        commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 50) { nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl }
          ... on StatusContext { context state targetUrl }
        } } } } } }
      }
    }
  }`;
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${q}`]);
  if (!res.ok) return res;
  const contexts = res.data?.data?.repository?.pullRequest?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes || [];
  return { ok: true, data: normalizeChecks(contexts) };
});
```

- [ ] **Step 3: Expose them in `preload.js`** (after `downloadUpdate`)

```js
  downloadUpdate: (tag) => ipcRenderer.invoke('download-update', tag),
  getActionRuns: (repos) => ipcRenderer.invoke('get-action-runs', repos),
  getRunJobs: (repo, runId) => ipcRenderer.invoke('get-run-jobs', { repo, runId }),
  getPrChecks: (repo, number) => ipcRenderer.invoke('get-pr-checks', { repo, number }),
```

- [ ] **Step 4: Verify**

Run: `node --check main.js && node --check preload.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js
git commit -m "feat: actions IPC (get-action-runs/get-run-jobs/get-pr-checks) + cached login"
```

---

## UNIT 3 — Actions tab

### Task 5: 4th tab in settings + markup

**Files:**
- Modify: `lib/settings.js`
- Modify: `test/settings.test.js`
- Modify: `index.html`

- [ ] **Step 1: Add `actions` to the tabs schema**

In `lib/settings.js` `defaultSettings()`, change the tabs line:

```js
    tabs: { mine: true, reviews: true, inbox: true },
```
to:
```js
    tabs: { mine: true, reviews: true, inbox: true, actions: true },
```

And in `mergeSettings`, change the `mergedTabs` block:

```js
  const mergedTabs = {
    mine: bool(tabs.mine, d.tabs.mine),
    reviews: bool(tabs.reviews, d.tabs.reviews),
    inbox: bool(tabs.inbox, d.tabs.inbox),
  };
  // Invariant: at least one tab must be visible — otherwise the UI has no selectable
  // tab and orphans whatever was last rendered. Force "Mine" on if all are hidden.
  if (!mergedTabs.mine && !mergedTabs.reviews && !mergedTabs.inbox) mergedTabs.mine = true;
```
to:
```js
  const mergedTabs = {
    mine: bool(tabs.mine, d.tabs.mine),
    reviews: bool(tabs.reviews, d.tabs.reviews),
    inbox: bool(tabs.inbox, d.tabs.inbox),
    actions: bool(tabs.actions, d.tabs.actions),
  };
  // Invariant: at least one tab must be visible — otherwise the UI has no selectable
  // tab and orphans whatever was last rendered. Force "Mine" on if all are hidden.
  if (!mergedTabs.mine && !mergedTabs.reviews && !mergedTabs.inbox && !mergedTabs.actions) mergedTabs.mine = true;
```

- [ ] **Step 2: Update the settings tests for the 4th tab**

In `test/settings.test.js`, the `defaultSettings` test's tabs assertion:
```js
  assert.deepEqual(d.tabs, { mine: true, reviews: true, inbox: true });
```
becomes:
```js
  assert.deepEqual(d.tabs, { mine: true, reviews: true, inbox: true, actions: true });
```

And the all-tabs-hidden test:
```js
test('mergeSettings forces Mine visible when all tabs are hidden', () => {
  const m = mergeSettings({ tabs: { mine: false, reviews: false, inbox: false } });
  assert.equal(m.tabs.mine, true);
  assert.equal(m.tabs.reviews, false);
  assert.equal(m.tabs.inbox, false);
});
```
becomes (include `actions: false`, since it now defaults true):
```js
test('mergeSettings forces Mine visible when all tabs are hidden', () => {
  const m = mergeSettings({ tabs: { mine: false, reviews: false, inbox: false, actions: false } });
  assert.equal(m.tabs.mine, true);
  assert.equal(m.tabs.reviews, false);
  assert.equal(m.tabs.inbox, false);
  assert.equal(m.tabs.actions, false);
});
```

- [ ] **Step 3: Run the settings tests**

Run: `node --test test/settings.test.js`
Expected: PASS.

- [ ] **Step 4: Add the Actions tab + containers in `index.html`**

In the segmented control, after the Inbox label, add:
```html
          <input type="radio" id="tab-actions" name="tab-group" value="actions">
          <label for="tab-actions">Actions</label>
```

In `.content`, after the `#inbox-empty` block (before `#setup`), add:
```html
        <div id="actions-list" class="actions-list hidden"></div>
        <div id="actions-empty" class="empty-state hidden">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>No recent actions</span>
        </div>
```

- [ ] **Step 5: Verify**

Run: `grep -c "tab-actions\|actions-list\|actions-empty" index.html`
Expected: `3`

- [ ] **Step 6: Commit**

```bash
git add lib/settings.js test/settings.test.js index.html
git commit -m "feat: Actions tab schema + markup (4th tab)"
```

### Task 6: `src/render/actions.js`

**Files:**
- Create: `src/render/actions.js`

- [ ] **Step 1: Create the module (full content)**

Create `src/render/actions.js`:

```js
import { escapeHtml } from '../lib/escape.js';
import { relativeTime } from '../lib/time.js';
import { statusMeta } from '../lib/status.js';

let lastRuns = [];
let lastSearch = '';
const jobsCache = new Map(); // runId -> normalized jobs

export function renderActions(runs, searchQuery) {
  if (runs != null) lastRuns = runs;
  if (searchQuery != null) lastSearch = searchQuery;

  const list = document.getElementById('actions-list');
  const empty = document.getElementById('actions-empty');
  const q = lastSearch;
  const filtered = lastRuns.filter(
    (r) => !q || (r.name || '').toLowerCase().includes(q) || (r.repo || '').toLowerCase().includes(q) || (r.branch || '').toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = '';

  const byRepo = {};
  filtered.forEach((r) => { (byRepo[r.repo] = byRepo[r.repo] || []).push(r); });

  Object.keys(byRepo).sort((a, b) => a.localeCompare(b)).forEach((repo) => {
    const header = document.createElement('div');
    header.className = 'org-header';
    header.innerHTML = `<span class="org-name">${escapeHtml(repo)}</span><span class="repo-count">${byRepo[repo].length}</span>`;
    list.appendChild(header);
    byRepo[repo].forEach((run) => list.appendChild(actionRow(run)));
  });
  list.classList.remove('hidden');
}

function actionRow(run) {
  const meta = statusMeta(run.state);
  const item = document.createElement('div');
  item.className = 'action-item';

  const head = document.createElement('div');
  head.className = 'action-head';
  head.innerHTML = `
    <span class="action-status ${meta.className}" title="${escapeHtml(meta.label)}">${meta.symbol}</span>
    <div class="action-body">
      <div class="action-title">${escapeHtml(run.name)}${run.runNumber ? ` <span class="pr-number">#${run.runNumber}</span>` : ''}</div>
      <div class="action-meta">
        <span>${escapeHtml(run.branch)}</span>
        <span>${escapeHtml(run.event)}</span>
        <span>${escapeHtml(relativeTime(run.updatedAt))}</span>
      </div>
    </div>
    <button class="action-expand" type="button" title="Show steps">▾</button>
  `;

  const jobsPanel = document.createElement('div');
  jobsPanel.className = 'action-jobs hidden';

  head.querySelector('.action-title').addEventListener('click', () => {
    if (run.url) window.api.openExternal(run.url);
  });

  head.querySelector('.action-expand').addEventListener('click', async (e) => {
    e.stopPropagation();
    const nowOpen = !jobsPanel.classList.toggle('hidden');
    if (nowOpen && !jobsPanel.dataset.loaded) {
      jobsPanel.innerHTML = '<div class="action-note">Loading steps…</div>';
      let jobs = jobsCache.get(run.id);
      if (!jobs) {
        const res = await window.api.getRunJobs(run.repo, run.id).catch(() => null);
        jobs = res && res.ok ? res.data : null;
        if (jobs) jobsCache.set(run.id, jobs);
      }
      jobsPanel.innerHTML = jobs && jobs.length ? jobsHtml(jobs) : '<div class="action-note">No steps to show.</div>';
      jobsPanel.dataset.loaded = '1';
    }
  });

  item.appendChild(head);
  item.appendChild(jobsPanel);
  return item;
}

function jobsHtml(jobs) {
  return jobs
    .map((job) => {
      const jm = statusMeta(job.state);
      const steps = job.steps
        .map((s) => {
          const sm = statusMeta(s.state);
          return `<div class="action-step ${sm.className === 'st-running' ? 'is-running' : ''}">
            <span class="action-status ${sm.className}">${sm.symbol}</span>
            <span class="action-step-name">${escapeHtml(s.name)}</span>
          </div>`;
        })
        .join('');
      return `<div class="action-job">
        <div class="action-job-head"><span class="action-status ${jm.className}">${jm.symbol}</span><span class="action-job-name">${escapeHtml(job.name)}</span></div>
        ${steps}
      </div>`;
    })
    .join('');
}
```

- [ ] **Step 2: Confirm it exists (built in Task 8)**

Run: `test -f src/render/actions.js && echo OK`
Expected: `OK`

### Task 7: Styles

**Files:**
- Modify: `src/style.css` (append)

- [ ] **Step 1: Append styles**

Append to `src/style.css`:

```css

/* Status symbols (shared by Actions + PR checks) */
.action-status { display: inline-flex; align-items: center; justify-content: center; font-size: 10px; flex: 0 0 auto; width: 14px; }
.st-success { color: var(--ci-success); }
.st-failure { color: var(--ci-failure); }
.st-running { color: var(--ci-pending); }
.st-queued { color: var(--text-secondary); }
.st-muted { color: var(--text-muted); }

/* Actions list */
.actions-list { display: flex; flex-direction: column; }
.action-item { border-top: 1px solid var(--border-color); }
.action-head { display: flex; gap: 8px; align-items: center; padding: 7px 12px; }
.action-body { min-width: 0; flex: 1; }
.action-title { font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.action-title:hover { text-decoration: underline; }
.action-meta { display: flex; gap: 6px; align-items: center; font-size: 10px; color: var(--text-secondary); margin-top: 2px; }
.action-meta span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.action-expand { -webkit-app-region: no-drag; background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 11px; padding: 2px 4px; }
.action-expand:hover { color: var(--text-primary); }
.action-jobs { padding: 2px 12px 8px 34px; }
.action-job { margin-top: 6px; }
.action-job-head { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--text-primary); font-weight: 600; }
.action-job-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.action-step { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--text-secondary); padding: 1px 0 1px 8px; }
.action-step.is-running { color: var(--text-primary); }
.action-step-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.action-note { font-size: 11px; color: var(--text-muted); padding: 4px 0; }

/* Per-PR checks panel */
.pr-checks { padding: 2px 12px 6px 42px; }
.pr-check { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--text-secondary); padding: 1px 0; }
.pr-check-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.pr-check-name:hover { color: var(--text-primary); text-decoration: underline; }
.pr-checks-empty { font-size: 11px; color: var(--text-muted); padding: 2px 0; }
.ci-status.ci-toggle { -webkit-app-region: no-drag; background: none; border: none; cursor: pointer; padding: 0; font: inherit; }
```

- [ ] **Step 2: Verify**

Run: `grep -c "action-item\|action-status\|st-success\|pr-checks\|ci-toggle" src/style.css`
Expected: a count ≥ 5.

### Task 8: Route the Actions tab in `src/main.js`

**Files:**
- Modify: `src/main.js`
- Modify: `src/render/settings.js`

- [ ] **Step 1: Import the renderer**

After the inbox import in `src/main.js`, add:
```js
import { renderInbox, updateInboxBadge } from './render/inbox.js';
import { renderActions } from './render/actions.js';
```

- [ ] **Step 2: Replace `setListMode` with a 3-mode version**

Replace the existing `setListMode`:
```js
function setListMode(mode) {
  const inbox = mode === 'inbox';
  document.getElementById('filter-bar').classList.toggle('hidden', inbox);
  if (inbox) {
    document.getElementById('pr-list').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
  } else {
    document.getElementById('inbox-list').classList.add('hidden');
    document.getElementById('inbox-empty').classList.add('hidden');
  }
}
```
with:
```js
const LIST_CONTAINERS = {
  prs: ['pr-list', 'empty-state'],
  inbox: ['inbox-list', 'inbox-empty'],
  actions: ['actions-list', 'actions-empty'],
};

// Show the filter chips only on the PR list; hide every other mode's containers
// (the active renderer shows its own).
function setListMode(mode) {
  document.getElementById('filter-bar').classList.toggle('hidden', mode !== 'prs');
  Object.entries(LIST_CONTAINERS).forEach(([m, ids]) => {
    if (m !== mode) ids.forEach((id) => document.getElementById(id).classList.add('hidden'));
  });
}
```

- [ ] **Step 3: Hide actions containers in `showLoading` + `showEmptyState`**

In `showLoading`, after the inbox hides, add:
```js
  document.getElementById('inbox-list').classList.add('hidden');
  document.getElementById('inbox-empty').classList.add('hidden');
  document.getElementById('actions-list').classList.add('hidden');
  document.getElementById('actions-empty').classList.add('hidden');
```
(i.e., add the two `actions-*` lines after the two `inbox-*` lines.)

Do the same two additions in `showEmptyState` (after its `inbox-*` hides).

- [ ] **Step 4: Add the Actions branch in `loadData`**

In `loadData`, change the tab dispatch. The current shape is:
```js
    if (currentTab === 'inbox') {
      ...
    } else {
      ... PR branch ...
    }
```
Insert an Actions branch between them:
```js
    if (currentTab === 'inbox') {
      const inboxRes = await window.api.getInbox();
      if (!inboxRes || !inboxRes.ok) {
        handleDataFailure(inboxRes, isSilent);
        return;
      }
      hideRefreshError();
      hideSetup();
      setListMode('inbox');
      renderInbox(inboxRes.data || [], searchQuery);
    } else if (currentTab === 'actions') {
      // Workflow runs for the repos you have open PRs in (lazy — only on this tab).
      const prRes = await window.api.getMyPRs();
      if (!prRes || !prRes.ok) {
        handleDataFailure(prRes, isSilent);
        return;
      }
      hideRefreshError();
      hideSetup();
      setListMode('actions');
      const repos = [...new Set((prRes.data || []).map((p) => p.repository.nameWithOwner))].slice(0, 8);
      const runsRes = await window.api.getActionRuns(repos);
      renderActions(runsRes && runsRes.ok ? (runsRes.data || []) : [], searchQuery);
    } else {
      // ... existing PR branch (unchanged) ...
    }
```
(Leave the existing PR branch body inside the final `else` exactly as it is.)

- [ ] **Step 5: Route search to the Actions tab**

In the search handler, change:
```js
    if (currentTab === 'inbox') {
      renderInbox(null, searchQuery);
    } else {
      renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: settings.showEmptyRepos });
    }
```
to:
```js
    if (currentTab === 'inbox') {
      renderInbox(null, searchQuery);
    } else if (currentTab === 'actions') {
      renderActions(null, searchQuery);
    } else {
      renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: settings.showEmptyRepos });
    }
```

- [ ] **Step 6: Add the 4th tab to `applyTabVisibility`**

In `applyTabVisibility`, change the `entries` array:
```js
  const entries = [
    ['tab-my-prs', 'my-prs', tabsCfg.mine],
    ['tab-review', 'review-requests', tabsCfg.reviews],
    ['tab-inbox', 'inbox', tabsCfg.inbox],
  ];
```
to add the Actions row:
```js
  const entries = [
    ['tab-my-prs', 'my-prs', tabsCfg.mine],
    ['tab-review', 'review-requests', tabsCfg.reviews],
    ['tab-inbox', 'inbox', tabsCfg.inbox],
    ['tab-actions', 'actions', tabsCfg.actions],
  ];
```

- [ ] **Step 7: Add the Actions checkbox to the Settings view**

In `src/render/settings.js`, find the "Tabs shown" row:
```js
        <div class="settings-tabs">
          ${tabCheck('mine', 'Mine', settings.tabs.mine)}
          ${tabCheck('reviews', 'Reviews', settings.tabs.reviews)}
          ${tabCheck('inbox', 'Inbox', settings.tabs.inbox)}
        </div>
```
and add the Actions check:
```js
        <div class="settings-tabs">
          ${tabCheck('mine', 'Mine', settings.tabs.mine)}
          ${tabCheck('reviews', 'Reviews', settings.tabs.reviews)}
          ${tabCheck('inbox', 'Inbox', settings.tabs.inbox)}
          ${tabCheck('actions', 'Actions', settings.tabs.actions)}
        </div>
```

- [ ] **Step 8: Verify build + references**

Run: `grep -n "renderActions\|setListMode\|tab-actions" src/main.js`
Expected: import + setListMode + the actions branch + applyTabVisibility entry.

Run: `npx vite build`
Expected: builds with no error.

- [ ] **Step 9: Run all unit tests**

Run: `npm test`
Expected: all suites pass (incl. actions + status).

- [ ] **Step 10: Commit**

```bash
git add src/main.js src/render/actions.js src/render/settings.js src/style.css
git commit -m "feat: Actions tab — workflow runs + expandable jobs/steps"
```

---

## UNIT 4 — Per-PR checks

### Task 9: Expandable checks under each PR row

**Files:**
- Modify: `src/render/prs.js`

- [ ] **Step 1: Import `statusMeta`**

At the top of `src/render/prs.js`, after the other lib imports, add:
```js
import { matchesSearch, matchesStatusFilter } from '../lib/filter.js';
import { statusMeta } from '../lib/status.js';
```
(Keep the existing imports; just add the `statusMeta` line.)

- [ ] **Step 2: Make the CI dot a toggle + add a checks panel in `prRow`**

In `prRow`, find where the CI status HTML is built:
```js
  const ci = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  let ciHtml = '';
  if (ci === 'SUCCESS') ciHtml = `<span class="ci-status ci-success" title="Checks passed">●</span>`;
  else if (ci === 'FAILURE' || ci === 'ERROR') ciHtml = `<span class="ci-status ci-failure" title="Checks failed">●</span>`;
  else if (ci === 'PENDING') ciHtml = `<span class="ci-status ci-pending" title="Checks pending">●</span>`;
```
and replace it with a button version (so it's clickable to expand):
```js
  const ci = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  let ciHtml = '';
  if (ci === 'SUCCESS') ciHtml = `<button class="ci-status ci-toggle ci-success" title="Checks passed — show details">●</button>`;
  else if (ci === 'FAILURE' || ci === 'ERROR') ciHtml = `<button class="ci-status ci-toggle ci-failure" title="Checks failed — show details">●</button>`;
  else if (ci === 'PENDING') ciHtml = `<button class="ci-status ci-toggle ci-pending" title="Checks pending — show details">●</button>`;
```

Then, at the END of `prRow` (just before `return row;`), wrap the row + a checks panel and wire the toggle:
```js
  // Expandable per-PR checks: clicking the CI dot toggles a details panel.
  const wrap = document.createElement('div');
  wrap.className = 'pr-row';
  wrap.appendChild(row);
  const checksPanel = document.createElement('div');
  checksPanel.className = 'pr-checks hidden';
  wrap.appendChild(checksPanel);

  const ciToggle = row.querySelector('.ci-toggle');
  if (ciToggle) {
    ciToggle.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nowOpen = !checksPanel.classList.toggle('hidden');
      if (nowOpen && !checksPanel.dataset.loaded) {
        checksPanel.innerHTML = '<div class="pr-checks-empty">Loading checks…</div>';
        const res = await window.api
          .getPrChecks(pr.repository.nameWithOwner, pr.number)
          .catch(() => null);
        const checks = res && res.ok ? res.data : null;
        checksPanel.innerHTML = checks ? checksHtml(checks) : '<div class="pr-checks-empty">Couldn\'t load checks.</div>';
        checksPanel.querySelectorAll('.pr-check-name[data-url]').forEach((el) => {
          el.addEventListener('click', () => window.api.openExternal(el.dataset.url));
        });
        checksPanel.dataset.loaded = '1';
      }
    });
  }

  return wrap;
```
(Replace the existing `return row;` at the end of `prRow` with the block above.)

- [ ] **Step 3: Add the `checksHtml` helper**

Add this function in `src/render/prs.js` (e.g. right after `prRow`):
```js
function checksHtml(checks) {
  if (!checks.length) return '<div class="pr-checks-empty">No checks.</div>';
  return checks
    .map((c) => {
      const m = statusMeta(c.state);
      const click = c.url ? ` data-url="${escapeHtml(c.url)}"` : '';
      return `<div class="pr-check"><span class="action-status ${m.className}">${m.symbol}</span><span class="pr-check-name"${click}>${escapeHtml(c.name)}</span></div>`;
    })
    .join('');
}
```

- [ ] **Step 4: Verify build + tests**

Run: `npx vite build && npm test`
Expected: builds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/render/prs.js
git commit -m "feat: expandable per-PR checks (click the CI dot for individual check status)"
```

---

## Task 10: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` produced; the app bundle has the new icon (electron-builder generated the `.icns`).

- [ ] **Step 2: Manual smoke**

Run: `npm run dev`
- A 4th **Actions** tab appears. Opening it lists recent **workflow runs** you triggered (grouped by repo) with a status symbol (queued ○ / running ◐ / ✓ / ✗); clicking a run title opens it; the **▾** expands **jobs → steps** (in-progress step highlighted).
- On the **Mine/Reviews** tabs, clicking a PR's **CI dot** expands the **individual checks** (name + status, click → log); clicking it again collapses.
- Settings → **Tabs shown** has an **Actions** checkbox that hides/shows the tab.
- The app's **Dock/Finder icon** (from the packed `.app`) is the branch glyph on a dark square.

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `actions-and-icon` into `main` and push. Delete the feature branch. (A `npm run release` afterward ships it as the next version.)

---

## Acceptance

- App icon: `build/icon.png` (1024²) generated + `mac.icon` set; packaged app shows it.
- `lib/actions.js` + `src/lib/status.js` pure + unit-tested.
- `get-action-runs` / `get-run-jobs` / `get-pr-checks` IPC (cached login); all lazy.
- Actions tab lists your workflow runs with status, expands to jobs → steps (in-progress highlighted).
- PR CI dot expands to individual checks.
- 4th tab is toggleable; ≥1-tab-visible invariant updated; search works on Actions.
- `npm test` (12 suites) and `npm run pack` green; merged to `main`.
