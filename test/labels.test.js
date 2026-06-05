import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelTextColor } from '../src/lib/labels.js';

test('dark backgrounds get white text', () => {
  assert.equal(labelTextColor('000000'), '#ffffff');
  assert.equal(labelTextColor('d73a4a'), '#ffffff'); // GitHub red "bug"
  assert.equal(labelTextColor('0e8a16'), '#ffffff'); // green
});
test('light backgrounds get black text', () => {
  assert.equal(labelTextColor('ffffff'), '#000000');
  assert.equal(labelTextColor('fbca04'), '#000000'); // yellow
});
test('accepts a leading # and bad input defaults to white', () => {
  assert.equal(labelTextColor('#ffffff'), '#000000');
  assert.equal(labelTextColor(''), '#ffffff');
  assert.equal(labelTextColor('xyz'), '#ffffff');
});
