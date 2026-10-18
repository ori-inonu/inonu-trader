import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MultichainPanelView, type MultichainPanelViewProps } from "../components/MultichainPanel/MultichainPanel";
import type { ChainBalanceResult, MultichainSnapshot } from "./evm-multichain";

const account = "0x2222222222222222222222222222222222222222";
const observedAtMs = 1_800_000_000_123;
const chain: ChainBalanceResult = {
  account, chainIndex: "196", chainIdHex: "0xc4", name: "X Layer", status: "ok",
  block: "1715004", rawBlock: "0x1a2b3c", source: "public-rpc-reported",
  rpcHost: "rpc.xlayer.tech", observedAtMs, error: null,
  native: { symbol: "OKB", amount: "0", rawRpc: "0x0", rawUnits: "0", decimals: 18, decimalsSource: "configured" },
  tokens: [{ symbol: "USDT", amount: "9007199254.740993", rawRpc: "0x" + "20000000000001".padStart(64, "0"),
    rawUnits: "9007199254740993", decimals: 6, decimalsSource: "configured", contract: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d" }],
};
const snapshot: MultichainSnapshot = { account, observedAtMs, chains: [chain] };
const solana: MultichainPanelViewProps["solana"] = {
  available: true, ready: true,
  snapshot: { status: "connected", account: "So11111111111111111111111111111111111111112", observedAtMs, error: null,
    balances: { sol: "1.25", slot: "123", tokens: [{ symbol: "USDC", mint: "fixture-mint", amount: "2.5" }] } },
  connect: async () => {}, refresh: async () => {}, disconnect: () => {},
};

function render(multichain: MultichainSnapshot | null = snapshot, now = observedAtMs, evmAccount: string | null = account) {
  return renderToStaticMarkup(createElement(MultichainPanelView, {
    evmAccount, evmAvailable: true, multichain, multichainBusy: false,
    multichainError: null, readMultichain: () => {}, solana, now,
  }));
}

describe("multichain observations rendered by the actual panel", () => {
  it("shows limited coverage, quantities and collapsed exact provenance", () => {
    const html = render();
    for (const text of ["Saldos multichain", "Consultar redes configuradas", "Cobertura parcial", "redes e ativos configurados",
      "total em USD", "capital disponível", "9007199254.740993", "Leitura recente", "2027-01-15T08:00:00.123Z",
      "Idade: 0 s", "X Layer (196, 0xc4)", account, "rpc.xlayer.tech", "RPC pública", "1715004", "0x1a2b3c",
      "9007199254740993", "0x" + "20000000000001".padStart(64, "0"),
      "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", "Escala configurada: 6", "decimals() não consultado"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("<dt>OKB</dt><dd>0</dd>");
    expect(html).toContain("<summary>Detalhes da leitura</summary>");
    expect(html).not.toMatch(/<details\b[^>]*\bopen(?:\s|=|>)/);
    expect(html).not.toContain("Consultar todas as redes");
    expect(html).not.toContain("Patrimônio multichain");
    expect(html).toContain("Saldos na Solana");
    expect(html).toContain("<dt>SOL</dt><dd>1.25</dd>");
    expect(html).toContain("Atualizar Solana");
  });

  it("uses each chain clock at the inclusive sixty-second boundary", () => {
    expect(render(snapshot, observedAtMs + 60_000)).toContain("Leitura recente");
    const old = render({ ...snapshot, observedAtMs: observedAtMs + 60_001 }, observedAtMs + 60_001);
    expect(old).toContain("Leitura desatualizada");
    expect(old).not.toContain("Leitura recente");
    expect(old).toContain("Idade: 60 s");
    for (const timestamp of [null, NaN, Infinity, observedAtMs + 1]) {
      const html = render({ ...snapshot, chains: [{ ...chain, observedAtMs: timestamp }] });
      expect(html).toContain("Horário desconhecido");
      expect(html).not.toContain("Leitura recente");
      expect(html).not.toContain("Leitura desatualizada");
    }
  });

  it("does not render an observation belonging to another account", () => {
    const html = render(snapshot, observedAtMs, "0x3333333333333333333333333333333333333333");
    expect(html).not.toContain("9007199254.740993");
    expect(html).not.toContain(account);
    expect(html).not.toContain("Detalhes da leitura");
    expect(render(snapshot, observedAtMs, null)).toContain("Cobertura parcial");
  });

  it("renders an unavailable chain distinctly from valid zero", () => {
    const html = render({ ...snapshot, chains: [{ ...chain, status: "error", native: null, tokens: [], observedAtMs: null, error: "a RPC pública não respondeu" }] });
    expect(html).toContain("indisponível: a RPC pública não respondeu");
    expect(html).not.toContain("<dt>OKB</dt><dd>0</dd>");
    expect(html).not.toContain("9007199254.740993");
    expect(html).toContain("Horário desconhecido");
  });
});
