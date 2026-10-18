import { expect, test } from "bun:test";
import { parseStatus } from "../../web/src/lib/agent/parse";
import { needsPersonWord } from "../../web/src/lib/agent/view";
import { rawStatus } from "../../web/src/lib/agent/fixtures";

test("a timeout with a preserved Solana signature still has automatic receipt lookup after the frontend parser", () => {
  const order = { orderKey: "synthetic:one", atMs: 1000, stage: "incerta", side: "sell", symbol: "SYNTH", chainIndex: "501", usd: 10, source: "modelo", reason: "tempo_esgotado", detail: null, ref: "5".repeat(88) };
  const parsed = parseStatus(rawStatus({ mode: "limitado", inFlight: [order] }));
  expect(parsed?.inFlight).toHaveLength(1);
  expect(needsPersonWord(parsed!.inFlight[0]!)).toBe(false);
});
