import { test, expect } from "bun:test";
import { evaluatePilot } from "./service";
import { pilotContextKey, type PilotRequest } from "./protocol";
import { normalizeInventory } from "../okx-wallet/portfolio";
import { DEFAULT_PAIRS } from "../operator/candidates";

const now = 1_800_000_000_000;
export const request: PilotRequest = { sessionId: "session-0001", requestId: "request-0001", account: "0x" + "1".repeat(40), chainId: "0xc4", observedAtMs: now, block: "123" };

function bundle() {
  const base = DEFAULT_PAIRS.find(p => p.chainIndex === "196")!.base;
  const inventory = normalizeInventory({ assets:[
    { chainIndex:"196",tokenContractAddress:"",address:request.account,symbol:"OKB",balance:"1",rawBalance:"1000000000000000000",tokenPrice:"50",isRiskToken:false },
    { chainIndex:"196",tokenContractAddress:base.tokenContractAddress,address:request.account,symbol:"USDT",balance:"100",rawBalance:"100000000",tokenPrice:"1",isRiskToken:false },
  ],address:request.account,queriedChains:["196"],observedAtMs:now,riskTokensExcluded:false,source:"synthetic" });
  inventory.source = "synthetic";
  return { inventory, provenance: "fixture" as const, coverageQualified:true, unitsQualified:true, quoteCostsComplete:true,
    quoter:{ unitsQualified:true, quote: async (input: { amountAtomic:string; fromTokenAddress:string }) => ({
      fromAmountAtomic:input.amountAtomic, toAmountAtomic:input.fromTokenAddress === base.tokenContractAddress ? "100000000000000000" : "5500000",
      priceImpactPercent:0.1,tradeFeeUsd:0.01,receivedAtMs:now,
    }) },
  };
}
function model(choice = "rt_196_usdt_okb") {
  return { name:"fixture", choose: async () => ({ choice, probabilities:{hold:0.1,rt_196_usdt_okb:0.9},confidence:0.8,latencyMs:1,inputTokens:100,model:"fixture" }) };
}

test("qualified fixture traverses the complete simulation and journal with one identity", async () => {
  const entries: unknown[] = [];
  const c = await evaluatePilot(request, { now:()=>now,source:async()=>bundle(),model:model(),modelSource:"fixture",inferenceAllowanceUsd:0.001,journal:c=>{entries.push(c);} });
  expect(c.source).toBe("fixture");
  expect(c.dataVersion).toMatch(/^[a-f0-9]{64}$/);
  expect(c.verdicts[0]?.eligible).toBe(true);
  expect(c.status).toBe("simulated");
  expect(c.decision?.choice).toBe("rt_196_usdt_okb");
  expect(c.plan?.executionQualification).toBe("qualified_dry_run");
  expect(c.plan?.quoteHash).toBe(c.candidates[0]?.quoteHash);
  expect(c.execution).toBe("disabled");
  expect(c.billedCostUsd).toBeNull();
  expect(c.realizedProfitUsd).toBeNull();
  expect(entries).toEqual([c]);
});

test("unit, coverage and cost uncertainty block before any quote or inference", async () => {
  for (const field of ["unitsQualified","coverageQualified","quoteCostsComplete"] as const) {
    const b = bundle(); b[field] = false; let calls = 0;
    b.quoter.quote = async () => { calls++; throw new Error("must not quote"); };
    const c = await evaluatePilot(request,{now:()=>now,source:async()=>b,model:model(),modelSource:"fixture",inferenceAllowanceUsd:0.001});
    expect(c.status).toBe("hold"); expect(c.plan).toBeNull(); expect(c.decision).toBeNull(); expect(calls).toBe(0);
  }
  const c = await evaluatePilot(request,{now:()=>now,source:async()=>bundle(),model:model(),modelSource:"fixture",inferenceAllowanceUsd:null});
  expect(c.reasons).toContain("inference_cost_unknown"); expect(c.decision).toBeNull();
});

test("source account, age, valuation and provenance errors never reach the model", async () => {
  for (const mutate of [
    (b:ReturnType<typeof bundle>)=> { b.inventory.address = "0x"+"2".repeat(40); },
    (b:ReturnType<typeof bundle>)=> { b.inventory.observedAtMs = now-60_001; },
    (b:ReturnType<typeof bundle>)=> { b.inventory.knownValueUsd = NaN; },
    (b:ReturnType<typeof bundle>)=> { (b as {provenance:string}).provenance = "real"; },
  ]) {
    const b = bundle(); mutate(b); let calls = 0;
    const c = await evaluatePilot(request,{now:()=>now,source:async()=>b,model:{...model(),choose:async()=>{calls++;return model().choose();}},modelSource:"fixture",inferenceAllowanceUsd:0.001});
    expect(c.decision).toBeNull(); expect(c.plan).toBeNull(); expect(calls).toBe(0);
  }
});

test("invalid, failing and late model answers are held; late source is bounded", async () => {
  for (const chosen of [
    model("not_a_candidate"),
    {...model(),choose:async()=>{throw new Error("secret upstream text");}},
    {...model(),choose:()=>new Promise<never>(()=>{})},
  ]) {
    const c = await evaluatePilot(request,{now:()=>now,source:async()=>bundle(),model:chosen,modelSource:"fixture",inferenceAllowanceUsd:0.001,decisionTimeoutMs:10});
    expect(c.status).toBe("hold"); expect(c.plan).toBeNull();
    expect(JSON.stringify(c)).not.toContain("secret upstream text");
  }
  const c = await evaluatePilot(request,{now:()=>now,source:()=>new Promise<never>(()=>{}),cycleTimeoutMs:10});
  expect(c.reasons).toContain("cycle_timeout");
});

test("data expires during inference: discard plan and make evidence stale", async () => {
  let clock = now;
  const c = await evaluatePilot(request,{now:()=>clock,source:async()=>bundle(),model:{...model(),choose:async()=>{clock += 60_001;return model().choose();}},modelSource:"fixture",inferenceAllowanceUsd:0.001});
  expect(c.reasons).toContain("data_expired_during_cycle");
  expect(c.plan).toBeNull(); expect(c.status).toBe("hold");
});

test("wallet or inventory expiring during quotations never reaches inference", async () => {
  for (const stale of ["wallet", "inventory"] as const) {
    let clock = now;
    let calls = 0;
    const r = { ...request, observedAtMs: stale === "wallet" ? now - 59_990 : now };
    const b = bundle();
    b.inventory.observedAtMs = stale === "inventory" ? now - 59_990 : now;
    const quote = b.quoter.quote;
    b.quoter.quote = async input => { clock += 10; return { ...await quote(input), receivedAtMs: clock }; };
    const c = await evaluatePilot(r, { now:()=>clock,source:async()=>b,model:{...model(),choose:async()=>{calls++;return model().choose();}},modelSource:"fixture",inferenceAllowanceUsd:0.001 });
    expect(calls).toBe(0);
    expect(c.reasons).toContain("data_expired_during_cycle");
    expect(c.plan).toBeNull();
  }
});

test("coverage is explicit, sanitized and retained in the same journal on hold", async () => {
  const entries: unknown[] = [];
  const qualified = await evaluatePilot(request,{now:()=>now,source:async()=>bundle(),inferenceAllowanceUsd:null,journal:c=>{entries.push(c);}});
  expect((qualified as unknown as {coverage:unknown}).coverage).toEqual({status:"qualified",chains:["196"],valueComplete:true,unitsQualified:true,quoteCostsComplete:true,assetCount:2});
  expect(entries).toEqual([qualified]);
  const invalid = bundle(); invalid.coverageQualified = false;
  for (const deps of [{}, {source:async()=>invalid}]) {
    const c = await evaluatePilot(request,{now:()=>now,...deps});
    expect((c as unknown as {coverage:unknown}).coverage).toEqual({status:"unknown",chains:[],valueComplete:null,unitsQualified:null,quoteCostsComplete:null,assetCount:null});
  }
});

test("quote expiration while building the second leg blocks inference", async () => {
  let clock = now;
  let quotes = 0, calls = 0;
  const b = bundle(), quote = b.quoter.quote;
  b.quoter.quote = async input => { if (++quotes === 2) clock += 15_001; return {...await quote(input),receivedAtMs:clock}; };
  const c = await evaluatePilot(request,{now:()=>clock,source:async()=>b,model:{...model(),choose:async()=>{calls++;return model().choose();}},modelSource:"fixture",inferenceAllowanceUsd:0.001});
  expect(quotes).toBe(2); expect(calls).toBe(0); expect(c.status).toBe("hold"); expect(c.plan).toBeNull();
  expect(c.quoteObservedAtMs).toBe(now);
});

test("source resolving after timeout cannot mutate the journal or start quotations", async () => {
  let resolve!: (b: ReturnType<typeof bundle>) => void;
  let quotes = 0;
  const b = bundle();
  b.quoter.quote = async () => { quotes++; throw new Error("late quote"); };
  const source = new Promise<ReturnType<typeof bundle>>(r => { resolve = r; });
  const entries: unknown[] = [];
  // Leave room above Windows timer resolution for the bounded journal phase.
  const c = await evaluatePilot(request,{now:()=>now,source:()=>source,cycleTimeoutMs:1000,inferenceAllowanceUsd:0.001,journal:c=>{entries.push(c);}});
  const recorded = JSON.stringify(c);
  resolve(b);
  await new Promise(r=>setTimeout(r,20));
  expect(quotes).toBe(0);
  expect(JSON.stringify(c)).toBe(recorded);
  expect(JSON.stringify(entries[0])).toBe(recorded);
});

test("unavailable sources produce a traceable hold, never an invented zero or decision", async () => {
  const entries: unknown[] = [];
  const cycle = await evaluatePilot(request, { now: () => now, journal: c => { entries.push(c); } });
  expect(cycle.contextKey).toBe(pilotContextKey(request));
  expect(cycle.knownValueUsd).toBeNull();
  expect(cycle.source).toBe("unavailable");
  expect(cycle.reasons).toContain("inventory_access_unverified");
  expect(cycle.decision).toBeNull();
  expect(cycle.plan).toBeNull();
  expect(cycle.execution).toBe("disabled");
  expect(cycle.realizedProfitUsd).toBeNull();
  expect(entries).toEqual([cycle]);
  expect(JSON.stringify(cycle)).not.toContain(request.account);
});

test("address-bearing nonces are rejected before any source or journal access", async () => {
  for (const nonce of [request.account, "prefix_" + request.account.toUpperCase(), request.account.slice(2)]) {
    for (const field of ["sessionId", "requestId"]) {
      let accesses = 0;
      await expect(evaluatePilot({...request,[field]:nonce},{now:()=>now,source:async()=>{accesses++;return bundle();},journal:()=>{accesses++;}})).rejects.toThrow("invalid_pilot_request");
      expect(accesses).toBe(0);
    }
  }
});

test("unsupported chain and stale observation stop before source access", async () => {
  let calls = 0;
  const deps = { now: () => now, source: async () => { calls++; throw new Error("must not fetch"); } };
  const other = await evaluatePilot({ ...request, chainId: "0x8f" }, deps);
  const stale = await evaluatePilot({ ...request, observedAtMs: now - 60_001 }, deps);
  expect(other.reasons).toContain("network_outside_pilot");
  expect(stale.reasons).toContain("wallet_observation_stale");
  expect(calls).toBe(0);
});

test("upstream quote errors are sanitized and cannot become journal notes",async()=>{
  const b=bundle();b.quoter.quote=async()=>{throw new Error("secret credential upstream");};
  const c=await evaluatePilot(request,{now:()=>now,source:async()=>b,inferenceAllowanceUsd:0.001});
  expect(c.reasons).toContain("no_eligible_candidate");
  expect(JSON.stringify(c)).not.toContain("secret credential upstream");
});

test("unprofitable quotes skip inference; model hold retains evidence without plan",async()=>{
  let calls=0;const b=bundle();
  b.quoter.quote=async input=>({fromAmountAtomic:input.amountAtomic,toAmountAtomic:input.fromTokenAddress===DEFAULT_PAIRS[0]!.base.tokenContractAddress?"100000000000000000":"4000000",tradeFeeUsd:0.01,priceImpactPercent:0.1,receivedAtMs:now});
  const no=await evaluatePilot(request,{now:()=>now,source:async()=>b,model:{...model(),choose:async()=>{calls++;return model().choose();}},modelSource:"fixture",inferenceAllowanceUsd:0.001});
  expect(no.reasons).toContain("no_eligible_candidate");expect(calls).toBe(0);
  const held=await evaluatePilot(request,{now:()=>now,source:async()=>bundle(),model:model("hold"),modelSource:"fixture",inferenceAllowanceUsd:0.001});
  expect(held.reasons).toContain("gev_chose_hold");expect(held.decision?.choice).toBe("hold");expect(held.plan).toBeNull();
});
