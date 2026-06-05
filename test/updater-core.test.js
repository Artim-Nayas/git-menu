import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isUpdateAvailable, parseLatestRelease } from '../lib/updater-core.js';

test('compareVersions orders dotted numeric versions', () => {
  assert.equal(compareVersions('0.1.0', '0.1.1'), -1);
  assert.equal(compareVersions('0.1.1', '0.1.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1); // numeric, not lexical
  assert.equal(compareVersions('0.1', '0.1.0'), 0);     // missing segments = 0
});

test('isUpdateAvailable is true only for a strictly newer latest', () => {
  assert.equal(isUpdateAvailable('0.1.0', '0.1.1'), true);
  assert.equal(isUpdateAvailable('0.1.1', '0.1.1'), false);
  assert.equal(isUpdateAvailable('0.2.0', '0.1.9'), false);
  assert.equal(isUpdateAvailable('0.1.0', ''), false);  // no latest
});

test('parseLatestRelease reduces the GitHub payload', () => {
  const raw = {
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/Artim-Nayas/git-menu/releases/tag/v0.2.0',
    assets: [
      { name: 'Git-Menu-0.2.0-arm64.dmg' },
      { name: 'Git-Menu-0.2.0-arm64-mac.zip' },
      { name: 'latest-mac.yml' },
    ],
  };
  assert.deepEqual(parseLatestRelease(raw), {
    tag: 'v0.2.0',
    version: '0.2.0',
    notesUrl: 'https://github.com/Artim-Nayas/git-menu/releases/tag/v0.2.0',
    hasDmg: true,
  });
});

test('parseLatestRelease tolerates a missing/odd payload', () => {
  assert.deepEqual(parseLatestRelease({}), { tag: '', version: '', notesUrl: '', hasDmg: false });
  assert.doesNotThrow(() => parseLatestRelease(undefined));
});
