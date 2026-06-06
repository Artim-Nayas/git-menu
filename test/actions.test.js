import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runState, normalizeRun, normalizeJobs, normalizeChecks } from '../lib/actions.js';

test('runState maps status + conclusion', () => {
  assert.equal(runState('queued', null), 'queued');
  assert.equal(runState('waiting', null), 'queued');
  assert.equal(runState('in_progress', null), 'in_progress');
  assert.equal(runState('completed', 'success'), 'success');
  assert.equal(runState('completed', 'failure'), 'failure');
  assert.equal(runState('completed', 'timed_out'), 'failure');
  assert.equal(runState('completed', 'startup_failure'), 'failure');
  assert.equal(runState('completed', 'cancelled'), 'cancelled');
  assert.equal(runState('completed', 'skipped'), 'skipped');
  assert.equal(runState('completed', 'neutral'), 'neutral');
  assert.equal(runState('COMPLETED', 'SUCCESS'), 'success'); // case-insensitive
});

test('normalizeRun reduces a runs payload', () => {
  const raw = {
    id: 7, name: 'CI', head_branch: 'main', event: 'push', status: 'in_progress',
    conclusion: null, html_url: 'https://x/run/7', run_number: 42, updated_at: '2026-06-06T01:00:00Z',
    display_title: 'fix: thing',
  };
  assert.deepEqual(normalizeRun(raw, 'acme/web'), {
    id: 7, repo: 'acme/web', name: 'CI', state: 'in_progress', branch: 'main', event: 'push',
    url: 'https://x/run/7', runNumber: 42, updatedAt: '2026-06-06T01:00:00Z', title: 'fix: thing',
  });
});

test('normalizeJobs flattens jobs + steps', () => {
  const raw = { jobs: [{
    id: 1, name: 'build', status: 'completed', conclusion: 'failure', html_url: 'https://x/job/1',
    steps: [{ name: 'checkout', status: 'completed', conclusion: 'success', number: 1 },
            { name: 'test', status: 'in_progress', conclusion: null, number: 2 }],
  }] };
  assert.deepEqual(normalizeJobs(raw), [{
    id: 1, name: 'build', state: 'failure', url: 'https://x/job/1',
    steps: [{ name: 'checkout', state: 'success', number: 1 }, { name: 'test', state: 'in_progress', number: 2 }],
  }]);
});

test('normalizeChecks handles CheckRun and StatusContext', () => {
  const ctx = [
    { __typename: 'CheckRun', name: 'lint', status: 'IN_PROGRESS', conclusion: null, detailsUrl: 'https://x/c1' },
    { __typename: 'StatusContext', context: 'ci/legacy', state: 'FAILURE', targetUrl: 'https://x/c2' },
  ];
  assert.deepEqual(normalizeChecks(ctx), [
    { name: 'lint', state: 'in_progress', url: 'https://x/c1' },
    { name: 'ci/legacy', state: 'failure', url: 'https://x/c2' },
  ]);
});

test('helpers tolerate missing input', () => {
  assert.equal(runState(undefined, undefined), 'queued');
  assert.deepEqual(normalizeJobs(undefined), []);
  assert.deepEqual(normalizeChecks(undefined), []);
  assert.doesNotThrow(() => normalizeRun({}, ''));
});
