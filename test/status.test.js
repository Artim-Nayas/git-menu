import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusMeta } from '../src/lib/status.js';

test('statusMeta returns a class + symbol per state', () => {
  assert.equal(statusMeta('success').className, 'st-success');
  assert.equal(statusMeta('failure').className, 'st-failure');
  assert.equal(statusMeta('in_progress').className, 'st-running');
  assert.equal(statusMeta('queued').className, 'st-queued');
  assert.equal(statusMeta('cancelled').className, 'st-muted');
  assert.equal(statusMeta('skipped').className, 'st-muted');
  assert.equal(statusMeta('neutral').className, 'st-muted');
  assert.equal(statusMeta('anything-else').className, 'st-muted');
  assert.ok(statusMeta('success').symbol);
  assert.ok(statusMeta('success').label);
});
