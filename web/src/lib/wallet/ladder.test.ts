// T9.5, WAL-5, AC-WAL-3: the ladder of quotes of the order ticket. A person gives ONE size in the coin they pay with, and the ladder asks the gateway what a
// swap of a few sizes around it would give: at most five, one after the other, never faster than the Trade API allows. Sizes are exact integers in the
// smallest unit of the coin (a decimal text is never turned into a float), and what a quote does not say is a dash with the reason, never a guess. The
// numbers are what the provider says a swap would do; nothing here can sign, send or prepare anything to be signed. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import {
  LADDER_GAP_MS, LADDER_MAX, LADDER_STEPS, QUOTE_FRESH_MS, impactState, ladderAmounts, readLadder, rungText, toMinorUnits, type LadderReader, type Quote, type Rung,
} from "./ladder";

const side = (over: Partial<Quote["toToken"]> = {}): Quote["toToken"] => ({ address: "0xaaa", symbol: "TOK", decimals: 18, unitPriceUsd: 2, taxRate: 0, isHoneyPot: false, ...over });
const quote = (over: Partial<Quote> = {}): Quote => ({
  chainIndex: "8453", mode: "exactIn", fromAmount: 100_000_000, toAmount: 50 * 1e18, priceImpactPct: -0.4, estimateGasFee: 120_000, tradeFee: 0.12,
  fromToken: side({ address: "0xusdc", symbol: "USDC", decimals: 6, unitPriceUsd: 1 }), toToken: side(), ...over,
});

describe("the size, as an exact integer of the smallest unit", () => {
  test("a decimal text becomes minor units without ever passing through a float", () => {
    expect(toMinorUnits("100", 6)).toBe("100000000");
    expect(toMinorUnits("0.5", 6)).toBe("500000");
    expect(toMinorUnits("1,25", 6)).toBe("1250000");
    expect(toMinorUnits("1.234567", 6)).toBe("1234567");
    expect(toMinorUnits("0.000001", 6)).toBe("1");
    expect(toMinorUnits(" 7 ", 0)).toBe("7");
    // a long amount of an 18 decimals coin is exact, which a float could not hold
    expect(toMinorUnits("123456789.123456789123456789", 18)).toBe("123456789123456789123456789");
  });

  test("more digits than the coin has, zero, a sign, an exponent, a word or nothing is refused, never rounded", () => {
    for (const bad of ["1.2345678", "0", "0.000000", "-1", "+1", "1e3", "abc", "", " ", "1.2.3", "1,2,3", ".", "1.", "0x10", "9".repeat(41)]) expect(toMinorUnits(bad, 6)).toBeNull();
    expect(toMinorUnits("1", 37)).toBeNull();
    expect(toMinorUnits("1", -1)).toBeNull();
    expect(toMinorUnits("1", 1.5)).toBeNull();
  });
});

describe("the sizes of the ladder", () => {
  test("three by default: half, the size and double; at most five, and the middle one is the size the person gave", () => {
    expect(LADDER_MAX).toBe(5);
    expect(LADDER_STEPS.map((s) => s.label)).toEqual(["0,5x", "1x", "2x"]);
    expect(ladderAmounts("100", 6)).toEqual([
      { label: "0,5x", amountMinor: "50000000" },
      { label: "1x", amountMinor: "100000000" },
      { label: "2x", amountMinor: "200000000" },
    ]);
  });

  test("one, three or five rungs; more than five is never built", () => {
    expect(ladderAmounts("10", 6, 1).map((r) => r.label)).toEqual(["1x"]);
    expect(ladderAmounts("10", 6, 5).map((r) => r.label)).toEqual(["0,25x", "0,5x", "1x", "2x", "4x"]);
    expect(ladderAmounts("10", 6, 9)).toHaveLength(5);
    expect(ladderAmounts("10", 6, 0)).toHaveLength(1);
  });

  test("a rung whose half or quarter is less than one unit is left out, not rounded to zero", () => {
    expect(ladderAmounts("0.000001", 6, 5).map((r) => r.label)).toEqual(["1x", "2x", "4x"]);
  });

  test("a bad size gives no rung at all", () => {
    expect(ladderAmounts("abc", 6)).toEqual([]);
    expect(ladderAmounts("0", 6)).toEqual([]);
  });
});

describe("reading the ladder", () => {
  const params = { chainIndex: "8453", fromToken: "0xusdc", toToken: "0xaaa" };
  const reader = (answers: Array<"ok" | string>): { reader: LadderReader; asked: string[] } => {
    const asked: string[] = [];
    let i = 0;
    return {
      asked,
      reader: {
        async read(p) {
          asked.push(p.amount);
          const step = answers[Math.min(i++, answers.length - 1)]!;
          return step === "ok" ? { ok: true, data: quote({ fromAmount: Number(p.amount) }), meta: { tier: "basic", cachedAtMs: 1, ageMs: 0, stale: false, budget: { tier: "basic", used: 1, cap: null } } } : { ok: false, error: step as never };
        },
      },
    };
  };

  test("one request per rung, in order, with the gap the Trade API asks for between them and none before the first", async () => {
    const { reader: r, asked } = reader(["ok"]);
    const sleeps: number[] = [];
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async (ms) => void sleeps.push(ms) });
    expect(asked).toEqual(["50000000", "100000000", "200000000"]);
    expect(sleeps).toEqual([LADDER_GAP_MS, LADDER_GAP_MS]);
    expect(LADDER_GAP_MS).toBeGreaterThanOrEqual(1000);
    expect(rungs.every((x) => x.state === "cotado")).toBe(true);
  });

  test("a refusal that will repeat stops the ladder: the rest is not asked, and it is said why", async () => {
    for (const code of ["provider_payment_required", "budget_exhausted", "no_credentials", "incomplete_credentials", "provider_unauthorized", "backend_stale", "origin_denied", "clock_skew"]) {
      const { reader: r, asked } = reader(["ok", code]);
      const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async () => {} });
      expect(asked).toHaveLength(2);
      expect(rungs.map((x) => x.state)).toEqual(["cotado", "erro", "nao_pedido"]);
      expect((rungs[1] as { error: string }).error).toBe(code);
    }
  });

  test("a failure of one rung only (the provider had no route for that size) does not stop the others", async () => {
    const { reader: r, asked } = reader(["ok", "provider_error", "ok"]);
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async () => {} });
    expect(asked).toHaveLength(3);
    expect(rungs.map((x) => x.state)).toEqual(["cotado", "erro", "cotado"]);
  });

  test("a click cancelled while it reads stops asking, and what was asked stays as it was", async () => {
    const { reader: r, asked } = reader(["ok"]);
    const controller = new AbortController();
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async () => controller.abort(), signal: controller.signal });
    expect(asked).toHaveLength(1);
    expect(rungs.map((x) => x.state)).toEqual(["cotado", "nao_pedido", "nao_pedido"]);
  });

  test("a size the provider has no quote for (an empty answer) does not stop the others, like a size with no route", async () => {
    const { reader: r, asked } = reader(["ok", "sem_cotacao", "ok"]);
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async () => {} });
    expect(asked).toHaveLength(3);
    expect(rungs.map((x) => x.state)).toEqual(["cotado", "erro", "cotado"]);
    expect(rungText(rungs[1]!, { impactLimitPct: 1 }).estado).toBe("A Trade API nao tem cotacao para este tamanho");
  });

  test("a reader that throws is a failure of that rung and stops the ladder, never an exception for the screen", async () => {
    const r: LadderReader = { read: async () => { throw new Error("SENTINEL"); } };
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async () => {} });
    expect(rungs.map((x) => x.state)).toEqual(["erro", "nao_pedido", "nao_pedido"]);
    expect(JSON.stringify(rungs)).not.toContain("SENTINEL");
  });

  test("a request that was cancelled while it was in flight is not a network failure: that rung and the rest were not asked", async () => {
    const controller = new AbortController();
    const r: LadderReader = { read: async () => (controller.abort(), { ok: false, error: "network" }) };
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async () => {}, signal: controller.signal });
    expect(rungs.map((x) => x.state)).toEqual(["nao_pedido", "nao_pedido", "nao_pedido"]);
  });

  test("the wait before the first request is never longer than the gap itself, so a clock that stepped back cannot hold the button for an hour", async () => {
    const { reader: r } = reader(["ok"]);
    const sleeps: number[] = [];
    await readLadder(r, params, ladderAmounts("100", 6, 1), { sleep: async (ms) => void sleeps.push(ms), initialDelayMs: 3_600_000 });
    expect(sleeps).toEqual([LADDER_GAP_MS]);
  });

  test("a ladder that follows a cancelled one waits out the rest of the gap before its first request", async () => {
    const { reader: r } = reader(["ok"]);
    const sleeps: number[] = [];
    await readLadder(r, params, ladderAmounts("100", 6, 1), { sleep: async (ms) => void sleeps.push(ms), initialDelayMs: 640 });
    expect(sleeps).toEqual([640]);
    sleeps.length = 0;
    await readLadder(r, params, ladderAmounts("100", 6, 1), { sleep: async (ms) => void sleeps.push(ms), initialDelayMs: 0 });
    expect(sleeps).toEqual([]);
  });

  test("the screen is told after every rung: the ones not asked yet are being read, and when it ends nothing is left being read", async () => {
    const { reader: r } = reader(["ok", "provider_payment_required"]);
    const seen: string[][] = [];
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: async () => {}, onProgress: (now) => seen.push(now.map((x) => x.state)) });
    expect(seen[0]).toEqual(["lendo", "lendo", "lendo"]);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.at(-1)).toEqual(["cotado", "erro", "nao_pedido"]);
    expect(rungs.map((x) => x.state)).toEqual(["cotado", "erro", "nao_pedido"]);
    expect(rungs.some((x) => x.state === "lendo")).toBe(false);
  });

  test("every rung read is stamped with the moment it was read, by the clock the screen gives", async () => {
    const { reader: r } = reader(["ok"]);
    let t = 5_000;
    const rungs = await readLadder(r, params, ladderAmounts("100", 6, 3), { sleep: async () => {}, now: () => (t += 100) });
    expect(rungs.map((x) => (x.state === "cotado" ? x.receivedAtMs : null))).toEqual([5_100, 5_200, 5_300]);
  });

  test("Cancelar during the wait between two rungs ends the ladder at once, not after the wait", async () => {
    const { reader: r } = reader(["ok"]);
    const controller = new AbortController();
    const never = () => new Promise<void>(() => {});
    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    const rungs = await readLadder(r, params, ladderAmounts("100", 6), { sleep: never, signal: controller.signal });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(rungs.map((x) => x.state)).toEqual(["cotado", "nao_pedido", "nao_pedido"]);
    // and the wait before the first request is cut the same way
    const again = new AbortController();
    setTimeout(() => again.abort(), 20);
    const empty = await readLadder(r, params, ladderAmounts("100", 6), { sleep: never, signal: again.signal, initialDelayMs: 900 });
    expect(empty.map((x) => x.state)).toEqual(["nao_pedido", "nao_pedido", "nao_pedido"]);
  });

  test("every request carries only the chain, the amount and the two token addresses", async () => {
    const seen: unknown[] = [];
    const r: LadderReader = { read: async (p) => (seen.push(p), { ok: false, error: "provider_error" }) };
    await readLadder(r, params, ladderAmounts("100", 6, 1), { sleep: async () => {} });
    expect(seen).toEqual([{ chainIndex: "8453", amount: "100000000", fromToken: "0xusdc", toToken: "0xaaa" }]);
  });
});

describe("what a rung says", () => {
  const meta = { tier: "basic" as const, cachedAtMs: 1, ageMs: 0, stale: false, budget: { tier: "basic" as const, used: 1, cap: null } };

  test("what is paid, what is received, the impact, the network fee and the fee of the swap, as the provider gave them", () => {
    const text = rungText({ label: "1x", amountMinor: "100000000", state: "cotado", quote: quote(), meta }, { impactLimitPct: 1 });
    expect(text.paga).toBe("100 USDC");
    expect(text.recebe).toBe("50 TOK");
    expect(text.impacto).toBe("-0,40%");
    expect(text.estado).toBe("dentro do limite");
    expect(text.tom).toBe("ok");
    expect(text.taxaRede).toBe("120.000");
    expect(text.taxaTroca).toBe("0,12");
  });

  test("the impact is (received - paid) / paid, so a loss is negative: a deviation either way beyond the limit the person set is said and coloured, and an impact the provider did not give is not 'within the limit'", () => {
    const over = rungText({ label: "2x", amountMinor: "1", state: "cotado", quote: quote({ priceImpactPct: -3.5 }), meta }, { impactLimitPct: 1 });
    expect(over.estado).toBe("impacto fora do limite");
    const gain = rungText({ label: "2x", amountMinor: "1", state: "cotado", quote: quote({ priceImpactPct: 3.5 }), meta }, { impactLimitPct: 1 });
    expect(gain.estado).toBe("impacto fora do limite");
    expect(gain.tom).toBe("alerta");
    expect(over.tom).toBe("alerta");
    const unknown = rungText({ label: "2x", amountMinor: "1", state: "cotado", quote: quote({ priceImpactPct: null }), meta }, { impactLimitPct: 1 });
    expect(unknown.impacto).toBe("-");
    expect(unknown.estado).toBe("impacto nao informado");
    expect(unknown.tom).toBe("alerta");
    expect(impactState(-1, 1)).toBe("dentro");
    expect(impactState(1, 1)).toBe("dentro");
    expect(impactState(-1.01, 1)).toBe("fora");
    expect(impactState(1.01, 1)).toBe("fora");
    expect(impactState(null, 1)).toBe("desconhecido");
    expect(impactState(-0.2, 1)).toBe("dentro");
  });

  test("a honeypot or a tax on either side blocks the rung, and a flag the provider left out is 'not informed', never 'safe'", () => {
    const honey = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toToken: side({ isHoneyPot: true }) }), meta }, { impactLimitPct: 1 });
    expect(honey.estado).toBe("bloqueada: honeypot");
    expect(honey.tom).toBe("bloqueio");
    const taxed = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toToken: side({ taxRate: 0.1 }) }), meta }, { impactLimitPct: 1 });
    expect(taxed.estado).toBe("taxa do token: 10%");
    expect(taxed.tom).toBe("alerta");
    const silent = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toToken: side({ isHoneyPot: null }) }), meta }, { impactLimitPct: 1 });
    expect(silent.estado).toBe("honeypot nao informado");
    expect(silent.tom).toBe("alerta");
  });

  test("a coin whose decimals the provider did not give is shown in minor units and said so, never divided by a guess; above 2^53 it is said to be approximate, never given digits it does not have", () => {
    const small = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toAmount: 123_456, toToken: side({ decimals: null }) }), meta }, { impactLimitPct: 1 });
    expect(small.recebe).toBe("123456 unidades de TOK (decimais nao informados)");
    const big = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toAmount: 123456789012345683968, toToken: side({ decimals: null }) }), meta }, { impactLimitPct: 1 });
    expect(big.recebe).toBe("aprox. 123.457.000.000.000.000.000 unidades de TOK (decimais nao informados)");
  });

  test("a quote gets old on the screen: its age is the age the gateway gave plus the time since it was read, and after 30 s it is old, as wallet.md asks", () => {
    expect(QUOTE_FRESH_MS).toBe(30_000);
    const read = { label: "1x", amountMinor: "1", state: "cotado" as const, quote: quote(), meta, receivedAtMs: 1_000_000 };
    const fresh = rungText(read, { impactLimitPct: 1, nowMs: 1_005_000 });
    expect(fresh.idade).toBe("ha 5 s");
    expect(fresh.estado).toBe("dentro do limite");
    const old = rungText(read, { impactLimitPct: 1, nowMs: 1_045_000 });
    expect(old.idade).toBe("ha 45 s");
    expect(old.estado).toBe("cotacao velha");
    expect(old.tom).toBe("alerta");
    // the age the gateway gave counts too: a quote it already held for 20 s is old 15 s after it was read
    const held = rungText({ ...read, meta: { ...meta, ageMs: 20_000 } }, { impactLimitPct: 1, nowMs: 1_015_000 });
    expect(held.idade).toBe("ha 35 s");
    expect(held.estado).toBe("cotacao velha");
    // a clock that went back never makes a quote younger than the gateway said
    expect(rungText(read, { impactLimitPct: 1, nowMs: 900_000 }).idade).toBe("ha 0 s");
    // without the moment it was read, the age is the one of the gateway
    expect(rungText({ ...read, receivedAtMs: undefined }, { impactLimitPct: 1, nowMs: 9_999_999 }).idade).toBe("ha 0 s");
  });

  test("a clock that is not a number never makes a quote look fresh: the age is a dash and the quote is old", () => {
    const base = { label: "1x", amountMinor: "1", state: "cotado" as const, quote: quote(), meta };
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const nowBad = rungText({ ...base, receivedAtMs: 1_000_000 }, { impactLimitPct: 1, nowMs: bad });
      expect(nowBad.idade).toBe("-");
      expect(nowBad.estado).toBe("cotacao velha");
      expect(nowBad.tom).toBe("alerta");
      const readBad = rungText({ ...base, receivedAtMs: bad }, { impactLimitPct: 1, nowMs: 1_000_000 });
      expect(readBad.idade).toBe("-");
      expect(readBad.estado).toBe("cotacao velha");
    }
    const ageBad = rungText({ ...base, meta: { ...meta, ageMs: Number.NaN } }, { impactLimitPct: 1 });
    expect(ageBad.idade).toBe("-");
    expect(ageBad.estado).toBe("cotacao velha");
  });

  test("an impact that rounds to zero has no sign", () => {
    const text = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ priceImpactPct: -0.004 }), meta }, { impactLimitPct: 1 });
    expect(text.impacto).toBe("0,00%");
  });

  test("a quote the gateway served from its cache because the provider did not answer is old and says so, with its age, and it still never hides a honeypot", () => {
    const old = { ...meta, stale: true, ageMs: 187_000 };
    const stale = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote(), meta: old }, { impactLimitPct: 1 });
    expect(stale.estado).toBe("cotacao velha");
    expect(stale.tom).toBe("alerta");
    expect(stale.idade).toBe("ha 3 min");
    expect(rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote(), meta: { ...meta, ageMs: 4_000 } }, { impactLimitPct: 1 }).idade).toBe("ha 4 s");
    const both = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toToken: side({ isHoneyPot: true }) }), meta: old }, { impactLimitPct: 1 });
    expect(both.estado).toBe("bloqueada: honeypot");
    expect(both.tom).toBe("bloqueio");
  });

  test("every problem of a rung is said, not only the first: a flag left out and an impact beyond the limit are both there; a tax the provider did not give is not zero", () => {
    const two = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ priceImpactPct: -4, toToken: side({ isHoneyPot: null }) }), meta }, { impactLimitPct: 1 });
    expect(two.estado).toBe("honeypot nao informado; impacto fora do limite");
    const tax = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toToken: side({ taxRate: null }) }), meta }, { impactLimitPct: 1 });
    expect(tax.estado).toBe("taxa do token nao informada");
    expect(tax.tom).toBe("alerta");
  });

  test("a number that is not a number never reaches the screen as NaN, and a limit that is not a limit is not a pass", () => {
    const text = rungText({ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ priceImpactPct: Number.NaN, estimateGasFee: Number.NaN, tradeFee: Number.POSITIVE_INFINITY }), meta }, { impactLimitPct: 1 });
    expect(text.impacto).toBe("-");
    expect(text.taxaRede).toBe("-");
    expect(text.taxaTroca).toBe("-");
    expect(text.estado).toBe("impacto nao informado");
    expect(impactState(-0.5, Number.NaN)).toBe("desconhecido");
    expect(impactState(-0.5, 0)).toBe("desconhecido");
    expect(impactState(-0.5, -1)).toBe("desconhecido");
  });

  test("a rung that failed or was not asked says so in words", () => {
    expect(rungText({ label: "1x", amountMinor: "1", state: "erro", error: "provider_payment_required" }, { impactLimitPct: 1 }).estado).toContain("Trade API");
    expect(rungText({ label: "1x", amountMinor: "1", state: "nao_pedido" }, { impactLimitPct: 1 }).estado).toBe("nao pedida");
    expect(rungText({ label: "1x", amountMinor: "1", state: "lendo" }, { impactLimitPct: 1 }).estado).toBe("lendo");
  });

  test("plain ASCII, no middle dot, em dash or en dash, and no word of an order, in every phrase of every state", () => {
    const words = /\b(comprar|compre|vender|venda|buy|sell|hold|action|signal|recommend|vote|side|sinal)\b/i;
    const rungs: Rung[] = [
      { label: "1x", amountMinor: "1", state: "cotado" as const, quote: quote(), meta },
      { label: "1x", amountMinor: "1", state: "cotado" as const, quote: quote({ priceImpactPct: -9, toToken: side({ isHoneyPot: true }) }), meta },
      { label: "1x", amountMinor: "1", state: "cotado" as const, quote: quote({ toToken: side({ decimals: null, taxRate: 0.2 }) }), meta },
      { label: "1x", amountMinor: "1", state: "erro" as const, error: "provider_error" },
      { label: "1x", amountMinor: "1", state: "erro" as const, error: "provider_payment_required" },
      { label: "1x", amountMinor: "1", state: "erro" as const, error: "network" },
      { label: "1x", amountMinor: "1", state: "nao_pedido" as const },
      { label: "1x", amountMinor: "1", state: "lendo" as const },
    ];
    for (const rung of rungs) {
      for (const text of Object.values(rungText(rung, { impactLimitPct: 1 }))) {
        expect(/^[\x20-\x7e]*$/.test(String(text))).toBe(true);
        expect(words.test(String(text))).toBe(false);
      }
    }
  });
});
