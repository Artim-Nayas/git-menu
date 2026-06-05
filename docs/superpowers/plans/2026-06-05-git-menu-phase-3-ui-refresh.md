# Git Menu — Phase 3: UI Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the PR list — split the monolithic renderer into focused modules, then enrich rows with avatars, relative time, diffstat, and labels; add status filter chips; add clickable "open on GitHub" icons to org/repo headers; and surface every contributed-to repo (even with no open PRs).

**Architecture:** Extract pure helpers into `src/lib/*` (unit-tested) and the PR-list rendering into `src/render/prs.js`. `src/main.js` stays the renderer entry (wiring, tabs, loadData, contributions + setup screens) and delegates list rendering to `renderPRList(...)`. A new best-effort `get-contributed-repos` IPC adds repos the user contributed to; empty repos render collapsed below PR-bearing repos, only on the Mine tab with no active search/filter. No new runtime deps.

**Tech Stack:** Electron main (ESM) + `gh`, vanilla ESM renderer (Vite), `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §3 (module layout), §5 (row refresh), §5.1 (filter chips), §5.2 (repo-visit icons), §5.3 (contributed repos + `showEmptyRepos`).

**Branch:** subagent-driven-development should create/work on `phase-3-ui-refresh` off `main`.

> **Settings note:** `showEmptyRepos` is a persisted setting in the spec, but the settings store
> arrives in Phase 6. In this phase, `renderPRList` accepts `showEmptyRepos` as a parameter and
> `src/main.js` passes a hardcoded `true`. Phase 6 will wire it to persisted settings. Do not build
> a settings store here (YAGNI).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/escape.js` | Create | `escapeHtml` (moved out of `src/main.js`) |
| `src/lib/time.js` | Create | `relativeTime(date, now)` — pure |
| `src/lib/labels.js` | Create | `labelTextColor(hex)` — pure contrast pick |
| `src/lib/filter.js` | Create | `matchesSearch`, `matchesStatusFilter` — pure |
| `test/time.test.js`, `test/labels.test.js`, `test/filter.test.js` | Create | unit tests |
| `src/render/prs.js` | Create | PR-list rendering: grouping, rows, chips, header icons, empty repos |
| `main.js` (root) | Modify | `get-contributed-repos` IPC handler + query |
| `preload.js` | Modify | expose `getContributedRepos` |
| `index.html` | Modify | filter chips row |
| `src/style.css` | Modify (append) | avatars, diffstat, labels, chips, header-visit, empty repos |
| `src/main.js` | Modify | remove old `renderPRs`/`escapeHtml`/collapse state; import + wire `prs.js` |

---

## Task 1: Move `escapeHtml` into `src/lib/escape.js`

**Files:**
- Create: `src/lib/escape.js`
- Modify: `src/main.js` (remove local `escapeHtml`, import instead)

- [ ] **Step 1: Create the module**

Create `src/lib/escape.js`:

```js
// Escape a string for safe interpolation into innerHTML.
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

- [ ] **Step 2: Import it in `src/main.js` and delete the local copy**

At the top of `src/main.js`, change the first line:

```js
import './style.css';
```

to:

```js
import './style.css';
import { escapeHtml } from './lib/escape.js';
```

Then delete the local `escapeHtml` function at the end of `src/main.js` (the whole block):

```js
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}
```

- [ ] **Step 3: Verify renderer still builds**

Run: `npx vite build`
Expected: builds with no error (the setup screen still uses the imported `escapeHtml`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/escape.js src/main.js
git commit -m "refactor: extract escapeHtml into src/lib/escape.js"
```

---

## Task 2: `relativeTime` (TDD)

**Files:**
- Create: `src/lib/time.js`
- Test: `test/time.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/time.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime } from '../src/lib/time.js';

const now = new Date('2026-06-05T12:00:00Z');
const ago = (ms) => new Date(now.getTime() - ms);
const SEC = 1000, MIN = 60 * SEC, HR = 60 * MIN, DAY = 24 * HR;

test('seconds -> just now', () => {
  assert.equal(relativeTime(ago(10 * SEC), now), 'just now');
});
test('minutes', () => {
  assert.equal(relativeTime(ago(5 * MIN), now), '5m ago');
});
test('hours', () => {
  assert.equal(relativeTime(ago(3 * HR), now), '3h ago');
});
test('days', () => {
  assert.equal(relativeTime(ago(2 * DAY), now), '2d ago');
});
test('weeks', () => {
  assert.equal(relativeTime(ago(20 * DAY), now), '3w ago');
});
test('months', () => {
  assert.equal(relativeTime(ago(60 * DAY), now), '2mo ago');
});
test('years', () => {
  assert.equal(relativeTime(ago(400 * DAY), now), '1y ago');
});
test('accepts an ISO string and bad input is empty', () => {
  assert.equal(relativeTime(ago(5 * MIN).toISOString(), now), '5m ago');
  assert.equal(relativeTime('not-a-date', now), '');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/time.test.js`
Expected: FAIL — `Cannot find module '../src/lib/time.js'`.

- [ ] **Step 3: Implement**

Create `src/lib/time.js`:

```js
// Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago", "3w ago",
// "2mo ago", "1y ago". `now` is injectable for testing. Returns '' on invalid input.
export function relativeTime(input, now = new Date()) {
  const then = input instanceof Date ? input : new Date(input);
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms)) return '';

  const sec = Math.round(ms / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.round(day / 7)}w ago`;
  if (day < 365) return `${Math.round(day / 30)}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/time.test.js`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.js test/time.test.js
git commit -m "feat: relativeTime helper with tests"
```

---

## Task 3: `labelTextColor` (TDD)

**Files:**
- Create: `src/lib/labels.js`
- Test: `test/labels.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/labels.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelTextColor } from '../src/lib/labels.js';

test('dark backgrounds get white text', () => {
  assert.equal(labelTextColor('000000'), '#ffffff');
  assert.equal(labelTextColor('d73a4a'), '#ffffff'); // GitHub red "bug"
  assert.equal(labelTextColor('0e8a16'), '#ffffff'); // green
});
test('light backgrounds get black text', () => {
  assert.equal(labelTextColor('ffffff'), '#000000');
  assert.equal(labelTextColor('fbca04'), '#000000'); // yellow
});
test('accepts a leading # and bad input defaults to white', () => {
  assert.equal(labelTextColor('#ffffff'), '#000000');
  assert.equal(labelTextColor(''), '#ffffff');
  assert.equal(labelTextColor('xyz'), '#ffffff');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/labels.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/labels.js`:

```js
// Pick readable text color ('#000000' or '#ffffff') for a GitHub label background
// given as a 6-digit hex (with or without '#'). Uses YIQ brightness. Defaults to
// white text on unparseable input.
export function labelTextColor(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '#ffffff';
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#000000' : '#ffffff';
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/labels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labels.js test/labels.test.js
git commit -m "feat: labelTextColor contrast helper with tests"
```

---

## Task 4: `matchesSearch` / `matchesStatusFilter` (TDD)

**Files:**
- Create: `src/lib/filter.js`
- Test: `test/filter.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/filter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, matchesStatusFilter } from '../src/lib/filter.js';

const pr = {
  title: 'Fix flaky checkout test',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  repository: { nameWithOwner: 'acme/web' },
  author: { login: 'dana' },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } } ] },
};

test('matchesSearch: empty query matches everything', () => {
  assert.equal(matchesSearch(pr, ''), true);
});
test('matchesSearch: matches title, repo, author; case-insensitive', () => {
  assert.equal(matchesSearch(pr, 'flaky'), true);
  assert.equal(matchesSearch(pr, 'acme/web'), true);
  assert.equal(matchesSearch(pr, 'DANA'), true);
  assert.equal(matchesSearch(pr, 'nope'), false);
});
test('matchesStatusFilter: all passes', () => {
  assert.equal(matchesStatusFilter(pr, 'all'), true);
  assert.equal(matchesStatusFilter(pr, ''), true);
});
test('matchesStatusFilter: failing / review / approved / draft', () => {
  assert.equal(matchesStatusFilter(pr, 'failing'), true);
  assert.equal(matchesStatusFilter(pr, 'review'), true);
  assert.equal(matchesStatusFilter(pr, 'approved'), false);
  assert.equal(matchesStatusFilter(pr, 'draft'), false);
  assert.equal(matchesStatusFilter({ ...pr, isDraft: true }, 'draft'), true);
  assert.equal(matchesStatusFilter({ ...pr, reviewDecision: 'APPROVED' }, 'approved'), true);
});
test('missing fields do not throw', () => {
  assert.equal(matchesSearch({}, 'x'), false);
  assert.equal(matchesStatusFilter({}, 'failing'), false);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/filter.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/filter.js`:

```js
// Pure predicates for the PR list. No DOM access.

export function matchesSearch(pr, query) {
  if (!query) return true;
  const q = String(query).toLowerCase();
  return (pr.title || '').toLowerCase().includes(q)
    || (pr.repository?.nameWithOwner || '').toLowerCase().includes(q)
    || (pr.author?.login || '').toLowerCase().includes(q);
}

export function matchesStatusFilter(pr, filterKey) {
  if (!filterKey || filterKey === 'all') return true;
  const ci = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  switch (filterKey) {
    case 'failing': return ci === 'FAILURE' || ci === 'ERROR';
    case 'review': return pr.reviewDecision === 'REVIEW_REQUIRED';
    case 'approved': return pr.reviewDecision === 'APPROVED';
    case 'draft': return !!pr.isDraft;
    default: return true;
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/filter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filter.js test/filter.test.js
git commit -m "feat: pure search/status filter predicates with tests"
```

---

## Task 5: `get-contributed-repos` data (main + preload)

**Files:**
- Modify: `main.js` (root — add an IPC handler after `get-contributions`)
- Modify: `preload.js`

- [ ] **Step 1: Add the IPC handler in `main.js`**

In `main.js`, immediately after the `get-contributions` handler (the block that ends `...contributionCalendar || null };\n});`), add:

```js
ipcMain.handle('get-contributed-repos', async () => {
  const q = `
  query {
    viewer {
      repositoriesContributedTo(first: 100, includeUserRepositories: true, contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW], orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes { nameWithOwner }
      }
    }
  }`;
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${q}`]);
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data?.viewer?.repositoriesContributedTo?.nodes || [] };
});
```

- [ ] **Step 2: Expose it in `preload.js`**

In `preload.js`, add a `getContributedRepos` line to the `api` object (after `getContributions`):

```js
  getContributions: () => ipcRenderer.invoke('get-contributions'),
  getContributedRepos: () => ipcRenderer.invoke('get-contributed-repos'),
```

- [ ] **Step 3: Verify main process parses**

Run: `node --check main.js && node --check preload.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat: get-contributed-repos IPC (repos contributed to, no open PR needed)"
```

---

## Task 6: `src/render/prs.js` — the new PR list renderer

**Files:**
- Create: `src/render/prs.js`

- [ ] **Step 1: Create the module (full content)**

Create `src/render/prs.js`:

```js
import { escapeHtml } from '../lib/escape.js';
import { relativeTime } from '../lib/time.js';
import { labelTextColor } from '../lib/labels.js';
import { matchesSearch, matchesStatusFilter } from '../lib/filter.js';

const GH = 'https://github.com';

// UI state owned by the list view.
const collapsedOrgs = new Set();
const collapsedRepos = new Set();
let activeFilter = 'all';
let lastOpts = null;

// Wire the filter chips once. Re-renders the list (with cached opts) on change.
export function setupFilterChips() {
  const chips = document.querySelectorAll('.filter-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter || 'all';
      chips.forEach((c) => c.classList.toggle('on', c === chip));
      if (lastOpts) renderPRList(lastOpts);
    });
  });
}

// opts: { prs, searchQuery, currentTab, contributedRepos, showEmptyRepos }
export function renderPRList(opts) {
  lastOpts = opts;
  const {
    prs = [],
    searchQuery = '',
    currentTab = 'my-prs',
    contributedRepos = [],
    showEmptyRepos = true,
  } = opts;

  const prList = document.getElementById('pr-list');
  const emptyState = document.getElementById('empty-state');

  // Tray count = unfiltered PR total (smart count comes in a later phase).
  if (window.api.updateTrayCount) window.api.updateTrayCount(prs.length);

  const filtering = !!searchQuery || activeFilter !== 'all';
  const filtered = prs.filter(
    (pr) => matchesSearch(pr, searchQuery) && matchesStatusFilter(pr, activeFilter)
  );

  // Group: org -> repo -> { prs, empty }
  const grouped = {};
  filtered.forEach((pr) => {
    const [org, repo] = pr.repository.nameWithOwner.split('/');
    grouped[org] = grouped[org] || {};
    grouped[org][repo] = grouped[org][repo] || { prs: [], empty: false };
    grouped[org][repo].prs.push(pr);
  });

  // Merge contributed-to repos that have no open PRs (Mine tab, unfiltered only).
  const includeEmpty = showEmptyRepos && currentTab === 'my-prs' && !filtering;
  if (includeEmpty) {
    contributedRepos.forEach((r) => {
      const [org, repo] = String(r.nameWithOwner || '').split('/');
      if (!org || !repo) return;
      grouped[org] = grouped[org] || {};
      if (!grouped[org][repo]) grouped[org][repo] = { prs: [], empty: true };
    });
  }

  const orgNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  if (orgNames.length === 0) {
    prList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  prList.innerHTML = '';

  for (const orgName of orgNames) {
    const repos = grouped[orgName];
    const repoNames = Object.keys(repos).sort((a, b) => {
      if (repos[a].empty !== repos[b].empty) return repos[a].empty ? 1 : -1; // PR repos first
      return a.localeCompare(b);
    });
    const prRepoCount = repoNames.filter((r) => !repos[r].empty).length;

    const orgSection = el('div', 'org-section');
    if (collapsedOrgs.has(orgName)) orgSection.classList.add('collapsed');

    const orgTotal = repoNames.reduce((n, r) => n + repos[r].prs.length, 0);
    const orgHeader = el('div', 'org-header');
    orgHeader.innerHTML = `
      ${chevronSvg('org-chevron', 14)}
      <span class="org-name">${escapeHtml(orgName)}</span>
      ${visitBtn(`${GH}/${encodeURIComponent(orgName)}`, 'Open org on GitHub')}
      <span class="repo-count">${orgTotal}</span>
    `;
    orgHeader.addEventListener('click', () => toggle(orgSection, collapsedOrgs, orgName));
    wireVisit(orgHeader);

    const orgContent = el('div', 'org-content');

    for (const repoName of repoNames) {
      const entry = repos[repoName];
      const repoKey = `${orgName}/${repoName}`;
      const repoSection = el('div', 'repo-section');
      if (entry.empty) repoSection.classList.add('repo-empty');

      // Collapse defaults: empty repos always collapsed; PR repos collapsed when the
      // org has more than one PR-bearing repo.
      if (entry.empty) {
        collapsedRepos.add(repoKey);
      } else if (!collapsedRepos.has(repoKey) && prRepoCount > 1) {
        collapsedRepos.add(repoKey);
      }
      if (collapsedRepos.has(repoKey) && !searchQuery) repoSection.classList.add('collapsed');
      else if (searchQuery) repoSection.classList.remove('collapsed');

      const repoHeader = el('div', 'repo-header');
      repoHeader.innerHTML = `
        ${chevronSvg('', 12)}
        <span class="repo-name">${escapeHtml(repoName)}</span>
        ${visitBtn(`${GH}/${encodeURIComponent(orgName)}/${encodeURIComponent(repoName)}`, 'Open repo on GitHub')}
        <span class="repo-count">${entry.empty ? '—' : entry.prs.length}</span>
      `;
      repoHeader.addEventListener('click', () => toggle(repoSection, collapsedRepos, repoKey));
      wireVisit(repoHeader);

      const repoContent = el('div', 'repo-content');
      if (entry.empty) {
        repoContent.appendChild(emptyRepoRow(orgName, repoName));
      } else {
        entry.prs.forEach((pr) => repoContent.appendChild(prRow(pr)));
      }

      repoSection.appendChild(repoHeader);
      repoSection.appendChild(repoContent);
      orgContent.appendChild(repoSection);
    }

    orgSection.appendChild(orgHeader);
    orgSection.appendChild(orgContent);
    prList.appendChild(orgSection);
  }

  prList.classList.remove('hidden');
}

// ---- helpers ----

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function chevronSvg(extra, size) {
  return `<svg class="chevron ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
}

function visitBtn(url, title) {
  return `<button class="header-visit" title="${escapeHtml(title)}" data-url="${escapeHtml(url)}">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  </button>`;
}

function wireVisit(header) {
  const btn = header.querySelector('.header-visit');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // don't toggle the accordion
    window.api.openExternal(btn.dataset.url);
  });
}

function toggle(section, set, key) {
  const collapsed = section.classList.toggle('collapsed');
  if (collapsed) set.add(key);
  else set.delete(key);
}

function emptyRepoRow(orgName, repoName) {
  const row = el('div', 'pr-item pr-empty');
  row.innerHTML = `<span class="pr-empty-text">No open PRs</span>`;
  row.addEventListener('click', () =>
    window.api.openExternal(`${GH}/${encodeURIComponent(orgName)}/${encodeURIComponent(repoName)}`)
  );
  return row;
}

const COPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ci-success"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

function prRow(pr) {
  const row = el('div', 'pr-item');
  if (pr.isDraft) row.classList.add('is-draft');

  const ci = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  let ciHtml = '';
  if (ci === 'SUCCESS') ciHtml = `<span class="ci-status ci-success" title="Checks passed">●</span>`;
  else if (ci === 'FAILURE' || ci === 'ERROR') ciHtml = `<span class="ci-status ci-failure" title="Checks failed">●</span>`;
  else if (ci === 'PENDING') ciHtml = `<span class="ci-status ci-pending" title="Checks pending">●</span>`;

  let reviewHtml = '';
  if (pr.reviewDecision === 'APPROVED') reviewHtml = `<span class="review-badge review-approved" title="Approved">✅</span>`;
  else if (pr.reviewDecision === 'CHANGES_REQUESTED') reviewHtml = `<span class="review-badge review-changes" title="Changes requested">❌</span>`;
  else if (pr.reviewDecision === 'REVIEW_REQUIRED') reviewHtml = `<span class="review-badge review-required" title="Review required">👀</span>`;

  let diffHtml = '';
  if (typeof pr.additions === 'number' && typeof pr.deletions === 'number') {
    diffHtml = `<span class="pr-diff"><span class="add">+${pr.additions}</span> <span class="del">−${pr.deletions}</span></span>`;
  }

  const draftTag = pr.isDraft ? `<span class="pr-label pr-label-draft">draft</span>` : '';
  const labels = (pr.labels?.nodes || [])
    .slice(0, 3)
    .map((l) => {
      const c = l.color || '888888';
      return `<span class="pr-label" style="background:#${escapeHtml(c)};color:${labelTextColor(c)}">${escapeHtml(l.name)}</span>`;
    })
    .join('');

  const initial = escapeHtml((pr.author?.login || '?').charAt(0).toUpperCase());

  row.innerHTML = `
    <div class="pr-avatar-wrap"><div class="pr-avatar-fallback">${initial}</div></div>
    <div class="pr-details">
      <div class="pr-title" title="${escapeHtml(pr.title)}">
        <span class="pr-number">#${pr.number}</span> ${escapeHtml(pr.title)}
      </div>
      <div class="pr-meta">
        <span class="pr-time">${escapeHtml(relativeTime(pr.createdAt))}</span>
        ${ciHtml}
        ${diffHtml}
        ${draftTag}
        ${labels}
        ${reviewHtml}
      </div>
    </div>
    <div class="pr-actions">
      <button class="copy-btn" title="Copy PR URL">${COPY_ICON}</button>
    </div>
  `;

  // Avatar: attach the error handler BEFORE setting src so a failed load reliably
  // falls back to the monogram already in the DOM.
  if (pr.author?.avatarUrl) {
    const wrap = row.querySelector('.pr-avatar-wrap');
    const img = document.createElement('img');
    img.className = 'pr-avatar';
    img.alt = '';
    img.title = pr.author.login ? `@${pr.author.login}` : '';
    img.addEventListener('error', () => img.remove());
    img.src = pr.author.avatarUrl;
    wrap.insertBefore(img, wrap.firstChild);
  }

  const copyBtn = row.querySelector('.copy-btn');
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(pr.url)
      .then(() => {
        copyBtn.innerHTML = CHECK_ICON;
        setTimeout(() => { copyBtn.innerHTML = COPY_ICON; }, 1500);
      })
      .catch(() => {});
  });

  row.addEventListener('click', () => window.api.openExternal(pr.url));
  return row;
}
```

- [ ] **Step 2: Verify it parses (used by Task 9; no standalone build yet)**

Run: `node --check src/render/prs.js` — note: this is ESM with imports, so instead verify via the Task 9 build. For now just confirm the file exists: `test -f src/render/prs.js && echo OK`
Expected: `OK`

> No commit yet — `prs.js` is wired up and built in Tasks 7–9. Commit happens in Task 9.

---

## Task 7: Filter chips markup

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the chips row after the search container**

In `index.html`, find the search container block:

```html
      <div class="search-container">
        <input type="text" id="search-input" class="search-input" placeholder="Search PRs, repos..." />
      </div>
```

and insert the filter bar immediately after it:

```html
      <div class="search-container">
        <input type="text" id="search-input" class="search-input" placeholder="Search PRs, repos..." />
      </div>

      <div class="filter-bar">
        <button class="filter-chip on" data-filter="all">All</button>
        <button class="filter-chip" data-filter="failing">⚠ Failing</button>
        <button class="filter-chip" data-filter="review">👀 Review</button>
        <button class="filter-chip" data-filter="approved">✓ Approved</button>
        <button class="filter-chip" data-filter="draft">Draft</button>
      </div>
```

- [ ] **Step 2: Verify**

Run: `grep -c "filter-chip" index.html`
Expected: `5`

---

## Task 8: Styles

**Files:**
- Modify: `src/style.css` (append)

- [ ] **Step 1: Append styles**

Append to `src/style.css`:

```css

/* Filter chips */
.filter-bar {
  display: flex;
  gap: 6px;
  padding: 0 12px 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-color);
}
.filter-chip {
  -webkit-app-region: no-drag;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 20px;
  border: none;
  background: var(--seg-bg);
  color: var(--text-secondary);
  cursor: pointer;
}
.filter-chip:hover { color: var(--text-primary); }
.filter-chip.on { background: var(--accent-color); color: #fff; }

/* Avatars */
.pr-avatar-wrap {
  position: relative;
  width: 20px;
  height: 20px;
  margin-right: 10px;
  flex-shrink: 0;
}
.pr-avatar, .pr-avatar-fallback {
  position: absolute;
  inset: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
}
.pr-avatar { object-fit: cover; z-index: 1; background: var(--seg-bg); }
.pr-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--seg-bg);
  text-transform: uppercase;
}

/* Diffstat */
.pr-diff { font-variant-numeric: tabular-nums; }
.pr-diff .add { color: var(--ci-success); }
.pr-diff .del { color: var(--ci-failure); }

/* Labels */
.pr-label {
  font-size: 9px;
  line-height: 1.4;
  padding: 0 6px;
  border-radius: 8px;
  white-space: nowrap;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pr-label-draft { background: var(--draft-color) !important; color: #fff !important; }

/* Header "open on GitHub" button */
.header-visit {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  margin-right: 4px;
  border-radius: 4px;
  display: flex;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.org-header:hover .header-visit,
.repo-header:hover .header-visit { opacity: 1; }
.header-visit:hover { color: var(--text-primary); background: var(--bg-color-hover); }

/* Empty (contributed, no open PR) repos */
.repo-empty .repo-name { color: var(--text-muted); }
.pr-empty {
  color: var(--text-muted);
  font-size: 12px;
  font-style: italic;
  cursor: pointer;
}
.pr-empty:hover { color: var(--text-secondary); }
```

- [ ] **Step 2: Verify**

Run: `grep -c "filter-chip\|pr-avatar\|pr-diff\|header-visit\|pr-empty" src/style.css`
Expected: a count ≥ 8.

---

## Task 9: Wire `src/main.js` to the new renderer

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Update imports + remove moved state**

At the top of `src/main.js`, the imports should read:

```js
import './style.css';
import { escapeHtml } from './lib/escape.js';
import { renderPRList, setupFilterChips } from './render/prs.js';
```

Then change the state block from:

```js
let currentTab = 'my-prs';
let refreshInterval = null;
let collapsedOrgs = new Set();
let collapsedRepos = new Set();
let currentPRs = [];
let searchQuery = '';
```

to (drop the two collapse Sets — now owned by `prs.js` — and add a contributed-repos cache):

```js
let currentTab = 'my-prs';
let refreshInterval = null;
let currentPRs = [];
let contributedRepos = [];
let searchQuery = '';
```

- [ ] **Step 2: Initialize filter chips**

In the `DOMContentLoaded` handler, add `setupFilterChips()`:

```js
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupFilterChips();
  loadData();
  startAutoRefresh();
});
```

- [ ] **Step 3: Update the search handler to call `renderPRList`**

In `setupEventListeners`, replace:

```js
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderPRs(currentPRs);
  });
```

with:

```js
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: true });
  });
```

- [ ] **Step 4: Update `loadData` to fetch contributed repos and render via `renderPRList`**

In `loadData`, replace the success block:

```js
    hideRefreshError();
    currentPRs = prRes.data || [];
    renderPRs(currentPRs);

    // Contributions are best-effort: never gate the list on them.
    const contribRes = await window.api.getContributions();
    renderContributions(contribRes && contribRes.ok ? contribRes.data : null);
```

with:

```js
    hideRefreshError();
    hideSetup();
    currentPRs = prRes.data || [];

    // Contributed-to repos (best-effort, Mine tab only) so repos with no open PRs still show.
    contributedRepos = [];
    if (currentTab === 'my-prs') {
      const cr = await window.api.getContributedRepos();
      if (cr && cr.ok) contributedRepos = cr.data || [];
    }
    renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: true });

    // Contributions are best-effort: never gate the list on them.
    const contribRes = await window.api.getContributions();
    renderContributions(contribRes && contribRes.ok ? contribRes.data : null);
```

- [ ] **Step 5: Delete the old `renderPRs` function**

Delete the entire `function renderPRs(prs) { ... }` block (from `function renderPRs(prs) {` through its closing `}` — it ends with `prList.classList.remove('hidden');\n}`). The `renderContributions`, `showLoading`, `showEmptyState`, `showSetup`, etc. functions stay.

- [ ] **Step 6: Confirm no dangling references**

Run: `grep -n "renderPRs\|collapsedOrgs\|collapsedRepos" src/main.js`
Expected: no output (all references removed/moved).

- [ ] **Step 7: Build the renderer**

Run: `npx vite build`
Expected: builds with no error and no unresolved imports.

- [ ] **Step 8: Run all unit tests**

Run: `npm test`
Expected: all suites pass (gh-errors, time, labels, filter).

- [ ] **Step 9: Commit**

```bash
git add src/main.js src/render/prs.js index.html src/style.css
git commit -m "feat: refreshed PR list — modules, avatars, relative time, diffstat, labels, filter chips, repo-visit icons, contributed repos"
```

---

## Task 10: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` is produced.

- [ ] **Step 2: Manual smoke (recommended)**

Run: `npm run dev`
Expected, on the Mine tab:
- Rows show **avatars** (or a monogram fallback), **relative time** ("2h ago"), **diffstat** (`+N −M`), and **labels** where present.
- **Filter chips** (All / Failing / Review / Approved / Draft) filter the list; "All" is selected by default.
- Hovering an **org or repo header** reveals an "open on GitHub" icon that opens the page without toggling the accordion.
- Repos you've **contributed to but have no open PRs** appear (collapsed, below PR repos), each opening the repo when clicked.
- Searching or selecting a non-"All" filter hides the empty contributed repos.
- The **Reviews** tab does not show empty contributed repos.

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-3-ui-refresh` into `main` and push. Delete the feature branch.

---

## Phase 3 Acceptance

- Renderer split: pure helpers in `src/lib/{escape,time,labels,filter}.js` (unit-tested), list rendering in `src/render/prs.js`; `src/main.js` no longer contains `renderPRs`, `escapeHtml`, or the collapse Sets.
- PR rows show avatars (with monogram fallback), relative time, diffstat, and labels.
- Status filter chips work client-side and combine with search.
- Org/repo headers have a hover "open on GitHub" icon that doesn't toggle the accordion.
- Contributed-to repos with no open PRs appear on Mine (collapsed, sorted below PR repos), gated by the `showEmptyRepos` param (hardcoded `true` until Phase 6) and hidden while searching/filtering.
- `npm test` (4 suites) and `npm run pack` green; merged to `main`.

**Next phase:** Phase 4 — Contributions widget (activity ring + tallies + expandable heatmap with 3M/6M/1Y range).
