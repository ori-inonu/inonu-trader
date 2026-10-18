import { describe, expect, test } from "bun:test";
import type { LeaderboardRow, Signal, WalletRow } from "../onchain/client";
import {
  feedStateOfResource,
  fmtAgeMs,
  fmtRelAgo,
  fmtUsd,
  fmtUsdSigned,
  leaderboardRows,
  onchainErrorText,
  signalRows,
  TAG_FILTERS,
  walletRows,
  walletTypeWord,
} from "./onchain-rows";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

describe("formatters", () => {
  test("relative age in words", () => {
    expect(fmtRelAgo(NOW - 3_000, NOW)).toBe("agora");
    expect(fmtRelAgo(NOW - 30_000, NOW)).toBe("ha 30 s");
    expect(fmtRelAgo(NOW - 3 * 60_000, NOW)).toBe("ha 3 min");
    expect(fmtRelAgo(NOW - 2 * 3_600_000, NOW)).toBe("ha 2 h");
    expect(fmtRelAgo(NOW - 4 * 86_400_000, NOW)).toBe("ha 4 d");
    expect(fmtRelAgo(NOW + 60_000, NOW)).toBe("agora");
    expect(fmtRelAgo(null, NOW)).toBe("Indisponivel");
    expect(fmtAgeMs(125_000)).toBe("ha 2 min");
  });

  test("compact USD and signed USD", () => {
    expect(fmtUsd(125_430.56)).toBe("US$ 125 mil");
    expect(fmtUsd(-50)).toBe("-US$ 50,0");
    expect(fmtUsd(null)).toBe("Indisponivel");
    expect(fmtUsdSigned(1_200)).toBe("+US$ 1,2 mil");
    expect(fmtUsdSigned(-3_400)).toBe("-US$ 3,4 mil");
    expect(fmtUsdSigned(0)).toBe("US$ 0");
    expect(fmtUsdSigned(Number.NaN)).toBe("Indisponivel");
  });

  test("wallet kinds and tag filters", () => {
    expect(walletTypeWord("smart_money")).toBe("Smart money");
    expect(walletTypeWord("kol")).toBe("KOL");
    expect(walletTypeWord("whale")).toBe("Baleia");
    expect(TAG_FILTERS.map((t) => t.label)).toEqual(["Todos", "Smart money", "KOL", "Dev", "Baleia", "Novas", "Suspeitos", "Snipers", "Bundle"]);
    expect(TAG_FILTERS.find((t) => t.label === "Smart money")!.value).toBe(3);
    expect(TAG_FILTERS.find((t) => t.label === "Todos")!.value).toBeNull();
  });
});

describe("signalRows", () => {
  const sig = (over: Partial<Signal> = {}): Signal => ({
    tsMs: NOW - 60_000,
    chainIndex: "501",
    walletType: "smart_money",
    walletCount: 3,
    amountUsd: 669.4,
    priceUsd: 0.000122,
    soldRatioPct: 64.29,
    token: { address: "ABCDefgh", symbol: "TOK", marketCap: 64_466, holders: 445, top10HoldPct: 17.9 },
    ...over,
  });

  test("sorted newest first with every column in words", () => {
    const rows = signalRows([sig({ tsMs: NOW - 300_000 }), sig({ tsMs: NOW - 60_000, amountUsd: 1 })], NOW);
    expect(rows[0].tsMs).toBe(NOW - 60_000);
    expect(rows[0].ago).toBe("ha 1 min");
    expect(rows[0].typeWord).toBe("Smart money");
    expect(rows[0].soldPct).toBe("64%");
    expect(rows[0].mcap).toBe("US$ 64,5 mil");
  });

  test("missing fields become Indisponivel, never zero", () => {
    const rows = signalRows([sig({ soldRatioPct: null, token: { address: null, symbol: null, marketCap: null, holders: null, top10HoldPct: null } })], NOW);
    expect(rows[0].soldPct).toBe("Indisponivel");
    expect(rows[0].mcap).toBe("Indisponivel");
    expect(rows[0].tokenSymbol).toBe("Indisponivel");
  });
});

describe("leaderboardRows", () => {
  const lb = (over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
    wallet: "7xKX...gAsU",
    realizedPnlUsd: 125_430.56,
    realizedPnlPct: 312.45,
    winRatePct: 68.5,
    avgBuyUsd: 2_340,
    txVolumeUsd: 890_234.5,
    txs: 342,
    lastActiveMs: NOW - 3_600_000,
    topTokens: [{ symbol: "SOL", pnlUsd: 38_120 }, { symbol: "USDC", pnlUsd: 45_230 }],
    ...over,
  });

  test("columns in words; missing values are Indisponivel", () => {
    const [row] = leaderboardRows([lb()], NOW);
    expect(row.pnlUsd).toBe("+US$ 125 mil");
    expect(row.pnlPct).toBe("312,4%");
    expect(row.winPct).toBe("68,5%");
    expect(row.txs).toBe("342");
    expect(row.lastActive).toBe("ha 1 h");
    expect(row.topTokens).toBe("SOL, USDC");
    const [empty] = leaderboardRows([lb({ topTokens: [], winRatePct: null, txs: null })], NOW);
    expect(empty.topTokens).toBe("Indisponivel");
    expect(empty.winPct).toBe("Indisponivel");
    expect(empty.txs).toBe("Indisponivel");
  });
});

describe("walletRows", () => {
  const w = (over: Partial<WalletRow> = {}): WalletRow => ({
    wallet: "2RH6...FFSK",
    holdPct: 76.75,
    boughtAmount: 767_501_192.5,
    avgBuyPrice: 0.0000619,
    realizedPnlUsd: 2_912.03,
    unrealizedPnlUsd: -150.2,
    ...over,
  });

  test("columns in words; null PnL stays Indisponivel", () => {
    const [row] = walletRows([w()]);
    expect(row.holdPct).toBe("76,75%");
    expect(row.realizedPnl).toBe("+US$ 2,9 mil");
    expect(row.unrealizedPnl).toBe("-US$ 150");
    const [nul] = walletRows([w({ realizedPnlUsd: null, avgBuyPrice: null, boughtAmount: null })]);
    expect(nul.realizedPnl).toBe("Indisponivel");
    expect(nul.avgBuy).toBe("Indisponivel");
    expect(nul.qty).toBe("Indisponivel");
  });
});

describe("onchainErrorText", () => {
  test("exact copy per code", () => {
    expect(onchainErrorText("no_credentials").text).toBe("Configure a chave do OnchainOS");
    expect(onchainErrorText("no_credentials").link?.href).toBe("/configuracoes");
    expect(onchainErrorText("provider_unauthorized").text).toBe("Chave, segredo ou passphrase recusados. Confira em Configuracoes");
    expect(onchainErrorText("provider_payment_required").text).toBe("Cota gratuita do mes esgotada no provedor. O sistema nao paga");
    expect(onchainErrorText("provider_payment_required").showCache).toBe(true);
    expect(onchainErrorText("budget_exhausted").text).toBe("Orcamento do mes esgotado, ajuste em Configuracoes");
    expect(onchainErrorText("pace_limited").text).toBe("Ritmo diario atingido, use Atualizar");
    expect(onchainErrorText("rate_limited").text).toBe("OnchainOS indisponivel agora");
    expect(onchainErrorText("provider_error").text).toBe("OnchainOS indisponivel agora");
    expect(onchainErrorText("schema").text).toBe("Resposta fora do contrato, descartada");
    expect(onchainErrorText("unsupported_chain").text).toBe("Rede sem suporte a este recurso");
    expect(onchainErrorText("bad_request").text).toBe("Pedido invalido");
  });

  test("an old local server and a refused origin say what to do, and are not \"fora do contrato\" (SRC-1)", () => {
    const stale = onchainErrorText("backend_stale");
    expect(stale.text).toBe("Esta consulta nao esta disponivel no servidor conectado. Verifique a conexao em Diagnostico");
    expect(stale.text).not.toContain("contrato");
    expect(stale.showCache).toBe(false);
    expect(onchainErrorText("origin_denied").text).toBe("O servidor local recusou o pedido desta origem. Abra a mesa pelo Inonu Trader");
    for (const code of ["backend_stale", "origin_denied"]) expect(/^[ -~]*$/.test(onchainErrorText(code).text)).toBe(true);
  });
});

describe("feedStateOfResource", () => {
  test("live inside ttl, stale when flagged, empty on error or zero rows", () => {
    expect(feedStateOfResource("ready", false, 3)).toBe("live");
    expect(feedStateOfResource("ready", true, 3)).toBe("stale");
    expect(feedStateOfResource("ready", false, 0)).toBe("empty");
    expect(feedStateOfResource("error", false, 3)).toBe("empty");
    expect(feedStateOfResource("loading", null, 0)).toBe("empty");
    expect(feedStateOfResource("idle", null, 0)).toBe("empty");
  });
});
