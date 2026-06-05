# Git Menu — Phase 5: Inbox Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third **Inbox** tab that surfaces your GitHub notifications — the smart subset (review requests, mentions, replies, assignments) — grouped by reason, with an unread badge, click-to-open-and-mark-read, and mark-all-read.

**Architecture:** A pure, unit-tested `lib/notifications.js` (main-side) does reason-filtering, API→HTML URL transform, and normalization. Three new IPC handlers (`get-inbox`, `mark-read`, `mark-all-read`) wrap `gh api notifications`. `runGH` gains an empty-stdout guard (mark endpoints return 205/no body). A new `src/render/inbox.js` renders the grouped list. `src/main.js` routes the Inbox tab to it and toggles list "mode" (inbox vs PR list + filter chips). No new runtime deps.

**Tech Stack:** Electron main (ESM) + `gh`, vanilla ESM renderer, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §6 (Inbox tab) + §4.2 (`get-inbox`/`mark-read`/`mark-all-read`).

**Branch:** subagent-driven-development should create/work on `phase-5-inbox-tab` off `main`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/notifications.js` | Create | `subjectToHtmlUrl`, `INBOX_REASONS`, `filterInbox`, `normalizeNotification` (pure, main-side) |
| `test/notifications.test.js` | Create | unit tests |
| `main.js` (root) | Modify | `runGH` empty-stdout guard; `get-inbox`/`mark-read`/`mark-all-read` handlers |
| `preload.js` | Modify | expose `getInbox`/`markRead`/`markAllRead` |
| `index.html` | Modify | Inbox tab + badge; `#filter-bar` id; `#inbox-list`/`#inbox-empty` |
| `src/render/inbox.js` | Create | grouped notifications render, mark-read/mark-all, unread badge |
| `src/style.css` | Modify (append) | tab badge, inbox group/item/dot/meta, mark-all, actions |
| `src/main.js` | Modify | import inbox renderer; `setListMode`; route Inbox tab in `loadData`/search |

> `lib/notifications.js` is main-side, so it lives in root `lib/` (already shipped via
> `build.files`). It is consumed by `main.js`'s handlers.

---

## Task 1: `lib/notifications.js` (TDD)

**Files:**
- Create: `lib/notifications.js`
- Test: `test/notifications.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/notifications.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectToHtmlUrl, filterInbox, normalizeNotification, INBOX_REASONS } from '../lib/notifications.js';

test('subjectToHtmlUrl converts the pulls API url to the html pull url', () => {
  assert.equal(
    subjectToHtmlUrl('https://api.github.com/repos/acme/web/pulls/412'),
    'https://github.com/acme/web/pull/412'
  );
});
test('subjectToHtmlUrl keeps issues as /issues/ and falls back when missing', () => {
  assert.equal(
    subjectToHtmlUrl('https://api.github.com/repos/acme/api/issues/45'),
    'https://github.com/acme/api/issues/45'
  );
  assert.equal(subjectToHtmlUrl(null), 'https://github.com/notifications');
});

test('INBOX_REASONS is the smart subset', () => {
  assert.ok(INBOX_REASONS.has('review_requested'));
  assert.ok(INBOX_REASONS.has('mention'));
  assert.ok(INBOX_REASONS.has('comment'));
  assert.ok(INBOX_REASONS.has('assign'));
  assert.ok(!INBOX_REASONS.has('subscribed'));
});

test('filterInbox keeps only the smart-subset reasons', () => {
  const list = [
    { reason: 'review_requested' },
    { reason: 'subscribed' },
    { reason: 'mention' },
    { reason: 'ci_activity' },
  ];
  assert.deepEqual(filterInbox(list).map((n) => n.reason), ['review_requested', 'mention']);
  assert.deepEqual(filterInbox(undefined), []);
});

test('normalizeNotification flattens the raw thread', () => {
  const raw = {
    id: '99',
    reason: 'review_requested',
    unread: true,
    updated_at: '2026-06-05T10:00:00Z',
    subject: { title: 'Rework auth token refresh', url: 'https://api.github.com/repos/acme/api/pulls/221', type: 'PullRequest' },
    repository: { full_name: 'acme/api' },
  };
  assert.deepEqual(normalizeNotification(raw), {
    id: '99',
    reason: 'review_requested',
    title: 'Rework auth token refresh',
    repo: 'acme/api',
    number: 221,
    url: 'https://github.com/acme/api/pull/221',
    updatedAt: '2026-06-05T10:00:00Z',
    unread: true,
  });
});
test('normalizeNotification tolerates missing fields', () => {
  const n = normalizeNotification({});
  assert.equal(n.title, '');
  assert.equal(n.repo, '');
  assert.equal(n.number, null);
  assert.equal(n.url, 'https://github.com/notifications');
  assert.equal(n.unread, true);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/notifications.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/notifications.js`:

```js
// Pure helpers for the notifications "Inbox". Main-side (no DOM).

// The "smart subset" of notification reasons we surface.
export const INBOX_REASONS = new Set(['review_requested', 'mention', 'comment', 'assign']);

// Convert a notification subject's REST API url to its browser (html) url.
// e.g. https://api.github.com/repos/o/r/pulls/12 -> https://github.com/o/r/pull/12
export function subjectToHtmlUrl(apiUrl) {
  if (!apiUrl) return 'https://github.com/notifications';
  return String(apiUrl)
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace('/pulls/', '/pull/');
}

export function filterInbox(list) {
  return (list || []).filter((n) => INBOX_REASONS.has(n?.reason));
}

export function normalizeNotification(raw) {
  const url = subjectToHtmlUrl(raw?.subject?.url);
  const numMatch = url.match(/\/(\d+)(?:$|[/#?])/);
  return {
    id: raw?.id,
    reason: raw?.reason,
    title: raw?.subject?.title || '',
    repo: raw?.repository?.full_name || '',
    number: numMatch ? Number(numMatch[1]) : null,
    url,
    updatedAt: raw?.updated_at || null,
    unread: raw?.unread !== false,
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/notifications.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.js test/notifications.test.js
git commit -m "feat: pure notifications helpers (url transform, filter, normalize) with tests"
```

---

## Task 2: IPC handlers + `runGH` empty-stdout guard

**Files:**
- Modify: `main.js` (root)

- [ ] **Step 1: Import the helpers**

In `main.js`, add to the import that already pulls in `classifyGhFailure` — i.e. after that import line, add:

```js
import { filterInbox, normalizeNotification } from './lib/notifications.js';
```

- [ ] **Step 2: Guard `runGH` against empty stdout (205 / no-body responses)**

In `main.js`'s `runGH`, change the success return:

```js
    const { stdout } = await execFilePromise(command, args, { env: ghEnv });
    return { ok: true, data: JSON.parse(stdout) };
```

to:

```js
    const { stdout } = await execFilePromise(command, args, { env: ghEnv });
    // mark-read style endpoints return 205 with an empty body — treat as success/no data.
    return { ok: true, data: stdout && stdout.trim() ? JSON.parse(stdout) : null };
```

- [ ] **Step 3: Add the three handlers**

In `main.js`, immediately after the `get-contributed-repos` handler, add:

```js
ipcMain.handle('get-inbox', async () => {
  const res = await runGH('gh', ['api', 'notifications', '--paginate']);
  if (!res.ok) return res;
  const items = filterInbox(res.data).map(normalizeNotification);
  return { ok: true, data: items };
});

ipcMain.handle('mark-read', async (event, id) => {
  if (!id) return { ok: true };
  const res = await runGH('gh', ['api', '-X', 'PATCH', `notifications/threads/${id}`]);
  return res.ok ? { ok: true } : res;
});

ipcMain.handle('mark-all-read', async (event, ids) => {
  for (const id of ids || []) {
    await runGH('gh', ['api', '-X', 'PATCH', `notifications/threads/${id}`]);
  }
  return { ok: true };
});
```

- [ ] **Step 4: Verify**

Run: `node --check main.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat: inbox IPC (get-inbox/mark-read/mark-all-read) + runGH empty-body guard"
```

---

## Task 3: Preload exposure

**Files:**
- Modify: `preload.js`

- [ ] **Step 1: Add the three methods**

In `preload.js`, add after `getContributedRepos`:

```js
  getContributedRepos: () => ipcRenderer.invoke('get-contributed-repos'),
  getInbox: () => ipcRenderer.invoke('get-inbox'),
  markRead: (id) => ipcRenderer.invoke('mark-read', id),
  markAllRead: (ids) => ipcRenderer.invoke('mark-all-read', ids),
```

- [ ] **Step 2: Verify**

Run: `node --check preload.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add preload.js
git commit -m "feat: expose inbox IPC methods on window.api"
```

---

## Task 4: Markup — Inbox tab, containers, ids

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the Inbox tab + badge (and relabel to Mine/Reviews)**

Replace the segmented control block:

```html
        <div class="segmented-control">
          <input type="radio" id="tab-my-prs" name="tab-group" value="my-prs" checked>
          <label for="tab-my-prs">My PRs</label>
          
          <input type="radio" id="tab-review" name="tab-group" value="review-requests">
          <label for="tab-review">Reviews</label>
        </div>
```

with:

```html
        <div class="segmented-control">
          <input type="radio" id="tab-my-prs" name="tab-group" value="my-prs" checked>
          <label for="tab-my-prs">Mine</label>

          <input type="radio" id="tab-review" name="tab-group" value="review-requests">
          <label for="tab-review">Reviews</label>

          <input type="radio" id="tab-inbox" name="tab-group" value="inbox">
          <label for="tab-inbox">Inbox <span id="inbox-badge" class="tab-badge hidden">0</span></label>
        </div>
```

- [ ] **Step 2: Give the filter bar an id**

Change:

```html
      <div class="filter-bar">
```

to:

```html
      <div class="filter-bar" id="filter-bar">
```

- [ ] **Step 3: Add inbox containers inside `.content`**

Find the `#setup` div inside `.content`:

```html
        <div id="setup" class="setup hidden"></div>
      </div>
```

and insert the inbox containers before it:

```html
        <div id="inbox-list" class="inbox-list hidden"></div>
        <div id="inbox-empty" class="empty-state hidden">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
            <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
          </svg>
          <span>Inbox zero</span>
        </div>
        <div id="setup" class="setup hidden"></div>
      </div>
```

- [ ] **Step 4: Verify**

Run: `grep -c "tab-inbox\|inbox-list\|inbox-empty\|id=\"filter-bar\"\|inbox-badge" index.html`
Expected: a count ≥ 5.

---

## Task 5: `src/render/inbox.js`

**Files:**
- Create: `src/render/inbox.js`

- [ ] **Step 1: Create the module (full content)**

Create `src/render/inbox.js`:

```js
import { escapeHtml } from '../lib/escape.js';
import { relativeTime } from '../lib/time.js';

// Render order + human labels/notes per reason.
const REASON_GROUPS = [
  { key: 'review_requested', label: 'Review requested', note: 'requested your review' },
  { key: 'mention', label: 'Mentioned', note: 'mentioned you' },
  { key: 'comment', label: 'Replies', note: 'new comment' },
  { key: 'assign', label: 'Assigned', note: 'assigned to you' },
];

let lastItems = [];
let lastSearch = '';

export function renderInbox(items, searchQuery) {
  if (items != null) lastItems = items;
  if (searchQuery != null) lastSearch = searchQuery;

  const list = document.getElementById('inbox-list');
  const empty = document.getElementById('inbox-empty');

  updateInboxBadge(lastItems.filter((n) => n.unread).length);

  const q = lastSearch;
  const filtered = lastItems.filter(
    (n) => !q || (n.title || '').toLowerCase().includes(q) || (n.repo || '').toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = '';

  const actions = document.createElement('div');
  actions.className = 'inbox-actions';
  actions.innerHTML = `<button class="inbox-mark-all" type="button">Mark all read</button>`;
  actions.querySelector('.inbox-mark-all').addEventListener('click', markAll);
  list.appendChild(actions);

  REASON_GROUPS.forEach((group) => {
    const groupItems = filtered.filter((n) => n.reason === group.key);
    if (groupItems.length === 0) return;
    const header = document.createElement('div');
    header.className = 'inbox-group';
    header.textContent = group.label;
    list.appendChild(header);
    groupItems.forEach((n) => list.appendChild(inboxRow(n, group.note)));
  });

  list.classList.remove('hidden');
}

function inboxRow(n, note) {
  const row = document.createElement('div');
  row.className = 'inbox-item';
  const numHtml = n.number ? `<span class="pr-number">#${n.number}</span> ` : '';
  row.innerHTML = `
    <span class="inbox-dot ${n.unread ? '' : 'read'}"></span>
    <div class="inbox-body">
      <div class="inbox-title" title="${escapeHtml(n.title)}">${numHtml}${escapeHtml(n.title)}</div>
      <div class="inbox-meta">
        <span>${escapeHtml(n.repo)}</span>
        <span>${escapeHtml(relativeTime(n.updatedAt))}</span>
        <span>${escapeHtml(note)}</span>
      </div>
    </div>
  `;
  row.addEventListener('click', () => {
    window.api.openExternal(n.url);
    if (n.unread) {
      window.api.markRead(n.id);
      n.unread = false;
      row.querySelector('.inbox-dot').classList.add('read');
      updateInboxBadge(lastItems.filter((x) => x.unread).length);
    }
  });
  return row;
}

function markAll() {
  const ids = lastItems.filter((n) => n.unread).map((n) => n.id).filter(Boolean);
  if (ids.length) window.api.markAllRead(ids);
  lastItems.forEach((n) => { n.unread = false; });
  renderInbox(lastItems, lastSearch);
}

export function updateInboxBadge(count) {
  const badge = document.getElementById('inbox-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
```

- [ ] **Step 2: Confirm the file exists (built in Task 7)**

Run: `test -f src/render/inbox.js && echo OK`
Expected: `OK`

---

## Task 6: Inbox styles

**Files:**
- Modify: `src/style.css` (append)

- [ ] **Step 1: Append styles**

Append to `src/style.css`:

```css

/* Inbox tab badge */
.tab-badge {
  background: #388bfd;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 8px;
  margin-left: 4px;
  vertical-align: middle;
}

/* Inbox list */
.inbox-list { display: flex; flex-direction: column; }
.inbox-actions { display: flex; justify-content: flex-end; padding: 6px 12px; }
.inbox-mark-all {
  -webkit-app-region: no-drag;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
}
.inbox-mark-all:hover { color: var(--text-primary); background: var(--bg-color-hover); }
.inbox-group {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 7px 12px 3px;
}
.inbox-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 7px 12px;
  cursor: pointer;
  border-top: 1px solid var(--border-color);
}
.inbox-item:hover { background: var(--bg-color-hover); }
.inbox-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #388bfd;
  flex: 0 0 auto;
}
.inbox-dot.read { background: transparent; }
.inbox-body { min-width: 0; flex: 1; }
.inbox-title {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inbox-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.inbox-meta span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

- [ ] **Step 2: Verify**

Run: `grep -c "tab-badge\|inbox-list\|inbox-group\|inbox-item\|inbox-dot\|inbox-mark-all" src/style.css`
Expected: a count ≥ 6.

---

## Task 7: Route the Inbox tab in `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Import the inbox renderer**

After the contributions import, add:

```js
import { renderContributions } from './render/contributions.js';
import { renderInbox, updateInboxBadge } from './render/inbox.js';
```

- [ ] **Step 2: Add a `setListMode` helper**

Add this function near `showLoading` (e.g. just above `function showLoading()`):

```js
// Toggle which list is active: 'inbox' shows the inbox + hides the PR list/filter chips;
// 'prs' does the reverse. Each renderer manages its own container's visibility from there.
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

- [ ] **Step 3: Hide inbox containers in `showLoading`**

Update `showLoading` so it also clears the inbox containers:

```js
function showLoading() {
  hideSetup();
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('pr-list').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('inbox-list').classList.add('hidden');
  document.getElementById('inbox-empty').classList.add('hidden');
}
```

- [ ] **Step 4: Route the Inbox tab in `loadData`**

Replace the body of `loadData`'s `try` block (from `// PRs are the primary call ...` through the `renderPRList(...)` line, i.e. everything before `// Contributions are best-effort:`):

```js
    // PRs are the primary call — its result gates auth/setup state.
    const prRes = currentTab === 'review-requests'
      ? await window.api.getReviewRequests()
      : await window.api.getMyPRs();

    if (!prRes || !prRes.ok) {
      handleDataFailure(prRes, isSilent);
      return;
    }

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
```

with a tab branch:

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
    } else {
      // PRs are the primary call — its result gates auth/setup state.
      const prRes = currentTab === 'review-requests'
        ? await window.api.getReviewRequests()
        : await window.api.getMyPRs();

      if (!prRes || !prRes.ok) {
        handleDataFailure(prRes, isSilent);
        return;
      }

      hideRefreshError();
      hideSetup();
      setListMode('prs');
      currentPRs = prRes.data || [];

      // Contributed-to repos (best-effort, Mine tab only) so repos with no open PRs still show.
      contributedRepos = [];
      if (currentTab === 'my-prs') {
        const cr = await window.api.getContributedRepos();
        if (cr && cr.ok) contributedRepos = cr.data || [];
      }
      renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: true });
    }
```

(The `// Contributions are best-effort: ...` block that follows stays unchanged.)

- [ ] **Step 5: Route search by tab**

In `setupEventListeners`, replace the search handler:

```js
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: true });
  });
```

with:

```js
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    if (currentTab === 'inbox') {
      renderInbox(null, searchQuery);
    } else {
      renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: true });
    }
  });
```

- [ ] **Step 6: Verify build + dangling refs**

Run: `grep -n "renderInbox\|setListMode\|updateInboxBadge" src/main.js`
Expected: shows the import + `setListMode` definition + the `renderInbox` calls (no missing references).

Run: `npx vite build`
Expected: builds with no error.

- [ ] **Step 7: Run all unit tests**

Run: `npm test`
Expected: all suites pass (incl. the new notifications suite).

- [ ] **Step 8: Commit**

```bash
git add index.html src/render/inbox.js src/style.css src/main.js
git commit -m "feat: Inbox tab — grouped GitHub notifications with mark-read / mark-all + unread badge"
```

---

## Task 8: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` is produced.

- [ ] **Step 2: Manual smoke (recommended)**

Run: `npm run dev`
Expected:
- A third **Inbox** tab; its label shows an **unread count badge** after the inbox loads.
- The Inbox list is **grouped** (Review requested / Mentioned / Replies / Assigned), each row showing repo · relative time · reason, with an unread dot.
- **Clicking a row** opens the thread in the browser and marks it read (dot clears, badge decrements).
- **Mark all read** clears the dots and the badge.
- On the Inbox tab the **status filter chips are hidden**; the **search box filters notifications** by title/repo.
- Switching back to Mine/Reviews restores the PR list + chips.
- Empty inbox shows **"Inbox zero"**.

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-5-inbox-tab` into `main` and push. Delete the feature branch.

---

## Phase 5 Acceptance

- `lib/notifications.js` is pure + unit-tested (url transform, reason filter, normalize incl. missing fields).
- `get-inbox` returns the normalized smart subset; `mark-read`/`mark-all-read` work (and `runGH` no longer errors on the 205 empty body).
- Inbox tab renders grouped notifications with unread dots; click opens + marks read; mark-all works; unread **badge** on the tab.
- Status chips hidden on Inbox; search filters notifications; PR tabs restore the list + chips.
- `npm test` (7 suites) and `npm run pack` green; merged to `main`.

**Next phase:** Phase 6 — Power-user layer (settings store + view, launch-at-login, global hotkey, keyboard navigation; wires `showEmptyRepos` + contributions `expanded`/`range`).
