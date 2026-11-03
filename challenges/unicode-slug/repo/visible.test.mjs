import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './src.mjs';
test('ordinary words', () => assert.equal(slugify('Hello World'), 'hello-world'));
