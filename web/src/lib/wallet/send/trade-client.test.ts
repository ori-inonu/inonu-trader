// WAL-10: the reader of the two gateway routes (swap and approve). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createTradeClient, parseApproveAnswer, parseSwapAnswer } from "./trade-client";
import { NOW, ROUTER, SPENDER, TOKEN, USDC, ACCOUNT, approval, swap } from "./fixtures";

describe("the reader of the routes", () => {
  const body = (data: unknown) => ({ ok: true, data, meta: { tier: "basic", cachedAtMs: NOW, ageMs: 0, stale: false, budget: { tier: "basic", used: 1, cap: null } } });
  const answer = () => ({
    chainIndex: "8453", family: "evm",
    tx: { ...swap().tx },
    route: { ...swap().route },
  });
  const fetcher = (status: number, payload: unknown) => {
    const seen: string[] = [];
    const f = async (input: string) => {
      seen.push(input);
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    };
    return { f, seen };
  };
  const params = { chainIndex: "8453", amount: "100000000", fromToken: USDC, toToken: TOKEN, slippagePct: 1, account: ACCOUNT };

  test("the swap request carries what the gateway takes, and the answer is the shape the checks read", async () => {
    const { f, seen } = fetcher(200, body(answer()));
    const client = createTradeClient({ base: "http://core", fetch: f });
    const r = await client.swap(params);
    expect(r.ok).toBe(true);
    const url = new URL(seen[0]!);
    expect(url.pathname).toBe("/onchain/swap");
    expect(Object.fromEntries(url.searchParams)).toEqual({ chainIndex: "8453", amount: "100000000", fromToken: USDC, toToken: TOKEN, slippagePercent: "1", userWalletAddress: ACCOUNT });
    if (r.ok) expect(r.data.tx.to).toBe(ROUTER);
  });

  test("a request that the gateway would refuse never leaves", async () => {
    const { f, seen } = fetcher(200, body(answer()));
    const client = createTradeClient({ base: "http://core", fetch: f });
    expect((await client.swap({ ...params, amount: "0" })).ok).toBe(false);
    expect((await client.swap({ ...params, slippagePct: 0 })).ok).toBe(false);
    expect((await client.swap({ ...params, slippagePct: 5.5 })).ok).toBe(false);
    expect((await client.swap({ ...params, account: "0x12" })).ok).toBe(false);
    expect((await client.approve({ chainIndex: "8453", token: USDC, amount: "x" })).ok).toBe(false);
    expect(seen).toEqual([]);
  });

  test("errors are said as the contract says them: no route, refused origin, no transaction, a provider problem", async () => {
    expect(await createTradeClient({ fetch: fetcher(404, { ok: false, error: "not_found" }).f }).swap(params)).toEqual({ ok: false, error: "backend_stale" });
    expect(await createTradeClient({ fetch: fetcher(403, { ok: false, error: "forbidden" }).f }).swap(params)).toEqual({ ok: false, error: "origin_denied" });
    expect(await createTradeClient({ fetch: fetcher(200, body(null)).f }).swap(params)).toEqual({ ok: false, error: "sem_transacao" });
    expect(await createTradeClient({ fetch: fetcher(502, { ok: false, error: "provider_error" }).f }).swap(params)).toEqual({ ok: false, error: "provider_error" });
    expect(await createTradeClient({ fetch: fetcher(200, { ok: true, data: answer() }).f }).swap(params)).toEqual({ ok: false, error: "schema" });
    expect(await createTradeClient({ fetch: fetcher(500, body(answer())).f }).swap(params)).toEqual({ ok: false, error: "schema" });
    const down = createTradeClient({ fetch: async () => { throw new Error("offline"); } });
    expect(await down.swap(params)).toEqual({ ok: false, error: "network" });
  });

  test("an answer the gateway says is stale, or that is older than a few seconds, is no transaction to carry out", async () => {
    const aged = (over: Record<string, unknown>) => ({ ...body(answer()), meta: { ...body(answer()).meta, ...over } });
    expect(await createTradeClient({ fetch: fetcher(200, aged({ stale: true })).f }).swap(params)).toEqual({ ok: false, error: "provider_error" });
    expect(await createTradeClient({ fetch: fetcher(200, aged({ ageMs: 10_001 })).f }).swap(params)).toEqual({ ok: false, error: "provider_error" });
    expect((await createTradeClient({ fetch: fetcher(200, aged({ ageMs: 10_000 })).f }).swap(params)).ok).toBe(true);
  });

  test("an answer that is not exactly a transaction is a schema error, never a partial one", () => {
    expect(parseSwapAnswer(answer())).not.toBeNull();
    for (const mutate of [
      (a: Record<string, any>) => (a.tx.data = "0x"),
      (a: Record<string, any>) => (a.tx.data = "zz"),
      (a: Record<string, any>) => (a.tx.to = "0x1"),
      (a: Record<string, any>) => (a.tx.value = "-1"),
      (a: Record<string, any>) => (a.route.fromAmount = "1.5"),
      (a: Record<string, any>) => (a.route.fromToken = null),
      (a: Record<string, any>) => (a.route.dexNames = [5]),
      (a: Record<string, any>) => (a.route.toToken.isHoneyPot = "no"),
      (a: Record<string, any>) => (a.family = "tron"),
    ]) {
      const a = JSON.parse(JSON.stringify(answer()));
      mutate(a);
      expect(parseSwapAnswer(a)).toBeNull();
    }
    expect(parseSwapAnswer(null)).toBeNull();
  });

  test("the approval reader keeps the calldata and the spender and nothing else", async () => {
    expect(parseApproveAnswer({ ...approval() })).toEqual(approval());
    expect(parseApproveAnswer({ ...approval(), spender: "router" })).toBeNull();
    expect(parseApproveAnswer({ ...approval(), data: "0x" })).toBeNull();
    const { f, seen } = fetcher(200, body({ ...approval() }));
    const r = await createTradeClient({ base: "http://core", fetch: f }).approve({ chainIndex: "8453", token: USDC, amount: "100000000" });
    expect(r.ok).toBe(true);
    expect(Object.fromEntries(new URL(seen[0]!).searchParams)).toEqual({ chainIndex: "8453", token: USDC, amount: "100000000" });
    expect(approval().spender).toBe(SPENDER);
  });
});
