import './style.css';
import { escapeHtml } from './lib/escape.js';
import { renderPRList, setupFilterChips, resetFilter } from './render/prs.js';
import { renderContributions, configureContributions } from './render/contributions.js';
import { renderInbox, updateInboxBadge } from './render/inbox.js';
import { renderActions } from './render/actions.js';
import { renderSettingsView, openSettings } from './render/settings.js';
import { setupKeyboardNav } from './render/keyboard.js';
import { defaultSettings } from '../lib/settings.js';

let currentTab = 'my-prs';
let refreshInterval = null;
let currentPRs = [];
let contributedRepos = [];
let searchQuery = '';
let settings = defaultSettings();
let appVersion = '';

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupFilterChips();
  setupKeyboardNav();
  await initSettings();
  loadData();
  checkForUpdateDot();
});

async function initSettings() {
  try {
    settings = (await window.api.getSettings()) || defaultSettings();
    appVersion = await window.api.getVersion();
  } catch (error) {
    console.error('Failed to load settings:', error);
    settings = defaultSettings();
  }
  applySettings(settings, false);
}

function applySettings(s, reload = true) {
  startAutoRefresh(s.refreshMinutes);
  configureContributions({
    enabled: s.showContributions,
    expanded: s.contrib.expanded,
    range: s.contrib.range,
    onChange: onContribChange,
  });
  applyTabVisibility(s.tabs, reload);
}

function onContribChange(c) {
  settings.contrib = { ...settings.contrib, ...c };
  window.api.setSettings(settings);
}

function applyTabVisibility(tabsCfg, reload) {
  const entries = [
    ['tab-my-prs', 'my-prs', tabsCfg.mine],
    ['tab-review', 'review-requests', tabsCfg.reviews],
    ['tab-inbox', 'inbox', tabsCfg.inbox],
    ['tab-actions', 'actions', tabsCfg.actions],
  ];
  let firstVisible = null;
  entries.forEach(([id, value, show]) => {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) label.style.display = show ? '' : 'none';
    if (show && !firstVisible) firstVisible = { id, value };
  });
  const activeVisible = entries.some(([, value, show]) => show && value === currentTab);
  if (!activeVisible && firstVisible) {
    document.getElementById(firstVisible.id).checked = true;
    currentTab = firstVisible.value;
    if (reload) loadData();
  }
}

async function onSettingsChange(next) {
  try {
    settings = (await window.api.setSettings(next)) || next;
  } catch (error) {
    console.error('Failed to save settings:', error);
    settings = next;
  }
  applySettings(settings, true);
  updateBadges();
}

function setupEventListeners() {
  const radios = document.querySelectorAll('input[name="tab-group"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentTab = e.target.value;
      resetFilter();
      loadData();
    });
  });

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    if (currentTab === 'inbox') {
      renderInbox(null, searchQuery);
    } else if (currentTab === 'actions') {
      renderActions(null, searchQuery);
    } else {
      renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: settings.showEmptyRepos });
    }
  });

  document.getElementById('quit-btn').addEventListener('click', () => {
    window.api.quitApp();
  });
  
  document.getElementById('refresh-btn').addEventListener('click', () => {
    loadData();
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    renderSettingsView(settings, appVersion, onSettingsChange);
    openSettings();
  });

  document.getElementById('refresh-error-retry').addEventListener('click', () => {
    loadData();
  });
}

function startAutoRefresh(minutes = 5) {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    loadData(true);
  }, minutes * 60000);
}

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

// Smart badge = review-requested PRs + unread inbox threads. Fetched every refresh
// regardless of the active tab, so the menubar count and inbox tab badge are always live.
async function updateBadges() {
  try {
    const [rev, inbox] = await Promise.all([
      window.api.getReviewRequests(),
      window.api.getInbox(),
    ]);
    const reviewCount = rev && rev.ok ? (rev.data || []).length : 0;
    const unread = inbox && inbox.ok ? (inbox.data || []).filter((n) => n.unread).length : 0;
    updateInboxBadge(unread);
    window.api.updateTrayCount(settings.smartBadge ? reviewCount + unread : 0);
  } catch (error) {
    console.error('updateBadges failed:', error);
  }
}

// Monotonic token for the in-flight load. Each loadData() bumps it; after every
// await we check we're still the latest before touching the DOM. Without this, a
// slow fetch (e.g. Actions' getMyPRs → getActionRuns) can resolve AFTER the user
// switched tabs and clobber the newer tab's render — Actions data landing under
// Reviews, etc.
let loadSeq = 0;

async function loadData(isSilent = false) {
  const seq = ++loadSeq;
  const stale = () => seq !== loadSeq;
  if (!isSilent) showLoading();

  try {
    if (currentTab === 'inbox') {
      const inboxRes = await window.api.getInbox();
      if (stale()) return;
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
      if (stale()) return;
      if (!prRes || !prRes.ok) {
        handleDataFailure(prRes, isSilent);
        return;
      }
      hideRefreshError();
      hideSetup();
      setListMode('actions');
      const repos = [...new Set((prRes.data || []).map((p) => p.repository.nameWithOwner))].slice(0, 8);
      const runsRes = await window.api.getActionRuns(repos);
      if (stale()) return;
      renderActions(runsRes && runsRes.ok ? (runsRes.data || []) : [], searchQuery);
    } else {
      // Fetch the primary PR list and (on Mine) contributed repos in PARALLEL, so the
      // list paints after the slower of the two — not their sum. The PR result still
      // gates the auth/setup state.
      const [prRes, crRes] = await Promise.all(
        currentTab === 'review-requests'
          ? [window.api.getReviewRequests()]
          : [window.api.getMyPRs(), window.api.getContributedRepos()]
      );
      if (stale()) return;

      if (!prRes || !prRes.ok) {
        handleDataFailure(prRes, isSilent);
        return;
      }

      hideRefreshError();
      hideSetup();
      setListMode('prs');
      currentPRs = prRes.data || [];
      contributedRepos = crRes && crRes.ok ? (crRes.data || []) : [];
      renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: settings.showEmptyRepos });
    }

    // Secondary data (contributions widget + smart badges) loads in the background —
    // it never blocks the list's first paint.
    loadSecondary();
  } catch (error) {
    // IPC-level failure (handler threw) — treat as a generic data failure.
    if (stale()) return;
    console.error('loadData failed:', error);
    handleDataFailure({ ok: false, kind: 'api' }, isSilent);
  }
}

// Background loads: the contributions widget + smart badges, fired after the list
// paints so they never delay the primary list.
function loadSecondary() {
  window.api
    .getContributions()
    .then((res) => renderContributions(res && res.ok ? res.data : null))
    .catch((error) => console.error('contributions failed:', error));
  updateBadges();
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

function showLoading() {
  hideSetup();
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('pr-list').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('inbox-list').classList.add('hidden');
  document.getElementById('inbox-empty').classList.add('hidden');
  document.getElementById('actions-list').classList.add('hidden');
  document.getElementById('actions-empty').classList.add('hidden');
}

function showEmptyState() {
  hideSetup();
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('pr-list').classList.add('hidden');
  document.getElementById('inbox-list').classList.add('hidden');
  document.getElementById('inbox-empty').classList.add('hidden');
  document.getElementById('actions-list').classList.add('hidden');
  document.getElementById('actions-empty').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
}

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

