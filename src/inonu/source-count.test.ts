// ASK-6, AC-ASK-7: the calls that really left must be counted even when the source then refuses: a click that read the hot list and found no
// signals still spent two OnchainOS calls, and the ledger and the usage panel must say two, not nothing. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { InternalGatewayResult } from "../onchain-read/gateway";
import { SourceError, type AskRequest, type BriefSource } from "./ask";
import { countSentCalls, withSentCount } from "./source-count";

const META = { tier: "basic" as const, cachedAtMs: 0, ageMs: 0, stale: false, budget: { tier: "basic" as const, used: 0, cap: null } };
const ok = (sent: boolean): InternalGatewayResult => ({ ok: true, data: [], meta: META, sent });
const fail = (sent: boolean): InternalGatewayResult => ({ ok: false, error: "provider_error", sent });
const request: AskRequest = { modo: "descoberta", alvo: { chainIndex: "501" } };
const ctx = () => ({ signal: new AbortController().signal, maxOnchainosCalls: 15 });

describe("the counting gateway", () => {
  test("counts what left (sent) and neither a cache hit nor a refusal that never left, and passes the answer through untouched", async () => {
    const answers = [ok(true), ok(false), fail(true), fail(false)];
    const counted = countSentCalls({ callInternal: async () => answers.shift()! });
    const seen = [];
    for (let i = 0; i < 4; i += 1) seen.push(await counted.gateway.callInternal("/onchain/x", {}, "user"));
    expect(seen.map((r) => r.sent)).toEqual([true, false, true, false]);
    expect(counted.count()).toBe(2);
    counted.reset();
    expect(counted.count()).toBe(0);
  });
});

describe("a source that refuses after reading", () => {
  test("the refusal carries the calls that left, with the same constant code", async () => {
    const counted = countSentCalls({ callInternal: async () => ok(true) });
    const inner: BriefSource = {
      async build() {
        await counted.gateway.callInternal("/onchain/hot-tokens", {}, "user");
        await counted.gateway.callInternal("/onchain/signals", {}, "user");
        throw new SourceError("sem_sinais");
      },
    };
    const error = await withSentCount(inner, counted).build(request, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).code).toBe("sem_sinais");
    expect((error as SourceError).onchainosCalls).toBe(2);
  });

  test("a refusal that already carries its own count keeps it, and a refusal before any read says zero", async () => {
    const counted = countSentCalls({ callInternal: async () => ok(true) });
    const own = withSentCount({ build: async () => { throw new SourceError("x", 7); } }, counted);
    expect(((await own.build(request, ctx()).catch((e: unknown) => e)) as SourceError).onchainosCalls).toBe(7);
    const early = withSentCount({ build: async () => { throw new SourceError("alvo_invalido"); } }, counted);
    expect(((await early.build(request, ctx()).catch((e: unknown) => e)) as SourceError).onchainosCalls).toBe(0);
  });

  test("an error that is not a refusal passes through unchanged, and a success is not touched", async () => {
    const counted = countSentCalls({ callInternal: async () => ok(true) });
    const boom = new Error("boom");
    await expect(withSentCount({ build: async () => { throw boom; } }, counted).build(request, ctx())).rejects.toBe(boom);
    const built = { brief: {}, candidates: [], onchainosCalls: 3 } as never;
    expect(await withSentCount({ build: async () => built }, counted).build(request, ctx())).toBe(built);
  });

  test("each click starts from zero", async () => {
    const counted = countSentCalls({ callInternal: async () => ok(true) });
    const inner: BriefSource = { async build() { await counted.gateway.callInternal("/onchain/x", {}, "user"); throw new SourceError("sem_sinais"); } };
    const source = withSentCount(inner, counted);
    await source.build(request, ctx()).catch(() => undefined);
    const second = (await source.build(request, ctx()).catch((e: unknown) => e)) as SourceError;
    expect(second.onchainosCalls).toBe(1);
  });
});
