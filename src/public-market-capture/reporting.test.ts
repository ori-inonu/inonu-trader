import { expect, test } from "bun:test";
import { runCapture } from "./index";
import { createNodeTransport } from "./node-adapter";

test("C11 offline refusal reports every evidence field with an unstarted clock", async () => {
  const report = await runCapture({ mode: "offline" }, { transport: createNodeTransport() });
  expect(report).toMatchObject({ version: 1, outcome: "not_started", stopReason: "offline", start: null, end: null, durationNs: null,
    attempts: 0, metadataRequests: 0, streams: [], connections: [], encodedBytes: 0, segments: 0,
    source: null, schema: null, accessReceipt: null, runtime: null, clock: null,
    diagnostics: { gaps: [], duplicates: 0, heartbeats: 0, resets: 0 }, incompleteRecords: 0,
    parentExperimentId: null, restartGap: false, globalAvailableAt: null, finalTiming: null,
    strategyQualified: false, executionQualified: false, profitEvidence: false, powerLossQualified: false });
  expect(report.counts).toEqual({ completeReceived: 0, accepted: 0, rejected: 0, rawPrepared: 0,
    completeRejectedWithoutRaw: 0, persistedRaw: 0, unpersistedRaw: 0, incompleteTransportAssemblies: 0, dropped: 0, controlRecords: 0 });
});
