import { appendFileSync, mkdirSync, openSync, closeSync, renameSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { absoluteArg } from "../local-host/args";
import { auditConsult, type ConsultAudit } from "./audit";
import { summarizePurchases } from "./purchases";

const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_:./@-]{1,180}$/.test(v);
const hash = (v: unknown) => new Bun.CryptoHasher("sha256").update(JSON.stringify(v)).digest("hex");

export interface ReviewCursor {
  readonly version: 1;
  readonly latestCycleId: string | null;
  readonly reviewed: Readonly<Record<string, string>>;
  readonly consultations?: Readonly<Record<string, ConsultAudit>>;
}
export interface CycleAudit {
  readonly cycleId: string;
  readonly atMs: number;
  readonly outcome: string;
  readonly reason: string | null;
  readonly consulted: boolean;
  readonly consultation: ConsultAudit | null;
  readonly orders: readonly { readonly stage: string; readonly proof: "provider_receipt" | "user_report" | "not_confirmed" }[];
}

export const emptyCursor = (): ReviewCursor => ({ version: 1, latestCycleId: null, reviewed: {} });

function parseCursor(raw: unknown): ReviewCursor | null {
  const r = obj(raw), reviewed = obj(r?.reviewed);
  if (r?.version !== 1 || reviewed === null || Object.keys(reviewed).length > 2000 || (r.latestCycleId !== null && !code(r.latestCycleId)) || !Object.entries(reviewed).every(([id, h]) => code(id) && typeof h === "string" && /^[a-f0-9]{64}$/.test(h))) return null;
  const cached = r.consultations === undefined ? {} : obj(r.consultations);
  if (cached === null || Object.keys(cached).length > 2000 || !Object.entries(cached).every(([id, audit]) => code(id) && obj(audit)?.cycleId === id && obj(audit)?.version === 1 && Array.isArray(obj(audit)?.candidates) && Array.isArray(obj(audit)?.findings))) return null;
  return { version: 1, latestCycleId: r.latestCycleId as string | null, reviewed: reviewed as Record<string, string>, consultations: cached as Record<string, ConsultAudit> };
}

/** The audit uses recorded alternatives and terminal evidence, and never treats a person's override as an on-chain receipt. */
export function reviewCycles(ledger: readonly unknown[], consults: readonly unknown[], cursor: ReviewCursor): {
  readonly reviews: readonly CycleAudit[]; readonly cursor: ReviewCursor; readonly sourceGap: boolean;
} {
  const byConsult = new Map<string, ConsultAudit>();
  for (const [id, audit] of Object.entries(cursor.consultations ?? {})) byConsult.set(id, audit);
  for (const raw of consults) { const c = auditConsult(raw); if (c !== null) byConsult.set(c.cycleId, c); }
  const orders = new Map<string, Record<string, unknown>>();
  const cycles = new Map<string, Record<string, unknown>>();
  for (const raw of ledger) {
    const r = obj(raw);
    if (r === null || !code(r.cycleId) || !Number.isSafeInteger(r.atMs) || (r.atMs as number) < 0) continue;
    if (r.kind === "cycle" && ["mantido", "decidido", "bloqueado", "erro"].includes(r.outcome as string) && (r.reason === null || code(r.reason))) cycles.set(r.cycleId, r);
    if (r.kind === "order" && code(r.orderKey) && ["preparada", "enviando", "executada", "falhou", "incerta"].includes(r.stage as string)) orders.set(r.orderKey, r);
  }
  const reviewed: Record<string, string> = { ...cursor.reviewed };
  const reviews: CycleAudit[] = [];
  let latestCycleId = cursor.latestCycleId;
  for (const [cycleId, r] of cycles) {
    const consultation = byConsult.get(cycleId) ?? null;
    const current: CycleAudit = { cycleId, atMs: r.atMs as number, outcome: r.outcome as string, reason: r.reason as string | null,
      consulted: typeof r.modelo === "string", consultation,
      orders: [...orders.values()].filter(o => o.cycleId === cycleId).map(o => ({ stage: o.stage as string,
        proof: o.stage === "executada" && o.reason === "recibo_sucesso" ? "provider_receipt" : o.reason === "resolvida_pelo_usuario" ? "user_report" : "not_confirmed" })),
    };
    const digest = hash(current);
    if (reviewed[cycleId] !== digest) reviews.push(current);
    delete reviewed[cycleId]; reviewed[cycleId] = digest;
    latestCycleId = cycleId;
  }
  const sourceGap = cursor.latestCycleId !== null && cycles.size > 0 && !cycles.has(cursor.latestCycleId);
  const kept = Object.fromEntries(Object.entries(reviewed).slice(-2000));
  return { reviews, sourceGap, cursor: { version: 1, latestCycleId, reviewed: kept,
    consultations: Object.fromEntries([...byConsult].filter(([id]) => Object.hasOwn(kept, id)).slice(-2000)) } };
}

/** Bounded read of local evidence only. An incomplete last line is deferred until the next run. */
export async function evidenceTail(path: string, maxBytes = 2_000_000): Promise<{ rows: unknown[]; invalid: number; truncated: boolean; incompleteFinalLine: boolean }> {
  const file = Bun.file(path);
  if (!(await file.exists())) return { rows: [], invalid: 0, truncated: false, incompleteFinalLine: false };
  const size = file.size;
  const start = Math.max(0, size - maxBytes);
  const body = await file.slice(start, size).text();
  const lines = body.split("\n");
  if (start > 0) lines.shift();
  const incompleteFinalLine = Boolean(lines.pop()?.trim());
  const rows: unknown[] = []; let invalid = 0;
  for (const line of lines) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch { invalid++; } }
  return { rows, invalid, truncated: start > 0, incompleteFinalLine };
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const home = absoluteArg(args, "--home");
  if (home === null) throw new Error("review_home_required");
  const out = absoluteArg(args, "--out") ?? resolve(import.meta.dir, "..", "..", "data", "decision-review");
  mkdirSync(out, { recursive: true });
  // Only this auditor's lock, never the agent's financial LOCK. A competing review simply exits.
  const lockPath = join(out, "review.lock");
  let lock: number;
  try { lock = openSync(lockPath, "wx"); } catch { console.log(JSON.stringify({ busy: true })); return; }
  try {
    const statePath = join(out, "cursor.json");
    const saved = Bun.file(statePath);
    const cursor = await saved.exists() ? parseCursor(await saved.json()) : emptyCursor();
    if (cursor === null) throw new Error("review_cursor_invalid");
    const ledger = await evidenceTail(join(home, "data", "agent", "ledger.jsonl"));
    const consults = await evidenceTail(join(home, "data", "agent", "briefs.jsonl"));
    const result = reviewCycles(ledger.rows, consults.rows, cursor);
    const report = { version: 1, observedAt: new Date().toISOString(), sourceGap: result.sourceGap, invalidLines: ledger.invalid + consults.invalid,
      sourceIncompleteFinalLine: ledger.incompleteFinalLine || consults.incompleteFinalLine,
      sourceWindowTruncated: ledger.truncated || consults.truncated, purchases: summarizePurchases(Object.values(result.cursor.consultations ?? {})), reviews: result.reviews };
    // Write report before cursor. A crash may repeat an audit but cannot mark unwritten work as reviewed.
    if (result.reviews.length > 0) appendFileSync(join(out, "audits.jsonl"), result.reviews.map(r => JSON.stringify({ observedAt: report.observedAt, ...r })).join("\n") + "\n");
    if (result.reviews.length > 0 || report.sourceGap || report.invalidLines > 0) await Bun.write(join(out, "latest.json"), JSON.stringify(report, null, 2) + "\n");
    await Bun.write(join(out, "cursor.next.json"), JSON.stringify(result.cursor) + "\n");
    renameSync(join(out, "cursor.next.json"), statePath);
    console.log(JSON.stringify({ newOrUpdatedCycles: result.reviews.length, sourceGap: result.sourceGap, invalidLines: report.invalidLines,
      consulted: result.reviews.filter(r => r.consulted).length, purchases: report.purchases, findings: [...new Set(result.reviews.flatMap(r => r.consultation?.findings ?? []))] }));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

if (import.meta.main) { try { await main(); } catch { console.error("decision_review_failed"); process.exitCode = 1; } }
