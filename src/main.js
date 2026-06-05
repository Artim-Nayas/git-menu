import './style.css';
import { escapeHtml } from './lib/escape.js';
import { renderPRList, setupFilterChips, resetFilter } from './render/prs.js';
import { renderContributions } from './render/contributions.js';
import { renderInbox } from './render/inbox.js';

let currentTab = 'my-prs';
let refreshInterval = null;
let currentPRs = [];
let contributedRepos = [];
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupFilterChips();
  loadData();
  startAutoRefresh();
});

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
    } else {
      renderPRList({ prs: currentPRs, searchQuery, currentTab, contributedRepos, showEmptyRepos: true });
    }
  });

  document.getElementById('quit-btn').addEventListener('click', () => {
    window.api.quitApp();
  });
  
  document.getElementById('refresh-btn').addEventListener('click', () => {
    loadData();
  });

  document.getElementById('refresh-error-retry').addEventListener('click', () => {
    loadData();
  });
}

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    loadData(true);
  }, 300000);
}

async function loadData(isSilent = false) {
  if (!isSilent) showLoading();

  try {
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

function showLoading() {
  hideSetup();
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('pr-list').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('inbox-list').classList.add('hidden');
  document.getElementById('inbox-empty').classList.add('hidden');
}

function showEmptyState() {
  hideSetup();
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('pr-list').classList.add('hidden');
  document.getElementById('inbox-list').classList.add('hidden');
  document.getElementById('inbox-empty').classList.add('hidden');
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

