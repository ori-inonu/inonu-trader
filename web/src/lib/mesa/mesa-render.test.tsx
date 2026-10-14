import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeskDock, { walletStatusLabel } from "@/components/Desk/DeskDock";
import DeskRail, { skewLabel } from "@/components/Desk/DeskRail";
import JevStage from "@/components/Desk/JevStage";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import type { JevReadView } from "@/lib/jev-read";
import { capabilityRows, feedChips, FORBIDDEN_TEXT, jevStageModel, journalRows } from "./mesa-model";

const NOW = 1_791_742_100_000;

const read: JevReadView = {
  readId: "jr-1",
  instId: "BTC-USDT",
  atMs: NOW - 20_000,
  clockOffsetMs: null,
  state: {
    instId: "BTC-USDT", horizonMinutes: 5, mid: 83957.35, spreadBps: 0.12, bookImbalanceTop5: -0.31, volBpsPerMinute: 2.3,
    depthQuoteTop5: { bid: 120000, ask: 190000 }, returnsBps: { m1: 1.2, m5: -3.4, m15: 5.6, m30: 7.8 },
    flow60s: { count: 12, buyBase: 0.4, sellBase: 0.9, cvdBase: -0.5, imbalance: -0.38, vwap: 83950, lastPx: 83957.4, lastSide: "buy" },
    change24hPct: 1.4, rangePosition24h: 0.62, fundingRatePct: null,
  },
  insufficient: [],
  decision: { action: "sell", probabilities: { buy: 0.1, sell: 0.63, hold: 0.27 }, confidence: 0.63, latencyMs: 291, model: "jev-1.13.0", status: "ok", inputTokens: 894 },
};

const board = (r: JevReadView) => ({ updatedAtMs: NOW, reads: { [r.instId]: r }, recent: [r] });

describe("JevStage", () => {
  test("a fresh sell read is shown with its weights, what Jev saw and the advisory note", () => {
    const model = jevStageModel({ status: "ready", board: board(read), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    const html = renderToStaticMarkup(<JevStage model={model} last={83957.4} tickSz="0.1" change24hPct={1.4} systemOneLine={null} />);
    expect(html).toContain('data-tone="sell"');
    expect(html).toContain("VENDER");
    expect(html).toContain("63% de peso");
    expect(html).toContain('aria-label="Decisao do Inonu"');
    expect(html).toContain("Comprar");
    expect(html).toContain("O que o Inonu viu");
    expect(html).toContain("nao executa ordem nem assina nada");
    expect(html).toContain("jev-1.13.0, 291 ms");
    expect(html).toContain("83.957,4");
    expect(html).toContain("+1,40% em 24 h");
    expect(html).not.toMatch(FORBIDDEN_TEXT);
  });

  test("with no read it says so, draws no probability arcs and shows no number as a call", () => {
    const model = jevStageModel({ status: "absent", board: null, focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    const html = renderToStaticMarkup(<JevStage model={model} last={null} tickSz={null} change24hPct={null} systemOneLine={null} />);
    expect(html).toContain("INDISPONIVEL");
    expect(html).toContain("Peso indisponivel");
    expect(html).toContain("bun run jev-read --jev");
    expect(html).not.toContain("strokeDasharray");
    expect(html).not.toContain("stroke-dasharray");
    expect(html).not.toContain("COMPRAR");
    expect(html).not.toContain("VENDER");
    expect(html).not.toMatch(FORBIDDEN_TEXT);
  });

  test("a stale read is dimmed and labelled old", () => {
    const model = jevStageModel({ status: "ready", board: board({ ...read, atMs: NOW - 400_000 }), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    const html = renderToStaticMarkup(<JevStage model={model} last={1} tickSz="0.1" change24hPct={null} systemOneLine="System One, alavancagem em MON-USDT-SWAP: manter." />);
    expect(html).toContain('data-dimmed="true"');
    expect(html).toContain("Leitura velha");
    expect(html).toContain("System One, alavancagem");
  });
});

describe("DeskRail", () => {
  const chips = feedChips({
    desk: [{ id: "okx-public-ws", state: "live", lastMessageAtMs: NOW, freshnessMs: 5_000, reconnects: 0, detail: null }],
    jev: { status: "ready", ageMs: 5_000 },
    wallet: { status: "disconnected", available: true },
    operator: { status: "absent" },
  });

  test("lists every source with a spoken state, never by colour alone", () => {
    const html = renderToStaticMarkup(<DeskRail chips={chips} skewMs={69_500} nowMs={NOW} />);
    expect(html).toContain('aria-label="Saude das fontes de dados"');
    expect(html).toContain("OKX tempo real");
    expect(html).toContain("ao vivo");
    expect(html).toContain("sem ciclo do operador");
    expect(html).toContain("fora do ar");
    expect(html).not.toMatch(FORBIDDEN_TEXT);
  });

  test("the clock is on the exchange clock and flags a skewed local clock", () => {
    const html = renderToStaticMarkup(<DeskRail chips={chips} skewMs={69_500} nowMs={NOW} />);
    expect(html).toContain("UTC");
    expect(html).toContain("Relogio local 70 s atrasado em relacao a OKX");
  });

  test("until the skew is measured no clock is invented", () => {
    const html = renderToStaticMarkup(<DeskRail chips={chips} skewMs={null} nowMs={NOW} />);
    expect(html).toContain("--:--:--");
    expect(html).toContain("Relogio local nao comparado com a OKX");
  });

  test("skewLabel covers synced, behind and ahead", () => {
    expect(skewLabel(1_200)).toEqual({ text: "Relogio local sincronizado com a OKX", warn: false });
    expect(skewLabel(-30_000)).toEqual({ text: "Relogio local 30 s adiantado em relacao a OKX", warn: true });
    expect(skewLabel(null).warn).toBe(false);
  });
});

describe("DeskDock", () => {
  const noop = async () => {};
  const wallet = (overrides: Partial<UseOkxWalletResult> = {}): UseOkxWalletResult => ({
    available: true,
    ready: true,
    snapshot: { status: "disconnected", account: null, chainId: null, balances: null, observedAtMs: null, error: null },
    connect: noop,
    refresh: noop,
    switchToMonad: noop,
    switchToXLayer: noop,
    disconnect: () => {},
    revision: 0,
    identityKey: null,
    preflightTransaction: async () => ({ status: "blocked" as const, executionQualified: false as const, reason: "session_unavailable" }),
    getSessionToken: () => 0,
    subscribeSessionInvalidation: () => () => {},
    ...overrides,
  });
  const caps = capabilityRows({ desk: [], jev: { status: "absent", ageMs: null }, systemOne: { status: "absent", execution: null, reasons: [] }, wallet: { status: "disconnected", available: true }, operator: { status: "absent" }, hasDerivatives: false });

  test("a disconnected wallet offers an explicit Connect, nothing is read before the gesture", () => {
    const html = renderToStaticMarkup(<DeskDock wallet={wallet()} capabilities={caps} journal={[]} />);
    expect(html).toContain("Desconectada");
    expect(html).toContain(">Conectar<");
    expect(html).not.toContain(">Atualizar<");
    expect(html).toContain("Conta e saldos nao vao ao backend nem ao Inonu.");
    expect(html).toContain("Nenhuma leitura do Inonu ainda.");
    expect(html).not.toMatch(FORBIDDEN_TEXT);
  });

  test("without the extension Connect is disabled and the reason is stated", () => {
    const html = renderToStaticMarkup(<DeskDock wallet={wallet({ available: false })} capabilities={caps} journal={[]} />);
    expect(html).toContain("Extensao OKX Wallet nao encontrada");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Conectar<\/button>/);
  });

  test("a connected wallet shows its observed balances and the other controls", () => {
    const connected = wallet({
      snapshot: { status: "connected", account: "0x7F3a4c9B21e5D6f8A0b3C4D5e6F708192a3B4c5D6", chainId: "0xc4", balances: { network: "xlayer", okb: "1.5", usdt: "20.0", usdt0: "0", nativeUsdc: "3.25", usdcBridged: "0", usdcE: "0", block: "123456" }, observedAtMs: NOW, error: null },
    });
    const html = renderToStaticMarkup(<DeskDock wallet={connected} capabilities={caps} journal={[]} />);
    expect(html).toContain("Conectada na X Layer");
    expect(html).toContain("0x7F3a...c5D6");
    expect(html).toContain("OKB");
    expect(html).toContain("1.5");
    expect(html).toContain(">Atualizar<");
    expect(html).toContain(">Desconectar<");
    expect(html).not.toContain(">Conectar<");
  });

  test("the ecosystem matrix states each module and what blocks it", () => {
    const html = renderToStaticMarkup(<DeskDock wallet={wallet()} capabilities={caps} journal={[]} />);
    expect(html).toContain('aria-label="Ecossistema OKX e OnchainOS"');
    expect(html).toContain("Bloqueado");
    expect(html).toContain("OnchainOS cotacao e saldos");
    expect(html).toContain("chave da API Web3 da OKX");
  });

  test("the journal lists real reads newest first with their weights", () => {
    const rows = journalRows([read, { ...read, readId: "jr-2", instId: "ETH-USDT", decision: { ...read.decision!, action: "hold", confidence: 0.57, probabilities: { buy: 0.2, sell: 0.23, hold: 0.57 } } }], 5);
    const html = renderToStaticMarkup(<DeskDock wallet={wallet()} capabilities={caps} journal={rows} />);
    expect(html).toContain("Diario do Inonu");
    expect(html).toContain("Vender");
    expect(html).toContain("63%");
    expect(html).toContain("Manter");
    expect(html).toContain("ETH");
  });

  test("walletStatusLabel names every state", () => {
    const s = (status: UseOkxWalletResult["snapshot"]["status"], chainId: string | null = null) => walletStatusLabel({ status, account: null, chainId, balances: null, observedAtMs: null, error: null }, true);
    expect(s("connecting")).toBe("Aguardando autorizacao na OKX Wallet");
    expect(s("connected", "0x8f")).toBe("Conectada na Monad");
    expect(s("wrong-network")).toBe("Troque para Monad ou X Layer");
    expect(s("error")).toBe("Nao foi possivel concluir a consulta");
    expect(walletStatusLabel({ status: "disconnected", account: null, chainId: null, balances: null, observedAtMs: null, error: null }, false)).toBe("Extensao OKX Wallet nao encontrada");
  });
});
