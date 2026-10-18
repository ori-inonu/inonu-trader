import { describe, expect, test } from "bun:test";
import { allocationAudit, briefAudit, cadenceOf, candidateCoverage, churnAudit, classifyGaps, coreLifecycle, coverageFindings, cycleAudit, decisionLatency, deriveFindings, explainGaps, heartbeatGaps, offIntervals, orderAudit, networkFees, parseHostEvents, portfolioSnapshot, recoveryChains, repeatedRefusals, startsSince, watchdogStarts, type HostEvents, type OrderRow } from "./observe-24h";

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const T0 = Date.parse("2026-10-15T14:00:00.000Z");

describe("availability from the core log", () => {
  test("a stop followed by a start inside the window is a clean restart with the measured downtime", () => {
    const log = `${iso(T0 - 5 * MIN)} local_core_started\n${iso(T0 + 10 * MIN)} local_core_stopped\n${iso(T0 + 10 * MIN + 30_000)} local_core_started\n`;
    const r = coreLifecycle(log, T0);
    expect(r.cleanRestarts).toEqual([{ stoppedAtMs: T0 + 10 * MIN, startedAtMs: T0 + 10 * MIN + 30_000, downMs: 30_000 }]);
    expect(r.uncleanRestarts).toEqual([]);
  });
  test("a start with no stop before it is an unclean restart whose downtime is unknown", () => {
    const log = `${iso(T0 - MIN)} local_core_started\n${iso(T0 + 5 * MIN)} local_core_started\n`;
    expect(coreLifecycle(log, T0).uncleanRestarts).toEqual([{ startedAtMs: T0 + 5 * MIN }]);
  });
  test("a start before the window is not counted, even when its predecessor was also a start", () => {
    const log = `${iso(T0 - 2 * MIN)} local_core_started\n${iso(T0 - MIN)} local_core_started\n`;
    expect(coreLifecycle(log, T0)).toEqual({ cleanRestarts: [], uncleanRestarts: [] });
  });
});

describe("supervisor log", () => {
  test("only the starts inside the window are counted", () => {
    const log = `${iso(T0 - MIN)} local_started\n${iso(T0 + MIN)} local_started\n${iso(T0 + 2 * MIN)} local_stopped\n`;
    expect(startsSince(log, "local_started", T0)).toBe(1);
  });
});

describe("heartbeat gaps", () => {
  test("a silence over the threshold is flagged, including the tail up to now, and a shorter one is not", () => {
    const beats = [T0 + 2 * MIN, T0 + 4 * MIN, T0 + 30 * MIN];
    const gaps = heartbeatGaps(beats, T0, T0 + 60 * MIN, 15 * MIN);
    expect(gaps).toEqual([
      { fromMs: T0 + 4 * MIN, toMs: T0 + 30 * MIN, gapMs: 26 * MIN },
      { fromMs: T0 + 30 * MIN, toMs: T0 + 60 * MIN, gapMs: 30 * MIN },
    ]);
  });
  test("a gap that lies inside a known disconnected interval is explained, one outside it is not", () => {
    const gaps = [
      { fromMs: T0 + 10 * MIN, toMs: T0 + 40 * MIN, gapMs: 30 * MIN },
      { fromMs: T0 + 50 * MIN, toMs: T0 + 80 * MIN, gapMs: 30 * MIN },
    ];
    const off = offIntervals([{ atMs: T0 + 9 * MIN, kind: "desconectou" }, { atMs: T0 + 41 * MIN, kind: "conectou" }], T0 + 90 * MIN);
    expect(explainGaps(gaps, off).map((g) => g.explained)).toEqual([true, false]);
  });
  test("an agent still disconnected at the end of the log is off until now", () => {
    expect(offIntervals([{ atMs: T0, kind: "desconectou" }], T0 + 5 * MIN)).toEqual([{ fromMs: T0, toMs: T0 + 5 * MIN, why: "desconectou" }]);
  });
});

const order = (key: string, stage: string, atMs: number, over: Partial<OrderRow> = {}): OrderRow => ({ kind: "order", orderKey: key, stage, atMs, chainIndex: "501", address: "AAA", side: "buy", ...over });

describe("orders and receipts", () => {
  test("an uncertain order that later became executed is settled; one left sending is unsettled", () => {
    const rows = [order("k1", "enviando", T0), order("k1", "incerta", T0 + 1000), order("k1", "executada", T0 + 9000), order("k2", "enviando", T0 + 20_000, { address: "BBB" })];
    const r = orderAudit(rows, T0, T0 + 5 * MIN, 10 * MIN);
    expect(r.unsettled.map((u) => u.orderKey)).toEqual(["k2"]);
    expect(r.recoveredFromUncertain).toBe(1);
    expect(r.forgotten).toEqual([]);
  });
  test("an unresolved order older than the limit is forgotten", () => {
    const r = orderAudit([order("k1", "enviando", T0), order("k1", "incerta", T0 + 1000)], T0, T0 + 30 * MIN, 10 * MIN);
    expect(r.forgotten.map((u) => u.orderKey)).toEqual(["k1"]);
  });
  test("the same key sent twice is reported apart from a new key sent on the same asset while the first is unresolved", () => {
    const sameKey = orderAudit([order("k1", "enviando", T0), order("k1", "enviando", T0 + 1000), order("k1", "executada", T0 + 2000)], T0, T0 + MIN, 10 * MIN);
    expect(sameKey.sameKeyResends).toEqual(["k1"]);
    expect(sameKey.overlappingSends).toEqual([]);
    const overlap = orderAudit([order("k1", "enviando", T0), order("k1", "incerta", T0 + 1000), order("k2", "enviando", T0 + 5000)], T0, T0 + MIN, 10 * MIN);
    expect(overlap.overlappingSends).toEqual([{ first: "k1", second: "k2" }]);
    expect(overlap.sameKeyResends).toEqual([]);
  });
  test("a send after the earlier order settled, or on the other side, is not an overlap", () => {
    const later = orderAudit([order("k1", "enviando", T0), order("k1", "executada", T0 + 1000), order("k2", "enviando", T0 + 5000)], T0, T0 + MIN, 10 * MIN);
    expect(later.overlappingSends).toEqual([]);
    const otherSide = orderAudit([order("k1", "enviando", T0), order("k2", "enviando", T0 + 5000, { side: "sell" })], T0, T0 + MIN, 10 * MIN);
    expect(otherSide.overlappingSends).toEqual([]);
  });
});

describe("cycles, briefs and decisions", () => {
  test("counts phases for an ID once, with its last phase outcome and reason", () => {
    const rows = [
      { kind: "cycle", cycleId: "c1", atMs: T0 + MIN, outcome: "protegido", reason: "proteção" },
      { kind: "cycle", cycleId: "c1", atMs: T0 + MIN, outcome: "decidido", reason: "concluido" },
    ];
    expect(cycleAudit(rows, T0, T0 + 10 * MIN)).toEqual({
      total: 1, outcomes: { decidido: 1 }, reasons: { concluido: 1 }, withDropped: 0, future: 0,
      rows: 2, uniqueIds: 1, duplicateRows: 1, legacyRows: 0,
    });
  });
  test("distinct IDs at the same timestamp remain distinct", () => {
    const rows = ["c1", "c2"].map((cycleId) => ({ kind: "cycle", cycleId, atMs: T0 + MIN, outcome: "decidido" }));
    expect(cycleAudit(rows, T0, T0 + 10 * MIN)).toMatchObject({ total: 2, rows: 2, uniqueIds: 2, duplicateRows: 0 });
  });
  test("rows without IDs remain independent legacy cycles", () => {
    const rows = [
      { kind: "cycle", atMs: T0 + MIN, outcome: "decidido" },
      { kind: "cycle", atMs: T0 + MIN, outcome: "bloqueado" },
    ];
    expect(cycleAudit(rows, T0, T0 + 10 * MIN)).toMatchObject({ total: 2, rows: 2, uniqueIds: 0, duplicateRows: 0, legacyRows: 2 });
  });
  test("a future phase with an existing ID cannot hide its past phase", () => {
    const rows = [
      { kind: "cycle", cycleId: "c1", atMs: T0 + MIN, outcome: "decidido" },
      { kind: "cycle", cycleId: "c1", atMs: T0 + 11 * MIN, outcome: "future" },
    ];
    expect(cycleAudit(rows, T0, T0 + 10 * MIN)).toMatchObject({
      total: 1, outcomes: { decidido: 1 }, rows: 1, uniqueIds: 1, duplicateRows: 0, future: 1,
    });
  });
  test("cycles count outcomes and reasons, count dropped candidates, and ignore rows before the window", () => {
    const rows = [
      { kind: "cycle", atMs: T0 - MIN, outcome: "decidido", dropped: [] },
      { kind: "cycle", atMs: T0 + MIN, outcome: "decidido", dropped: [{ id: "x" }] },
      { kind: "cycle", atMs: T0 + 2 * MIN, outcome: "bloqueado", reason: "sem_preco", dropped: [] },
    ];
    expect(cycleAudit(rows, T0, T0 + 10 * MIN)).toEqual({
      total: 2, outcomes: { decidido: 1, bloqueado: 1 }, reasons: { sem_preco: 1 }, withDropped: 1, future: 0,
      rows: 2, uniqueIds: 0, duplicateRows: 0, legacyRows: 2,
    });
  });
  test("invalid briefs are counted with their reason and the largest brief is kept", () => {
    const rows = [
      { atMs: T0 + MIN, valid: true, briefBytes: 12_000 },
      { atMs: T0 + 2 * MIN, valid: false, invalidReason: "campo_fora_do_contrato", briefBytes: 12_900 },
    ];
    expect(briefAudit(rows, T0, T0 + 10 * MIN)).toEqual({ total: 2, invalid: 1, invalidReasons: { campo_fora_do_contrato: 1 }, maxLength: 12_900, future: 0 });
  });
  test("decision latency reports the median and the worst answer time", () => {
    const rows = [1, 2, 9].map((s, i) => ({ atMs: T0 + i * MIN, metadata: { askedAtMs: T0, answeredAtMs: T0 + s * 1000 } }));
    expect(decisionLatency(rows, T0, T0 + 10 * MIN)).toEqual({ total: 3, p50Ms: 2000, maxMs: 9000, future: 0, conflicts: 0 });
  });
});

describe("what is worth reporting", () => {
  const clean = {
    healthNow: { ok: true, app: "inonu-trader" },
    uncleanRestarts: [],
    gaps: [{ fromMs: T0, toMs: T0 + 30 * MIN, gapMs: 30 * MIN, explained: true }],
    orders: { unsettled: [], forgotten: [], sameKeyResends: [], overlappingSends: [] },
    briefs: { total: 5, invalid: 0 },
  };
  test("a clean window, even with an explained gap, produces no findings", () => {
    expect(deriveFindings(clean)).toEqual([]);
  });
  test("each kind of problem is reported under its own id", () => {
    const bad = {
      healthNow: null,
      uncleanRestarts: [{ startedAtMs: T0 }],
      gaps: [{ fromMs: T0, toMs: T0 + 30 * MIN, gapMs: 30 * MIN, explained: false }],
      orders: { unsettled: [{ orderKey: "k1" }], forgotten: [{ orderKey: "k1" }], sameKeyResends: ["k1"], overlappingSends: [{ first: "k1", second: "k2" }] },
      briefs: { total: 5, invalid: 1 },
    };
    expect(deriveFindings(bad).map((f) => f.id).sort()).toEqual(["forgotten_order", "health_down", "invalid_brief", "overlapping_send", "same_key_resend", "unclean_restart", "unexplained_gap", "unsettled_order"]);
  });
});

describe("churn and repeated refusals", () => {
  const fill = (side: "buy" | "sell", atMs: number, cashUnits: number, mint = "M1", symbol = "STONK") => ({ kind: "fill", side, atMs, cashUnits, mint, symbol });

  test("buying a token again within minutes of selling it is counted, with the net cash of the loop", () => {
    const fills = [
      fill("buy", T0, 11), fill("sell", T0 + 2 * MIN, 10.97),
      fill("buy", T0 + 4 * MIN, 11), fill("sell", T0 + 6 * MIN, 10.98),
      fill("buy", T0 + 8 * MIN, 11), fill("sell", T0 + 10 * MIN, 10.99),
      fill("buy", T0 + 12 * MIN, 11), fill("sell", T0 + 14 * MIN, 10.99),
    ];
    const [t] = churnAudit(fills, T0, T0 + 60 * MIN);
    expect(t).toMatchObject({ symbol: "STONK", buys: 4, sells: 4, fastExits: 4, reEntries: 3 });
    expect(t!.cashFlowUsd).toBeCloseTo(-0.07, 2);
  });
  test("a slow round trip and a re-entry hours later are not churn", () => {
    const fills = [fill("buy", T0, 11), fill("sell", T0 + 3 * 60 * MIN, 12), fill("buy", T0 + 9 * 60 * MIN, 11)];
    expect(churnAudit(fills, T0, T0 + 24 * 60 * MIN)[0]).toMatchObject({ fastExits: 0, reEntries: 0 });
  });
  test("fills before the window are ignored, but a sell right after an earlier buy still counts as a fast exit", () => {
    const fills = [fill("buy", T0 - MIN, 11), fill("sell", T0 + MIN, 10.9), fill("buy", T0 - 90 * MIN, 5, "M2", "OLD")];
    const out = churnAudit(fills, T0, T0 + 60 * MIN);
    expect(out.map((t) => t.symbol)).toEqual(["STONK"]);
    expect(out[0]).toMatchObject({ buys: 0, sells: 1, fastExits: 1 });
  });
  test("the same candidate refused for the same reason again and again is listed, and three times is the finding", () => {
    const rows = ["a", "b", "c"].map((c, i) => ({ kind: "order", stage: "falhou", reason: "impacto_alto", candidateId: "buy:token:501:X", symbol: "MANIFEST", atMs: T0 + i * 2 * MIN, orderKey: c }));
    const other = { kind: "order", stage: "falhou", reason: "impacto_alto", candidateId: "buy:token:501:Y", symbol: "BOTTLE", atMs: T0, orderKey: "d" };
    const r = repeatedRefusals([...rows, other], T0, T0 + 60 * MIN);
    expect(r).toEqual([{ candidateId: "buy:token:501:X", symbol: "MANIFEST", reason: "impacto_alto", count: 3 }, { candidateId: "buy:token:501:Y", symbol: "BOTTLE", reason: "impacto_alto", count: 1 }]);
  });
  test("churn and repeated refusals reach the findings only at the thresholds", () => {
    const base = { healthNow: { ok: true, app: "inonu-trader" }, uncleanRestarts: [], gaps: [], orders: { unsettled: [], forgotten: [], sameKeyResends: [], overlappingSends: [] }, briefs: { total: 1, invalid: 0 } };
    expect(deriveFindings({ ...base, churn: [{ symbol: "A", reEntries: 2 }], refusals: [{ symbol: "B", count: 2 }] })).toEqual([]);
    expect(deriveFindings({ ...base, churn: [{ symbol: "A", reEntries: 3 }], refusals: [{ symbol: "B", count: 3 }] }).map((f) => f.id)).toEqual(["churn", "repeated_refusal"]);
  });
});

describe("recovery after a restart nobody asked for (the proof the reboot test needs)", () => {
  const cycle = (atMs: number, outcome = "decidido") => ({ atMs, outcome });
  const unclean = (startedAtMs: number) => ({ startedAtMs, unclean: true });

  test("the watchdog start lines are read from the log, with the seven-digit fractions the log writes", () => {
    const log = "2026-10-15T14:27:46.9415329Z local watchdog started: app=C:\\x repo=C:\\y\n2026-10-15T14:27:50.5168209Z supervisor launcher exited: code=0\n";
    expect(watchdogStarts(log)).toEqual([Date.parse("2026-10-15T14:27:46.941Z")]);
  });
  test("an unclean start that a fresh watchdog launched, followed by a decided cycle, is the logon chain proven", () => {
    const r = recoveryChains([unclean(T0 + 40_000)], [T0 + 20_000], [cycle(T0 + 100_000)]);
    expect(r.chains).toEqual([{ coreStartedAtMs: T0 + 40_000, unclean: true, watchdogStartedAtMs: T0 + 20_000, firstCycleAtMs: T0 + 100_000, firstCycleOutcome: "decidido", firstDecidedAtMs: T0 + 100_000, secondsToFirstCycle: 60 }]);
    expect(r.logonProven).toBe(true);
  });
  test("a start that the same people made on purpose (a clean restart) is a chain but not the proof", () => {
    const r = recoveryChains([{ startedAtMs: T0 + 40_000, unclean: false }], [T0 + 20_000], [cycle(T0 + 100_000)]);
    expect(r.chains).toHaveLength(1);
    expect(r.logonProven).toBe(false);
  });
  test("an unclean start with no watchdog start just before it (the core died under a live watchdog) is not the logon chain", () => {
    const r = recoveryChains([unclean(T0 + 40_000)], [T0 - 60 * MIN], [cycle(T0 + 100_000)]);
    expect(r.chains[0]!.watchdogStartedAtMs).toBeNull();
    expect(r.logonProven).toBe(false);
  });
  test("until a cycle is decided after the restart there is no proof, and the wait is reported as unknown", () => {
    const none = recoveryChains([unclean(T0 + 40_000)], [T0 + 20_000], []);
    expect(none.chains[0]).toMatchObject({ firstCycleAtMs: null, firstCycleOutcome: null, firstDecidedAtMs: null, secondsToFirstCycle: null });
    expect(none.logonProven).toBe(false);
    expect(recoveryChains([unclean(T0 + 40_000)], [T0 + 20_000], [cycle(T0 + 100_000, "mantido")]).logonProven).toBe(false);
  });
  test("a first cycle that was only kept (a model error) does not hide the decided one that follows it", () => {
    const r = recoveryChains([unclean(T0 + 40_000)], [T0 + 20_000], [cycle(T0 + 100_000, "mantido"), cycle(T0 + 220_000)]);
    expect(r.chains[0]).toMatchObject({ firstCycleOutcome: "mantido", firstDecidedAtMs: T0 + 220_000 });
    expect(r.logonProven).toBe(true);
  });
});

describe("review 181: an unknown window is never reported as clean", () => {
  const ord = (key: string, stage: string, atMs: number, over: Partial<OrderRow> = {}): OrderRow => ({ kind: "order", orderKey: key, stage, atMs, chainIndex: "501", address: "AAA", side: "buy", ...over });

  test("a last row that is uncertain, with no send row the ledger recognizes, is still an unresolved order of unknown origin", () => {
    const rows = [ord("k1", "preparada", T0), ord("k1", "incerta", T0 + 1000)];
    const r = orderAudit(rows, T0, T0 + 30 * MIN, 10 * MIN);
    expect(r.unsettled).toEqual([{ orderKey: "k1", stage: "incerta", lastAtMs: T0 + 1000, sendRecorded: false }]);
    expect(r.forgotten.map((u) => u.orderKey)).toEqual(["k1"]);
    expect(r.sent).toBe(0);
  });
  test("an order that was only prepared is not unresolved", () => {
    expect(orderAudit([ord("k1", "preparada", T0)], T0, T0 + 30 * MIN, 10 * MIN).unsettled).toEqual([]);
  });
  test("two different keys sent in the same millisecond are ordered by the ledger, not ignored", () => {
    const rows = [ord("A", "enviando", T0), ord("B", "enviando", T0)];
    expect(orderAudit(rows, T0, T0 + MIN, 10 * MIN).overlappingSends).toEqual([{ first: "A", second: "B" }]);
  });
  test("the control: the first order's receipt recorded before the second send, in the same millisecond, is no overlap", () => {
    const rows = [ord("A", "enviando", T0), ord("A", "executada", T0), ord("B", "enviando", T0)];
    expect(orderAudit(rows, T0, T0 + MIN, 10 * MIN).overlappingSends).toEqual([]);
  });
  test("a receipt recorded AFTER the second send in the same millisecond does not clear the overlap", () => {
    const rows = [ord("A", "enviando", T0), ord("B", "enviando", T0), ord("A", "executada", T0)];
    expect(orderAudit(rows, T0, T0 + MIN, 10 * MIN).overlappingSends).toEqual([{ first: "A", second: "B" }]);
  });

  describe("coverage of the files", () => {
    const cov = (file: string, over: Partial<{ required: boolean; present: boolean; rows: number; malformed: number; inWindow: number }> = {}) => ({ file, required: true, present: true, rows: 10, malformed: 0, inWindow: 3, ...over });
    test("complete files give no finding", () => {
      expect(coverageFindings([cov("ledger.jsonl"), cov("fills.jsonl", { required: false, present: false, rows: 0, inWindow: 0 })])).toEqual([]);
    });
    test("a required file that is missing, or present but empty, is a finding: the window is unknown, not clean", () => {
      expect(coverageFindings([cov("equity.jsonl", { present: false, rows: 0, inWindow: 0 })]).map((f) => f.id)).toEqual(["file_missing"]);
      expect(coverageFindings([cov("briefs.jsonl", { rows: 0, inWindow: 0 })]).map((f) => f.id)).toEqual(["file_missing"]);
    });
    test("malformed lines in ANY file, not only the ledger, are a finding that names the file", () => {
      const f = coverageFindings([cov("briefs.jsonl", { malformed: 2 })]);
      expect(f.map((x) => x.id)).toEqual(["malformed_lines"]);
      expect(f[0]!.detail).toContain("briefs.jsonl");
    });
  });

  describe("a closed window", () => {
    test("rows stamped after now are left out of the totals and counted as future, never used", () => {
      const rows = [{ kind: "cycle", atMs: T0 + MIN, outcome: "decidido" }, { kind: "cycle", atMs: T0 + 2 * 60 * MIN, outcome: "decidido" }];
      expect(cycleAudit(rows, T0, T0 + 10 * MIN)).toMatchObject({ total: 1, future: 1 });
      expect(briefAudit([{ atMs: T0 + MIN, valid: true, briefBytes: 5 }, { atMs: T0 + 2 * 60 * MIN, valid: false }], T0, T0 + 10 * MIN)).toMatchObject({ total: 1, invalid: 0, future: 1 });
    });
    test("a fill or a refusal stamped in the future is not used", () => {
      const fills = [{ kind: "fill", side: "buy", atMs: T0, cashUnits: 10, mint: "M", symbol: "X" }, { kind: "fill", side: "sell", atMs: T0 + 2 * 60 * MIN, cashUnits: 10, mint: "M", symbol: "X" }];
      expect(churnAudit(fills, T0, T0 + 10 * MIN)[0]).toMatchObject({ buys: 1, sells: 0 });
      const refusals = [{ kind: "order", stage: "falhou", reason: "impacto_alto", candidateId: "c", atMs: T0 + 2 * 60 * MIN }];
      expect(repeatedRefusals(refusals, T0, T0 + 10 * MIN)).toEqual([]);
    });
    test("an answer that came before its question is a conflict, not a latency", () => {
      const rows = [{ atMs: T0 + MIN, metadata: { askedAtMs: T0 + 5000, answeredAtMs: T0 + 1000 } }, { atMs: T0 + 2 * MIN, metadata: { askedAtMs: T0, answeredAtMs: T0 + 3000 } }];
      expect(decisionLatency(rows, T0, T0 + 10 * MIN)).toEqual({ total: 1, p50Ms: 3000, maxMs: 3000, future: 0, conflicts: 1 });
    });
    test("any temporal conflict is a finding", () => {
      const base = { healthNow: { ok: true, app: "inonu-trader" }, uncleanRestarts: [], gaps: [], orders: { unsettled: [], forgotten: [], sameKeyResends: [], overlappingSends: [] }, briefs: { total: 1, invalid: 0 } };
      expect(deriveFindings({ ...base, temporalConflicts: 0 })).toEqual([]);
      expect(deriveFindings({ ...base, temporalConflicts: 2 }).map((f) => f.id)).toEqual(["temporal_conflict"]);
    });
  });
});

describe("why the machine was silent: the Windows event log, read-only", () => {
  const gap = (fromMin: number, toMin: number) => ({ fromMs: T0 + fromMin * MIN, toMs: T0 + toMin * MIN, gapMs: (toMin - fromMin) * MIN, explained: false });
  const host = (over: Partial<HostEvents> = {}): HostEvents => ({ sleeps: [], unexpectedShutdowns: [], bootMs: null, ...over });

  test("a silence that a machine sleep covers is attributed to the sleep, not left unexplained", () => {
    const r = classifyGaps([gap(0, 120)], host({ sleeps: [{ fromMs: T0 + 10 * MIN, toMs: T0 + 110 * MIN }] }));
    expect(r[0]).toMatchObject({ explained: false, cause: "host_sleep" });
  });
  test("an unexpected shutdown at the start of the silence is a power loss, even when the machine also slept afterwards", () => {
    const r = classifyGaps([gap(0, 360)], host({ unexpectedShutdowns: [T0 + 1 * MIN], sleeps: [{ fromMs: T0 + 50 * MIN, toMs: T0 + 300 * MIN }] }));
    expect(r[0]).toMatchObject({ cause: "host_power_loss" });
  });
  test("a silence with nothing in the host log stays without a cause", () => {
    expect(classifyGaps([gap(0, 60)], host({ sleeps: [{ fromMs: T0 + 500 * MIN, toMs: T0 + 600 * MIN }], unexpectedShutdowns: [T0 + 900 * MIN] }))[0]!.cause).toBeNull();
  });
  test("without the host log nothing is attributed", () => {
    expect(classifyGaps([gap(0, 60)], null)[0]!.cause).toBeNull();
  });
  test("a gap already explained by a deliberate disconnect keeps no host cause", () => {
    expect(classifyGaps([{ ...gap(0, 60), explained: true }], host({ unexpectedShutdowns: [T0 + MIN] }))[0]!.cause).toBeNull();
  });
  test("the host log is read from the JSON the shell hands over, ignoring what is malformed", () => {
    const json = JSON.stringify({
      sleeps: [{ sleep: "2026-10-15T02:49:26.4039310Z", wake: "2026-10-15T07:04:24.5086803Z" }, { sleep: "not a date", wake: "x" }],
      unexpected: ["2026-10-15T01:59:53.000Z", "garbage"],
      boot: "2026-10-15T02:05:30.000Z",
    });
    expect(parseHostEvents(json)).toEqual({
      sleeps: [{ fromMs: Date.parse("2026-10-15T02:49:26.403Z"), toMs: Date.parse("2026-10-15T07:04:24.508Z") }],
      unexpectedShutdowns: [Date.parse("2026-10-15T01:59:53.000Z")],
      bootMs: Date.parse("2026-10-15T02:05:30.000Z"),
    });
    expect(parseHostEvents("not json")).toBeNull();
  });
  test("a gap with a host cause is its own finding, and no longer an unexplained gap", () => {
    const base = { healthNow: { ok: true, app: "inonu-trader" }, uncleanRestarts: [], orders: { unsettled: [], forgotten: [], sameKeyResends: [], overlappingSends: [] }, briefs: { total: 1, invalid: 0 } };
    const f = deriveFindings({ ...base, gaps: [{ ...gap(0, 360), cause: "host_power_loss" as const }] });
    expect(f.map((x) => x.id)).toEqual(["host_down"]);
    expect(f[0]!.detail).toContain("power loss");
  });
});

describe("allocation and speed, measured as the owner asked (ADENDO-H): not just idle cash or the number of orders", () => {
  const USDC = "501:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const holding = (id: string, units: number, priceUsd: number | null) => ({ id, units, priceUsd });
  const row = (atMs: number, holdings: ReturnType<typeof holding>[]) => ({ atMs, usd: 0, holdings });

  test("a snapshot gives the cash share, the number of real positions, the concentration, and counts unpriced dust apart", () => {
    const s = portfolioSnapshot(row(T0, [holding(USDC, 90, 1), holding("501:AAA", 1000, 0.01), holding("501:BBB", 5, 2), holding("501:DUST", 3, 0), holding("501:native", 0.002, 100)]));
    expect(s).toMatchObject({ totalUsd: 110.2, cashUsd: 90, positions: 2, unpriced: 1 });
    expect(s!.cashShare).toBeCloseTo(90 / 110.2, 6);
    expect(s!.top1Share).toBeCloseTo(10 / 110.2, 6);
    expect(s!.hhi).toBeGreaterThan(0.66);
  });
  test("dust under one dollar and the gas balance are not positions", () => {
    expect(portfolioSnapshot(row(T0, [holding(USDC, 99, 1), holding("501:native", 0.002, 100), holding("501:TINY", 1, 0.5)]))!.positions).toBe(0);
  });
  test("a wallet with nothing priced has no shares to report, not a zero", () => {
    expect(portfolioSnapshot(row(T0, [holding("501:DUST", 3, 0)]))).toMatchObject({ totalUsd: 0, cashShare: null, top1Share: null, hhi: null, unpriced: 1 });
  });
  test("over the window it reports the cash share seen, the time spent mostly in cash, and the mark-to-market change with its label", () => {
    const rows = [
      row(T0, [holding(USDC, 90, 1), holding("501:AAA", 10, 1)]),
      row(T0 + 10 * MIN, [holding(USDC, 90, 1), holding("501:AAA", 10, 1)]),
      row(T0 + 20 * MIN, [holding(USDC, 50, 1), holding("501:AAA", 55, 1)]),
      row(T0 + 30 * MIN, [holding(USDC, 50, 1), holding("501:AAA", 60, 1)]),
    ];
    const a = allocationAudit(rows, T0, T0 + 60 * MIN);
    expect(a.samples).toBe(4);
    expect(a.maxCashShare).toBeCloseTo(0.9, 6);
    expect(a.minCashShare).toBeCloseTo(50 / 110, 6);
    expect(a.minutesMostlyCash).toBe(20);
    expect(a.markToMarketChangeUsd).toBe(10);
    expect(a.markToMarketNote).toContain("external");
  });
  test("a long silence between two samples is not counted as time in cash", () => {
    const rows = [row(T0, [holding(USDC, 95, 1), holding("501:AAA", 5, 1)]), row(T0 + 5 * 60 * MIN, [holding(USDC, 95, 1), holding("501:AAA", 5, 1)])];
    expect(allocationAudit(rows, T0, T0 + 6 * 60 * MIN).minutesMostlyCash).toBe(15);
  });
  test("rows before the window or after now are left out", () => {
    const rows = [row(T0 - MIN, [holding(USDC, 1, 1)]), row(T0 + MIN, [holding(USDC, 2, 1)]), row(T0 + 3 * 60 * MIN, [holding(USDC, 3, 1)])];
    expect(allocationAudit(rows, T0, T0 + 10 * MIN)).toMatchObject({ samples: 1, future: 1 });
  });

  test("the cadence of the cycles is the floor of the reaction time: median, p90 and the worst gap, in seconds", () => {
    const times = [0, 120, 240, 360, 480, 1280].map((s) => T0 + s * 1000);
    expect(cadenceOf(times)).toEqual({ samples: 6, p50Sec: 120, p90Sec: 800, maxSec: 800 });
    expect(cadenceOf([T0])).toBeNull();
  });
  test("coverage is how many candidates the model is shown per cycle, never the size of the market", () => {
    const b = (buys: number, holds: number) => ({ atMs: T0, brief: { compras: Object.fromEntries(Array.from({ length: buys }, (_, i) => [`b${i}`, {}])), posicoes: Object.fromEntries(Array.from({ length: holds }, (_, i) => [`h${i}`, {}])) } });
    expect(candidateCoverage([b(7, 2), b(9, 2), b(5, 3)], T0, T0 + MIN)).toEqual({ briefs: 3, buyCandidatesP50: 7, buyCandidatesMax: 9, holdingsP50: 2 });
    expect(candidateCoverage([], T0, T0 + MIN)).toEqual({ briefs: 0, buyCandidatesP50: null, buyCandidatesMax: null, holdingsP50: null });
  });
  test("the network fee paid is summed from the real fills of the window, in SOL, and called a cost, not a result", () => {
    const fills = [
      { kind: "fill", atMs: T0 + MIN, walletFeeLamports: "320402" },
      { kind: "fill", atMs: T0 + 2 * MIN, feeLamports: "100000" },
      { kind: "fill", atMs: T0 - MIN, walletFeeLamports: "999999" },
    ];
    expect(networkFees(fills, T0, T0 + 10 * MIN)).toEqual({ fills: 2, sol: 0.000420402 });
  });
});
