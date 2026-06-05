// Pure classification of a failed `gh` invocation into an actionable kind.
// kinds: 'no-gh' | 'no-auth' | 'network' | 'api'
export function classifyGhFailure({ code, stderr } = {}) {
  const s = String(stderr || '').toLowerCase();

  if (code === 'ENOENT') return 'no-gh';

  if (
    s.includes('not logged') ||
    s.includes('gh auth login') ||
    s.includes('authentication') ||
    s.includes('requires authentication') ||
    s.includes('bad credentials') ||
    s.includes('http 401')
  ) return 'no-auth';

  if (
    s.includes('dial tcp') ||
    s.includes('could not resolve host') ||
    s.includes('no such host') ||
    s.includes('network is unreachable') ||
    s.includes('connection refused') ||
    // bare 'timeout' is intentionally NOT matched: server-side API errors can
    // contain it (e.g. "gateway timeout"); only the connectivity-specific
    // 'i/o timeout' counts as a network failure.
    s.includes('i/o timeout')
  ) return 'network';

  return 'api';
}
