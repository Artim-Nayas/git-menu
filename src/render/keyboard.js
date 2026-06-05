// Keyboard navigation for the popover. One document-level keydown listener that
// operates on whichever list is currently visible (PR list or inbox).
//
// j / ArrowDown  move down      k / ArrowUp  move up
// Enter          open selected   c           copy selected PR url
// / or Cmd/Ctrl+F focus search    Esc         clear search, else hide window
// 1 / 2 / 3      switch tab (Mine / Reviews / Inbox)

const SELECTABLE = '.pr-item:not(.pr-empty), .inbox-item';
let selectedIndex = -1;

export function setupKeyboardNav() {
  document.addEventListener('keydown', onKeyDown);
}

// Rows that are actually on screen (collapsed/hidden rows have no offsetParent).
function visibleRows() {
  return Array.from(document.querySelectorAll(SELECTABLE)).filter((el) => el.offsetParent !== null);
}

function highlight(rows) {
  // Clear any stale highlight (e.g. on a row hidden by a re-render) before re-applying.
  document.querySelectorAll('.kb-selected').forEach((el) => el.classList.remove('kb-selected'));
  const el = rows[selectedIndex];
  if (el) {
    el.classList.add('kb-selected');
    el.scrollIntoView({ block: 'nearest' });
  }
}

function move(delta) {
  const rows = visibleRows();
  if (rows.length === 0) {
    selectedIndex = -1;
    return;
  }
  const start = selectedIndex < 0 ? -1 : selectedIndex;
  selectedIndex = Math.max(0, Math.min(rows.length - 1, start + delta));
  highlight(rows);
}

function currentRow() {
  return visibleRows()[selectedIndex] || null;
}

function focusSearch() {
  const s = document.getElementById('search-input');
  if (s) s.focus();
}

function selectTab(i) {
  const ids = ['tab-my-prs', 'tab-review', 'tab-inbox'];
  const input = document.getElementById(ids[i]);
  const label = document.querySelector(`label[for="${ids[i]}"]`);
  if (!input || (label && label.style.display === 'none')) return; // skip hidden tabs
  if (!input.checked) {
    input.checked = true;
    input.dispatchEvent(new Event('change'));
  }
}

function onKeyDown(e) {
  // Cmd/Ctrl+F focuses search from anywhere.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    focusSearch();
    return;
  }

  // Esc: clear a non-empty search, otherwise hide the window.
  if (e.key === 'Escape') {
    e.preventDefault();
    const s = document.getElementById('search-input');
    if (s && s.value) {
      s.value = '';
      s.dispatchEvent(new Event('input'));
      s.blur();
    } else {
      if (s) s.blur();
      if (window.api?.hideWindow) window.api.hideWindow();
    }
    return;
  }

  // Don't hijack keys while typing in a field (Esc/Cmd+F handled above).
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      move(1);
      break;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      move(-1);
      break;
    case 'Enter': {
      const el = currentRow();
      if (el) {
        e.preventDefault();
        el.click();
      }
      break;
    }
    case 'c': {
      const el = currentRow();
      const btn = el && el.querySelector('.copy-btn');
      if (btn) {
        e.preventDefault();
        btn.click();
      }
      break;
    }
    case '/':
      e.preventDefault();
      focusSearch();
      break;
    case '1':
      e.preventDefault();
      selectTab(0);
      break;
    case '2':
      e.preventDefault();
      selectTab(1);
      break;
    case '3':
      e.preventDefault();
      selectTab(2);
      break;
    default:
      break;
  }
}
