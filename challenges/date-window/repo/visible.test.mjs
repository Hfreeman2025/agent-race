import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateRange } from './src.mjs';
test('starts at the requested day', () => assert.equal(dateRange('2024-01-01','2024-01-03')[0], '2024-01-01'));
