import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGhFailure } from '../lib/gh-errors.js';

test('ENOENT means gh is not installed', () => {
  assert.equal(classifyGhFailure({ code: 'ENOENT', stderr: '' }), 'no-gh');
  // ENOENT takes precedence over any auth-ish text in stderr.
  assert.equal(classifyGhFailure({ code: 'ENOENT', stderr: 'requires authentication' }), 'no-gh');
});

test('a generic server timeout is not misread as a network failure', () => {
  assert.equal(classifyGhFailure({ code: 1, stderr: 'HTTP 504: Gateway Timeout' }), 'api');
});

test('auth phrasing means not signed in', () => {
  assert.equal(classifyGhFailure({ code: 1, stderr: 'gh auth login to authenticate' }), 'no-auth');
  assert.equal(classifyGhFailure({ code: 1, stderr: 'You are not logged into any GitHub hosts' }), 'no-auth');
  assert.equal(classifyGhFailure({ code: 1, stderr: 'HTTP 401: Bad credentials' }), 'no-auth');
});

test('connectivity phrasing means network', () => {
  assert.equal(classifyGhFailure({ code: 1, stderr: 'dial tcp: lookup api.github.com: no such host' }), 'network');
  assert.equal(classifyGhFailure({ code: 1, stderr: 'could not resolve host' }), 'network');
});

test('anything else is a generic api failure', () => {
  assert.equal(classifyGhFailure({ code: 1, stderr: 'GraphQL: Field "foo" doesn\'t exist' }), 'api');
  assert.equal(classifyGhFailure({ code: 1, stderr: '' }), 'api');
});

test('missing/odd input does not throw', () => {
  assert.equal(classifyGhFailure({}), 'api');
  assert.equal(classifyGhFailure({ code: 'ENOENT' }), 'no-gh');
});
