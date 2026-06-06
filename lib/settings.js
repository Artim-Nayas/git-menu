// Settings schema + validating merge. Pure; shared by the main process (runtime)
// and the renderer (bundled by Vite). No I/O here.

export const SETTINGS_VERSION = 1;

const REFRESH_CHOICES = [1, 5, 15, 30];
const RANGE_CHOICES = ['3m', '6m', '1y'];
const HOTKEY_CHOICES = ['Alt+G', 'Alt+Shift+R', 'Control+Alt+G', 'CommandOrControl+Shift+G', 'None'];

export const SETTINGS_CHOICES = {
  refresh: REFRESH_CHOICES,
  range: RANGE_CHOICES,
  hotkey: HOTKEY_CHOICES,
};

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    launchAtLogin: false,
    showContributions: true,
    smartBadge: true,
    refreshMinutes: 5,
    hotkey: 'Alt+G',
    showEmptyRepos: true,
    tabs: { mine: true, reviews: true, inbox: true, actions: true },
    contrib: { expanded: false, range: '6m' },
  };
}

const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);

export function mergeSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const tabs = raw.tabs && typeof raw.tabs === 'object' ? raw.tabs : {};
  const contrib = raw.contrib && typeof raw.contrib === 'object' ? raw.contrib : {};
  const mergedTabs = {
    mine: bool(tabs.mine, d.tabs.mine),
    reviews: bool(tabs.reviews, d.tabs.reviews),
    inbox: bool(tabs.inbox, d.tabs.inbox),
    actions: bool(tabs.actions, d.tabs.actions),
  };
  // Invariant: at least one tab must be visible — otherwise the UI has no selectable
  // tab and orphans whatever was last rendered. Force "Mine" on if all are hidden.
  if (!mergedTabs.mine && !mergedTabs.reviews && !mergedTabs.inbox && !mergedTabs.actions) mergedTabs.mine = true;
  return {
    version: SETTINGS_VERSION,
    launchAtLogin: bool(raw.launchAtLogin, d.launchAtLogin),
    showContributions: bool(raw.showContributions, d.showContributions),
    smartBadge: bool(raw.smartBadge, d.smartBadge),
    refreshMinutes: REFRESH_CHOICES.includes(raw.refreshMinutes) ? raw.refreshMinutes : d.refreshMinutes,
    hotkey: HOTKEY_CHOICES.includes(raw.hotkey) ? raw.hotkey : d.hotkey,
    showEmptyRepos: bool(raw.showEmptyRepos, d.showEmptyRepos),
    tabs: mergedTabs,
    contrib: {
      expanded: bool(contrib.expanded, d.contrib.expanded),
      range: RANGE_CHOICES.includes(contrib.range) ? contrib.range : d.contrib.range,
    },
  };
}
