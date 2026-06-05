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
