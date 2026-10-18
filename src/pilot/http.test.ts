import { test, expect } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPilotHandler } from "./http";
import { createPilotJournal } from "./journal";
import type { PilotCycle } from "./protocol";
import { createPilotFixture } from "./testing-fixture";

const now = 1_800_000_000_000;
const input = {sessionId:"session-0001",requestId:"request-0001",account:"0x"+"1".repeat(40),chainId:"0xc4",observedAtMs:now,block:"123"};
function req(body: unknown = input, origin = "http://127.0.0.1:3021") {
  return new Request("http://127.0.0.1:3020/pilot/cycles",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
}
test("HTTP persists masked trace and accepts only bounded observation JSON",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"gev-pilot-"));
  try {
    const path=join(dir,"journal.jsonl");
    const handler=createPilotHandler({now:()=>now,journal:createPilotJournal(path)});
    const response=await handler(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3021");
    const cycle=await response.json() as PilotCycle;
    expect(cycle.execution).toBe("disabled");
    const raw=await readFile(path,"utf8");
    expect(JSON.parse(raw)).toEqual(cycle);
    expect(raw).not.toContain(input.account);
    expect((await handler(req({...input,execute:true}))).status).toBe(400);
    expect((await handler(req("x".repeat(5000)))).status).toBe(413);
    expect((await handler(req(input,"https://unexpected.example"))).status).toBe(403);
    expect((await handler(new Request("http://127.0.0.1:3020/pilot/cycles"))).status).toBe(405);
    expect((await handler(new Request("http://127.0.0.1:3020/execute",{method:"POST"}))).status).toBe(404);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("concurrent evaluation is rejected and journal failure never looks persisted",async()=>{
  let resolve!:()=>void;
  const pending=new Promise<void>(r=>{resolve=r;});
  const handler=createPilotHandler({now:()=>now,journal:async()=>pending});
  const first=handler(req());
  await new Promise(r=>setTimeout(r,5));
  expect((await handler(req())).status).toBe(429);
  resolve();
  expect((await first).status).toBe(200);
  const failed=createPilotHandler({now:()=>now,journal:()=>{throw new Error("private path secret");}});
  const response=await failed(req());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private path secret");
});

test("journal timeout releases the HTTP slot; expiry during persistence is never an active response",async()=>{
  let calls=0;
  // Leave scheduler headroom for the subsequent healthy request on Windows.
  const handler=createPilotHandler({now:()=>now,cycleTimeoutMs:1000,journal:()=>++calls===1?new Promise<void>(()=>{}):undefined});
  const started=performance.now();
  const first=await handler(req());
  expect(first.status).toBe(500);
  expect(performance.now()-started).toBeLessThan(2000);
  expect((await handler(req())).status).toBe(200);
  let clock=now;
  const expired=createPilotHandler({...createPilotFixture(()=>clock),now:()=>clock,journal:()=>{clock+=20_000;}});
  const response=await expired(req());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('"plan"');
});
test("preflight is limited; hostile hosts and missing origin cannot evaluate",async()=>{
  const handler=createPilotHandler({now:()=>now,journal:()=>{}});
  const pre=await handler(new Request("http://127.0.0.1:3020/pilot/cycles",{method:"OPTIONS",headers:{origin:"http://localhost:3021","access-control-request-method":"POST","access-control-request-headers":"content-type"}}));
  expect(pre.status).toBe(204);
  expect((await handler(new Request("http://127.0.0.1:3020/pilot/cycles",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)}))).status).toBe(403);
  const hostile=req();hostile.headers.set("host","unexpected.example:3020");
  expect((await handler(hostile)).status).toBe(403);
});

test("explicit fixture traverses HTTP, gates, model, dry-run plan and durable journal",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"gev-pilot-fixture-"));
  try {
    const path=join(dir,"cycles.jsonl");
    const handler=createPilotHandler({...createPilotFixture(()=>now),journal:createPilotJournal(path)});
    const response=await handler(req());
    expect(response.status).toBe(200);
    const cycle=await response.json() as PilotCycle;
    expect(cycle.source).toBe("fixture");
    expect(cycle.status).toBe("simulated");
    expect(cycle.decision?.model).toBe("fixture");
    expect(cycle.plan?.executionQualification).toBe("qualified_dry_run");
    expect(cycle.execution).toBe("disabled");
    expect(cycle.realizedProfitUsd).toBeNull();
    expect(cycle.billedCostUsd).toBeNull();
    expect(JSON.parse(await readFile(path,"utf8"))).toEqual(cycle);
  } finally {await rm(dir,{recursive:true,force:true});}
});
