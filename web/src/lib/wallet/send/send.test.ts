// WAL-10: the one module that asks the wallet to send. It is tested with a provider that records every request, so what is asserted is exactly what the wallet would have been asked. origin: synthetic_fixture,
// tests only: no real wallet is touched and nothing is sent anywhere.
import { describe, expect, test } from "bun:test";
import { evaluateGate, type Cleared, type GateInput } from "./gate";
import { createTradeLog, spentLast24hUsd, type TradeLogEntry } from "./log";
import { awaitReceipt, readAllowance, sendCleared, type SendHooks, type SendProvider } from "./send";
import { ACCOUNT, HASH_A, NOW, OTHER_ACCOUNT, ROUTER, SPENDER, USDC, approval, memoryStorage, order, settingsOn, swap } from "./fixtures";
import { NATIVE_TOKEN } from "./order";
import type { TradeSettings } from "./settings";

interface Call {
  readonly method: string;
  readonly params: readonly unknown[];
}

function fakeWallet(over: { account?: string | null; chainId?: string; send?: () => unknown | Promise<unknown>; receipt?: () => unknown; call?: () => unknown } = {}) {
  const calls: Call[] = [];
  const provider: SendProvider = {
    async request(args) {
      const params = (args.params ?? []) as readonly unknown[];
      calls.push({ method: args.method, params });
      switch (args.method) {
        case "eth_accounts":
          return over.account === null ? [] : [over.account ?? ACCOUNT];
        case "eth_chainId":
          return over.chainId ?? "0x2105";
        case "eth_sendTransaction":
          return over.send ? over.send() : HASH_A;
        case "eth_getTransactionReceipt":
          return over.receipt ? over.receipt() : null;
        case "eth_call":
          return over.call ? over.call() : "0x" + "0".repeat(63) + "5";
        default:
          throw Object.assign(new Error("not allowed"), { code: -32601 });
      }
    },
  };
  return { provider, calls, sent: () => calls.filter((c) => c.method === "eth_sendTransaction") };
}

function cleared(over: Partial<GateInput> = {}): Cleared {
  const r = evaluateGate({
    settings: settingsOn(), nowMs: NOW, spentLast24hUsd: 0, logDurable: true, order: order(), step: "swap", swap: swap(), swapFetchedAtMs: NOW - 1_000, approval: null,
    wallet: { account: ACCOUNT, chainIdHex: "0x2105" }, typed: "AAA", ...over,
  });
  if (!r.ok) throw new Error(`fixture is blocked: ${r.blocks.map((b) => b.code).join(",")}`);
  return r.cleared;
}

/** The hooks a screen gives: a log that can keep what it is given, the clock, and the settings and the spending as they are NOW. */
function hooks(over: Partial<{ settings: () => TradeSettings; spent: () => number; nowMs: () => number }> = {}) {
  const log = createTradeLog({ storage: memoryStorage() });
  const h: SendHooks = { log, nowMs: over.nowMs ?? (() => NOW), settings: over.settings ?? (() => settingsOn()), spent24h: over.spent ?? (() => 0) };
  return { ...h, log };
}

describe("what is sent", () => {
  test("the swap: one request, to the router the gate checked, from the account, with the exact value and a quarter more gas", async () => {
    const w = fakeWallet();
    const out = await sendCleared(w.provider, cleared(), hooks());
    expect(out).toEqual({ ok: true, txHash: HASH_A });
    expect(w.sent()).toHaveLength(1);
    expect(w.sent()[0]!.params).toEqual([{ from: ACCOUNT, to: ROUTER, data: "0x12aa3caf0000", value: "0x0", gas: "0x4c4b4" }]);
    // it asked who the wallet is before it asked it to send
    expect(w.calls.map((c) => c.method)).toEqual(["eth_accounts", "eth_chainId", "eth_sendTransaction"]);
  });

  test("the approval goes to the token that is given, for nothing in coin, with the calldata the gate decoded", async () => {
    const w = fakeWallet();
    const c = cleared({ step: "approve", approval: approval() });
    const out = await sendCleared(w.provider, c, hooks());
    expect(out.ok).toBe(true);
    expect(w.sent()[0]!.params).toEqual([{ from: ACCOUNT, to: USDC, data: approval().data, value: "0x0", gas: "0xf424" }]);
  });

  test("the coin of the network goes with the swap when it is the coin given", async () => {
    const native = order({ dollarSide: "to", from: { address: NATIVE_TOKEN, symbol: "ETH", decimals: 18 }, to: { address: USDC, symbol: "USDC", decimals: 6 }, side: "sell", amountMinor: "1000000000000000000" });
    const s = swap({
      route: { fromAmount: "1000000000000000000", toAmount: "3000000000", fromToken: { address: NATIVE_TOKEN, symbol: "ETH", decimals: 18, unitPriceUsd: 3000, taxRate: 0, isHoneyPot: false }, toToken: { address: USDC, symbol: "USDC", decimals: 6, unitPriceUsd: 1, taxRate: 0, isHoneyPot: false } },
      tx: { value: "1000000000000000000", minReceiveAmount: "2970000000" },
    });
    const w = fakeWallet();
    const big = settingsOn({ perOperationUsd: 5000, dailyUsd: 5000 });
    const c = cleared({ order: native, swap: s, typed: "ETH", settings: big });
    expect((await sendCleared(w.provider, c, hooks({ settings: () => big }))).ok).toBe(true);
    expect((w.sent()[0]!.params[0] as { value: string }).value).toBe("0xde0b6b3a7640000");
  });

  test("no gas from the provider means no gas in the request: the wallet estimates", async () => {
    const w = fakeWallet();
    await sendCleared(w.provider, cleared({ swap: swap({ tx: { gas: null } }) }), hooks());
    expect(Object.keys(w.sent()[0]!.params[0] as object).sort()).toEqual(["data", "from", "to", "value"]);
  });
});

describe("what is refused before the wallet is asked", () => {
  test("anything that is not a permission from the gate", async () => {
    const w = fakeWallet();
    const fake = { step: "swap", order: order(), swap: swap(), approval: null, usd: 1, issuedAtMs: NOW } as unknown as Cleared;
    const out = await sendCleared(w.provider, fake, hooks());
    expect(out.ok).toBe(false);
    expect(w.calls).toEqual([]);
  });

  test("a wallet that is on another account or another network than the order, whatever the page remembers", async () => {
    for (const w of [fakeWallet({ account: OTHER_ACCOUNT }), fakeWallet({ chainId: "0x1" }), fakeWallet({ account: null })]) {
      const out = await sendCleared(w.provider, cleared(), hooks());
      expect(out.ok).toBe(false);
      expect(w.sent()).toEqual([]);
    }
  });

  test("a copy of a permission, changed to say something else, is not a permission", async () => {
    const native = order({ from: { address: NATIVE_TOKEN, symbol: "ETH", decimals: 18 } });
    const forged = { ...cleared(), step: "approve", order: native, approval: approval() } as unknown as Cleared;
    const w = fakeWallet();
    expect((await sendCleared(w.provider, forged, hooks())).ok).toBe(false);
    expect(w.calls).toEqual([]);
  });

  test("a permission is for one send: the same one a second time, or one that grew old, is refused and the wallet is not asked", async () => {
    const w = fakeWallet();
    const c = cleared();
    expect((await sendCleared(w.provider, c, hooks())).ok).toBe(true);
    const again = await sendCleared(w.provider, c, hooks());
    expect(again.ok).toBe(false);
    expect(w.sent()).toHaveLength(1);
    const late = fakeWallet();
    expect((await sendCleared(late.provider, cleared(), hooks({ nowMs: () => NOW + 60_001 }))).ok).toBe(false);
    expect(late.calls).toEqual([]);
    expect((await sendCleared(late.provider, cleared(), hooks({ nowMs: () => NOW - 1 }))).ok).toBe(false);
    expect(late.calls).toEqual([]);
    // the permission is good for sixty seconds and the QUOTE for thirty: the quote is the stricter, and it is looked at again right before the wallet is asked
    expect((await sendCleared(late.provider, cleared(), hooks({ nowMs: () => NOW + 29_000 }))).ok).toBe(true);
  });

  test("the age of the QUOTE is looked at again last, right before the wallet is asked, after the reads of the wallet that took time", async () => {
    // the clock moves while the wallet answers who it is: the first look (at entry) passes, the last one (before the request) does not
    let now = NOW;
    const w = fakeWallet({ account: ACCOUNT });
    const original = w.provider.request.bind(w.provider);
    const slow: SendProvider = {
      request: async (a) => {
        const r = await original(a);
        if (a.method === "eth_chainId") now = NOW + 29_500;
        return r;
      },
    };
    // the quote was fetched at NOW - 1000: at NOW + 29_500 it is 30_500 ms old
    const out = await sendCleared(slow, cleared(), hooks({ nowMs: () => now }));
    expect(out.ok).toBe(false);
    expect(w.sent()).toEqual([]);
  });

  test("a provider that is not a wallet", async () => {
    const out = await sendCleared({} as SendProvider, cleared(), hooks());
    expect(out).toMatchObject({ ok: false, error: { kind: "desconectado" } });
  });
});

describe("the last moment: what changed since the click", () => {
  test("a stop clicked in another tab after the click, an option turned off, or the day's cap spent by another tab, stops the order before the wallet is asked", async () => {
    for (const [settings, spent] of [[settingsOn({ killed: true }), 0], [settingsOn({ enabled: false }), 0], [settingsOn(), 450]] as const) {
      const w = fakeWallet();
      const out = await sendCleared(w.provider, cleared(), hooks({ settings: () => settings, spent: () => spent }));
      expect(out.ok).toBe(false);
      expect(w.sent()).toEqual([]);
    }
  });

  test("the settings are read again at that moment, not the ones the screen had", async () => {
    let reads = 0;
    const w = fakeWallet();
    await sendCleared(w.provider, cleared(), hooks({ settings: () => (reads += 1, settingsOn()) }));
    expect(reads).toBe(1);
  });
});

describe("the log: written before, and settled after", () => {
  test("the attempt is in the log, counted, BEFORE the wallet is asked, and gets its hash when the wallet answers", async () => {
    const h = hooks();
    let seen: readonly TradeLogEntry[] = [];
    const w = fakeWallet({ send: () => ((seen = h.log.list()), HASH_A) });
    await sendCleared(w.provider, cleared(), h);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ result: "pendente", usd: 100, txHash: null, step: "swap", symbol: "AAA" });
    expect(spentLast24hUsd(seen, NOW)).toBe(100);
    expect(h.log.list()).toHaveLength(1);
    expect(h.log.list()[0]).toMatchObject({ result: "enviada", txHash: HASH_A, usd: 100, briefHash: "abc123" });
  });

  test("a refusal in the wallet is logged as refused and nothing is counted against the cap", async () => {
    const w = fakeWallet({ send: () => Promise.reject(Object.assign(new Error("User rejected the request with a long message that must not be kept"), { code: 4001 })) });
    const h = hooks();
    const out = await sendCleared(w.provider, cleared(), h);
    expect(out).toMatchObject({ ok: false, result: "recusada", error: { kind: "recusado" } });
    expect(JSON.stringify(out)).not.toContain("long message");
    expect(h.log.list()).toHaveLength(1);
    expect(h.log.list()[0]).toMatchObject({ result: "recusada", txHash: null, usd: 100 });
    expect(spentLast24hUsd(h.log.list(), NOW)).toBe(0);
  });

  test("only the failures that PROVE nothing is open in the wallet stop counting: refused data, not authorized, not connected, a request of another page waiting", async () => {
    for (const code of [-32602, 4100, -32002, 4200, 4902]) {
      const h = hooks();
      await sendCleared(fakeWallet({ send: () => Promise.reject(Object.assign(new Error("x"), { code })) }).provider, cleared(), h);
      expect(h.log.list()[0]).toMatchObject({ result: "falhou" });
      expect(spentLast24hUsd(h.log.list(), NOW)).toBe(0);
    }
  });

  test("a wallet that fails INSIDE, or with a code nobody knows, may still be answered in its window: the attempt stays open and counted until the person closes it", async () => {
    // "disconnected" (4900, 4901) is NOT proof: a wallet whose service died after the person signed reads the same
    for (const code of [-32603, 5000, -1, 4900, 4901]) {
      const h = hooks();
      const out = await sendCleared(fakeWallet({ send: () => Promise.reject(Object.assign(new Error("x"), { code })) }).provider, cleared(), h);
      expect(out.ok).toBe(false);
      expect(h.log.list()[0]).toMatchObject({ result: "pendente" });
      expect(spentLast24hUsd(h.log.list(), NOW)).toBe(100);
      // the person looked in the wallet, no window is open: they close it, and it stops counting
      expect(h.log.settle(h.log.list()[0]!.id, { result: "falhou" })).toBe(true);
      expect(spentLast24hUsd(h.log.list(), NOW)).toBe(0);
    }
  });

  test("an answer that is lost or unknown leaves the attempt OPEN and counted: the window may still be answered, and the cap must have seen it", async () => {
    const h = hooks();
    const out = await sendCleared(fakeWallet({ send: () => Promise.reject(new Error("no code at all")) }).provider, cleared(), h);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.text).toContain("a ordem segue contada no seu teto do dia");
    expect(h.log.list()[0]).toMatchObject({ result: "pendente", txHash: null });
    expect(spentLast24hUsd(h.log.list(), NOW)).toBe(100);
  });

  test("an answer that is not a transaction hash leaves it open and counted, said as such", async () => {
    for (const bad of ["ok", "0x12", null, 5, { hash: HASH_A }]) {
      const h = hooks();
      const out = await sendCleared(fakeWallet({ send: () => bad }).provider, cleared(), h);
      expect(out.ok).toBe(false);
      expect(h.log.list()[0]).toMatchObject({ result: "pendente" });
      expect(spentLast24hUsd(h.log.list(), NOW)).toBe(100);
    }
  });

  test("the approval is logged with no dollars, so it does not count against the cap", async () => {
    const h = hooks();
    await sendCleared(fakeWallet().provider, cleared({ step: "approve", approval: approval() }), h);
    expect(h.log.list()[0]).toMatchObject({ step: "approve", usd: null, result: "enviada" });
    expect(spentLast24hUsd(h.log.list(), NOW)).toBe(0);
  });

  test("when the attempt cannot be kept (no storage, or a storage that refuses) nothing is sent", async () => {
    const w = fakeWallet();
    const none = { ...hooks(), log: createTradeLog() };
    expect((await sendCleared(w.provider, cleared(), none)).ok).toBe(false);
    expect(w.sent()).toEqual([]);
    const full = createTradeLog({ storage: { getItem: () => null, setItem: () => { throw new Error("full"); } } });
    expect((await sendCleared(w.provider, cleared(), { ...hooks(), log: full })).ok).toBe(false);
    expect(w.sent()).toEqual([]);
  });

  test("a second click while the wallet window is open is refused and makes no second order", async () => {
    let release: (hash: string) => void = () => undefined;
    const w = fakeWallet({ send: () => new Promise((resolve) => (release = resolve as (hash: string) => void)) });
    const h = hooks();
    const first = sendCleared(w.provider, cleared(), h);
    // let the first get to the wallet window
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
    const second = await sendCleared(w.provider, cleared(), h);
    expect(second).toMatchObject({ ok: false, error: { kind: "pedido_pendente" } });
    release(HASH_A);
    expect(await first).toEqual({ ok: true, txHash: HASH_A });
    expect(w.sent()).toHaveLength(1);
  });

  test("the wallet is asked only for the methods of an order: reading who it is, sending, the receipt and the allowance", async () => {
    const w = fakeWallet();
    await sendCleared(w.provider, cleared(), hooks());
    await awaitReceipt(w.provider, HASH_A, { log: createTradeLog({ storage: memoryStorage() }), sleep: async () => undefined, timeoutMs: 0 });
    await readAllowance(w.provider, USDC, ACCOUNT, SPENDER);
    const allowed = new Set(["eth_accounts", "eth_chainId", "eth_sendTransaction", "eth_getTransactionReceipt", "eth_call"]);
    expect(w.calls.every((c) => allowed.has(c.method))).toBe(true);
  });
});

describe("the receipt", () => {
  const entry: TradeLogEntry = { id: "abcdef0123456789", atMs: NOW, chainIndex: "8453", side: "buy", step: "swap", symbol: "AAA", usd: 100, txHash: HASH_A, result: "enviada", briefHash: null };
  const withEntry = () => {
    const log = createTradeLog({ storage: memoryStorage() });
    log.add(entry);
    return log;
  };

  test("a confirmed transaction moves the log from sent to confirmed", async () => {
    const log = withEntry();
    expect(await awaitReceipt(fakeWallet({ receipt: () => ({ status: "0x1" }) }).provider, HASH_A, { log, sleep: async () => undefined })).toBe("confirmada");
    expect(log.list()[0]!.result).toBe("confirmada");
  });

  test("a reverted one is said as reverted, and stops counting", async () => {
    const log = withEntry();
    expect(await awaitReceipt(fakeWallet({ receipt: () => ({ status: "0x0" }) }).provider, HASH_A, { log, sleep: async () => undefined })).toBe("revertida");
    expect(log.list()[0]!.result).toBe("revertida");
    expect(spentLast24hUsd(log.list(), NOW)).toBe(0);
  });

  test("it waits for the chain, and when the time is up there is a hash and no receipt, and it still counts", async () => {
    const log = withEntry();
    let tries = 0;
    expect(await awaitReceipt(fakeWallet({ receipt: () => (++tries < 3 ? null : { status: "0x1" }) }).provider, HASH_A, { log, sleep: async () => undefined, intervalMs: 1, timeoutMs: 10 })).toBe("confirmada");
    const late = withEntry();
    expect(await awaitReceipt(fakeWallet().provider, HASH_A, { log: late, sleep: async () => undefined, intervalMs: 1, timeoutMs: 5 })).toBe("sem_recibo");
    expect(late.list()[0]!.result).toBe("sem_recibo");
    expect(spentLast24hUsd(late.list(), NOW)).toBe(100);
  });

  test("the cap counts by the clock: older than a day does not count, and an entry from the future is never read as old", () => {
    expect(spentLast24hUsd([{ ...entry, atMs: NOW - 24 * 3_600_000 }], NOW)).toBe(0);
    expect(spentLast24hUsd([{ ...entry, atMs: NOW - 24 * 3_600_000 + 1 }], NOW)).toBe(100);
    expect(spentLast24hUsd([{ ...entry, atMs: NOW + 3_600_000 }], NOW)).toBe(100);
  });
});

describe("the allowance", () => {
  test("it is what the token says, and unknown when the token cannot be asked", async () => {
    expect(await readAllowance(fakeWallet().provider, USDC, ACCOUNT, SPENDER)).toBe(BigInt(5));
    expect(await readAllowance(fakeWallet({ call: () => "0x" }).provider, USDC, ACCOUNT, SPENDER)).toBeNull();
    expect(await readAllowance(fakeWallet({ call: () => { throw new Error("x"); } }).provider, USDC, ACCOUNT, SPENDER)).toBeNull();
    expect(await readAllowance(fakeWallet().provider, "nope", ACCOUNT, SPENDER)).toBeNull();
  });
});
