import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createPilotHandler } from "../src/pilot/http";
import { createPilotJournal } from "../src/pilot/journal";
import { resolvePilotPorts } from "../src/pilot/ports";
import { createPilotFixture } from "../src/pilot/testing-fixture";

if(process.argv.slice(2).join(" ")!=="--fixture")throw new Error("Explicit --fixture required; synthetic data do not qualify real access.");
// The only variables read are PILOT_PORT and PILOT_UI_PORT (defaults 3020 and 3021), through resolvePilotPorts.
const ports=resolvePilotPorts(process.env);
const journalPath=resolve(import.meta.dir,"../data/pilot",`fixture-${process.pid}-${randomUUID()}.jsonl`);
const server=Bun.serve({hostname:"127.0.0.1",port:ports.port,fetch:createPilotHandler({...createPilotFixture(),journal:createPilotJournal(journalPath)},ports)});
console.log(JSON.stringify({url:server.url.href,mode:"simulation",execution:"disabled",source:"fixture",qualification:"synthetic_only",journalPath,allowedPageOrigin:`http://127.0.0.1:${ports.uiPort}`}));
