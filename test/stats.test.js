import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/lib/stats.js';

// Helper: build a calendar from an array of daily counts (oldest -> newest),
// chunked into weeks of 7.
function calendarFrom(counts, total) {
  const days = counts.map((c, i) => ({ contributionCount: c, date: `2026-01-${(i % 28) + 1}`, color: '' }));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push({ contributionDays: days.slice(i, i + 7) });
  return { totalContributions: total, weeks };
}

// 14 days; most recent day (today) is 0, the day before is 5.
const counts = [0, 2, 3, 0, 1, 4, 2,  3, 1, 0, 4, 2, 5, 0];
const cal = calendarFrom(counts, 27);

test('today is the most recent day', () => {
  assert.equal(computeStats(cal).today, 0);
});
test('thisYear comes from totalContributions', () => {
  assert.equal(computeStats(cal).thisYear, 27);
});
test('bestDay is the max single day', () => {
  assert.equal(computeStats(cal).bestDay, 5);
});
test('thisWeek sums the last 7 days', () => {
  assert.equal(computeStats(cal).thisWeek, 3 + 1 + 0 + 4 + 2 + 5 + 0); // 15
});
test('current streak skips an empty today, then counts back while > 0', () => {
  // today=0 (skipped), then 5,2,4 are >0, then a 0 breaks it -> 3
  assert.equal(computeStats(cal).currentStreak, 3);
});
test('recentAverage is the rounded mean of up to the last 30 days', () => {
  assert.equal(computeStats(cal).recentAverage, 2); // 27/14 = 1.93 -> 2
});
test('empty / missing calendar is all zeros', () => {
  const z = computeStats({ weeks: [] });
  assert.deepEqual(z, { today: 0, currentStreak: 0, thisWeek: 0, bestDay: 0, thisYear: 0, recentAverage: 0 });
  assert.doesNotThrow(() => computeStats(undefined));
});
