import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, matchesStatusFilter } from '../src/lib/filter.js';

const pr = {
  title: 'Fix flaky checkout test',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  repository: { nameWithOwner: 'acme/web' },
  author: { login: 'dana' },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } } ] },
};

test('matchesSearch: empty query matches everything', () => {
  assert.equal(matchesSearch(pr, ''), true);
});
test('matchesSearch: matches title, repo, author; case-insensitive', () => {
  assert.equal(matchesSearch(pr, 'flaky'), true);
  assert.equal(matchesSearch(pr, 'acme/web'), true);
  assert.equal(matchesSearch(pr, 'DANA'), true);
  assert.equal(matchesSearch(pr, 'nope'), false);
});
test('matchesStatusFilter: all passes', () => {
  assert.equal(matchesStatusFilter(pr, 'all'), true);
  assert.equal(matchesStatusFilter(pr, ''), true);
});
test('matchesStatusFilter: failing / review / approved / draft', () => {
  assert.equal(matchesStatusFilter(pr, 'failing'), true);
  assert.equal(matchesStatusFilter(pr, 'review'), true);
  assert.equal(matchesStatusFilter(pr, 'approved'), false);
  assert.equal(matchesStatusFilter(pr, 'draft'), false);
  assert.equal(matchesStatusFilter({ ...pr, isDraft: true }, 'draft'), true);
  assert.equal(matchesStatusFilter({ ...pr, reviewDecision: 'APPROVED' }, 'approved'), true);
});
test('missing fields do not throw', () => {
  assert.equal(matchesSearch({}, 'x'), false);
  assert.equal(matchesStatusFilter({}, 'failing'), false);
});
