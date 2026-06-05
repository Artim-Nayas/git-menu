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
