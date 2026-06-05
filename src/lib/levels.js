// Map a day's contribution count to a GitHub-style intensity level 0..4.
export function contributionLevel(count) {
  if (!count || count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}
