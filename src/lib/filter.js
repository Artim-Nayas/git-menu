// Pure predicates for the PR list. No DOM access.

export function matchesSearch(pr, query) {
  if (!query) return true;
  const q = String(query).toLowerCase();
  return (pr.title || '').toLowerCase().includes(q)
    || (pr.repository?.nameWithOwner || '').toLowerCase().includes(q)
    || (pr.author?.login || '').toLowerCase().includes(q);
}

export function matchesStatusFilter(pr, filterKey) {
  if (!filterKey || filterKey === 'all') return true;
  const ci = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  switch (filterKey) {
    case 'failing': return ci === 'FAILURE' || ci === 'ERROR';
    case 'review': return pr.reviewDecision === 'REVIEW_REQUIRED';
    case 'approved': return pr.reviewDecision === 'APPROVED';
    case 'draft': return !!pr.isDraft;
    default: return true;
  }
}
