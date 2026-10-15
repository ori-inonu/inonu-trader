import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Synthetic fixtures: no wallet, credentials, public feed or trading process.
function capture(key: string, barMs = 900_000) {
  return { instId: `${key}-USDT-SWAP`, barMs, capturedAtMs: 80 * barMs,
    candles: Array.from({ length: 80 }, (_, i) => {
      const close = 100 * Math.exp(0.004 * Math.sin(i));
      return { startMs: i * barMs, open: close, high: close * 1.01, low: close * 0.99, close, volume: 10, confirmed: true };
    }) };
}

test("CLI keeps valid risk when another capture is empty and reports its exclusion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-report-"));
  try {
    writeFileSync(join(dir, "BTC-USDT-SWAP-15m.json"), JSON.stringify(capture("BTC")));
    writeFileSync(join(dir, "SOL-USDT-SWAP-15m.json"), JSON.stringify({ ...capture("SOL"), candles: [] }));
    const positions = join(dir, "positions.json");
    writeFileSync(positions, JSON.stringify([{ key: "BTC", valueUsd: 750 }, { key: "SOL", valueUsd: 250 }]));
    const child = Bun.spawn([process.execPath, "--no-env-file", resolve(import.meta.dir, "quant-portfolio.ts"), "--positions", positions, "--dir", dir, "--json"], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(stderr).toBe("");
    expect(exit).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.analysis.risk.status).toBe("ok");
    expect(report.analysis.risk.riskedShare).toBe(0.75);
    expect(report.captures).toContainEqual(expect.objectContaining({ key: "SOL", status: "excluded", reason: "insufficient_candles" }));
    expect(report.label).toBe("user supplied positions");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
