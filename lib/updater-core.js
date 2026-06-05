// Pure helpers for the self-updater. No I/O.

// Compare dotted numeric versions. Returns -1, 0, or 1.
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function isUpdateAvailable(current, latest) {
  if (!latest) return false;
  return compareVersions(latest, current) > 0;
}

// Reduce a GitHub "latest release" payload to what the updater needs.
export function parseLatestRelease(raw) {
  const tag = raw?.tag_name || '';
  const assets = raw?.assets || [];
  return {
    tag,
    version: tag.replace(/^v/, ''),
    notesUrl: raw?.html_url || '',
    hasDmg: assets.some((a) => /\.dmg$/i.test(a?.name || '')),
  };
}
