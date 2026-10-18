/**
 * READ-ONLY observation of the agent before and after the coordinated pass to the qualified artifact (Claude coordination notes 131 to 134).
 * It never writes inside the agent home, never calls a POST route, never touches the LOCK, the lock owner, the scheduled task or any flag.
 * The only file it can write is the snapshot named by --save, and only OUTSIDE the home. It reads: GET /health, GET /agent/status, the
 * process list and the port owner (read-only), and the agent home files (LOCK, plans.json, config.json, state.json, ledger.jsonl).
 *
 *   bun --no-env-file run scripts/handover-precheck.ts --home <absolute agent data dir> [--port 3000] [--save before.json]
 *   bun --no-env-file run scripts/handover-precheck.ts --home <...> --compare before.json     (after the pass)
 *
 * IMPORTANT (Codex 169): these gates are PRECONDITIONS to look at, not a proof of drain. A momentary green does not stop the scheduler from
 * starting a cycle one second later. The proof of drain is the API quiescence of scripts/handover-quiesce.ts (disconnect, single flight,
 * a disabled answer with no consult and no order, the persisted disconnected state). Exit 0 only when every gate is green; 1 otherwise.
 * The home is mandatory and absolute: another home would hide the real ledger, plans and LOCK.
 */
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";

/** Order stages that mean "a real order may be on the wire or unsettled". `preparada` is only a record. */
const UNSETTLED = new Set(["enviando", "incerta"]);
export const IDLE_MIN_SINCE_CYCLE_MS = 5_000;
export const IDLE_MIN_UNTIL_NEXT_MS = 45_000;
export const HEALTH_APP = "inonu-trader";

export interface LedgerRow {
  readonly kind?: string;
  readonly orderKey?: string;
  readonly stage?: string;
  readonly atMs?: number;
}

export interface ProcessRow {
  readonly pid: number;
  readonly parentPid: number | null;
  /** the image name, e.g. `bun.exe` or `InonuTrader.exe` (the compiled core) */
  readonly name: string;
  readonly cmd: string;
}

export interface Snapshot {
  readonly nowMs: number;
  /** the parsed /health body, or null when it did not answer 200 with JSON */
  readonly health: { readonly ok?: unknown; readonly app?: unknown } | null;
  readonly lockPid: number | null;
  readonly lockPidAlive: boolean;
  /** the pid that LISTENS on the port, from the operating system; null when nobody listens or it could not be read */
  readonly portPid: number | null;
  /** processes that run the agent core itself (not supervisors, not the watchdog); null when the process inventory could not be read (UNKNOWN, never "none") */
  readonly coreProcesses: readonly ProcessRow[] | null;
  /** null when plans.json is missing, malformed or without the expected shape */
  readonly plansOpen: number | null;
  readonly status: {
    readonly paused: boolean;
    readonly inFlight: number;
    readonly schedulerStarted: boolean;
    readonly nextAtMs: number | null;
    readonly healthy: boolean;
    readonly modelConfigured: boolean;
  } | null;
  readonly ledgerRows: readonly LedgerRow[];
  readonly ledgerMalformed: number;
}

export interface Gate {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The last stage of each distinct order, in file order. */
export function lastStages(rows: readonly LedgerRow[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const r of rows) if (r.kind === "order" && typeof r.orderKey === "string" && typeof r.stage === "string") last.set(r.orderKey, r.stage);
  return last;
}

/** Only a FINITE time counts; a NaN, an Infinity or a string never becomes "the last cycle". */
export function lastCycleAtMs(rows: readonly LedgerRow[]): number | null {
  let at: number | null = null;
  for (const r of rows) if (r.kind === "cycle" && finite(r.atMs)) at = r.atMs;
  return at;
}

export const healthIsOurs = (h: Snapshot["health"]): boolean => h !== null && h.ok === true && h.app === HEALTH_APP;

export function evaluateGates(s: Snapshot): Gate[] {
  const gates: Gate[] = [];
  gates.push({ id: "health_is_ours", ok: healthIsOurs(s.health), detail: `ok=${String(s.health?.ok ?? "none")} app=${String(s.health?.app ?? "none")}` });
  // one core, and the LOCK names the very process that holds the port
  const ownsPort = s.lockPid !== null && s.portPid !== null && s.lockPid === s.portPid;
  // EXACTLY one core (zero is not one, and an unreadable inventory is not zero), and it is the very process the LOCK and the port name
  const cores = s.coreProcesses;
  const oneCore = cores !== null && cores.length === 1 && s.lockPid !== null && cores[0]!.pid === s.lockPid;
  gates.push({
    id: "single_executor",
    ok: s.lockPid !== null && s.lockPidAlive && ownsPort && oneCore,
    detail: `lockPid=${s.lockPid} alive=${s.lockPidAlive} portPid=${s.portPid} lockOwnsPort=${ownsPort} coreProcesses=${cores === null ? "unknown" : cores.length} corePid=${cores !== null && cores.length === 1 ? cores[0]!.pid : "n/a"}`,
  });
  const unsettled = [...lastStages(s.ledgerRows)].filter(([, stage]) => UNSETTLED.has(stage)).map(([key]) => key);
  gates.push({ id: "no_order_in_flight", ok: unsettled.length === 0 && s.status !== null && s.status.inFlight === 0, detail: `unsettled=${unsettled.length} statusInFlight=${s.status?.inFlight ?? "unknown"}` });
  gates.push({ id: "ledger_readable", ok: s.ledgerMalformed === 0 && s.ledgerRows.length > 0, detail: `rows=${s.ledgerRows.length} malformed=${s.ledgerMalformed}` });
  gates.push({ id: "no_open_plan", ok: s.plansOpen === 0, detail: `plansOpen=${s.plansOpen ?? "unreadable"}` });
  gates.push({ id: "agent_healthy", ok: s.status !== null && s.status.healthy && s.status.schedulerStarted, detail: `healthy=${s.status?.healthy ?? "unknown"} scheduler=${s.status?.schedulerStarted ?? "unknown"} modelConfigured=${s.status?.modelConfigured ?? "unknown"} paused=${s.status?.paused ?? "unknown"}` });
  const since = lastCycleAtMs(s.ledgerRows);
  const sinceMs = since === null ? null : s.nowMs - since;
  const nextAt = s.status === null ? null : s.status.nextAtMs;
  const untilMs = nextAt === null || !finite(nextAt) ? null : nextAt - s.nowMs;
  gates.push({
    id: "idle_window",
    ok: sinceMs !== null && untilMs !== null && sinceMs >= IDLE_MIN_SINCE_CYCLE_MS && untilMs >= IDLE_MIN_UNTIL_NEXT_MS,
    detail: `sinceLastCycleMs=${sinceMs} untilNextMs=${untilMs} (need >=${IDLE_MIN_SINCE_CYCLE_MS} and >=${IDLE_MIN_UNTIL_NEXT_MS}; informational, see the note above)`,
  });
  return gates;
}

/** What may legitimately differ after a maintenance pass (disconnect then reconnect) is separated from what may not. */
export interface StateFacts {
  readonly version: number | null;
  readonly disclosure: string | null;
  readonly connected: boolean | null;
  readonly eventsCount: number;
  /** sha256 of the first `eventsCount` events: an append-only list keeps this value after new events are added */
  readonly eventsPrefix: string;
}

export interface Fingerprint {
  readonly config: string;
  readonly plans: string;
  readonly state: StateFacts;
  readonly ledgerRows: number;
  /** sha256 of the first `ledgerRows` lines: an append-only file keeps this value after new lines are added */
  readonly ledgerPrefix: string;
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

export function ledgerPrefixHash(lines: readonly string[], count: number): string {
  return sha(lines.slice(0, count).join("\n"));
}

function stateEvents(stateText: string): string[] {
  try {
    const e = (JSON.parse(stateText) as { events?: unknown }).events;
    return Array.isArray(e) ? e.map((x) => JSON.stringify(x)) : [];
  } catch {
    return [];
  }
}

export function stateFacts(stateText: string): StateFacts {
  try {
    const s = JSON.parse(stateText) as Record<string, unknown>;
    const events = stateEvents(stateText);
    return {
      version: finite(s.version) ? s.version : null,
      disclosure: typeof s.disclosure === "string" ? s.disclosure : null,
      connected: typeof s.connected === "boolean" ? s.connected : null,
      eventsCount: events.length,
      eventsPrefix: ledgerPrefixHash(events, events.length),
    };
  } catch {
    return { version: null, disclosure: null, connected: null, eventsCount: 0, eventsPrefix: "" };
  }
}

export interface Files { readonly config: string; readonly state: string; readonly plans: string; readonly ledger: string }

export function fingerprint(files: Files): Fingerprint {
  const lines = files.ledger.split("\n").filter((l) => l.trim() !== "");
  return { config: sha(files.config), plans: sha(files.plans), state: stateFacts(files.state), ledgerRows: lines.length, ledgerPrefix: ledgerPrefixHash(lines, lines.length) };
}

/**
 * After the pass. Config and plans must be byte-identical; the ledger may only have grown. The state file is judged by MEANING, not by bytes:
 * a legitimate maintenance pass disconnects and reconnects, which rewrites connectedAtMs and changedAtMs and appends events. What may not change:
 * the version, the authorized disclosure, the connected flag (back to what it was), and the events already written.
 */
export function compareFingerprints(before: Fingerprint, after: Files): Gate[] {
  const lines = after.ledger.split("\n").filter((l) => l.trim() !== "");
  const st = stateFacts(after.state);
  const events = stateEvents(after.state);
  return [
    { id: "config_unchanged", ok: sha(after.config) === before.config, detail: "config.json hash" },
    { id: "plans_unchanged", ok: sha(after.plans) === before.plans, detail: "plans.json hash" },
    {
      id: "state_same_meaning",
      ok: st.connected !== null && st.version === before.state.version && st.disclosure === before.state.disclosure && st.connected === before.state.connected,
      detail: `version ${before.state.version}->${st.version} disclosure ${before.state.disclosure}->${st.disclosure} connected ${before.state.connected}->${st.connected}`,
    },
    { id: "state_events_append_only", ok: events.length >= before.state.eventsCount && ledgerPrefixHash(events, before.state.eventsCount) === before.state.eventsPrefix, detail: `events ${before.state.eventsCount} -> ${events.length}` },
    { id: "ledger_append_only", ok: lines.length >= before.ledgerRows && ledgerPrefixHash(lines, before.ledgerRows) === before.ledgerPrefix, detail: `rows ${before.ledgerRows} -> ${lines.length}` },
  ];
}

/** Parse the ledger leniently but COUNT what was dropped: a silent drop would hide a torn file. */
export function parseLedger(text: string): { rows: LedgerRow[]; malformed: number } {
  const rows: LedgerRow[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const v: unknown = JSON.parse(line);
      if (v !== null && typeof v === "object" && !Array.isArray(v)) rows.push(v as LedgerRow);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { rows, malformed };
}

/** plans.json must be an object with a `plans` object; anything else is "unreadable", never "empty". */
export function openPlans(text: string): number | null {
  try {
    const v = JSON.parse(text) as { plans?: unknown } | null;
    return v !== null && typeof v === "object" && v.plans !== null && typeof v.plans === "object" && !Array.isArray(v.plans) ? Object.keys(v.plans).length : null;
  } catch {
    return null;
  }
}

/** The pid that listens on the port, from `netstat -ano -p tcp` text; null when nobody, or more than one process, listens. */
export function listenerPid(netstat: string, port: number): number | null {
  const pids = new Set<number>();
  for (const line of netstat.split(/\r?\n/)) {
    const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
    if (m && Number(m[2]) === port && ["127.0.0.1", "0.0.0.0", "[::]", "[::1]"].includes(m[1]!)) pids.add(Number(m[3]));
  }
  return pids.size === 1 ? [...pids][0]! : null;
}

/**
 * The agent core: the working-tree core (`bun ... src/desktop/main.ts`), a core run from source (`core-entry`) or the COMPILED core, which is
 * the image `InonuTrader.exe` itself (its command line is only its own path, so the image name is what identifies it). A supervisor (a bun
 * process running `src/local-host/main.ts`), a watchdog, a shell, the process-list query and a vault helper (`--vault`) are NOT cores.
 */
export function isCoreProcess(r: ProcessRow): boolean {
  if (/--vault/.test(r.cmd) || /Get-CimInstance/i.test(r.cmd)) return false;
  if (/^"?[^"\s]*(powershell|pwsh|cmd)(\.exe)?"?\s/i.test(r.cmd) || /^(powershell|pwsh|cmd)(\.exe)?$/i.test(r.name)) return false;
  if (r.name.toLowerCase() === "inonutrader.exe") return true;
  return /src[\\/]desktop[\\/]main\.ts/i.test(r.cmd) || /core-entry/i.test(r.cmd);
}

export const coreProcesses = (rows: readonly ProcessRow[]): ProcessRow[] => rows.filter(isCoreProcess);

// ---- the thin, read-only shell around the pure functions ----

export const readText = async (path: string): Promise<string> => (await Bun.file(path).text().catch(() => ""));

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { "sec-fetch-site": "same-origin" }, signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function argOf(name: string): string | null {
  const i = Bun.argv.indexOf(name);
  return i >= 0 ? (Bun.argv[i + 1] ?? null) : null;
}

export function netstatText(): string {
  try { return new TextDecoder().decode(Bun.spawnSync(["netstat", "-ano", "-p", "tcp"]).stdout); } catch { return ""; }
}

/** The processes that may be a core; null when the inventory itself could not be read (an inventory error is UNKNOWN, never an empty list). */
export function processRows(): ProcessRow[] | null {
  try {
    const script = "Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -eq 'InonuTrader.exe' -or $_.CommandLine -match 'src[\\\\/]desktop[\\\\/]main\\.ts|core-entry' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
    const run = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script]);
    if (run.exitCode !== 0) return null;
    const out = new TextDecoder().decode(run.stdout).trim();
    if (out === "") return [];
    const parsed: unknown = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.flatMap((p) => {
      const o = p as { ProcessId?: unknown; ParentProcessId?: unknown; Name?: unknown; CommandLine?: unknown };
      // a compiled core may report no command line at all: it is still a row, identified by its image name
      return finite(o.ProcessId) && typeof o.Name === "string" ? [{ pid: o.ProcessId, parentPid: finite(o.ParentProcessId) ? o.ParentProcessId : null, name: o.Name, cmd: typeof o.CommandLine === "string" ? o.CommandLine : "" }] : [];
    });
  } catch {
    return null;
  }
}

async function takeSnapshot(home: string, port: number, files: Files): Promise<Snapshot> {
  const lockText = await readText(join(home, "LOCK"));
  const lockPid = (() => { try { const p = (JSON.parse(lockText) as { pid?: unknown }).pid; return finite(p) && p > 0 ? p : null; } catch { return null; } })();
  const healthRaw = await getJson(`http://127.0.0.1:${port}/health`);
  const health = healthRaw !== null && typeof healthRaw === "object" ? (healthRaw as Snapshot["health"]) : null;
  const raw = (await getJson(`http://127.0.0.1:${port}/agent/status`)) as { status?: Record<string, any> } | null;
  const st = raw?.status ?? null;
  const ledger = parseLedger(files.ledger);
  return {
    nowMs: Date.now(),
    health,
    lockPid,
    lockPidAlive: lockPid !== null && alive(lockPid),
    portPid: listenerPid(netstatText(), port),
    coreProcesses: (() => { const rows = processRows(); return rows === null ? null : coreProcesses(rows); })(),
    plansOpen: openPlans(files.plans),
    status: st === null ? null : {
      paused: st.paused === true,
      inFlight: Array.isArray(st.inFlight) ? st.inFlight.length : 1,
      schedulerStarted: st.scheduler?.started === true,
      nextAtMs: finite(st.scheduler?.nextAtMs) ? st.scheduler.nextAtMs : null,
      healthy: st.health?.ledger?.ok === true && st.health?.plans?.ok === true && st.health?.config?.ok === true,
      modelConfigured: st.modelConfigured === true,
    },
    ledgerRows: ledger.rows,
    ledgerMalformed: ledger.malformed,
  };
}

async function main(): Promise<number> {
  const home = argOf("--home");
  if (home === null || !isAbsolute(home)) {
    console.error("usage: --home <absolute agent data dir> [--port 3000] [--save file] [--compare file]");
    return 2;
  }
  const port = Number(argOf("--port") ?? 3000);
  const files: Files = {
    config: await readText(join(home, "config.json")),
    state: await readText(join(home, "state.json")),
    plans: await readText(join(home, "plans.json")),
    ledger: await readText(join(home, "ledger.jsonl")),
  };
  const snapshot = await takeSnapshot(home, port, files);
  const compare = argOf("--compare");
  if (compare !== null) {
    const before = JSON.parse(await readText(compare)).fingerprint as Fingerprint;
    // after the pass: the same live gates (minus the idle window, which is about the NEXT cycle) AND the comparison with the saved fingerprint
    const gates = [...evaluateGates(snapshot).filter((g) => g.id !== "idle_window"), ...compareFingerprints(before, files)];
    console.log(JSON.stringify({ mode: "compare", ok: gates.every((g) => g.ok), gates }, null, 2));
    return gates.every((g) => g.ok) ? 0 : 1;
  }
  const gates = evaluateGates(snapshot);
  const out = {
    mode: "precheck",
    at: new Date(snapshot.nowMs).toISOString(),
    ok: gates.every((g) => g.ok),
    note: "preconditions to look at, not a proof of drain; the proof is scripts/handover-quiesce.ts",
    gates,
    fingerprint: fingerprint(files),
  };
  const save = argOf("--save");
  if (save !== null) {
    // the only write this script can make: a snapshot file the caller names, never inside the agent home
    const rel = relative(resolve(home), resolve(save));
    if (!isAbsolute(save) || (!rel.startsWith("..") && !isAbsolute(rel))) {
      console.error("--save must be an absolute path OUTSIDE the agent home");
      return 2;
    }
    await Bun.write(save, JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify(out, null, 2));
  return out.ok ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
