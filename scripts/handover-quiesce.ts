/**
 * Quiescence of a LIVE, NOT PAUSED agent before its process is replaced (Codex 169 answer 1, corrected after Codex 172). Written and tested
 * with fakes only: NOTHING in this file has been run against the real core, and it has no command line entry on purpose (the wrapper is
 * added only after the Codex accepts this client). The caller injects every effect, so the order of the calls can be proven in tests.
 *
 * Why not `quiescePausedAgent` (src/local-host/maintenance.ts): that helper accepts ONLY an already paused agent, and a paused flag must
 * not be faked. This client handles the actual case, an agent that is connected and running, and it never kills anything.
 *
 *   1  preflight   read the status, the persisted files and the owner of the port; refuse anything unexpected
 *   2  settle      wait (bounded, NO kill on timeout) until no plan and no order is in flight for several reads in a row
 *   3  disconnect  POST /agent/disconnect. A failed or lost answer is NOT a failure: the server may have applied it, so the outcome is
 *                  reconciled from /agent/status AND the disk, and until that agrees the state is "unknown"
 *   4  confirm     status says disconnected + "desligado" AND the disk says disconnected, under the same executor identity. If only one
 *                  of them says so, /agent/run is NEVER called (a run on a still connected agent would trade)
 *   5  drain       POST /agent/run only after the confirmation, until a cycle answers "desligado", no consult, no order. A run that
 *                  times out is inconclusive, not a proof; an order that appears is reconciled for real and the drain proved again
 *   6  verify      status and disk agree: disconnected, healthy, no plan or order, same wallet binding, same config, orders only appended
 *   7  owner       the LOCK names the process that holds the port, it is alive and it is the only core
 *
 * It returns the facts of a financially quiescent process. Stopping that process is a separate, later act of the caller, never done here.
 * `reconnectAgent` is the way back on the new version: the SAME disclosure and wallet, through the API, without editing any file, and it
 * returns success only after a COMPLETE proof (connected, healthy, no plan or order, same wallet and config, one core owning the port).
 *
 * OPEN PLANS (`allowOpenPlans`, off by default). A held position has an exit plan in plans.json, which the agent loads from disk on every start
 * (wire.ts createPlanStore), and `disconnect()` does not touch it. When the agent is not flat, waiting for "no plan" could take hours, so this
 * explicit mode PRESERVES the plans instead: nothing may be in flight or unsettled, the plan file must stop changing for several reads, and its
 * hash and size are recorded after the proof; `reconnectAgent` then refuses unless the new version loaded exactly that plan set. Exits are
 * suspended while the agent is disconnected, which is the cost of this mode and is why it is opt-in.
 *
 * Every error carries `agentState`: "running" (nothing was changed or it is plainly still connected), "disconnected" (safe, confirmed),
 * or "unknown" (a mutating call may or may not have applied). The caller must never terminate the process under "unknown" or by timeout.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { alive, coreProcesses, listenerPid, netstatText, openPlans, parseLedger, processRows, readText } from "./handover-precheck";

export type AgentState = "running" | "disconnected" | "unknown";

export type QuiesceCode =
  | "preflight_failed" | "owner_mismatch" | "unsettled_order" | "disconnect_not_applied" | "disconnect_not_persisted" | "disconnect_not_confirmed"
  | "mutation_outcome_unknown" | "drain_unproven" | "wallet_changed" | "config_changed" | "orders_rewritten"
  | "reconnect_precondition" | "connect_not_applied" | "reconnect_not_proven" | "plans_changed";

export class QuiesceError extends Error {
  constructor(readonly code: QuiesceCode, readonly agentState: AgentState, detail = "") {
    super(detail === "" ? code : `${code}: ${detail}`);
  }
}

export type Envelope = Record<string, unknown>;

export interface Persisted {
  readonly connected: boolean | null;
  readonly disclosure: string | null;
  readonly configHash: string;
  /** null when plans.json is unreadable */
  readonly plansOpen: number | null;
  /** sha256 of plans.json, or null when it is unreadable */
  readonly plansHash: string | null;
  /** the plan records plans.json holds (the same PositionPlan objects the status shows), or null when it is unreadable */
  readonly plans: readonly unknown[] | null;
  /** orders whose last ledger stage is `enviando` or `incerta` */
  readonly unsettledOrders: number;
  readonly ledgerMalformed: number;
  /** the raw ledger lines of kind `order`, in file order */
  readonly orderLines: readonly string[];
}

export interface Owner {
  readonly lockPid: number | null;
  readonly portPid: number | null;
  readonly alive: boolean;
  /** how many core processes exist; null when the process inventory could not be read */
  readonly cores: number | null;
  /** the pid of THE core when there is exactly one, else null */
  readonly corePid: number | null;
}

/** One executor: the LOCK is alive, it names the process that holds the port, and that very process is the only core. */
export const ownsOneCore = (o: Owner): boolean => o.lockPid !== null && o.alive && o.portPid === o.lockPid && o.cores === 1 && o.corePid === o.lockPid;

export interface Deps {
  readonly call: (path: "/agent/status" | "/agent/disconnect" | "/agent/run" | "/agent/connect", method: "GET" | "POST", body?: Record<string, unknown>) => Promise<Envelope>;
  readonly persisted: () => Promise<Persisted>;
  readonly owner: () => Promise<Owner>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}

export interface Options {
  readonly stableReads?: number;
  readonly pollMs?: number;
  readonly settleMaxMs?: number;
  readonly drainPasses?: number;
  readonly persistRetries?: number;
  readonly reconnectReads?: number;
  /** keep open exit plans across the pass instead of waiting for none (see the header); default false */
  readonly allowOpenPlans?: boolean;
}

export interface Quiescent {
  readonly quiescent: true;
  readonly pid: number;
  readonly disclosure: string;
  readonly walletBinding: string;
  readonly configHash: string;
  readonly modeBefore: string;
  readonly consultsAtProof: number;
  readonly orderRowsAtProof: number;
  /** the plan set the new version must load: hash of plans.json and how many plans the status shows */
  readonly plansHash: string | null;
  readonly plansCount: number;
  /** digest of the canonical plan set (records, not just their number); `planSetDigest([])` in the strict mode */
  readonly plansDigest: string;
  readonly allowOpenPlans: boolean;
}

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const DISCLOSURE = /^\d{4}-\d{2}-\d{2}\.\d{1,3}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const linesHash = (lines: readonly string[], count: number): string => sha(lines.slice(0, count).join("\n"));

/** Stable text of any JSON value: keys sorted, so two records with the same content always read the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = obj(v);
  if (o !== null) return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
/** Digest of a plan SET: the full content of every record, order of the records ignored. A count and a file hash do not prove this. */
export const planSetDigest = (plans: readonly unknown[]): string => sha(plans.map(canonical).sort().join("\n"));
/** The plans the running agent shows are exactly the records plans.json holds. */
const sameSet = (s: Record<string, unknown>, p: Persisted): boolean => Array.isArray(s.plans) && p.plans !== null && planSetDigest(s.plans) === planSetDigest(p.plans);
const DEFAULTS: Required<Options> = { stableReads: 3, pollMs: 2_000, settleMaxMs: 10 * 60_000, drainPasses: 3, persistRetries: 3, reconnectReads: 5, allowOpenPlans: false };

function statusOf(env: Envelope, state: AgentState): Record<string, unknown> {
  const s = obj(env.status);
  if (s === null) throw new QuiesceError("preflight_failed", state, "status_unreadable");
  return s;
}

const healthy = (s: Record<string, unknown>): boolean => {
  const h = obj(s.health);
  return s.lock === true && obj(h?.ledger)?.ok === true && obj(h?.plans)?.ok === true && obj(h?.config)?.ok === true;
};

const noWork = (s: Record<string, unknown>): boolean => Array.isArray(s.plans) && s.plans.length === 0 && Array.isArray(s.inFlight) && s.inFlight.length === 0;
const noFlight = (s: Record<string, unknown>): boolean => Array.isArray(s.plans) && Array.isArray(s.inFlight) && s.inFlight.length === 0;
/** Quiet status: nothing in flight and, unless open plans are preserved, no plan either. */
const quietStatus = (s: Record<string, unknown>, o: Required<Options>): boolean => (o.allowOpenPlans ? noFlight(s) : noWork(s));
/** Quiet disk: the plan file is readable and, unless open plans are preserved, empty. */
const quietDisk = (p: Persisted, o: Required<Options>): boolean => (o.allowOpenPlans ? p.plansOpen !== null && p.plansHash !== null : p.plansOpen === 0);

function binding(s: Record<string, unknown>): string | null {
  const m = obj(obj(s.config)?.managed);
  if (m === null || m.kind !== "agentica" || typeof m.solana !== "string" || !SOLANA.test(m.solana) || !(m.evm === null || typeof m.evm === "string")) return null;
  return JSON.stringify(m);
}

async function ownerOk(deps: Deps, state: AgentState, firstPid?: number): Promise<Owner> {
  const o = await deps.owner();
  if (!ownsOneCore(o)) {
    throw new QuiesceError("owner_mismatch", state, `lockPid=${o.lockPid} portPid=${o.portPid} alive=${o.alive} cores=${o.cores ?? "unknown"} corePid=${o.corePid}`);
  }
  // a consistent executor is not enough: it must be the process the pass started with, or another one took over mid-way and the proof is void
  if (firstPid !== undefined && o.lockPid !== firstPid) {
    throw new QuiesceError("owner_mismatch", state, `the executor changed during the pass: pid ${firstPid} is now pid ${o.lockPid}; nothing is stopped`);
  }
  return o;
}

/** A read that may fail; a failure is data ("unreadable"), not an exception. */
async function look(deps: Deps): Promise<{ status: Record<string, unknown> | null; disk: Persisted | null }> {
  let status: Record<string, unknown> | null = null;
  let disk: Persisted | null = null;
  try { status = obj((await deps.call("/agent/status", "GET")).status); } catch { /* unreadable */ }
  try { disk = await deps.persisted(); } catch { /* unreadable */ }
  return { status, disk };
}

/** Wait until nothing is in flight for `stableReads` reads in a row, bounded in time. Never kills; on timeout it only reports. */
async function settle(deps: Deps, o: Required<Options>, state: AgentState): Promise<void> {
  const deadline = deps.now() + o.settleMaxMs;
  let stable = 0;
  let prevHash: string | null | undefined;
  for (;;) {
    const { status: s, disk: p } = await look(deps);
    const quiet = s !== null && p !== null && quietStatus(s, o) && quietDisk(p, o) && p.unsettledOrders === 0 && p.ledgerMalformed === 0 && healthy(s);
    // preserving plans: the plan file must also STOP CHANGING; a plan that appears or disappears between two reads restarts the count
    if (!quiet) stable = 0;
    else if (!o.allowOpenPlans || p!.plansHash === prevHash) stable += 1;
    else stable = 1;
    prevHash = quiet ? p!.plansHash : undefined;
    if (stable >= o.stableReads) return;
    if (deps.now() >= deadline) throw new QuiesceError("unsettled_order", state, "a plan or an order is still unsettled (or a read keeps failing); no kill, wait for the real reconciliation");
    await deps.sleep(o.pollMs);
  }
}

type Verdict = "agree" | "running" | "memory_connected" | "disk_connected" | "unreadable";

/**
 * After a mutating call whose answer may have been lost: read the status AND the disk, a few times, and decide. `want` is the state the call
 * was meant to produce. "agree" means status and disk both show it; "running" means both show the OLD state (the call did not apply).
 */
async function reconcile(deps: Deps, o: Required<Options>, want: boolean): Promise<{ verdict: Verdict; status: Record<string, unknown> | null; disk: Persisted | null }> {
  let last: { status: Record<string, unknown> | null; disk: Persisted | null } = { status: null, disk: null };
  let verdict: Verdict = "unreadable";
  for (let i = 0; i <= o.persistRetries; i++) {
    last = await look(deps);
    const st = obj(last.status?.state)?.connected;
    const dk = last.disk?.connected;
    if (last.status === null || last.disk === null || typeof st !== "boolean" || typeof dk !== "boolean") verdict = "unreadable";
    else if (st === want && dk === want) { verdict = "agree"; break; }
    else if (st === !want && dk === !want) verdict = "running";
    else if (st !== want) verdict = "memory_connected";
    else verdict = "disk_connected";
    await deps.sleep(500);
  }
  return { verdict, ...last };
}

interface Prepared {
  readonly first: Record<string, unknown>;
  readonly disclosure: string;
  readonly walletBinding: string;
  readonly p0: Persisted;
  readonly pid: number;
}

/** Steps 1 and 2: the preflight and the wait for "nothing in flight". It changes NOTHING; a failure here always leaves the agent running. */
async function prepare(deps: Deps, o: Required<Options>): Promise<Prepared> {
  // 1. preflight
  const first = statusOf(await deps.call("/agent/status", "GET"), "running");
  const state = obj(first.state);
  const budget = obj(first.budget);
  const walletBinding = binding(first);
  if (
    !healthy(first) || state?.connected !== true || typeof state.disclosure !== "string" || !DISCLOSURE.test(state.disclosure) ||
    first.mode === "desligado" || typeof first.mode !== "string" || walletBinding === null || typeof budget?.day !== "string" || !Number.isSafeInteger(budget.consults)
  ) {
    throw new QuiesceError("preflight_failed", "running", "the agent is not connected, healthy and bound to an agentic wallet");
  }
  const disclosure = state.disclosure;
  const p0 = await deps.persisted();
  if (p0.connected !== true || p0.disclosure !== disclosure) throw new QuiesceError("preflight_failed", "running", "the persisted state does not match the running agent");
  if (p0.ledgerMalformed !== 0) throw new QuiesceError("preflight_failed", "running", "the ledger has malformed lines");
  const owner = await ownerOk(deps, "running");
  // 2. settle: nothing in flight, several reads in a row. Nothing has been mutated yet, so a timeout here leaves the agent running.
  await settle(deps, o, "running");
  return { first, disclosure, walletBinding, p0, pid: owner.lockPid! };
}

export interface Plan {
  readonly ready: true;
  readonly pid: number;
  readonly disclosure: string;
  readonly walletBinding: string;
  readonly configHash: string;
  readonly mode: string;
  readonly orderRows: number;
}

/**
 * The READ-ONLY half of the quiescence: exactly the preflight and the settle of `quiesceLiveAgent`, then it stops. It never calls a POST
 * route, so it can be run against the real core to check that the real headers, origin and envelope shapes match what the tests assume.
 */
export async function planQuiescence(deps: Deps, options: Options = {}): Promise<Plan> {
  const o: Required<Options> = { ...DEFAULTS, ...options };
  try {
    const r = await prepare(deps, o);
    return { ready: true, pid: r.pid, disclosure: r.disclosure, walletBinding: r.walletBinding, configHash: r.p0.configHash, mode: r.first.mode as string, orderRows: r.p0.orderLines.length };
  } catch (e) {
    if (e instanceof QuiesceError) throw e;
    throw new QuiesceError("mutation_outcome_unknown", "running", e instanceof Error ? e.message : "unexpected");
  }
}

export async function quiesceLiveAgent(deps: Deps, options: Options = {}): Promise<Quiescent> {
  const o: Required<Options> = { ...DEFAULTS, ...options };
  let phase: AgentState = "running";
  try {
    // 1 and 2. preflight and settle: nothing is changed here
    const { first, disclosure, walletBinding, p0, pid } = await prepare(deps, o);

    // 3. disconnect. The wait above can last minutes: right before the first request that changes anything, the executor must still be the one the pass
    // started with, the agent still connected and quiet. This narrows the window, it is not an atomic exclusion (a read and a POST stay separate).
    await ownerOk(deps, "running", pid);
    {
      const { status: s, disk: p } = await look(deps);
      if (s === null || p === null || obj(s.state)?.connected !== true || p.connected !== true || !healthy(s) || !quietStatus(s, o) || !quietDisk(p, o) || p.unsettledOrders !== 0 || p.ledgerMalformed !== 0) {
        throw new QuiesceError("unsettled_order", "running", "the agent is no longer connected and quiet right before the disconnect: nothing was sent");
      }
    }
    // From the moment the request leaves, its effect is UNKNOWN until status and disk agree.
    phase = "unknown";
    let sent = true;
    try { await deps.call("/agent/disconnect", "POST", {}); } catch { sent = false; }
    const confirm = await reconcile(deps, o, false);
    if (confirm.verdict === "running") throw new QuiesceError("disconnect_not_applied", "running", sent ? "the API answered but the agent is still connected" : "the request failed and the agent is still connected");
    if (confirm.verdict === "disk_connected") throw new QuiesceError("disconnect_not_persisted", "unknown", "the status says disconnected but state.json still says connected");
    if (confirm.verdict === "memory_connected") throw new QuiesceError("disconnect_not_confirmed", "unknown", "state.json says disconnected but the running agent still says connected: no /agent/run");
    if (confirm.verdict === "unreadable") throw new QuiesceError("mutation_outcome_unknown", "unknown", "the status or the disk could not be read after the disconnect");
    // 4. the status must also say "desligado", healthy, under the same executor identity, BEFORE any run
    if (confirm.status!.mode !== "desligado" || !healthy(confirm.status!)) throw new QuiesceError("disconnect_not_confirmed", "unknown", "the status is connected-looking or unhealthy after the disconnect: no /agent/run");
    phase = "disconnected";
    await ownerOk(deps, "disconnected", pid);

    // 5. prove the drain; a timed out run is inconclusive, an order that appears is reconciled for real, never killed
    // Before EVERY run the identity and the disconnected state are confirmed again: a reconnect between two passes (an outside click, as in note 141)
    // would turn the next run into a connected cycle. If it is connected again or unreadable, nothing is run and nothing is stopped.
    const reconfirm = async (): Promise<void> => {
      const { status: s, disk: p } = await look(deps);
      if (s === null || p === null) throw new QuiesceError("mutation_outcome_unknown", "unknown", "the status or the disk could not be read before a drain run: no run");
      if (obj(s.state)?.connected !== false || p.connected !== false || s.mode !== "desligado") {
        throw new QuiesceError("drain_unproven", "running", "the agent is connected again before a drain run: no run, nothing stopped");
      }
      await ownerOk(deps, "disconnected", pid);
    };
    let proven = false;
    for (let pass = 0; pass < o.drainPasses && !proven; pass++) {
      await reconfirm();
      let report: Record<string, unknown> | null = null;
      try { report = obj((await deps.call("/agent/run", "POST", {})).report); } catch { /* the run may still be going: settle below */ }
      if (report?.mode === "desligado" && report.consulted === false && Array.isArray(report.orders) && report.orders.length === 0) proven = true;
      else await settle(deps, o, "disconnected");
    }
    if (!proven) throw new QuiesceError("drain_unproven", "disconnected", `no disabled answer without consult and orders in ${o.drainPasses} passes`);

    // 6. status and disk agree. The WHOLE proof is repeated on a second, later observation and the facts come from that last one: an agent that was
    // connected again, an order that appeared, a wallet or a config that moved, or another process that took over after the first look is not quiescent.
    const observe = async (): Promise<{ end: Record<string, unknown>; p: Persisted }> => {
      const end = statusOf(await deps.call("/agent/status", "GET"), "disconnected");
      const p = await deps.persisted();
      const endState = obj(end.state);
      // an agent seen connected is running, whatever was proven before: the caller must not treat it as stoppable
      const seen: AgentState = endState?.connected === true || p.connected === true ? "running" : "disconnected";
      if (end.mode !== "desligado" || endState?.connected !== false || !healthy(end) || !quietStatus(end, o)) throw new QuiesceError("drain_unproven", seen, "the final status is not a quiet disconnected agent");
      if (binding(end) !== walletBinding) throw new QuiesceError("wallet_changed", seen, "the managed wallet binding differs from the one read before");
      if (p.connected !== false || !quietDisk(p, o) || p.unsettledOrders !== 0 || p.ledgerMalformed !== 0) throw new QuiesceError("drain_unproven", seen, "the persisted files do not show a quiet disconnected agent");
      if (!sameSet(end, p)) throw new QuiesceError("plans_changed", seen, "the plans the status shows are not the records plans.json holds");
      if (p.configHash !== p0.configHash) throw new QuiesceError("config_changed", seen, "config.json changed during the quiescence");
      if (p.orderLines.length < p0.orderLines.length || linesHash(p.orderLines, p0.orderLines.length) !== linesHash(p0.orderLines, p0.orderLines.length)) {
        throw new QuiesceError("orders_rewritten", seen, "an order row that existed before was changed or removed");
      }
      // the process that is about to be replaced is the one the pass started with
      await ownerOk(deps, seen, pid);
      return { end, p };
    };
    const one = await observe();
    // the plan set must be STILL: a plan file that changes after the proof is not a quiescent agent
    await deps.sleep(500);
    const two = await observe();
    if (two.p.plansHash !== one.p.plansHash || planSetDigest(two.end.plans as unknown[]) !== planSetDigest(one.end.plans as unknown[])) {
      throw new QuiesceError("plans_changed", "disconnected", "the plan set changed after the drain was proven");
    }

    return {
      quiescent: true,
      pid,
      disclosure,
      walletBinding,
      configHash: p0.configHash,
      modeBefore: first.mode as string,
      consultsAtProof: Number(obj(two.end.budget)?.consults ?? -1),
      orderRowsAtProof: two.p.orderLines.length,
      plansHash: two.p.plansHash,
      plansCount: (two.end.plans as unknown[]).length,
      plansDigest: planSetDigest(two.end.plans as unknown[]),
      allowOpenPlans: o.allowOpenPlans,
    };
  } catch (e) {
    // anything unexpected (a read that threw, a malformed answer) keeps the state of the phase it happened in; it never claims "disconnected" early
    if (e instanceof QuiesceError) throw e;
    throw new QuiesceError("mutation_outcome_unknown", phase, e instanceof Error ? e.message : "unexpected");
  }
}

export interface Expected {
  readonly disclosure: string;
  readonly walletBinding: string;
  readonly configHash: string;
  /** set when open plans were preserved: the new version must have loaded exactly this plan set before it is connected */
  readonly plansHash?: string | null;
  readonly plansCount?: number;
  /** digest of the plan set the old process left (`Quiescent.plansDigest`); when given, the set the new version loaded must have it */
  readonly plansDigest?: string;
}

/**
 * The way back on the new version: same disclosure and wallet through the API, no file edited, no new human authorization. Success is
 * returned only after a COMPLETE proof: connected under the same disclosure on both status and disk, healthy, no plan and no order in
 * flight, same wallet, same config, and the LOCK naming the one core that holds the port.
 */
export async function reconnectAgent(deps: Deps, expected: Expected, options: Options = {}): Promise<{ reconnected: true }> {
  const o: Required<Options> = { ...DEFAULTS, ...options };
  const preserve = expected.plansCount !== undefined;
  const first = await look(deps);
  const s = first.status;
  const p = first.disk;
  if (s === null || p === null || obj(s.state)?.connected !== false || s.mode !== "desligado" || !healthy(s) || p.connected !== false || p.configHash !== expected.configHash) {
    throw new QuiesceError("reconnect_precondition", "disconnected", "the new version is not a quiet disconnected agent with the same config");
  }
  // in EVERY mode the disk must be readable and settled: preserving plans does not authorize connecting on an unreadable file or an order not reconciled
  if (p.plansOpen === null || p.plansHash === null || p.plans === null || p.ledgerMalformed !== 0 || p.unsettledOrders !== 0) {
    throw new QuiesceError("reconnect_precondition", "disconnected", "the persisted plans or ledger are unreadable, or an order is not reconciled");
  }
  // what the new version loaded must be, record by record, what plans.json holds (a count and a file hash do not prove that)
  if (!sameSet(s, p)) throw new QuiesceError("reconnect_precondition", "disconnected", "the plans the new version loaded are not the records plans.json holds");
  if (preserve) {
    // the plan set the old process left on disk must be exactly what the new process loaded, and nothing may be in flight
    if (!noFlight(s) || (s.plans as unknown[]).length !== expected.plansCount || p.plansHash !== expected.plansHash || (expected.plansDigest !== undefined && planSetDigest(p.plans) !== expected.plansDigest)) {
      throw new QuiesceError("reconnect_precondition", "disconnected", "the new version did not load the same plan set the old one left, or something is in flight");
    }
  } else if (!noWork(s) || p.plansOpen !== 0) {
    throw new QuiesceError("reconnect_precondition", "disconnected", "the new version is not a quiet disconnected agent with no plan and nothing in flight");
  }
  if (binding(s) !== expected.walletBinding) throw new QuiesceError("wallet_changed", "disconnected", "the managed wallet binding differs from the one before the pass");
  const pid0 = (await ownerOk(deps, "disconnected")).lockPid!;
  const rowsBefore = p.orderLines;

  // from here the connect may have applied even if the answer is lost: reconcile instead of assuming
  try { await deps.call("/agent/connect", "POST", { disclosure: expected.disclosure }); } catch { /* reconciled below */ }

  let last: { status: Record<string, unknown> | null; disk: Persisted | null } = { status: null, disk: null };
  let why = "unreadable";
  for (let i = 0; i < o.reconnectReads; i++) {
    last = await look(deps);
    const st = last.status;
    const dk = last.disk;
    if (st === null || dk === null) { why = "unreadable"; }
    else {
      const connectedBoth = obj(st.state)?.connected === true && dk.connected === true;
      if (!connectedBoth) why = obj(st.state)?.connected === false && dk.connected === false ? "not_applied" : "partial";
      else if (dk.orderLines.length < rowsBefore.length || linesHash(dk.orderLines, rowsBefore.length) !== linesHash(rowsBefore, rowsBefore.length)) {
        throw new QuiesceError("orders_rewritten", "running", "an order row that existed before the connect was changed or removed");
      }
      else if (binding(st) !== expected.walletBinding) throw new QuiesceError("wallet_changed", "running", "the wallet binding changed on reconnect");
      else if (dk.configHash !== expected.configHash) throw new QuiesceError("config_changed", "running", "config.json changed on reconnect");
      else if (obj(st.state)?.disclosure !== expected.disclosure || dk.disclosure !== expected.disclosure || st.mode === "desligado") why = "disclosure_or_mode";
      else if (!healthy(st)) why = "unhealthy";
      // preserving plans: once connected the agent resumes managing its exits (a sell may start at once), so only the strict mode demands "no work" here
      else if (!preserve && (!noWork(st) || dk.plansOpen !== 0 || dk.unsettledOrders !== 0 || dk.ledgerMalformed !== 0)) why = "work_in_flight";
      else if (preserve && dk.ledgerMalformed !== 0) why = "work_in_flight";
      else {
        const owner = await deps.owner();
        if (!ownsOneCore(owner)) why = "owner";
        else if (owner.lockPid !== pid0) why = "pid_changed";
        else return { reconnected: true };
      }
    }
    await deps.sleep(1_000);
  }
  if (why === "not_applied") throw new QuiesceError("connect_not_applied", "disconnected", "neither the status nor the disk shows the agent connected");
  if (why === "unreadable" || why === "partial") throw new QuiesceError("mutation_outcome_unknown", "unknown", `the connect outcome could not be settled (${why})`);
  throw new QuiesceError("reconnect_not_proven", "running", `the agent is connected but the proof is incomplete (${why}); decide before anything else, never kill`);
}

// ---- real adapters (read-only except `call`, which is only ever invoked by the functions above) ----

/** Same headers as src/local-host/maintenance.ts: the allowed origin, the intent header on writes, no redirect, a bounded wait. */
export function httpAgentCall(fetchImpl: typeof fetch, origin = "http://127.0.0.1:3000"): Deps["call"] {
  return async (path, method, body) => {
    const r = await fetchImpl(origin + path, {
      method,
      redirect: "error",
      headers: { origin, ...(method === "POST" ? { "content-type": "application/json", "x-inonu-intent": "user" } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      signal: AbortSignal.timeout(path === "/agent/run" ? 180_000 : 5_000),
    });
    // a throw here is NOT proof that the server did nothing; the callers above reconcile after every mutating call
    if (!r.ok) throw new QuiesceError("preflight_failed", "unknown", `request_refused ${path} ${r.status}`);
    const text = await r.text();
    if (text.length > 1_000_000) throw new QuiesceError("preflight_failed", "unknown", "response_too_large");
    const env = obj(JSON.parse(text));
    if (env === null || env.ok !== true) throw new QuiesceError("preflight_failed", "unknown", `response_not_ok ${path}`);
    return env;
  };
}

/** The plan records of plans.json, as stored: `{ version, plans: { <key>: PositionPlan } }`. */
function planRecords(text: string): unknown[] | null {
  try { const plans = obj(obj(JSON.parse(text))?.plans); return plans === null ? null : Object.values(plans); } catch { return null; }
}

export function diskPersisted(home: string): Deps["persisted"] {
  return async () => {
    const [stateText, configText, plansText, ledgerText] = await Promise.all(["state.json", "config.json", "plans.json", "ledger.jsonl"].map((f) => readText(join(home, f))));
    let state: Record<string, unknown> = {};
    try { state = obj(JSON.parse(stateText!)) ?? {}; } catch { /* unreadable stays unknown */ }
    const ledger = parseLedger(ledgerText!);
    const last = new Map<string, string>();
    for (const r of ledger.rows) if (r.kind === "order" && typeof r.orderKey === "string" && typeof r.stage === "string") last.set(r.orderKey, r.stage);
    return {
      connected: typeof state.connected === "boolean" ? state.connected : null,
      disclosure: typeof state.disclosure === "string" ? state.disclosure : null,
      configHash: sha(configText!),
      plansOpen: openPlans(plansText!),
      plansHash: openPlans(plansText!) === null ? null : sha(plansText!),
      plans: openPlans(plansText!) === null ? null : planRecords(plansText!),
      unsettledOrders: [...last.values()].filter((s) => s === "enviando" || s === "incerta").length,
      ledgerMalformed: ledger.malformed,
      orderLines: ledgerText!.split("\n").filter((l) => /"kind"\s*:\s*"order"/.test(l)),
    };
  };
}

export function liveOwner(home: string, port = 3000): Deps["owner"] {
  return async () => {
    let lockPid: number | null = null;
    try { const p = (JSON.parse(await readText(join(home, "LOCK"))) as { pid?: unknown }).pid; lockPid = typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null; } catch { /* unreadable */ }
    const rows = processRows();
    const cores = rows === null ? null : coreProcesses(rows);
    return { lockPid, portPid: listenerPid(netstatText(), port), alive: lockPid !== null && alive(lockPid), cores: cores === null ? null : cores.length, corePid: cores !== null && cores.length === 1 ? cores[0]!.pid : null };
  };
}
