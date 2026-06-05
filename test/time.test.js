import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime } from '../src/lib/time.js';

const now = new Date('2026-06-05T12:00:00Z');
const ago = (ms) => new Date(now.getTime() - ms);
const SEC = 1000, MIN = 60 * SEC, HR = 60 * MIN, DAY = 24 * HR;

test('seconds -> just now', () => {
  assert.equal(relativeTime(ago(10 * SEC), now), 'just now');
});
test('minutes', () => {
  assert.equal(relativeTime(ago(5 * MIN), now), '5m ago');
});
test('hours', () => {
  assert.equal(relativeTime(ago(3 * HR), now), '3h ago');
});
test('days', () => {
  assert.equal(relativeTime(ago(2 * DAY), now), '2d ago');
});
test('weeks', () => {
  assert.equal(relativeTime(ago(20 * DAY), now), '3w ago');
});
test('months', () => {
  assert.equal(relativeTime(ago(60 * DAY), now), '2mo ago');
});
test('years', () => {
  assert.equal(relativeTime(ago(400 * DAY), now), '1y ago');
});
test('accepts an ISO string and bad input is empty', () => {
  assert.equal(relativeTime(ago(5 * MIN).toISOString(), now), '5m ago');
  assert.equal(relativeTime('not-a-date', now), '');
});
