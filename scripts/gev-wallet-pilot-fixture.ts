import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createPilotHandler } from "../src/pilot/http";
import { createPilotJournal } from "../src/pilot/journal";
import { createPilotFixture } from "../src/pilot/testing-fixture";

if(process.argv.slice(2).join(" ")!=="--fixture")throw new Error("Explicit --fixture required; synthetic data do not qualify real access.");
const journalPath=resolve(import.meta.dir,"../data/pilot",`fixture-${process.pid}-${randomUUID()}.jsonl`);
const server=Bun.serve({hostname:"127.0.0.1",port:3020,fetch:createPilotHandler({...createPilotFixture(),journal:createPilotJournal(journalPath)})});
console.log(JSON.stringify({url:server.url.href,mode:"simulation",execution:"disabled",source:"fixture",qualification:"synthetic_only",journalPath}));
