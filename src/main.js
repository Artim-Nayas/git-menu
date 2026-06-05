import './style.css';

let currentTab = 'my-prs';
let refreshInterval = null;
let collapsedOrgs = new Set();
let collapsedRepos = new Set();
let currentPRs = [];
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadData();
  startAutoRefresh();
});

function setupEventListeners() {
  const radios = document.querySelectorAll('input[name="tab-group"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentTab = e.target.value;
      loadData();
    });
  });

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderPRs(currentPRs);
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

function renderContributions(calendar) {
  const container = document.getElementById('contributions-container');
  if (!calendar) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="contributions-header">${calendar.totalContributions} contributions in the last year</div>
    <div id="contributions-graph" class="contributions-graph"></div>
  `;
  
  const graphContainer = document.getElementById('contributions-graph');

  // Render the last 15 weeks
  const weeks = calendar.weeks.slice(-15);
  
  // Calculate max contribution to scale the levels (or use absolute GitHub scale)
  // GitHub roughly uses: 0, 1-3, 4-6, 7-9, 10+
  function getLevel(count) {
    if (count === 0) return 0;
    if (count <= 3) return 1;
    if (count <= 6) return 2;
    if (count <= 9) return 3;
    return 4;
  }

  weeks.forEach(week => {
    const column = document.createElement('div');
    column.className = 'contrib-column';
    
    // Fill empty days at the beginning if necessary (e.g., first week)
    if (week.contributionDays.length < 7 && weeks.indexOf(week) === 0) {
        const emptyDays = 7 - week.contributionDays.length;
        for (let i=0; i<emptyDays; i++) {
            const block = document.createElement('div');
            block.className = 'contrib-block empty';
            column.appendChild(block);
        }
    }

    week.contributionDays.forEach(day => {
      const block = document.createElement('div');
      block.className = `contrib-block level-${getLevel(day.contributionCount)}`;
      block.title = `${day.contributionCount} contributions on ${day.date}`;
      column.appendChild(block);
    });
    graphContainer.appendChild(column);
  });
}

function renderPRs(prs) {
  const prList = document.getElementById('pr-list');
  const emptyState = document.getElementById('empty-state');
  const loading = document.getElementById('loading');

  loading.classList.add('hidden');
  hideSetup();

  // Update tray title with un-filtered total count
  if (window.api.updateTrayCount) {
    window.api.updateTrayCount(prs ? prs.length : 0);
  }

  // Filter PRs based on search query
  const filteredPrs = prs.filter(pr => {
    if (!searchQuery) return true;
    return pr.title.toLowerCase().includes(searchQuery) || 
           pr.repository.nameWithOwner.toLowerCase().includes(searchQuery) ||
           pr.author.login.toLowerCase().includes(searchQuery);
  });

  if (!filteredPrs || filteredPrs.length === 0) {
    prList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  prList.innerHTML = '';

  // Group PRs: Org -> Repo -> PRs
  const grouped = {};
  filteredPrs.forEach(pr => {
    const parts = pr.repository.nameWithOwner.split('/');
    const orgName = parts[0];
    const repoName = parts[1];
    
    if (!grouped[orgName]) grouped[orgName] = {};
    if (!grouped[orgName][repoName]) grouped[orgName][repoName] = [];
    
    grouped[orgName][repoName].push(pr);
  });

  for (const [orgName, repos] of Object.entries(grouped)) {
    // Check if org has any repos left after filter
    if (Object.keys(repos).length === 0) continue;

    const orgSection = document.createElement('div');
    orgSection.className = 'org-section';
    if (collapsedOrgs.has(orgName)) {
      orgSection.classList.add('collapsed');
    }

    // Org Total PRs
    let orgTotalPrs = 0;
    Object.values(repos).forEach(repoPrs => { orgTotalPrs += repoPrs.length; });

    const orgHeader = document.createElement('div');
    orgHeader.className = 'org-header';
    orgHeader.innerHTML = `
      <svg class="chevron org-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <span class="org-name">${escapeHtml(orgName)}</span>
      <span class="repo-count">${orgTotalPrs}</span>
    `;

    orgHeader.addEventListener('click', () => {
      const isCollapsed = orgSection.classList.toggle('collapsed');
      if (isCollapsed) {
        collapsedOrgs.add(orgName);
      } else {
        collapsedOrgs.delete(orgName);
      }
    });

    const orgContent = document.createElement('div');
    orgContent.className = 'org-content';

    for (const [repoName, repoPrs] of Object.entries(repos)) {
      const repoKey = `${orgName}/${repoName}`;
      const repoSection = document.createElement('div');
      repoSection.className = 'repo-section';
      
      // Default repos to collapsed unless they are the only repo
      if (!collapsedRepos.has(repoKey) && Object.keys(repos).length > 1) {
        collapsedRepos.add(repoKey);
      }

      if (collapsedRepos.has(repoKey) && !searchQuery) {
        repoSection.classList.add('collapsed');
      } else if (searchQuery) {
        repoSection.classList.remove('collapsed');
      }

      const repoHeader = document.createElement('div');
      repoHeader.className = 'repo-header';
      repoHeader.innerHTML = `
        <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <span class="repo-name">${escapeHtml(repoName)}</span>
        <span class="repo-count">${repoPrs.length}</span>
      `;

      repoHeader.addEventListener('click', () => {
        const isCollapsed = repoSection.classList.toggle('collapsed');
        if (isCollapsed) {
          collapsedRepos.add(repoKey);
        } else {
          collapsedRepos.delete(repoKey);
        }
      });

      const repoContent = document.createElement('div');
      repoContent.className = 'repo-content';

      repoPrs.forEach(pr => {
        const prElement = document.createElement('div');
        prElement.className = 'pr-item';
        if (pr.isDraft) {
          prElement.classList.add('is-draft');
        }
        
        const date = new Date(pr.createdAt);
        const timeString = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const prIconSvg = pr.isDraft ? 
          `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M2.5 1.75a.25.25 0 01.25-.25h8.5a.25.25 0 01.25.25v12.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25V1.75zM2.75 0A1.75 1.75 0 001 1.75v12.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0013 14.25V1.75A1.75 1.75 0 0011.25 0h-8.5zM4 4h5v1.5H4V4zm0 3h5v1.5H4V7zm0 3h3v1.5H4V10z"></path></svg>` :
          `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"></path></svg>`;

        let ciStatusHtml = '';
        const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
        if (rollup === 'SUCCESS') {
          ciStatusHtml = `<span class="ci-status ci-success" title="Checks passed">●</span>`;
        } else if (rollup === 'FAILURE' || rollup === 'ERROR') {
          ciStatusHtml = `<span class="ci-status ci-failure" title="Checks failed">●</span>`;
        } else if (rollup === 'PENDING') {
          ciStatusHtml = `<span class="ci-status ci-pending" title="Checks pending">●</span>`;
        }

        let reviewHtml = '';
        if (pr.reviewDecision === 'APPROVED') {
          reviewHtml = `<span class="review-badge review-approved" title="Approved">✅</span>`;
        } else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
          reviewHtml = `<span class="review-badge review-changes" title="Changes Requested">❌</span>`;
        } else if (pr.reviewDecision === 'REVIEW_REQUIRED') {
          reviewHtml = `<span class="review-badge review-required" title="Review Required">👀</span>`;
        }

        prElement.innerHTML = `
          <div class="pr-icon">${prIconSvg}</div>
          <div class="pr-details">
            <div class="pr-title" title="${escapeHtml(pr.title)}">
              <span class="pr-number">#${pr.number}</span> ${escapeHtml(pr.title)}
            </div>
            <div class="pr-meta">
              <span class="pr-author">@${escapeHtml(pr.author.login)}</span>
              <span class="pr-time">${timeString}</span>
              ${ciStatusHtml}
              ${reviewHtml}
            </div>
          </div>
          <div class="pr-actions">
            <button class="copy-btn" title="Copy PR URL" data-url="${pr.url}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        `;

        // Handle URL copy
        const copyBtn = prElement.querySelector('.copy-btn');
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation(); // prevent opening PR
          try {
            await navigator.clipboard.writeText(pr.url);
            copyBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ci-success">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>`;
            setTimeout(() => {
              copyBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>`;
            }, 1500);
          } catch (err) {
            console.error('Failed to copy', err);
          }
        });

        // Handle open PR
        prElement.addEventListener('click', () => {
          window.api.openExternal(pr.url);
        });

        repoContent.appendChild(prElement);
      });

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

function showLoading() {
  hideSetup();
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('pr-list').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
}

function showEmptyState() {
  hideSetup();
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('pr-list').classList.add('hidden');
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

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}
