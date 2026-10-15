/**
 * Settling an order that was sent and never answered, with no person in the loop, and ONLY on proof. A swap that timed out, or whose refusal proved nothing, is `incerta`: the agent never sends it again. A
 * balance or a clock does not say whether it went out (a deposit of the same size looks like a purchase, a manual exit like a sale, a balance lags, a transaction can sit pending for hours), so neither settles
 * anything. What settles it is a receipt in the signing tool's own history (receipt.ts): SUCCESS means it went out, ERROR or CANCELLED means it did not and may be sent again, PENDING means wait. An order that
 * carries a transaction hash or an order id is looked up by it; one that never got one is looked up by the token in a time window and settles only when exactly one entry involves it. Anything else stays unknown
 * and is asked about again, never guessed: the person's word on the screen remains the way out for what the history cannot tell. The lookup is injected; this module touches no process. Pure apart from it.
 */
import type { OrderRecord } from "./ledger";
import type { ReceiptStatus } from "./receipt";

export interface Reconciliation {
  readonly orderKey: string;
  readonly outcome: "executada" | "falhou";
  /** A constant code. */
  readonly reason: "recibo_sucesso" | "recibo_erro" | "recibo_recuperado";
  /** The transaction reference found for an order that never carried one (`recibo_recuperado`); absent otherwise. */
  readonly ref?: string;
}

/** What the history says about one order: a receipt status, or null when it says nothing usable. */
export type ReceiptLookup = (order: OrderRecord, signal: AbortSignal) => Promise<ReceiptStatus | null>;

/**
 * For an order that never carried a reference (the tool refused after the broadcast and printed none): the one transaction on the chain that only this order could have made, or null. The lookup is injected; it
 * has to bind the transaction to the agent's own signature and to the token and the amount of the order, and answer only when exactly one matches. It never sends anything.
 */
export type RefRecovery = (order: OrderRecord, signal: AbortSignal) => Promise<{ readonly ref: string } | null>;

/** The same order is looked up at most this often, and a pass asks about at most this many orders: the history is a call of the tool with a quota of its own. */
export const LOOKUP_EVERY_MS = 60_000;
export const MAX_LOOKUPS_PER_PASS = 5;

export interface ReconcileMemory {
  /** When each order (by key) was last looked up. */
  readonly lastTry: Map<string, number>;
}

export const newReconcileMemory = (): ReconcileMemory => ({ lastTry: new Map() });

export async function settleByReceipts(inFlight: readonly OrderRecord[], lookup: ReceiptLookup, nowMs: number, memory: ReconcileMemory, signal: AbortSignal, recover?: RefRecovery): Promise<readonly Reconciliation[]> {
  const out: Reconciliation[] = [];
  let asked = 0;
  for (const o of inFlight) {
    if ((o.stage !== "enviando" && o.stage !== "incerta") || o.wallet !== "agente") continue;
    if (signal.aborted || asked >= MAX_LOOKUPS_PER_PASS) break;
    const last = memory.lastTry.get(o.orderKey);
    if (last !== undefined && nowMs - last < LOOKUP_EVERY_MS) continue;
    memory.lastTry.set(o.orderKey, nowMs);
    asked++;
    if (o.ref === null && recover !== undefined) {
      let recovered: { readonly ref: string } | null = null;
      try {
        recovered = await recover(o, signal);
      } catch {
        recovered = null;
      }
      if (recovered !== null) {
        out.push({ orderKey: o.orderKey, outcome: "executada", reason: "recibo_recuperado", ref: recovered.ref });
        continue;
      }
    }
    let status: ReceiptStatus | null = null;
    try {
      status = await lookup(o, signal);
    } catch {
      status = null;
    }
    if (status === "success") out.push({ orderKey: o.orderKey, outcome: "executada", reason: "recibo_sucesso" });
    else if (status === "failed") out.push({ orderKey: o.orderKey, outcome: "falhou", reason: "recibo_erro" });
  }
  return out;
}
