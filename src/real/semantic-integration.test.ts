import { expect, test } from 'bun:test';
import { createRealCore, sanitizeCoreSample } from './core';
import { createSemanticProofEvaluator, type SemanticProofInput } from './semantic-proof';
import { createOnchainosHttp } from '../onchainos/http';
import { envelope, makeClock, makeFakeFetch } from '../onchainos/fakes';
import type { NormalizedQuote, SourceEnvelope, SwapBuild } from './types';

const address = '0x' + '1'.repeat(40), from = '0x' + '2'.repeat(40), to = '0x' + '3'.repeat(40);
async function observed() {
 const clock = makeClock();
 const quote = { chainIndex: '196', swapMode: 'exactIn', fromTokenAmount: '9007199254740993', toTokenAmount: '2000000',
  fromToken: {tokenContractAddress:from,decimal:'18',tokenUnitPrice:'1',isHoneyPot:false,taxRate:'0'},
  toToken: {tokenContractAddress:to,decimal:'6',tokenUnitPrice:'1',isHoneyPot:false,taxRate:'0'}, dexRouterList:[] };
 const fake = makeFakeFetch(call => {
  if (call.path.endsWith('/supported/chain')) return {body:envelope([{chainIndex:'196'}])};
  if (call.path.endsWith('/all-token-balances-by-address')) return {body:envelope([{tokenAssets:[{chainIndex:'196',tokenContractAddress:from,rawBalance:'9007199254740994',balance:'0.009007199254740994',tokenPrice:'1',isRiskToken:false}]}])};
  if (call.path.endsWith('/aggregator/quote')) return {body:envelope([quote])};
  if (call.path.endsWith('/aggregator/swap')) return {body:envelope([{routerResult:quote,tx:{from:address,to:'0x'+'4'.repeat(40),data:'0xabcdef01'+'0'.repeat(64),value:'0',gas:'21000',gasPrice:'1',minReceiveAmount:'1990000',slippagePercent:'0.5'}}])};
  return {body:envelope([])};
 },clock);
 const http=createOnchainosHttp({fetch:fake.fetch,now:clock.now,sleep:clock.sleep,credentials:{apiKey:'fixture',secretKey:'fixture',passphrase:'fixture'},allowNetwork:true,requestsPerSecond:10,burst:10,maxRetries:0});
 const sample=await createRealCore({http,now:clock.now}).read({address,chainIndex:'196',revision:2,correlationId:'actual-core-output',pair:{fromToken:from,toToken:to,amount:'9007199254740993',slippagePercent:'0.5'}});
 expect(sample.proposal).not.toBeNull();
 const input:SemanticProofInput={address,proposal:sample.proposal!,quote:sample.envelopes.quote as SourceEnvelope<NormalizedQuote>,build:sample.envelopes.build as SourceEnvelope<SwapBuild>,expected:{identityKey:sample.identityKey,chainIndex:sample.chainIndex,revision:sample.revision,correlationId:sample.correlationId}};
 return {clock,sample,input};
}

test('actual core build reaches read-only semantic boundary before sanitized persistence', async()=>{
 const {clock,sample,input}=await observed();let reads=0;
 const result=await createSemanticProofEvaluator({now:clock.now,ports:{observe:async()=>{reads++;return null},decode:async()=>null}}).evaluate(input);
 expect(reads).toBe(1);expect(result.localReasons).toEqual(['read-only-proof-unavailable']);
 expect(result.executionEnabled).toBe(false);expect(result.exercisedReal).toBe(false);
 expect(JSON.stringify(result)).not.toContain(address);expect(JSON.stringify(result)).not.toContain(input.proposal.transaction.data);
 expect(sanitizeCoreSample(sample).envelopes.build?.data).toBeNull();expect(input.build.data).not.toBeNull();
});

test('actual build quote tampering, expiry and identity revision prevent wallet-bearing observation',async()=>{
 for (const change of ['build-quote','expired','revision'] as const) {
  const {clock,input}=await observed();let reads=0;
  if(change==='build-quote') input.build.data!.quote.toTokenAmount='2000001';
  if(change==='expired') clock.advance(16000);
  if(change==='revision') input.expected.revision++;
  const result=await createSemanticProofEvaluator({now:clock.now,ports:{observe:async()=>{reads++;return null},decode:async()=>null}}).evaluate(input);
  expect(reads).toBe(0);expect(result.localChecksPassed).toBe(false);expect(result.executionEnabled).toBe(false);
 }
});
