// T9.4, WAL-4: "Minha carteira" with the Solana account. Solana is a second account of the OKX Wallet (its own provider, no network to switch), so the panel gets a scope
// of its own: the Solana account, network 501 alone. These tests draw the pure view and pin the pure choice of what is read (the family of the address decides the networks).
// Nothing here connects, reads or sends. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HoldingsPanelView, networkLabel, readTarget, scopeNetworks, type HoldingsPanelViewProps, type HoldingsReadout, type SolanaSide } from "@/components/Desk/Dock/HoldingsPanel";
import { SWITCHABLE_CHAINS } from "./chains";
import type { BalanceRow, HistoryRow } from "./holdings";

const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const SOL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const noop = () => {};
const meta = (ageMs = 0) => ({ tier: "free" as const, cachedAtMs: 1, ageMs, stale: false, budget: { tier: "free" as const, used: 1, cap: null } });
const base = SWITCHABLE_CHAINS.find((c) => c.name === "Base") ?? SWITCHABLE_CHAINS[0]!;
const current = { chainIndex: base.chainIndex, name: base.name };

const side = (over: Partial<SolanaSide> = {}): SolanaSide => ({ available: true, ready: true, connecting: false, account: SOL, errorText: null, notice: null, onConnect: noop, ...over });
const brow = (over: Partial<BalanceRow> = {}): BalanceRow => ({ chainIndex: "501", symbol: "SOL", tokenAddress: null, balance: 2.5, priceUsd: 150, valueUsd: 375, flaggedRisk: false, ...over });
const hrow = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  chainIndex: "501", txHash: "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW", atMs: Date.UTC(2026, 9, 13, 14, 3), kind: "token", symbol: "USDC",
  amount: 12.5, tokenAddress: MINT, status: "success", feeNative: 0.000005, from: "9WzD...AWWM", to: "Gh9Z...tYvQ", flaggedByProvider: false, ...over,
});
const readout = (over: Partial<HoldingsReadout> = {}): HoldingsReadout => ({
  receivedAtMs: 1_000_000,
  networks: ["501"],
  value: { ok: true, data: { totalValueUsd: 415 }, meta: meta(4000) },
  balances: { ok: true, data: { rows: [brow(), brow({ symbol: "USDC", tokenAddress: MINT, balance: 40, priceUsd: 1, valueUsd: 40 })], total: 2 }, meta: meta(2000) },
  history: { ok: true, data: { cursor: null, rows: [hrow()] }, meta: meta(1000) },
  ...over,
});
const props = (over: Partial<HoldingsPanelViewProps> = {}): HoldingsPanelViewProps => ({
  account: null, current: null, scope: "solana", readout: null, reading: false, onScope: noop, onRead: noop, onCancel: noop,
  timeFrame: 3, result: null, readingResult: false, onTimeFrame: noop, onReadResult: noop, onCancelResult: noop, solana: side(), ...over,
});
const draw = (over: Partial<HoldingsPanelViewProps> = {}) => renderToStaticMarkup(<HoldingsPanelView {...props(over)} />);
const text = (html: string) => html.replace(/<[^>]*>/g, " ");

describe("only the Solana side of the wallet exists", () => {
  test("the panel is there, with the one scope that can be read, and the account is shown whole", () => {
    const html = draw();
    expect(html).toContain('aria-label="Minha carteira"');
    expect(html).toContain(SOL);
    expect(html.match(/<option[^>]*value="(atual|todas|solana)"/g)?.length).toBe(1);
    expect(html).toMatch(/<option[^>]*value="solana"/);
    expect(html).toContain("Atualizar carteira");
    expect(html).not.toContain("Conecte a carteira para ler os saldos");
  });

  test("not connected yet: one button asks, and nothing can be read until the account is known", () => {
    const html = draw({ solana: side({ account: null }) });
    expect(html).toContain("Conectar Solana");
    expect(html).not.toContain("Atualizar carteira");
    expect(html).toContain("pede a sua confirmacao");
    expect(html).toContain("Nada aqui assina ou envia");
  });

  test("while the wallet is asking the person, the button waits", () => {
    const html = draw({ solana: side({ account: null, connecting: true }) });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aguardando a carteira<\/button>/);
  });

  test("the reason a click did not connect, and what the wallet told by itself, are each said", () => {
    const refused = draw({ solana: side({ account: null, errorText: "Voce recusou o pedido na carteira. Nada foi alterado" }) });
    expect(refused).toContain("Voce recusou o pedido na carteira. Nada foi alterado");
    expect(refused).toContain('data-tom="erro"');
    expect(draw({ solana: side({ account: null, notice: "A carteira Solana foi desconectada. Conecte de novo para ler." }) })).toContain("A carteira Solana foi desconectada");
  });

  test("the extension was looked for and has no Solana provider: it says so and offers nothing to click", () => {
    const html = draw({ solana: side({ available: false, account: null }) });
    expect(html).toContain("A carteira Solana nao foi encontrada");
    expect(html).not.toContain("<button");
  });

  test("the looking is not over: it says it is looking, and does not claim the absence yet", () => {
    const html = draw({ solana: side({ available: false, ready: false, account: null }) });
    expect(html).toContain("Procurando a carteira Solana");
    expect(html).not.toContain("nao foi encontrada");
  });

  test("with no wallet of either kind the panel is what it always was", () => {
    const html = draw({ solana: undefined });
    expect(html).toContain("Conecte a carteira para ler os saldos e o historico do seu endereco");
    expect(html).not.toContain("<button");
  });
});

describe("both sides of the wallet exist", () => {
  test("the three scopes are offered, and the Solana one shows the Solana account, not the EVM one", () => {
    const html = draw({ account: EVM, current, scope: "solana" });
    expect(html.match(/<option[^>]*value="(atual|todas|solana)"/g)?.length).toBe(3);
    expect(html).toContain(SOL);
    expect(html).not.toContain(EVM);
    expect(text(html)).toContain("Solana");
  });

  test("the EVM scopes show the EVM account and the network of the wallet, and never the Solana account", () => {
    const html = draw({ account: EVM, current, scope: "atual" });
    expect(html).toContain(EVM);
    expect(html).toContain(current.name);
    expect(html).not.toContain(SOL);
  });

  test("with an EVM account and no Solana side, the panel offers the two scopes it always did", () => {
    const html = draw({ account: EVM, current, scope: "atual", solana: undefined });
    expect(html.match(/<option[^>]*value="(atual|todas|solana)"/g)?.length).toBe(2);
    expect(html).not.toMatch(/<option[^>]*value="solana"/);
  });
});

describe("after reading the Solana account", () => {
  test("value, balances and history, with Solana as the network and the mint kept whole in the key, not on screen", () => {
    const html = draw({ readout: readout(), nowMs: 1_006_000 });
    expect(html).toContain("US$ 415,00");
    expect(html).toContain("em Solana");
    expect(html).not.toContain("Rede 501");
    expect(html).toContain("Origem: OKX OnchainOS pelo servidor local");
    expect(html).toContain("9WzD...AWWM");
    expect(text(html).match(/\bSolana\b/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test("a block that failed says so by itself and the others stay", () => {
    const html = draw({ readout: readout({ history: { ok: false, error: "provider_error" } }) });
    expect(html).toContain("A OKX respondeu com erro");
    expect(html).toContain("US$ 415,00");
  });
});

describe("the result block follows the account that is read", () => {
  test("on Solana it is read for the Solana account and says so; it is off until that account is known", () => {
    const connected = draw();
    expect(connected).toMatch(/<button(?![^>]*disabled)[^>]*>Ler resultado<\/button>/);
    expect(connected).toContain("na Solana");
    const notYet = draw({ solana: side({ account: null }) });
    expect(notYet).toMatch(/<button[^>]*disabled=""[^>]*>Ler resultado<\/button>/);
    expect(notYet).not.toContain("A rede atual da carteira nao esta na lista do app");
  });
});

describe("what is read: the family of the address decides the networks", () => {
  test("Solana reads network 501 alone with the Solana account; nothing else", () => {
    expect(scopeNetworks("solana", null)).toEqual(["501"]);
    expect(readTarget("solana", { evmAccount: EVM, current, solanaAccount: SOL })).toEqual({ address: SOL, networks: ["501"] });
    expect(readTarget("solana", { evmAccount: EVM, current, solanaAccount: null })).toBeNull();
  });

  test("the EVM scopes read the EVM account and never network 501", () => {
    expect(readTarget("atual", { evmAccount: EVM, current, solanaAccount: SOL })).toEqual({ address: EVM, networks: [current.chainIndex] });
    expect(readTarget("atual", { evmAccount: EVM, current: null, solanaAccount: SOL })).toBeNull();
    expect(readTarget("atual", { evmAccount: null, current, solanaAccount: SOL })).toBeNull();
    const all = readTarget("todas", { evmAccount: EVM, current: null, solanaAccount: SOL });
    expect(all?.address).toBe(EVM);
    expect(all?.networks).not.toContain("501");
    expect(all?.networks.length).toBeGreaterThan(1);
  });

  test("the name of network 501 is Solana, wherever a row is drawn", () => {
    expect(networkLabel("501")).toBe("Solana");
    expect(networkLabel(base.chainIndex)).toBe(base.name);
    expect(networkLabel("999999")).toBe("Rede 999999");
  });
});

describe("how it is written", () => {
  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks, no word of an order", () => {
    const states = [
      draw(), draw({ solana: side({ account: null }) }), draw({ solana: side({ account: null, connecting: true }) }), draw({ solana: side({ available: false, account: null }) }),
      draw({ readout: readout(), nowMs: 1_006_000 }), draw({ account: EVM, current, scope: "atual" }),
    ];
    for (const html of states) {
      const t = text(html);
      expect(/^[\x20-\x7e\s]*$/.test(t)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(t)).toBe(false);
    }
  });

  test("nothing in the panel can sign or send", () => {
    const t = text(draw());
    expect(t).toContain("Nada aqui assina ou envia");
    expect(draw()).not.toMatch(/sendTransaction|signAndSend|signMessage/);
  });
});
