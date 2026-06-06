import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, mergeSettings, SETTINGS_CHOICES } from '../lib/settings.js';

test('defaultSettings has the documented shape', () => {
  const d = defaultSettings();
  assert.equal(d.version, 1);
  assert.equal(d.launchAtLogin, false);
  assert.equal(d.showContributions, true);
  assert.equal(d.smartBadge, true);
  assert.equal(d.refreshMinutes, 5);
  assert.equal(d.hotkey, 'Alt+G');
  assert.equal(d.showEmptyRepos, true);
  assert.deepEqual(d.tabs, { mine: true, reviews: true, inbox: true, actions: true });
  assert.deepEqual(d.contrib, { expanded: false, range: '6m' });
});

test('mergeSettings returns defaults for empty/garbage input', () => {
  assert.deepEqual(mergeSettings(undefined), defaultSettings());
  assert.deepEqual(mergeSettings(null), defaultSettings());
  assert.deepEqual(mergeSettings('nope'), defaultSettings());
});

test('mergeSettings keeps valid values and rejects invalid ones', () => {
  const merged = mergeSettings({
    launchAtLogin: true,
    refreshMinutes: 15,
    hotkey: 'None',
    showEmptyRepos: false,
    tabs: { mine: false },
    contrib: { expanded: true, range: '1y' },
    smartBadge: 'yes',          // invalid -> default true
    refreshMinutes_typo: 7,
  });
  assert.equal(merged.launchAtLogin, true);
  assert.equal(merged.refreshMinutes, 15);
  assert.equal(merged.hotkey, 'None');
  assert.equal(merged.showEmptyRepos, false);
  assert.equal(merged.tabs.mine, false);
  assert.equal(merged.tabs.reviews, true);   // untouched -> default
  assert.equal(merged.contrib.expanded, true);
  assert.equal(merged.contrib.range, '1y');
  assert.equal(merged.smartBadge, true);      // invalid coerced to default
});

test('mergeSettings rejects out-of-set refresh/hotkey/range', () => {
  const m = mergeSettings({ refreshMinutes: 7, hotkey: 'Bogus', contrib: { range: '5y' } });
  assert.equal(m.refreshMinutes, 5);
  assert.equal(m.hotkey, 'Alt+G');
  assert.equal(m.contrib.range, '6m');
});

test('mergeSettings forces Mine visible when all tabs are hidden', () => {
  const m = mergeSettings({ tabs: { mine: false, reviews: false, inbox: false, actions: false } });
  assert.equal(m.tabs.mine, true);
  assert.equal(m.tabs.reviews, false);
  assert.equal(m.tabs.inbox, false);
  assert.equal(m.tabs.actions, false);
});

test('SETTINGS_CHOICES exposes the allowed option lists', () => {
  assert.deepEqual(SETTINGS_CHOICES.refresh, [1, 5, 15, 30]);
  assert.deepEqual(SETTINGS_CHOICES.range, ['3m', '6m', '1y']);
  assert.ok(SETTINGS_CHOICES.hotkey.includes('Alt+G'));
  assert.ok(SETTINGS_CHOICES.hotkey.includes('None'));
});
