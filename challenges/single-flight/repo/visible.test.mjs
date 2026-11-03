import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from './src.mjs';
test('sequential callers reuse a result', async () => { let calls=0; const get=createCache(async()=>++calls); assert.equal(await get('x'),1); assert.equal(await get('x'),1); });
