// origin: synthetic_fixture, tests only. The body `GET /agent/status` gives, with values that make each part of the screen show something.
// Nothing in the production bundle imports this file (the purity test of the desktop build guards that).
import { parseStatus } from "./parse";
import type { AgentStatus } from "./types";

export const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const WALLET = "0x1111111111111111111111111111111111111111";
const AGENT_WALLET = "0x2222222222222222222222222222222222222222";
const AGENT_SOLANA = "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV";
const TOKEN = "0xabcdef0123456789abcdef0123456789abcdef01";

const window = (over: Record<string, unknown> = {}) => ({ n: 0, overlapping: 0, notionalUsd: 0, settled: 0, pending: 0, unknownPrice: 0, grossUsd: 0, netUsd: null, hitRate: null, claim: null, claimBasis: null, claimReason: "sem_decisoes", ...over });

export const CONNECTED_STATE = { version: 3, connected: true, connectedAtMs: NOW - 3_600_000, disclosure: "2026-10-14.1", pausedUntilMs: null, pauseReason: null, changedAtMs: NOW - 3_600_000, events: [{ atMs: NOW - 3_600_000, kind: "conectou", reason: "conectou" }] };
export const DISCONNECTED_STATE = { version: 3, connected: false, connectedAtMs: null, disclosure: null, pausedUntilMs: null, pauseReason: null, changedAtMs: null, events: [] };

export const WALLET_ANALYSING = { cli: "ausente", login: "nao_iniciado", loginUrl: null, agentic: false, address: null, solanaAddress: null, policy: "desconhecida", fundsUsd: null, sessionLeftMs: null, next: "instalar" };
export const WALLET_TRADING = { cli: "instalado", login: "logado", loginUrl: null, agentic: true, address: AGENT_WALLET, solanaAddress: AGENT_SOLANA, policy: "ok", fundsUsd: 1010, sessionLeftMs: 80 * 24 * 3_600_000, next: "operando" };

export function rawStatus(over: Record<string, unknown> = {}): { ok: true; status: Record<string, unknown> } {
  return {
    ok: true,
    status: {
      state: CONNECTED_STATE,
      mode: "sombra",
      authority: { level: "analise", blocked: "cli_instalado", ownerPolicy: "exigida" },
      paused: false,
      stopFile: false,
      config: {
        version: 1,
        auto: true,
        managed: { kind: "propria", evm: WALLET, solana: null },
        watch: { evm: null, solana: null },
        chains: ["1", "56", "8453"],
        caps: { maxBuyUsd: 25, maxDailyBuyUsd: 100, maxDailySellUsd: 500 },
        budget: { maxConsultsPerDay: 144, maxTokensPerDay: null },
        intervalMin: 10,
        refreshMin: 60,
        riskPct: null,
        cli: { path: null, sha256: null },
      },
      health: { ledger: { ok: true }, plans: { ok: true }, config: { ok: true } },
      modelConfigured: true,
      credentialsConfigured: true,
      cli: { configured: false },
      readiness: { sombra: [], limitado: ["cli_instalado", "carteira_agentica"] },
      wallet: WALLET_ANALYSING,
      autopilot: {
        auto: true,
        settings: {
          caps: { maxBuyUsd: 60, maxDailyBuyUsd: 303, maxDailySellUsd: 1000 },
          riskPct: 0.01,
          reserveShare: 0.2,
          intervalMin: 10,
          refreshMin: 60,
          chains: ["1", "56", "8453"],
          mandate: { risk: "moderado", reserve: "media", concentration: "media", look: "normal" },
          riskTaken: "moderado",
          source: { caps: "automatico", riskPct: "automatico", reserveShare: "automatico", rhythm: "automatico", chains: "automatico" },
        },
        mandateChangedAtMs: null,
        aggressiveOpen: false,
      },
      budget: { version: 1, day: "2026-10-14", consults: 12, committedTokens: 14_000, measuredTokens: 14_000, unmeasuredCalls: 0, limits: { maxConsultsPerDay: 144, maxTokensPerDay: null } },
      scheduler: { started: true, nextAtMs: NOW + 7 * 60_000, lastAtMs: NOW - 3 * 60_000, intervalMin: 10 },
      last: {
        cycleId: "cy-1",
        atMs: NOW - 3 * 60_000,
        durationMs: 5200,
        mode: "sombra",
        outcome: "decidido",
        reason: null,
        consulted: true,
        modelo: "jev-latest",
        usage: { inputTokens: 1200, outputTokens: 90 },
        posture: "neutra",
        stances: { [`hold:token:1:${TOKEN}@agente`]: "trim_third", "buy:token:1:0x2222222222222222222222222222222222222222": "buy_third" },
        profiles: { "buy:token:1:0x2222222222222222222222222222222222222222": "alvo_10" },
        orders: [
          { order: { candidateId: `hold:token:1:${TOKEN}@agente`, side: "sell", stance: "trim_third", chainIndex: "1", symbol: "AAA", address: TOKEN, usd: 33, amountMinor: "100", wallet: "agente", profile: null, source: "modelo" }, stage: "preparada", ref: null, reason: null },
          { order: { candidateId: "buy:token:1:0x2222222222222222222222222222222222222222", side: "buy", stance: "buy_third", chainIndex: "1", symbol: "BBB", address: "0x2222222222222222222222222222222222222222", usd: 20, amountMinor: null, wallet: "agente", profile: "alvo_10", source: "modelo" }, stage: "preparada", ref: null, reason: null },
        ],
        dropped: [{ candidateId: "buy:token:1:0x3333333333333333333333333333333333333333", reason: "caixa_insuficiente" }],
        considered: { holdings: 3, buys: 4, protected: 0 },
        notes: ["fatos_indisponiveis"],
        view: [
          { id: `hold:token:1:${TOKEN}@agente`, kind: "holding", symbol: "AAA", chainIndex: "1", stance: "trim_third", families: [], marks: [] },
          { id: "buy:token:1:0x2222222222222222222222222222222222222222", kind: "buy", symbol: "BBB", chainIndex: "1", stance: "buy_third", families: ["carteiras", "liquidez"], marks: [] },
          { id: "buy:token:1:0x3333333333333333333333333333333333333333", kind: "buy", symbol: "CCC", chainIndex: "56", stance: "skip", families: [], marks: ["entrada_esticada"] },
        ],
      },
      plans: [{ key: `1:${TOKEN}`, chainIndex: "1", address: TOKEN, symbol: "AAA", profile: "alvo_10", entryPriceUsd: 3.2, entryAtMs: NOW - 5 * 3_600_000, peakPriceUsd: 3.6, targetHit: false, trimmed: false, cycleId: "cy-0" }],
      inFlight: [],
      lock: true,
      scoreboard: {
        decisions: 12,
        protective: 0,
        noEntryPrice: 0,
        windows: {
          "15m": window({ n: 12, settled: 12, grossUsd: 1.5, hitRate: 0.58, claim: null, claimReason: "amostra_pequena" }),
          "1h": window({ n: 12, settled: 9, pending: 3, grossUsd: 2.1, hitRate: 0.55, claim: null, claimReason: "janela_incompleta" }),
          "4h": window({ n: 12, settled: 4, pending: 8, grossUsd: -0.4, hitRate: 0.5, claim: null, claimReason: "janela_incompleta" }),
          "24h": window(),
        },
        byMode: {},
        inaction: {
          decisions: 40,
          windows: {
            "15m": window({ n: 40, settled: 40, grossUsd: 3.2, hitRate: 0.6, claim: "acima_de_manter", claimBasis: "bruto", claimReason: null }),
            "1h": window({ n: 40, settled: 12, pending: 28, grossUsd: -0.8, hitRate: 0.4, claim: null, claimReason: "janela_incompleta" }),
            "4h": window(),
            "24h": window(),
          },
        },
      },
      evidence: { settled: 0, claim: null, claimReason: "sem_decisoes", netUsd: null, grossUsd: 0 },
      book: {
        atMs: NOW - 4 * 60_000,
        managedOk: true,
        watchFailed: 0,
        flagged: 1,
        unpriced: 0,
        totalUsd: 1010,
        agentUsd: 1010,
        cashUsd: 800,
        positions: [
          { id: "token:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", chainIndex: "1", wallet: "agente", usd: 800, sharePct: 79.2, isCash: true, plan: null },
          { id: `token:1:${TOKEN}`, symbol: "AAA", chainIndex: "1", wallet: "agente", usd: 210, sharePct: 20.8, isCash: false, plan: { profile: "alvo_10", sinceEntryPct: 12.5, toTargetPct: -2.1, toStopPct: 18.2, hoursHeld: 5, hoursLeft: 31, targetHit: false, trimmed: false } },
        ],
      },
      context: { btc_24h: 1.8, eth_24h: -0.4, tendencia: "lateral", vol_btc: "normal", s1_escolha: "manter", s1_regime: "normal", s1_idade_min: 6 },
      ledger: [
        { kind: "cycle", cycleId: "cy-1", atMs: NOW - 3 * 60_000, mode: "sombra", outcome: "decidido", reason: null, posture: "neutra", stances: {}, planned: 2, dropped: [], modelo: "jev-latest" },
        { kind: "order", cycleId: "cy-1", atMs: NOW - 3 * 60_000, orderKey: "cy-1:x", stage: "preparada", candidateId: "x", side: "buy", stance: "buy_third", chainIndex: "1", symbol: "BBB", address: "0x2", wallet: "agente", usd: 20, amountMinor: null, ref: null, reason: null, profile: "alvo_10", source: "modelo" },
      ],
      ...over,
    },
  };
}

export function sampleStatus(over: Record<string, unknown> = {}): AgentStatus {
  const status = parseStatus(rawStatus(over));
  if (status === null) throw new Error("the sample status must parse");
  return status;
}
