import {expect,test} from 'bun:test';
import {joinEvidence} from './report';
import {DEFAULT_RESEARCH_POLICY} from '../okx-market/okx-opportunities';

const NOW=1_791_632_000_000;
const ADDRESS='0x'+'a'.repeat(40);
function reports(){return {
  signals:{schema:'okx_signals_observations_v1',source:'synthetic',observedAtMs:NOW,query:{chainIndex:'56',walletTypes:['1'],limit:1},execution:'not_qualified',signals:[{chainIndex:'56',tokenAddress:ADDRESS.toUpperCase().replace('0X','0x'),direction:'buy_observation',walletCategory:'smart_money',triggeredAtMs:NOW-1000,execution:'not_qualified',freshness:'stale',secret:'DO-NOT-EXPORT'}]},
  scan:{source:'synthetic',observedAt:NOW,chainIndex:'56',stage:'NEW',protocolId:'fixture',policy:{...DEFAULT_RESEARCH_POLICY},liveQualified:false,items:[{opportunity:{identity:{chainIndex:'56',tokenContractAddress:ADDRESS},symbol:'DO-NOT-EXPORT',priceUsd:1,priceTimeMs:NOW-1000,holders:2000,top10HoldPercent:10,riskLevel:1,tags:[],poolLiquidityUsd:200000,poolFees:[],issues:[]},assessment:{status:'blocked',reasons:['DO-NOT-EXPORT']}}]}
};}
test('joins EVM identity and recalculates whitelist without trusting imported labels',()=>{
  const input=reports();const before=JSON.stringify(input);
  const output=joinEvidence({...input,nowMs:NOW,maxAgeMs:60000});
  expect(output.execution).toBe('not_qualified');expect(output.rows).toHaveLength(1);
  const row=output.rows[0]!;expect(row.identity).toEqual({chainIndex:'56',tokenContractAddress:ADDRESS});
  expect(row.signals[0]!.freshness).toBe('fresh');expect(row.scanner!.assessment.status).toBe('research_candidate');
  expect(row.scanner!.liquiditySemantics).toBe('indicative_pool');expect(row.execution).toBe('not_qualified');
  expect(row.netReturnUsd).toBeNull();expect(row.executableExitLiquidityUsd).toBeNull();
  expect(JSON.stringify(output)).not.toContain('DO-NOT-EXPORT');expect(JSON.stringify(input)).toBe(before);
});
test('recalculates time limits and distinguishes scanner start from unknown completion',()=>{
  const x=reports();
  const withPrice=(priceTimeMs:number|null,startedAtMs=NOW)=>({...x.scan,observedAt:startedAtMs,items:[{opportunity:{...x.scan.items[0]!.opportunity,priceTimeMs}}]});
  for(const [offset,wanted] of [[60000,'fresh'],[60001,'stale']] as const){
    const out=joinEvidence({...x,signals:{...x.signals,signals:[{...x.signals.signals[0],triggeredAtMs:NOW-offset}]},scan:withPrice(NOW-offset),nowMs:NOW,maxAgeMs:60000});
    expect(out.rows[0]!.signals[0]!.freshness).toBe(wanted);expect(out.rows[0]!.scanner!.priceFreshness).toBe(wanted);
  }
  const late=joinEvidence({...x,scan:withPrice(NOW-500,NOW-1000),nowMs:NOW,maxAgeMs:60000}).rows[0]!.scanner!;
  expect(late.priceFreshness).toBe('fresh');expect(late.chronology).toBe('unknown');expect(late.assessment.status).toBe('unknown');expect(late.assessment.reasons).toContain('unknown:scan_completion_unknown');expect(late.assessment.reasons).not.toContain('future_price');expect(late.completedAtMs).toBeNull();
  const future=joinEvidence({...x,scan:withPrice(NOW+1),nowMs:NOW,maxAgeMs:60000}).rows[0]!.scanner!;
  expect(future.chronology).toBe('future');expect(future.assessment.status).toBe('blocked');expect(future.assessment.reasons).toContain('future_price');
  for(const start of [NOW-60001,NOW+1])expect(joinEvidence({...x,scan:withPrice(NOW-1,start),nowMs:NOW,maxAgeMs:60000}).rows[0]!.scanner!.assessment.status).toBe('blocked');
  const reportFuture=joinEvidence({...x,signals:{...x.signals,signals:[{...x.signals.signals[0],triggeredAtMs:NOW+1}]},nowMs:NOW+2000,maxAgeMs:60000});
  expect(reportFuture.rows[0]!.signals[0]!.freshness).toBe('future');
  const missing=joinEvidence({...x,signals:{...x.signals,signals:[{...x.signals.signals[0],triggeredAtMs:null}]},scan:withPrice(null),nowMs:NOW,maxAgeMs:60000});
  expect(missing.rows[0]!.signals[0]!.freshness).toBe('unknown');expect(missing.rows[0]!.scanner!.assessment.status).toBe('unknown');
  const strict=joinEvidence({...x,scan:{...withPrice(NOW-1001),policy:{...x.scan.policy,maxPriceAgeMs:1000}},nowMs:NOW,maxAgeMs:60000});expect(strict.rows[0]!.scanner!.assessment.status).toBe('blocked');
});
test('preserves every signal observation, mixed declared origins and unknown risk dependencies',()=>{
  const x=reports();const signal=x.signals.signals[0]!;
  const out=joinEvidence({...x,signals:{...x.signals,source:'okx_authenticated',query:{...x.signals.query,limit:2},signals:[signal,{...signal,triggeredAtMs:NOW-2000}]},scan:{...x.scan,items:[{opportunity:{...x.scan.items[0]!.opportunity,tags:['DO-NOT-EXPORT'],issues:['DO-NOT-EXPORT']}}]},nowMs:NOW,maxAgeMs:60000});
  const row=out.rows[0]!;expect(row.signals).toHaveLength(2);expect(row.signals[0]!.sourceClaim).toBe('okx_authenticated');expect(row.signals[0]!.provenance).toBe('unverified');expect(row.scanner!.sourceClaim).toBe('synthetic');expect(row.scanner!.assessment.status).toBe('unknown');expect(row.scanner!.assessment.reasons).toEqual(['unknown:unrecognized_scanner_issue','unknown:unrecognized_risk_tag']);expect(JSON.stringify(out)).not.toContain('DO-NOT-EXPORT');
  expect(row.missingEvidence).toContain('verified_authenticated_source');expect(out.observedApiCostUsd).toBeNull();expect(out.quota).toBe('unknown');
});
test('unknown numeric evidence stays unknown and risk mismatches remain blocking',()=>{
  const x=reports();
  const scan={...x.scan,items:[{opportunity:{...x.scan.items[0]!.opportunity,priceUsd:null,holders:null,riskLevel:null,tags:null,top10HoldPercent:null,poolLiquidityUsd:null,priceTimeMs:null}}]};
  const unknown=joinEvidence({...x,scan,nowMs:NOW,maxAgeMs:60000}).rows[0]!.scanner!;expect(unknown.assessment.status).toBe('unknown');
  const blocked=joinEvidence({...x,scan:{...scan,items:[{opportunity:{...scan.items[0]!.opportunity,issues:['price_identity_mismatch']}}]},nowMs:NOW,maxAgeMs:60000}).rows[0]!.scanner!;expect(blocked.assessment.status).toBe('blocked');
  for(const [nowMs,maxAgeMs] of [[0,60000],[NOW,0],[NOW,3600001],[NOW,1.5],[8.64e15+1,1]] as const)expect(()=>joinEvidence({...x,nowMs,maxAgeMs})).toThrow('OKX Evidence: invalid_input');
});
test('rejects malformed producer controls, markers, counts and known categories outside filters',()=>{
  const x=reports();
  const invalidSignals=[null,{}, {...x.signals,schema:'legacy'}, {...x.signals,execution:'qualified'}, {...x.signals,source:'arbitrary'}, {...x.signals,query:{...x.signals.query,walletTypes:['1','1']}}, {...x.signals,query:{...x.signals.query,limit:0}}, {...x.signals,signals:[...x.signals.signals,...x.signals.signals]}, {...x.signals,signals:[{...x.signals.signals[0],walletCategory:'whale'}]}, {...x.signals,signals:[{...x.signals.signals[0],chainIndex:'1'}]}, {...x.signals,signals:[{...x.signals.signals[0],execution:'qualified'}]}, {...x.signals,signals:[{...x.signals.signals[0],direction:'sell'}]}];
  for(const signals of invalidSignals)expect(()=>joinEvidence({signals,scan:x.scan,nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
  const invalidScans=[{}, {...x.scan,liveQualified:true}, {...x.scan,stage:'OTHER'}, {...x.scan,protocolId:'bad path'}, {...x.scan,items:Array(31).fill(x.scan.items[0])}, {...x.scan,items:[...x.scan.items,...x.scan.items]}];
  for(const scan of invalidScans)expect(()=>joinEvidence({signals:x.signals,scan,nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
});
test('validates bounded policy and numbers even for empty scanner reports',()=>{
  const x=reports();
  for(const policy of [{...x.scan.policy,maxPriceAgeMs:3600001},{...x.scan.policy,maxPriceAgeMs:0.5},{...x.scan.policy,minPoolLiquidityUsd:0},{...x.scan.policy,minHolders:1.2},{...x.scan.policy,maxTop10HoldPercent:101},{...x.scan.policy,maxTop10HoldPercent:null},{...x.scan.policy,maxRiskLevel:6}])expect(()=>joinEvidence({...x,scan:{...x.scan,items:[],policy},nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
  for(const override of [{holders:1.2},{priceUsd:Infinity},{priceTimeMs:0},{top10HoldPercent:101},{riskLevel:0},{tags:Array(101).fill('honeypot')},{issues:['x'.repeat(129)]}])expect(()=>joinEvidence({...x,scan:{...x.scan,items:[{opportunity:{...x.scan.items[0]!.opportunity,...override}}]},nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
  expect(joinEvidence({...x,scan:{...x.scan,policy:{...x.scan.policy,minPoolLiquidityUsd:0.5}},nowMs:NOW,maxAgeMs:60000}).rows).toHaveLength(1);
});
test('keeps networks and case distinct while requiring Solana exactly32bytes',()=>{
  const x=reports();
  const signals={...x.signals,query:{...x.signals.query,chainIndex:'501',limit:2},signals:['1'.repeat(31)+'A','1'.repeat(31)+'a'].map(tokenAddress=>({...x.signals.signals[0],chainIndex:'501',tokenAddress}))};
  const out=joinEvidence({signals,scan:{...x.scan,items:[]},nowMs:NOW,maxAgeMs:60000});
  expect(out.rows).toHaveLength(2);expect(out.rows.map(r=>r.identity.tokenContractAddress)).toEqual(['1'.repeat(31)+'A','1'.repeat(31)+'a']);
  for(const tokenAddress of ['1'.repeat(31),'1'.repeat(33),'0'.repeat(32)])expect(()=>joinEvidence({signals:{...signals,signals:[{...signals.signals[0],tokenAddress}]},scan:x.scan,nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
  const unknown={...signals,query:{...signals.query,chainIndex:'99999'},signals:['Abcdef12','abcdef12'].map(tokenAddress=>({...signals.signals[0],chainIndex:'99999',tokenAddress}))};
  expect(joinEvidence({signals:unknown,scan:x.scan,nowMs:NOW,maxAgeMs:60000}).rows).toHaveLength(3);
  expect(()=>joinEvidence({...x,signals:{...x.signals,signals:[{...x.signals.signals[0],tokenAddress:'0x1'}]},nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
});

test('unions one-source rows deterministically up to 130 identities and rejects normalized scanner duplicates',()=>{
  const x=reports();const address=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
  const signals={...x.signals,query:{...x.signals.query,limit:100},signals:Array.from({length:100},(_,n)=>({...x.signals.signals[0],tokenAddress:address(n+1)}))};
  const scan={...x.scan,items:Array.from({length:30},(_,n)=>({opportunity:{...x.scan.items[0]!.opportunity,identity:{chainIndex:'56',tokenContractAddress:address(n+101)}}}))};
  const out=joinEvidence({signals,scan,nowMs:NOW,maxAgeMs:60000});expect(out.rows).toHaveLength(130);
  expect(out.rows.slice(0,100).every(r=>r.missingSources.join()==='scanner')).toBe(true);
  expect(out.rows.slice(100).every(r=>r.missingSources.join()==='signals')).toBe(true);
  expect(joinEvidence({signals:{...signals,signals:[...signals.signals].reverse()},scan:{...scan,items:[...scan.items].reverse()},nowMs:NOW,maxAgeMs:60000})).toEqual(out);
  const duplicate={...x.scan,items:[x.scan.items[0],{opportunity:{...x.scan.items[0]!.opportunity,identity:{chainIndex:'56',tokenContractAddress:ADDRESS.toUpperCase().replace('0X','0x')}}}]};
  expect(()=>joinEvidence({...x,scan:duplicate,nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
  expect(joinEvidence({...x,signals:{...x.signals,signals:[]},scan:{...x.scan,items:[]},nowMs:NOW,maxAgeMs:60000}).rows).toEqual([]);
  for(const observedAtMs of [null,0,1.5,Infinity,8.64e15+1])expect(()=>joinEvidence({...x,signals:{...x.signals,observedAtMs},nowMs:NOW,maxAgeMs:60000})).toThrow('OKX Evidence: invalid_report');
});
