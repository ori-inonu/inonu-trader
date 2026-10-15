import { describe, expect, test } from "bun:test";
import {
  compareFingerprints, coreProcesses, evaluateGates, fingerprint, healthIsOurs, lastCycleAtMs, lastStages, listenerPid, openPlans, parseLedger,
  type Files, type LedgerRow, type Snapshot,
} from "./handover-precheck";

const NOW = 1_000_000_000;
const order = (orderKey: string, stage: string): LedgerRow => ({ kind: "order", orderKey, stage, atMs: NOW });
const cycle = (atMs: number): LedgerRow => ({ kind: "cycle", atMs });

const ready = (over: Partial<Snapshot> = {}): Snapshot => ({
  nowMs: NOW,
  health: { ok: true, app: "inonu-trader" },
  lockPid: 4242,
  lockPidAlive: true,
  portPid: 4242,
  coreProcesses: [{ pid: 4242, parentPid: 100, name: "bun.exe", cmd: "bun run src/desktop/main.ts" }],
  plansOpen: 0,
  status: { paused: false, inFlight: 0, schedulerStarted: true, nextAtMs: NOW + 80_000, healthy: true, modelConfigured: true },
  ledgerRows: [cycle(NOW - 30_000), order("a", "preparada"), order("a", "enviando"), order("a", "executada")],
  ledgerMalformed: 0,
  ...over,
});

const ids = (gs: ReturnType<typeof evaluateGates>) => Object.fromEntries(gs.map((g) => [g.id, g.ok]));

describe("lastStages and times", () => {
  test("keeps only the LAST stage of each distinct order, in file order", () => {
    expect(Object.fromEntries(lastStages([order("a", "preparada"), order("b", "preparada"), order("a", "executada"), order("b", "enviando")]))).toEqual({ a: "executada", b: "enviando" });
  });
  test("ignores cycle rows and rows without an order key or stage", () => {
    expect(lastStages([cycle(1), { kind: "order", stage: "enviando" }, { kind: "order", orderKey: "x" }]).size).toBe(0);
  });
  test("a non-finite or non-number cycle time never becomes the last cycle", () => {
    expect(lastCycleAtMs([cycle(1), cycle(9)])).toBe(9);
    expect(lastCycleAtMs([cycle(5), { kind: "cycle", atMs: Infinity }, { kind: "cycle", atMs: Number.NaN }, { kind: "cycle", atMs: "9" as unknown as number }])).toBe(5);
    expect(lastCycleAtMs([])).toBeNull();
  });
});

describe("gates", () => {
  test("a quiet agent with every order settled passes all seven", () => {
    const g = evaluateGates(ready());
    expect(g.every((x) => x.ok)).toBe(true);
    expect(g.map((x) => x.id)).toEqual(["health_is_ours", "single_executor", "no_order_in_flight", "ledger_readable", "no_open_plan", "agent_healthy", "idle_window"]);
  });
  test("/health must be OUR app answering ok, not any 200", () => {
    expect(healthIsOurs({ ok: true, app: "inonu-trader" })).toBe(true);
    for (const h of [null, {}, { ok: true }, { ok: false, app: "inonu-trader" }, { ok: true, app: "other" }]) expect(healthIsOurs(h)).toBe(false);
    expect(ids(evaluateGates(ready({ health: { ok: true, app: "other" } }))).health_is_ours).toBe(false);
  });
  test("a PREPARED order that never left is only a record, not an order in flight", () => {
    expect(ids(evaluateGates(ready({ ledgerRows: [cycle(NOW - 30_000), order("a", "preparada")] }))).no_order_in_flight).toBe(true);
  });
  test("an order whose last stage is `enviando` or `incerta` blocks, and a later settling row frees it", () => {
    for (const stage of ["enviando", "incerta"]) expect(ids(evaluateGates(ready({ ledgerRows: [cycle(NOW - 30_000), order("a", stage)] }))).no_order_in_flight).toBe(false);
    expect(ids(evaluateGates(ready({ ledgerRows: [cycle(NOW - 30_000), order("a", "incerta"), order("a", "executada")] }))).no_order_in_flight).toBe(true);
  });
  test("the status in-flight list blocks even when the ledger looks settled, and a missing status blocks", () => {
    const s = ready();
    expect(ids(evaluateGates({ ...s, status: { ...s.status!, inFlight: 1 } })).no_order_in_flight).toBe(false);
    expect(ids(evaluateGates(ready({ status: null }))).no_order_in_flight).toBe(false);
  });
  test("malformed ledger lines are COUNTED and fail the gate instead of vanishing", () => {
    const parsed = parseLedger('{"kind":"cycle","atMs":1}\nnot json\n[1,2]\n{"kind":"order","orderKey":"a","stage":"executada"}\n');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.malformed).toBe(2);
    expect(ids(evaluateGates(ready({ ledgerMalformed: 2 }))).ledger_readable).toBe(false);
    expect(ids(evaluateGates(ready({ ledgerRows: [] }))).ledger_readable).toBe(false);
  });
  test("plans.json without the expected shape is UNREADABLE, never empty", () => {
    expect(openPlans('{"version":1,"plans":{}}')).toBe(0);
    expect(openPlans('{"version":1,"plans":{"a":{}}}')).toBe(1);
    for (const bad of ["", "not json", "{}", '{"plans":[]}', '{"plans":null}', "null", "[]"]) expect(openPlans(bad)).toBeNull();
    expect(ids(evaluateGates(ready({ plansOpen: null }))).no_open_plan).toBe(false);
    expect(ids(evaluateGates(ready({ plansOpen: 1 }))).no_open_plan).toBe(false);
  });
  test("the LOCK must name the process that HOLDS the port", () => {
    expect(ids(evaluateGates(ready({ portPid: 9999 }))).single_executor).toBe(false);
    expect(ids(evaluateGates(ready({ portPid: null }))).single_executor).toBe(false);
    expect(ids(evaluateGates(ready({ lockPid: null }))).single_executor).toBe(false);
    expect(ids(evaluateGates(ready({ lockPidAlive: false }))).single_executor).toBe(false);
  });
  test("EXACTLY one core: zero is not one, two is not one, and an unreadable inventory is neither (Codex 173)", () => {
    const row = (pid: number) => ({ pid, parentPid: 1, name: "bun.exe", cmd: "bun run src/desktop/main.ts" });
    expect(ids(evaluateGates(ready({ coreProcesses: [] }))).single_executor).toBe(false);
    expect(ids(evaluateGates(ready({ coreProcesses: [row(4242), row(5555)] }))).single_executor).toBe(false);
    expect(ids(evaluateGates(ready({ coreProcesses: null }))).single_executor).toBe(false);
    expect(ids(evaluateGates(ready({ coreProcesses: [row(4242)] }))).single_executor).toBe(true);
  });
  test("the one core must be the SAME pid as the LOCK and the port, not merely a core somewhere", () => {
    const other = [{ pid: 7777, parentPid: 1, name: "bun.exe", cmd: "bun run src/desktop/main.ts" }];
    expect(ids(evaluateGates(ready({ coreProcesses: other }))).single_executor).toBe(false);
  });
  test("the COMPILED core is recognised by its image name, even with no command line, and passes as the one executor", () => {
    const compiled = [{ pid: 4242, parentPid: 900, name: "InonuTrader.exe", cmd: "" }];
    expect(ids(evaluateGates(ready({ coreProcesses: compiled }))).single_executor).toBe(true);
    const withPath = [{ pid: 4242, parentPid: 900, name: "InonuTrader.exe", cmd: "C:\\release24\\app\\InonuTrader.exe" }];
    expect(ids(evaluateGates(ready({ coreProcesses: withPath }))).single_executor).toBe(true);
  });
  test("the idle window needs finite times, >=5 s since the last cycle and >=45 s until the next", () => {
    expect(ids(evaluateGates(ready({ ledgerRows: [cycle(NOW - 2_000)] }))).idle_window).toBe(false);
    const s = ready();
    expect(ids(evaluateGates({ ...s, status: { ...s.status!, nextAtMs: NOW + 20_000 } })).idle_window).toBe(false);
    expect(ids(evaluateGates({ ...s, status: { ...s.status!, nextAtMs: null } })).idle_window).toBe(false);
    expect(ids(evaluateGates({ ...s, status: { ...s.status!, nextAtMs: Number.NaN } })).idle_window).toBe(false);
  });
});

describe("the port owner and the core processes", () => {
  const NETSTAT = [
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       4242",
    "  TCP    127.0.0.1:3000         127.0.0.1:50501        ESTABLISHED     4242",
    "  TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       777",
  ].join("\r\n");
  test("the listener pid comes only from a LISTENING row of that port", () => {
    expect(listenerPid(NETSTAT, 3000)).toBe(4242);
    expect(listenerPid(NETSTAT, 3001)).toBe(777);
    expect(listenerPid(NETSTAT, 3999)).toBeNull();
    expect(listenerPid("", 3000)).toBeNull();
  });
  test("two different processes listening on the same port is unreadable, not a guess", () => {
    expect(listenerPid(`${NETSTAT}\r\n  TCP    0.0.0.0:3000          0.0.0.0:0              LISTENING       888`, 3000)).toBeNull();
  });
  test("a supervisor, a watchdog and a vault helper are not cores; the working-tree core and the compiled core are", () => {
    const rows = [
      { pid: 1, parentPid: 0, name: "bun.exe", cmd: "bun --no-env-file run src/desktop/main.ts --no-browser --port 3000" },
      { pid: 2, parentPid: 1, name: "bun.exe", cmd: "bun --no-env-file src/desktop/main.ts --vault set" },
      { pid: 3, parentPid: 0, name: "bun.exe", cmd: "bun --no-env-file run src/local-host/main.ts --app X --home Y" },
      { pid: 4, parentPid: 3, name: "bun.exe", cmd: "C:\\pkg\\app\\inonu-core-entry.exe" },
      { pid: 5, parentPid: 0, name: "bun.exe", cmd: "powershell -File inonu-local-logon.ps1" },
    ];
    expect(coreProcesses(rows).map((r) => r.pid)).toEqual([1, 4]);
  });
  test("the compiled core is the image InonuTrader.exe; its vault helper (`--vault`) and a supervisor are not cores", () => {
    const rows = [
      { pid: 1, parentPid: 0, name: "InonuTrader.exe", cmd: "" },
      { pid: 2, parentPid: 1, name: "InonuTrader.exe", cmd: "C:\\r\\app\\InonuTrader.exe --vault set" },
      { pid: 3, parentPid: 0, name: "bun.exe", cmd: "bun --no-env-file run C:\\r\\launcher\\src\\local-host\\main.ts --app C:\\r\\app --home X" },
      { pid: 4, parentPid: 0, name: "inonutrader.EXE", cmd: "x" },
      { pid: 5, parentPid: 0, name: "notepad.exe", cmd: "InonuTrader.exe.txt" },
    ];
    expect(coreProcesses(rows).map((r) => r.pid)).toEqual([1, 4]);
  });
  test("the process-list query and any shell that merely CARRIES the pattern text are never counted as a core", () => {
    const rows = [
      { pid: 1, parentPid: 0, name: "bun.exe", cmd: "\"C:\\Users\\x\\.bun\\bin\\bun.exe\" --no-env-file run src/desktop/main.ts --port 3000" },
      { pid: 2, parentPid: 9, name: "bun.exe", cmd: "powershell.exe -NoProfile -NonInteractive -Command Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'main\\.ts|core-entry' }" },
      { pid: 3, parentPid: 9, name: "bun.exe", cmd: "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -File x.ps1 core-entry" },
    ];
    expect(coreProcesses(rows).map((r) => r.pid)).toEqual([1]);
  });
});

describe("fingerprints: what a legitimate maintenance pass may change and what it may not", () => {
  const before: Files = {
    config: '{"a":1}',
    state: JSON.stringify({ version: 3, connected: true, connectedAtMs: 100, disclosure: "2026-10-14.1", changedAtMs: 200, events: [{ n: 1 }, { n: 2 }] }),
    plans: '{"version":1,"plans":{}}',
    ledger: '{"n":1}\n{"n":2}\n',
  };
  const fp = fingerprint(before);
  const run = (over: Partial<Files>) => Object.fromEntries(compareFingerprints(fp, { ...before, ...over }).map((g) => [g.id, g.ok]));

  test("an untouched home with more ledger lines and more state events passes every gate", () => {
    const state = JSON.stringify({ version: 3, connected: true, connectedAtMs: 100, disclosure: "2026-10-14.1", changedAtMs: 200, events: [{ n: 1 }, { n: 2 }, { n: 3 }] });
    expect(Object.values(run({ ledger: before.ledger + '{"n":3}\n', state })).every(Boolean)).toBe(true);
  });
  test("a DISCONNECT then RECONNECT that rewrites connectedAtMs and changedAtMs is expected, not tampering", () => {
    const state = JSON.stringify({ version: 3, connected: true, connectedAtMs: 999, disclosure: "2026-10-14.1", changedAtMs: 1000, events: [{ n: 1 }, { n: 2 }, { off: 1 }, { on: 1 }] });
    const r = run({ state });
    expect(r.state_same_meaning).toBe(true);
    expect(r.state_events_append_only).toBe(true);
  });
  test("a changed disclosure, a version, a left-disconnected agent or unreadable state each fail", () => {
    const mk = (o: object) => JSON.stringify({ version: 3, connected: true, connectedAtMs: 100, disclosure: "2026-10-14.1", changedAtMs: 200, events: [{ n: 1 }, { n: 2 }], ...o });
    expect(run({ state: mk({ disclosure: "2026-10-15.1" }) }).state_same_meaning).toBe(false);
    expect(run({ state: mk({ version: 4 }) }).state_same_meaning).toBe(false);
    expect(run({ state: mk({ connected: false }) }).state_same_meaning).toBe(false);
    expect(run({ state: "not json" }).state_same_meaning).toBe(false);
  });
  test("rewritten or removed state events break the append-only check", () => {
    const mk = (events: object[]) => JSON.stringify({ version: 3, connected: true, disclosure: "2026-10-14.1", events });
    expect(run({ state: mk([{ n: 1 }, { n: 9 }]) }).state_events_append_only).toBe(false);
    expect(run({ state: mk([{ n: 1 }]) }).state_events_append_only).toBe(false);
  });
  test("a rewritten config or plans file fails its own gate", () => {
    expect(run({ config: '{"a":2}' }).config_unchanged).toBe(false);
    expect(run({ plans: '{"version":1,"plans":{"x":{}}}' }).plans_unchanged).toBe(false);
  });
  test("an edited or truncated ledger breaks the append-only check", () => {
    expect(run({ ledger: '{"n":1}\n{"n":9}\n' }).ledger_append_only).toBe(false);
    expect(run({ ledger: '{"n":1}\n' }).ledger_append_only).toBe(false);
  });
});
