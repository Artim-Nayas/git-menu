import { escapeHtml } from '../lib/escape.js';
import { SETTINGS_CHOICES } from '../../lib/settings.js';

let current = null;
let emit = null;

const HOTKEY_LABELS = {
  'Alt+G': '⌥G',
  'Alt+Shift+R': '⌥⇧R',
  'Control+Alt+G': '⌃⌥G',
  'CommandOrControl+Shift+G': '⌘⇧G',
  None: 'Off',
};

export function openSettings() {
  document.getElementById('settings-view').classList.remove('hidden');
}
export function closeSettings() {
  document.getElementById('settings-view').classList.add('hidden');
}

// settings: the current settings object. version: app version string.
// onChange(next): called with a full updated settings object on any change.
export function renderSettingsView(settings, version, onChange) {
  current = JSON.parse(JSON.stringify(settings));
  emit = onChange;
  const view = document.getElementById('settings-view');

  const refreshOpts = SETTINGS_CHOICES.refresh
    .map((m) => `<option value="${m}" ${settings.refreshMinutes === m ? 'selected' : ''}>${m} min</option>`)
    .join('');
  const hotkeyOpts = SETTINGS_CHOICES.hotkey
    .map((h) => `<option value="${escapeHtml(h)}" ${settings.hotkey === h ? 'selected' : ''}>${escapeHtml(HOTKEY_LABELS[h] || h)}</option>`)
    .join('');

  view.innerHTML = `
    <div class="settings-header">
      <button class="settings-back" type="button">‹ Settings</button>
    </div>
    <div class="settings-body">
      ${toggleRow('launchAtLogin', 'Launch at login', 'Start Git Menu on sign-in', settings.launchAtLogin)}
      ${toggleRow('showContributions', 'Contributions widget', 'Show the activity ring + heatmap', settings.showContributions)}
      ${toggleRow('smartBadge', 'Smart badge', 'Count items needing action', settings.smartBadge)}
      ${toggleRow('showEmptyRepos', 'Show all contributed repos', 'Include repos with no open PRs', settings.showEmptyRepos)}
      ${selectRow('refreshMinutes', 'Refresh every', refreshOpts)}
      ${selectRow('hotkey', 'Global hotkey', hotkeyOpts)}
      <div class="settings-row">
        <div class="settings-label">Tabs shown</div>
        <div class="settings-tabs">
          ${tabCheck('mine', 'Mine', settings.tabs.mine)}
          ${tabCheck('reviews', 'Reviews', settings.tabs.reviews)}
          ${tabCheck('inbox', 'Inbox', settings.tabs.inbox)}
        </div>
      </div>
      <div class="settings-about">Git Menu v${escapeHtml(version || '')}</div>
    </div>
  `;

  view.querySelector('.settings-back').addEventListener('click', closeSettings);

  view.querySelectorAll('.switch').forEach((cb) => {
    cb.addEventListener('change', () => {
      current[cb.dataset.key] = cb.checked;
      emit(JSON.parse(JSON.stringify(current)));
    });
  });

  view.querySelectorAll('.settings-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.key;
      current[key] = key === 'refreshMinutes' ? Number(sel.value) : sel.value;
      emit(JSON.parse(JSON.stringify(current)));
    });
  });

  view.querySelectorAll('[data-tab]').forEach((cb) => {
    cb.addEventListener('change', () => {
      current.tabs[cb.dataset.tab] = cb.checked;
      emit(JSON.parse(JSON.stringify(current)));
    });
  });
}

function toggleRow(key, title, sub, checked) {
  return `<label class="settings-row" for="set-${key}">
    <div class="settings-label">${escapeHtml(title)}<div class="settings-sub">${escapeHtml(sub)}</div></div>
    <input type="checkbox" class="switch" id="set-${key}" data-key="${key}" ${checked ? 'checked' : ''}>
  </label>`;
}

function selectRow(key, title, optionsHtml) {
  return `<div class="settings-row">
    <div class="settings-label">${escapeHtml(title)}</div>
    <select class="settings-select" data-key="${key}">${optionsHtml}</select>
  </div>`;
}

function tabCheck(key, label, checked) {
  return `<label class="tab-check"><input type="checkbox" data-tab="${key}" ${checked ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
}
