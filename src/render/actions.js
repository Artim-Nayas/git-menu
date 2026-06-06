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
