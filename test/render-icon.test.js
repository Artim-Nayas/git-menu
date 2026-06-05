import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrayIcon } from '../lib/render-icon.js';

test('renders a non-empty PNG buffer for the glyph (count 0)', () => {
  const buf = renderTrayIcon({ count: 0, dark: true });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 0);
});

test('a badge changes the rendered pixels vs no badge', () => {
  const none = renderTrayIcon({ count: 0, dark: true });
  const three = renderTrayIcon({ count: 3, dark: true });
  assert.ok(three.length > 0);
  assert.notDeepEqual(none, three);
});

test('counts over 9 and light theme render without throwing', () => {
  assert.ok(renderTrayIcon({ count: 42, dark: true }).length > 0); // "9+"
  assert.ok(renderTrayIcon({ count: 5, dark: false }).length > 0);
});

test('defaults are safe (no args)', () => {
  assert.ok(renderTrayIcon().length > 0);
});
