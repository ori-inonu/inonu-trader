import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditClosings, auditCycles, auditEquity, auditExecution, auditFills, auditJev, auditOpportunities, auditOrders, parseJsonl, runAudit, throughputFeasibility } from "./baseline-audit";

const T0 = Date.UTC(2026, 9, 15, 12);
const MIN = 60_000;

describe("parseJsonl", () => {
  test("conta linhas malformadas e ignora o que não é objeto", () => {
    const { rows, malformed } = parseJsonl('{"a":1}\n\nnot json\n[1,2]\n{"b":2}\n');
    expect(rows).toEqual([{ a: 1 }, { b: 2 }]);
    expect(malformed).toBe(2);
  });
});

describe("auditCycles", () => {
  test("intervalos entre ciclos, com lacunas de app parado fora da distribuição", () => {
    const ledger = [
      { kind: "cycle", atMs: T0, mode: "limitado", outcome: "decidido", reason: null },
      { kind: "cycle", atMs: T0 + 2 * MIN, mode: "limitado", outcome: "mantido", reason: "protecao" },
      { kind: "cycle", atMs: T0 + 4 * MIN, mode: "sombra", outcome: "decidido", reason: null },
      { kind: "cycle", atMs: T0 + 6 * 60 * MIN, mode: "limitado", outcome: "decidido", reason: null },
      { kind: "order", atMs: T0, stage: "preparada" },
    ];
    const a = auditCycles(ledger);
    expect(a.total).toBe(4);
    expect(a.byMode).toEqual({ limitado: 3, sombra: 1 });
    expect(a.byReason).toEqual({ protecao: 1 });
    expect(a.intervalMs).toMatchObject({ n: 2, p50: 120_000 });
    expect(a.excludedGaps).toBe(1);
  });
});

describe("auditOrders", () => {
  const order = (stage: string, atMs: number, reason: string | null = null, side = "sell") => ({ kind: "order", stage, atMs, reason, side });
  const ledger = [
    order("preparada", T0),
    order("executada", T0 + 1000, "recibo_sucesso"),
    order("preparada", T0 + 2000),
    order("falhou", T0 + 3000, "gas_station_pendente"),
    order("falhou", T0 + 4000, "gas_station_pendente", "buy"),
    order("falhou", T0 + 5000, "gas_station_pendente"),
    order("falhou", T0 + 6000, "simulacao_falhou"),
  ];

  test("participação das execuções e o maior bloqueio com o que executou depois dele", () => {
    const a = auditOrders(ledger);
    expect(a.prepared).toBe(2);
    expect(a.executed).toBe(1);
    expect(a.failed).toBe(4);
    expect(a.failuresByReason).toEqual({ gas_station_pendente: 3, simulacao_falhou: 1 });
    expect(a.failuresBySide).toEqual({ sell: 3, buy: 1 });
    expect(a.topBlocker).toEqual({ reason: "gas_station_pendente", count: 3, shareOfFailures: 0.75, firstAtMs: T0 + 3000, lastAtMs: T0 + 5000, executedAfterFirst: 0 });
    expect(a.perDay["2026-10-15"]).toEqual({ executada: 1, gas_station_pendente: 3, simulacao_falhou: 1 });
  });

  test("sem falhas não há bloqueio nem divisão por zero", () => {
    const a = auditOrders([order("preparada", T0), order("executada", T0 + 1)]);
    expect(a.topBlocker).toBeNull();
    expect(a.executedShare).toBe(1);
    expect(auditOrders([]).executedShare).toBeNull();
  });
});

describe("auditJev e auditClosings", () => {
  test("latência do modelo, atraso de registro e idade do fato", () => {
    const meta = [100, 200, 300].map((d) => ({ metadata: { askedAtMs: T0, answeredAtMs: T0 + d, recordedAtMs: T0 + d + 10, factAvailableAtMs: T0 - 5 } }));
    const a = auditJev(meta);
    expect(a.latencyMs).toMatchObject({ n: 3, p50: 200, max: 300 });
    expect(a.recordLagMs).toMatchObject({ p50: 10 });
    expect(a.factAgeMs).toMatchObject({ p50: 5 });
    expect(auditJev([]).latencyMs).toBeNull();
  });

  test("cotação: rede, idade, validade e impacto absoluto; fechamento sem cotação não entra", () => {
    const quote = (ms: number, impact: number) => ({ startedAtMs: T0, receivedAtMs: T0 + ms, ageMs: ms, expiresAtMs: T0 + ms + 14_000, disposition: "ok", facts: { impactPct: impact, tradeFee: 0.0005 } });
    const closings = [
      { quote: quote(900, -0.2), wouldReason: "resposta_do_jev", askedAtMs: T0, answeredAtMs: T0 + 250 },
      { quote: quote(1100, 0.4), wouldReason: "resposta_do_jev", askedAtMs: T0, answeredAtMs: T0 + 300 },
      { quote: null, wouldReason: "reserva_para_primarias", askedAtMs: null, answeredAtMs: null },
    ];
    const a = auditClosings(closings);
    expect(a.total).toBe(3);
    expect(a.quoted).toBe(2);
    expect(a.quoteNetworkMs).toMatchObject({ n: 2, p50: 900, max: 1100 });
    expect(a.quoteTtlMs).toMatchObject({ p50: 14_000 });
    expect(a.absImpactPct).toMatchObject({ min: 0.2, max: 0.4 });
    expect(a.absImpactShareLe).toMatchObject({ "0.15": 0, "0.3": 0.5, "0.5": 1 });
    expect(a.jevClosingMs).toMatchObject({ n: 2, p50: 250 });
    expect(a.wouldReason).toEqual({ resposta_do_jev: 2, reserva_para_primarias: 1 });
  });
});

describe("auditFills", () => {
  const fill = (side: string, at: number, mint: string, symbol: string, tokenMinor: number, cashUnits: number) => ({ kind: "fill", side, atMs: T0 + at, mint, symbol, tokenMinor: String(tokenMinor), cashUnits, feeLamports: "1000000" });

  test("venda pareada por FIFO com a compra anterior, retorno antes da taxa de rede", () => {
    const a = auditFills([fill("buy", 0, "M1", "AAA", 1000, 10), fill("sell", 1, "M1", "AAA", 1000, 9.9)], 100);
    expect(a.roundtrips.matchedSells).toBe(1);
    expect(a.roundtrips.pnlUsd).toBe(-0.1);
    expect(a.roundtrips.returnPct).toBe(-1);
    expect(a.roundtrips.wins).toBe(0);
    expect(a.feeLamportsTotal).toBe(2_000_000);
    expect(a.feeUsdApprox).toBe(0.2);
  });

  test("venda parcial consome parte do lote e a segunda venda consome o resto, na proporção", () => {
    const a = auditFills([fill("buy", 0, "M1", "AAA", 1000, 10), fill("sell", 1, "M1", "AAA", 400, 4.2), fill("sell", 2, "M1", "AAA", 600, 5.9)], null);
    expect(a.roundtrips.perSell.map((m) => [m.costUsd, m.proceedsUsd])).toEqual([[4, 4.2], [6, 5.9]]);
    expect(a.roundtrips.costUsd).toBe(10);
    expect(a.roundtrips.atLeast30bps).toBe(1);
    expect(a.feeUsdApprox).toBeNull();
  });

  test("venda sem compra anterior no journal fica fora do retorno e é contada", () => {
    const a = auditFills([fill("sell", 0, "M9", "ZZZ", 500, 50)], null);
    expect(a.roundtrips.matchedSells).toBe(0);
    expect(a.roundtrips.unmatchedSells).toBe(1);
    expect(a.roundtrips.returnPct).toBeNull();
  });

  test("pareia por token e respeita a ordem do tempo mesmo com linhas fora de ordem", () => {
    const a = auditFills([fill("sell", 5, "M1", "AAA", 100, 11), fill("buy", 0, "M2", "BBB", 100, 5), fill("buy", 1, "M1", "AAA", 100, 10)], null);
    expect(a.roundtrips.matchedSells).toBe(1);
    expect(a.roundtrips.perSell[0]).toMatchObject({ symbol: "AAA", costUsd: 10, proceedsUsd: 11, returnPct: 10 });
  });
});

describe("auditExecution", () => {
  const rec = (orderKey: string, stage: string, atMs: number, extra: Record<string, unknown> = {}) => ({ kind: "order", orderKey, stage, atMs, reason: null, side: "buy", ...extra });
  const fill = (orderKey: string, side: string, atMs: number, extra: Record<string, unknown> = {}) => ({ kind: "fill", orderKey, side, atMs, tokenMinor: "1000", cashUnits: 10, ...extra });

  test("tempo em cada etapa do ciclo de vida de uma ordem executada, com o recibo e a inclusão separados", () => {
    const ledger = [
      rec("a", "preparada", T0),
      rec("a", "enviando", T0 + 10),
      rec("a", "incerta", T0 + 3_510, { reason: "transmitida" }),
      rec("a", "executada", T0 + 33_510, { reason: "recibo_sucesso" }),
    ];
    const a = auditExecution(ledger, [fill("a", "buy", T0 + 7_510)]);
    expect(a.executed).toBe(1);
    expect(a.receipts).toBe(1);
    expect(a.stagesMs.queue).toMatchObject({ n: 1, p50: 10 });
    expect(a.stagesMs.sendAndSign).toMatchObject({ p50: 3_500 });
    expect(a.stagesMs.receipt).toMatchObject({ p50: 30_000 });
    expect(a.stagesMs.chainInclusion).toMatchObject({ p50: 4_000 });
  });

  test("ordem resolvida à mão pelo usuário não entra no tempo de recibo", () => {
    const ledger = [rec("a", "enviando", T0), rec("a", "incerta", T0 + 3000), rec("a", "executada", T0 + 99_000, { reason: "resolvida_pelo_usuario" })];
    const a = auditExecution(ledger, []);
    expect(a.executed).toBe(1);
    expect(a.receipts).toBe(0);
    expect(a.stagesMs.receipt).toBeNull();
  });

  test("tempo gasto por tentativa que falhou, por motivo", () => {
    const ledger = [
      rec("a", "enviando", T0),
      rec("a", "falhou", T0 + 2_600, { reason: "gas_station_pendente" }),
      rec("b", "enviando", T0 + 10_000),
      rec("b", "falhou", T0 + 12_700, { reason: "gas_station_pendente" }),
      rec("c", "enviando", T0 + 20_000),
      rec("c", "falhou", T0 + 21_000, { reason: "impacto_alto" }),
    ];
    const a = auditExecution(ledger, []);
    expect(a.executed).toBe(0);
    expect(a.failedAttemptMs.gas_station_pendente).toMatchObject({ n: 2, min: 2_600, max: 2_700 });
    expect(a.failedAttemptMs.impacto_alto).toMatchObject({ n: 1, p50: 1_000 });
    expect(Object.keys(a.failedAttemptMs)[0]).toBe("gas_station_pendente");
  });

  test("slippage contra a cotação: compra compara tokens, venda compara dinheiro; positivo é receber menos", () => {
    const ledger = [
      rec("buy1", "enviando", T0),
      rec("buy1", "incerta", T0 + 1000, { quote: { toAmountMinor: "100000" } }),
      rec("buy1", "executada", T0 + 2000, { reason: "recibo_sucesso" }),
      rec("sell1", "enviando", T0),
      rec("sell1", "incerta", T0 + 1000, { side: "sell", quote: { toAmountMinor: "20000000" } }),
      rec("sell1", "executada", T0 + 2000, { side: "sell", reason: "recibo_sucesso" }),
    ];
    const fills = [fill("buy1", "buy", T0 + 1000, { tokenMinor: "99900" }), fill("sell1", "sell", T0 + 1000, { cashUnits: 20.02 })];
    const a = auditExecution(ledger, fills);
    expect(a.slippagePairs).toEqual({ matched: 2, unmatched: 0 });
    expect(a.slippageVsQuoteBps).toMatchObject({ n: 2, min: -10, max: 10 });
  });

  test("fill sem cotação ou com unidade incompatível é contado como não comparável, nunca inventado", () => {
    const ledger = [
      rec("a", "enviando", T0),
      rec("a", "incerta", T0 + 1000),
      rec("a", "executada", T0 + 2000, { reason: "recibo_sucesso" }),
      rec("b", "enviando", T0),
      rec("b", "incerta", T0 + 1000, { quote: { toAmountMinor: "5" } }),
      rec("b", "executada", T0 + 2000, { reason: "recibo_sucesso" }),
    ];
    const a = auditExecution(ledger, [fill("a", "buy", T0 + 1000), fill("b", "buy", T0 + 1000, { tokenMinor: "1000000" })]);
    expect(a.slippageVsQuoteBps).toBeNull();
    expect(a.slippagePairs).toEqual({ matched: 0, unmatched: 2 });
  });

  test("sem ordens nada é inventado", () => {
    const a = auditExecution([], []);
    expect(a).toMatchObject({ executed: 0, receipts: 0, failedAttemptMs: {}, slippageVsQuoteBps: null });
    expect(a.stagesMs.queue).toBeNull();
  });
});

describe("auditEquity", () => {
  test("variação, drawdown máximo, pontos sem valor e preço do SOL", () => {
    const holdings = [{ id: "token:501:native", units: 1, priceUsd: 150 }];
    const equity = [{ atMs: T0, usd: 100, holdings }, { atMs: T0 + 1, usd: 120 }, { atMs: T0 + 2, usd: null }, { atMs: T0 + 3, usd: 90 }, { atMs: T0 + 3_600_000, usd: 110, holdings }];
    const a = auditEquity(equity);
    expect(a.points).toBe(4);
    expect(a.withoutValue).toBe(1);
    expect(a.changePct).toBe(10);
    expect(a.drawdown).toMatchObject({ pct: 25, peak: 120, trough: 90, recoveredAtMs: null });
    expect(a.solUsd).toBe(150);
    expect(a.spanHours).toBe(1);
  });
});

describe("auditOpportunities", () => {
  const decision = (key: string, stance: string, entry: number) => ({ kind: "decision", key, stance, entryPriceUsd: entry, side: stance === "exit_all" ? "sell" : "buy" });
  const settle = (key: string, window: string, price: number | null) => ({ kind: "settlement", key, window, priceUsd: price, reason: price === null ? "sem_preco" : null });

  test("retorno favorável por grupo: venda inverte o sinal e liquidação sem preço é contada à parte", () => {
    const sb = [
      decision("a", "buy_tenth", 100),
      decision("b", "skip", 100),
      decision("c", "exit_all", 100),
      settle("a", "15m", 101),
      settle("b", "15m", 99),
      settle("c", "15m", 98),
      settle("c", "1h", null),
    ];
    const a = auditOpportunities(sb);
    expect(a.decisions).toBe(3);
    expect(a.settlementsWithoutPrice).toBe(1);
    expect(a.forward.compra?.["15m"]).toMatchObject({ n: 1, meanBps: 100 });
    expect(a.forward.pular?.["15m"]).toMatchObject({ n: 1, meanBps: -100 });
    expect(a.forward.venda?.["15m"]).toMatchObject({ n: 1, meanBps: 200 });
    expect(a.forward.venda?.["1h"]).toBeUndefined();
    expect(a.forward.compra?.["15m"]?.ge30bps).toMatchObject({ k: 1, share: 1 });
  });
});

describe("throughputFeasibility", () => {
  test("uma decisão a cada 90 ms exige 11 por segundo, 11 vezes o RPS do Trial e 298 vezes a franquia Basic diária", () => {
    const f = throughputFeasibility(90);
    expect(f.requiredPerSecond).toBe(11.11);
    expect(f.requiredPerDay).toBe(960_000);
    expect(f.tradeTrialMaxPerDay).toBe(86_400);
    expect(f.rpsShortfallFactor).toBe(11.1);
    expect(f.basicFranchisePerDay).toBe(3226);
    expect(f.basicShortfallFactor).toBe(298);
  });
});

describe("runAudit", () => {
  const dir = mkdtempSync(join(tmpdir(), "baseline-audit-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("relatório sem mint, assinatura, endereço nem id de ciclo, e pasta vazia não inventa número", () => {
    const agent = join(dir, "InonuTrader", "data", "agent");
    mkdirSync(agent, { recursive: true });
    const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    writeFileSync(join(agent, "fills.jsonl"), jsonl([{ kind: "fill", side: "buy", atMs: T0, mint: "MINT_SECRETA_111", symbol: "AAA", signature: "SIG_SECRETA_222", tokenMinor: "100", cashUnits: 10, feeLamports: "1" }, { kind: "fill", side: "sell", atMs: T0 + 1, mint: "MINT_SECRETA_111", symbol: "AAA", signature: "SIG_SECRETA_333", tokenMinor: "100", cashUnits: 11, feeLamports: "1" }]));
    writeFileSync(join(agent, "ledger.jsonl"), jsonl([{ kind: "cycle", cycleId: "CICLO_SECRETO_444", atMs: T0, mode: "limitado", outcome: "decidido", reason: null }, { kind: "order", cycleId: "CICLO_SECRETO_444", orderKey: "KEY_555", address: "ADDR_666", stage: "falhou", reason: "gas_station_pendente", side: "buy", atMs: T0 }]));
    const report = runAudit(agent, null, T0 + 1000);
    const text = JSON.stringify(report);
    for (const secret of ["MINT_SECRETA_111", "SIG_SECRETA", "CICLO_SECRETO_444", "KEY_555", "ADDR_666"]) expect(text).not.toContain(secret);
    expect(report.fills.roundtrips.matchedSells).toBe(1);
    expect(report.orders.topBlocker?.reason).toBe("gas_station_pendente");
    expect(report.api.source).toBeNull();
    expect(report.jev.latencyMs).toBeNull();
    expect(report.equity.drawdown).toBeNull();
    expect(report.source).toBe("data/agent");
    expect(report.caveats.length).toBeGreaterThan(0);
  });
});
