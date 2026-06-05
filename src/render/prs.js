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

// Reset the status filter to "all" (e.g. on tab switch) so it doesn't leak across views.
export function resetFilter() {
  activeFilter = 'all';
  document
    .querySelectorAll('.filter-chip')
    .forEach((c) => c.classList.toggle('on', c.dataset.filter === 'all'));
}

// opts: { prs, searchQuery, currentTab, contributedRepos, showEmptyRepos }
// lastOpts is refreshed by every loadData/search render; a chip-click re-render is
// only valid between those events, which is the only time it fires.
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
