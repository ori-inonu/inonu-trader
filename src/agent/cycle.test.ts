import { describe, expect, test } from "bun:test";
import { candidateOf, type EcoFacts } from "../opportunity/ecosystem";
import { createBudget, DEFAULT_LIMITS, type BudgetLimits, type BudgetState } from "./budget";
import { createCycleRunner, type CycleDeps, type ExecResult, type Executor } from "./cycle";
import { DEFAULT_CAPS, type LimitedFacts } from "./gate";
import { createPlanStore, planKey, type PositionPlan } from "./plans";
import { timingFacts, type TimingFacts } from "./timing";
import type { Candle } from "../quant/types";
import { createAgentLedger } from "./ledger";
import type { ClosingRecord } from "./closing";
import type { AgentModel, ModelAnswer } from "./model";
import { createScoreboard } from "./scoreboard";
import { runState, type MutableRunState } from "./run-state.test-helper";
import type { Book, HoldingFacts, Mode, Position } from "./types";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const pos = (over: Partial<Position> = {}): Position => ({ id: `token:1:${A}`, chainIndex: "1", address: A, symbol: "AAA", wallet: "agente", usd: 90, balanceMinor: "1000000000000000000", decimals: 18, isCash: false, ...over });
const cash = (usd: number): Position => ({ id: `token:1:${USDC}`, chainIndex: "1", address: USDC, symbol: "USDC", wallet: "agente", usd, balanceMinor: String(usd * 1e6), decimals: 6, isCash: true });
const bookOf = (positions: Position[], observedAtMs = NOW - 1000): Book => {
  const cashByChain: Record<string, number> = {};
  for (const p of positions) if (p.isCash && p.wallet === "agente" && p.usd !== null) cashByChain[p.chainIndex] = (cashByChain[p.chainIndex] ?? 0) + p.usd;
  const agentUsd = positions.filter((p) => p.wallet === "agente").reduce((s, p) => s + (p.usd ?? 0), 0);
  return { observedAtMs, positions, cashByChain, totalUsd: positions.reduce((s, p) => s + (p.usd ?? 0), 0), agentUsd };
};
const facts: HoldingFacts = { priceUsd: 2, sinceEntryPct: null, changeH24Pct: 1, liquidityUsd: 1e6, exitImpactPct: 0.01, volumeH24Usd: 5e5, soldPct: 0, riskLevel: 1, riskFlags: [], heldHours: 10 };
const eco = (address: string, symbol: string): EcoFacts => ({ candidateId: `token:1:${address}`, chainIndex: "1", address, symbol, nota: 70, priceUsd: 0.5, changePct: 12, volumeUsd: 2e6, liquidityUsd: 5e6, marketCapUsd: 5e7, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 });

const HOUR = 3_600_000;
const bars = (closes: readonly number[]): Candle[] => closes.map((close, i) => { const open = i === 0 ? close : closes[i - 1]!; return { startMs: i * HOUR, open, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996, close, volume: 1, confirmed: true }; });
/** A lively, sideways market (about 2 percent an hour): nothing extended, every profile fits. */
const calm: TimingFacts = (() => {
  const closes = [100];
  for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i % 2 === 1 ? 1.02 : 1 / 1.02));
  return timingFacts(bars(closes))!;
})();
const parabola: TimingFacts = timingFacts(bars(Array.from({ length: 48 }, (_, i) => 100 * 1.025 ** i)))!;
/** The same run-up with the noise of a real token: a smooth exponential has no volatility, so no profile can be sized for it. */
const noisyParabola: TimingFacts = timingFacts(bars(Array.from({ length: 48 }, (_, i) => 100 * 1.025 ** i * (i % 2 === 0 ? 1.012 : 0.988))))!;

const limitedOk: LimitedFacts = { policy: { perTxUsd: 50, dailyTradeUsd: 200, dailyTransferUsd: 0, transferGuarded: true }, sessionExpiresAtMs: NOW + 3_600_000, nowMs: NOW, cycleBudgetMs: 120_000, addressMatches: true, binaryOk: true, localSkewMs: 0 };

interface Rig {
  deps: CycleDeps;
  lines: string[];
  modelCalls: number;
  execCalls: { key: string; stageAtCall: string | null }[];
  stopFile: { present: boolean };
  setMode(mode: Mode): void;
  state: MutableRunState;
  /** The candidates the model was shown at the last call. */
  shown: string[][];
  /** What each candidate was offered at the last call. */
  offered: Record<string, readonly string[]>;
}

interface RigOptions {
  positions?: Position[];
  book?: Book | null;
  answer?: (ids: readonly string[]) => ModelAnswer["raw"];
  modelThrows?: boolean;
  noModel?: boolean;
  limits?: BudgetLimits;
  clockSkewMs?: number | null;
  exec?: (n: number) => ExecResult;
  ecoFacts?: EcoFacts[];
  mode?: Mode;
  /** Plans already open, and the price of each position id now. */
  plans?: PositionPlan[];
  prices?: Record<string, number>;
  timing?: TimingFacts | null;
  /** How many physical requests the fake model says one choice took (a provider that refused the facets and was asked again is 2). */
  physicalRequests?: number;
  /** The model fails after that many physical requests went out. */
  failAfterRequests?: number;
}

function rig(o: RigOptions = {}): Rig {
  const lines: string[] = [];
  const ledger = createAgentLedger({ read: () => lines, append: (l) => void lines.push(l) });
  const stopFile = { present: false };
  const state = runState(o.mode ?? "sombra");
  const budgetSaved: BudgetState[] = [];
  const budget = createBudget({ limits: o.limits ?? DEFAULT_LIMITS, now: () => NOW, load: () => null, persist: (s) => void budgetSaved.push(s) });
  const scoreboard = createScoreboard({ read: () => [], append: () => {} });
  const r = { modelCalls: 0, execCalls: [] as { key: string; stageAtCall: string | null }[], shown: [] as string[][], offered: {} as Record<string, readonly string[]> } as { modelCalls: number; execCalls: { key: string; stageAtCall: string | null }[]; shown: string[][]; offered: Record<string, readonly string[]> };
  const planStore = createPlanStore({ read: () => null, write: () => {} });
  for (const plan of o.plans ?? []) planStore.open(plan);
  const model: AgentModel | null = o.noModel
    ? null
    : {
        name: "fake",
        estimateTokens: () => 1000,
        async choose({ candidates }) {
          r.modelCalls++;
          r.shown.push(candidates.map((c) => c.id));
          r.offered = Object.fromEntries(candidates.map((c) => [c.id, c.stances]));
          if (o.modelThrows) throw new Error("provider down");
          if (o.failAfterRequests !== undefined) throw Object.assign(new Error("provider down after retry"), { physicalRequests: o.failAfterRequests });
          const ids = candidates.map((c) => c.id);
          const raw = o.answer ? o.answer(ids) : { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"])), profiles: {} };
          return { raw, usage: { inputTokens: 900, outputTokens: 60 }, ...(o.physicalRequests === undefined ? {} : { physicalRequests: o.physicalRequests }) };
        },
      };
  let n = 0;
  const executor: Executor = {
    async execute(order, ctx) {
      r.execCalls.push({ key: ctx.orderKey, stageAtCall: ledger.orderStage(ctx.orderKey) });
      n++;
      return o.exec ? o.exec(n) : { status: "executada", ref: `ref${n}` };
    },
  };
  const positions = o.positions ?? [cash(1000), pos()];
  const book = o.book === undefined ? bookOf(positions) : o.book;
  let id = 0;
  const deps: CycleDeps = {
    state,
    ledger,
    budget,
    scoreboard,
    plans: planStore,
    model,
    executor,
    now: () => NOW,
    newId: () => `cy${++id}`,
    stopFilePresent: () => stopFile.present,
    clockSkewMs: () => (o.clockSkewMs === undefined ? 100 : o.clockSkewMs),
    readBook: async () => book,
    holdingFacts: async () => (p) => ({ ...facts, priceUsd: o.prices?.[p.id] ?? facts.priceUsd }),
    timingOf: async () => (o.timing === undefined ? calm : o.timing),
    ecosystem: async (saldo) => ({ observedAtMs: NOW, saldo, candidates: (o.ecoFacts ?? [eco(B, "BBB")]).map((f) => candidateOf(f, saldo)), excluded: {} }),
    context: () => null,
    history: () => null,
    riskPct: () => 0.1,
    caps: DEFAULT_CAPS,
    limitedFacts: async () => limitedOk,
    minBuyUsd: () => 10,
    refreshMs: 3_600_000,
    timeouts: { modelMs: 5000, readMs: 5000, orderMs: 5000 },
  };
  return Object.assign(r, { deps, lines, stopFile, planStore, setMode: (m: Mode) => state.set(m), state }) as Rig;
}

const records = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
const sellAndBuy = (ids: readonly string[]) => ({
  posture: "ofensiva",
  stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "trim_half" : "buy_third"])),
  profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
});

describe("the posture the Jev declares limits nothing: the sale and the purchase of the same answer go out as chosen", () => {
  test("a defensive posture with a sale and a purchase in the same answer: both are carried out exactly as chosen, the purchase is NOT brought down to a smaller size, and the cycle reports no limit by the posture", async () => {
    const r = rig({
      mode: "limitado",
      positions: [cash(1000), pos()],
      answer: (ids) => ({
        posture: "defensiva",
        stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "trim_half" : "buy_full"])),
        profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
        verdicts: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { choice: "buy_full", probabilities: { skip: 0.02, buy_full: 0.98 }, confidence: null }])) as never,
      }),
    });
    const out = await createCycleRunner(r.deps).run();
    expect(out.outcome).toBe("decidido");
    expect(out.notes).not.toContain("postura_limitou");
    const sides = out.orders.map((o) => `${o.order.side}:${o.order.stance}`);
    expect(sides).toContain("sell:trim_half");
    expect(sides).toContain("buy:buy_full");
    expect(sides).not.toContain("buy:buy_third");
  });
});

describe("no bar of conviction stands between the Jev's choice and the order, whatever the profile of the owner", () => {
  const lean = (ids: readonly string[]) => ({
    posture: "ofensiva",
    stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "buy_third"])),
    profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
    verdicts: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { choice: "buy_third", probabilities: { skip: 0.4, buy_third: 0.6 }, confidence: null }])) as never,
  });

  test("a 60 percent lean for a purchase is carried out with the owner's bold profile and with the plain one alike: the choice is the decision", async () => {
    const bold = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean });
    await createCycleRunner({ ...bold.deps, boldConviction: () => true }).run();
    expect(bold.execCalls).toHaveLength(1);
    const plain = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean });
    const out = await createCycleRunner(plain.deps).run();
    expect(plain.execCalls).toHaveLength(1);
    expect(out.notes.some((n) => n.startsWith("conviccao_"))).toBe(false);
  });

  test("even a 51 to 49 lean is carried out: how sure the model was is recorded, never held against a bar", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: (ids) => ({ ...lean(ids), verdicts: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { choice: "buy_third", probabilities: { skip: 0.49, buy_third: 0.51 }, confidence: null }])) as never }) });
    await createCycleRunner(r.deps).run();
    expect(r.execCalls).toHaveLength(1);
  });
});

describe("the record keeps what the gate did to each purchase, with the raw numbers", () => {
  const leaning = (up: number) => (ids: readonly string[]) => ({
    posture: "ofensiva",
    stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "buy_third"])),
    profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
    verdicts: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { choice: "buy_third", probabilities: { skip: 1 - up, buy_third: up }, confidence: null }])) as never,
  });

  test("a 51 to 49 lean is carried out and is on the record as asked, applied (the same), raw conviction and no bar, next to the rounded probabilities", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: leaning(0.51) });
    const entries: Record<string, unknown>[] = [];
    await createCycleRunner({ ...r.deps, boldConviction: () => true, onConsult: (e) => void entries.push(e as never) }).run();
    expect(r.execCalls).toHaveLength(1);
    const e = entries[0] as { gates: Record<string, { asked: string; applied: string; conviction: number; bar: number | null; reason: string | null }>; verdicts: Record<string, Record<string, number>> };
    const id = Object.keys(e.gates)[0]!;
    expect(id.startsWith("buy:")).toBe(true);
    expect(e.gates[id]).toEqual({ asked: "buy_third", applied: "buy_third", conviction: 0.02, bar: null, reason: null });
    expect(e.verdicts[id]).toEqual({ skip: 0.49, buy_third: 0.51 });
  });

  test("a purchase that went through is on the record too, and an answer with no purchase leaves the key out", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: leaning(0.7) });
    const entries: Record<string, unknown>[] = [];
    await createCycleRunner({ ...r.deps, boldConviction: () => true, onConsult: (e) => void entries.push(e as never) }).run();
    const g = (entries[0] as { gates: Record<string, { applied: string; reason: string | null }> }).gates;
    expect(Object.values(g).every((x) => x.applied === "buy_third" && x.reason === null)).toBe(true);
    const none = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const quiet: Record<string, unknown>[] = [];
    await createCycleRunner({ ...none.deps, onConsult: (e) => void quiet.push(e as never) }).run();
    expect(quiet[0]).not.toHaveProperty("gates");
  });
});

describe("the facts of the quote reach the order record", () => {
  const facts = { atMs: 1, action: "ok", impactPct: 0.4, tradeFee: null, gasEstimate: null, slot: null, taxFromPct: null, taxToPct: null, fromAmountMinor: null, toAmountMinor: null, feeUnit: "usd", gasUnit: "native_minor", present: ["impact"] } as const;
  const lean = (ids: readonly string[]) => ({
    posture: "ofensiva",
    stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "buy_third"])),
    profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
    verdicts: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { choice: "buy_third", probabilities: { skip: 0.1, buy_third: 0.9 }, confidence: null }])) as never,
  });

  test("the record written AFTER the executor answered carries them, the ones written before it do not, and without a source there is no key", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean });
    await createCycleRunner({ ...r.deps, quoteOf: () => facts as never }).run();
    const orders = records(r.lines).filter((x) => x.kind === "order");
    expect(orders.map((x) => x.stage)).toEqual(["preparada", "enviando", "executada"]);
    expect(orders.map((x) => "quote" in x)).toEqual([false, false, true]);
    expect(orders.at(-1)!.quote).toEqual(facts);
    const plain = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean });
    await createCycleRunner(plain.deps).run();
    expect(records(plain.lines).filter((x) => x.kind === "order").some((x) => "quote" in x)).toBe(false);
  });
});

describe("the closing of a purchase, in shadow, inside the cycle", () => {
  const USDC_EVM = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const lean = (up: number) => (ids: readonly string[]) => ({
    posture: "ofensiva",
    stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "buy_third"])),
    profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
    verdicts: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { choice: "buy_third", probabilities: { skip: 1 - up, buy_third: up }, confidence: null }])) as never,
    facets: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { fading: 0.6, late_entry: 0.1 }])) as never,
  });
  /** A quoter that answers the quote the real tool would for the token and the size it is asked for (read only). */
  const quoterFor = () => {
    const asked: { token: string; usd: number }[] = [];
    return { asked, quoter: { read: async (order: { address: string; usd: number; candidateId: string; chainIndex: string }, ctx: { cycleId: string; requestId: string }) => {
      asked.push({ token: order.address, usd: order.usd });
      const minor = String(Math.round(order.usd * 1_000_000));
      return { ok: true as const, request: { cycleId: ctx.cycleId, candidateId: order.candidateId, requestId: ctx.requestId, chainIndex: order.chainIndex, fromAddress: USDC_EVM, toAddress: order.address, fromAmountMinor: minor, fromDecimals: 6, toDecimals: null, startedAtMs: NOW - 500, receivedAtMs: NOW - 100 },
        raw: { chainIndex: order.chainIndex, swapMode: "exactIn", action: "ok", fromTokenAmount: minor, toTokenAmount: "123", priceImpactPercent: "-0.3", tradeFee: "0.0005", fromToken: { tokenContractAddress: USDC_EVM, decimal: "6", taxRate: "0", isHoneyPot: false }, toToken: { tokenContractAddress: order.address, decimal: "6", taxRate: "0", isHoneyPot: false } } };
    } } };
  };
  const withClose = (r: Rig, answer: { buy: number; skip: number } | null, counter: { n: number }) => ({
    ...r.deps.model!,
    close: async () => { counter.n++; return { answer, usage: { inputTokens: 800, outputTokens: 10 } }; },
  }) as never;

  test("a weak lean is quoted and put to the model once, recorded with what it would say, and the cycle does exactly what it did without the phase", async () => {
    const without = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.55) });
    await createCycleRunner(without.deps).run();
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.55) });
    const { asked, quoter } = quoterFor();
    const records: ClosingRecord[] = [];
    const calls = { n: 0 };
    const out = await createCycleRunner({ ...r.deps, model: withClose(r, { buy: 0.8, skip: 0.2 }, calls), closing: { quoter: quoter as never, record: (x) => void records.push(x), maxPerCycle: 2, timeouts: { quoteMs: 1000, modelMs: 1000 } } }).run();
    expect(asked).toHaveLength(1);
    expect(calls.n).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ phase: "closing", mode: "shadow", would: "buy", wouldReason: "resposta_do_jev", applied: "buy_third", first: { appliedByGate: "buy_third" }, answer: { buy: 0.8, skip: 0.2 } });
    expect(records[0]!.brief?.sua.f).toEqual({ late_entry: 10, fading: 60 });
    // shadow: the same orders, the same stances, nothing sent that was not sent without it
    expect(r.execCalls).toEqual(without.execCalls);
    expect(out.orders).toHaveLength(1);
    // and the question was paid from the same budget: one primary consult and one closing
    expect(r.deps.budget.status().consults).toBe(2);
  });

  test("a purchase that passed the gate is also quoted and measured, and still goes out exactly as before", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.95) });
    const { quoter } = quoterFor();
    const records: ClosingRecord[] = [];
    const calls = { n: 0 };
    await createCycleRunner({ ...r.deps, model: withClose(r, { buy: 0.2, skip: 0.8 }, calls), closing: { quoter: quoter as never, record: (x) => void records.push(x), maxPerCycle: 2, timeouts: { quoteMs: 1000, modelMs: 1000 } } }).run();
    expect(r.execCalls).toHaveLength(1);
    expect(records[0]).toMatchObject({ would: "skip", applied: "buy_third" });
  });

  test("without a lean to buy, or with the phase off, nothing is quoted and nothing is asked", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()] });
    const { asked, quoter } = quoterFor();
    const calls = { n: 0 };
    await createCycleRunner({ ...r.deps, model: withClose(r, { buy: 0.8, skip: 0.2 }, calls), closing: { quoter: quoter as never, record: () => {}, maxPerCycle: 2, timeouts: { quoteMs: 1000, modelMs: 1000 } } }).run();
    expect(asked).toEqual([]);
    expect(calls.n).toBe(0);
    const off = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.55) });
    const calls2 = { n: 0 };
    await createCycleRunner({ ...off.deps, model: withClose(off, { buy: 0.8, skip: 0.2 }, calls2) }).run();
    expect(calls2.n).toBe(0);
  });

  describe("the primary orders come first", () => {
    const sellAndLean = (up: number) => (ids: readonly string[]) => ({
      posture: "ofensiva",
      stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "trim_half" : "buy_third"])),
      profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
      verdicts: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, { choice: "buy_third", probabilities: { skip: 1 - up, buy_third: up }, confidence: null }])) as never,
    });

    test("with a sale in the plan the sale (and every order of the cycle) goes out BEFORE the second look is quoted, and the record says the look came after", async () => {
      const seq: string[] = [];
      const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: sellAndLean(0.95), exec: (n) => (seq.push(`order${n}`), { status: "executada", ref: `ref${n}` }) });
      const { quoter } = quoterFor();
      const records: ClosingRecord[] = [];
      const timed = { read: async (...args: Parameters<typeof quoter.read>) => (seq.push("quote"), quoter.read(...args)) };
      await createCycleRunner({ ...r.deps, model: withClose(r, { buy: 0.8, skip: 0.2 }, { n: 0 }), closing: { quoter: timed as never, record: (x) => void records.push(x), maxPerCycle: 2, timeouts: { quoteMs: 1000, modelMs: 1000 } } }).run();
      expect(seq[0]).toBe("order1");
      expect(seq.indexOf("quote")).toBeGreaterThan(seq.lastIndexOf("order1"));
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ placed: "depois" });
    });

    test("with only purchases in the plan the look comes before the order, as the measurement of the entry, and says so", async () => {
      const seq: string[] = [];
      const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.95), exec: (n) => (seq.push(`order${n}`), { status: "executada", ref: `ref${n}` }) });
      const { quoter } = quoterFor();
      const records: ClosingRecord[] = [];
      const timed = { read: async (...args: Parameters<typeof quoter.read>) => (seq.push("quote"), quoter.read(...args)) };
      await createCycleRunner({ ...r.deps, model: withClose(r, { buy: 0.8, skip: 0.2 }, { n: 0 }), closing: { quoter: timed as never, record: (x) => void records.push(x), maxPerCycle: 2, timeouts: { quoteMs: 1000, modelMs: 1000 } } }).run();
      expect(seq).toEqual(["quote", "order1"]);
      expect(records[0]).toMatchObject({ placed: "antes" });
    });

    test("a look that hangs is cut at the phase limit and the order goes out anyway: the extra look can cost the measurement, never the entry", async () => {
      const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.95) });
      const records: ClosingRecord[] = [];
      const hung = { read: (_o: unknown, ctx: { signal: AbortSignal }) => new Promise<never>((_, reject) => ctx.signal.addEventListener("abort", () => reject(new Error("aborted")))) };
      const t0 = Date.now();
      await createCycleRunner({ ...r.deps, closing: { quoter: hung as never, record: (x) => void records.push(x), maxPerCycle: 2, phaseMs: 40, timeouts: { quoteMs: 5000, modelMs: 5000 } } }).run();
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(r.execCalls).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(records[0]).toMatchObject({ would: null, quoteFailure: "quote_recusada" });
    });

    test("the day's consultations the primary looks still need are kept: with none to spare the second look asks nothing and says why", async () => {
      const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.95), limits: { maxConsultsPerDay: 10, maxTokensPerDay: null } });
      const { asked, quoter } = quoterFor();
      const records: ClosingRecord[] = [];
      const calls = { n: 0 };
      // one consult is spent by this cycle; nine remain and nine primary looks are still due today
      await createCycleRunner({ ...r.deps, model: withClose(r, { buy: 0.8, skip: 0.2 }, calls), closing: { quoter: quoter as never, record: (x) => void records.push(x), maxPerCycle: 2, reserveForPrimaries: () => 9, timeouts: { quoteMs: 1000, modelMs: 1000 } } }).run();
      expect(asked).toEqual([]);
      expect(calls.n).toBe(0);
      expect(records[0]).toMatchObject({ would: null, wouldReason: "reserva_para_primarias", quote: null });
      expect(r.deps.budget.status().consults).toBe(1);
    });
  });

  test("a closing that blows up costs the measurement and never the cycle", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], answer: lean(0.95) });
    const out = await createCycleRunner({ ...r.deps, closing: { quoter: { read: async () => { throw new Error("boom"); } } as never, record: () => { throw new Error("disk"); }, maxPerCycle: 2, timeouts: { quoteMs: 1000, modelMs: 1000 } } }).run();
    expect(out.outcome).toBe("decidido");
    expect(r.execCalls).toHaveLength(1);
  });
});

describe("a cycle that does not run", () => {
  test("the agent is off: nothing is read, asked or written", async () => {
    const r = rig({ mode: "desligado" });
    const out = await createCycleRunner(r.deps).run();
    expect(out).toMatchObject({ outcome: "bloqueado", reason: "desligado", consulted: false });
    expect(r.modelCalls).toBe(0);
    expect(r.lines).toHaveLength(0);
  });

  test("a failed gate holds, says why, and is recorded", async () => {
    const r = rig({ clockSkewMs: 90_000 });
    const out = await createCycleRunner(r.deps).run();
    expect(out).toMatchObject({ outcome: "bloqueado", reason: "relogio" });
    expect(r.modelCalls).toBe(0);
    expect(records(r.lines)).toMatchObject([{ kind: "cycle", outcome: "bloqueado", reason: "relogio" }]);
  });

  test("a wallet that could not be read, or is too old, holds", async () => {
    expect((await createCycleRunner(rig({ book: null }).deps).run()).reason).toBe("carteira_antiga");
    expect((await createCycleRunner(rig({ book: bookOf([cash(1000), pos()], NOW - 600_000) }).deps).run()).reason).toBe("carteira_antiga");
  });

  test("the STOP file blocks a cycle even in the money mode", async () => {
    const r = rig({ mode: "limitado" });
    r.stopFile.present = true;
    expect((await createCycleRunner(r.deps).run()).reason).toBe("arquivo_stop");
    expect(r.execCalls).toHaveLength(0);
  });

  test("two cycles at once: the second is refused, not queued", async () => {
    const r = rig();
    const runner = createCycleRunner(r.deps);
    const [a, b] = await Promise.all([runner.run(), runner.run()]);
    expect([a.reason, b.reason].filter((x) => x === "ja_em_andamento")).toHaveLength(1);
  });
});

describe("a cycle that does not consult the model", () => {
  test("nothing to decide: no model call, no budget", async () => {
    const r = rig({ positions: [cash(1000)], ecoFacts: [] });
    const out = await createCycleRunner(r.deps).run();
    expect(out).toMatchObject({ outcome: "mantido", reason: "sem_candidatos", consulted: false });
    expect(r.modelCalls).toBe(0);
    expect(r.deps.budget.status().consults).toBe(0);
  });

  test("no model key: holds", async () => {
    const r = rig({ noModel: true });
    expect(await createCycleRunner(r.deps).run()).toMatchObject({ outcome: "mantido", reason: "sem_modelo", consulted: false });
  });

  test("a spent budget holds without calling the model", async () => {
    const r = rig({ limits: { maxConsultsPerDay: 1, maxTokensPerDay: null } });
    r.deps.budget.begin(1);
    expect(await createCycleRunner(r.deps).run()).toMatchObject({ outcome: "mantido", reason: "consultas_esgotadas", consulted: false });
    expect(r.modelCalls).toBe(0);
  });

  test("the same Brief within the refresh time is not asked again", async () => {
    const r = rig();
    const runner = createCycleRunner(r.deps);
    expect((await runner.run()).consulted).toBe(true);
    expect(await runner.run()).toMatchObject({ outcome: "mantido", reason: "sem_mudanca", consulted: false });
    expect(r.modelCalls).toBe(1);
    expect(r.deps.budget.status().consults).toBe(1);
  });

  test("after the refresh time it asks again even if nothing changed", async () => {
    const r = rig();
    let now = NOW;
    const runner = createCycleRunner({ ...r.deps, now: () => now, refreshMs: 60_000 });
    await runner.run();
    now = NOW + 61_000;
    expect((await runner.run()).consulted).toBe(true);
  });
});

describe("a cycle that consults the model", () => {
  test("a model error holds and the consultation stays counted as unmeasured", async () => {
    const r = rig({ modelThrows: true });
    const out = await createCycleRunner(r.deps).run();
    expect(out).toMatchObject({ outcome: "mantido", reason: "modelo_erro", consulted: true });
    expect(r.deps.budget.status()).toMatchObject({ consults: 1, unmeasuredCalls: 1 });
    expect(JSON.stringify(out)).not.toContain("provider down");
  });

  test("a model that takes too long is cut and holds", async () => {
    const r = rig();
    const slow: AgentModel = { name: "slow", estimateTokens: () => 100, choose: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) };
    const out = await createCycleRunner({ ...r.deps, model: slow, timeouts: { modelMs: 30, readMs: 1000, orderMs: 1000 } }).run();
    expect(out).toMatchObject({ outcome: "mantido", reason: "modelo_erro" });
  });

  test("an answer outside what was offered holds, with the reason", async () => {
    const r = rig({ answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, "buy_full"])), profiles: {} }) });
    const out = await createCycleRunner(r.deps).run();
    expect(out).toMatchObject({ outcome: "mantido", reason: "agente_postura_invalida" });
    expect(out.orders).toHaveLength(0);
  });

  test("hold and skip everywhere is a decision that makes no order", async () => {
    const r = rig();
    const out = await createCycleRunner(r.deps).run();
    expect(out).toMatchObject({ outcome: "decidido", posture: "neutra" });
    expect(out.orders).toHaveLength(0);
    expect(r.execCalls).toHaveLength(0);
  });
});

describe("shadow mode: decides, records, measures, moves nothing", () => {
  test("orders are worked out and recorded as prepared, never sent", async () => {
    const r = rig({ answer: sellAndBuy });
    const out = await createCycleRunner(r.deps).run();
    expect(out.outcome).toBe("decidido");
    expect(out.orders.map((o) => [o.order.side, o.stage])).toEqual([["sell", "preparada"], ["buy", "preparada"]]);
    expect(r.execCalls).toHaveLength(0);
    const recs = records(r.lines);
    expect(recs.map((x) => x.kind)).toEqual(["cycle", "order", "order"]);
    expect(recs[0]).toMatchObject({ outcome: "decidido", posture: "ofensiva", planned: 2 });
  });

  test("each order is marked on the Placar with the price the facts gave at the decision", async () => {
    const r = rig({ answer: sellAndBuy });
    await createCycleRunner(r.deps).run();
    const s = r.deps.scoreboard.summary(NOW);
    expect(s.decisions).toBe(2);
    expect(s.noEntryPrice).toBe(0);
    expect(s.byMode.sombra).toBeDefined();
  });

  test("the budget counts the consultation with the measured tokens", async () => {
    const r = rig({ answer: sellAndBuy });
    await createCycleRunner(r.deps).run();
    expect(r.deps.budget.status()).toMatchObject({ consults: 1, measuredTokens: 960, committedTokens: 960 });
  });

  test("a choice that took two physical requests (the first refused, then asked again) counts both: the second with its usage, the first as a consultation of unknown usage", async () => {
    const r = rig({ physicalRequests: 2 });
    await createCycleRunner(r.deps).run();
    expect(r.deps.budget.status()).toMatchObject({ consults: 2, measuredTokens: 960, committedTokens: 1960, unmeasuredCalls: 1 });
  });

  test("a failure after the retry still counts both requests, and a plain failure counts one", async () => {
    const two = rig({ failAfterRequests: 2 });
    await createCycleRunner(two.deps).run();
    expect(two.deps.budget.status()).toMatchObject({ consults: 2, unmeasuredCalls: 2 });
    const one = rig({ modelThrows: true });
    await createCycleRunner(one.deps).run();
    expect(one.deps.budget.status()).toMatchObject({ consults: 1, unmeasuredCalls: 1 });
  });
});

describe("limited mode: carries the orders out inside the policy", () => {
  test("the ledger says enviando BEFORE the executor is called, and executada after", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => o.stage)).toEqual(["executada", "executada"]);
    expect(r.execCalls.map((c) => c.stageAtCall)).toEqual(["enviando", "enviando"]);
    const stages = records(r.lines).filter((x) => x.kind === "order").map((x) => x.stage);
    expect(stages).toEqual(["preparada", "preparada", "enviando", "executada", "enviando", "executada"]);
    expect(out.orders.map((o) => o.ref)).toEqual(["ref1", "ref2"]);
  });

  test("sales go first, so the cash they free is the cash the purchases found", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => o.order.side)).toEqual(["sell", "buy"]);
  });

  test("a failed order does not stop the others: nothing was sent, and the stop-loss behind it must still go out", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy, exec: (n) => (n === 1 ? { status: "falhou", reason: "impacto_alto" } : { status: "executada", ref: "ok2" }) });
    const out = await createCycleRunner(r.deps).run();
    expect(r.execCalls).toHaveLength(2);
    expect(out.orders.map((o) => o.stage)).toEqual(["falhou", "executada"]);
    expect(out.orders[0]!.reason).toBe("impacto_alto");
    expect(out.reason).toBe("ordem_falhou");
    expect(r.deps.ledger.inFlight()).toEqual([]);
  });

  test("a failed protective exit does not keep the exit of another token from going out", async () => {
    const other = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 120 });
    const planB: PositionPlan = { key: planKey("1", B), chainIndex: "1", address: B, symbol: "BBB", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0" };
    const planA: PositionPlan = { key: planKey("1", A), chainIndex: "1", address: A, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0" };
    const r = rig({ mode: "limitado", noModel: true, positions: [cash(1000), pos({ usd: 90 }), other], plans: [planA, planB], prices: { [pos().id]: 93, [other.id]: 93 }, exec: (n) => (n === 1 ? { status: "falhou", reason: "impacto_alto" } : { status: "executada", ref: "ok2" }) });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => o.stage)).toEqual(["falhou", "executada"]);
    expect(r.execCalls).toHaveLength(2);
  });

  test("an uncertain result stops the rest of the cycle and stays in flight: that token is not offered again, the others still are", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy, exec: (n) => (n === 1 ? { status: "incerta", reason: "tempo_esgotado" } : { status: "executada", ref: "ok2" }) });
    const runner = createCycleRunner(r.deps);
    const first = await runner.run();
    expect(first.orders[0]!.stage).toBe("incerta");
    expect(first.reason).toBe("ordem_incerta");
    expect(r.execCalls).toHaveLength(1);
    expect(r.deps.ledger.inFlight()).toHaveLength(1);
    const second = await runner.run();
    // the token in flight is out of what the model sees; the purchase of another token goes on
    expect(r.modelCalls).toBe(2);
    expect(r.shown[1]!.some((id) => id.startsWith("hold:"))).toBe(false);
    expect(second.orders.map((o) => [o.order.side, o.stage])).toEqual([["buy", "executada"]]);
    expect(r.deps.ledger.inFlight()).toHaveLength(1);
  });

  test("the network fee last measured on the network of a purchase reaches the Brief the model reads, and is in the record: absent where none was measured", async () => {
    const entries: { brief: { compras: Record<string, Record<string, unknown>> } }[] = [];
    const r = rig({ mode: "sombra", positions: [cash(1000), pos()] });
    await createCycleRunner({ ...r.deps, feeOf: (chainIndex) => (chainIndex === "1" ? { usd: 3.4567, ageMin: 4 } : null), onConsult: (e) => void entries.push(e as never) }).run();
    const buy = Object.values(entries[0]!.brief.compras)[0]!;
    expect(buy.k).toBe(3.5);
    const bare = rig({ mode: "sombra", positions: [cash(1000), pos()] });
    const plain: { brief: { compras: Record<string, Record<string, unknown>> } }[] = [];
    await createCycleRunner({ ...bare.deps, onConsult: (e) => void plain.push(e as never) }).run();
    expect(Object.hasOwn(Object.values(plain[0]!.brief.compras)[0]!, "k")).toBe(false);
  });

  test("the consultation tells the study of the agent the four real clocks and the full hash of the Brief the model read, apart from the record (ADENDO-D, V2-4)", async () => {
    let t = NOW;
    const metas: { factAvailableAtMs: number; askedAtMs: number; answeredAtMs: number; briefHash: string; model: string }[] = [];
    const entries: { briefHash: string }[] = [];
    const r = rig({ mode: "sombra", positions: [cash(1000), pos()] });
    await createCycleRunner({ ...r.deps, now: () => (t += 7), onConsult: (e, m) => { entries.push(e as never); metas.push(m as never); } }).run();
    expect(metas).toHaveLength(1);
    const m = metas[0]!;
    expect(m.factAvailableAtMs).toBeLessThan(m.askedAtMs);
    expect(m.askedAtMs).toBeLessThan(m.answeredAtMs);
    expect(m.briefHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.briefHash.slice(0, 16)).toBe(entries[0]!.briefHash);
    expect(m.model).toBe("fake");
  });

  test("a purchase of a token the agent already holds under a plan is offered that plan's profile only, carries it, and leaves the plan as it was (the independent review, SF-5)", async () => {
    const key = planKey("1", B);
    const plan: PositionPlan = { key, chainIndex: "1", address: B, symbol: "BBB", profile: "alvo_20", entryPriceUsd: 0.5, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 0.5, targetHit: false, trimmed: false, cycleId: "c0" };
    const held = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 100, balanceMinor: "200000000000000000000" });
    const r = rig({ mode: "limitado", plans: [plan], positions: [cash(1000), held], prices: { [`token:1:${B}`]: 0.5 }, ecoFacts: [eco(B, "BBB")] });
    const seen: string[][] = [];
    const model = {
      name: "fake",
      estimateTokens: () => 1000,
      async choose({ candidates }: { candidates: readonly { id: string; kind: string; profiles: readonly string[] }[] }) {
        const buy = candidates.find((c) => c.kind === "buy")!;
        seen.push([...buy.profiles]);
        return { raw: { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : c.id === buy.id ? "buy_third" : "skip"])), profiles: { [buy.id]: buy.profiles[0]! } }, usage: { inputTokens: 900, outputTokens: 60 } };
      },
    } as unknown as AgentModel;
    const out = await createCycleRunner({ ...r.deps, model }).run();
    expect(seen).toEqual([["alvo_20"]]);
    expect(out.orders.map((o) => [o.order.side, o.order.profile])).toEqual([["buy", "alvo_20"]]);
    expect(r.deps.plans.get(key)).toMatchObject({ profile: "alvo_20", entryPriceUsd: 0.5, entryAtMs: NOW - 5 * HOUR });
  });

  describe("a purchase that was sent and is not in the wallet yet has spent its dollars (the independent review, SF-1)", () => {
    const C = "0x3333333333333333333333333333333333333333";
    const firstBuyFull = (ids: readonly string[]) => {
      const buys = ids.filter((id) => id.startsWith("buy:"));
      return { posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id === buys[0] ? "buy_full" : id.startsWith("hold:") ? "hold" : "skip"])), profiles: Object.fromEntries(buys.slice(0, 1).map((id) => [id, "alvo_10"])) };
    };
    const two = [eco(B, "BBB"), eco(C, "CCC")];
    // a provider limit above the cash, so that the only thing that can stop the second purchase is the dollars the first one spent
    const roomy: LimitedFacts = { ...limitedOk, policy: { perTxUsd: 450, dailyTradeUsd: 1000, dailyTransferUsd: 0, transferGuarded: true } };

    test("the cash of the next look is what the wallet shows MINUS the purchase still in flight: another token is not offered the same 400 dollars, and nothing more is sent", async () => {
      const r = rig({ mode: "limitado", positions: [cash(400)], ecoFacts: two, answer: firstBuyFull, exec: () => ({ status: "incerta", reason: "tempo_esgotado" }) });
      const runner = createCycleRunner({ ...r.deps, limitedFacts: async () => roomy });
      const first = await runner.run();
      expect(first.orders.map((o) => [o.order.side, o.order.usd, o.stage])).toEqual([["buy", 400, "incerta"]]);
      expect(r.execCalls).toHaveLength(1);
      // the wallet still shows the 400 dollars and not the token (the provider has not caught up)
      const second = await runner.run();
      expect(r.execCalls).toHaveLength(1);
      expect(second.orders).toEqual([]);
      expect(r.modelCalls).toBe(1);
    });

    test("the same for a purchase confirmed a moment ago while the wallet still shows the old cash: it is not spent again on another token, nor bought again on the same one", async () => {
      const r = rig({ mode: "limitado", positions: [cash(400)], ecoFacts: two, answer: firstBuyFull, exec: () => ({ status: "executada", ref: "ok1" }) });
      const runner = createCycleRunner({ ...r.deps, limitedFacts: async () => roomy });
      const first = await runner.run();
      expect(first.orders.map((o) => [o.order.usd, o.stage])).toEqual([[400, "executada"]]);
      const second = await runner.run();
      expect(r.execCalls).toHaveLength(1);
      expect(second.orders).toEqual([]);
    });

    test("once the wallet shows the token the purchase stops counting: the cash it then shows is the cash there is, and the token can be bought again", async () => {
      const r = rig({ mode: "limitado", positions: [cash(400)], ecoFacts: two, answer: firstBuyFull, prices: { [`token:1:${B}`]: 0.5 }, exec: () => ({ status: "executada", ref: "ok1" }) });
      await createCycleRunner({ ...r.deps, limitedFacts: async () => roomy }).run();
      // five tokens at the entry price: the plan has nothing to say, and the wallet now shows them
      const bought = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 2.5, balanceMinor: "5000000000000000000" });
      const after = bookOf([cash(400), bought]);
      const runner = createCycleRunner({ ...r.deps, limitedFacts: async () => roomy, readBook: async () => after });
      const second = await runner.run();
      expect(second.orders.map((o) => [o.order.side, o.order.usd, o.stage])).toEqual([["buy", 400, "executada"]]);
    });
  });

  test("when the only thing left is the token in flight, the cycle holds and says why", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy, ecoFacts: [], exec: () => ({ status: "incerta", reason: "tempo_esgotado" }) });
    const runner = createCycleRunner(r.deps);
    await runner.run();
    const second = await runner.run();
    expect(second).toMatchObject({ outcome: "mantido", reason: "ordens_em_voo" });
    expect(r.execCalls).toHaveLength(1);
  });

  describe("a position the agent did not open gets the protection the model chose for it", () => {
    const keepWithPlan = (profile: string) => (ids: readonly string[]) => ({
      posture: "neutra",
      stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])),
      profiles: Object.fromEntries(ids.filter((id) => id.startsWith("hold:")).map((id) => [id, profile])),
    });

    test("the model is offered the profiles that fit the token, keeps it with one of them, and from then on the plan exists on disk with the price of that moment as its entry", async () => {
      const r = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: keepWithPlan("alvo_5") });
      const out = await createCycleRunner(r.deps).run();
      const plan = r.deps.plans.get(planKey("1", A));
      expect(plan).toMatchObject({ profile: "alvo_5", symbol: "AAA", targetHit: false, trimmed: false, cycleId: out.cycleId });
      expect(plan!.entryPriceUsd).toBeGreaterThan(0);
      expect(plan!.peakPriceUsd).toBe(plan!.entryPriceUsd);
      expect(out.notes).toContain("planos_adotados");
    });

    test("a holding sold in the same answer gets no plan, one that already has a plan keeps it, and an answer with no profile leaves the holding as it was", async () => {
      const sold = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "exit_all" : "skip"])), profiles: Object.fromEntries(ids.filter((id) => id.startsWith("hold:")).map((id) => [id, "alvo_5"])) }) });
      await createCycleRunner(sold.deps).run();
      expect(sold.deps.plans.get(planKey("1", A))).toBeUndefined();
      const none = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
      const out = await createCycleRunner(none.deps).run();
      expect(none.deps.plans.get(planKey("1", A))).toBeUndefined();
      expect(out.notes).not.toContain("planos_adotados");
      const planned: PositionPlan = { key: planKey("1", A), chainIndex: "1", address: A, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: NOW - 2 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0" };
      const had = rig({ mode: "sombra", positions: [cash(1000), pos()], plans: [planned], prices: { [`token:1:${A}`]: 100 }, answer: keepWithPlan("alvo_5") });
      await createCycleRunner(had.deps).run();
      expect(had.deps.plans.get(planKey("1", A))!.profile).toBe("alvo_10");
    });

    test("a token with no usable hourly history is offered no profile, so it cannot be given a plan the code would not stand behind", async () => {
      const r = rig({ mode: "sombra", positions: [cash(1000), pos()], timing: null, answer: keepWithPlan("alvo_5") });
      const out = await createCycleRunner(r.deps).run();
      expect(r.deps.plans.get(planKey("1", A))).toBeUndefined();
      expect(out.notes).not.toContain("planos_adotados");
    });
  });

  test("the decisions NOT to act are measured too: every hold and every skip is marked, apart from the orders", async () => {
    const r = rig({ mode: "sombra", answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders).toEqual([]);
    const s = r.deps.scoreboard.summary(NOW);
    const looked = out.view ?? [];
    expect(looked.length).toBeGreaterThan(1);
    expect(s.decisions).toBe(0);
    expect(s.inaction.decisions).toBe(looked.length);
    // a hold is the exposure kept, a skip is the exposure not taken
    expect(s.inaction.windows["15m"].n).toBe(looked.length);
  });

  describe("the model does not sell a holding in slices every cycle (each slice pays the fee and the price impact again)", () => {
    const trimThenAsk = async () => {
      const r = rig({ mode: "limitado", positions: [cash(1000), pos({ usd: 90 })], exec: () => ({ status: "executada", ref: "ok1" }), answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "trim_half" : "skip"])), profiles: {} }) });
      const first = await createCycleRunner(r.deps).run();
      expect(first.orders.map((o) => o.order.stance)).toEqual(["trim_half"]);
      return r;
    };
    const holdId = `hold:token:1:${A}@agente`;
    const later = (r: Awaited<ReturnType<typeof trimThenAsk>>, minutes: number) => createCycleRunner({ ...r.deps, now: () => NOW + minutes * 60_000, readBook: async () => bookOf([cash(1000), pos({ usd: 45, balanceMinor: "500000000000000000" })], NOW + minutes * 60_000 - 1000) });

    test("after the model sold part of a token, partial sales of it are not offered again for an hour: keep it, or leave it whole", async () => {
      const r = await trimThenAsk();
      await later(r, 5).run();
      expect(r.offered[holdId]).toEqual(["hold", "exit_all"]);
      // still within the hour
      await later(r, 59).run();
      expect(r.offered[holdId]).toEqual(["hold", "exit_all"]);
    });

    test("after the hour the slices are offered again", async () => {
      const r = await trimThenAsk();
      await later(r, 61).run();
      expect(r.offered[holdId]).toEqual(expect.arrayContaining(["hold", "trim_third", "trim_half", "exit_all"]));
    });

    test("a sale that never went out (it failed cleanly) does not start the cooldown", async () => {
      const r = rig({ mode: "limitado", positions: [cash(1000), pos({ usd: 90 })], exec: () => ({ status: "falhou", reason: "quote_recusada" }), answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "trim_half" : "skip"])), profiles: {} }) });
      await createCycleRunner(r.deps).run();
      await createCycleRunner({ ...r.deps, now: () => NOW + 5 * 60_000, readBook: async () => bookOf([cash(1000), pos({ usd: 90 })], NOW + 5 * 60_000 - 1000) }).run();
      expect(r.offered[holdId]).toEqual(expect.arrayContaining(["trim_half"]));
    });
  });

  describe("a sale whose simulation failed before it was sent is not repeated at once: the route is not working, and asking again every cycle only repeats the failure", () => {
    const sellAndFail = async () => {
      const r = rig({ mode: "limitado", positions: [cash(1000), pos({ usd: 90 })], exec: () => ({ status: "falhou", reason: "simulacao_falhou", detail: "transaction simulation failed" }), answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "exit_all" : "skip"])), profiles: {} }) });
      await createCycleRunner(r.deps).run();
      return r;
    };
    const holdId = `hold:token:1:${A}@agente`;
    const later = (r: Awaited<ReturnType<typeof sellAndFail>>, minutes: number) => createCycleRunner({ ...r.deps, now: () => NOW + minutes * 60_000, readBook: async () => bookOf([cash(1000), pos({ usd: 90 })], NOW + minutes * 60_000 - 1000) });

    test("for half an hour the token is only kept, and the model is told why", async () => {
      const r = await sellAndFail();
      const entries: { candidates: { id: string; triggers: string[] }[] }[] = [];
      await createCycleRunner({ ...r.deps, now: () => NOW + 10 * 60_000, readBook: async () => bookOf([cash(1000), pos({ usd: 90 })], NOW + 10 * 60_000 - 1000), onConsult: (e) => void entries.push(e as never) }).run();
      expect(r.offered[holdId]).toEqual(["hold"]);
      expect(entries[0]!.candidates.find((c) => c.id === holdId)!.triggers).toContain("venda_falhando");
    });

    test("after half an hour the sale is offered again", async () => {
      const r = await sellAndFail();
      await later(r, 31).run();
      expect(r.offered[holdId]).toEqual(expect.arrayContaining(["hold", "exit_all"]));
    });

    test("only a failure PROVEN before the send does this: an ordinary clean failure does not", async () => {
      const r = rig({ mode: "limitado", positions: [cash(1000), pos({ usd: 90 })], exec: () => ({ status: "falhou", reason: "quote_recusada" }), answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "exit_all" : "skip"])), profiles: {} }) });
      await createCycleRunner(r.deps).run();
      await createCycleRunner({ ...r.deps, now: () => NOW + 10 * 60_000, readBook: async () => bookOf([cash(1000), pos({ usd: 90 })], NOW + 10 * 60_000 - 1000) }).run();
      expect(r.offered[holdId]).toEqual(expect.arrayContaining(["exit_all"]));
    });
  });

  test("the screen is told which purchases the CODE closed (only `skip` on offer) and why, so a forced skip is not shown as the model's judgment", async () => {
    // no cash: every purchase is closed for want of a size
    const r = rig({ mode: "sombra", positions: [pos({ usd: 90 })], answer: (ids) => ({ posture: "defensiva", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const out = await createCycleRunner(r.deps).run();
    const buys = (out.view ?? []).filter((v) => v.kind === "buy");
    expect(buys.length).toBeGreaterThan(0);
    expect(buys.every((v) => typeof v.closed === "string" && v.closed.length > 0)).toBe(true);
    // a holding is never "closed"
    expect((out.view ?? []).filter((v) => v.kind === "holding").every((v) => v.closed === null)).toBe(true);
  });

  test("the record keeps what the model ASKED for before the rules touched it, next to what was done, plus its facets and a hash of the Brief it read", async () => {
    const r = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "exit_all" : "skip"])), profiles: {}, facets: Object.fromEntries(ids.map((id) => [id, { distribution: 0.7 }])), verdicts: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? { choice: "exit_all", probabilities: { hold: 0.35, trim_third: 0, trim_half: 0.23, exit_all: 0.42 }, confidence: null } : { choice: "skip", probabilities: { skip: 1 }, confidence: null }])) as never }) });
    const entries: { requested: Record<string, string>; stances: Record<string, string>; facets: Record<string, Record<string, number>>; briefHash: string; brief: { chaves: Record<string, string>; mandato: unknown } }[] = [];
    await createCycleRunner({ ...r.deps, onConsult: (e) => void entries.push(e as never) }).run();
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    const holdId = Object.keys(e.stances).find((id) => id.startsWith("hold:"))!;
    // asked to sell it all, and it is sold all: the median of its own spread no longer moderates a sale (the owner's decision of 2026-10-14)
    expect(e.requested[holdId]).toBe("exit_all");
    expect(e.stances[holdId]).toBe("exit_all");
    expect(e.facets[holdId]).toEqual({ distribution: 0.7 });
    expect(e.briefHash).toMatch(/^[0-9a-f]{16}$/);
    // what the rules did to the answer and whether the decision was valid, kept apart from what the model said
    const more = e as unknown as { briefVersion: number; notes: string[]; valid: boolean; invalidReason: string | null };
    expect(more.briefVersion).toBe(1);
    expect(more.notes).toEqual([]);
    expect(more.valid).toBe(true);
    expect(more.invalidReason).toBeNull();
    expect(Object.keys(e.brief.chaves).length).toBeGreaterThan(5);
    expect(e.brief).toHaveProperty("mandato");
  });

  test("the record keeps the optional key `execucoes` of the Brief only when the model read it (the layout stays version 1), and says which wording of the questions and of the legend was in force", async () => {
    const asks = (execFacts?: () => unknown) => {
      const r = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
      const entries: Record<string, unknown>[] = [];
      return createCycleRunner({ ...r.deps, ...(execFacts === undefined ? {} : { execFacts: execFacts as never }), onConsult: (e) => void entries.push(e as never) }).run().then(() => entries[0]!);
    };
    const none = await asks();
    expect(none.briefVersion).toBe(1);
    expect(Object.hasOwn(none.brief as object, "execucoes")).toBe(false);
    expect(none.criteria).toBe("rank-v1");
    expect(none.legend).toBe("scoped-v1");
    const exec = { voltas: 1, retorno: -0.44, ultimas: [{ s: "STONK", m: 16, p: -0.44 }], sem_entrada: 7, desconhecidas: 0 };
    const withFills = await asks(() => exec);
    expect(withFills.briefVersion).toBe(1);
    expect((withFills.brief as { execucoes?: unknown }).execucoes).toEqual(exec);
    // the hash is of the Brief as the model read it, so it differs when the key is there
    expect(withFills.briefHash).not.toBe(none.briefHash);
  });

  test("the model is told what each level of its mandate would open, counted by the code from the same candidates: the risk of the mandate no longer sizes a purchase, so every level opens the same, and a wallet with no cash opens nothing at any level", async () => {
    const E = [eco(`0x${"5".repeat(40)}`, "EEE")];
    const run = async (cashUsd: number) => {
      const r = rig({ mode: "sombra", positions: [cash(cashUsd), pos({ usd: 25 })], ecoFacts: E, answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
      const entries: { brief: { mandato: { abertas: Record<string, number> | null; agressivo_liberado: boolean } } }[] = [];
      await createCycleRunner({ ...r.deps, riskPct: () => 0.005, timingOf: async () => calm, mandate: () => ({ mandate: { risk: "cauteloso", reserve: "media", concentration: "media", look: "normal" }, aggressiveOpen: false }), onConsult: (e) => void entries.push(e as never) }).run();
      expect(entries).toHaveLength(1);
      return entries[0]!.brief.mandato;
    };
    const small = await run(100);
    expect(small.agressivo_liberado).toBe(false);
    // the cautious and the moderate level open the one purchase alike (the aggressive one is shown as 0 while the track record has not earned it)
    expect(small.abertas).toEqual({ cauteloso: 1, moderado: 1, agressivo: 0 });
    expect((await run(0)).abertas).toEqual({ cauteloso: 0, moderado: 0, agressivo: 0 });
  });

  test("the screen is given the same counts of what each level of the mandate opens", async () => {
    const E = [eco(`0x${"5".repeat(40)}`, "EEE")];
    const r = rig({ mode: "sombra", positions: [cash(100), pos({ usd: 25 })], ecoFacts: E, answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const out = await createCycleRunner({ ...r.deps, riskPct: () => 0.005, timingOf: async () => calm, mandate: () => ({ mandate: { risk: "cauteloso", reserve: "media", concentration: "media", look: "normal" }, aggressiveOpen: false }) }).run();
    expect(out.opened).toEqual({ cauteloso: 1, moderado: 1, agressivo: 0 });
    // without a mandate there is nothing to say
    const bare = await createCycleRunner(rig({ mode: "sombra", positions: [cash(100), pos({ usd: 25 })], ecoFacts: E }).deps).run();
    expect(bare.opened).toBeUndefined();
  });

  test("the screen is given how sure the model was of each candidate and what its narrow judgments said, so the decision can be read and not only its result", async () => {
    const r = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {}, facets: Object.fromEntries(ids.map((id) => [id, { distribution: 0.7149 }])), verdicts: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? { choice: "hold", probabilities: { hold: 0.5512, trim_third: 0.1, trim_half: 0.1, exit_all: 0.2488 }, confidence: null } : { choice: "skip", probabilities: { skip: 1 }, confidence: null }])) as never }) });
    const out = await createCycleRunner(r.deps).run();
    const hold = (out.view ?? []).find((v) => v.kind === "holding")!;
    expect(hold.probs).toEqual({ hold: 0.55, trim_third: 0.1, trim_half: 0.1, exit_all: 0.25 });
    expect(hold.facets).toEqual({ distribution: 0.71 });
    // a model that sent nothing leaves them null, never invented
    const plain = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const bare = await createCycleRunner(plain.deps).run();
    expect((bare.view ?? []).every((v) => v.probs === null && v.facets === null)).toBe(true);
  });

  describe("the risk level of the mandate does not gate a purchase (the owner's decision of 2026-10-14): whether there is something to decide depends on the cash of the network, not on the level", () => {
    const E = [eco(`0x${"5".repeat(40)}`, "EEE")];
    const asks = (risk: "cauteloso" | "moderado" | "agressivo", over: { cash?: number; aggressiveOpen?: boolean } = {}) => {
      // the only holding is worth nothing, so there is no holding to decide about: only the purchases are in question
      const r = rig({ mode: "sombra", positions: [cash(over.cash ?? 100), pos({ usd: 0 })], ecoFacts: E, answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
      const deps = { ...r.deps, riskPct: () => (risk === "cauteloso" ? 0.005 : risk === "moderado" ? 0.01 : 0.02), timingOf: async () => calm, mandate: () => ({ mandate: { risk, reserve: "media", concentration: "media", look: "normal" } as const, aggressiveOpen: over.aggressiveOpen ?? false }) };
      return { r, run: () => createCycleRunner(deps).run() };
    };

    test("at the cautious level, with cash on the network, the purchase is on offer and the model IS asked", async () => {
      const { r, run } = asks("cauteloso");
      const out = await run();
      expect(r.modelCalls).toBe(1);
      expect(out.consulted).toBe(true);
      expect(out.reason).not.toBe("nada_a_decidir");
      // the same purchase, in full: the smaller risk of the level took nothing from it
      expect(r.offered[`buy:token:1:${E[0]!.address}`]).toEqual(["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"]);
    });

    test("when the wallet holds no cash there is nothing to decide at any level and the model is not asked", async () => {
      for (const risk of ["cauteloso", "moderado", "agressivo"] as const) {
        const { r, run } = asks(risk, { cash: 0 });
        const out = await run();
        expect(r.modelCalls).toBe(0);
        expect(out).toMatchObject({ outcome: "mantido", reason: "nada_a_decidir" });
      }
    });

    test("at the moderate level there is a real choice and the model is asked as usual", async () => {
      const { r, run } = asks("moderado");
      await run();
      expect(r.modelCalls).toBe(1);
    });

    test("a level the measurement has not earned (aggressive, locked) changes nothing: the purchase is on offer all the same", async () => {
      const { r, run } = asks("agressivo", { aggressiveOpen: false });
      await run();
      expect(r.modelCalls).toBe(1);
      expect(r.offered[`buy:token:1:${E[0]!.address}`]).toEqual(["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"]);
    });
  });

  test("a purchase the code could not size is closed with a named reason the screen can tell apart: `sem_tamanho` when its network has no cash, `abaixo_do_minimo` when the cash is there but the smallest size is under the minimum order of the network", async () => {
    const answer = (ids: readonly string[]) => ({ posture: "defensiva", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} });
    const noCash = rig({ mode: "sombra", positions: [cash(0), pos({ usd: 10 })], answer });
    const a = await createCycleRunner({ ...noCash.deps, riskPct: () => 0.01, timingOf: async () => calm }).run();
    const noCashBuys = (a.view ?? []).filter((v) => v.kind === "buy");
    expect(noCashBuys.length).toBeGreaterThan(0);
    expect(noCashBuys.every((v) => v.closed === "sem_tamanho")).toBe(true);
    // 40 dollars of cash, a network whose minimum order is 50: even the whole of it is under the minimum
    const small = rig({ mode: "sombra", positions: [cash(40), pos({ usd: 10 })], answer });
    const b = await createCycleRunner({ ...small.deps, riskPct: () => 0.01, timingOf: async () => calm, minBuyUsd: () => 50 }).run();
    const smallBuys = (b.view ?? []).filter((v) => v.kind === "buy");
    expect(smallBuys.length).toBeGreaterThan(0);
    expect(smallBuys.every((v) => v.closed === "abaixo_do_minimo")).toBe(true);
    // a purchase with something on offer is not closed
    const ok = rig({ mode: "sombra", positions: [cash(40), pos({ usd: 10 })], answer });
    const c = await createCycleRunner({ ...ok.deps, riskPct: () => 0.01, timingOf: async () => calm }).run();
    expect((c.view ?? []).filter((v) => v.kind === "buy").every((v) => v.closed === null)).toBe(true);
  });

  test("the model is shown the purchases the code left OPEN first (up to five), then the closed ones up to seven in all: a wide pool is no use if the five shown are all closed", async () => {
    // the odd ones are on a network where the wallet holds no cash (closed), the even ones on the network that has it (open)
    const A9 = Array.from({ length: 9 }, (_, i) => { const e = eco(`0x${String(i + 3).padStart(40, "3")}`, `S${i}`); return i % 2 === 0 ? e : { ...e, chainIndex: "56", candidateId: `token:56:${e.address}` }; });
    const r = rig({ mode: "sombra", positions: [cash(1000), pos()], ecoFacts: A9, answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    await createCycleRunner(r.deps).run();
    const shown = r.shown[0]!.filter((id) => id.startsWith("buy:"));
    expect(shown).toHaveLength(7);
    const opened = shown.filter((id) => (r.offered[id] ?? []).length > 1);
    const closed = shown.filter((id) => (r.offered[id] ?? []).length <= 1);
    expect(opened).toHaveLength(5);
    expect(closed).toHaveLength(2);
    // the open ones come first
    expect(shown.slice(0, 5).every((id) => opened.includes(id))).toBe(true);
  });

  test("how sure the model was is kept with what it saw: its probabilities for each option, rounded, one entry per candidate it was sure or unsure about", async () => {
    const r = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {}, verdicts: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? { choice: "hold", probabilities: { hold: 0.5512, trim_third: 0.1, trim_half: 0.1, exit_all: 0.2488 }, confidence: null } : { choice: "skip", probabilities: { skip: 1 }, confidence: null }])) as never }) });
    const entries: { verdicts: Record<string, Record<string, number>> }[] = [];
    await createCycleRunner({ ...r.deps, onConsult: (e) => void entries.push(e as never) }).run();
    expect(entries).toHaveLength(1);
    const holdId = Object.keys(entries[0]!.verdicts).find((id) => id.startsWith("hold:"))!;
    expect(entries[0]!.verdicts[holdId]).toEqual({ hold: 0.55, trim_third: 0.1, trim_half: 0.1, exit_all: 0.25 });
  });

  test("what the model saw is kept WHOLE, so a decision can be rebuilt later: the Brief entry of every candidate, and for a purchase the ceiling the code worked out and which limit was the smallest", async () => {
    const r = rig({ mode: "sombra", positions: [cash(1000), pos()], answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const entries: { brief: { posicoes: Record<string, Record<string, unknown>>; compras: Record<string, Record<string, unknown>>; carteira: Record<string, unknown> }; candidates: { id: string; kind: string; cap?: { maxUsd: number; binding: string; sharePct: number | null } }[] }[] = [];
    await createCycleRunner({ ...r.deps, onConsult: (e) => void entries.push(e as never) }).run();
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    const buy = e.candidates.find((c) => c.kind === "buy")!;
    const hold = e.candidates.find((c) => c.kind === "holding")!;
    // the Brief as the model read it: the holding and the purchase, with their short keys
    expect(Object.keys(e.brief.posicoes)).toContain(hold.id);
    expect(Object.keys(e.brief.compras)).toContain(buy.id);
    expect(e.brief.compras[buy.id]).toMatchObject({ s: expect.any(String), o: expect.any(Array) });
    expect(e.brief.carteira).toHaveProperty("caixa");
    // the ceiling of the purchase and why: a number and the name of the limit that was the smallest
    expect(buy.cap).toMatchObject({ maxUsd: expect.any(Number), binding: expect.any(String) });
    // a holding has no ceiling
    expect(hold.cap).toBeUndefined();
  });

  test("a purchase passed over is measured EVEN when no size was on offer (no cash on that network, or the code closed it): the learning does not go blind exactly when the agent has nothing to spend", async () => {
    // all the money is in the holding: no dollars anywhere, so every candidate is offered `skip` and nothing else
    const r = rig({ mode: "sombra", positions: [pos({ usd: 90 })], answer: (ids) => ({ posture: "defensiva", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const out = await createCycleRunner(r.deps).run();
    const bought = (out.view ?? []).filter((v) => v.kind === "buy");
    expect(bought.length).toBeGreaterThan(0);
    const s = r.deps.scoreboard.summary(NOW);
    // the hold and every skipped purchase are on the board
    expect(s.inaction.decisions).toBe((out.view ?? []).length);
  });

  describe("the choice of the model is the size of a purchase: how sure it was is recorded and never held against a bar", () => {
    const buyAll = (size: string, verdicts?: (ids: readonly string[]) => Record<string, { choice: string; probabilities: Record<string, number> | null; confidence: number | null }>) => (ids: readonly string[]) => ({
      posture: "ofensiva",
      stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : size])),
      profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])),
      ...(verdicts === undefined ? {} : { verdicts: verdicts(ids) }),
    });
    const buysOf = (out: { orders: readonly { order: { side: string; stance: string; usd: number } }[] }) => out.orders.filter((o) => o.order.side === "buy");

    test("a strong answer and a weak one both keep the size they asked for, and the cycle reports no conviction note", async () => {
      const strong = rig({ mode: "limitado", answer: buyAll("buy_full", (ids) => Object.fromEntries(ids.filter((i) => i.startsWith("buy:")).map((i) => [i, { choice: "buy_full", probabilities: { buy_full: 0.95, skip: 0.05 }, confidence: null }]))) });
      const sOut = await createCycleRunner(strong.deps).run();
      expect(buysOf(sOut).map((o) => o.order.stance)).toEqual(["buy_full"]);
      const weak = rig({ mode: "limitado", answer: buyAll("buy_full", (ids) => Object.fromEntries(ids.filter((i) => i.startsWith("buy:")).map((i) => [i, { choice: "buy_full", probabilities: { buy_full: 0.55, skip: 0.45 }, confidence: null }]))) });
      const wOut = await createCycleRunner(weak.deps).run();
      expect(buysOf(wOut).map((o) => o.order.stance)).toEqual(["buy_full"]);
      expect(wOut.notes.some((n) => n.startsWith("conviccao_"))).toBe(false);
    });

    test("an answer with probabilities that are not a distribution is carried out as chosen too, with its conviction recorded as unknown", async () => {
      const r = rig({ mode: "limitado", answer: buyAll("buy_full", (ids) => Object.fromEntries(ids.filter((i) => i.startsWith("buy:")).map((i) => [i, { choice: "buy_full", probabilities: { buy_full: 0.8, skip: 0.8 }, confidence: 0.95 }]))) });
      const entries: Record<string, unknown>[] = [];
      const out = await createCycleRunner({ ...r.deps, onConsult: (e) => void entries.push(e as never) }).run();
      expect(buysOf(out).map((o) => o.order.stance)).toEqual(["buy_full"]);
      const g = (entries[0] as { gates: Record<string, { conviction: number | null; applied: string }> }).gates;
      expect(Object.values(g).every((x) => x.conviction === null && x.applied === "buy_full")).toBe(true);
    });

    test("an adapter that reads probabilities but got none: the purchase is carried out at the size asked, and the conviction is recorded as unknown, never invented", async () => {
      const r = rig({ mode: "limitado", answer: buyAll("buy_full", () => ({})) });
      const out = await createCycleRunner(r.deps).run();
      expect(buysOf(out).map((o) => o.order.stance)).toEqual(["buy_full"]);
      expect(out.notes.some((n) => n.startsWith("conviccao_"))).toBe(false);
    });

    test("a model that reports nothing about its conviction (no verdicts at all): the plain answer stands", async () => {
      const r = rig({ mode: "limitado", answer: buyAll("buy_full") });
      const out = await createCycleRunner(r.deps).run();
      expect(buysOf(out).map((o) => o.order.stance)).toEqual(["buy_full"]);
      expect(out.notes.some((n) => n.startsWith("conviccao_"))).toBe(false);
    });
  });

  test("a settlement made by whoever settles (the hook of the cycle) frees the token at once, the cycle says so, and the order keeps the balance it was sent against", async () => {
    const r = rig({ mode: "limitado", positions: [cash(1000), pos()], exec: () => ({ status: "incerta", reason: "tempo_esgotado" }), answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "trim_half" : "skip"])), profiles: {} }) });
    const first = await createCycleRunner(r.deps).run();
    expect(first.reason).toBe("ordem_incerta");
    const inflight = r.deps.ledger.inFlightRecords();
    expect(inflight).toHaveLength(1);
    // what the wallet held of the token when the order was sent is on the record (evidence for whoever looks the order up)
    expect(inflight[0]!.balanceBeforeMinor).toBe("1000000000000000000");
    let hookCalls = 0;
    const next = await createCycleRunner({
      ...r.deps,
      reconcile: () => {
        hookCalls++;
        return r.deps.ledger.inFlightRecords().filter((rec) => r.deps.ledger.resolve(rec.orderKey, "executada", NOW)).length;
      },
    }).run();
    expect(hookCalls).toBe(1);
    expect(next.notes).toContain("ordens_conciliadas");
    expect(r.deps.ledger.orderStage(inflight[0]!.orderKey)).toBe("executada");
    expect(r.deps.ledger.inFlightRecords().map((x) => x.orderKey)).not.toContain(inflight[0]!.orderKey);
  });

  test("an order in flight does not freeze the stop-loss of ANOTHER token, and the person can resolve it", async () => {
    const other = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 120 });
    const planB: PositionPlan = { key: planKey("1", B), chainIndex: "1", address: B, symbol: "BBB", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0" };
    const r = rig({ mode: "limitado", positions: [cash(1000), pos(), other], plans: [planB], prices: { [other.id]: 93 }, exec: (n) => (n === 2 ? { status: "incerta", reason: "tempo_esgotado" } : { status: "executada", ref: `ok${n}` }), answer: (ids) => ({ posture: "defensiva", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:token:1:" + A) ? "trim_half" : id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }) });
    const runner = createCycleRunner(r.deps);
    // first cycle: the stop of BBB goes out (protective first, call 1), then the model sells half of AAA and that one is uncertain (call 2)
    const first = await runner.run();
    expect(first.reason).toBe("ordem_incerta");
    expect(first.orders.map((o) => [o.order.symbol, o.stage])).toEqual([["BBB", "executada"], ["AAA", "incerta"]]);
    const inflight = r.deps.ledger.inFlightRecords();
    expect(inflight).toHaveLength(1);
    expect(inflight[0]!.symbol).toBe("AAA");
    // the next cycle: AAA is untouchable (no model order goes out), but the stop on the OTHER token still leaves
    const next = await runner.run();
    expect(next.orders.map((o) => o.order.symbol)).toEqual(["BBB"]);
    expect(next.orders.every((o) => o.order.source === "protecao")).toBe(true);
    expect(r.execCalls).toHaveLength(3);
    expect(r.deps.ledger.inFlight()).toHaveLength(1);
    // the person looked at their wallet history and says it went out: the block is lifted
    expect(r.deps.ledger.resolve(inflight[0]!.orderKey, "executada", NOW)).toBe(true);
    expect(r.deps.ledger.inFlight()).toEqual([]);
  });

  test("a stop that arrives in the middle of the cycle keeps the remaining orders from going out", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    const original = r.deps.executor!;
    const deps: CycleDeps = {
      ...r.deps,
      executor: {
        async execute(order, ctx) {
          const out = await original.execute(order, ctx);
          r.stopFile.present = true;
          return out;
        },
      },
    };
    const out = await createCycleRunner(deps).run();
    expect(r.execCalls).toHaveLength(1);
    expect(out.orders.map((o) => o.stage)).toEqual(["executada", "preparada"]);
    expect(out.reason).toBe("parado_no_ciclo");
  });

  test("the person lowering the mode in the middle of the cycle also stops it", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    const original = r.deps.executor!;
    const deps: CycleDeps = {
      ...r.deps,
      executor: {
        async execute(order, ctx) {
          const out = await original.execute(order, ctx);
          r.setMode("sombra");
          return out;
        },
      },
    };
    const out = await createCycleRunner(deps).run();
    expect(r.execCalls).toHaveLength(1);
    expect(out.reason).toBe("parado_no_ciclo");
  });

  test("the agent decides about the wallet it manages: a holding of another wallet it reads is not offered, and nothing is done about it", async () => {
    const r = rig({
      mode: "limitado",
      positions: [cash(1000), pos(), pos({ id: `token:1:${B}`, address: B, symbol: "PPP", wallet: "principal", usd: 300 })],
      answer: (ids) => ({ posture: "neutra", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "skip"])), profiles: {} }),
    });
    const out = await createCycleRunner(r.deps).run();
    expect((r.shown[0] ?? []).some((id) => id.endsWith("@principal"))).toBe(false);
    expect((r.shown[0] ?? []).some((id) => id.endsWith("@agente"))).toBe(true);
    expect(out.orders).toHaveLength(0);
    expect(r.execCalls).toHaveLength(0);
  });

  test("a ledger that cannot be written stops everything before the model's decision is acted on", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    let writes = 0;
    const ledger = createAgentLedger({
      read: () => [],
      append: () => {
        writes++;
        throw new Error("disk full");
      },
    });
    const out = await createCycleRunner({ ...r.deps, ledger }).run();
    expect(out.outcome).toBe("erro");
    expect(out.reason).toBe("ledger_nao_gravou");
    expect(r.execCalls).toHaveLength(0);
    expect(writes).toBeGreaterThan(0);
  });

  test("the daily cap counts what already went out, so the cycle after it cuts the purchase", async () => {
    const r = rig({ mode: "limitado", answer: (ids) => ({ posture: "ofensiva", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "buy_full"])), profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])) }) });
    const out = await createCycleRunner({ ...r.deps, caps: { maxBuyUsd: 25, maxDailyBuyUsd: 30, maxDailySellUsd: 500 } }).run();
    const bought = out.orders.filter((o) => o.order.side === "buy").reduce((s, o) => s + o.order.usd, 0);
    expect(bought).toBeLessThanOrEqual(25);
  });

  test("the money side without the facts it needs does not trade, but the agent goes on reading, deciding and measuring in the shadow, and says why", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    const out = await createCycleRunner({ ...r.deps, limitedFacts: async () => null }).run();
    expect(out).toMatchObject({ outcome: "decidido", mode: "sombra" });
    expect(out.notes).toEqual(expect.arrayContaining(["execucao_bloqueada", "conta_ilegivel"]));
    expect(out.orders.length).toBeGreaterThan(0);
    expect(out.orders.every((o) => o.stage === "preparada")).toBe(true);
    expect(r.execCalls).toHaveLength(0);
    expect(r.modelCalls).toBe(1);
  });

  test("every reason that is about the money side falls back to the shadow; one that is about reading or the clock still blocks", async () => {
    for (const bad of [{ binaryOk: false }, { addressMatches: false }, { policy: { perTxUsd: 900, dailyTradeUsd: 100, dailyTransferUsd: 0, transferGuarded: true } }, { sessionExpiresAtMs: NOW + 1000 }] as const) {
      const r = rig({ mode: "limitado", answer: sellAndBuy });
      const out = await createCycleRunner({ ...r.deps, limitedFacts: async () => ({ ...limitedOk, ...bad }) }).run();
      expect(out.mode).toBe("sombra");
      expect(out.notes).toContain("execucao_bloqueada");
      expect(r.execCalls).toHaveLength(0);
    }
    const clock = rig({ mode: "limitado", answer: sellAndBuy, clockSkewMs: 90_000 });
    expect(await createCycleRunner(clock.deps).run()).toMatchObject({ outcome: "bloqueado", reason: "relogio" });
  });
});

describe("the plans of the positions", () => {
  const held = pos();
  const key = planKey("1", A);
  const planned = (over: Partial<PositionPlan> = {}): PositionPlan => ({ key, chainIndex: "1", address: A, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0", ...over });
  const at = (price: number) => ({ [held.id]: price });
  const buyAnswer = (profile: string) => (ids: readonly string[]) => ({
    posture: "ofensiva",
    stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "buy_third"])),
    profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, profile])),
  });

  test("a stop is carried out by the code with no model at all, and the plan stays until the wallet shows the position gone", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(93) });
    const out = await createCycleRunner(r.deps).run();
    expect(r.modelCalls).toBe(0);
    expect(out).toMatchObject({ outcome: "decidido", reason: "sem_modelo", consulted: false });
    expect(out.orders).toHaveLength(1);
    expect(out.orders[0]).toMatchObject({ stage: "executada", order: { side: "sell", stance: "exit_all", source: "protecao", wallet: "agente" } });
    expect(r.execCalls.map((c) => c.stageAtCall)).toEqual(["enviando"]);
    // a transaction hash is not a balance: a reverted sale must leave the position with its stop
    expect(r.deps.plans.get(key)).toBeDefined();
  });

  test("the protective exit goes out BEFORE the model is asked, not after the model's long answer", async () => {
    const order: string[] = [];
    const r = rig({ mode: "limitado", plans: [planned()], prices: at(93), exec: () => (order.push("exec"), { status: "executada", ref: "x" }) });
    const slow: AgentModel = { name: "slow", estimateTokens: () => 100, choose: async ({ candidates }) => (order.push("model"), { raw: { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"])), profiles: {} }, usage: { inputTokens: 1, outputTokens: 1 } }) };
    await createCycleRunner({ ...r.deps, model: slow }).run();
    expect(order[0]).toBe("exec");
  });

  describe("the watch over the positions between the looks of the model", () => {
    const stopHit = () => ({ mode: "limitado" as const, plans: [planned()], positions: [cash(1000), pos({ priceUsd: 93 })] });

    test("a plan whose stop was hit is carried out by the guard alone: the model is not asked, the ecosystem is not read, and the order goes out", async () => {
      const r = rig({ ...stopHit(), exec: (n) => ({ status: "executada", ref: `ok${n}` }) });
      const out = await createCycleRunner(r.deps).guard();
      expect(out).not.toBeNull();
      expect(out!.orders.map((o) => [o.order.source, o.order.stance, o.stage])).toEqual([["protecao", "exit_all", "executada"]]);
      expect(r.modelCalls).toBe(0);
      expect(out!.consulted).toBe(false);
    });

    test("when nothing is demanded it leaves no trace: no cycle record, no report that replaces the last real cycle", async () => {
      const r = rig({ mode: "limitado", plans: [planned()], positions: [cash(1000), pos({ priceUsd: 100 })] });
      const runner = createCycleRunner(r.deps);
      const lines = () => r.deps.ledger.tail(50).length;
      const before = lines();
      const out = await runner.guard();
      expect(out).toMatchObject({ outcome: "mantido", orders: [] });
      expect(lines()).toBe(before);
      expect(runner.last()).toBeNull();
      expect(r.modelCalls).toBe(0);
    });

    test("with no plan to watch, or when the agent is only analysing, it does nothing at all (not even a read)", async () => {
      let reads = 0;
      const none = rig({ mode: "limitado", plans: [] });
      expect(await createCycleRunner({ ...none.deps, readBook: async () => (reads++, bookOf([cash(1000), pos()])) }).guard()).toMatchObject({ outcome: "mantido", reason: "sem_vigilancia" });
      const shadow = rig({ mode: "sombra", plans: [planned()], positions: [cash(1000), pos({ priceUsd: 93 })] });
      expect(await createCycleRunner({ ...shadow.deps, readBook: async () => (reads++, bookOf([cash(1000), pos()])) }).guard()).toMatchObject({ outcome: "mantido", reason: "sem_vigilancia" });
      expect(reads).toBe(0);
    });

    test("it never overlaps a cycle in flight, and the order of the exit it sends is a real one: recorded before and after like any other", async () => {
      const r = rig({ ...stopHit(), exec: (n) => ({ status: "executada", ref: `ok${n}` }) });
      const runner = createCycleRunner(r.deps);
      const guard = runner.guard();
      const second = await runner.guard();
      expect(second).toMatchObject({ outcome: "bloqueado", reason: "ja_em_andamento" });
      await guard;
      const stages = r.deps.ledger.tail(50).filter((x) => x.kind === "order").map((x) => (x as { stage: string }).stage);
      expect(stages).toEqual(["preparada", "enviando", "executada"]);
    });

    test("a money side that is not ready, or a stop file, keeps the guard from sending anything", async () => {
      const r = rig({ ...stopHit(), exec: () => ({ status: "executada", ref: "x" }) });
      const out = await createCycleRunner({ ...r.deps, limitedFacts: async () => null }).guard();
      expect(out).toMatchObject({ outcome: "mantido", reason: "sem_vigilancia" });
      expect(r.execCalls).toHaveLength(0);
    });
  });

  test("the half taken at the target is marked on the plan before the slow mark of the Placar: a crash while the mark waits for a price does not take the half twice", async () => {
    const taken: boolean[] = [];
    const r = rig({ mode: "limitado", plans: [planned()], prices: at(112), exec: () => ({ status: "executada", ref: "x" }) });
    const slowMark: typeof r.deps.scoreboard = {
      ...r.deps.scoreboard,
      mark: () => {
        taken.push(r.deps.plans.get(key)!.trimmed);
      },
    };
    const out = await createCycleRunner({ ...r.deps, scoreboard: slowMark }).run();
    expect(out.orders.some((o) => o.order.stance === "trim_half" && o.stage === "executada")).toBe(true);
    // at the moment the Placar was asked to mark it, the plan already said the half was taken
    expect(taken[0]).toBe(true);
  });

  test("an unsettled order on a token holds that token's exit however old it is, and after a restart too: no receipt is not proof that the first one ended, and a second sale would be a second financial intent", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(93), exec: (n) => (n === 1 ? { status: "incerta", reason: "tempo_esgotado" } : { status: "executada", ref: `ok${n}` }) });
    const first = await createCycleRunner(r.deps).run();
    expect(first.orders.map((o) => [o.order.stance, o.stage])).toEqual([["exit_all", "incerta"]]);
    const fresh = (later: number) => ({ ...r.deps, now: () => later, readBook: async () => bookOf([cash(1000), pos({ priceUsd: 93 })], later - 1000) });
    for (const minutes of [1, 4, 30, 24 * 60]) {
      expect((await createCycleRunner(fresh(NOW + minutes * 60_000)).run()).orders).toEqual([]);
      // (a new runner is a restart: nothing is remembered but the ledger)
      expect((await createCycleRunner(fresh(NOW + minutes * 60_000)).guard()).orders).toEqual([]);
    }
    expect(r.execCalls).toHaveLength(1);
    expect(r.deps.ledger.inFlight()).toHaveLength(1);
  });

  test("what frees the exit is a proof: a receipt that says the first one FAILED (or the person's word that it did not leave), and then the stop goes out", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(93), exec: (n) => (n === 1 ? { status: "incerta", reason: "tempo_esgotado" } : { status: "executada", ref: `ok${n}` }) });
    await createCycleRunner(r.deps).run();
    const held = r.deps.ledger.inFlightRecords()[0]!;
    const later = NOW + 5 * 60_000;
    const fresh = { ...r.deps, now: () => later, readBook: async () => bookOf([cash(1000), pos({ priceUsd: 93 })], later - 1000) };
    expect((await createCycleRunner(fresh).run()).orders).toEqual([]);
    expect(r.deps.ledger.resolve(held.orderKey, "falhou", later, "recibo_erro")).toBe(true);
    expect((await createCycleRunner(fresh).run()).orders.map((o) => [o.order.source, o.order.stance, o.stage])).toEqual([["protecao", "exit_all", "executada"]]);
    expect(r.execCalls).toHaveLength(2);
  });

  test("the half at the target is not repeated while an order on that token is unsettled, however old", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(112), exec: (n) => (n === 1 ? { status: "incerta", reason: "tempo_esgotado" } : { status: "executada", ref: `ok${n}` }) });
    const first = await createCycleRunner(r.deps).run();
    expect(first.orders.map((o) => [o.order.stance, o.stage])).toEqual([["trim_half", "incerta"]]);
    const later = NOW + 30 * 60_000;
    const late = await createCycleRunner({ ...r.deps, now: () => later, readBook: async () => bookOf([cash(1000), pos({ priceUsd: 112 })], later - 1000) }).run();
    expect(late.orders).toEqual([]);
    expect(r.execCalls).toHaveLength(1);
  });

  test("a transmitted order (broadcast, hash in hand) is not an executed one: it is held in flight with its hash, the cycle goes on to the next order, and nothing that needs the sale to be real is done yet", async () => {
    const other = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 120 });
    const planB: PositionPlan = { key: planKey("1", B), chainIndex: "1", address: B, symbol: "BBB", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0" };
    const hash = (n: number) => "0x" + String(n).repeat(64);
    const r = rig({ mode: "limitado", noModel: true, positions: [cash(1000), pos(), other], plans: [planned(), planB], prices: { [held.id]: 93, [other.id]: 93 }, exec: (n) => ({ status: "transmitida", ref: hash(n) }) });
    const out = await createCycleRunner(r.deps).run();
    // BOTH stops were sent: a broadcast does not stop the cycle the way an unanswered order does
    expect(r.execCalls).toHaveLength(2);
    expect(out.orders.map((o) => [o.order.symbol, o.stage, o.reason]).sort()).toEqual([["AAA", "incerta", "transmitida"], ["BBB", "incerta", "transmitida"]]);
    // in flight, with the hash it was sent under: the receipt will settle it
    const flying = r.deps.ledger.inFlightRecords();
    expect(flying.map((x) => [x.symbol, x.stage, x.reason]).sort()).toEqual([["AAA", "incerta", "transmitida"], ["BBB", "incerta", "transmitida"]]);
    expect(new Set(flying.map((x) => x.ref))).toEqual(new Set([hash(1), hash(2)]));
    // and the next look does not touch those tokens again
    const next = await createCycleRunner(r.deps).run();
    expect(next.orders).toEqual([]);
    expect(r.execCalls).toHaveLength(2);
    // a receipt that says it landed settles it
    const first = flying.find((x) => x.symbol === "AAA")!;
    expect(r.deps.ledger.resolve(first.orderKey, "executada", NOW, "recibo_sucesso")).toBe(true);
    expect(r.deps.ledger.inFlightRecords().map((x) => x.symbol)).toEqual(["BBB"]);
  });

  test("an exit above the owner's per-transaction limit goes in parts: each part fits the limit, the next waits for the receipt of the one before, and the last one is the rest", async () => {
    // 120 dollars of AAA (1 token = 120 dollars at 18 decimals), a plan whose stop was hit, a limit of 50 per transaction
    const big = pos({ usd: 120, priceUsd: 93, balanceMinor: "1000000000000000000" });
    const policy: LimitedFacts = { ...limitedOk, policy: { perTxUsd: 50, dailyTradeUsd: 200, dailyTransferUsd: 0, transferGuarded: true } };
    const r = rig({ mode: "limitado", noModel: true, positions: [cash(1000), big], plans: [planned()], prices: at(93), exec: (n) => ({ status: "transmitida", ref: "0x" + String(n).repeat(64) }) });
    const deps = (balance: string, usd: number, later: number) => ({ ...r.deps, now: () => later, limitedFacts: async () => policy, readBook: async () => bookOf([cash(1000), pos({ usd, priceUsd: 93, balanceMinor: balance })], later - 1000) });
    const first = await createCycleRunner(deps("1000000000000000000", 120, NOW)).run();
    expect(first.orders.map((o) => [o.order.stance, o.order.usd, o.order.amountMinor, o.stage])).toEqual([["exit_all", 47, "391666666666666666", "incerta"]]);
    // the part is in flight: nothing else goes out over that token, whatever the time
    expect((await createCycleRunner(deps("1000000000000000000", 120, NOW + 5 * 60_000)).run()).orders).toEqual([]);
    expect(r.execCalls).toHaveLength(1);
    // the receipt says the part landed, the book shows what is left: the next part is cut again from THAT balance
    expect(r.deps.ledger.resolve(r.deps.ledger.inFlightRecords()[0]!.orderKey, "executada", NOW + 6 * 60_000, "recibo_sucesso")).toBe(true);
    const second = await createCycleRunner(deps("608333333333333334", 73, NOW + 7 * 60_000)).run();
    expect(second.orders.map((o) => [o.order.usd, o.stage])).toEqual([[47, "incerta"]]);
    expect(r.deps.ledger.resolve(r.deps.ledger.inFlightRecords()[0]!.orderKey, "executada", NOW + 8 * 60_000, "recibo_sucesso")).toBe(true);
    // what is left fits the limit: it goes whole
    const last = await createCycleRunner(deps("216666666666666667", 26, NOW + 9 * 60_000)).run();
    expect(last.orders.map((o) => [o.order.stance, o.order.usd, o.order.amountMinor])).toEqual([["exit_all", 26, "216666666666666667"]]);
  });

  describe("the half at the target, cut into parts by the owner's limit, adds up to the half and no more (A1.10)", () => {
    const INITIAL = 1_000_000_000_000_000_000n;
    const limit50: LimitedFacts = { ...limitedOk, policy: { perTxUsd: 50, dailyTradeUsd: 200, dailyTransferUsd: 0, transferGuarded: true } };
    const start = () => {
      const r = rig({ mode: "limitado", noModel: true, plans: [planned({ entryAtMs: NOW })], positions: [cash(1000), pos({ usd: 120, priceUsd: 112, balanceMinor: INITIAL.toString() })], prices: at(112), exec: (n) => ({ status: "transmitida", ref: "0x" + String(n).repeat(64) }) });
      const deps = (balance: bigint, usd: number, later: number) => ({ ...r.deps, now: () => later, limitedFacts: async () => limit50, readBook: async () => bookOf([cash(1000), pos({ usd, priceUsd: 112, balanceMinor: balance.toString() })], later - 1000) });
      return { r, deps };
    };
    const confirm = (r: ReturnType<typeof start>["r"], at: number) => expect(r.deps.ledger.resolve(r.deps.ledger.inFlightRecords()[0]!.orderKey, "executada", at, "recibo_sucesso")).toBe(true);

    test("the second part is what is LEFT of the first half, not half of what is left: the parts add up to exactly the half", async () => {
      const { r, deps } = start();
      const first = await createCycleRunner(deps(INITIAL, 120, NOW)).run();
      const a = BigInt(first.orders[0]!.order.amountMinor!);
      expect(first.orders[0]!.order.stance).toBe("trim_half");
      expect(a).toBeLessThan(INITIAL / 2n);
      confirm(r, NOW + 60_000);
      const second = await createCycleRunner(deps(INITIAL - a, 73, NOW + 5 * 60_000)).run();
      const b = BigInt(second.orders[0]!.order.amountMinor!);
      expect(a + b).toBe(INITIAL / 2n);
      confirm(r, NOW + 6 * 60_000);
      // the half is complete: the plan says so and nothing more is sent for it
      const third = await createCycleRunner(deps(INITIAL - a - b, 60, NOW + 10 * 60_000)).run();
      expect(third.orders).toEqual([]);
      expect(r.deps.plans.get(key)!.trimmed).toBe(true);
      expect(r.execCalls).toHaveLength(2);
    });

    test("a deposit that arrives between the parts does not change the target (it is an amount, not a share of the balance), and neither does a restart", async () => {
      const { r, deps } = start();
      const first = await createCycleRunner(deps(INITIAL, 120, NOW)).run();
      const a = BigInt(first.orders[0]!.order.amountMinor!);
      confirm(r, NOW + 60_000);
      // another half token was sent to the wallet by the person; a new runner is a restart (only the ledger is remembered)
      const second = await createCycleRunner(deps(INITIAL - a + INITIAL / 2n, 110, NOW + 5 * 60_000)).run();
      expect(a + BigInt(second.orders[0]!.order.amountMinor!)).toBe(INITIAL / 2n);
    });

    test("when the wallet holds less than what is left (the person took some out), the part is what the wallet holds", async () => {
      const { r, deps } = start();
      await createCycleRunner(deps(INITIAL, 120, NOW)).run();
      confirm(r, NOW + 60_000);
      const second = await createCycleRunner(deps(50_000_000_000_000_000n, 6, NOW + 5 * 60_000)).run();
      expect(second.orders[0]!.order.amountMinor).toBe("50000000000000000");
    });

    test("a first part that failed cleanly sold nothing: the half is worked out afresh from what the wallet holds, and it is not left stuck", async () => {
      const r = rig({ mode: "limitado", noModel: true, plans: [planned({ entryAtMs: NOW })], positions: [cash(1000), pos({ usd: 120, priceUsd: 112, balanceMinor: INITIAL.toString() })], prices: at(112), exec: (n) => (n === 1 ? { status: "falhou", reason: "quote_recusada" } : { status: "transmitida", ref: "0x" + String(n).repeat(64) }) });
      const later = NOW + 5 * 60_000;
      const deps = { ...r.deps, limitedFacts: async () => limit50 };
      await createCycleRunner(deps).run();
      const again = await createCycleRunner({ ...deps, now: () => later, readBook: async () => bookOf([cash(1000), pos({ usd: 120, priceUsd: 112, balanceMinor: INITIAL.toString() })], later - 1000) }).run();
      expect(again.orders.map((o) => [o.order.stance, o.order.amountMinor, o.stage])).toEqual([["trim_half", "391666666666666666", "incerta"]]);
    });
  });

  test("what the tool said about a refusal that proved nothing is kept on the unsettled order, for the person who has to judge it", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(93), exec: () => ({ status: "incerta", reason: "recusa_sem_prova", detail: "swap simulation failed" }) });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => [o.stage, o.reason, o.detail])).toEqual([["incerta", "recusa_sem_prova", "swap simulation failed"]]);
    expect(r.deps.ledger.inFlightRecords().map((x) => x.detail)).toEqual(["swap simulation failed"]);
  });

  test("the half taken at the target is NOT marked taken by a broadcast: only the receipt that proves it does", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(112), exec: () => ({ status: "transmitida", ref: "0x" + "4".repeat(64) }) });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => [o.order.stance, o.stage])).toEqual([["trim_half", "incerta"]]);
    expect(r.deps.plans.get(key)!.trimmed).toBe(false);
  });

  test("the stop of a plan goes out even with no model at all: protecting what is held does not depend on the model key", async () => {
    const sent: string[] = [];
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(93), exec: () => (sent.push("exec"), { status: "executada", ref: "x" }) });
    const out = await createCycleRunner(r.deps).run();
    expect(sent).toEqual(["exec"]);
    expect(out.orders.some((o) => o.order.source === "protecao" && o.stage === "executada")).toBe(true);
  });

  test("a plan is closed only after the wallet has shown the position gone for a whole hour, not on one reading", async () => {
    // an old plan and the first reading without the position: the absence starts counting, nothing closes
    const first = rig({ mode: "sombra", noModel: true, plans: [planned({ entryAtMs: NOW - 10 * HOUR })], positions: [cash(1000)] });
    await createCycleRunner(first.deps).run();
    expect(first.deps.plans.get(key)).toMatchObject({ goneSinceMs: NOW });
    // gone for 30 minutes: still kept
    const half = rig({ mode: "sombra", noModel: true, plans: [planned({ entryAtMs: NOW - 10 * HOUR, goneSinceMs: NOW - 30 * 60_000 })], positions: [cash(1000)] });
    await createCycleRunner(half.deps).run();
    expect(half.deps.plans.get(key)).toBeDefined();
    // gone for more than an hour: closed
    const late = rig({ mode: "sombra", noModel: true, plans: [planned({ entryAtMs: NOW - 10 * HOUR, goneSinceMs: NOW - 61 * 60_000 })], positions: [cash(1000)] });
    const out = await createCycleRunner(late.deps).run();
    expect(late.deps.plans.get(key)).toBeUndefined();
    expect(out.notes).toContain("plano_orfao");
  });

  test("a reading that has the position back clears the absence: a token the provider dropped for a moment keeps its stop", async () => {
    const back = rig({ mode: "sombra", noModel: true, plans: [planned({ goneSinceMs: NOW - 90 * 60_000 })], positions: [cash(1000), pos()] });
    await createCycleRunner(back.deps).run();
    expect(back.deps.plans.get(key)).toBeDefined();
    expect(back.deps.plans.get(key)?.goneSinceMs).toBeNull();
  });

  test("a token the provider flags as risk has not left the wallet: its plan is not an orphan", async () => {
    const book: Book = { ...bookOf([cash(1000)]), flaggedKeys: [key] };
    const r = rig({ mode: "sombra", noModel: true, plans: [planned({ goneSinceMs: NOW - 5 * HOUR })], book });
    const out = await createCycleRunner(r.deps).run();
    expect(r.deps.plans.get(key)).toBeDefined();
    expect(out.notes).toContain("token_marcado_risco");
  });

  test("the exit of a plan goes out even when the position is worth less than the minimum order, or has no price at all", async () => {
    const small = rig({ mode: "limitado", noModel: true, plans: [planned()], positions: [cash(1000), pos({ usd: 9.6 })], prices: at(55) });
    const a = await createCycleRunner(small.deps).run();
    expect(a.orders).toHaveLength(1);
    expect(a.orders[0]).toMatchObject({ stage: "executada", order: { source: "protecao", stance: "exit_all", usd: 9.6 } });
    // no value from the provider at all, and the time is up
    const blind = rig({ mode: "limitado", noModel: true, plans: [planned({ entryAtMs: NOW - 80 * HOUR })], positions: [cash(1000), pos({ usd: null })] });
    const b = await createCycleRunner(blind.deps).run();
    expect(b.orders).toHaveLength(1);
    expect(b.orders[0]).toMatchObject({ stage: "executada", order: { source: "protecao", stance: "exit_all", usd: 0 } });
    expect(blind.execCalls).toHaveLength(1);
  });

  test("buying a token whose old plan has no position any more starts from a clean plan, not the stale entry", async () => {
    const stale = planned({ key: planKey("1", B), chainIndex: "1", address: B, symbol: "BBB", entryPriceUsd: 9, entryAtMs: NOW - 10 * HOUR });
    const r = rig({ mode: "limitado", plans: [stale], answer: buyAnswer("alvo_5") });
    await createCycleRunner(r.deps).run();
    expect(r.deps.plans.get(planKey("1", B))).toMatchObject({ entryPriceUsd: 0.5, profile: "alvo_5", entryAtMs: NOW });
  });

  test("a position whose size cannot be read is still held: a purchase does not throw its plan away", async () => {
    const blind = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 60, balanceMinor: null });
    const existing = planned({ key: planKey("1", B), chainIndex: "1", address: B, symbol: "BBB", entryPriceUsd: 0.4, entryAtMs: NOW - 2 * HOUR });
    const r = rig({ mode: "limitado", positions: [cash(1000), blind], plans: [existing], answer: buyAnswer("alvo_5") });
    await createCycleRunner(r.deps).run();
    expect(r.deps.plans.get(planKey("1", B))).toMatchObject({ entryPriceUsd: 0.4, profile: "alvo_10" });
  });

  test("a clean failure of the exit of a plan does not freeze the cycle: the model is still asked about everything else", async () => {
    const r = rig({ mode: "limitado", plans: [planned()], prices: at(93), exec: () => ({ status: "falhou", reason: "impacto_alto" }) });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => [o.order.source, o.stage])).toContainEqual(["protecao", "falhou"]);
    expect(out.notes).toContain("saida_do_plano_falhou");
    expect(r.modelCalls).toBe(1);
    // the token whose exit failed is not offered to the model (the exit is the plan's, and it is tried again next cycle)
    expect((r.shown[0] ?? []).some((id) => id.includes(A))).toBe(false);
  });

  test("the exits of a plan go out before the ecosystem is read", async () => {
    const order: string[] = [];
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(93), exec: () => (order.push("exec"), { status: "executada", ref: "x" }) });
    const slow = { ...r.deps, ecosystem: async (saldo: Parameters<CycleDeps["ecosystem"]>[0]) => (order.push("ecosystem"), { observedAtMs: NOW, saldo, candidates: [], excluded: {} }) };
    await createCycleRunner(slow).run();
    expect(order).toEqual(["exec", "ecosystem"]);
  });

  test("a failed facts step still lets a stop see the price the balance came with", async () => {
    const down = rig({ mode: "limitado", noModel: true, plans: [planned()], positions: [cash(1000), pos({ priceUsd: 60 })] });
    const out = await createCycleRunner({ ...down.deps, holdingFacts: async () => { throw new Error("gateway"); } }).run();
    expect(out.notes).toContain("fatos_indisponiveis");
    expect(out.orders).toHaveLength(1);
    expect(out.orders[0]).toMatchObject({ order: { source: "protecao", stance: "exit_all" }, stage: "executada" });
  });

  test("a second purchase of a token that is still held keeps the plan it already has", async () => {
    const heldB = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 60 });
    const existing = planned({ key: planKey("1", B), chainIndex: "1", address: B, symbol: "BBB", entryPriceUsd: 0.4, entryAtMs: NOW - 2 * HOUR });
    const r = rig({ mode: "limitado", positions: [cash(1000), heldB], plans: [existing], answer: buyAnswer("alvo_5") });
    await createCycleRunner(r.deps).run();
    expect(r.deps.plans.get(planKey("1", B))).toMatchObject({ entryPriceUsd: 0.4, profile: "alvo_10" });
  });

  test("a stop leaves even when the budget is spent and the daily sale cap is already used", async () => {
    const r = rig({ mode: "limitado", plans: [planned()], prices: at(93), limits: { maxConsultsPerDay: 1, maxTokensPerDay: null } });
    r.deps.budget.begin(1);
    const out = await createCycleRunner({ ...r.deps, caps: { ...DEFAULT_CAPS, maxDailySellUsd: 10 } }).run();
    expect(out.orders.map((o) => o.stage)).toEqual(["executada"]);
    expect(out.reason).toBe("consultas_esgotadas");
    expect(out.dropped).toEqual([]);
  });

  test("the target takes half, once: the plan is marked and the next cycle does not repeat it", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()], prices: at(111) });
    const runner = createCycleRunner(r.deps);
    const first = await runner.run();
    expect(first.orders[0]).toMatchObject({ stage: "executada", order: { stance: "trim_half", source: "protecao" } });
    expect(r.deps.plans.get(key)).toMatchObject({ trimmed: true, targetHit: true });
    const second = await runner.run();
    expect(second.orders).toHaveLength(0);
    expect(r.execCalls).toHaveLength(1);
  });

  test("in shadow mode the exit is only prepared, measured, and the plan stays", async () => {
    const r = rig({ mode: "sombra", noModel: true, plans: [planned()], prices: at(93) });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => [o.order.source, o.stage])).toEqual([["protecao", "preparada"]]);
    expect(r.execCalls).toHaveLength(0);
    expect(r.deps.plans.get(key)).toBeDefined();
    expect(r.deps.scoreboard.summary(NOW).decisions).toBe(1);
  });

  test("a holding whose fate the plan decided is not offered to the model", async () => {
    const r = rig({ mode: "limitado", plans: [planned()], prices: at(93) });
    await createCycleRunner(r.deps).run();
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0]!.some((id) => id.startsWith("hold:"))).toBe(false);
  });

  test("a holding inside its plan is offered, with its plan in view", async () => {
    const r = rig({ mode: "sombra", plans: [planned()], prices: at(103) });
    const out = await createCycleRunner(r.deps).run();
    expect(r.shown[0]!.some((id) => id.startsWith("hold:"))).toBe(true);
    expect(out.considered).toMatchObject({ holdings: 1, protected: 0 });
  });

  test("a price the code cannot see means the plan does nothing, and says so", async () => {
    const r = rig({ mode: "limitado", noModel: true, plans: [planned()] });
    const out = await createCycleRunner({ ...r.deps, holdingFacts: async () => () => null }).run();
    expect(out.orders).toEqual([]);
    expect(out.notes).toContain("protecao_sem_preco");
  });

  test("a purchase opens its plan with the profile the model chose and the price of the decision", async () => {
    const r = rig({ mode: "limitado", answer: buyAnswer("alvo_10") });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders.map((o) => o.stage)).toEqual(["executada"]);
    expect(r.deps.plans.get(planKey("1", B))).toMatchObject({ profile: "alvo_10", entryPriceUsd: 0.5, targetHit: false, trimmed: false, symbol: "BBB" });
  });

  test("the price the signing tool filled at replaces the price of the decision", async () => {
    const r = rig({ mode: "limitado", exec: () => ({ status: "executada", ref: "x", priceUsd: 0.52 }), answer: buyAnswer("alvo_5") });
    await createCycleRunner(r.deps).run();
    expect(r.deps.plans.get(planKey("1", B))?.entryPriceUsd).toBe(0.52);
  });

  test("a full exit chosen by the model leaves the plan to the wallet too", async () => {
    const r = rig({
      mode: "limitado",
      plans: [planned()],
      prices: at(103),
      answer: (ids) => ({ posture: "defensiva", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "exit_all" : "skip"])), profiles: {} }),
    });
    const out = await createCycleRunner(r.deps).run();
    expect(out.orders[0]).toMatchObject({ stage: "executada", order: { source: "modelo", stance: "exit_all" } });
    expect(r.deps.plans.get(key)).toBeDefined();
  });

  test("a plan that cannot be saved means the purchase is NOT sent: no position without its stop", async () => {
    const r = rig({ mode: "limitado", answer: buyAnswer("alvo_5") });
    const failing = createPlanStore({
      read: () => null,
      write: () => {
        throw new Error("disk");
      },
    });
    const out = await createCycleRunner({ ...r.deps, plans: failing }).run();
    expect(r.execCalls).toHaveLength(0);
    expect(out.orders[0]).toMatchObject({ stage: "falhou", reason: "plano_nao_gravou" });
    expect(out.notes).toContain("plano_nao_gravou");
  });

  test("a purchase that fails leaves no plan behind", async () => {
    const r = rig({ mode: "limitado", answer: buyAnswer("alvo_5"), exec: () => ({ status: "falhou", reason: "impacto_alto" }) });
    await createCycleRunner(r.deps).run();
    expect(r.deps.plans.get(planKey("1", B))).toBeUndefined();
  });

  test("an uncertain purchase keeps its plan: the position may exist", async () => {
    const r = rig({ mode: "limitado", answer: buyAnswer("alvo_5"), exec: () => ({ status: "incerta", reason: "tempo_esgotado" }) });
    await createCycleRunner(r.deps).run();
    expect(r.deps.plans.get(planKey("1", B))).toBeDefined();
  });

  test("the plan's entry is a fresh read of the price, not the price of a scan that may be half an hour old", async () => {
    const r = rig({ mode: "limitado", answer: buyAnswer("alvo_5") });
    const asked: string[] = [];
    await createCycleRunner({ ...r.deps, freshPrice: async (chain, address) => (asked.push(`${chain}:${address}`), 0.8) }).run();
    expect(asked).toContain(`1:${B}`);
    expect(r.deps.plans.get(planKey("1", B))?.entryPriceUsd).toBe(0.8);
  });

  test("a fresh price that cannot be read falls back to the scan's, and the Placar uses the fresh one when it has it", async () => {
    const r = rig({ mode: "sombra", answer: buyAnswer("alvo_5") });
    await createCycleRunner({ ...r.deps, freshPrice: async () => 0.7 }).run();
    const s = r.deps.scoreboard.summary(NOW);
    expect(s.decisions).toBe(1);
    const down = rig({ mode: "limitado", answer: buyAnswer("alvo_5") });
    await createCycleRunner({ ...down.deps, freshPrice: async () => { throw new Error("provider"); } }).run();
    expect(down.deps.plans.get(planKey("1", B))?.entryPriceUsd).toBe(0.5);
  });

  test("a purchase with no price to enter at, fresh or scanned, is not sent", async () => {
    const r = rig({ mode: "limitado", answer: buyAnswer("alvo_5"), ecoFacts: [{ ...eco(B, "BBB"), priceUsd: null }], timing: null });
    const out = await createCycleRunner(r.deps).run();
    expect(r.execCalls).toHaveLength(0);
    expect(out.orders.every((o) => o.stage !== "enviando" && o.stage !== "executada")).toBe(true);
  });

  test("the STOP file is read before anything is read or asked, and the executor sees the stop between the quote and the swap", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    let probe: (() => boolean) | undefined;
    const deps: CycleDeps = {
      ...r.deps,
      executor: {
        async execute(_order, ctx) {
          probe = ctx.shouldStop;
          return { status: "executada", ref: "x" };
        },
      },
    };
    r.stopFile.present = true;
    expect((await createCycleRunner(deps).run()).reason).toBe("arquivo_stop");
    expect(r.modelCalls).toBe(0);
    r.stopFile.present = false;
    await createCycleRunner({ ...deps, newId: () => "second" }).run();
    expect(probe?.()).toBe(false);
    r.stopFile.present = true;
    expect(probe?.()).toBe(true);
  });

  test("another process holding the folder means no cycle here, and nothing is read", async () => {
    const r = rig({ mode: "limitado", answer: sellAndBuy });
    const out = await createCycleRunner({ ...r.deps, canRun: () => "outra_instancia" }).run();
    expect(out).toMatchObject({ outcome: "bloqueado", reason: "outra_instancia" });
    expect(r.modelCalls).toBe(0);
    expect(r.execCalls).toHaveLength(0);
  });

  test("a protective sale and a model purchase of the same token do not happen in one cycle", async () => {
    const r = rig({ mode: "sombra", noModel: false, plans: [planned()], prices: at(93), ecoFacts: [eco(A, "AAA")], answer: buyAnswer("alvo_5") });
    const out = await createCycleRunner(r.deps).run();
    // the token is leaving by the plan: it is not offered as a purchase, and no purchase order of it is planned
    expect((r.shown[0] ?? []).some((id) => id.startsWith("buy:") && id.includes(A))).toBe(false);
    expect(out.orders.filter((o) => o.order.side === "buy" && o.order.address === A)).toEqual([]);
    expect(out.orders.some((o) => o.order.side === "sell" && o.order.source === "protecao")).toBe(true);
  });

  test("unreadable plans keep the agent from trading (a position without its stop is not opened), and it goes on in the shadow", async () => {
    const broken = createPlanStore({ read: () => ({ junk: true }), write: () => {} });
    const live = rig({ mode: "limitado" });
    const out = await createCycleRunner({ ...live.deps, plans: broken }).run();
    expect(out.mode).toBe("sombra");
    expect(out.notes).toEqual(expect.arrayContaining(["execucao_bloqueada", "planos_ilegiveis"]));
    expect(live.execCalls).toHaveLength(0);
    const shadow = rig({ mode: "sombra" });
    expect((await createCycleRunner({ ...shadow.deps, plans: broken }).run()).reason).not.toBe("planos_ilegiveis");
  });

  test("the circuit breaker: with new purchases paused the model is not offered a purchase, and what is held is still managed", async () => {
    const r = rig({ mode: "limitado", answer: (ids) => ({ posture: "ofensiva", stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "trim_half" : "buy_third"])), profiles: Object.fromEntries(ids.filter((id) => id.startsWith("buy:")).map((id) => [id, "alvo_5"])) }) });
    const out = await createCycleRunner({ ...r.deps, buyingPaused: () => true }).run();
    expect(out.notes).toContain("compras_pausadas");
    expect((r.shown[0] ?? []).some((id) => id.startsWith("buy:"))).toBe(false);
    expect(out.orders.map((o) => o.order.side)).toEqual(["sell"]);
  });
});

describe("a slow reading of the facts", () => {
  test("hands back what it has at the soft deadline instead of throwing everything away", async () => {
    const r = rig({ positions: [cash(1000), pos()] });
    // a reader that is still working when the soft deadline comes and returns the part it warmed
    const reader = (_book: Book, signal: AbortSignal) =>
      new Promise<(p: Position) => HoldingFacts | null>((resolve) => signal.addEventListener("abort", () => resolve((p) => (p.address === A ? { ...facts, liquidityUsd: 1e6 } : null))));
    const out = await createCycleRunner({ ...r.deps, holdingFacts: reader, timeouts: { modelMs: 5000, readMs: 5000, factsMs: 40, orderMs: 5000 } }).run();
    expect(out.notes).not.toContain("fatos_indisponiveis");
    expect(out.considered.holdings).toBe(1);
  });

  test("a reader that never comes back fails the step after the grace period, and the cycle goes on without facts", async () => {
    const r = rig({ positions: [cash(1000), pos()] });
    const never = () => new Promise<(p: Position) => HoldingFacts | null>(() => {});
    const started = Date.now();
    const out = await createCycleRunner({ ...r.deps, holdingFacts: never, timeouts: { modelMs: 5000, readMs: 5000, factsMs: 20, graceMs: 60, orderMs: 5000 } }).run();
    expect(out.notes).toContain("fatos_indisponiveis");
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("a price is a claim", () => {
  const SPAM = "0x5555555555555555555555555555555555555555";
  const spam = pos({ id: `token:1:${SPAM}`, address: SPAM, symbol: "EAGLE", usd: 148_000_000 });

  test("a token whose claimed value no pool could pay never enters the capital, the Brief or the candidates", async () => {
    const r = rig({ positions: [cash(1000), pos(), spam] });
    const deps: CycleDeps = { ...r.deps, holdingFacts: async () => (p) => ({ ...facts, priceUsd: 2, liquidityUsd: p.address === SPAM ? 3_000 : 1e6 }) };
    const seen: (Book | null)[] = [];
    const out = await createCycleRunner({ ...deps, onBook: (b) => void seen.push(b) }).run();
    expect(out.notes).toContain("tokens_nao_comprovados");
    expect(r.shown[0]!.some((id) => id.includes(SPAM))).toBe(false);
    expect(seen[0]!.agentUsd).toBe(1090);
    expect(seen[0]!.positions.find((p) => p.address === SPAM)!.usd).toBeNull();
    expect(out.considered.holdings).toBe(1);
  });

  test("the verified view is what the executor and the screen get, never the claimed one", async () => {
    const r = rig({ positions: [cash(1000), spam] });
    const seen: Book[] = [];
    await createCycleRunner({ ...r.deps, holdingFacts: async () => () => ({ ...facts, liquidityUsd: 3_000 }), onBook: (b) => void seen.push(b) }).run();
    expect(seen[0]!.totalUsd).toBe(1000);
  });

  test("the plan of a position the agent opened still leaves, whatever the pool says", async () => {
    const held = pos({ usd: 90 });
    const key = planKey("1", A);
    const plan: PositionPlan = { key, chainIndex: "1", address: A, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 100, entryAtMs: NOW - 5 * HOUR, peakPriceUsd: 100, targetHit: false, trimmed: false, cycleId: "c0" };
    const r = rig({ mode: "limitado", noModel: true, plans: [plan], positions: [cash(1000), held] });
    // the facts say 93 dollars and no pool figure at all: the stop is the plan's, not the pool's
    const out = await createCycleRunner({ ...r.deps, holdingFacts: async () => () => ({ ...facts, priceUsd: 93, liquidityUsd: null }) }).run();
    expect(out.orders[0]).toMatchObject({ stage: "executada", order: { source: "protecao", stance: "exit_all" } });
  });
});

describe("the quality of the entry", () => {
  test("a price with no volatility to size a target and stop by does not close the purchase: it is a fact the model reads (a mark), every size stays on offer and the model IS asked", async () => {
    const r = rig({ timing: parabola, positions: [cash(1000)] });
    const out = await createCycleRunner(r.deps).run();
    expect(r.modelCalls).toBe(1);
    expect(out.reason).not.toBe("nada_a_decidir");
    expect(r.offered[`buy:token:1:${B}`]).toEqual(["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"]);
  });

  describe("a stretched price is a fact the model judges: its own answer about the top lets the purchase through or skips it", () => {
    const buyWith = (facets: Record<string, number> | null) => (ids: readonly string[]) => {
      const buys = ids.filter((id) => id.startsWith("buy:"));
      return {
        posture: "ofensiva",
        stances: Object.fromEntries(ids.map((id) => [id, id.startsWith("hold:") ? "hold" : "buy_third"])),
        profiles: Object.fromEntries(buys.map((id) => [id, "alvo_10"])),
        verdicts: Object.fromEntries(buys.map((id) => [id, { choice: "buy_third", probabilities: { skip: 0.05, buy_third: 0.95 }, confidence: null }])) as never,
        ...(facets === null ? {} : { facets: Object.fromEntries(buys.map((id) => [id, facets])) }),
      };
    };

    test("the model is asked about it (it is not closed) and, when it says the entry is not late, the order is sent", async () => {
      const r = rig({ mode: "limitado", timing: noisyParabola, positions: [cash(1000)], answer: buyWith({ late_entry: 0.2 }) });
      const out = await createCycleRunner(r.deps).run();
      expect(r.modelCalls).toBe(1);
      expect(r.offered[`buy:token:1:${B}`]).toContain("buy_third");
      expect(r.execCalls).toHaveLength(1);
      expect(out.notes).not.toContain("topo_visto_pelo_jev");
    });

    test("when the model says the entry is late but chose to buy anyway, the choice stands: its answer about the top is a recorded fact the second look reads, not a veto of the code", async () => {
      const r = rig({ mode: "limitado", timing: noisyParabola, positions: [cash(1000)], answer: buyWith({ late_entry: 0.9 }) });
      const out = await createCycleRunner(r.deps).run();
      expect(r.execCalls).toHaveLength(1);
      expect(out.notes).not.toContain("topo_visto_pelo_jev");
      const view = out.view!.find((v) => v.kind === "buy")!;
      expect(view.closed).toBeNull();
      expect(view.stance).toBe("buy_third");
    });

    test("an answer that does not speak of the top is not a reason for the code to skip the stretched entry: the choice is the decision", async () => {
      const r = rig({ mode: "limitado", timing: noisyParabola, positions: [cash(1000)], answer: buyWith(null) });
      const out = await createCycleRunner(r.deps).run();
      expect(r.execCalls).toHaveLength(1);
      expect(out.notes).not.toContain("topo_sem_resposta");
    });
  });

  test("a purchase with no history is not closed either (the missing history is a mark for the model), and a holding is offered its stances as always", async () => {
    const r = rig({ timing: null, positions: [cash(1000), pos()] });
    await createCycleRunner(r.deps).run();
    expect(r.offered).toEqual({ [`hold:token:1:${A}@agente`]: ["hold", "trim_third", "trim_half", "exit_all"], [`buy:token:1:${B}`]: ["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"] });
  });

  describe("the last hour in five-minute bars", () => {
    const view = (marks: readonly ("estagnado" | "disparando" | "caindo_agora")[]) => ({ bars: 13, ret5mPct: 0.1, ret15mPct: 0.2, ret1hPct: 0.3, rangeHourPct: 0.4, volRatio: 1.1, barAgeMin: 5, marks });

    test("a purchase in a token that has not moved for an hour keeps its sizes (the stagnation is a fact for the model, not a closure), a holding in one is still offered every stance, and the reads are the few that matter", async () => {
      const reads: string[] = [];
      const r = rig({ positions: [cash(1000), pos()] });
      await createCycleRunner({ ...r.deps, momentumOf: async (f) => (reads.push(f.candidateId), view(["estagnado"])) }).run();
      expect(r.offered[`buy:token:1:${B}`]).toEqual(["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"]);
      expect(r.offered[`hold:token:1:${A}@agente`]).toEqual(["hold", "trim_third", "trim_half", "exit_all"]);
      expect(new Set(reads)).toEqual(new Set([`token:1:${B}`, `token:1:${A}`]));
    });

    test("no more than three purchases and three holdings are read in a cycle (the quota goes where the decisions are)", async () => {
      const many = Array.from({ length: 6 }, (_, i) => eco(`0x${(i + 40).toString(16).padStart(40, "0")}`, `T${i}`));
      const held = Array.from({ length: 5 }, (_, i) => pos({ id: `token:1:0x${(i + 80).toString(16).padStart(40, "0")}`, address: `0x${(i + 80).toString(16).padStart(40, "0")}`, symbol: `H${i}`, usd: 100 - i }));
      const r = rig({ ecoFacts: many, positions: [cash(5000), ...held] });
      const reads: string[] = [];
      await createCycleRunner({ ...r.deps, momentumOf: async (f) => (reads.push(f.candidateId), null) }).run();
      expect(reads.length).toBeLessThanOrEqual(6);
      expect(reads.length).toBeGreaterThan(0);
    });

    test("a read that fails, or a cycle with no reader, changes nothing: the plain candidates", async () => {
      const a = rig({ positions: [cash(1000), pos()] });
      await createCycleRunner(a.deps).run();
      const b = rig({ positions: [cash(1000), pos()] });
      await createCycleRunner({ ...b.deps, momentumOf: async () => { throw new Error("provider down"); } }).run();
      expect(b.offered).toEqual(a.offered);
    });
  });

  test("a sound entry is offered with its sizes", async () => {
    const r = rig({});
    await createCycleRunner(r.deps).run();
    expect(r.offered[`buy:token:1:${B}`]!.length).toBeGreaterThan(1);
  });

  test("a holding with an open plan keeps its hourly timing and ecosystem families in the Brief so the entry thesis is not lost on the next look", async () => {
    const planA: PositionPlan = { key: planKey("1", A), chainIndex: "1", address: A, symbol: "AAA", profile: "alvo_5", entryPriceUsd: 2, entryAtMs: NOW - 120_000, peakPriceUsd: 2, targetHit: false, trimmed: false, cycleId: "c0" };
    const r = rig({ mode: "sombra", plans: [planA], positions: [cash(1000), pos({ priceUsd: 2 })], ecoFacts: [eco(A, "AAA"), eco(B, "BBB")] });
    let consulted: Record<string, unknown> | null = null;
    await createCycleRunner({ ...r.deps, onConsult: (entry) => void (consulted = entry.brief.posicoes[`hold:token:1:${A}@agente`] ?? null) }).run();
    expect(consulted).not.toBeNull();
    expect(consulted!.tm).toMatchObject({ rsi: expect.any(Number), rp: expect.any(Number), sg: expect.any(Number) });
    expect(consulted!.f).toEqual(expect.arrayContaining(["liquidez", "distribuicao", "seguranca"]));
    expect(consulted!.pl).toMatchObject({ pf: "alvo_5", th: false });
  });
});
