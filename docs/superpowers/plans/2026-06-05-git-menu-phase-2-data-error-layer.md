# Git Menu — Phase 2: Data + Error Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `gh` call return a **structured result** (`{ok:true,data}` or `{ok:false,kind,message}`), classify failures (`no-gh` / `no-auth` / `network` / `api`), extend the PR GraphQL query with the fields later phases need (avatar, diffstat, labels), and replace the silent blank "No pull requests" with a real **Setup screen** (when gh is missing or you're not signed in) plus a non-destructive **"couldn't refresh"** affordance for background failures.

**Architecture:** A new **pure, unit-tested** classifier (`lib/gh-errors.js`, main-side ESM) turns a failed `execFile` into a `kind`. `main.js`'s `runGH` wraps results in `{ok,...}`; IPC handlers forward that envelope (data = the nodes array on success). The renderer (`src/main.js`, still the monolith — module split is Phase 3) interprets the envelope: critical `no-gh`/`no-auth` on load → Setup screen; background refresh failure → keep stale data + a small retry bar. No new runtime deps.

**Tech Stack:** Electron main (ESM), `gh` CLI, vanilla renderer, `node --test` for units.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §4 (data layer), §4.2 (new fields), §4.3 (error/auth handling), §5 (fields that power the UI refresh).

**Branch:** subagent-driven-development should create/work on `phase-2-data-error-layer` off `main`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/gh-errors.js` | Create | Pure `classifyGhFailure({code,stderr})` → failure kind |
| `test/gh-errors.test.js` | Create | `node --test` unit tests for the classifier |
| `package.json` | Modify | Add `lib/**/*` to build.files; add `"test"` script |
| `main.js` | Modify (`runGH` 19–27; `prQuery` 116–133; handlers 135–165) | Structured `runGH`; extended query; envelope-returning handlers |
| `index.html` | Modify (content block ~30–43) | `#setup` screen container + `#refresh-error` bar |
| `src/style.css` | Modify (append) | Setup screen + refresh-error styles |
| `src/main.js` | Modify (`loadData` 47–68; add helpers) | Interpret envelope; Setup screen; stale-on-silent-fail |

> Main-process files must live at repo root (electron-builder `files` ships `main.js`,
> `preload.js`, `lib/**/*` — **not** `src/`, which is Vite's renderer tree). That's why the
> classifier is `lib/gh-errors.js`, not `src/lib/...`.

---

## Task 1: Pure failure classifier (TDD)

**Files:**
- Create: `lib/gh-errors.js`
- Test: `test/gh-errors.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/gh-errors.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGhFailure } from '../lib/gh-errors.js';

test('ENOENT means gh is not installed', () => {
  assert.equal(classifyGhFailure({ code: 'ENOENT', stderr: '' }), 'no-gh');
});

test('auth phrasing means not signed in', () => {
  assert.equal(classifyGhFailure({ code: 1, stderr: 'gh auth login to authenticate' }), 'no-auth');
  assert.equal(classifyGhFailure({ code: 1, stderr: 'You are not logged into any GitHub hosts' }), 'no-auth');
  assert.equal(classifyGhFailure({ code: 1, stderr: 'HTTP 401: Bad credentials' }), 'no-auth');
});

test('connectivity phrasing means network', () => {
  assert.equal(classifyGhFailure({ code: 1, stderr: 'dial tcp: lookup api.github.com: no such host' }), 'network');
  assert.equal(classifyGhFailure({ code: 1, stderr: 'could not resolve host' }), 'network');
});

test('anything else is a generic api failure', () => {
  assert.equal(classifyGhFailure({ code: 1, stderr: 'GraphQL: Field "foo" doesn\'t exist' }), 'api');
  assert.equal(classifyGhFailure({ code: 1, stderr: '' }), 'api');
});

test('missing/odd input does not throw', () => {
  assert.equal(classifyGhFailure({}), 'api');
  assert.equal(classifyGhFailure({ code: 'ENOENT' }), 'no-gh');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/gh-errors.test.js`
Expected: FAIL — `Cannot find module '../lib/gh-errors.js'`.

- [ ] **Step 3: Implement the classifier**

Create `lib/gh-errors.js`:

```js
// Pure classification of a failed `gh` invocation into an actionable kind.
// kinds: 'no-gh' | 'no-auth' | 'network' | 'api'
export function classifyGhFailure({ code, stderr } = {}) {
  const s = String(stderr || '').toLowerCase();

  if (code === 'ENOENT') return 'no-gh';

  if (
    s.includes('not logged') ||
    s.includes('gh auth login') ||
    s.includes('authentication') ||
    s.includes('requires authentication') ||
    s.includes('bad credentials') ||
    s.includes('http 401')
  ) return 'no-auth';

  if (
    s.includes('dial tcp') ||
    s.includes('could not resolve host') ||
    s.includes('no such host') ||
    s.includes('network is unreachable') ||
    s.includes('connection refused') ||
    s.includes('timeout') ||
    s.includes('i/o timeout')
  ) return 'network';

  return 'api';
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/gh-errors.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/gh-errors.js test/gh-errors.test.js
git commit -m "feat: pure gh failure classifier with tests"
```

---

## Task 2: Wire `lib/` into packaging + add test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the `"test"` script**

In `package.json` `scripts`, add a `test` entry so it reads:

```json
  "scripts": {
    "dev": "concurrently \"vite\" \"sleep 2 && cross-env NODE_ENV=development electron .\"",
    "build": "vite build && electron-builder",
    "pack": "vite build && electron-builder --dir",
    "preview": "vite preview",
    "test": "node --test"
  },
```

- [ ] **Step 2: Ship `lib/` in the packaged app**

In `package.json` `build.files`, add `"lib/**/*"` so the array reads:

```json
    "files": [
      "dist/**/*",
      "main.js",
      "preload.js",
      "lib/**/*",
      "iconTemplate.png",
      "iconTemplate@2x.png",
      "package.json"
    ],
```

- [ ] **Step 3: Verify**

Run: `node -e "const p=require('./package.json'); console.log(p.scripts.test, p.build.files.includes('lib/**/*'))"`
Expected: `node --test true`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add test script and ship lib/ in package"
```

---

## Task 3: Structured `runGH` in `main.js`

**Files:**
- Modify: `main.js` (imports near top; `runGH` lines 19–27)

- [ ] **Step 1: Import the classifier**

At the top of `main.js`, after the existing imports (after line 5 `import util from 'util';`), add:

```js
import { classifyGhFailure } from './lib/gh-errors.js';
```

- [ ] **Step 2: Replace `runGH`**

Replace the existing function (lines 19–27):

```js
async function runGH(command, args) {
  try {
    const { stdout } = await execFilePromise(command, args, { env: ghEnv });
    return JSON.parse(stdout);
  } catch (error) {
    console.error('Error running gh command:', error);
    return null;
  }
}
```

with:

```js
// Returns { ok: true, data } on success, or { ok: false, kind, message } on failure.
async function runGH(command, args) {
  try {
    const { stdout } = await execFilePromise(command, args, { env: ghEnv });
    return { ok: true, data: JSON.parse(stdout) };
  } catch (error) {
    const kind = classifyGhFailure({
      code: error.code,
      stderr: `${error.stderr || ''}\n${error.message || ''}`,
    });
    console.error(`gh command failed (${kind}):`, error.message);
    return { ok: false, kind, message: String(error.stderr || error.message || '') };
  }
}
```

- [ ] **Step 3: Verify the file still parses**

Run: `node --check main.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit** (handlers fixed next task; commit together)

No commit yet — `main.js` handlers still read the old shape. Proceed to Task 4.

---

## Task 4: Extend the PR GraphQL query

**Files:**
- Modify: `main.js` (`prQuery` lines 116–133)

- [ ] **Step 1: Add fields the UI refresh needs**

Replace the `prQuery` template (lines 116–133):

```js
const prQuery = (searchQuery) => `
query {
  search(query: "${searchQuery}", type: ISSUE, first: 30) {
    nodes {
      ... on PullRequest {
        title
        number
        url
        isDraft
        repository { nameWithOwner }
        createdAt
        author { login }
        reviewDecision
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;
```

with:

```js
const prQuery = (searchQuery) => `
query {
  search(query: "${searchQuery}", type: ISSUE, first: 30) {
    nodes {
      ... on PullRequest {
        title
        number
        url
        isDraft
        repository { nameWithOwner }
        createdAt
        author { login avatarUrl }
        additions
        deletions
        reviewDecision
        labels(first: 3) { nodes { name color } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;
```

- [ ] **Step 2: Verify**

Run: `node --check main.js`
Expected: no output (exit 0).

---

## Task 5: Envelope-returning IPC handlers

**Files:**
- Modify: `main.js` (handlers lines 135–165)

- [ ] **Step 1: Update the three data handlers**

Replace the `get-my-prs`, `get-review-requests`, and `get-contributions` handlers (lines 135–165):

```js
ipcMain.handle('get-my-prs', async () => {
  const result = await runGH('gh', ['api', 'graphql', '-f', `query=${prQuery("is:pr is:open author:@me")}`]);
  return result?.data?.search?.nodes || [];
});

ipcMain.handle('get-review-requests', async () => {
  const result = await runGH('gh', ['api', 'graphql', '-f', `query=${prQuery("is:pr is:open review-requested:@me")}`]);
  return result?.data?.search?.nodes || [];
});

ipcMain.handle('get-contributions', async () => {
  const contribQuery = `
  query {
    viewer {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              color
            }
          }
        }
      }
    }
  }`;
  const result = await runGH('gh', ['api', 'graphql', '-f', `query=${contribQuery}`]);
  return result?.data?.viewer?.contributionsCollection?.contributionCalendar || null;
});
```

with (note: `runGH` now returns an envelope; on success the GraphQL payload is under `res.data.data`):

```js
ipcMain.handle('get-my-prs', async () => {
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${prQuery("is:pr is:open author:@me")}`]);
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data?.search?.nodes || [] };
});

ipcMain.handle('get-review-requests', async () => {
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${prQuery("is:pr is:open review-requested:@me")}`]);
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data?.search?.nodes || [] };
});

ipcMain.handle('get-contributions', async () => {
  const contribQuery = `
  query {
    viewer {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              color
            }
          }
        }
      }
    }
  }`;
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${contribQuery}`]);
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data?.viewer?.contributionsCollection?.contributionCalendar || null };
});
```

- [ ] **Step 2: Verify**

Run: `node --check main.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit the main-process changes**

```bash
git add main.js
git commit -m "feat: structured gh results, extended PR query (avatar/diffstat/labels), envelope handlers"
```

---

## Task 6: Setup screen + refresh-error markup

**Files:**
- Modify: `index.html` (content block, lines ~30–43)

- [ ] **Step 1: Add containers inside `.content`**

Replace the `.content` block (lines 30–43):

```html
      <div class="content">
        <div id="loading" class="loading hidden">
          <div class="spinner"></div>
        </div>
        <div id="pr-list" class="pr-list"></div>
        <div id="empty-state" class="empty-state hidden">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"></path>
            <path d="M12 8V12"></path>
            <path d="M12 16H12.01"></path>
          </svg>
          <span>No pull requests</span>
        </div>
      </div>
```

with (adds `#refresh-error` bar and `#setup` screen; keeps the rest intact):

```html
      <div id="refresh-error" class="refresh-error hidden">
        <span>Couldn't refresh</span>
        <button id="refresh-error-retry" class="refresh-error-retry">Retry</button>
      </div>

      <div class="content">
        <div id="loading" class="loading hidden">
          <div class="spinner"></div>
        </div>
        <div id="pr-list" class="pr-list"></div>
        <div id="empty-state" class="empty-state hidden">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"></path>
            <path d="M12 8V12"></path>
            <path d="M12 16H12.01"></path>
          </svg>
          <span>No pull requests</span>
        </div>
        <div id="setup" class="setup hidden"></div>
      </div>
```

- [ ] **Step 2: Verify markup present**

Run: `grep -c "id=\"setup\"\|id=\"refresh-error\"" index.html`
Expected: `2`

---

## Task 7: Setup screen + refresh-error styles

**Files:**
- Modify: `src/style.css` (append at end)

- [ ] **Step 1: Append styles**

Append to `src/style.css`:

```css

/* Setup / auth screen */
.setup {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
.setup .setup-icon { color: var(--ci-pending); }
.setup h3 {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
}
.setup p { font-size: 12px; line-height: 1.5; max-width: 280px; }
.setup .setup-cmd {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--seg-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--text-primary);
}
.setup .setup-cmd button {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
}
.setup .setup-cmd button:hover { color: var(--text-primary); background: var(--bg-color-hover); }
.setup a { color: var(--accent-color); cursor: pointer; font-size: 12px; }

/* Background refresh failure bar */
.refresh-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 5px 12px;
  font-size: 11px;
  color: var(--ci-pending);
  background: rgba(210, 153, 34, 0.12);
  border-bottom: 1px solid var(--border-color);
}
.refresh-error-retry {
  -webkit-app-region: no-drag;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 11px;
  cursor: pointer;
}
.refresh-error-retry:hover { background: var(--bg-color-hover); }
```

- [ ] **Step 2: Verify**

Run: `grep -c "\.setup\b\|refresh-error" src/style.css`
Expected: a non-zero count (≥ 5).

---

## Task 8: Renderer interprets the envelope

**Files:**
- Modify: `src/main.js` (`loadData` lines 47–68; `setupEventListeners` ~16–38; add helpers near the state-display helpers ~336–346)

- [ ] **Step 1: Replace `loadData`**

Replace `loadData` (lines 47–68):

```js
async function loadData(isSilent = false) {
  if (!isSilent) showLoading();
  
  try {
    // Load contributions
    const contribs = await window.api.getContributions();
    renderContributions(contribs);

    let prs = [];
    if (currentTab === 'my-prs') {
      prs = await window.api.getMyPRs();
    } else if (currentTab === 'review-requests') {
      prs = await window.api.getReviewRequests();
    }
    
    currentPRs = prs;
    renderPRs(prs);
  } catch (error) {
    console.error('Error loading PRs:', error);
    if (!isSilent) showEmptyState();
  }
}
```

with:

```js
async function loadData(isSilent = false) {
  if (!isSilent) showLoading();

  try {
    // PRs are the primary call — its result gates auth/setup state.
    const prRes = currentTab === 'review-requests'
      ? await window.api.getReviewRequests()
      : await window.api.getMyPRs();

    if (!prRes || !prRes.ok) {
      handleDataFailure(prRes, isSilent);
      return;
    }

    hideRefreshError();
    currentPRs = prRes.data || [];
    renderPRs(currentPRs);

    // Contributions are best-effort: never gate the list on them.
    const contribRes = await window.api.getContributions();
    renderContributions(contribRes && contribRes.ok ? contribRes.data : null);
  } catch (error) {
    // IPC-level failure (handler threw) — treat as a generic data failure.
    console.error('loadData failed:', error);
    handleDataFailure({ ok: false, kind: 'api' }, isSilent);
  }
}

// On a critical failure (gh missing / not signed in), show the Setup screen.
// On a background (silent) failure, keep stale data and show the retry bar.
function handleDataFailure(res, isSilent) {
  const kind = res && res.kind ? res.kind : 'api';

  if (kind === 'no-gh' || kind === 'no-auth' || !isSilent) {
    showSetup(kind);
    return;
  }
  showRefreshError();
}
```

- [ ] **Step 2: Add Setup + refresh-error helpers**

Immediately after `showEmptyState` (around line 346), add:

```js
const SETUP_CONTENT = {
  'no-gh': {
    title: 'GitHub CLI not found',
    body: 'Git Menu uses the <strong>gh</strong> CLI. Install it, then reopen Git Menu.',
    cmd: 'brew install gh',
    link: { label: 'Install guide', url: 'https://cli.github.com' },
  },
  'no-auth': {
    title: 'Not signed in to GitHub',
    body: 'Sign in with the <strong>gh</strong> CLI, then hit refresh.',
    cmd: 'gh auth login',
    link: { label: 'Authentication docs', url: 'https://cli.github.com/manual/gh_auth_login' },
  },
  'network': {
    title: "Can't reach GitHub",
    body: 'Check your connection, then retry.',
    cmd: null,
    link: null,
  },
  'api': {
    title: 'Something went wrong',
    body: 'GitHub returned an unexpected response. Try again.',
    cmd: null,
    link: null,
  },
};

function showSetup(kind) {
  const setup = document.getElementById('setup');
  const info = SETUP_CONTENT[kind] || SETUP_CONTENT.api;

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('pr-list').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  hideRefreshError();

  const cmdHtml = info.cmd ? `
    <div class="setup-cmd">
      <code>${escapeHtml(info.cmd)}</code>
      <button class="setup-copy" title="Copy" data-cmd="${escapeHtml(info.cmd)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>` : '';
  const linkHtml = info.link ? `<a class="setup-link" data-url="${escapeHtml(info.link.url)}">${escapeHtml(info.link.label)}</a>` : '';

  setup.innerHTML = `
    <svg class="setup-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
    <h3>${escapeHtml(info.title)}</h3>
    <p>${info.body}</p>
    ${cmdHtml}
    <a class="setup-retry">Retry</a>
    ${linkHtml}
  `;
  setup.classList.remove('hidden');

  const copyBtn = setup.querySelector('.setup-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(copyBtn.dataset.cmd).catch(() => {}));
  }
  const linkEl = setup.querySelector('.setup-link');
  if (linkEl) {
    linkEl.addEventListener('click', () => window.api.openExternal(linkEl.dataset.url));
  }
  setup.querySelector('.setup-retry').addEventListener('click', () => loadData());
}

function hideSetup() {
  document.getElementById('setup').classList.add('hidden');
}

function showRefreshError() {
  document.getElementById('refresh-error').classList.remove('hidden');
}

function hideRefreshError() {
  document.getElementById('refresh-error').classList.add('hidden');
}
```

- [ ] **Step 3: Hide the Setup screen on successful render**

In `renderPRs` (starts line 121), find the early lines:

```js
  loading.classList.add('hidden');
  
  // Update tray title with un-filtered total count
```

and insert a `hideSetup()` call so it reads:

```js
  loading.classList.add('hidden');
  hideSetup();
  
  // Update tray title with un-filtered total count
```

- [ ] **Step 4: Wire the refresh-error bar's Retry button**

In `setupEventListeners` (around line 35, after the `refresh-btn` listener), add:

```js
  document.getElementById('refresh-error-retry').addEventListener('click', () => {
    loadData();
  });
```

- [ ] **Step 5: Verify the bundle builds**

Run: `npm run pack`
Expected: Vite build succeeds, electron-builder writes `release/mac-arm64/Git Menu.app`. No JS errors during Vite transform.

- [ ] **Step 6: Run the unit tests**

Run: `npm test`
Expected: the `gh-errors` suite passes.

- [ ] **Step 7: Commit**

```bash
git add index.html src/style.css src/main.js
git commit -m "feat: setup screen for gh-missing/not-authed + non-destructive refresh-error bar"
```

---

## Task 9: Manual verification + integrate

**Files:** none (verification)

- [ ] **Step 1: Happy path**

Run: `npm run dev`
Expected: PRs load as before; avatars/diffstat data is now in the payload (not yet rendered — that's Phase 3); no Setup screen when signed in.

- [ ] **Step 2: Not-authed path (simulated)**

Point `gh` at an empty config dir so it resolves but has no auth (reliable — note
that `main.js` augments `PATH` with the Homebrew path, so a `PATH=` trick would NOT
reproduce `no-gh`; forcing `no-auth` is the dependable check):
Run: `GH_CONFIG_DIR=/tmp/git-menu-empty-ghconfig npm run dev`
Expected: the **Setup screen** ("Not signed in to GitHub", copyable `gh auth login`,
docs link, Retry) — **not** a blank "No pull requests". Restore with a normal `npm run dev`.

> To eyeball the `no-gh` variant without uninstalling `gh`, temporarily comment out the
> `ghEnv` PATH augmentation in `main.js` and run with `PATH=/usr/bin:/bin npm run dev`,
> then revert. Optional — the unit tests already cover classification.

- [ ] **Step 3: Confirm tests + build are green, then hand off**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-2-data-error-layer` into `main` and push (fast-forward or PR per that skill). Then delete the feature branch.

---

## Phase 2 Acceptance

- `runGH` returns `{ok,...}`; failures classified `no-gh`/`no-auth`/`network`/`api` (unit-tested).
- PR query returns `author.avatarUrl`, `additions`, `deletions`, `labels(first:3)` (consumed in Phase 3).
- IPC handlers forward the envelope; renderer no longer shows a blank list on auth/gh failure.
- **Setup screen** appears for `no-gh`/`no-auth` (and any non-silent failure) with a copyable command + docs link + Retry.
- Background refresh failures keep stale data and surface a dismissable **"Couldn't refresh · Retry"** bar.
- `npm test` and `npm run pack` are green; work merged to `main`.

**Next phase:** Phase 3 — UI refresh (renderer module split + avatars / relative time / diffstat / labels / status filter chips).
