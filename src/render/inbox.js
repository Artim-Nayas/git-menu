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
  renderInbox(null, null); // reuse cached items/search; re-renders dots + badge
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
