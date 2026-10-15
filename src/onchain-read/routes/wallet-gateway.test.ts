/**
 * The wallet routes through the real gateway (inonu-desktop-v1 T3.12, WAL-4): the catalog finds them, the gateway sends the provider path they build,
 * caches by address, normalizes, and counts the tier. The provider is a fake client; origin: shape_of_real_probe_2026-10-12 with synthetic values.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBudget } from "../budget";
import { createOnchainCache } from "../cache";
import { endpointFor } from "../catalog";
import type { ClientResult, OnchainClient } from "../client";
import { createOnchainGateway } from "../gateway";
import { WALLET_ENDPOINTS } from "./wallet";

const ADDRESS_A = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const ADDRESS_B = "0x1111222233334444555566667777888899990000";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function gatewayWith(raw: unknown) {
  let t = 1_000_000;
  const dir = mkdtempSync(join(tmpdir(), "jev-onchain-wallet-"));
  dirs.push(dir);
  const calls: string[] = [];
  const client: OnchainClient = {
    call: async (req): Promise<ClientResult> => {
      calls.push(req.path);
      return { ok: true, data: raw, sent: true };
    },
    status: () => ({ lastCallMs: t, lastCode: 0, cooldownUntilMs: null, clockOffsetMs: null }),
  };
  const budget = createBudget({ dir, now: () => t, caps: () => ({ basic: 50, premium: 50 }) });
  const gateway = createOnchainGateway({ client, cache: createOnchainCache(() => t), budget, credentialsState: () => "complete", now: () => t });
  return { gateway, budget, calls, tick: (ms: number) => (t += ms) };
}

const balances = [{
  tokenAssets: [
    { chainIndex: "1", symbol: "ETH", balance: "0.5", tokenPrice: "3000", isRiskToken: false, rawBalance: "500000000000000000", address: ADDRESS_A, tokenContractAddress: "" },
    { chainIndex: "1", symbol: "USDC", balance: "37.19", tokenPrice: "1", isRiskToken: false, rawBalance: "37190000", address: ADDRESS_A, tokenContractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  ],
}];

describe("the catalog serves the six routes", () => {
  test("each route of the wallet file is found by the catalog, as the same entry", () => {
    for (const e of WALLET_ENDPOINTS) expect(endpointFor(e.route)).toBe(e);
  });
});

describe("through the gateway", () => {
  test("balances: the provider path the route builds, the normalized rows, the free tier", async () => {
    const { gateway, calls, budget } = gatewayWith(balances);
    const r = await gateway.call("/onchain/wallet-balances", { address: ADDRESS_A, chains: "1" }, "user");
    expect(r.ok).toBe(true);
    expect(calls).toEqual([`/api/v6/dex/balance/all-token-balances-by-address?address=${ADDRESS_A.toLowerCase()}&chains=1&excludeRiskToken=1`]);
    if (r.ok) {
      const data = r.data as { rows: Array<{ symbol: string; valueUsd: number | null }>; total: number };
      expect(data.rows.map((x) => x.symbol)).toEqual(["ETH", "USDC"]);
      expect(data.rows[0]!.valueUsd).toBe(1500);
      expect(data.total).toBe(2);
      expect(r.meta.tier).toBe("free");
    }
    // a free tier read spends neither of the two paid budgets
    const snap = budget.snapshot().tiers;
    expect(snap.basic.used).toBe(0);
    expect(snap.premium.used).toBe(0);
  });

  test("the same wallet in another case asks the provider the same thing; the cache is keyed on what was sent, so the browser reader sends lower case", async () => {
    const { gateway, calls } = gatewayWith(balances);
    await gateway.call("/onchain/wallet-balances", { address: ADDRESS_A, chains: "1" }, "user");
    await gateway.call("/onchain/wallet-balances", { address: ADDRESS_A.toLowerCase(), chains: "1" }, "user");
    expect(calls.length).toBe(2);
    expect(calls[0]).toBe(calls[1]!);
    // lower case twice is one provider call and a hit
    await gateway.call("/onchain/wallet-balances", { address: ADDRESS_A.toLowerCase(), chains: "1" }, "user");
    expect(calls.length).toBe(2);
  });

  test("another wallet is another entry and another provider call", async () => {
    const { gateway, calls } = gatewayWith(balances);
    await gateway.call("/onchain/wallet-balances", { address: ADDRESS_A.toLowerCase(), chains: "1" }, "user");
    await gateway.call("/onchain/wallet-balances", { address: ADDRESS_B, chains: "1" }, "user");
    expect(calls.length).toBe(2);
    expect(calls[1]).toContain(`address=${ADDRESS_B}`);
  });

  test("a request the route refuses never reaches the provider", async () => {
    const { gateway, calls } = gatewayWith(balances);
    const r = await gateway.call("/onchain/wallet-balances", { address: "0x123", chains: "1" }, "user");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad_request");
    expect(calls.length).toBe(0);
  });

  test("the token PnL is a basic read and the overview a premium one", async () => {
    const pnl = gatewayWith({ isPnlSupported: true, realizedPnlUsd: "1", unrealizedPnlUsd: "2", totalPnlUsd: "3", realizedPnlPercent: "1", unrealizedPnlPercent: "2", totalPnlPercent: "3" });
    const a = await pnl.gateway.call("/onchain/wallet-token-pnl", { address: ADDRESS_A, chainIndex: "1", token: ADDRESS_B }, "user");
    expect(a.ok && a.meta.tier).toBe("basic");
    expect(pnl.budget.snapshot().tiers.basic.used).toBe(1);
    const overview = gatewayWith({ winRate: "50", buyTxCount: "4", sellTxCount: "2" });
    const b = await overview.gateway.call("/onchain/wallet-overview", { address: ADDRESS_A, chainIndex: "1", timeFrame: "3" }, "user");
    expect(b.ok && b.meta.tier).toBe("premium");
    expect(overview.budget.snapshot().tiers.premium.used).toBe(1);
  });

  test("an answer that is not the documented shape is a contract error, never a number on the screen", async () => {
    const { gateway } = gatewayWith("surprise");
    const r = await gateway.call("/onchain/wallet-balances", { address: ADDRESS_A, chains: "1" }, "user");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("schema");
  });
});
