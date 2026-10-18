import { createHash } from 'node:crypto';
import { attachCoreSemanticProof } from './semantic-integration';
import type { SemanticSnapshot } from './semantic-proof';
import type { RpcReadInput, RpcReadSnapshot } from './rpc-read';
import { deriveObservedValuation, type ValuationObservation } from './valuation';
import type { CoreReadInput, CoreSample, Inventory, SourceEnvelope } from './types';

const NATIVE='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export interface RpcObservationPort { read(input:RpcReadInput, signal?:AbortSignal):Promise<RpcReadSnapshot> }

/** Caller enforces the current web3-rpc-read-v2 consent before entering this seam. */
export async function attachObservedInventory(sample:CoreSample,input:CoreReadInput,rpc:RpcObservationPort,now:()=>number,signal?:AbortSignal):Promise<CoreSample> {
 const at=now(), balance=sample.envelopes.balance as SourceEnvelope<Inventory>|undefined;
 const expected={identityKey:sample.identityKey,chainIndex:input.chainIndex,revision:input.revision,correlationId:input.correlationId};
 const hold=(reason:string)=>({...sample,holdReasons:[...new Set([...sample.holdReasons,reason])]});
 if(signal?.aborted) return hold('rpc-observation-aborted');
 if(!['196','143'].includes(input.chainIndex)||sample.chainIndex!==input.chainIndex||sample.revision!==input.revision||sample.correlationId!==input.correlationId
  ||sample.identityKey!==createHash('sha256').update(`${input.chainIndex}:${input.address.toLowerCase()}`).digest('hex')
  ||!balance||balance.status!=='ready'||balance.source!=='onchainos-rest-v6'||balance.unit!=='balance-unit-unknown'||balance.method!=='GET'
  ||balance.endpoint!=='/api/v6/dex/balance/all-token-balances-by-address'||balance.chainIndex!==input.chainIndex||balance.correlationId!==input.correlationId
  ||balance.expiresAtMs<=at||balance.receivedAtMs>at||!balance.data) return hold('rpc-input-unqualified');
 const inventory=balance.data;
 const wanted=[...(input.pair?[input.pair.fromToken,input.pair.toToken]:[]),...inventory.assets.map(asset=>asset.tokenContractAddress)];
 const tokens=[...new Set(wanted.map(token=>token.toLowerCase()))].filter(token=>/^0x[\da-f]{40}$/.test(token)&&token!==NATIVE&&token!==input.address.toLowerCase()).slice(0,8);
 const observed=await rpc.read({...input,identityKey:sample.identityKey,chainIndex:input.chainIndex as '196'|'143',tokens},signal);
 if(signal?.aborted) return hold('rpc-observation-aborted');
 let blockNumber:string|null=null;
 try { if(observed.context.blockNumber!==null) blockNumber=BigInt(observed.context.blockNumber).toString(); } catch { /* Remains unknown. */ }
 const context=observed.context;
 const compatible=observed.status==='ready'&&observed.blockConsistent&&context.identityKey===expected.identityKey&&context.chainIndex===expected.chainIndex
  &&context.revision===expected.revision&&context.correlationId===expected.correlationId&&blockNumber!==null&&context.blockHash!==null;
 const tokenStates=[...observed.tokens.map(token=>({token:token.token,balanceRaw:token.rawBalance,decimals:token.decimals,codeHash:token.codeHash})),
  ...(inventory.assets.some(asset=>asset.tokenContractAddress.toLowerCase()===NATIVE)||input.pair?.fromToken.toLowerCase()===NATIVE||input.pair?.toToken.toLowerCase()===NATIVE
   ?[{token:NATIVE,balanceRaw:observed.nativeBalanceRaw,decimals:observed.nativeDecimals,codeHash:null}]:[])];
 const observation:ValuationObservation|null=compatible?{status:'qualified',context:{...expected,blockNumber:blockNumber!,blockHash:context.blockHash!,observedAtMs:context.observedAtMs,expiresAtMs:context.expiresAtMs},tokens:tokenStates}:null;
 const valuation=deriveObservedValuation({inventoryEnvelope:{...balance,...expected,priceSource:'balance-tokenPrice-usd'},observation,expected,now:now()});
 const attached:CoreSample={...sample,rpcObservation:observed,valuation,holdReasons:[...new Set([...sample.holdReasons,...observed.reasons,...valuation.reasons])]};
 if(!sample.proposal) return attached;
 const sourceSha256=createHash('sha256').update(JSON.stringify(observed.receipts)).digest('hex');
 const snapshot:SemanticSnapshot|null=observation?{context:observation.context,tokens:tokenStates.map(token=>({...token,
  displayBalance:inventory.assets.find(asset=>asset.tokenContractAddress.toLowerCase()===token.token.toLowerCase())?.balance??null,
  decimalsMethod:token.token===NATIVE?'native-chain-metadata':'erc20-decimals',sourceReference:`evm-rpc-read:${input.chainIndex}:block:${blockNumber}`,sourceSha256})),
  deployment:null,allowance:null,nativeBalanceRaw:observed.nativeBalanceRaw,fees:null}:null;
 return attachCoreSemanticProof(attached,input,{observe:async()=>signal?.aborted?null:snapshot,decode:async()=>null},now);
}
