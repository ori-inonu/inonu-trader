const OPPORTUNITY_EVENT_KINDS = ["new_candidate", "price_changed", "liquidity_changed", "risk_changed", "fill_confirmed"] as const;
export interface OpportunityEvent {
  readonly assetKey: string;
  readonly source: string;
  readonly kind: (typeof OPPORTUNITY_EVENT_KINDS)[number];
  /** Source observation time, not the time an old cache was read again. */
  readonly observedAtMs: number;
  /** Digest of normalized material facts, excluding transport/arrival timestamps. */
  readonly fingerprint: string;
}
/** Only exact versions of events from the offered batch can be acknowledged. */
export type VersionedEventReviewAck<E> = { readonly reviewed: readonly E[] };
export type OpportunityReviewAck = VersionedEventReviewAck<OpportunityEvent>;

/** A pure codec owns its identity and detaches exactly its flat data fields.
 * It must not read a clock or retain mutable input references. */
export interface VersionedEventCodec<E extends { readonly observedAtMs: number }> {
  readonly parse: (raw: unknown) => E | null;
  readonly key: (event: E) => string;
  readonly fingerprint: (event: E) => string;
  readonly same: (a: E | undefined, b: E) => boolean;
}

export interface VersionedEventDispatcherDeps<E extends { readonly observedAtMs: number }> {
  readonly codec: VersionedEventCodec<E>;
  readonly now: () => number;
  readonly allowed: () => boolean;
  /** Literal true reviews the original batch, false none; partial ACKs name
   * exact versions. Sharing an earlier review is not consumption. */
  readonly request: (batch: readonly E[]) => Promise<boolean | VersionedEventReviewAck<E>>;
  readonly maxAgeMs?: number;
  readonly maxKeys?: number;
}

const isAsset = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  const parts = v.split(":");
  return parts.length === 3 && parts[0] === "token" && /^[1-9]\d{0,11}$/.test(parts[1]!) && (parts[2] === "native" || (parts[1] === "501" ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(parts[2]!) : /^0x[0-9a-f]{40}$/.test(parts[2]!)));
};

export function parseOpportunityEvent(raw: unknown): OpportunityEvent | null {
  let r: Record<string, unknown> | null;
  try { r = readEventDataFields(raw, eventFields); } catch { return null; }
  if (r === null || Object.keys(r).length !== 5 || !["assetKey", "source", "kind", "observedAtMs", "fingerprint"].every(k => Object.hasOwn(r, k)) || !isAsset(r.assetKey) || typeof r.source !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(r.source) || !(OPPORTUNITY_EVENT_KINDS as readonly unknown[]).includes(r.kind) || !Number.isSafeInteger(r.observedAtMs) || (r.observedAtMs as number) < 0 || typeof r.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(r.fingerprint)) return null;
  return { assetKey: r.assetKey, source: r.source, kind: r.kind as OpportunityEvent["kind"], observedAtMs: r.observedAtMs as number, fingerprint: r.fingerprint };
}

const eventKey = (e: OpportunityEvent) => `${e.assetKey}|${e.source}|${e.kind}`;
const sameEvent = (a: OpportunityEvent | undefined, b: OpportunityEvent) => a !== undefined && a.assetKey === b.assetKey && a.source === b.source && a.kind === b.kind && a.observedAtMs === b.observedAtMs && a.fingerprint === b.fingerprint;
const eventFields = ["assetKey", "source", "kind", "observedAtMs", "fingerprint"] as const;

/** Detach data fields without invoking getters/toJSON. Descriptor traps can
 * still throw; this validation is not an object sandbox or source signature. */
export function readEventDataFields(raw: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== fields.length || keys.some(k => typeof k !== "string" || !fields.includes(k))) return null;
  const entries: [string, unknown][] = [];
  for (const k of fields) {
    const d = Object.getOwnPropertyDescriptor(raw, k);
    if (!d || !d.enumerable || !Object.hasOwn(d, "value")) return null;
    entries.push([k, d.value]);
  }
  return Object.fromEntries(entries);
}

function reviewedEvents<E extends { readonly observedAtMs: number }>(raw: unknown, original: readonly E[], codec: VersionedEventCodec<E>, parse: (raw: unknown) => E | null, same: (a: E | undefined, b: E) => boolean): readonly E[] | null {
  if (raw === true) return original;
  if (raw === false) return [];
  try {
    const ack = readEventDataFields(raw, ["reviewed"]);
    if (!ack || !Array.isArray(ack.reviewed) || Object.getPrototypeOf(ack.reviewed) !== Array.prototype) return null;
    const array = ack.reviewed, length = Object.getOwnPropertyDescriptor(array, "length");
    if (!length || !Object.hasOwn(length, "value") || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > original.length) return null;
    const keys = Reflect.ownKeys(array);
    if (keys.length !== length.value + 1 || keys.some(k => typeof k !== "string" || k !== "length" && !/^(0|[1-9]\d*)$/.test(k))) return null;
    const originals = new Map(original.map(e => [codec.key(e), e])), seen = new Set<string>(), reviewed: E[] = [];
    for (let i = 0; i < length.value; i++) {
      const d = Object.getOwnPropertyDescriptor(array, String(i));
      if (!d || !d.enumerable || !Object.hasOwn(d, "value")) return null;
      const e = parse(d.value);
      if (!e || seen.has(codec.key(e)) || !same(originals.get(codec.key(e)), e)) return null;
      seen.add(codec.key(e)); reviewed.push(e);
    }
    return reviewed;
  } catch { return null; }
}

/** Dispatches fresh facts, not orders or buy/sell judgments. The owner connects it to the SAME scheduler, receipt journal and provider admission. */
export function createVersionedEventDispatcher<E extends { readonly observedAtMs: number }>(deps: VersionedEventDispatcherDeps<E>) {
  const codec = deps.codec;
  const parse = (raw: unknown): E | null => {
    try {
      const e = codec.parse(raw);
      if (e === null || !Number.isSafeInteger(e.observedAtMs) || e.observedAtMs < 0 || typeof codec.key(e) !== "string" || codec.key(e).length === 0 || typeof codec.fingerprint(e) !== "string" || codec.fingerprint(e).length === 0) return null;
      return e;
    } catch { return null; }
  };
  const same = (a: E | undefined, b: E): boolean => {
    try { return a !== undefined && a.observedAtMs === b.observedAtMs && codec.key(a) === codec.key(b) && codec.fingerprint(a) === codec.fingerprint(b) && codec.same(a, b) === true; } catch { return false; }
  };
  const maxAgeMs = deps.maxAgeMs ?? 60_000, maxKeys = deps.maxKeys ?? 128;
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 || !Number.isSafeInteger(maxKeys) || maxKeys < 1 || maxKeys > 2048) throw new Error("event_dispatch_config_invalid");
  const pending = new Map<string, E>();
  // A batch not yet confirmed as reviewed still owns its slots. New versions of
  // those keys can coalesce, but unrelated arrivals cannot overfill restoration.
  const reviewing = new Map<string, E>();
  const seen = new Map<string, E>();
  let stopped = false, flight: Promise<void> | null = null, awaitingWake = false;
  const key = (e: E) => codec.key(e);
  const fresh = (e: E) => deps.now() >= e.observedAtMs && deps.now() - e.observedAtMs <= maxAgeMs;
  const remember = (k: string, e: E) => { seen.delete(k); seen.set(k, e); while (seen.size > maxKeys * 2) seen.delete(seen.keys().next().value!); };
  const restore = (batch: readonly E[]) => {
    if (stopped) return;
    for (const e of batch) { const k = key(e); if (!pending.has(k) && fresh(e)) pending.set(k, e); }
  };

  async function drain(): Promise<void> {
    while (!stopped) {
      for (const [k, e] of pending) if (!fresh(e)) pending.delete(k);
      if (pending.size === 0) return;
      let allowed = false;
      try { allowed = deps.allowed(); } catch { /* unavailable readiness does not grant admission */ }
      if (!allowed) { awaitingWake = true; return; }
      const batch = [...pending.values()]; pending.clear();
      for (const e of batch) reviewing.set(key(e), e);
      let reply: unknown = false;
      // The callback receives detached copies. Mutating its offered events must
      // not rewrite the internal versions against which its ACK is checked.
      try { reply = await deps.request(batch.map(e => ({ ...e }))); } catch { /* failure is unknown; preserve the event until a readiness change */ }
      const latest = [...reviewing.values()]; reviewing.clear();
      if (stopped) return;
      const reviewed = reviewedEvents(reply, batch, codec, parse, same), confirmed = new Map((reviewed ?? []).map(e => [key(e), e]));
      const unreviewed = latest.filter(e => !same(confirmed.get(key(e)), e));
      restore(unreviewed);
      // A partial/unknown review or a newer temporal observation needs explicit
      // readiness. Never busy-loop the same unreviewed facts. Pending newer
      // fingerprints are not removed by an older version's acknowledgement.
      if (reviewed === null || reviewed.length < batch.length || unreviewed.length > 0) { awaitingWake = true; return; }
    }
  }

  function start(): void {
    if (stopped || flight !== null || awaitingWake || pending.size === 0) return;
    // A microtask combines events arriving together without adding an arbitrary multi-second delay.
    const work = Promise.resolve().then(drain);
    flight = work;
    const clear = () => { if (flight === work) flight = null; };
    work.then(clear, clear);
  }

  return {
    notify(raw: unknown): "accepted" | "duplicate" | "stale" | "invalid" | "stopped" | "queue_full" {
      if (stopped) return "stopped";
      const e = parse(raw); if (e === null || e.observedAtMs > deps.now()) return "invalid";
      if (!fresh(e)) return "stale";
      const k = key(e), previous = seen.get(k);
      if (previous !== undefined && e.observedAtMs < previous.observedAtMs) return "stale";
      if (previous !== undefined && codec.fingerprint(previous) === codec.fingerprint(e)) {
        // Only a fresh PROVIDER observation can renew an unreviewed fact. Reading
        // an old cache must preserve the original observedAtMs supplied here.
        if (pending.has(k)) pending.set(k, e);
        const current = reviewing.get(k);
        if (current !== undefined && codec.fingerprint(current) === codec.fingerprint(e)) reviewing.set(k, e);
        remember(k, e);
        return "duplicate";
      }
      const resident = pending.size + [...reviewing.keys()].filter(id => !pending.has(id)).length;
      if (!pending.has(k) && !reviewing.has(k) && resident >= maxKeys) return "queue_full";
      remember(k, e); pending.set(k, e); start(); return "accepted";
    },
    /** Called on provider/budget readiness or completion of a cycle that could not consume the event. */
    wake(): void { awaitingWake = false; start(); },
    stop(): void { stopped = true; pending.clear(); },
    async idle(): Promise<void> { if (flight !== null) await flight; },
    status() { return { running: flight !== null, queued: pending.size, awaitingWake, stopped }; },
  };
}

/** Token compatibility wrapper over the same queue used by macro contexts. */
export function createOpportunityDispatcher(deps: Omit<VersionedEventDispatcherDeps<OpportunityEvent>, "codec">) {
  return createVersionedEventDispatcher({ ...deps, codec: { parse: parseOpportunityEvent, key: eventKey, fingerprint: e => e.fingerprint, same: sameEvent } });
}
