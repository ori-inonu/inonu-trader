import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { attachObservedInventory } from './observation-integration';
import type { CoreSample, Inventory, SourceEnvelope } from './types';
import type { RpcReadSnapshot } from './rpc-read';

const address='0x'+'1'.repeat(40), token='0x'+'2'.repeat(40), identityKey=createHash('sha256').update('196:'+address).digest('hex');
const input={address,chainIndex:'196',revision:3,correlationId:'bound-cycle'};
function sample(): CoreSample {
 const data:Inventory={assets:[{chainIndex:'196',tokenContractAddress:token,symbol:'T',balance:'9007199254.740993',rawBalance:'9007199254740993',decimals:null,tokenPriceUsd:'2',valueUsd:null,isRiskToken:false}],coverage:{observedAssets:1,rawBalanceKnown:1,usdKnown:0,scope:'observed-tokens-only'},knownValueUsd:null,completeValueUsd:null,blockNumber:null};
 const balance:SourceEnvelope<Inventory>={status:'ready',source:'onchainos-rest-v6',mode:'unverified',endpoint:'/api/v6/dex/balance/all-token-balances-by-address',method:'GET',chainIndex:'196',correlationId:'bound-cycle',requestedAtMs:900,receivedAtMs:1000,sourceAtMs:null,expiresAtMs:61000,httpStatus:200,unit:'balance-unit-unknown',error:null,data};
 return {identityKey,chainIndex:'196',revision:3,correlationId:'bound-cycle',observedAtMs:1000,envelopes:{balance},capabilities:[],proposal:null,holdReasons:[]};
}
function rpc():RpcReadSnapshot {return {source:'evm-rpc-read',mode:'unverified',status:'ready',exercisedReal:false,financiallyQualified:false,executionEnabled:false,context:{identityKey,chainIndex:'196',revision:3,correlationId:'bound-cycle',blockNumber:'0x2a',blockHash:'0x'+'a'.repeat(64),observedAtMs:1100,expiresAtMs:61100},blockConsistent:true,nativeBalanceRaw:'0',nativeDecimals:18,nativeDecimalsMethod:'native-chain-metadata',tokens:[{token,rawBalance:'9007199254740993',decimals:6,decimalsMethod:'erc20-decimals',codeHash:'0x'+'b'.repeat(64),allowanceRaw:null,allowanceRequested:false,reasons:[]}],receipts:[],reasons:[],deployment:null,decoder:null,dependencies:['deployment-unqualified']};}

test('production observation seam derives exact USD separately and preserves provider fields',async()=>{
 const initial=sample();let reads=0;
 const result=await attachObservedInventory(initial,input,{read:async request=>{reads++;expect(request.tokens).toEqual([token]);return rpc()}},()=>1200);
 expect(reads).toBe(1);expect(result.valuation?.knownValueUsd).toBe('18014398509.481986');expect(result.valuation?.context?.blockNumber).toBe('42');
 expect(result.envelopes.balance?.data).toBe(initial.envelopes.balance?.data);expect((result.envelopes.balance!.data as Inventory).knownValueUsd).toBeNull();
 expect(result.rpcObservation?.exercisedReal).toBe(false);expect(result.valuation?.financiallyQualified).toBe(false);expect(result.valuation?.executionEnabled).toBe(false);
 expect(JSON.stringify(result)).not.toContain(address);
});
test('stale or mismatched context prevents identity-bearing RPC; divergence never becomes zero USD',async()=>{
 for(const mutate of [(s:CoreSample)=>{s.revision++},(s:CoreSample)=>{s.envelopes.balance!.expiresAtMs=1200},(s:CoreSample)=>{s.envelopes.balance!.correlationId='other'}]){
  const s=sample();mutate(s);let reads=0;const r=await attachObservedInventory(s,input,{read:async()=>{reads++;return rpc()}},()=>1200);expect(reads).toBe(0);expect(r.holdReasons).toContain('rpc-input-unqualified');
 }
 const divergent=rpc();divergent.tokens[0]!.rawBalance='0';const result=await attachObservedInventory(sample(),input,{read:async()=>divergent},()=>1200);expect(result.valuation?.knownValueUsd).toBeNull();expect(result.valuation?.coverage.unknownAssets).toBe(1);
});
test('revocation abort discards a late read before valuation or semantic publication',async()=>{
 const abort=new AbortController();const result=await attachObservedInventory(sample(),input,{read:async()=>{abort.abort();return rpc()}},()=>1200,abort.signal);
 expect(result.rpcObservation).toBeUndefined();expect(result.valuation).toBeUndefined();expect(result.holdReasons).toContain('rpc-observation-aborted');
});
