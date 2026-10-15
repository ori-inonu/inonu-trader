import { expect, test } from "bun:test";
import { createBudget } from "../agent/budget";
import { createCycleRunner, type CycleDeps } from "../agent/cycle";
import { DEFAULT_CAPS } from "../agent/gate";
import { createAgentLedger } from "../agent/ledger";
import { createPlanStore } from "../agent/plans";
import { createScoreboard } from "../agent/scoreboard";
import { timingFacts } from "../agent/timing";
import { candidateOf } from "../opportunity/ecosystem";

test("a shadow quote never holds a primary sale already chosen by the model", async () => {
  const now = Date.UTC(2026, 9, 15, 12), a = "0x1111111111111111111111111111111111111111", b = "0x2222222222222222222222222222222222222222";
  const lines: string[] = [], events: string[] = [];
  const token = { id: `token:1:${a}`, chainIndex: "1", address: a, symbol: "SYNTHETIC", wallet: "agente" as const, usd: 100, balanceMinor: "1000000000000000000", decimals: 18, isCash: false };
  const cash = { ...token, id: "token:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", usd: 1000, balanceMinor: "1000000000", decimals: 6, symbol: "USDC", isCash: true };
  const book = { observedAtMs: now - 1000, positions: [cash, token], cashByChain: { "1": 1000 }, totalUsd: 1100, agentUsd: 1100 };
  const closes = [100]; for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i % 2 ? 1.02 : 1 / 1.02));
  const timing = timingFacts(closes.map((close, i) => { const open = closes[Math.max(0, i - 1)]!; return { startMs: i * 3600000, open, close, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * .996, volume: 1, confirmed: true }; }));
  const buy = candidateOf({ candidateId: `token:1:${b}`, chainIndex: "1", address: b, symbol: "SYNTHETIC2", nota: 70, priceUsd: .5, changePct: 12, volumeUsd: 2e6, liquidityUsd: 5e6, marketCapUsd: 5e7, holders: 5000, buyShare: .6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 }, null);
  let release!: () => void, started!: () => void, n = 0;
  const quoteWait = new Promise<void>(resolve => { release = resolve; }), quoteStarted = new Promise<void>(resolve => { started = resolve; });
  const deps: CycleDeps = {
    state: { get: () => ({ mode: "limitado", stopped: false }) },
    ledger: createAgentLedger({ read: () => lines, append: line => { lines.push(line); } }),
    budget: createBudget({ limits: { maxConsultsPerDay: 720, maxTokensPerDay: null }, now: () => now, load: () => null, persist: () => {} }),
    plans: createPlanStore({ read: () => null, write: () => {} }), scoreboard: createScoreboard({ read: () => [], append: () => {} }),
    model: { name: "synthetic", estimateTokens: () => 1000, async choose({ candidates }) { return { raw: { posture: "ofensiva", stances: Object.fromEntries(candidates.map(c => [c.id, c.kind === "holding" ? "exit_all" : "buy_full"])), profiles: Object.fromEntries(candidates.filter(c => c.kind === "buy").map(c => [c.id, "alvo_5"])) }, usage: { inputTokens: 900, outputTokens: 20 } }; } },
    executor: { async execute(order) { events.push(order.side); return { status: "falhou", reason: "synthetic_no_execution" }; } },
    now: () => now, newId: () => `synthetic-${++n}`, stopFilePresent: () => false, clockSkewMs: () => 0,
    readBook: async () => book,
    holdingFacts: async () => () => ({ priceUsd: 2, sinceEntryPct: null, changeH24Pct: 1, liquidityUsd: 1e6, exitImpactPct: .01, volumeH24Usd: 5e5, soldPct: 0, riskLevel: 1, riskFlags: ["dev_com_rug"], heldHours: 1 }),
    timingOf: async () => timing, ecosystem: async saldo => ({ observedAtMs: now, saldo, candidates: [buy], excluded: {} }), context: () => null, history: () => null,
    riskPct: () => .1, caps: DEFAULT_CAPS, minBuyUsd: () => 10,
    limitedFacts: async () => ({ policy: { perTxUsd: 50, dailyTradeUsd: 200, dailyTransferUsd: 0, transferGuarded: true }, sessionExpiresAtMs: now + 3600000, nowMs: now, cycleBudgetMs: 120000, addressMatches: true, binaryOk: true, localSkewMs: 0 }),
    refreshMs: 3600000, timeouts: { readMs: 5000, modelMs: 5000, orderMs: 5000 },
    closing: { quoter: { async read() { events.push("shadow_quote_started"); started(); await quoteWait; return { ok: false, reason: "synthetic_no_quote" }; } }, record: () => {}, maxPerCycle: 1, timeouts: { quoteMs: 5000, modelMs: 5000 } },
  };
  const running = createCycleRunner(deps).run();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let before: string[] = [];
  try {
    await Promise.race([quoteStarted, running.then(() => { throw Error("fixture_closing_not_reached"); }), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error("fixture_deadline")), 2000); })]);
    before = [...events];
  } finally { if (timeout !== undefined) clearTimeout(timeout); release(); await running; }
  expect(events).toContain("sell");
  expect(before).toContain("sell");
  expect(before.indexOf("sell")).toBeLessThan(before.indexOf("shadow_quote_started"));
});
