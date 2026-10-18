import { createVersionedEventDispatcher, readEventDataFields, type VersionedEventDispatcherDeps, type VersionedEventReviewAck } from "./events";

/** Macro market context is not a token, account or trading authorization.
 * observedAtMs is the local observation clock; exchange time belongs in facts. */
export interface ContextOpportunityEvent {
  readonly contextKey: string;
  readonly source: "okx-public-trades";
  readonly kind: "market_regime";
  readonly observedAtMs: number;
  readonly factHash: string;
}
export type ContextReviewAck = VersionedEventReviewAck<ContextOpportunityEvent>;

const fields = ["contextKey", "source", "kind", "observedAtMs", "factHash"] as const;
const pair = "[A-Z0-9]{1,20}-[A-Z0-9]{1,20}";
const spot = new RegExp(`^okx:SPOT:${pair}$`);
const swap = new RegExp(`^okx:SWAP:${pair}-SWAP$`);
const future = new RegExp(`^okx:FUTURES:${pair}-([0-9]{2})([0-9]{2})([0-9]{2})$`);

function contextKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (spot.test(value) || swap.test(value)) return true;
  const date = future.exec(value);
  if (date === null) return false;
  const year = 2000 + Number(date[1]), month = Number(date[2]), day = Number(date[3]);
  const days = [31, year % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}

/** Detaches exactly five ordinary data properties, with no getter/toJSON call.
 * Syntax consistency does not prove that the exchange lists this instrument. */
export function parseContextOpportunityEvent(raw: unknown): ContextOpportunityEvent | null {
  let r: Record<string, unknown> | null;
  try { r = readEventDataFields(raw, fields); } catch { return null; }
  if (r === null || !contextKey(r.contextKey) || r.source !== "okx-public-trades" || r.kind !== "market_regime" || !Number.isSafeInteger(r.observedAtMs) || (r.observedAtMs as number) < 0 || typeof r.factHash !== "string" || !/^[a-f0-9]{64}$/.test(r.factHash)) return null;
  return { contextKey: r.contextKey, source: r.source, kind: r.kind, observedAtMs: r.observedAtMs as number, factHash: r.factHash };
}

export function createContextOpportunityDispatcher(deps: Omit<VersionedEventDispatcherDeps<ContextOpportunityEvent>, "codec">) {
  return createVersionedEventDispatcher({ ...deps, codec: {
    parse: parseContextOpportunityEvent,
    key: e => `${e.contextKey}|${e.source}|${e.kind}`,
    fingerprint: e => e.factHash,
    same: (a, b) => a !== undefined && a.contextKey === b.contextKey && a.source === b.source && a.kind === b.kind && a.observedAtMs === b.observedAtMs && a.factHash === b.factHash,
  } });
}
