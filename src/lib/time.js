// Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago", "3w ago",
// "2mo ago", "1y ago". `now` is injectable for testing. Returns '' on invalid input.
export function relativeTime(input, now = new Date()) {
  if (input == null) return '';
  const then = input instanceof Date ? input : new Date(input);
  // Clamp future timestamps (clock skew / server-ahead createdAt) to 0 -> "just now".
  const ms = Math.max(0, now.getTime() - then.getTime());
  if (Number.isNaN(ms)) return '';

  const sec = Math.round(ms / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.round(day / 7)}w ago`;
  if (day < 365) return `${Math.round(day / 30)}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}
