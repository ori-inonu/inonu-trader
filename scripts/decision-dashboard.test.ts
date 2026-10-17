import { describe, expect, test } from "bun:test";
import { clean, renderDashboard, type DashboardInput } from "./decision-dashboard";

const d = (p50: number) => ({ n: 10, min: 1, p50, p95: p50 * 2, p99: p50 * 3, mean: p50, max: p50 * 4 });
const input: DashboardInput = {
  generatedAt: "2026-10-17T20:00:00.000Z",
  baseline: {
    window: { hours: 74.9 },
    cycles: { total: 2335 },
    orders: { prepared: 1531, executed: 27, executedShare: 0.0176, topBlocker: { reason: "gas_station_pendente", count: 1187, shareOfFailures: 0.84, executedAfterFirst: 0 }, failuresByReason: { gas_station_pendente: 1187, simulacao_falhou: 166 } },
    equity: { drawdown: { pct: 15.01 } },
    fills: { roundtrips: { matchedSells: 7, wins: 0, returnPct: -0.406 } },
    jev: { latencyMs: d(373) },
    closings: { quoteNetworkMs: d(1034), absImpactPct: d(0.23) },
    execution: { stagesMs: { queue: d(5), sendAndSign: d(3540), chainInclusion: d(3913), receipt: d(30722) }, failedAttemptMs: { gas_station_pendente: d(2654) }, slippageVsQuoteBps: d(0), slippagePairs: { matched: 15, unmatched: 11 } },
    caveats: ["Patrimônio inclui depósitos e variação de preço das posições: a variação não é lucro de trading."],
  },
  shadow: { pWinMode: "bruta", total: 240, evaluated: 108, engineOperates: 0, production: { would: { skip: 108 } }, engine: { byReason: { no_edge: 106, edge_below_min: 2 }, netEdgeBps: d(-210), grossEdgeBps: d(-118), costBps: d(110) }, limits: { minNetEdgeBps: 30 }, notEvaluated: { count: 132, missing: { quote: 132 } } },
  hypothesis: { verdict: "Cadência de 90 ms: inviável no plano atual.", findings: [{ id: "vazao", status: "inviavel", evidence: "11,1 req/s contra 1" }], requiredPWinBySymmetricMove: [{ moveBps: 50, costBps: 46, pWin: 1.52 }, { moveBps: 100, costBps: 46, pWin: 0.88 }] },
  executorSim: { attempts: 1438, allowed: 57, probes: 10, suppressed: 1381, avoidedShare: 0.96, suppressedSuccesses: 0 },
  paperRun: { n: 5000, summary: { byAction: { COMPRAR: 8, VENDER: 16, NAO_OPERAR: 4976 }, rejections: [{ reason: "no_edge", count: 2005 }] }, latency: { measured: { decisao_local: { p95: 0.068 } } } },
  apiBudget: { budget: { pools: [{ pool: "market-basic", endpoints: 13, ceilings: { minute: null }, monthly: { franquia: 100000, used: 14763 }, status: "ok" }] }, clientPacing: { minIntervalMs: 1100 }, projection: { basic: { used: 14763, franquia: 100000, ratePerDay: 3810, projectedMonth: 68628, overQuota: false } } },
};

describe("renderDashboard", () => {
  const html = renderDashboard(input);

  test("traz todas as seções com os números do relatório", () => {
    for (const id of ["estado", "falhas", "latencia", "custos", "motor", "paper", "executor", "hipotese", "api", "limites"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("gas_station_pendente");
    expect(html).toContain("1.187");
    expect(html).toContain("1.034 ms");
    expect(html).toContain("Motivos de recusa do motor");
    expect(html).toContain("impossível");
    expect(html).toContain("88%");
    expect(html).toContain("0,23 %");
  });

  test("obedece à regra do produto: sem ponto médio, travessão ou meia-risca, sem animação nem script", () => {
    expect(html).not.toMatch(/[·–—−•]/);
    expect(html).not.toMatch(/animation|@keyframes|blink|pulse|<script/i);
  });

  test("a rede aparece como etapa própria quando foi medida e some quando não foi", () => {
    const withNet = renderDashboard({ ...input, network: { tcpMs: d(43), tlsMs: d(40) } });
    expect(withNet).toContain("Rede: conexão TCP");
    expect(withNet).toContain("Rede: handshake TLS");
    expect(html).not.toContain("Rede: conexão TCP");
  });

  test("texto de entrada é escapado e nunca vira marcação", () => {
    const hostile = renderDashboard({ generatedAt: "x", baseline: { ...input.baseline, orders: { ...input.baseline!.orders, failuresByReason: { '<img src=x onerror=alert(1)>': 5 } } } });
    expect(hostile).not.toContain("<img");
    expect(hostile).toContain("&lt;img");
  });

  test("sem relatórios o painel explica o que fazer em vez de quebrar", () => {
    const empty = renderDashboard({ generatedAt: "x" });
    expect(empty).toContain("Nenhum relatório encontrado");
    expect(empty).toContain("<!doctype html>");
  });

  test("medida ausente aparece como sem dado, nunca zero", () => {
    const sparse = renderDashboard({ generatedAt: "x", baseline: { orders: {}, execution: { stagesMs: {} }, jev: { latencyMs: null } } });
    expect(sparse).toContain("sem dado");
  });

  test("clean troca os caracteres proibidos por hífen", () => {
    expect(clean("a—b–c·d−e")).toBe("a-b-c-d-e");
  });

  test("o painel declara que não é lucro", () => {
    expect(html).toContain("Nada aqui é lucro");
  });
});
