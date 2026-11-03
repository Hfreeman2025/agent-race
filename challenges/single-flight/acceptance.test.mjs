import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from './src.mjs';
test('concurrent misses share one load', async () => { let calls=0; let release; const gate=new Promise(r=>{release=r}); const get=createCache(async()=>{calls++;await gate;return 7}); const a=get('a');const b=get('a'); release(); assert.deepEqual(await Promise.all([a,b]),[7,7]);assert.equal(calls,1); });
test('rejection evicts pending value', async () => { let calls=0; const get=createCache(async()=>{if(++calls===1)throw new Error('transient');return 9});await assert.rejects(get('a')); assert.equal(await get('a'),9);assert.equal(calls,2); });
test('synchronous throws can retry', async () => { let calls=0;const get=createCache(()=>{if(++calls===1)throw new Error('sync');return 3});await assert.rejects(get('a'));assert.equal(await get('a'),3); });
test('different keys are independent', async () => { let calls=0;const get=createCache(async key=>{calls++;return key});assert.deepEqual(await Promise.all([get('a'),get('b')]),['a','b']);assert.equal(calls,2); });
test('falsy results are cached', async () => {let calls=0;const get=createCache(async()=>{calls++;return undefined});await get('a');await get('a');assert.equal(calls,1);});
