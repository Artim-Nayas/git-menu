// Derive at-a-glance stats from a GitHub contributions calendar.
// calendar: { totalContributions, weeks: [{ contributionDays: [{ contributionCount, date }] }] }
export function computeStats(calendar) {
  const days = [];
  (calendar?.weeks || []).forEach((w) => (w.contributionDays || []).forEach((d) => days.push(d)));
  const counts = days.map((d) => d.contributionCount || 0);
  const n = counts.length;

  const today = n ? counts[n - 1] : 0;
  const thisYear = calendar?.totalContributions ?? counts.reduce((a, b) => a + b, 0);
  const bestDay = counts.reduce((m, c) => Math.max(m, c), 0);
  const thisWeek = counts.slice(-7).reduce((a, b) => a + b, 0);

  // Current streak: if today has no contributions yet, don't let it break the streak;
  // then count consecutive days backward while > 0.
  let currentStreak = 0;
  let i = n - 1;
  if (i >= 0 && counts[i] === 0) i -= 1;
  for (; i >= 0; i -= 1) {
    if (counts[i] > 0) currentStreak += 1;
    else break;
  }

  const recent = counts.slice(-30);
  const recentAverage = recent.length
    ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
    : 0;

  return { today, currentStreak, thisWeek, bestDay, thisYear, recentAverage };
}
