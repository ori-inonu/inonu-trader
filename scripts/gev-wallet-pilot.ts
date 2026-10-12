import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createPilotHandler } from "../src/pilot/http";
import { createPilotJournal } from "../src/pilot/journal";

// No env loaders, wallet secret, executor or external request dependencies.
const journalPath=resolve(import.meta.dir,"../data/pilot",`cycles-${process.pid}-${randomUUID()}.jsonl`);
const server=Bun.serve({hostname:"127.0.0.1",port:3020,fetch:createPilotHandler({journal:createPilotJournal(journalPath)})});
console.log(JSON.stringify({url:server.url.href,mode:"simulation",execution:"disabled",source:"unavailable",journalPath}));
