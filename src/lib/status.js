// Pure: map a normalized CI state to display metadata. No DOM.
export function statusMeta(state) {
  switch (state) {
    case 'success': return { symbol: '●', className: 'st-success', label: 'Passed' };
    case 'failure': return { symbol: '●', className: 'st-failure', label: 'Failed' };
    case 'in_progress': return { symbol: '◐', className: 'st-running', label: 'Running' };
    case 'queued': return { symbol: '○', className: 'st-queued', label: 'Queued' };
    case 'cancelled': return { symbol: '⊘', className: 'st-muted', label: 'Cancelled' };
    case 'skipped': return { symbol: '⊝', className: 'st-muted', label: 'Skipped' };
    default: return { symbol: '○', className: 'st-muted', label: 'Unknown' };
  }
}
