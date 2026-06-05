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
