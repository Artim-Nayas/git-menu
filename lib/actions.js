// Pure helpers for GitHub Actions data. No I/O.

export function runState(status, conclusion) {
  const s = String(status || '').toLowerCase();
  if (s !== 'completed') return s === 'in_progress' ? 'in_progress' : 'queued';
  const c = String(conclusion || '').toLowerCase();
  if (c === 'success') return 'success';
  if (c === 'cancelled') return 'cancelled';
  if (c === 'skipped') return 'skipped';
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(c)) return 'failure';
  return 'neutral';
}

export function normalizeRun(raw, repo) {
  return {
    id: raw?.id,
    repo: repo || raw?.repository?.full_name || '',
    name: raw?.name || raw?.display_title || 'workflow',
    state: runState(raw?.status, raw?.conclusion),
    branch: raw?.head_branch || '',
    event: raw?.event || '',
    url: raw?.html_url || '',
    runNumber: raw?.run_number ?? null,
    updatedAt: raw?.updated_at || raw?.created_at || null,
    title: raw?.display_title || '',
  };
}

export function normalizeJobs(raw) {
  return (raw?.jobs || []).map((j) => ({
    id: j?.id,
    name: j?.name || 'job',
    state: runState(j?.status, j?.conclusion),
    url: j?.html_url || '',
    steps: (j?.steps || []).map((st) => ({
      name: st?.name || 'step',
      state: runState(st?.status, st?.conclusion),
      number: st?.number ?? 0,
    })),
  }));
}

// GraphQL statusCheckRollup contexts (CheckRun + StatusContext) -> [{name, state, url}]
export function normalizeChecks(contexts) {
  const fromStatus = { success: 'success', failure: 'failure', error: 'failure', pending: 'in_progress', expected: 'queued' };
  return (contexts || []).map((c) => {
    if (c?.__typename === 'CheckRun') {
      return { name: c.name || 'check', state: runState(c.status, c.conclusion), url: c.detailsUrl || '' };
    }
    const st = String(c?.state || '').toLowerCase();
    return { name: c?.context || 'status', state: fromStatus[st] || 'neutral', url: c?.targetUrl || '' };
  });
}
