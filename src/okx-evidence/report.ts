import {normalizeTokenAddress} from '../okx-market/token-identity';
import {assessOpportunity,type Opportunity,type ResearchPolicy} from '../okx-market/okx-opportunities';

export class EvidenceError extends Error {
  constructor(public readonly code:'invalid_input'|'invalid_report'|'file_error'){
    super(`OKX Evidence: ${code}`);this.name='EvidenceError';
  }
}
type Raw=Record<string,unknown>;
type Source='synthetic'|'okx_authenticated';
type Freshness='fresh'|'stale'|'future'|'unknown';
type Identity={chainIndex:string;tokenContractAddress:string};
type Category='smart_money'|'influencer'|'whale'|'unknown';
const PENDING=['current_security','sellability','executable_sell_quote','actual_costs','verified_authenticated_source'] as const;
type SignalObservation={sourceClaim:Source;provenance:'unverified';observedAtMs:number;reportFreshness:Freshness;triggeredAtMs:number|null;freshness:Freshness;walletCategory:Category};
type ScannerObservation={sourceClaim:Source;provenance:'unverified';startedAtMs:number;completedAtMs:null;reportFreshness:Freshness;priceTimeMs:number|null;priceFreshness:Freshness;chronology:'within_declared_start'|'unknown'|'future';stage:'NEW'|'MIGRATING'|'MIGRATED';liquiditySemantics:'indicative_pool';assessment:ReturnType<typeof assessOpportunity>};
type EvidenceRow={identity:Identity;signals:SignalObservation[];scanner:ScannerObservation|null;missingSources:('signals'|'scanner')[];execution:'not_qualified';netReturnUsd:null;executableExitLiquidityUsd:null;missingEvidence:readonly string[]};
function raw(value:unknown):Raw{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new EvidenceError('invalid_report');return value as Raw;
}
function text(value:unknown):string{if(typeof value!=='string')throw new EvidenceError('invalid_report');return value;}
function array(value:unknown):unknown[]{if(!Array.isArray(value))throw new EvidenceError('invalid_report');return value;}
function time(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0||value>8.64e15)throw new EvidenceError('invalid_report');return value;}
function nullableTime(value:unknown):number|null{return value===null?null:time(value);}
function source(value:unknown):Source{if(value!=='synthetic'&&value!=='okx_authenticated')throw new EvidenceError('invalid_report');return value;}
function freshness(value:number|null,now:number,age:number):Freshness{return value===null?'unknown':value>now?'future':now-value>age?'stale':'fresh';}
function chain(value:unknown):string{const s=text(value);if(!/^[1-9][0-9]{0,19}$/.test(s))throw new EvidenceError('invalid_report');return s;}
function solanaAddress(value:string):boolean{
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))return false;
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let numeric=0n;for(const c of value)numeric=numeric*58n+BigInt(alphabet.indexOf(c));
  let bytes=0;while(numeric>0n){bytes++;numeric>>=8n;}
  return (value.match(/^1*/)?.[0].length??0)+bytes===32;
}
function identity(chain:string,address:unknown):Identity{
  const s=text(address);
  const valid=normalizeTokenAddress(chain,'EVM')==='evm'?/^0x[0-9a-fA-F]{40}$/.test(s):chain==='501'?solanaAddress(s):/^[A-Za-z0-9]{8,128}$/.test(s);
  if(!valid)throw new EvidenceError('invalid_report');
  return {chainIndex:chain,tokenContractAddress:normalizeTokenAddress(chain,s)};
}
function key(id:Identity):string{return JSON.stringify([id.chainIndex,id.tokenContractAddress]);}
function numberOrNull(value:unknown):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new EvidenceError('invalid_report');return value;}
function strings(value:unknown):string[]{const a=array(value);if(a.length>100)throw new EvidenceError('invalid_report');return a.map(x=>{const s=text(x);if(!s.length||s.length>128)throw new EvidenceError('invalid_report');return s;});}
function boundedNumber(value:unknown,max:number,integer=false):number|null{
  const n=numberOrNull(value);if(n!==null&&(n>max||(integer&&!Number.isSafeInteger(n))))throw new EvidenceError('invalid_report');return n;
}
const KNOWN_ISSUES=new Set(['price_identity_mismatch','listed_identity_mismatch','advanced_identity_mismatch','pool_identity_mismatch','unknown:pool_membership','unknown:price_fetch_failed','unknown:duplicate_price_identity','unknown:duplicate_advanced_identity','unknown:advanced_fetch_failed','unknown:pools_fetch_failed']);
function opportunity(value:unknown,chain:string):Opportunity{
  const x=raw(value),id=raw(x.identity);
  if(id.chainIndex!==chain)throw new EvidenceError('invalid_report');
  const issues=strings(x.issues).map(issue=>KNOWN_ISSUES.has(issue)?issue:'unknown:unrecognized_scanner_issue');
  const tags=x.tags===null?null:strings(x.tags).flatMap(tag=>{
    const t=tag.trim().toLowerCase();if(t==='honeypot'||t==='lowliquidity')return [t];issues.push('unknown:unrecognized_risk_tag');return [];
  });
  const riskLevel=boundedNumber(x.riskLevel,5,true);if(riskLevel===0)throw new EvidenceError('invalid_report');
  return {identity:identity(chain,id.tokenContractAddress),symbol:null,priceUsd:numberOrNull(x.priceUsd),priceTimeMs:nullableTime(x.priceTimeMs),holders:boundedNumber(x.holders,Number.MAX_SAFE_INTEGER,true),top10HoldPercent:boundedNumber(x.top10HoldPercent,100),riskLevel,tags,poolLiquidityUsd:numberOrNull(x.poolLiquidityUsd),poolFees:[],issues:[...new Set(issues)]};
}
function policy(value:unknown,maxAgeMs:number):ResearchPolicy{
  const x=raw(value);
  const age=time(x.maxPriceAgeMs),liquidity=numberOrNull(x.minPoolLiquidityUsd),holders=boundedNumber(x.minHolders,Number.MAX_SAFE_INTEGER,true),concentration=boundedNumber(x.maxTop10HoldPercent,100),risk=boundedNumber(x.maxRiskLevel,5,true);
  if(age>3600000||liquidity===null||liquidity<=0||holders===null||holders<1||concentration===null||risk===null||risk<1)throw new EvidenceError('invalid_report');
  return {maxPriceAgeMs:Math.min(age,maxAgeMs),minPoolLiquidityUsd:liquidity,minHolders:holders,maxTop10HoldPercent:concentration,maxRiskLevel:risk};
}

/** Offline comparison only. File claims and structural validation never authenticate a feed. */
export function joinEvidence(input:{signals:unknown;scan:unknown;nowMs:number;maxAgeMs:number}){
  const {nowMs,maxAgeMs}=input;
  if(!Number.isSafeInteger(nowMs)||nowMs<=0||nowMs>8.64e15||!Number.isInteger(maxAgeMs)||maxAgeMs<1||maxAgeMs>3600000)throw new EvidenceError('invalid_input');
  const signals=raw(input.signals),scan=raw(input.scan),query=raw(signals.query);
  const signalSource=source(signals.source),scanSource=source(scan.source);
  const signalTime=time(signals.observedAtMs),scanTime=time(scan.observedAt);
  const signalChain=chain(query.chainIndex),scanChain=chain(scan.chainIndex);
  const walletTypes=strings(query.walletTypes),limit=query.limit,signalRows=array(signals.signals),scanRows=array(scan.items);
  if(signals.schema!=='okx_signals_observations_v1'||signals.execution!=='not_qualified'||scan.liveQualified!==false||!walletTypes.length||walletTypes.length>3||new Set(walletTypes).size!==walletTypes.length||walletTypes.some(t=>!['1','2','3'].includes(t))||typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>100||signalRows.length>limit||scanRows.length>30||!['NEW','MIGRATING','MIGRATED'].includes(text(scan.stage))||!/^[A-Za-z0-9_.-]{1,80}$/.test(text(scan.protocolId)))throw new EvidenceError('invalid_report');
  const selectedPolicy=policy(scan.policy,maxAgeMs);
  const rows=new Map<string,EvidenceRow>();
  function row(id:Identity):EvidenceRow{
    const k=key(id);let found=rows.get(k);if(!found){found={identity:id,signals:[],scanner:null,missingSources:[],execution:'not_qualified',netReturnUsd:null,executableExitLiquidityUsd:null,missingEvidence:[...PENDING]};rows.set(k,found);}return found;
  }
  for(const value of signalRows){
    const x=raw(value),category=text(x.walletCategory);
    const code=category==='smart_money'?'1':category==='influencer'?'2':category==='whale'?'3':null;
    if(x.chainIndex!==signalChain||x.execution!=='not_qualified'||x.direction!=='buy_observation'||!['smart_money','influencer','whale','unknown'].includes(category)||(code!==null&&!walletTypes.includes(code)))throw new EvidenceError('invalid_report');
    const triggeredAtMs=nullableTime(x.triggeredAtMs);
    row(identity(signalChain,x.tokenAddress)).signals.push({sourceClaim:signalSource,provenance:'unverified',observedAtMs:signalTime,reportFreshness:freshness(signalTime,nowMs,maxAgeMs),triggeredAtMs,freshness:triggeredAtMs!==null&&triggeredAtMs>signalTime?'future':freshness(triggeredAtMs,nowMs,maxAgeMs),walletCategory:category as Category});
  }
  for(const value of scanRows){
    const x=opportunity(raw(value).opportunity,scanChain),found=row(x.identity);
    if(found.scanner)throw new EvidenceError('invalid_report');
    const reportFreshness=freshness(scanTime,nowMs,maxAgeMs);
    const chronology:ScannerObservation['chronology']=x.priceTimeMs===null?'unknown':x.priceTimeMs>nowMs?'future':x.priceTimeMs>scanTime?'unknown':'within_declared_start';
    if(x.priceTimeMs!==null&&x.priceTimeMs>scanTime&&x.priceTimeMs<=nowMs)x.issues.push('unknown:scan_completion_unknown');
    const assessment=assessOpportunity(x,selectedPolicy,nowMs);
    if(reportFreshness==='stale'||reportFreshness==='future'){
      assessment.status='blocked';assessment.reasons.push(reportFreshness==='stale'?'stale_scanner_start':'future_scanner_start');
    }
    found.scanner={sourceClaim:scanSource,provenance:'unverified',startedAtMs:scanTime,completedAtMs:null,reportFreshness,priceTimeMs:x.priceTimeMs,priceFreshness:freshness(x.priceTimeMs,nowMs,selectedPolicy.maxPriceAgeMs),chronology,stage:text(scan.stage) as ScannerObservation['stage'],liquiditySemantics:'indicative_pool',assessment};
  }
  const sorted=[...rows.values()].sort((a,b)=>key(a.identity)<key(b.identity)?-1:key(a.identity)>key(b.identity)?1:0);
  for(const found of sorted){if(!found.signals.length)found.missingSources.push('signals');if(!found.scanner)found.missingSources.push('scanner');}
  return {schema:'okx_evidence_offline_v1' as const,comparedAtMs:nowMs,maxAgeMs,provenance:'unverified' as const,execution:'not_qualified' as const,netReturnUsd:null,executableExitLiquidityUsd:null,observedApiCostUsd:null,quota:'unknown' as const,missingEvidence:[...PENDING],rows:sorted};
}
