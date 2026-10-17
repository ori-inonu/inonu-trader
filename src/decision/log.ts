import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { locked } from "../consensus/quota";
import type { ReasonRecord } from "./types";

/** Anexa uma linha JSON ao ledger de motivos, sob a mesma trava mkdir do ledger de cotas. O diretorio pai precisa existir para a trava. */
export async function appendReason(record: ReasonRecord, path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await locked(path, () => appendFileSync(path, line));
}
