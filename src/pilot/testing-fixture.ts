import { normalizeInventory } from "../okx-wallet/portfolio";
import { DEFAULT_PAIRS } from "../operator/candidates";
import type { PilotBundle, PilotDeps } from "./service";

/** Explicit synthetic demonstration only. Never imported by the default entrypoint. */
export function createPilotFixture(now:()=>number=Date.now): PilotDeps {
  const base=DEFAULT_PAIRS.find(p=>p.chainIndex==="196")!.base;
  return {
    now,inferenceAllowanceUsd:0.001,modelSource:"fixture",
    source:async r=>({
      provenance:"fixture",coverageQualified:true,unitsQualified:true,quoteCostsComplete:true,
      inventory:normalizeInventory({address:r.account,queriedChains:["196"],observedAtMs:now(),riskTokensExcluded:false,source:"synthetic",assets:[
        {chainIndex:"196",tokenContractAddress:"",address:r.account,symbol:"OKB",balance:"1",rawBalance:"1000000000000000000",tokenPrice:"50",isRiskToken:false},
        {chainIndex:"196",tokenContractAddress:base.tokenContractAddress,address:r.account,symbol:"USDT",balance:"100",rawBalance:"100000000",tokenPrice:"1",isRiskToken:false},
      ]}),
      quoter:{unitsQualified:true,quote:async q=>({fromAmountAtomic:q.amountAtomic,toAmountAtomic:q.fromTokenAddress===base.tokenContractAddress?"100000000000000000":"5500000",tradeFeeUsd:0.01,priceImpactPercent:0.1,receivedAtMs:now()})},
    } satisfies PilotBundle),
    model:{name:"fixture",choose:async()=>({choice:"rt_196_usdt_okb",probabilities:{hold:0.1,rt_196_usdt_okb:0.9},confidence:0.8,latencyMs:0,inputTokens:null,model:"fixture"})},
  };
}
