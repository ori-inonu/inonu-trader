import { randomUUID } from "node:crypto";
import { preflightCapture } from "./plan";
import type { AccessReceipt, CapturePlan, Instrument, RuntimeCapabilities } from "./plan";
import { CaptureStore, containedTarget, hash, readCapture } from "./store";
import type { RawRecord } from "./store";
import { Observations } from "./observations";
import type { TransportEvent } from "./observations";
import { IngressBudget } from "./ingress";
import type { Reservation } from "./ingress";
export interface CaptureClock { identity: string; sample(): { wallMs: number; monoNs: string }; wait(ms: number, signal: AbortSignal): Promise<void>; offsetMs: number | null; uncertaintyMs: number | null }
export interface TransportContext { ingress: IngressBudget }
export interface CaptureTransport { capabilities: RuntimeCapabilities; requestMetadata(instrument: Instrument, signal: AbortSignal, emit: (event: TransportEvent) => void, context: TransportContext): Promise<void>; connect(plan: CapturePlan, attempt: number, signal: AbortSignal, emit: (event: TransportEvent) => void, context: TransportContext): Promise<{ closed: Promise<{ reason: string; retryable: boolean }>; abort(): void }> }
export interface CaptureDependencies { access?: AccessReceipt | null; clock?: CaptureClock; transport: CaptureTransport; signal?: AbortSignal }
export const localClock = (): CaptureClock => ({ identity: randomUUID(), sample: () => ({ wallMs: Date.now(), monoNs: String(process.hrtime.bigint()) }), wait: (ms, signal) => new Promise((resolve, reject) => { if (signal.aborted) return reject(Error("cancelled")); const abort = () => { clearTimeout(timer); reject(Error("cancelled")); }; const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms); signal.addEventListener("abort", abort, { once: true }); }), offsetMs: null, uncertaintyMs: null });
const baseCounts = () => ({ completeReceived: 0, accepted: 0, rejected: 0, rawPrepared: 0, completeRejectedWithoutRaw: 0, persistedRaw: 0, unpersistedRaw: 0, incompleteTransportAssemblies: 0, dropped: 0, controlRecords: 0 });
function refused(reason: string): any { return { version: 1, outcome: "not_started", stopReason: reason, start: null, end: null, durationNs: null, attempts: 0, metadataRequests: 0, streams: [], connections: [], counts: baseCounts(), encodedBytes: 0, segments: 0, source: null, schema: null, accessReceipt: null, runtime: null, clock: null, diagnostics: { gaps: [], duplicates: 0, heartbeats: 0, resets: 0 }, incompleteRecords: 0, parentExperimentId: null, restartGap: false, finalTiming: null, strategyQualified: false, executionQualified: false, profitEvidence: false, powerLossQualified: false, globalAvailableAt: null }; }

/** One finite experiment. Injected adapters are external test/runtime seams, never authority. */
export async function runCapture(input: unknown, dependencies: CaptureDependencies): Promise<any> {
  const clock = dependencies.clock ?? localClock();
  let initial: ReturnType<CaptureClock["sample"]>;
  try { initial = clock.sample(); } catch { return refused("clock_unavailable"); }
  const preflight = preflightCapture(input, dependencies.access, dependencies.transport?.capabilities, initial.wallMs);
  if (!preflight.ok) return refused(preflight.reason);
  if (!/^(0|[1-9]\d*)$/.test(initial.monoNs) || !Number.isSafeInteger(initial.wallMs) || !clock.identity || ![clock.offsetMs, clock.uncertaintyMs].every(v => v === null || Number.isFinite(v))) return refused("invalid_clock_capability");
  const { plan, access, runtime } = preflight;
  let target: string;
  try { target = containedTarget(plan); } catch (e) { return refused(e instanceof Error ? e.message : "path_failure"); }
  if (dependencies.signal?.aborted) return refused("cancelled_before_start");
  const processId = randomUUID(), sessionId = randomUUID();
  const counts = baseCounts(), obs = new Observations(plan, processId);
  const connections: any[] = [];
  const ingress = new IngressBudget(plan.limits), context = { ingress }, reservations = new WeakMap<RawRecord, Reservation>();
  let start: typeof initial, end = initial, lastMono = BigInt(initial.monoNs), deadline = 0n, cancelDeadline: bigint | null = null;
  let previousWall: number | null = null, ordinal = 0, attempts = 0, metadataRequests = 0, connectionId = "metadata", requestStart: any = null;
  let stopReason = "completed", failure = false, stopped = false, clockAmbiguous = false, store: CaptureStore | null = null;
  const controller = new AbortController();
  const sample = () => {
    const v = clock.sample(); end = v;
    if (!Number.isSafeInteger(v.wallMs) || !/^(0|[1-9]\d*)$/.test(v.monoNs) || BigInt(v.monoNs) < lastMono) throw Error("invalid_monotonic_clock");
    lastMono = BigInt(v.monoNs); return v;
  };
  const assertTime = () => {
    sample();
    const limit = cancelDeadline !== null && cancelDeadline < deadline ? cancelDeadline : deadline;
    if (lastMono >= limit) throw Error(lastMono > limit ? "deadline_overshoot" : "deadline_exhausted");
  };
  const stop = (reason: string, failed = false) => { if (!stopped) stopReason = reason; stopped = true; failure ||= failed; controller.abort(); };
  const cancel = () => { try { sample(); cancelDeadline = lastMono + 5000000000n; } catch { failure = true; } stop("cancelled"); };
  dependencies.signal?.addEventListener("abort", cancel, { once: true });
  const queue: RawRecord[] = []; let pendingBytes = 0; let flush: Promise<void> | null = null;
  // Coalesce control regressions until the next raw callback. That raw carries
  // the boundary; a terminal control boundary is drained after earlier raws.
  let pendingControlRegression = false;
  const closeClockInterval = () => { obs.quarantineAll("clock_ambiguous"); store!.rotate("wall_regression", "clock_ambiguous"); };
  const drain = async () => {
    while (queue.length) {
      const r = queue.shift()!; pendingBytes -= r.payloadBytes;
      try {
        if (r.wallRegression) closeClockInterval();
        const decision = r.clockRejected ? { accepted: false, reason: "invalid_monotonic_clock" } : r.obsoleteConnection ? { accepted: false, reason: "obsolete_connection" } : obs.inspect(r.event, r.payloadHash, r.reception, r.payloadBase64);
        Object.assign(r, decision); delete r.event; delete r.clockRejected; delete r.wallRegression; delete r.obsoleteConnection;
        if (decision.accepted) counts.accepted++; else counts.rejected++;
        if (decision.closeSegment) store!.rotate(decision.reason);
        store!.append(r); counts.persistedRaw = store!.persistedRaw;
        if (decision.stop) stop(decision.reason);
      } catch (e) {
        // Partition is determined once even when storage fails before/after the append.
        if (r.accepted === undefined) { r.accepted = false; r.reason = "persistence_interrupted"; counts.rejected++; }
        counts.persistedRaw = store?.persistedRaw ?? 0;
        stop(e instanceof Error ? e.message : "storage_failure", true);
      }
      const reservation = reservations.get(r); if (reservation) ingress.release(reservation);
      await Promise.resolve();
      if (failure) break;
    }
    if (!failure && pendingControlRegression) { pendingControlRegression = false; closeClockInterval(); }
  };
  const schedule = () => { if (!flush) flush = Promise.resolve().then(drain).finally(() => { flush = null; }); };
  const emit = (event: TransportEvent, originatingConnection = connectionId) => {
    if (stopped) { if (event.type === "message" && event.reservation) ingress.release(event.reservation); return; }
    if (event.type === "control") {
      try {
        if (![8, 9, 10].includes(event.opcode) || event.payload.byteLength > 125) throw Error("invalid_websocket_control");
        const reception = { ...sample(), ordinal: ++ordinal, processId, sessionId, clockId: clock.identity, clockSampleId: `${clock.identity}:${ordinal}` };
        const wallRegression = previousWall !== null && reception.wallMs < previousWall;
        previousWall = reception.wallMs;
        if (wallRegression) { clockAmbiguous = true; pendingControlRegression = true; }
        const bytes = Buffer.from(event.payload.buffer, event.payload.byteOffset, event.payload.byteLength);
        store!.control({ kind: "websocket_control", opcode: event.opcode, payloadBytes: bytes.length, payloadBase64: bytes.toString("base64"), payloadHash: hash(bytes), encoding: "websocket_control_binary", reception, connectionId: originatingConnection, wallRegression });
        if (wallRegression) schedule();
      } catch (e) { stop(e instanceof Error ? e.message : "control_failure", true); }
      return;
    }
    if (event.type === "incomplete") {
      counts.incompleteTransportAssemblies += event.units ?? 1;
      try { store!.control({ kind: "transport_rejection", reason: event.reason, size: event.size, provenance: event.provenance, completeHash: null, callbackTime: null, connectionId: originatingConnection }); } catch (e) { failure = true; }
      obs.gaps.push(event.reason); stop(event.reason); return;
    }
    counts.completeReceived++; ordinal++;
    let reception: any, clockRejected = false;
    try { const v = sample(); reception = { ...v, ordinal, processId, sessionId, clockId: clock.identity, clockSampleId: `${clock.identity}:${ordinal}`, requestStart }; }
    catch { reception = { ...end, ordinal, processId, sessionId, clockId: clock.identity, clockSampleId: `${clock.identity}:${ordinal}`, requestStart }; clockRejected = true; stop("invalid_monotonic_clock", true); }
    const wallRegression = pendingControlRegression || (previousWall !== null && reception.wallMs < previousWall);
    if (wallRegression) clockAmbiguous = true;
    previousWall = reception.wallMs;
    const byteLength = typeof event.payload === "string" ? Buffer.byteLength(event.payload, "utf8") : event.payload.byteLength;
    let reservation = event.reservation, pressure: string | null = null;
    if (byteLength <= plan.limits.payloadBytes && counts.rawPrepared < plan.limits.messages) {
      try {
        reservation ??= ingress.open();
        if (!event.reservation) ingress.grow(reservation, byteLength);
        // Admit the owned callback copy and encoded raw representation before
        // allocation. The source body remains charged until this record drains.
        ingress.grow(reservation, byteLength);
        ingress.grow(reservation, 4 * Math.ceil(byteLength / 3));
      }
      catch (e) { pressure = (e as Error).message; }
    }
    if (byteLength > plan.limits.payloadBytes || counts.rawPrepared >= plan.limits.messages || pressure || queue.length >= plan.limits.pending || pendingBytes + byteLength > plan.limits.ingressBytes) {
      if (reservation) ingress.release(reservation);
      counts.completeRejectedWithoutRaw++; counts.rejected++;
      const reason = byteLength > plan.limits.payloadBytes ? "payload_limit" : counts.rawPrepared >= plan.limits.messages ? "message_limit" : pressure ?? "backpressure_limit";
      try { store!.control({ kind: "complete_rejection", ordinal, size: byteLength, provenance: "observed_complete", reason }); } catch { failure = true; }
      obs.gaps.push(reason); stop(reason); return;
    }
    const bytes = typeof event.payload === "string" ? Buffer.from(event.payload, "utf8") : Buffer.from(event.payload);
    const retainedEvent = { type: "message", source: event.source, instrument: event.instrument, payload: bytes };
    const r: RawRecord = { kind: "raw", payloadBase64: bytes.toString("base64"), payloadBytes: bytes.length, payloadHash: hash(bytes), encoding: typeof event.payload === "string" ? "runtime_text_utf8" : "application_binary", source: event.source, connectionId: originatingConnection, segmentId: originatingConnection, reception, event: retainedEvent, clockRejected, wallRegression, obsoleteConnection: originatingConnection !== connectionId };
    pendingControlRegression = false;
    reservations.set(r, reservation!); counts.rawPrepared++; queue.push(r); pendingBytes += bytes.length; schedule();
  };
  const operation = async <T>(work: (signal: AbortSignal) => Promise<T>, retainSignal = false): Promise<T> => {
    assertTime();
    const attemptDeadline = lastMono + BigInt(plan.limits.attemptMs) * 1000000n;
    const remainingMs = Number((deadline - lastMono) / 1000000n), localMs = Math.min(plan.limits.attemptMs, remainingMs);
    if (localMs < 1) throw Error("deadline_exhausted");
    const local = new AbortController();
    const abort = () => local.abort(); controller.signal.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | null = null;
    let succeeded = false;
    let cancelled: (() => void) | null = null;
    try {
      const result = await Promise.race([work(local.signal), new Promise<never>((_, reject) => {
        if (controller.signal.aborted) return reject(Error("cancelled"));
        cancelled = () => reject(Error("cancelled"));
        local.signal.addEventListener("abort", cancelled, { once: true });
        timer = setTimeout(() => { reject(Error(remainingMs <= plan.limits.attemptMs ? "deadline_exhausted" : "attempt_timeout")); local.abort(); }, localMs);
      })]);
      assertTime();
      if (lastMono >= attemptDeadline) throw Error("attempt_timeout");
      succeeded = true;
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      if (cancelled) local.signal.removeEventListener("abort", cancelled);
      if (!succeeded || !retainSignal) { controller.signal.removeEventListener("abort", abort); local.abort(); }
    }
  };
  const retryWait = async (ms: number) => {
    assertTime();
    const remainingMs = Number((deadline - lastMono) / 1000000n);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abort: (() => void) | null = null;
    try {
      const cancellation = new Promise<never>((_, reject) => {
        if (controller.signal.aborted) return reject(Error("cancelled"));
        abort = () => reject(Error("cancelled")); controller.signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => { reject(Error("deadline_exhausted")); stop("deadline_exhausted", true); }, Math.max(1, remainingMs));
      });
      await Promise.race([cancellation, clock.wait(ms, controller.signal)]);
      assertTime();
    } finally { if (timer) clearTimeout(timer); if (abort) controller.signal.removeEventListener("abort", abort); }
  };
  try {
    start = sample(); deadline = BigInt(start.monoNs) + BigInt(plan.limits.durationMs) * 1000000n;
    // No clock starts before preflight; this sample immediately precedes first directory creation.
    store = new CaptureStore(plan, assertTime, target);
    store.control({ kind: "start", start, processId, sessionId, clockId: clock.identity, plan, access, runtime });
    for (const i of plan.instruments) {
      if (stopped) break;
      assertTime(); if (++metadataRequests > plan.limits.metadataRequests) throw Error("metadata_request_limit");
      requestStart = sample(); await operation(signal => dependencies.transport.requestMetadata(i, signal, emit, context)); await flush; requestStart = null;
      if (!stopped && !obs.metadata.has(i.id)) stop("metadata_missing");
    }
    for (let attempt = 1; !stopped && attempt <= plan.limits.connections; attempt++) {
      if (attempt > 1) { await retryWait((attempt - 1) * 1000); store.rotate("reconnect"); }
      assertTime(); attempts++; connectionId = randomUUID(); obs.begin(connectionId);
      const currentConnection = connectionId;
      const connection = { attempt, connectionId, streams: [] as any[], terminationReason: "connection_pending" }; connections.push(connection);
      store.control({ kind: "connection_attempt", attempt, connectionId });
      store.control({ kind: "subscription_attempt", attempt, connectionId, streams: plan.streams });
      let stream: Awaited<ReturnType<CaptureTransport["connect"]>> | null = null;
      try {
        stream = await operation(signal => dependencies.transport.connect(plan, attempt, signal, event => emit(event, currentConnection), context), true);
        if (stopped) { stream.abort(); await flush; break; }
        const remainingMs = Number((deadline - lastMono) / 1000000n);
        const close = await Promise.race([stream.closed, new Promise<{ reason: string; retryable: boolean }>(resolve => {
          const onAbort = () => { clearTimeout(timer); resolve({ reason: stopReason, retryable: false }); };
          controller.signal.addEventListener("abort", onAbort, { once: true });
          const timer = setTimeout(() => { controller.signal.removeEventListener("abort", onAbort); stop("deadline_exhausted", true); resolve({ reason: "deadline_exhausted", retryable: false }); }, Math.max(1, remainingMs));
          stream!.closed.finally(() => { clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort); }).catch(() => {});
        })]);
        stream.abort(); await flush;
        connection.terminationReason = close.reason;
        if (close.retryable && close.reason === "connection_io" && attempt < plan.limits.connections && !stopped) continue;
        if (close.reason !== "completed") stop(close.reason, close.reason === "deadline_exhausted");
        break;
      } catch (e) {
        stream?.abort(); await flush;
        const reason = e instanceof Error ? e.message : "transport_failure";
        connection.terminationReason = reason;
        if (["connection_io", "attempt_timeout"].includes(reason) && attempt < plan.limits.connections && !controller.signal.aborted) continue;
        throw e;
      } finally { connection.streams = obs.summary(); if (connection.terminationReason === "connection_pending") connection.terminationReason = stopReason; }
    }
    await flush;
  } catch (e) { stop(e instanceof Error ? e.message : "capture_failure", true); }
  finally { dependencies.signal?.removeEventListener("abort", cancel); controller.abort(); }
  // Queued records whose admission was interrupted still partition the complete callbacks.
  for (const r of queue) { if (r.accepted === undefined) { counts.rejected++; r.accepted = false; } const reservation = reservations.get(r); if (reservation) ingress.release(reservation); }
  counts.persistedRaw = store?.persistedRaw ?? 0;
  counts.unpersistedRaw = counts.rawPrepared - counts.persistedRaw;
  counts.dropped = counts.unpersistedRaw + counts.completeRejectedWithoutRaw + counts.incompleteTransportAssemblies;
  counts.controlRecords = store?.controlRecords ?? 0;
  try { assertTime(); } catch (e) { failure = true; stopReason = e instanceof Error ? e.message : "clock_failure"; }
  if (plan.parentExperimentId !== null) obs.gaps.push("unobserved_restart_gap");
  if (!failure && !counts.rawPrepared && stopReason === "completed") stopReason = "no_complete_raw_payload";
  let durationNs: string | null = null;
  if (start! && /^(0|[1-9]\d*)$/.test(end.monoNs) && BigInt(end.monoNs) >= BigInt(start.monoNs)) durationNs = String(BigInt(end.monoNs) - BigInt(start.monoNs));
  const appended = store?.appendedRaw ?? 0;
  const report: any = { version: 1, outcome: failure || counts.rawPrepared > appended || !appended ? "failed_incomplete" : counts.rejected || counts.completeRejectedWithoutRaw || counts.incompleteTransportAssemblies || clockAmbiguous || obs.gaps.length || !obs.qualified() ? "captured_with_gaps" : "captured_with_checked_continuity", stopReason, start: start! ?? null, end, durationNs, attempts, metadataRequests, streams: obs.summary(), connections, counts, encodedBytes: store?.bytes ?? 0, segments: store?.segments.length ?? 0, source: "OKX public Exchange", schema: plan.schema, accessReceipt: access, runtime, clock: { identity: clock.identity, samplingMethod: dependencies.clock ? "external_clock_seam" : "runtime_callback_wall_and_monotonic", offsetMs: clock.offsetMs, uncertaintyMs: clock.uncertaintyMs, ambiguous: clockAmbiguous }, diagnostics: { gaps: obs.gaps, duplicates: obs.duplicates, heartbeats: obs.heartbeats, resets: obs.resets }, incompleteRecords: counts.unpersistedRaw, parentExperimentId: plan.parentExperimentId, restartGap: plan.parentExperimentId !== null, globalAvailableAt: null, strategyQualified: false, executionQualified: false, profitEvidence: false, powerLossQualified: false };
  if (store) {
    try { store.control({ kind: "terminal", stopReason, counts, countsProvisional: true }); report.counts.controlRecords = store.controlRecords; store.finalize({ access, runtime, clock: report.clock }, report); report.encodedBytes = store.bytes;
      assertTime();
      const integrity = readCapture(store.directory); if (integrity.errors.length || integrity.untrustedTail) throw Error("final_integrity_failure");
      assertTime();
    } catch (e) { store.persistedRaw = 0; report.outcome = "failed_incomplete"; report.stopReason = e instanceof Error ? e.message : "finalization_failure"; report.encodedBytes = store.bytes; }
  }
  counts.persistedRaw = store?.persistedRaw ?? 0;
  counts.unpersistedRaw = counts.rawPrepared - counts.persistedRaw;
  counts.dropped = counts.unpersistedRaw + counts.completeRejectedWithoutRaw + counts.incompleteTransportAssemblies;
  report.incompleteRecords = counts.unpersistedRaw;
  report.end = end;
  report.durationNs = start! && /^(0|[1-9]\d*)$/.test(end.monoNs) && BigInt(end.monoNs) >= BigInt(start.monoNs) ? String(BigInt(end.monoNs) - BigInt(start.monoNs)) : null;
  report.finalTiming = { state: "observed", completedAt: end, durationNs: report.durationNs };
  return report;
}
