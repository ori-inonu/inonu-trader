import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { parseCaptureText, type CaptureRecord } from "../lab/capture-format.ts";
import { ReplaySource } from "../lab/source.ts";
import { CaptureError, type CaptureSource, type EpochCollection, type EpochContext } from "./capture-types.ts";
import { CAPTURE_FILES, nodeCaptureFs, runCapture, type CaptureReport, type RunCaptureOptions } from "./capture.ts";
import { OnchainosError } from "./errors.ts";
import { CANARY_KEY, CANARY_PASSPHRASE, CANARY_SECRET, envelope, makeClock, makeMemoryFs, makeMemoryFsState, makeStack, type FakeClock, type FakeReply, type MemoryFsHooks, type MemoryFsState } from "./fakes.ts";
import { createOnchainosCaptureSource, resolveOnchainosConfig } from "./capture-sources.ts";
import { createMarketPriceClient } from "./market-price.ts";

const OUT = join("/mem", "run1");
const START = 1_791_715_200_000; // 2026-10-11T10:40:00Z, aligned to the minute
const EPOCH_MS = 60_000;

const dataPath = join(OUT, CAPTURE_FILES.data);
const ledgerPath = join(OUT, CAPTURE_FILES.ledger);
const manifestPath = join(OUT, CAPTURE_FILES.manifest);

interface Stub extends CaptureSource {
  calls: number;
  contexts: EpochContext[];
}

/** A deterministic source: one ticker and one closed candle per epoch, stamped with the local clock. */
function stubSource(clock: FakeClock, options: { id?: "public-okx" | "onchainos"; describe?: Record<string, unknown>; produce?: (context: EpochContext, n: number) => EpochCollection | Promise<EpochCollection> } = {}): Stub {
  const stub: Stub = {
    id: options.id ?? "public-okx",
    calls: 0,
    contexts: [],
    describe: () => options.describe ?? { instruments: ["SYNA-USDT"] },
    plan: () => [],
    async collect(context) {
      const n = stub.calls;
      stub.calls += 1;
      stub.contexts.push(context);
      context.checkDeadline();
      if (options.produce !== undefined) return options.produce(context, n);
      const t = clock.now();
      const records: CaptureRecord[] = [{ t, kind: "ticker", inst: "SYNA-USDT", data: { bid: 100 + n, ask: 101 + n, last: 100.5 + n } }];
      const start = context.gridMs - 120_000;
      const last = context.cursors.lastCandleStartMs("SYNA-USDT", 60_000);
      if (last === null || start > last) records.push({ t, kind: "candle", inst: "SYNA-USDT", data: { startMs: start, barMs: 60_000, open: 100, high: 102, low: 99, close: 101, volume: 10 } });
      return { records, skipped: [], notes: [] };
    },
  };
  return stub;
}

function harness(overrides: Partial<RunCaptureOptions> = {}, state: MemoryFsState = makeMemoryFsState(), hooks: MemoryFsHooks = {}) {
  const clock = makeClock(START);
  const fs = makeMemoryFs(state, hooks);
  const source = stubSource(clock);
  const run = (patch: Partial<RunCaptureOptions> = {}): Promise<CaptureReport> =>
    runCapture({ outDir: OUT, source, maxEpochs: 3, maxDurationMs: 3_600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs, ...overrides, ...patch });
  return { clock, state, fs, source, run };
}

const text = (state: MemoryFsState, path: string): string => state.files.get(path) ?? "";
const ledgerLines = (state: MemoryFsState): Array<Record<string, unknown>> =>
  text(state, ledgerPath).split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as Record<string, unknown>);

describe("capture: format and files", () => {
  test("D20: the data file is exactly the lab format: strict parser, replay source, point in time reads", async () => {
    const { state, run } = harness();
    const report = await run();
    expect(report.status).toBe("completed");
    const body = text(state, dataPath);
    const records = parseCaptureText(body);
    expect(records.length).toBe(6);
    expect(body.endsWith("\n")).toBe(true);
    expect(body.includes("\r")).toBe(false);
    const replay = ReplaySource.fromText(body, "captura");
    expect(replay.coverage.firstMs).toBe(START);
    expect(replay.coverage.lastMs).toBe(START + 2 * EPOCH_MS);
    const view = replay.asOf(START + EPOCH_MS - 1);
    expect(view.latest("ticker", "SYNA-USDT")!.data.bid).toBe(100);
    expect(replay.asOf(START + EPOCH_MS).latest("ticker", "SYNA-USDT")!.data.bid).toBe(101);
    expect(view.history("candle", "SYNA-USDT").length).toBe(1);
  });

  test("D20: the folder holds exactly the data, the ledger and the manifest, and the manifest has no clock and no secret", async () => {
    const { state, run } = harness();
    await run();
    expect([...state.files.keys()].map((path) => path.split(/[\\/]/).pop()).sort()).toEqual(["capture-ledger.jsonl", "capture-manifest.json", "capture.jsonl"]);
    const manifest = JSON.parse(text(state, manifestPath)) as Record<string, unknown>;
    expect(manifest).toEqual({
      schema: "onchainos-capture-manifest-v1",
      format: "jev-lab-capture-jsonl",
      source: "public-okx",
      epochMs: EPOCH_MS,
      config: { instruments: ["SYNA-USDT"] },
      notice: "Captura somente leitura de dados de mercado; os valores são do instante em que foram lidos.",
    });
  });

  test("D20: t is the local reading, never earlier than the previous record, and each epoch is a block", async () => {
    const { state, run } = harness();
    await run();
    const records = parseCaptureText(text(state, dataPath));
    expect(records.map((record) => record.t)).toEqual([START, START, START + EPOCH_MS, START + EPOCH_MS, START + 2 * EPOCH_MS, START + 2 * EPOCH_MS]);
    const entries = ledgerLines(state);
    expect(entries.map((entry) => entry.epochId)).toEqual([`e${START}`, `e${START + EPOCH_MS}`, `e${START + 2 * EPOCH_MS}`]);
    expect(entries.map((entry) => entry.records)).toEqual([2, 2, 2]);
    expect(entries[2]!.bytesEnd).toBe(Buffer.byteLength(text(state, dataPath), "utf8"));
  });

  test("D20: the report counts what was written by kind and says how it ended", async () => {
    const { run } = harness();
    const report = await run();
    expect(report).toMatchObject({
      schema: "onchainos-capture-report-v1",
      status: "completed",
      source: "public-okx",
      epochMs: EPOCH_MS,
      epochsTarget: 3,
      epochsCommitted: 3,
      epochsWrittenThisRun: 3,
      records: { total: 6, byKind: { ticker: 3, candle: 3 } },
      writtenThisRun: { records: 6, byKind: { ticker: 3, candle: 3 } },
      firstT: START,
      lastT: START + 2 * EPOCH_MS,
      stop: null,
      files: { data: CAPTURE_FILES.data, ledger: CAPTURE_FILES.ledger, manifest: CAPTURE_FILES.manifest },
    });
    expect(report.notice).toMatch(/[Nn]ada aqui prova lucro/);
  });
});

describe("capture: limits, idempotence and resume", () => {
  test("D21: maxEpochs is a hard total and a second run with the same target writes nothing and changes no byte", async () => {
    const { state, run, source } = harness();
    await run({ maxEpochs: 2 });
    const before = text(state, dataPath);
    const ledgerBefore = text(state, ledgerPath);
    const again = await run({ maxEpochs: 2 });
    expect(again.status).toBe("completed");
    expect(again.epochsWrittenThisRun).toBe(0);
    expect(again.epochsCommitted).toBe(2);
    expect(text(state, dataPath)).toBe(before);
    expect(text(state, ledgerPath)).toBe(ledgerBefore);
    expect(source.calls).toBe(2);
  });

  test("D21: the same grid cell is never written twice: a second invocation in the same minute waits for the next one", async () => {
    const { clock, state, run } = harness();
    await run({ maxEpochs: 1 });
    expect(ledgerLines(state).length).toBe(1);
    const sleepsBefore = clock.sleeps.length;
    await run({ maxEpochs: 2 });
    expect(ledgerLines(state).map((entry) => entry.epochId)).toEqual([`e${START}`, `e${START + EPOCH_MS}`]);
    expect(clock.sleeps.slice(sleepsBefore)).toEqual([EPOCH_MS]);
    expect(new Set(ledgerLines(state).map((entry) => entry.epochId)).size).toBe(2);
  });

  test("D21: stopping at 2 epochs and resuming to 4 gives the same bytes as one continuous run of 4", async () => {
    const resumed = harness();
    await resumed.run({ maxEpochs: 2 });
    await resumed.run({ maxEpochs: 4 });
    const continuous = harness();
    await continuous.run({ maxEpochs: 4 });
    expect(text(resumed.state, dataPath)).toBe(text(continuous.state, dataPath));
    expect(text(resumed.state, ledgerPath)).toBe(text(continuous.state, ledgerPath));
    expect(parseCaptureText(text(resumed.state, dataPath)).filter((record) => record.kind === "candle").length).toBe(4);
  });

  test("D21: the duration limit stops BEFORE an epoch that would start after it, with the status duration_limit and nothing half written", async () => {
    const { state, run } = harness();
    const report = await run({ maxEpochs: 10, maxDurationMs: 90_000 });
    expect(report.status).toBe("duration_limit");
    expect(report.epochsCommitted).toBe(2);
    expect(ledgerLines(state).length).toBe(2);
    expect(parseCaptureText(text(state, dataPath)).length).toBe(4);
  });

  test("D21: a deadline reached INSIDE an epoch abandons it: nothing is written and the status is duration_limit", async () => {
    const clock = makeClock(START);
    const state = makeMemoryFsState();
    const source = stubSource(clock, {
      produce: (context, n) => {
        if (n === 1) {
          clock.advance(120_000);
          context.checkDeadline();
        }
        return { records: [{ t: clock.now(), kind: "ticker", inst: "SYNA-USDT", data: { bid: 1, ask: 2, last: 1.5 } }], skipped: [], notes: [] };
      },
    });
    const report = await runCapture({ outDir: OUT, source, maxEpochs: 5, maxDurationMs: 100_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    expect(report.status).toBe("duration_limit");
    expect(report.epochsCommitted).toBe(1);
    expect(parseCaptureText(text(state, dataPath)).length).toBe(1);
    expect(report.stop).toBeNull();
  });

  test("D21: an epoch with nothing new is still committed, so it is not repeated", async () => {
    const clock = makeClock(START);
    const state = makeMemoryFsState();
    const source = stubSource(clock, { produce: () => ({ records: [], skipped: [{ kind: "candle", inst: "SYNA-USDT", reason: "nada novo" }], notes: ["observação"] }) });
    const report = await runCapture({ outDir: OUT, source, maxEpochs: 2, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    expect(report.epochsCommitted).toBe(2);
    expect(text(state, dataPath)).toBe("");
    expect(ledgerLines(state).map((entry) => entry.records)).toEqual([0, 0]);
    expect(report.skipped.map((entry) => `${entry.epochId}:${entry.kind}:${entry.inst}:${entry.reason}`)).toEqual([`e${START}:candle:SYNA-USDT:nada novo`, `e${START + EPOCH_MS}:candle:SYNA-USDT:nada novo`]);
    expect(report.notes).toEqual([{ epochId: `e${START}`, note: "observação" }, { epochId: `e${START + EPOCH_MS}`, note: "observação" }]);
  });

  test("D21: the candle cursor comes from the data file itself, so a resume never repeats a candle", async () => {
    const { state, run, source } = harness();
    await run({ maxEpochs: 2 });
    await run({ maxEpochs: 3 });
    const candles = parseCaptureText(text(state, dataPath)).filter((record) => record.kind === "candle").map((record) => (record.data as { startMs: number }).startMs);
    expect(new Set(candles).size).toBe(candles.length);
    expect(source.contexts[2]!.cursors.lastCandleStartMs("SYNA-USDT", 60_000)).toBe(START + EPOCH_MS - 120_000);
    expect(source.contexts[2]!.firstEpoch).toBe(false);
    expect(source.contexts[0]!.firstEpoch).toBe(true);
  });

  test("D21: the settled funding cursor is derived from the records written after their settlement", async () => {
    const clock = makeClock(START);
    const state = makeMemoryFsState();
    const seen: Array<number | null> = [];
    const source = stubSource(clock, {
      produce: (context, n) => {
        seen.push(context.cursors.lastSettledFundingMs("SYNA-USDT-SWAP"));
        const t = clock.now();
        if (n === 0) {
          return {
            records: [
              { t, kind: "funding", inst: "SYNA-USDT-SWAP", data: { rate: 0.0001, settleMs: t + 3_600_000, intervalMs: 28_800_000 } },
              { t, kind: "funding", inst: "SYNA-USDT-SWAP", data: { rate: 0.0002, settleMs: t - 3_600_000, intervalMs: 28_800_000 } },
            ],
            skipped: [],
            notes: [],
          };
        }
        return { records: [], skipped: [], notes: [] };
      },
    });
    await runCapture({ outDir: OUT, source, maxEpochs: 2, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    expect(seen).toEqual([null, START - 3_600_000]);
  });
});

describe("capture: atomic appends and crash recovery", () => {
  test("D21: each epoch is ONE append to the data file followed by ONE append to the ledger, and nothing else touches them", async () => {
    const { state, run } = harness();
    await run({ maxEpochs: 2 });
    expect(state.log.filter((entry) => entry.endsWith("capture.jsonl") || entry.endsWith("capture-ledger.jsonl"))).toEqual([
      "createExclusive:capture.jsonl",
      "createExclusive:capture-ledger.jsonl",
      "append:capture.jsonl",
      "append:capture-ledger.jsonl",
      "append:capture.jsonl",
      "append:capture-ledger.jsonl",
    ]);
    expect(state.log.filter((entry) => entry.endsWith("capture-manifest.json"))).toEqual(["writeAtomic:capture-manifest.json"]);
  });

  test("D21: a crash between the data append and the ledger append leaves an uncommitted tail that the next run discards and redoes", async () => {
    const state = makeMemoryFsState();
    const crash: MemoryFsHooks = {
      before: (operation, path, count) => {
        if (operation === "append" && path === CAPTURE_FILES.ledger && count === 1) throw new Error("queda de energia simulada");
      },
    };
    const first = harness({}, state, crash);
    const stopped = await first.run({ maxEpochs: 3 });
    expect(stopped.status).toBe("stopped");
    expect(stopped.stop!.kind).toBe("io");
    expect(ledgerLines(state).length).toBe(1);
    const committedBytes = ledgerLines(state)[0]!.bytesEnd as number;
    expect(Buffer.byteLength(text(state, dataPath), "utf8")).toBeGreaterThan(committedBytes);

    const second = harness({}, state);
    second.clock.set(START + EPOCH_MS);
    const resumed = await second.run({ maxEpochs: 3 });
    expect(resumed.status).toBe("completed");
    expect(resumed.notes.some((entry) => /cauda não confirmada/.test(entry.note))).toBe(true);
    expect(ledgerLines(state).map((entry) => entry.epochId)).toEqual([`e${START}`, `e${START + EPOCH_MS}`, `e${START + 2 * EPOCH_MS}`]);
    const records = parseCaptureText(text(state, dataPath));
    expect(records.length).toBe(6);
    const candleStarts = records.filter((record) => record.kind === "candle").map((record) => (record.data as { startMs: number }).startMs);
    expect(new Set(candleStarts).size).toBe(3);
  });

  test("D21: a torn line at the end of the data file is cut off on resume", async () => {
    const { state, run } = harness();
    await run({ maxEpochs: 2 });
    state.files.set(dataPath, `${text(state, dataPath)}{"t":17917152`);
    const second = harness({}, state);
    second.clock.set(START + 2 * EPOCH_MS);
    const report = await second.run({ maxEpochs: 3 });
    expect(report.status).toBe("completed");
    expect(parseCaptureText(text(state, dataPath)).length).toBe(6);
  });

  test("D21: a torn last ledger line is dropped, together with the data of that epoch, and the epoch is redone", async () => {
    const { state, run } = harness();
    await run({ maxEpochs: 2 });
    const full = text(state, ledgerPath);
    state.files.set(ledgerPath, `${full}{"epochId":"e1791715320000","gridMs":17917153`);
    const second = harness({}, state);
    second.clock.set(START + 2 * EPOCH_MS);
    const report = await second.run({ maxEpochs: 3 });
    expect(report.status).toBe("completed");
    expect(report.notes.some((entry) => /ledger/.test(entry.note))).toBe(true);
    expect(ledgerLines(state).length).toBe(3);
    expect(text(state, ledgerPath).endsWith("\n")).toBe(true);
  });
});

describe("capture: it stops, with a clear error, instead of overwriting or guessing", () => {
  test("D21: a data file shorter than the ledger says is corrupt: the run stops and nothing is touched", async () => {
    const { state, run } = harness();
    await run({ maxEpochs: 2 });
    state.files.set(dataPath, text(state, dataPath).slice(0, 40));
    const snapshot = new Map(state.files);
    const second = harness({}, state);
    second.clock.set(START + 2 * EPOCH_MS);
    const report = await second.run({ maxEpochs: 3 });
    expect(report.status).toBe("stopped");
    expect(report.stop).toMatchObject({ kind: "corrupt" });
    expect(report.stop!.message).toMatch(/menor que o ledger/);
    expect(new Map(state.files)).toEqual(snapshot);
  });

  test("D21: a committed record that no longer passes the strict parser stops the run and names the line", async () => {
    const { state, run } = harness();
    await run({ maxEpochs: 2 });
    const lines = text(state, dataPath).split("\n");
    lines[1] = lines[1]!.replace('"kind":"candle"', '"kind":"candel"');
    state.files.set(dataPath, lines.join("\n"));
    const second = harness({}, state);
    second.clock.set(START + 2 * EPOCH_MS);
    const report = await second.run({ maxEpochs: 3 });
    expect(report.stop).toMatchObject({ kind: "corrupt" });
    expect(report.stop!.message).toMatch(/linha 2/);
    expect(report.stop!.message).not.toContain("candel");
  });

  test("D21: a ledger that disagrees with the data (record counts) is corrupt", async () => {
    const { state, run } = harness();
    await run({ maxEpochs: 2 });
    state.files.set(ledgerPath, text(state, ledgerPath).replace('"records":2', '"records":3'));
    const second = harness({}, state);
    second.clock.set(START + 2 * EPOCH_MS);
    const report = await second.run({ maxEpochs: 3 });
    expect(report.stop).toMatchObject({ kind: "corrupt" });
  });

  test("D21: a damaged ledger line in the middle, a repeated epoch id or a backwards byte offset are all corrupt", async () => {
    for (const mutate of [
      (value: string) => value.replace(/^.*\n/, "not json\n"),
      (value: string) => value.replace(/"epochId":"e\d+"/, '"epochId":"x1"'),
      (value: string) => value.split("\n").map((line, index) => (index === 1 ? line.replace(/"bytesEnd":\d+/, '"bytesEnd":1') : line)).join("\n"),
      (value: string) => `${value.split("\n")[0]}\n${value.split("\n")[0]}\n`,
    ]) {
      const { state, run } = harness();
      await run({ maxEpochs: 2 });
      state.files.set(ledgerPath, mutate(text(state, ledgerPath)));
      const second = harness({}, state);
      second.clock.set(START + 2 * EPOCH_MS);
      const report = await second.run({ maxEpochs: 4 });
      expect(report.stop, mutate.toString()).toMatchObject({ kind: "corrupt" });
    }
  });

  test("D21: a folder made with another configuration is refused untouched, and so is one with files but no manifest", async () => {
    const { state, run } = harness();
    await run({ maxEpochs: 1 });
    const snapshot = new Map(state.files);
    const other = harness({ source: stubSource(makeClock(START), { describe: { instruments: ["SYNB-USDT"] } }) }, state);
    other.clock.set(START + EPOCH_MS);
    const mismatch = await other.run({ maxEpochs: 3 });
    expect(mismatch.stop).toMatchObject({ kind: "state_mismatch" });
    const differentGrid = await harness({}, state).run({ maxEpochs: 3, epochMs: 30_000 });
    expect(differentGrid.stop).toMatchObject({ kind: "state_mismatch" });
    expect(new Map(state.files)).toEqual(snapshot);

    state.files.delete(manifestPath);
    const noManifest = await harness({}, state).run({ maxEpochs: 3 });
    expect(noManifest.stop).toMatchObject({ kind: "corrupt" });
    expect(state.files.has(manifestPath)).toBe(false);
  });

  test("D21: a malformed record stops the run, names the epoch, the record and the field, never echoes values, and writes nothing for that epoch", async () => {
    const clock = makeClock(START);
    const state = makeMemoryFsState();
    const source = stubSource(clock, {
      produce: (_context, n) => ({
        records: [{ t: clock.now(), kind: "ticker", inst: "SYNA-USDT", data: n === 1 ? { bid: 105.123456, ask: 101, last: 100.5 } : { bid: 100, ask: 101, last: 100.5 } }],
        skipped: [],
        notes: [],
      }),
    });
    const report = await runCapture({ outDir: OUT, source, maxEpochs: 3, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    expect(report.status).toBe("stopped");
    expect(report.stop).toMatchObject({ kind: "malformed_record", epochId: `e${START + EPOCH_MS}` });
    expect(report.stop!.message).toMatch(/ticker/);
    expect(report.stop!.message).toMatch(/SYNA-USDT/);
    expect(report.stop!.message).toMatch(/cruzado/);
    expect(report.stop!.message).not.toContain("105.123456");
    expect(report.epochsCommitted).toBe(1);
    expect(parseCaptureText(text(state, dataPath)).length).toBe(1);
    expect(ledgerLines(state).length).toBe(1);
  });

  test("D21: other invalid records of every kind stop the run: unknown kind, bad instrument, out of range funding, an incoherent candle, an early candle", async () => {
    const t = START;
    const bad: CaptureRecord[] = [
      { t, kind: "ticker", inst: "lower-case", data: { bid: 1, ask: 2, last: 1.5 } } as CaptureRecord,
      { t, kind: "funding", inst: "SYNA-USDT-SWAP", data: { rate: 0.5, settleMs: t + 1000, intervalMs: 28_800_000 } },
      { t, kind: "funding", inst: "SYNA-USDT-SWAP", data: { rate: 0.0001, settleMs: t + 1000, intervalMs: 21_600_000 } },
      { t, kind: "candle", inst: "SYNA-USDT", data: { startMs: t - 120_000, barMs: 60_000, open: 100, high: 99, low: 98, close: 100 } },
      { t, kind: "candle", inst: "SYNA-USDT", data: { startMs: t - 30_000, barMs: 60_000, open: 100, high: 101, low: 99, close: 100 } },
      { t, kind: "mark", inst: "SYNA-USDT-SWAP", data: { price: Number.NaN } },
      { t, kind: "book", inst: "SYNA-USDT", data: { bids: [[100, 1]], asks: [[100, 1]] } },
      { t, kind: "oi", inst: "SYNA-USDT-SWAP", data: { oi: -1 } },
      { t: -1, kind: "oi", inst: "SYNA-USDT-SWAP", data: { oi: 1 } },
    ];
    for (const record of bad) {
      const clock = makeClock(START);
      const state = makeMemoryFsState();
      const source = stubSource(clock, { produce: () => ({ records: [record], skipped: [], notes: [] }) });
      const report = await runCapture({ outDir: OUT, source, maxEpochs: 1, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
      expect(report.stop, JSON.stringify(record)).toMatchObject({ kind: "malformed_record" });
      expect(text(state, dataPath)).toBe("");
    }
  });

  test("D21: a record older than the last one written (the clock went back) stops with kind clock", async () => {
    const clock = makeClock(START);
    const state = makeMemoryFsState();
    const source = stubSource(clock, { produce: (_context, n) => ({ records: [{ t: n === 0 ? START : START - 5_000, kind: "ticker", inst: "SYNA-USDT", data: { bid: 1, ask: 2, last: 1.5 } }], skipped: [], notes: [] }) });
    const report = await runCapture({ outDir: OUT, source, maxEpochs: 3, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    expect(report.stop).toMatchObject({ kind: "clock" });
    expect(report.stop!.message).toMatch(/relógio/);
    expect(report.epochsCommitted).toBe(1);
  });

  test("D21: when the local clock jumps back so that the grid cell is older than the last committed one, the run stops with kind clock", async () => {
    const { clock, run } = harness();
    await run({ maxEpochs: 2 });
    clock.set(START - 10 * EPOCH_MS);
    const report = await run({ maxEpochs: 4 });
    expect(report.stop).toMatchObject({ kind: "clock" });
  });

  test("D21: records of one epoch can arrive in any order but are written sorted by t, and a candle repeated from the file is refused", async () => {
    const clock = makeClock(START);
    const state = makeMemoryFsState();
    const source = stubSource(clock, {
      produce: (context, n) => {
        const t = clock.now();
        if (n === 1) {
          return { records: [{ t, kind: "candle", inst: "SYNA-USDT", data: { startMs: START - 120_000, barMs: 60_000, open: 100, high: 102, low: 99, close: 101 } }], skipped: [], notes: [] };
        }
        void context;
        return {
          records: [
            { t: t + 2, kind: "oi", inst: "SYNA-USDT-SWAP", data: { oi: 3 } },
            { t, kind: "oi", inst: "SYNA-USDT-SWAP", data: { oi: 1 } },
            { t: t + 1, kind: "oi", inst: "SYNA-USDT-SWAP", data: { oi: 2 } },
            { t, kind: "candle", inst: "SYNA-USDT", data: { startMs: START - 120_000, barMs: 60_000, open: 100, high: 102, low: 99, close: 101 } },
          ],
          skipped: [],
          notes: [],
        };
      },
    });
    const report = await runCapture({ outDir: OUT, source, maxEpochs: 2, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    const written = parseCaptureText(text(state, dataPath));
    expect(written.map((record) => record.t)).toEqual([START, START, START + 1, START + 2]);
    expect(written.slice(2).map((record) => (record.data as { oi: number }).oi)).toEqual([2, 3]);
    expect(report.stop).toMatchObject({ kind: "malformed_record" });
    expect(report.stop!.message).toMatch(/vela repetida/);
  });

  test("D21: a typed provider error stops with kind provider and the safe message of the transport; an unknown exception shows no detail", async () => {
    const clock = makeClock(START);
    const state = makeMemoryFsState();
    const failing = new OnchainosError("api", "a OKX respondeu com código de erro", { endpoint: "/api/v5/market/ticker", apiCode: "50011", httpStatus: 200 });
    const providerRun = await runCapture({ outDir: OUT, source: stubSource(clock, { produce: () => { throw failing; } }), maxEpochs: 2, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) });
    expect(providerRun.stop).toMatchObject({ kind: "provider", message: failing.message });

    const state2 = makeMemoryFsState();
    const unknown = await runCapture({ outDir: OUT, source: stubSource(clock, { produce: () => { throw new Error("detalhe-interno-secreto http://host/?k=abc"); } }), maxEpochs: 2, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state2) });
    expect(unknown.stop).toMatchObject({ kind: "internal" });
    expect(JSON.stringify(unknown)).not.toContain("detalhe-interno-secreto");
    expect(JSON.stringify(unknown)).not.toContain("http://host");
  });

  test("D21: an output path that is a file is refused, a huge file is refused for resume and bad options are rejected up front", async () => {
    const state = makeMemoryFsState();
    state.files.set(OUT, "i am a file");
    const clock = makeClock(START);
    const source = stubSource(clock);
    const base = { outDir: OUT, source, maxEpochs: 1, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep };
    expect((await runCapture({ ...base, fs: makeMemoryFs(state) })).stop).toMatchObject({ kind: "io" });

    const big = harness({ maxResumeBytes: 100 });
    await big.run({ maxEpochs: 1 });
    big.clock.set(START + EPOCH_MS);
    const refused = await big.run({ maxEpochs: 2 });
    expect(refused.stop).toMatchObject({ kind: "io" });
    expect(refused.stop!.message).toMatch(/grande demais para retomar/);

    for (const patch of [{ maxEpochs: 0 }, { maxEpochs: 100_001 }, { maxEpochs: 1.5 }, { epochMs: 999 }, { epochMs: 86_400_001 }, { maxDurationMs: 0 }, { maxDurationMs: 86_400_001 }, { outDir: "" }]) {
      await expect(runCapture({ ...base, fs: makeMemoryFs(makeMemoryFsState()), ...patch }), JSON.stringify(patch)).rejects.toThrow(CaptureError);
    }
  });
});

describe("capture: it never writes a secret", () => {
  const TOKEN = { alias: "WETH-USDC", chainIndex: "1", tokenContractAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" };
  const candle = (startMs: number) => [String(startMs), "1", "2", "0.5", "1.5", "10", "15", "1"];

  function onchainosRun(script: (call: import("./fakes.ts").FakeCall) => FakeReply, state: MemoryFsState) {
    const stack = makeStack(script, {});
    stack.clock.set(START);
    const source = createOnchainosCaptureSource(createMarketPriceClient(stack.http), resolveOnchainosConfig({ tokens: [TOKEN] }));
    return runCapture({ outDir: OUT, source, maxEpochs: 2, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: stack.clock.now, sleep: stack.clock.sleep, fs: makeMemoryFs(state) }).then((report) => ({ report, stack }));
  }

  test("D21: an authenticated source run leaves no credential, signature, header or query in the files or in the report", async () => {
    const state = makeMemoryFsState();
    const { report, stack } = await onchainosRun((call) => {
      if (call.path === "/api/v6/dex/market/candles") return { body: envelope([candle(START - 180_000)]) };
      return { body: envelope([{ chainIndex: "1", tokenContractAddress: TOKEN.tokenContractAddress, time: "1", price: "3200.5" }]) };
    }, state);
    expect(report.status).toBe("completed");
    const signatures = stack.fake.calls.map((call) => call.headers["OK-ACCESS-SIGN"] ?? "");
    expect(signatures.length).toBeGreaterThan(2);
    const everything = [...state.files.values(), JSON.stringify(report)].join("\n");
    for (const forbidden of [CANARY_KEY, CANARY_SECRET, CANARY_PASSPHRASE, ...signatures, "OK-ACCESS", "?chainIndex", "tokenContractAddress=", "Bearer"]) expect(everything.includes(forbidden), forbidden).toBe(false);
    const manifest = JSON.parse(text(state, manifestPath)) as { config: Record<string, unknown> };
    expect(JSON.stringify(manifest.config)).toContain("WETH-USDC");
    expect(JSON.stringify(manifest.config)).toContain("priceQuote");
  });

  test("D21: a provider failure that echoes the credentials stops cleanly and the report and files hold no trace of them", async () => {
    const state = makeMemoryFsState();
    const { report, stack } = await onchainosRun((call) => ({ status: 401, body: { code: "50113", msg: `bad ${call.headers["OK-ACCESS-KEY"]} ${CANARY_SECRET} ${call.headers["OK-ACCESS-SIGN"]}`, data: [] } }), state);
    expect(report.status).toBe("stopped");
    expect(report.stop).toMatchObject({ kind: "provider" });
    const everything = [...state.files.values(), JSON.stringify(report), report.stop!.message].join("\n");
    for (const forbidden of [CANARY_KEY, CANARY_SECRET, CANARY_PASSPHRASE, ...stack.fake.calls.map((call) => call.headers["OK-ACCESS-SIGN"] ?? "")]) expect(everything.includes(forbidden), forbidden).toBe(false);
  });
});

describe("capture: the real file port", () => {
  test("D21: on a real temporary folder the run, the resume and the replay work, and no temporary file is left behind", async () => {
    const directory = mkdtempSync(join(tmpdir(), "onchainos-capture-"));
    try {
      const clock = makeClock(START);
      const source = stubSource(clock);
      const options = { outDir: join(directory, "sub", "run"), source, maxDurationMs: 600_000, epochMs: EPOCH_MS, now: clock.now, sleep: clock.sleep };
      const first = await runCapture({ ...options, maxEpochs: 2 });
      expect(first.status).toBe("completed");
      const second = await runCapture({ ...options, maxEpochs: 4 });
      expect(second.epochsWrittenThisRun).toBe(2);
      expect(readdirSync(options.outDir).sort()).toEqual(["capture-ledger.jsonl", "capture-manifest.json", "capture.jsonl"]);
      const body = readFileSync(join(options.outDir, "capture.jsonl"), "utf8");
      expect(parseCaptureText(body).length).toBe(8);
      expect(ReplaySource.fromBytes(readFileSync(join(options.outDir, "capture.jsonl")), "real").coverage.lastMs).toBe(START + 3 * EPOCH_MS);
      const ledger = readFileSync(join(options.outDir, "capture-ledger.jsonl"), "utf8").trim().split("\n");
      expect(ledger.length).toBe(4);
      expect(JSON.parse(ledger[3] as string).bytesEnd).toBe(statSync(join(options.outDir, "capture.jsonl")).size);

      // damage on disk: a torn append is repaired, a changed byte inside the committed part is refused
      appendFileSync(join(options.outDir, "capture.jsonl"), '{"t":1791');
      const repaired = await runCapture({ ...options, maxEpochs: 5 });
      expect(repaired.status).toBe("completed");
      expect(parseCaptureText(readFileSync(join(options.outDir, "capture.jsonl"), "utf8")).length).toBe(10);
      writeFileSync(join(options.outDir, "capture.jsonl"), readFileSync(join(options.outDir, "capture.jsonl"), "utf8").replace("ticker", "tickex"));
      expect((await runCapture({ ...options, maxEpochs: 6 })).stop).toMatchObject({ kind: "corrupt" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("D21: the real port itself: exclusive create refuses to overwrite, truncate cuts bytes, append appends", () => {
    const directory = mkdtempSync(join(tmpdir(), "onchainos-fs-"));
    try {
      const path = join(directory, "a.txt");
      nodeCaptureFs.createExclusive(path, "abc");
      expect(() => nodeCaptureFs.createExclusive(path, "xyz")).toThrow();
      nodeCaptureFs.append(path, "déf");
      expect(nodeCaptureFs.size(path)).toBe(7);
      nodeCaptureFs.truncate(path, 3);
      expect(readFileSync(path, "utf8")).toBe("abc");
      nodeCaptureFs.writeAtomic(path, "novo");
      expect(readFileSync(path, "utf8")).toBe("novo");
      expect(readdirSync(directory)).toEqual(["a.txt"]);
      expect(nodeCaptureFs.exists(path)).toBe(true);
      expect(nodeCaptureFs.isDirectory(directory)).toBe(true);
      expect(nodeCaptureFs.isDirectory(path)).toBe(false);
      expect(nodeCaptureFs.exists(join(directory, "missing"))).toBe(false);
      expect(Buffer.from(nodeCaptureFs.readBytes(path)).toString("utf8")).toBe("novo");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
