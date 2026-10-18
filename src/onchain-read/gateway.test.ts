import { afterEach, describe, expect, test, vi } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBudget } from "./budget";
import { createOnchainCache } from "./cache";
import { createOkxBudget, createOnchainClient, type ClientResult, type OkxCredentials, type OnchainClient } from "./client";
import { createOnchainGateway } from "./gateway";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jev-onchain-gw-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const OK_DATA = [{ chainIndex: "1", chainName: "Ethereum", chainSymbol: "ETH" }];
const TEST_CREDS: OkxCredentials = { apiKey: "TEST-KEY", secret: "TEST-SECRET", passphrase: "TEST-PASS" };

function setup(opts: { state?: "absent" | "incomplete" | "complete"; next?: () => ClientResult | Promise<ClientResult>; cap?: number | (() => number); now?: () => number } = {}) {
  let t = opts.now ? opts.now() : 1_000_000;
  const calls: string[] = [];
  const client: OnchainClient = {
    call: async (req, _tier, admitDispatch) => {
      calls.push(req.path);
      const next: ClientResult | Promise<ClientResult> = opts.next ? opts.next() : { ok: true, data: OK_DATA, sent: true };
      if (next instanceof Promise) {
        const admitted = admitDispatch();
        if (!admitted.ok) return { ok: false, error: admitted.reason, sent: false };
        return next;
      }
      if (next.sent) {
        const admitted = admitDispatch();
        if (!admitted.ok) return { ok: false, error: admitted.reason, sent: false };
      }
      return next;
    },
    status: () => ({ lastCallMs: t, lastCode: 0, cooldownUntilMs: null, clockOffsetMs: null }),
  };
  const cap = () => typeof opts.cap === "function" ? opts.cap() : opts.cap ?? 10;
  const budget = createBudget({ dir: tempDir(), now: () => t, caps: () => ({ basic: cap(), premium: cap() }) });
  const gateway = createOnchainGateway({
    client,
    cache: createOnchainCache(() => t),
    budget,
    credentialsState: () => opts.state ?? "complete",
    now: () => t,
  });
  return { gateway, budget, calls, tick: (ms: number) => (t += ms) };
}


describe("onchain gateway", () => {
  test("an expired result is not cached and a default-deadline follow-up dispatches fresh data", async () => {
    vi.useFakeTimers();
    const startedAt = 1_000;
    let monotonicNow = startedAt;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => monotonicNow);
    const lateData = [{ chainIndex: "1", chainName: "Ethereum", chainSymbol: "ETH" }];
    const freshData = [{ chainIndex: "8453", chainName: "Base", chainSymbol: "ETH" }];
    const freshResult = [{ chainIndex: "8453", name: "Base", symbol: "ETH" }];
    let sends = 0;
    const fetcher = Object.assign(async () => {
      sends += 1;
      if (sends === 1) {
        monotonicNow = startedAt + 60_000;
        return new Response(JSON.stringify({ code: "0", data: lateData }));
      }
      return new Response(JSON.stringify({ code: "0", data: freshData }));
    }, { preconnect: async () => { } });
    const client = createOnchainClient({
      credentials: () => TEST_CREDS,
      budget: createOkxBudget({ ledgerPath: join(tempDir(), "ledger.json"), now: Date.now }),
      fetch: fetcher,
      now: Date.now, minIntervalMs: 0,
    });
    const budget = createBudget({ dir: tempDir(), now: Date.now, caps: () => ({ basic: 1, premium: 1 }) });
    const gateway = createOnchainGateway({ client, budget, cache: createOnchainCache(Date.now), credentialsState: () => "complete", now: Date.now });
    try {
      expect(await gateway.callInternal("/onchain/chains", {}, "user")).toEqual({ ok: false, error: "provider_error", sent: true });
      expect(gateway.budget().tiers.free.used).toBe(1);
      monotonicNow = startedAt;
      expect(await gateway.callInternal("/onchain/chains", {}, "user")).toMatchObject({ ok: true, data: freshResult, sent: true });
      expect(sends).toBe(2);
      expect(gateway.budget().tiers.free.used).toBe(2);
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
      budget.flush();
    }
  });
  test.each([true, false])("coalesced followers record once only when sent=%s", async (sent) => {
    const { gateway, calls } = setup({ cap: 1, next: () => ({ ok: false, error: "provider_error", sent }) });
    const results = await Promise.all(Array.from({ length: 3 }, () =>
      gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user")));
    expect(calls).toHaveLength(1);
    expect(results.map((r) => r.sent)).toEqual([sent, false, false]);
    expect(gateway.budget().tiers.basic.used).toBe(sent ? 1 : 0);
  });
  test("a late identical follower joins after a real dispatch consumes the cap", async () => {
    let release!: (response: Response) => void;
    let started!: () => void;
    const pendingFetch = new Promise<Response>((resolve) => (release = resolve));
    const fetchStarted = new Promise<void>((resolve) => (started = resolve));
    const raw = [{ chainIndex: "66", tokenContractAddress: "0xab", time: "1", price: "2.5" }];
    const payload = JSON.stringify({ code: "0", data: raw });
    let sends = 0;
    const client = createOnchainClient({
      budget: createOkxBudget({ ledgerPath: join(tempDir(), "ledger.json"), now: Date.now }),
      credentials: () => TEST_CREDS,
      fetch: (async () => { sends += 1; started(); return pendingFetch; }) as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      minIntervalMs: 0,
    });
    const budget = createBudget({ dir: tempDir(), now: () => 1_700_000_000_000, caps: () => ({ basic: 1, premium: 1 }) });
    const gateway = createOnchainGateway({ client, cache: createOnchainCache(() => 1_700_000_000_000), budget, credentialsState: () => "complete", now: () => 1_700_000_000_000 });
    try {
      const leaderPromise = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
      await fetchStarted;
      expect(budget.snapshot().tiers.basic.used).toBe(1);
      const followerPromise = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
      release(new Response(payload));
      const [leader, follower] = await Promise.all([leaderPromise, followerPromise]);
      expect(leader.ok && leader.sent).toBe(true);
      expect(follower.ok && follower.sent).toBe(false);
      expect(sends).toBe(1);
      expect(budget.snapshot().tiers.basic.used).toBe(1);
      const cached = await gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
      expect(cached.ok && cached.sent).toBe(false);
      expect(budget.snapshot().tiers.basic.used).toBe(1);
    } finally {
      release(new Response(payload));
      budget.flush();
    }
  });


  test("unsent failures leave allowance for other keys", async () => {
    const { gateway, calls } = setup({ cap: 1, next: () => ({ ok: false, error: "no_credentials", sent: false }) });
    const results = await Promise.all(["0xab", "0xac", "0xad"].map((token) =>
      gateway.callInternal("/onchain/price", { chainIndex: "66", token }, "user")));
    expect(calls).toHaveLength(3);
    expect(results.every((r) => !r.ok && !r.sent && r.error === "no_credentials")).toBe(true);
    expect(gateway.budget().tiers.basic.used).toBe(0);
  });

  test.each([false, true])("queued admission rechecks changed cap and UTC month rollover=%s", async (rollover) => {
    let cap = 3;
    let release!: (result: ClientResult) => void;
    let started!: () => void;
    const first = new Promise<ClientResult>((resolve) => (release = resolve));
    const entered = new Promise<void>((resolve) => (started = resolve));
    const { gateway, budget, calls, tick } = setup({
      cap: () => cap, now: () => Date.UTC(2026, 0, 31, 23, 59, 59), next: () => {
        started(); return first;
      }
    });
    if (rollover) budget.record("basic");
    const leader = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    await entered;
    const waiting = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xac" }, "user");
    cap = 1;
    if (rollover) tick(2_000);
    release({ ok: false, error: "provider_error", sent: true });
    await leader;
    expect(await waiting).toEqual(rollover
      ? { ok: false, error: "provider_error", sent: true }
      : { ok: false, error: "budget_exhausted", sent: false });
    expect(calls).toHaveLength(rollover ? 2 : 1);
    expect(gateway.budget().tiers.basic.used).toBe(1);
    expect(gateway.budget().month).toBe(rollover ? "2026-02" : "2026-01");
    budget.flush();
    if (rollover) {
      tick(-2_000);
      expect(gateway.budget().tiers.basic.used).toBe(2); // previous month's preseed and dispatch remain recorded
    }
  });

  test("manual intent retains allowance when background was already pace refused", async () => {
    const { gateway, budget, calls } = setup({ cap: 31, now: () => Date.UTC(2026, 0, 1), next: () => ({ ok: false, error: "provider_error", sent: true }) });
    budget.record("basic"); budget.record("basic");
    const results = await Promise.all(["background", "user"].map((intent) =>
      gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, intent as "background" | "user")));
    expect(results).toEqual([
      { ok: false, error: "pace_limited", sent: false },
      { ok: false, error: "provider_error", sent: true },
    ]);
    expect(calls).toHaveLength(1);
    expect(gateway.budget().tiers.basic.used).toBe(3);
    budget.flush();
  });

  test("permitted background and user share one send", async () => {
    const { gateway, calls } = setup({ cap: 31, now: () => Date.UTC(2026, 0, 1), next: () => ({ ok: false, error: "provider_error", sent: true }) });
    const background = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "background");
    const user = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    expect((await background).sent).toBe(true);
    expect((await user).sent).toBe(false);
    expect(calls).toHaveLength(1);
    expect(gateway.budget().tiers.basic.used).toBe(1);
  });
  test("cached signals reapply the inclusive six-hour age bound without another dispatch", async () => {
    const nowMs = Date.UTC(2026, 9, 16);
    const eventMs = nowMs - 6 * 60 * 60 * 1_000;
    const { gateway, calls, tick } = setup({
      now: () => nowMs,
      next: () => ({
        ok: true,
        data: [{
          timestamp: String(eventMs), amountUsd: "10", price: "1", triggerWalletCount: "1",
          walletType: "1", chainIndex: "66",
          token: { tokenAddress: "0xab", symbol: "TOK", marketCapUsd: "100", holders: "5", top10HolderPercent: "20" },
        }],
        sent: true,
      }),
    });
    const params = { chainIndex: "66" };
    const first = await gateway.call("/onchain/signals", params, "user");
    expect(first).toMatchObject({ ok: true, data: [{ tsMs: eventMs }] });
    const cachedAtMs = first.ok ? first.meta.cachedAtMs : null;
    const used = gateway.budget().tiers.premium.used;
    tick(1);
    const second = await gateway.call("/onchain/signals", params, "user");
    expect(second).toMatchObject({ ok: true, data: [], meta: { cachedAtMs, stale: false } });
    expect(calls).toHaveLength(1);
    expect(gateway.budget().tiers.premium.used).toBe(used);
  });


  test("exhausted cap serves a marked stale entry without another send", async () => {
    const { gateway, calls, tick } = setup({ cap: 1, next: () => ({ ok: true, data: [{ chainIndex: "66", tokenContractAddress: "0xab", time: "1", price: "2.5" }], sent: true }) });
    await gateway.call("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    tick(31_000);
    const stale = await gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    expect(stale.ok).toBe(true);
    if (stale.ok) expect(stale.meta.stale).toBe(true);
    expect(stale.sent).toBe(false);
    expect(calls).toHaveLength(1);
  });
  test("a queued background pace refusal does not refuse its eligible user follower", async () => {
    let release!: (result: ClientResult) => void;
    let started!: () => void;
    const first = new Promise<ClientResult>((resolve) => (release = resolve));
    const entered = new Promise<void>((resolve) => (started = resolve));
    let sends = 0;
    const { gateway, calls } = setup({
      cap: 31, now: () => Date.UTC(2026, 0, 1), next: () => {
        sends += 1;
        if (sends === 2) { started(); return first; }
        return { ok: false, error: "provider_error", sent: true };
      }
    });
    await gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xaa" }, "user");
    const leader = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    await entered;
    const background = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xac" }, "background");
    const user = gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xac" }, "user");
    release({ ok: false, error: "provider_error", sent: true });
    await leader;
    expect(await background).toEqual({ ok: false, error: "pace_limited", sent: false });
    expect(await user).toEqual({ ok: false, error: "provider_error", sent: true });
    expect(calls).toHaveLength(3);
    expect(gateway.budget().tiers.basic.used).toBe(3);
  });
  test("concurrent different keys cannot exceed the remaining cap", async () => {
    const { gateway, calls } = setup({ cap: 1, next: () => ({ ok: false, error: "provider_error", sent: true }) });
    const results = await Promise.all(["0xab", "0xac", "0xad"].map((token) =>
      gateway.callInternal("/onchain/price", { chainIndex: "66", token }, "user")));
    expect(calls).toHaveLength(1);
    expect(results).toEqual([
      { ok: false, error: "provider_error", sent: true },
      { ok: false, error: "budget_exhausted", sent: false },
      { ok: false, error: "budget_exhausted", sent: false },
    ]);
    expect(gateway.budget().tiers.basic.used).toBe(1);
  });
  test("happy path returns the single envelope with budget meta", async () => {
    const { gateway } = setup();
    const res = await gateway.call("/onchain/chains", {}, "user");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual([{ chainIndex: "1", name: "Ethereum", symbol: "ETH" }]);
      expect(res.meta.tier).toBe("free");
      expect(res.meta.stale).toBe(false);
      expect(res.meta.ageMs).toBe(0);
      expect(res.meta.budget.tier).toBe("free");
      expect(res.meta.budget.cap).toBeNull();
      expect(res.meta.budget.used).toBe(1); // the call just sent is already counted
    }
  });

  test("records only calls actually sent", async () => {
    const { gateway, calls } = setup();
    await gateway.call("/onchain/chains", {}, "user");
    await gateway.call("/onchain/chains", {}, "user"); // cache hit, not sent
    expect(calls).toHaveLength(1);
    const snap = gateway.budget();
    expect(snap.tiers.free.used).toBe(1);
  });

  test.each([0, 1, 2])("physical clock-retry dispatches respect a cap of %i", async (cap) => {
    const minIntervalMs = 40;
    const dispatchTimes: number[] = [];
    const syntheticFetch = (async () => {
      dispatchTimes.push(performance.now());
      if (dispatchTimes.length === 1) {
        return new Response(JSON.stringify({ code: "50102", msg: "clock" }), {
          status: 401,
          headers: { date: new Date(Date.now() + 76_000).toUTCString() },
        });
      }
      return new Response(JSON.stringify({ code: "0", data: [{ chainIndex: "66", tokenContractAddress: "0xab", time: "1", price: "2.5" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createOnchainClient({
      budget: createOkxBudget({ ledgerPath: join(tempDir(), "ledger.json"), now: Date.now }),
      credentials: () => TEST_CREDS,
      fetch: syntheticFetch,
      now: Date.now,
      minIntervalMs,
    });
    const budget = createBudget({ dir: tempDir(), now: Date.now, caps: () => ({ basic: cap, premium: cap }) });
    const gateway = createOnchainGateway({ client, cache: createOnchainCache(Date.now), budget, credentialsState: () => "complete", now: Date.now });
    try {
      const result = await gateway.callInternal("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
      const dispatchCount = Math.min(cap, 2);
      expect(dispatchTimes).toHaveLength(dispatchCount);
      expect(budget.snapshot().tiers.basic.used).toBe(dispatchCount);
      expect(result.sent).toBe(cap > 0);
      if (cap === 0) expect(result).toEqual({ ok: false, error: "budget_exhausted", sent: false });
      if (cap === 1) expect(result).toEqual({ ok: false, error: "budget_exhausted", sent: true });
      if (cap === 2) {
        expect(result.ok).toBe(true);
        expect(dispatchTimes[1]! - dispatchTimes[0]!).toBeGreaterThanOrEqual(minIntervalMs);
      }
    } finally {
      budget.flush();
    }
  });

  test("unknown route and bad params are refused before any call", async () => {
    const { gateway, calls } = setup();
    expect(await gateway.call("/onchain/not-real", {}, "user")).toEqual({ ok: false, error: "bad_request" });
    expect(await gateway.call("/onchain/chains", { evil: "1" }, "user")).toEqual({ ok: false, error: "bad_request" });
    expect(await gateway.call("/onchain/search", { chainIndex: "abc", q: "aa" }, "user")).toEqual({ ok: false, error: "bad_request" });
    expect(calls).toHaveLength(0);
  });

  test("credential states short-circuit", async () => {
    const { gateway: g1, calls: c1 } = setup({ state: "absent" });
    expect(await g1.call("/onchain/chains", {}, "user")).toEqual({ ok: false, error: "no_credentials" });
    const { gateway: g2, calls: c2 } = setup({ state: "incomplete" });
    expect(await g2.call("/onchain/chains", {}, "user")).toEqual({ ok: false, error: "incomplete_credentials" });
    expect(c1).toHaveLength(0);
    expect(c2).toHaveLength(0);
  });

  test("provider failure serves stale cache marked stale:true", async () => {
    let fail = false;
    const { gateway, tick } = setup({
      next: () =>
        fail
          ? { ok: false, error: "provider_error", sent: true }
          : { ok: true, data: [{ chainIndex: "66", tokenContractAddress: "0xab", time: "1", price: "2.5" }], sent: true },
    });
    const p = await gateway.call("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    expect(p.ok).toBe(true);
    fail = true;
    tick(31_000); // past the 30s price TTL, inside the 6-minute stale window
    const stale = await gateway.call("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    expect(stale.ok).toBe(true);
    if (stale.ok) {
      expect(stale.meta.stale).toBe(true);
      expect(stale.meta.ageMs).toBeGreaterThanOrEqual(31_000);
      expect(stale.meta.tier).toBe("basic");
    }
  });

  test("budget exhausted blocks the call before the network", async () => {
    const calls: string[] = [];
    const dir = tempDir();
    let t = 1_000_000;
    const budget = createBudget({ dir, now: () => t, caps: () => ({ basic: 1, premium: 1 }) });
    const gateway = createOnchainGateway({
      client: {
        call: async (_request, _tier, admitDispatch) => {
          const admission = admitDispatch();
          if (!admission.ok) return { ok: false, error: admission.reason, sent: false };
          calls.push("x");
          return { ok: false, error: "provider_error", sent: true };
        },
        status: () => ({ lastCallMs: null, lastCode: null, cooldownUntilMs: null, clockOffsetMs: null }),
      },
      cache: createOnchainCache(() => t),
      budget,
      credentialsState: () => "complete",
      now: () => t,
    });
    budget.record("basic"); // cap 1 spent -> budget_exhausted
    const res = await gateway.call("/onchain/price", { chainIndex: "66", token: "0xab" }, "user");
    expect(res).toEqual({ ok: false, error: "budget_exhausted" });
    expect(calls).toHaveLength(0);
  });

  test("no cache + provider failure returns the error", async () => {
    const { gateway } = setup({ next: () => ({ ok: false, error: "provider_error", sent: true }) });
    const res = await gateway.call("/onchain/chains", {}, "user");
    expect(res).toEqual({ ok: false, error: "provider_error" });
  });

  test("schema failure on a response serves stale too", async () => {
    let bad = false;
    const { gateway, tick } = setup({
      next: () =>
        bad
          ? { ok: true, data: [["1", "10", "5", "9", "8", "1", "1", "1"]], sent: true } // high < low: impossible bar
          : { ok: true, data: [["1", "10", "11", "9", "10.5", "1", "1", "1"]], sent: true },
    });
    await gateway.call("/onchain/candles", { chainIndex: "1", token: "0xab", bar: "1m" }, "user");
    bad = true;
    tick(61_000); // past the 60s 1m TTL
    const res = await gateway.call("/onchain/candles", { chainIndex: "1", token: "0xab", bar: "1m" }, "user");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.meta.stale).toBe(true);
  });

  test("status exposes credential state without secrets", async () => {
    const { gateway } = setup({ state: "incomplete" });
    const st = gateway.status();
    expect(st.credential).toBe("incomplete");
    expect(st).not.toHaveProperty("apiKey");
  });
});
