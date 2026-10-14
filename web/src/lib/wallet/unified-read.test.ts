// "Minha carteira" read ONCE across both kinds of account: the EVM address on its networks and the Solana account on network 501, put together in one reading. The EVM networks go in
// groups of four (the provider refuses six or more at once for a wallet with many tokens), a group that is refused is asked again network by network, the Solana account is a read of
// its own, and what did not answer is named, never turned into zero. Nothing here signs, sends or talks to the model. origin: synthetic_fixture, tests only (made up addresses and balances).
import { describe, expect, test } from "bun:test";
import type { BalanceRow, BalancesData, HistoryData, HistoryRow, HoldingsError, HoldingsParams, HoldingsReader, HoldingsResult, ValueData } from "./holdings";
import { readUnified, unifiedTarget, type UnifiedTarget } from "./unified-read";

const EVM = "0xabcdef0123456789abcdef0123456789abcdef01";
const SOL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const NETS = ["143", "196", "1", "56", "8453", "42161", "137", "10"];
const TARGET: UnifiedTarget = { evm: { address: EVM, networks: NETS }, solana: { address: SOL } };

const meta = (ageMs = 0, over: Record<string, unknown> = {}) => ({ tier: "free" as const, cachedAtMs: 1_000_000 - ageMs, ageMs, stale: false, budget: { tier: "free" as const, used: 1, cap: null }, ...over });
const brow = (chainIndex: string, symbol: string, valueUsd: number | null, over: Partial<BalanceRow> = {}): BalanceRow => ({
  chainIndex, symbol, tokenAddress: symbol === "SOL" || symbol === "ETH" ? null : `${symbol.toLowerCase()}-token`, balance: 1, priceUsd: valueUsd, valueUsd, flaggedRisk: false, ...over,
});
const hrow = (chainIndex: string, txHash: string, atMs: number): HistoryRow => ({
  chainIndex, txHash, atMs, kind: "token", symbol: "USDC", amount: 1, tokenAddress: null, status: "success", feeNative: null, from: "0x11...0000", to: "0xAb...Ef01", flaggedByProvider: false,
});

interface Script {
  /** A refusal for a call that asks these networks, or null to answer. */
  readonly refuse?: (params: HoldingsParams, route: "value" | "balances" | "history") => HoldingsError | null;
  readonly values?: Record<string, number | null>;
  readonly rows?: Record<string, BalanceRow[]>;
  readonly history?: Record<string, HistoryRow[]>;
  readonly ageMs?: number;
}
function fakeReader(script: Script = {}) {
  const calls: { route: string; address: string; chains: readonly string[] }[] = [];
  const ok = <T,>(data: T): HoldingsResult<T> => ({ ok: true, data, meta: meta(script.ageMs ?? 0) });
  const answer = <T,>(route: "value" | "balances" | "history", params: HoldingsParams, build: () => T): Promise<HoldingsResult<T>> => {
    calls.push({ route, address: params.address, chains: params.chains });
    const refused = script.refuse?.(params, route) ?? null;
    return Promise.resolve(refused === null ? ok(build()) : { ok: false, error: refused });
  };
  const reader: Pick<HoldingsReader, "value" | "balances" | "history"> = {
    value: (params) => answer<ValueData>("value", params, () => ({ totalValueUsd: params.chains.reduce((s, c) => s + (script.values?.[c] ?? 0), 0) })),
    balances: (params) => answer<BalancesData>("balances", params, () => {
      const rows = params.chains.flatMap((c) => script.rows?.[c] ?? []);
      return { rows, total: rows.length };
    }),
    history: (params) => answer<HistoryData>("history", params, () => ({ cursor: null, rows: params.chains.flatMap((c) => script.history?.[c] ?? []) })),
  };
  return { reader, calls };
}
const run = (reader: Pick<HoldingsReader, "value" | "balances" | "history">, target: UnifiedTarget = TARGET, over: { signal?: AbortSignal; now?: () => number } = {}) =>
  readUnified(reader, target, { now: over.now ?? (() => 1_000_000), ...(over.signal ? { signal: over.signal } : {}) });

describe("what is read", () => {
  test("a target needs at least one of the two accounts", () => {
    expect(unifiedTarget({ evmAccount: null, solanaAccount: null, evmNetworks: NETS })).toBeNull();
    expect(unifiedTarget({ evmAccount: EVM, solanaAccount: SOL, evmNetworks: NETS })).toEqual(TARGET);
    expect(unifiedTarget({ evmAccount: EVM, solanaAccount: null, evmNetworks: NETS })).toEqual({ evm: { address: EVM, networks: NETS }, solana: null });
    expect(unifiedTarget({ evmAccount: null, solanaAccount: SOL, evmNetworks: NETS })).toEqual({ evm: null, solana: { address: SOL } });
  });

  test("the EVM networks go in groups of four for each route, the Solana account on network 501 alone, each address with its own family", async () => {
    const f = fakeReader();
    await run(f.reader);
    const evmCalls = f.calls.filter((c) => c.address === EVM);
    const solCalls = f.calls.filter((c) => c.address === SOL);
    for (const route of ["value", "balances", "history"]) {
      expect(evmCalls.filter((c) => c.route === route).map((c) => c.chains)).toEqual([NETS.slice(0, 4), NETS.slice(4)]);
      expect(solCalls.filter((c) => c.route === route).map((c) => c.chains)).toEqual([["501"]]);
    }
    expect(f.calls.length).toBe(9);
    // an EVM address never asks 501 and the Solana address never asks anything else
    expect(evmCalls.every((c) => !c.chains.includes("501"))).toBe(true);
    expect(solCalls.every((c) => c.chains.length === 1 && c.chains[0] === "501")).toBe(true);
  });

  test("only one account: only its reads are made, and nothing is said to be missing for the other", async () => {
    const evmOnly = fakeReader();
    const a = await run(evmOnly.reader, { evm: TARGET.evm, solana: null });
    expect(evmOnly.calls.every((c) => c.address === EVM)).toBe(true);
    expect(a?.networks).toEqual(NETS);
    expect(a?.missing).toEqual([]);
    const solOnly = fakeReader();
    const b = await run(solOnly.reader, { evm: null, solana: TARGET.solana });
    expect(solOnly.calls.length).toBe(3);
    expect(b?.networks).toEqual(["501"]);
  });
});

describe("the one reading", () => {
  const script: Script = {
    values: { "1": 1000, "8453": 200, "501": 415 },
    rows: {
      "1": [brow("1", "ETH", 900), brow("1", "USDC", 100)],
      "8453": [brow("8453", "ETH", 200)],
      "501": [brow("501", "SOL", 375), brow("501", "USDC", 40), brow("501", "NOPRICE", null)],
    },
    history: { "1": [hrow("1", "0xa", 3000), hrow("1", "0xc", 1000)], "501": [hrow("501", "sigB", 2000)] },
    ageMs: 4000,
  };

  test("the total is the sum of the two, the networks are both, and nothing is missing", async () => {
    const r = await run(fakeReader(script).reader);
    expect(r?.networks).toEqual([...NETS, "501"]);
    expect(r?.value.ok && r.value.data.totalValueUsd).toBe(1615);
    expect(r?.missing).toEqual([]);
  });

  test("the holdings are one list, the largest value first, an unpriced one last and kept, each with its own network", async () => {
    const r = await run(fakeReader(script).reader);
    expect(r?.balances.ok).toBe(true);
    if (r?.balances.ok) {
      expect(r.balances.data.rows.map((x) => `${x.chainIndex}:${x.symbol}`)).toEqual(["1:ETH", "501:SOL", "8453:ETH", "1:USDC", "501:USDC", "501:NOPRICE"]);
      expect(r.balances.data.total).toBe(6);
      expect(r.balances.data.rows.at(-1)?.valueUsd).toBeNull();
    }
  });

  test("the history is one list, the latest first, whichever account it came from", async () => {
    const r = await run(fakeReader(script).reader);
    expect(r?.history.ok && r.history.data.rows.map((x) => x.txHash)).toEqual(["0xa", "sigB", "0xc"]);
    expect(r?.history.ok && r.history.data.cursor).toBeNull();
  });

  test("how old it is: the oldest answer, measured when the reading ended, so a slow group does not make the first look fresher", async () => {
    let t = 1_000_000;
    const slow = fakeReader({ ...script, ageMs: 4000 });
    const wrapped: Pick<HoldingsReader, "value" | "balances" | "history"> = {
      value: (p, s) => { t += 1000; return slow.reader.value(p, s); },
      balances: (p, s) => { t += 1000; return slow.reader.balances(p, s); },
      history: (p, s) => { t += 1000; return slow.reader.history(p, s); },
    };
    const r = await readUnified(wrapped, TARGET, { now: () => t });
    expect(r?.receivedAtMs).toBe(t);
    const age = r?.balances.ok ? r.balances.meta.ageMs : -1;
    // at least the age the provider reported, plus the time the slowest wait added to the earliest answers
    expect(age).toBeGreaterThanOrEqual(4000);
    expect(age).toBeGreaterThan(4000);
    expect(r?.balances.ok && r.balances.meta.stale).toBe(false);
  });

  test("an answer served from an old copy marks the whole reading as such", async () => {
    const reader: Pick<HoldingsReader, "value" | "balances" | "history"> = {
      ...fakeReader(script).reader,
      balances: (p) => Promise.resolve({ ok: true, data: { rows: [brow(p.chains[0]!, "ETH", 1)], total: 1 }, meta: meta(0, { stale: p.address === SOL }) }),
    };
    const r = await run(reader);
    expect(r?.balances.ok && r.balances.meta.stale).toBe(true);
  });
});

describe("what did not answer", () => {
  test("a group the provider refuses is asked again network by network; one that still refuses is named and the others stay", async () => {
    const f = fakeReader({
      rows: { "1": [brow("1", "ETH", 900)], "56": [brow("56", "BNB", 50)], "8453": [brow("8453", "ETH", 200)] },
      values: { "1": 900, "56": 50, "8453": 200 },
      refuse: (p, route) => {
        if (p.address !== EVM) return null;
        // the first group of four is refused as a group, and the BNB Chain is refused even alone
        if (p.chains.length > 1 && p.chains[0] === "143") return "provider_error";
        if (p.chains.length === 1 && p.chains[0] === "56" && route !== "history") return "provider_error";
        return null;
      },
    });
    const r = await run(f.reader, { evm: TARGET.evm, solana: null });
    expect(r?.balances.ok && r.balances.data.rows.map((x) => x.symbol)).toEqual(["ETH", "ETH"]);
    expect(r?.missing.some((m) => m.label === "BNB Chain" && m.what === "saldos")).toBe(true);
    expect(r?.missing.some((m) => m.label === "BNB Chain" && m.what === "valor")).toBe(true);
    expect(r?.missing.every((m) => m.label === "BNB Chain")).toBe(true);
    // the value is what the networks that answered add up to, and it is not claimed to be the whole
    expect(r?.value.ok && r.value.data.totalValueUsd).toBe(1100);
    const single = f.calls.filter((c) => c.route === "balances" && c.chains.length === 1).map((c) => c.chains[0]);
    expect(single).toEqual(["143", "196", "1", "56"]);
  });

  test("the Solana account failing leaves the EVM reading, and says Solana is missing, with the reason in our words", async () => {
    const f = fakeReader({
      rows: { "1": [brow("1", "ETH", 900)] }, values: { "1": 900 },
      refuse: (p) => (p.address === SOL ? "provider_error" : null),
    });
    const r = await run(f.reader);
    expect(r?.value.ok && r.value.data.totalValueUsd).toBe(900);
    expect(r?.balances.ok && r.balances.data.rows.length).toBe(1);
    expect(r?.missing.filter((m) => m.label === "Solana").map((m) => m.what).sort()).toEqual(["historico", "saldos", "valor"]);
    expect(r?.missing.find((m) => m.label === "Solana")?.reason).toBe("A OKX respondeu com erro.");
  });

  test("the EVM side failing leaves the Solana reading", async () => {
    const f = fakeReader({ rows: { "501": [brow("501", "SOL", 375)] }, values: { "501": 375 }, refuse: (p) => (p.address === EVM ? "provider_error" : null) });
    const r = await run(f.reader);
    expect(r?.value.ok && r.value.data.totalValueUsd).toBe(375);
    expect(r?.balances.ok && r.balances.data.rows.map((x) => x.symbol)).toEqual(["SOL"]);
    expect(r?.missing.some((m) => m.label === "Redes EVM" && m.what === "saldos")).toBe(true);
  });

  test("a Solana account with nothing in it is an answer, not a failure: nothing is missing", async () => {
    const f = fakeReader({ rows: { "1": [brow("1", "ETH", 900)] }, values: { "1": 900 } });
    const r = await run(f.reader);
    expect(r?.missing).toEqual([]);
    expect(r?.balances.ok && r.balances.data.rows.length).toBe(1);
  });

  test("an address the provider has no value for is not a failure either (no data is not zero, and not missing)", async () => {
    const reader: Pick<HoldingsReader, "value" | "balances" | "history"> = {
      ...fakeReader({ rows: { "501": [brow("501", "SOL", 5)] } }).reader,
      value: (p) => Promise.resolve(p.address === SOL ? ({ ok: true, data: { totalValueUsd: 5 }, meta: meta() } as const) : ({ ok: false, error: "sem_dados" } as const)),
    };
    const r = await run(reader);
    expect(r?.value.ok && r.value.data.totalValueUsd).toBe(5);
    expect(r?.missing).toEqual([]);
    const none = await run({ ...reader, value: () => Promise.resolve({ ok: false, error: "sem_dados" } as const) });
    expect(none?.value).toEqual({ ok: false, error: "sem_dados" });
  });

  test("an error that holds for every request stops the reading of that side, and when both fail every block carries the error", async () => {
    const f = fakeReader({ refuse: () => "no_credentials" });
    const r = await run(f.reader);
    expect(r?.value).toEqual({ ok: false, error: "no_credentials" });
    expect(r?.balances).toEqual({ ok: false, error: "no_credentials" });
    expect(r?.history).toEqual({ ok: false, error: "no_credentials" });
    // an error that holds for all is not asked again network by network: one try for each route of each side at most
    expect(f.calls.length).toBeLessThanOrEqual(6);
  });

  test("the history failing alone leaves value and holdings, and names what is missing", async () => {
    const f = fakeReader({ rows: { "1": [brow("1", "ETH", 900)] }, values: { "1": 900 }, refuse: (_p, route) => (route === "history" ? "provider_error" : null) });
    const r = await run(f.reader);
    expect(r?.balances.ok).toBe(true);
    expect(r?.history).toEqual({ ok: false, error: "provider_error" });
    expect(r?.missing.every((m) => m.what === "historico")).toBe(true);
  });
});

describe("cancelling", () => {
  test("a reading that was cancelled gives nothing back, and asks nothing more", async () => {
    const controller = new AbortController();
    const f = fakeReader();
    const reader: Pick<HoldingsReader, "value" | "balances" | "history"> = {
      ...f.reader,
      balances: async (p, s) => {
        controller.abort();
        return f.reader.balances(p, s);
      },
    };
    const r = await run(reader, TARGET, { signal: controller.signal });
    expect(r).toBeNull();
    // after the abort no new group is asked
    expect(f.calls.filter((c) => c.route === "balances").length).toBeLessThanOrEqual(2);
  });

  test("already cancelled before it starts: nothing is asked", async () => {
    const controller = new AbortController();
    controller.abort();
    const f = fakeReader();
    expect(await run(f.reader, TARGET, { signal: controller.signal })).toBeNull();
    expect(f.calls.length).toBe(0);
  });
});
