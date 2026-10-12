import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { PilotCycle } from "./protocol";

/** One process owns one file. Snapshot before awaiting: late producers cannot rewrite evidence. */
export function createPilotJournal(path: string) {
  return async (cycle: PilotCycle): Promise<void> => {
    const line = JSON.stringify(cycle) + "\n";
    await mkdir(dirname(path),{recursive:true});
    await appendFile(path,line,{encoding:"utf8",mode:0o600});
  };
}
