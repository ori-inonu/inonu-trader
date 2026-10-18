import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createPilotHandler } from "../src/pilot/http";
import { createPilotJournal } from "../src/pilot/journal";
import { resolvePilotPorts } from "../src/pilot/ports";

// No env loaders, wallet secret, executor or external request dependencies. The only variables read are PILOT_PORT and
// PILOT_UI_PORT (defaults 3020 and 3021), through resolvePilotPorts.
const ports=resolvePilotPorts(process.env);
const journalPath=resolve(import.meta.dir,"../data/pilot",`cycles-${process.pid}-${randomUUID()}.jsonl`);
const server=Bun.serve({hostname:"127.0.0.1",port:ports.port,fetch:createPilotHandler({journal:createPilotJournal(journalPath)},ports)});
console.log(JSON.stringify({url:server.url.href,mode:"simulation",execution:"disabled",source:"unavailable",journalPath,allowedPageOrigin:`http://127.0.0.1:${ports.uiPort}`}));
