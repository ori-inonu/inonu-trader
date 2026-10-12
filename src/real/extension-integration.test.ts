import { expect, test } from 'bun:test';
import { attachRealExtensions } from './extension-integration';
import { createRealExtensions } from './extensions';
import { createOnchainosHttp } from '../onchainos/http';
import type { CoreSample } from './types';

const identity={correlationId:'extension-cycle',chainIndex:'196',revision:2};
const sample=():CoreSample=>({...identity,identityKey:'identity',observedAtMs:1000,envelopes:{},capabilities:[{id:'core',family:'signals',chainIndex:'196',endpoint:'/api/v6/dex/market/signal/list',source:'onchainos-rest-v6',documented:true,implemented:true,integrated:false,exercisedReal:false,financiallyQualified:false,status:'blocked',reason:'excluded',nextRequirement:'qualification'}],proposal:null,holdReasons:['core-hold']});
test('production optional seam defaults OFF, publishes endpoint states without requests or core hold pollution',async()=>{
 let requests=0;
 const http=createOnchainosHttp({allowNetwork:false,now:()=>1000,maxRetries:0,sleep:async()=>{},fetch:async()=>{requests++;throw new Error('Unexpected request')}});
 const output=await attachRealExtensions(sample(),identity,createRealExtensions({http,now:()=>1000}));
 expect(requests).toBe(0);expect(Object.keys(output.envelopes)).toEqual(['defiChains','defiDetail','leaderboard']);
 expect(output.envelopes.leaderboard?.data).toBeNull();expect(output.holdReasons).toEqual(['core-hold']);
 expect(output.capabilities.filter(row=>row.endpoint?.endsWith('signal/list')).length).toBe(1);
 expect(output.capabilities.filter(row=>row.endpoint?.endsWith('leaderboard/list'))[0]).toMatchObject({integrated:true,exercisedReal:false,financiallyQualified:false});
});
test('identity mismatch and late abort discard optional publication',async()=>{
 let reads=0;const adapter=createRealExtensions({http:createOnchainosHttp({allowNetwork:false,now:()=>1000,maxRetries:0,sleep:async()=>{},fetch:async()=>{throw new Error('Unexpected request')}}),now:()=>1000});
 const port={read:async(...args:Parameters<typeof adapter.read>)=>{reads++;return adapter.read(...args)}};
 const first=sample();expect(await attachRealExtensions(first,{...identity,revision:3},port)).toBe(first);expect(reads).toBe(0);
 const abort=new AbortController();const late={read:async(...args:Parameters<typeof adapter.read>)=>{const value=await adapter.read(...args);abort.abort();return value}};
 const second=sample();expect(await attachRealExtensions(second,identity,late,abort.signal)).toBe(second);
});
