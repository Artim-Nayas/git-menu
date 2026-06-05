// Pick readable text color ('#000000' or '#ffffff') for a GitHub label background
// given as a 6-digit hex (with or without '#'). Uses YIQ brightness. Defaults to
// white text on unparseable input.
export function labelTextColor(hex) {
  const clean = String(hex || '').replace('#', '');
  // Require exactly 6 hex digits — guards length AND partial-parse (e.g. '12345g').
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#ffffff';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '#ffffff';
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#000000' : '#ffffff';
}
