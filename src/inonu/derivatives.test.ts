// T5.10, E7: the regime of a perpetual, read from the exchange's public funding rate and open interest. It reads both once a
// minute at most, remembers the open interest to tell how it changed over an hour, says why a value is null, and never fails the
// click that asked for it. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createDerivatives } from "./derivatives";
import { OkxPublicError } from "./okx-public";

const T0 = 1_800_000_000_000;
const MIN = 60_000;

function harness(over: { funding?: () => Promise<{ rate: number; nextRate: number | null; fundingTimeMs: number }>; oi?: (n: number) => Promise<{ oiUsd: number; oiCcy: number; tsMs: number }> } = {}) {
  let clock = T0;
  const calls: string[] = [];
  let oiReads = 0;
  const rest = {
    fundingRate: async (instId: string) => {
      calls.push(`funding:${instId}`);
      return over.funding ? over.funding() : { rate: 0.0001, nextRate: null, fundingTimeMs: T0 };
    },
    openInterest: async (instId: string) => {
      calls.push(`oi:${instId}`);
      oiReads += 1;
      return over.oi ? over.oi(oiReads) : { oiUsd: 1_000 * oiReads, oiCcy: 1, tsMs: clock };
    },
  };
  const derivatives = createDerivatives({ rest, now: () => clock });
  return { derivatives, calls, tick: (ms: number) => void (clock += ms) };
}

const signal = () => new AbortController().signal;

describe("what it reads", () => {
  test("a perpetual: the funding rate in basis points and the open interest, both asked for exactly that instrument", async () => {
    const { derivatives, calls } = harness();
    const r = await derivatives.read("BTC-USDT-SWAP", signal());
    expect(r!.regime).toEqual({ funding: 1, oiVar: null, btcBeta: null });
    expect(calls.sort()).toEqual(["funding:BTC-USDT-SWAP", "oi:BTC-USDT-SWAP"]);
  });

  test("spot and futures have no regime of this kind: nothing is asked and nothing is invented", async () => {
    const { derivatives, calls } = harness();
    expect(await derivatives.read("BTC-USDT", signal())).toBeNull();
    expect(await derivatives.read("BTC-USDT-250627", signal())).toBeNull();
    expect(calls).toEqual([]);
  });

  test("a rest client without the reads (an older fake, a test) gives no regime", async () => {
    const derivatives = createDerivatives({ rest: {}, now: () => T0 });
    expect(await derivatives.read("BTC-USDT-SWAP", signal())).toBeNull();
  });
});

describe("the hour", () => {
  test("is covered only after a sample about an hour old exists; before that the reason is the warm-up", async () => {
    const { derivatives, tick } = harness({ oi: async (n) => ({ oiUsd: 1_000 + n * 10, oiCcy: 1, tsMs: T0 }) });
    const first = await derivatives.read("BTC-USDT-SWAP", signal());
    expect(first!.regime.oiVar).toBeNull();
    expect(first!.nulos["regime.oiVar"]).toBe("aquecimento");
    tick(30 * MIN);
    const second = await derivatives.read("BTC-USDT-SWAP", signal());
    expect(second!.regime.oiVar).toBeNull();
    tick(31 * MIN);
    const third = await derivatives.read("BTC-USDT-SWAP", signal());
    // samples: 1010 (t=0), 1020 (t=30), 1030 (t=61): 1030 against the one about an hour before it
    expect(third!.regime.oiVar).toBeCloseTo(((1030 - 1010) / 1010) * 100, 1);
    expect(third!.nulos["regime.oiVar"]).toBeUndefined();
  });

  test("samples are kept per instrument and a perpetual does not borrow the history of another", async () => {
    const { derivatives, tick } = harness();
    await derivatives.read("BTC-USDT-SWAP", signal());
    tick(61 * MIN);
    const other = await derivatives.read("ETH-USDT-SWAP", signal());
    expect(other!.regime.oiVar).toBeNull();
  });
});

describe("reuse", () => {
  test("a second read inside a minute is the first one: no new request", async () => {
    const { derivatives, calls, tick } = harness();
    await derivatives.read("BTC-USDT-SWAP", signal());
    tick(20_000);
    await derivatives.read("BTC-USDT-SWAP", signal());
    expect(calls).toHaveLength(2);
    tick(45_000);
    await derivatives.read("BTC-USDT-SWAP", signal());
    expect(calls).toHaveLength(4);
  });

  test("two reads at the same time share one request each", async () => {
    const { derivatives, calls } = harness();
    await Promise.all([derivatives.read("BTC-USDT-SWAP", signal()), derivatives.read("BTC-USDT-SWAP", signal())]);
    expect(calls).toHaveLength(2);
  });
});

describe("failures", () => {
  test("the funding failing leaves the open interest, with the reason in a constant code", async () => {
    const { derivatives } = harness({ funding: async () => Promise.reject(new OkxPublicError("okx_error")) });
    const r = await derivatives.read("BTC-USDT-SWAP", signal());
    expect(r!.regime.funding).toBeNull();
    expect(r!.nulos["regime.funding"]).toBe("okx_okx_error");
  });

  test("the open interest failing leaves the funding, and nothing of the failure's message travels", async () => {
    const { derivatives } = harness({ oi: async () => Promise.reject(new Error("SENTINEL-secret detail")) });
    const r = await derivatives.read("BTC-USDT-SWAP", signal());
    expect(r!.regime.funding).toBe(1);
    expect(r!.nulos["regime.oiVar"]).toBe("indisponivel");
    expect(JSON.stringify(r)).not.toContain("SENTINEL");
  });

  test("both failing is a regime of nulls with two reasons, never an exception", async () => {
    const { derivatives } = harness({ funding: async () => Promise.reject(new Error("x")), oi: async () => Promise.reject(new Error("y")) });
    const r = await derivatives.read("BTC-USDT-SWAP", signal());
    expect(r!.regime).toEqual({ funding: null, oiVar: null, btcBeta: null });
    expect(Object.keys(r!.nulos).sort()).toEqual(["regime.btcBeta", "regime.funding", "regime.oiVar"]);
  });

  test("a failed read is not cached as if it were an answer", async () => {
    let fail = true;
    const { derivatives, tick } = harness({ funding: async () => (fail ? Promise.reject(new Error("x")) : { rate: 0.0002, nextRate: null, fundingTimeMs: T0 }) });
    expect((await derivatives.read("BTC-USDT-SWAP", signal()))!.regime.funding).toBeNull();
    fail = false;
    tick(1_000);
    expect((await derivatives.read("BTC-USDT-SWAP", signal()))!.regime.funding).toBe(2);
  });

  test("an aborted click is told so, so it can be cancelled", async () => {
    const controller = new AbortController();
    const { derivatives } = harness({
      funding: async () => {
        controller.abort();
        throw new Error("aborted");
      },
    });
    await expect(derivatives.read("BTC-USDT-SWAP", controller.signal)).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("the beta against BTC", () => {
  test("is not measured and says so", async () => {
    const { derivatives } = harness();
    const r = await derivatives.read("BTC-USDT-SWAP", signal());
    expect(r!.regime.btcBeta).toBeNull();
    expect(r!.nulos["regime.btcBeta"]).toBe("nao coletado");
  });
});
