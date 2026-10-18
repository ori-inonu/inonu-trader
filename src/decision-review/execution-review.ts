import { appendFileSync, closeSync, mkdirSync, openSync, renameSync, unlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { absoluteArg } from "../local-host/args";
import { createSolanaReceiptReader } from "../server/solana-receipts";
import { evidenceTail } from "./review";
import { auditExecutions, emptyReceiptCache, parseReceiptCache, refreshReceiptCache, selectOrders, RECEIPT_ADAPTER } from "./executions";

/** Read current public binding only. Credentials and wallet account material are never read. */
export function walletBinding(raw: unknown): { wallet: string; kind: "agente" | "principal" } | null {
  if (raw === null || typeof raw !== "object") return null;
  const managed = (raw as { managed?: unknown }).managed;
  if (managed === null || typeof managed !== "object") return null;
  const m = managed as { kind?: unknown; solana?: unknown };
  if ((m.kind !== "agentica" && m.kind !== "propria") || typeof m.solana !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m.solana)) return null;
  return { wallet: m.solana, kind: m.kind === "agentica" ? "agente" : "principal" };
}

export function ownOutput(home: string, out: string): boolean {
  const rel = relative(resolve(home), resolve(out));
  // The auditor must never put its own lock, cache or reports anywhere inside the financial home.
  return rel !== "" && (rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || resolve(home).slice(0, 2).toLowerCase() !== resolve(out).slice(0, 2).toLowerCase());
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2), home = absoluteArg(args, "--home");
  if (home === null) throw new Error("execution_review_home_required");
  const out = absoluteArg(args, "--out") ?? resolve(import.meta.dir, "..", "..", "data", "decision-review");
  if (!ownOutput(home, out)) throw new Error("execution_review_separate_output_required");
  const binding = walletBinding(await Bun.file(join(home, "data", "agent", "config.json")).json());
  if (binding === null) throw new Error("execution_review_wallet_binding_required");
  mkdirSync(out, { recursive: true });
  const lockPath = join(out, "execution-review.lock"); let lock: number;
  try { lock = openSync(lockPath, "wx"); } catch { console.log(JSON.stringify({ busy: true })); return; }
  try {
    const cachePath = join(out, "receipt-cache.json"), cacheFile = Bun.file(cachePath);
    const cache = await cacheFile.exists() ? parseReceiptCache(await cacheFile.json()) : emptyReceiptCache();
    if (cache === null) throw new Error("execution_review_cache_invalid");
    const ledgerPath = join(home, "data", "agent", "ledger.jsonl");
    if (!(await Bun.file(ledgerPath).exists())) throw new Error("execution_review_ledger_missing");
    const ledger = await evidenceTail(ledgerPath);
    const selected = selectOrders(ledger.rows, binding.kind), nowMs = Date.now();
    const refreshed = await refreshReceiptCache(selected.orders, binding.wallet, cache, createSolanaReceiptReader({ fetch, timeoutMs: 8000 }), nowMs);
    const completeLedger = !ledger.truncated && !ledger.incompleteFinalLine && ledger.invalid === 0 && selected.invalidOrderRows === 0;
    const audited = auditExecutions(selected, refreshed.evidence, completeLedger);
    const payload = { version: 1, adapter: RECEIPT_ADAPTER, wallet: binding.wallet, scope: "agent_ledger_exact_signatures", completeLedger,
      invalidLines: ledger.invalid, incompleteFinalLine: ledger.incompleteFinalLine, invalidOrderRows: selected.invalidOrderRows, ...audited };
    const fingerprint = new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex");
    const latest = Bun.file(join(out, "execution-latest.json"));
    const previous = await latest.exists() ? await latest.json() as { fingerprint?: string } : null;
    const changed = previous?.fingerprint !== fingerprint;
    const report = { ...payload, fingerprint, observedAtMs: nowMs,
      limitations: ["cash_is_not_usd_profit", "native_costs_unpriced", "affected_accounts_are_not_whole_wallet", "current_wallet_binding_and_local_ledger_basis", "no_external_wallet_history_or_tax_basis"] };
    // Reports before the cache. A crash can duplicate an observation; it cannot silently mark an unwritten result as reported.
    if (changed) {
      appendFileSync(join(out, "execution-audits.jsonl"), JSON.stringify(report) + "\n");
      await Bun.write(join(out, "execution-latest.next.json"), JSON.stringify(report, null, 2) + "\n");
      renameSync(join(out, "execution-latest.next.json"), join(out, "execution-latest.json"));
    }
    await Bun.write(join(out, "receipt-cache.next.json"), JSON.stringify(refreshed.cache) + "\n");
    renameSync(join(out, "receipt-cache.next.json"), cachePath);
    console.log(JSON.stringify({ changed, lookups: refreshed.lookups, completeLedger, orders: audited.orders.length,
      confirmedFills: audited.orders.filter(o => o.fill !== null).length, roundTrips: audited.roundTrips.map(r => ({ quoteMint: r.quoteMint, cashFlow: r.cashFlow, walletFeeLamports: r.walletFeeLamports, nativeDeltaLamports: r.nativeDeltaLamports, netUsd: r.netUsd })),
      salesWithoutMatchedEntry: audited.orders.filter(o => o.outcome === "sale_without_matched_entry").length,
      issues: [...new Set(audited.orders.map(o => o.issue).filter(Boolean))] }));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

if (import.meta.main) { try { await main(); } catch { console.error("execution_review_failed"); process.exitCode = 1; } }
