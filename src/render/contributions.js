import { computeStats } from '../lib/stats.js';
import { contributionLevel } from '../lib/levels.js';

const RANGE_WEEKS = { '3m': 13, '6m': 26, '1y': 53 };

// View state (persisted to settings in a later phase).
let expanded = false;
let range = '6m';
let lastCalendar = null;

export function renderContributions(calendar) {
  lastCalendar = calendar;
  const container = document.getElementById('contributions-container');
  if (!calendar) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const s = computeStats(calendar);
  const goal = Math.max(1, s.recentAverage * 2);
  const pct = Math.min(100, Math.round((s.today / goal) * 100));
  const streakUnit = s.currentStreak === 1 ? 'day' : 'days';

  container.innerHTML = `
    <div class="contrib-card">
      <div class="contrib-top">
        <div class="contrib-ring" style="background: conic-gradient(var(--ci-success) ${pct}%, var(--seg-bg) 0);">
          <div class="contrib-ring-inner"><span class="v">${s.today}</span><span class="k">today</span></div>
        </div>
        <div class="contrib-tallies">
          <div class="tally"><span>Current streak</span><span class="tally-fire">🔥 ${s.currentStreak} ${streakUnit}</span></div>
          <div class="tally"><span>This week</span><span>${s.thisWeek}</span></div>
          <div class="tally"><span>Best day</span><span>${s.bestDay}</span></div>
          <div class="tally"><span>This year</span><span>${s.thisYear}</span></div>
        </div>
      </div>
      <div class="contrib-disclosure">
        <button class="contrib-toggle" type="button">
          <svg class="chevron ${expanded ? 'open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          Heatmap
        </button>
        <select class="contrib-range" aria-label="Heatmap range">
          <option value="3m" ${range === '3m' ? 'selected' : ''}>Last 3 months</option>
          <option value="6m" ${range === '6m' ? 'selected' : ''}>Last 6 months</option>
          <option value="1y" ${range === '1y' ? 'selected' : ''}>Last 1 year</option>
        </select>
      </div>
      <div class="contrib-heatmap ${expanded ? '' : 'hidden'}">
        ${heatmapHtml(calendar)}
      </div>
    </div>
  `;

  container.querySelector('.contrib-toggle').addEventListener('click', () => {
    expanded = !expanded;
    renderContributions(lastCalendar);
  });
  container.querySelector('.contrib-range').addEventListener('change', (e) => {
    range = e.target.value;
    expanded = true; // changing the range implies you want to see it
    renderContributions(lastCalendar);
  });
}

function heatmapHtml(calendar) {
  const weeksToShow = RANGE_WEEKS[range] || 26;
  const weeks = (calendar.weeks || []).slice(-weeksToShow);

  const columns = weeks
    .map((week) => {
      const blocks = (week.contributionDays || [])
        .map((d) => {
          const lvl = contributionLevel(d.contributionCount);
          return `<div class="contrib-block level-${lvl}" title="${d.contributionCount} on ${d.date}"></div>`;
        })
        .join('');
      return `<div class="contrib-column">${blocks}</div>`;
    })
    .join('');

  const legend = `<div class="contrib-legend">Less ${[0, 1, 2, 3, 4]
    .map((l) => `<span class="contrib-block level-${l}"></span>`)
    .join('')} More</div>`;

  return `${monthLabels(weeks)}<div class="contrib-grid">${columns}</div>${legend}`;
}

function monthLabels(weeks) {
  // A label appears on the first column of each new month; it overflows into the
  // following (empty) columns the way GitHub's calendar does.
  let last = '';
  const spans = weeks
    .map((week) => {
      const first = week.contributionDays?.[0]?.date;
      if (!first) return '<span></span>';
      const m = new Date(first).toLocaleString(undefined, { month: 'short' });
      if (m !== last) {
        last = m;
        return `<span>${m}</span>`;
      }
      return '<span></span>';
    })
    .join('');
  return `<div class="contrib-months">${spans}</div>`;
}
