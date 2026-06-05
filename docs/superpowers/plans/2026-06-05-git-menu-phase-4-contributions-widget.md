# Git Menu — Phase 4: Contributions Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-on 15-week heatmap with a compact **activity ring + tallies** (today, current streak, this week, best day, this year) and an **expandable heatmap** that carries a **3M / 6M / 1Y** range dropdown — all derived from the contributions calendar already fetched.

**Architecture:** Two new pure, unit-tested helpers — `src/lib/stats.js` (`computeStats(calendar)`) and `src/lib/levels.js` (`contributionLevel(count)`). A new `src/render/contributions.js` owns the widget's view + its `expanded`/`range` module state and re-renders on disclosure/range change. `src/main.js` drops its inline `renderContributions`/`getLevel` and imports the new renderer (its existing `loadData` call site is unchanged). No new fetch, no new deps.

**Tech Stack:** vanilla ESM renderer (Vite), `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §7 (re-imagined contributions — option D ring + tallies + expandable heatmap).

**Branch:** subagent-driven-development should create/work on `phase-4-contributions-widget` off `main`.

> **Settings note:** the spec persists `expanded`/`range` and a widget on/off toggle in settings —
> that store arrives in Phase 6. Here, `expanded`/`range` live as module state in
> `contributions.js` (default collapsed, `6m`); Phase 6 wires persistence + the toggle. Don't build
> a settings store now (YAGNI).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/levels.js` | Create | `contributionLevel(count)` → 0..4 (pure) |
| `src/lib/stats.js` | Create | `computeStats(calendar)` → {today, currentStreak, thisWeek, bestDay, thisYear, recentAverage} (pure) |
| `test/levels.test.js`, `test/stats.test.js` | Create | unit tests |
| `src/render/contributions.js` | Create | ring + tallies + disclosure + range + heatmap; owns expanded/range state |
| `src/style.css` | Modify (append) | ring, tallies, disclosure, range select, heatmap sizing, months, legend |
| `src/main.js` | Modify | remove inline `renderContributions`/`getLevel`; import the new renderer |

> The existing `.contrib-block.level-N` color rules in `src/style.css` are reused by the new
> heatmap. The old `.contributions-header`/`.contributions-graph` rules become unused (harmless).

---

## Task 1: `contributionLevel` (TDD)

**Files:**
- Create: `src/lib/levels.js`
- Test: `test/levels.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/levels.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contributionLevel } from '../src/lib/levels.js';

test('GitHub-style buckets: 0, 1-3, 4-6, 7-9, 10+', () => {
  assert.equal(contributionLevel(0), 0);
  assert.equal(contributionLevel(1), 1);
  assert.equal(contributionLevel(3), 1);
  assert.equal(contributionLevel(4), 2);
  assert.equal(contributionLevel(6), 2);
  assert.equal(contributionLevel(7), 3);
  assert.equal(contributionLevel(9), 3);
  assert.equal(contributionLevel(10), 4);
  assert.equal(contributionLevel(99), 4);
});

test('missing/negative counts are level 0', () => {
  assert.equal(contributionLevel(undefined), 0);
  assert.equal(contributionLevel(null), 0);
  assert.equal(contributionLevel(-2), 0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/levels.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/levels.js`:

```js
// Map a day's contribution count to a GitHub-style intensity level 0..4.
export function contributionLevel(count) {
  if (!count || count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/levels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/levels.js test/levels.test.js
git commit -m "feat: contributionLevel helper with tests"
```

---

## Task 2: `computeStats` (TDD)

**Files:**
- Create: `src/lib/stats.js`
- Test: `test/stats.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/stats.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/lib/stats.js';

// Helper: build a calendar from an array of daily counts (oldest -> newest),
// chunked into weeks of 7.
function calendarFrom(counts, total) {
  const days = counts.map((c, i) => ({ contributionCount: c, date: `2026-01-${(i % 28) + 1}`, color: '' }));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push({ contributionDays: days.slice(i, i + 7) });
  return { totalContributions: total, weeks };
}

// 14 days; most recent day (today) is 0, the day before is 5.
const counts = [0, 2, 3, 0, 1, 4, 2,  3, 1, 0, 4, 2, 5, 0];
const cal = calendarFrom(counts, 27);

test('today is the most recent day', () => {
  assert.equal(computeStats(cal).today, 0);
});
test('thisYear comes from totalContributions', () => {
  assert.equal(computeStats(cal).thisYear, 27);
});
test('bestDay is the max single day', () => {
  assert.equal(computeStats(cal).bestDay, 5);
});
test('thisWeek sums the last 7 days', () => {
  assert.equal(computeStats(cal).thisWeek, 3 + 1 + 0 + 4 + 2 + 5 + 0); // 15
});
test('current streak skips an empty today, then counts back while > 0', () => {
  // today=0 (skipped), then 5,2,4 are >0, then a 0 breaks it -> 3
  assert.equal(computeStats(cal).currentStreak, 3);
});
test('recentAverage is the rounded mean of up to the last 30 days', () => {
  assert.equal(computeStats(cal).recentAverage, 2); // 27/14 = 1.93 -> 2
});
test('empty / missing calendar is all zeros', () => {
  const z = computeStats({ weeks: [] });
  assert.deepEqual(z, { today: 0, currentStreak: 0, thisWeek: 0, bestDay: 0, thisYear: 0, recentAverage: 0 });
  assert.doesNotThrow(() => computeStats(undefined));
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test test/stats.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/stats.js`:

```js
// Derive at-a-glance stats from a GitHub contributions calendar.
// calendar: { totalContributions, weeks: [{ contributionDays: [{ contributionCount, date }] }] }
export function computeStats(calendar) {
  const days = [];
  (calendar?.weeks || []).forEach((w) => (w.contributionDays || []).forEach((d) => days.push(d)));
  const counts = days.map((d) => d.contributionCount || 0);
  const n = counts.length;

  const today = n ? counts[n - 1] : 0;
  const thisYear = calendar?.totalContributions ?? counts.reduce((a, b) => a + b, 0);
  const bestDay = counts.reduce((m, c) => Math.max(m, c), 0);
  const thisWeek = counts.slice(-7).reduce((a, b) => a + b, 0);

  // Current streak: if today has no contributions yet, don't let it break the streak;
  // then count consecutive days backward while > 0.
  let currentStreak = 0;
  let i = n - 1;
  if (i >= 0 && counts[i] === 0) i -= 1;
  for (; i >= 0; i -= 1) {
    if (counts[i] > 0) currentStreak += 1;
    else break;
  }

  const recent = counts.slice(-30);
  const recentAverage = recent.length
    ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
    : 0;

  return { today, currentStreak, thisWeek, bestDay, thisYear, recentAverage };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test test/stats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.js test/stats.test.js
git commit -m "feat: computeStats (today/streak/week/best/year) with tests"
```

---

## Task 3: `src/render/contributions.js`

**Files:**
- Create: `src/render/contributions.js`

- [ ] **Step 1: Create the module (full content)**

Create `src/render/contributions.js`:

```js
import { computeStats } from '../lib/stats.js';
import { contributionLevel } from '../lib/levels.js';

const RANGE_WEEKS = { '3m': 13, '6m': 26, '1y': 53 };

// View state (persisted to settings in a later phase).
let expanded = false;
let range = '6m';
let lastCalendar = null;

export function renderContributions(calendar) {
  lastCalendar = calendar;
  const container = document.getElementById('contributions-container');
  if (!calendar) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const s = computeStats(calendar);
  const goal = Math.max(1, s.recentAverage * 2);
  const pct = Math.min(100, Math.round((s.today / goal) * 100));
  const streakUnit = s.currentStreak === 1 ? 'day' : 'days';

  container.innerHTML = `
    <div class="contrib-card">
      <div class="contrib-top">
        <div class="contrib-ring" style="background: conic-gradient(var(--ci-success) ${pct}%, var(--seg-bg) 0);">
          <div class="contrib-ring-inner"><span class="v">${s.today}</span><span class="k">today</span></div>
        </div>
        <div class="contrib-tallies">
          <div class="tally"><span>Current streak</span><span class="tally-fire">🔥 ${s.currentStreak} ${streakUnit}</span></div>
          <div class="tally"><span>This week</span><span>${s.thisWeek}</span></div>
          <div class="tally"><span>Best day</span><span>${s.bestDay}</span></div>
          <div class="tally"><span>This year</span><span>${s.thisYear}</span></div>
        </div>
      </div>
      <div class="contrib-disclosure">
        <button class="contrib-toggle" type="button">
          <svg class="chevron ${expanded ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          Heatmap
        </button>
        <select class="contrib-range" aria-label="Heatmap range">
          <option value="3m" ${range === '3m' ? 'selected' : ''}>Last 3 months</option>
          <option value="6m" ${range === '6m' ? 'selected' : ''}>Last 6 months</option>
          <option value="1y" ${range === '1y' ? 'selected' : ''}>Last 1 year</option>
        </select>
      </div>
      <div class="contrib-heatmap ${expanded ? '' : 'hidden'}">
        ${heatmapHtml(calendar)}
      </div>
    </div>
  `;

  container.querySelector('.contrib-toggle').addEventListener('click', () => {
    expanded = !expanded;
    renderContributions(lastCalendar);
  });
  container.querySelector('.contrib-range').addEventListener('change', (e) => {
    range = e.target.value;
    expanded = true; // changing the range implies you want to see it
    renderContributions(lastCalendar);
  });
}

function heatmapHtml(calendar) {
  const weeksToShow = RANGE_WEEKS[range] || 26;
  const weeks = (calendar.weeks || []).slice(-weeksToShow);

  const columns = weeks
    .map((week) => {
      const blocks = (week.contributionDays || [])
        .map((d) => {
          const lvl = contributionLevel(d.contributionCount);
          return `<div class="contrib-block level-${lvl}" title="${d.contributionCount} on ${d.date}"></div>`;
        })
        .join('');
      return `<div class="contrib-column">${blocks}</div>`;
    })
    .join('');

  const legend = `<div class="contrib-legend">Less ${[0, 1, 2, 3, 4]
    .map((l) => `<span class="contrib-block level-${l}"></span>`)
    .join('')} More</div>`;

  return `${monthLabels(weeks)}<div class="contrib-grid">${columns}</div>${legend}`;
}

function monthLabels(weeks) {
  // A label appears on the first column of each new month; it overflows into the
  // following (empty) columns the way GitHub's calendar does.
  let last = '';
  const spans = weeks
    .map((week) => {
      const first = week.contributionDays?.[0]?.date;
      if (!first) return '<span></span>';
      const m = new Date(first).toLocaleString(undefined, { month: 'short' });
      if (m !== last) {
        last = m;
        return `<span>${m}</span>`;
      }
      return '<span></span>';
    })
    .join('');
  return `<div class="contrib-months">${spans}</div>`;
}
```

- [ ] **Step 2: Confirm the file exists (built in Task 5)**

Run: `test -f src/render/contributions.js && echo OK`
Expected: `OK`

> No commit yet — committed together with the wiring in Task 5.

---

## Task 4: Styles

**Files:**
- Modify: `src/style.css` (append)

- [ ] **Step 1: Append styles**

Append to `src/style.css`:

```css

/* Contributions widget (ring + tallies + expandable heatmap) */
.contrib-card { width: 100%; }
.contrib-top { display: flex; align-items: center; gap: 12px; }
.contrib-ring {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.contrib-ring-inner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #1f242b; /* opaque hub so the conic ring reads as a donut, not a disc */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
@media (prefers-color-scheme: light) {
  .contrib-ring-inner { background: #f6f8fa; }
}
.contrib-ring-inner .v { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.contrib-ring-inner .k { font-size: 8px; color: var(--text-muted); }
.contrib-tallies { flex: 1; min-width: 0; }
.tally { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); padding: 1px 0; }
.tally-fire { color: #ff9f43; }

.contrib-disclosure {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
.contrib-toggle {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.contrib-toggle:hover { color: var(--text-primary); }
.contrib-range {
  -webkit-app-region: no-drag;
  margin-left: auto;
  font-size: 10px;
  background: var(--seg-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 2px 4px;
}

.contrib-heatmap { margin-top: 8px; }
.contrib-grid { display: flex; gap: 2px; overflow-x: auto; padding-bottom: 2px; }
.contrib-grid::-webkit-scrollbar { height: 0; }
.contrib-grid .contrib-column { gap: 2px; }
.contrib-grid .contrib-block { width: 8px; height: 8px; }
.contrib-months { display: flex; gap: 2px; height: 11px; margin-bottom: 2px; }
.contrib-months span { width: 10px; font-size: 8px; color: var(--text-muted); white-space: nowrap; overflow: visible; }
.contrib-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  justify-content: flex-end;
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 6px;
}
.contrib-legend .contrib-block { width: 8px; height: 8px; }
```

- [ ] **Step 2: Verify**

Run: `grep -c "contrib-card\|contrib-ring\|contrib-tallies\|contrib-disclosure\|contrib-grid\|contrib-legend" src/style.css`
Expected: a count ≥ 6.

---

## Task 5: Wire `src/main.js` to the new renderer

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add the import**

At the top of `src/main.js`, after the `prs.js` import, add the contributions import so the imports read:

```js
import './style.css';
import { escapeHtml } from './lib/escape.js';
import { renderPRList, setupFilterChips, resetFilter } from './render/prs.js';
import { renderContributions } from './render/contributions.js';
```

- [ ] **Step 2: Delete the inline `renderContributions`**

Delete the entire inline `function renderContributions(calendar) { ... }` block from `src/main.js` (it begins `function renderContributions(calendar) {`, contains the nested `getLevel` function and the week-rendering loop, and ends with its closing `}` just before `function showLoading()`). The `loadData` call `renderContributions(contribRes && contribRes.ok ? contribRes.data : null)` stays as-is and now resolves to the imported function.

- [ ] **Step 3: Confirm no leftover inline definition / helper**

Run: `grep -n "function renderContributions\|function getLevel\|contrib-column" src/main.js`
Expected: no output (the inline renderer and its `getLevel` are gone; column building now lives in `contributions.js`).

- [ ] **Step 4: Confirm the import + call remain**

Run: `grep -n "renderContributions" src/main.js`
Expected: two lines — the `import ... renderContributions ...` line and the `renderContributions(...)` call inside `loadData`.

- [ ] **Step 5: Build the renderer**

Run: `npx vite build`
Expected: builds with no error and no unresolved imports.

- [ ] **Step 6: Run all unit tests**

Run: `npm test`
Expected: all suites pass (gh-errors, time, labels, filter, levels, stats).

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/render/contributions.js src/style.css
git commit -m "feat: re-imagined contributions widget — activity ring + tallies + expandable heatmap (3M/6M/1Y)"
```

---

## Task 6: Verify + integrate

**Files:** none (verification)

- [ ] **Step 1: Full build**

Run: `npm run pack`
Expected: `release/mac-arm64/Git Menu.app` is produced.

- [ ] **Step 2: Manual smoke (recommended)**

Run: `npm run dev`
Expected at the top of the popover:
- A **ring** with today's count centered, beside **Current streak / This week / Best day / This year** tallies.
- A **Heatmap** disclosure row with a **range dropdown** (Last 3 months / 6 months / 1 year). Collapsed by default.
- Clicking **Heatmap** expands the grid (chevron rotates); changing the range updates the grid (and expands it). Wider ranges scroll horizontally. Legend (Less▢▢▢▢▢More) shows.
- With no contributions data, the widget hides (no errors).

- [ ] **Step 3: Confirm tests + build are green**

Run: `npm test && npm run pack`
Expected: tests pass; `Git Menu.app` produced.

- [ ] **Step 4: Complete the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-4-contributions-widget` into `main` and push. Delete the feature branch.

---

## Phase 4 Acceptance

- `src/lib/levels.js` + `src/lib/stats.js` are pure and unit-tested (GitHub buckets; today/streak/week/best/year/recentAverage incl. the empty-today streak rule and empty-calendar case).
- `src/render/contributions.js` renders the ring + tallies, a disclosure that toggles an expandable heatmap, and a 3M/6M/1Y range dropdown; it owns `expanded`/`range` module state and re-renders on change.
- `src/main.js` no longer contains an inline `renderContributions` or `getLevel`; it imports the new renderer and the `loadData` call site is unchanged.
- Heatmap reuses the existing `.contrib-block.level-N` colors; wider ranges scroll.
- `npm test` (6 suites) and `npm run pack` green; merged to `main`.

**Next phase:** Phase 5 — Inbox tab (GitHub notifications smart subset: review requests / mentions / replies / assignments, with mark-read).
