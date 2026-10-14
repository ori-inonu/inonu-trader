// T9.4, WAL-4, AC-WAL-3: "Minha carteira" of the Carteira tab. It only SHOWS what the connected address holds and did, read through the local gateway when the
// person clicks. Every number says how old it is and where it came from; one the provider did not give is a dash, never zero; nothing here sends or signs.
// Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DockWalletTab from "@/components/Desk/Dock/DockWalletTab";
import { HoldingsPanelView, momentText, networkLabel, scopeNetworks, type HoldingsPanelViewProps, type HoldingsReadout, type ResultReadout } from "@/components/Desk/Dock/HoldingsPanel";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import { SWITCHABLE_CHAINS } from "./chains";
import type { BalanceRow, HistoryRow, OverviewData, PnlRow } from "./holdings";

const ACCOUNT = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const noop = () => {};
const meta = (ageMs = 0) => ({ tier: "free" as const, cachedAtMs: 1, ageMs, stale: false, budget: { tier: "free" as const, used: 1, cap: null } });
const base = SWITCHABLE_CHAINS.find((c) => c.name === "Base") ?? SWITCHABLE_CHAINS[0]!;
const current = { chainIndex: base.chainIndex, name: base.name };
const brow = (over: Partial<BalanceRow> = {}): BalanceRow => ({ chainIndex: current.chainIndex, symbol: "ETH", tokenAddress: null, balance: 0.5, priceUsd: 3000, valueUsd: 1500, flaggedRisk: false, ...over });
const hrow = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  chainIndex: current.chainIndex, txHash: "0xabc123", atMs: Date.UTC(2026, 9, 13, 14, 3), kind: "token", symbol: "USDC", amount: 12.5, tokenAddress: "0xaaa", status: "success",
  feeNative: null, from: "0x11...0000", to: "0xAb...Ef01", flaggedByProvider: false, ...over,
});
const readout = (over: Partial<HoldingsReadout> = {}): HoldingsReadout => ({
  receivedAtMs: 1_000_000,
  networks: [current.chainIndex],
  value: { ok: true, data: { totalValueUsd: 1234.5 }, meta: meta(4000) },
  balances: { ok: true, data: { rows: [brow(), brow({ symbol: "ODD", balance: 10_000_000, priceUsd: null, valueUsd: null, flaggedRisk: true })], total: 2 }, meta: meta(2000) },
  history: { ok: true, data: { cursor: null, rows: [hrow(), hrow({ txHash: "0xdef", status: "fail", kind: null, amount: null })] }, meta: meta(1000) },
  ...over,
});
const overview = (over: Partial<OverviewData> = {}): OverviewData => ({
  winRatePct: 50, realizedPnlUsd: 120.5, buyCount: 10, sellCount: 4, buyVolumeUsd: 502.317, sellVolumeUsd: 300, avgBuyValueUsd: 50.23, top3PnlTokenPercent: 12, ...over,
});
const prow = (over: Partial<PnlRow> = {}): PnlRow => ({
  chainIndex: current.chainIndex, symbol: "GREG", tokenAddress: "0x7666", balanceAmount: 14432947.79, balanceUsd: 59.34, realizedUsd: 0, unrealizedUsd: -15.97, totalUsd: -15.97,
  totalPct: -20.99, positionPct: 100, lastActiveMs: Date.UTC(2026, 9, 12, 8, 5), ...over,
});
const premium = (ageMs: number) => ({ ...meta(ageMs), tier: "premium" as const, budget: { tier: "premium" as const, used: 1, cap: null } });
const resultReadout = (over: Partial<ResultReadout> = {}): ResultReadout => ({
  receivedAtMs: 1_000_000, chainIndex: current.chainIndex, timeFrame: 3,
  overview: { ok: true, data: overview(), meta: premium(3000) },
  pnl: { ok: true, data: { cursor: null, rows: [prow(), prow({ symbol: "WIN", totalUsd: 40, totalPct: 12.5, positionPct: 30, lastActiveMs: null })] }, meta: premium(1000) },
  ...over,
});

const props = (over: Partial<HoldingsPanelViewProps> = {}): HoldingsPanelViewProps => ({
  account: ACCOUNT, current, scope: "atual", readout: null, reading: false, onScope: noop, onRead: noop, onCancel: noop,
  timeFrame: 3, result: null, readingResult: false, onTimeFrame: noop, onReadResult: noop, onCancelResult: noop, ...over,
});
const draw = (over: Partial<HoldingsPanelViewProps> = {}) => renderToStaticMarkup(<HoldingsPanelView {...props(over)} />);

describe("without a connected wallet", () => {
  test("it says what it needs and offers nothing to click", () => {
    const html = draw({ account: null });
    expect(html).toContain('aria-label="Minha carteira"');
    expect(html).toContain("Conecte a carteira para ler os saldos e o historico do seu endereco");
    expect(html).toContain("Nada aqui assina ou envia");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<select");
  });
});

describe("connected, before reading", () => {
  test("the address, the network of the wallet and one button; it says what a reading costs and where the address goes", () => {
    const html = draw();
    expect(html).toContain(ACCOUNT);
    expect(html).toContain(current.name);
    expect(html).toContain("Atualizar carteira");
    expect(html).not.toContain("Cancelar");
    expect(html).toContain("3 leituras da OKX OnchainOS, da camada gratuita");
    expect(html).toContain("Conectar ou mudar o escopo");
    expect(html).toContain("nunca ao modelo");
    expect(html).not.toContain("Valor total");
  });

  test("on a network the app does not list, reading the current network is not offered and the reason is given", () => {
    const html = draw({ current: null });
    expect(html).toContain("Fora da lista do app");
    expect(html).toContain("A rede atual da carteira nao esta na lista do app");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Atualizar carteira/);
  });

  test("reading all the networks of the selector works from a network the app does not list", () => {
    const html = draw({ current: null, scope: "todas" });
    // the note of the first block (the result block has its own, about the network it reads)
    expect(html).not.toContain("ou leia todas as redes do seletor");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Atualizar carteira/);
  });

  test("while reading, the only button cancels", () => {
    const html = draw({ reading: true });
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Atualizar carteira");
  });

  test("the scopes: the network the wallet is on, or the selector capped at what the gateway takes", () => {
    expect(scopeNetworks("atual", current)).toEqual([current.chainIndex]);
    expect(scopeNetworks("atual", null)).toEqual([]);
    const all = scopeNetworks("todas", null);
    expect(all.length).toBeGreaterThan(1);
    expect(all.length).toBeLessThanOrEqual(20);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("after reading", () => {
  test("value, balances and history, with where they came from and how old they are", () => {
    const html = draw({ readout: readout(), nowMs: 1_006_000 });
    expect(html).toContain("US$ 1.234,50");
    expect(html).toContain("Origem: OKX OnchainOS pelo servidor local");
    // the oldest of the three (4 s) plus the 6 s on the screen
    expect(html).toContain("Lido ha 10 s");
    expect(html).toContain('aria-label="Saldos"');
    expect(html).toContain('aria-label="Historico"');
    expect(html).toContain("Mostrando 2 de 2, do maior valor para o menor");
    // seen live on a public wallet: airdropped tokens carry prices that no market pays, and the provider does not flag them
    expect(html).toContain("sem checar liquidez");
  });

  test("a balance with no price shows dashes, not US$ 0,00, and a token the provider flags says so", () => {
    const html = draw({ readout: readout(), nowMs: 1_000_000 });
    expect(html).toContain("Marcado como risco pelo provedor");
    expect(html).toContain("10.000.000");
    const odd = html.slice(html.indexOf("ODD"));
    expect(odd.slice(0, odd.indexOf("Historico"))).not.toContain("US$ 0,00");
    expect(html).toContain("1.500,00");
  });

  test("a history row: the moment in UTC, the kind, the quantity with its coin, the state, and the counterparties shortened", () => {
    const html = draw({ readout: readout(), nowMs: 1_000_000 });
    expect(html).toContain("2026-10-13 14:03 UTC");
    expect(html).toContain("Token");
    expect(html).toContain("12,5 USDC");
    expect(html).toContain("Confirmada");
    expect(html).toContain("Falhou");
    expect(html).toContain("0x11...0000");
    expect(html).toContain("0xAb...Ef01");
  });

  test("a row the provider flagged is not called confirmed", () => {
    const html = draw({ readout: readout({ history: { ok: true, data: { cursor: null, rows: [hrow({ flaggedByProvider: true })] }, meta: meta() } }), nowMs: 1_000_000 });
    expect(html).toContain("Marcada pelo provedor");
    expect(html).not.toContain("Confirmada");
  });

  test("every returned holding is accessible and provider coverage stays explicit", () => {
    const rows = Array.from({ length: 12 }, (_, i) => brow({ symbol: `T${i}`, valueUsd: 100 - i }));
    const html = draw({ readout: readout({ balances: { ok: true, data: { rows, total: 40 }, meta: meta() } }), nowMs: 1_000_000 });
    expect(html).toContain("Mostrando 12 de 40");
    expect(html).toContain("T9<");
    expect(html).toContain("T11<");
  });

  test("a tiny positive token price never appears as a zero-dollar price", () => {
    const rows = [brow({ priceUsd: 0.000002934 })];
    const html = draw({ readout: readout({ balances: { ok: true, data: { rows, total: 1 }, meta: meta() } }) });
    expect(html).toContain("US$ 0,000002934");
  });

  test("nothing held and nothing done are said as such, not as an error", () => {
    const html = draw({
      readout: readout({
        balances: { ok: true, data: { rows: [], total: 0 }, meta: meta() },
        history: { ok: true, data: { cursor: null, rows: [] }, meta: meta() },
      }),
      nowMs: 1_000_000,
    });
    expect(html).toContain("Nenhum saldo nas redes lidas");
    expect(html).toContain("Nenhuma movimentacao no periodo que o provedor guarda");
  });

  test("each block fails on its own, with its own sentence", () => {
    const html = draw({
      readout: readout({
        value: { ok: false, error: "backend_stale" },
        balances: { ok: false, error: "budget_exhausted" },
        history: { ok: false, error: "sem_dados" },
      }),
      nowMs: 1_000_000,
    });
    expect(html).toContain("O servidor local e de uma versao antiga");
    expect(html).toContain("A cota do mes desta camada acabou");
    expect(html).toContain("O provedor nao devolveu dados para este endereco");
    // no answer at all has no age
    expect(html).toContain("Lido -");
  });

  test("the networks read are named", () => {
    expect(draw({ readout: readout({ networks: [current.chainIndex, "999999"] }), nowMs: 1_000_000 })).toContain(`${current.name}, Rede 999999`);
    expect(networkLabel("999999")).toBe("Rede 999999");
    expect(momentText(Number.NaN)).toBe("-");
  });
});

describe("the result block", () => {
  test("before reading: the window, one button, what it costs, and nothing read", () => {
    const html = draw();
    expect(html).toContain("Resultado por token");
    expect(html).toContain('aria-label="Janela do resultado"');
    for (const label of ["1 dia", "3 dias", "7 dias", "1 mes", "3 meses"]) expect(html).toContain(label);
    expect(html).toContain("Ler resultado");
    expect(html).toContain("2 leituras da camada premium");
    expect(html).toContain("contam na cota do mes");
    expect(html).not.toContain('aria-label="Resultado por token"');
  });

  test("the window the person picked is the one selected", () => {
    expect(draw({ timeFrame: 4 })).toMatch(/<option value="4" selected="">1 mes<\/option>/);
  });

  test("on a network the app does not list, the result is not offered and the reason is given", () => {
    const html = draw({ current: null });
    expect(html).toContain("troque de rede em Trocar rede para ler o resultado");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Ler resultado/);
  });

  test("while reading the result, the only button of the block cancels it", () => {
    const html = draw({ readingResult: true });
    expect(html).toContain("Cancelar resultado");
    expect(html).not.toContain("Ler resultado");
  });

  test("after reading: the summary and the table, with where they came from, the window and the age", () => {
    const html = draw({ result: resultReadout(), nowMs: 1_006_000 });
    expect(html).toContain("Lido ha 9 s");
    expect(html).toContain(`em ${current.name}, janela de 7 dias`);
    expect(html).toContain("Origem: OKX OnchainOS pelo servidor local");
    expect(html).toContain("10 (US$ 502,32)");
    expect(html).toContain("4 (US$ 300,00)");
    expect(html).toContain("50,00%");
    expect(html).toContain("US$ 120,50");
    expect(html).toContain('aria-label="Resultado por token"');
    expect(html).toContain("-20,99%");
    expect(html).toContain("12,50%");
    expect(html).toContain("2026-10-12 08:05 UTC");
    expect(html).toContain("O resultado e o do provedor, nao um calculo daqui");
  });

  test("a rate over no sales is not shown as a rate, and a loss is marked", () => {
    const html = draw({ result: resultReadout({ overview: { ok: true, data: overview({ sellCount: 0, sellVolumeUsd: 0, winRatePct: 0 }), meta: premium(0) } }), nowMs: 1_000_000 });
    expect(html).toContain("sem vendas na janela, nao se aplica");
    expect(html).not.toContain("0,00%</dd>");
    const losing = html.slice(html.indexOf("GREG") - 120, html.indexOf("GREG"));
    expect(losing).toContain('data-tom="alerta"');
    const winning = html.slice(html.indexOf("WIN") - 120, html.indexOf("WIN"));
    expect(winning).toContain('data-tom="normal"');
  });

  test("a missing number is a dash, never zero", () => {
    const html = draw({
      result: resultReadout({
        overview: { ok: true, data: overview({ winRatePct: null, realizedPnlUsd: null, buyCount: null, buyVolumeUsd: null }), meta: premium(0) },
        pnl: { ok: true, data: { cursor: null, rows: [prow({ balanceUsd: null, totalUsd: null, totalPct: null, positionPct: null, lastActiveMs: null })] }, meta: premium(0) },
      }),
      nowMs: 1_000_000,
    });
    expect(html).not.toContain("US$ 0,00");
    expect(html).toContain("<dd>- (-)</dd>");
  });

  test("each part fails on its own, and an empty list is said as such", () => {
    const html = draw({ result: resultReadout({ overview: { ok: false, error: "budget_exhausted" }, pnl: { ok: true, data: { cursor: null, rows: [] }, meta: premium(0) } }), nowMs: 1_000_000 });
    expect(html).toContain("A cota do mes desta camada acabou");
    expect(html).toContain("Nenhum token com resultado calculado nesta rede");
    const other = draw({ result: resultReadout({ pnl: { ok: false, error: "backend_stale" } }), nowMs: 1_000_000 });
    expect(other).toContain("O servidor local e de uma versao antiga");
    expect(other).toContain("Resumo do resultado");
  });
});

describe("following a public address in read-only", () => {
  const watch = (over: Partial<NonNullable<HoldingsPanelViewProps["watch"]>> = {}): NonNullable<HoldingsPanelViewProps["watch"]> => ({ address: null, active: false, onWatch: () => null, onStop: noop, ...over });

  test("with no wallet behind the screen there is a box for a public address, with the warning about keys and phrases, and a button that follows it", () => {
    const html = draw({ account: null, watch: watch() });
    expect(html).toContain("Ou acompanhe um endereco publico");
    expect(html).toContain('aria-label="Endereco publico para acompanhar"');
    expect(html).toContain("Endereco publico (somente leitura)");
    expect(html).toContain("Cole so o endereco publico. Nunca cole chave privada nem frase de recuperacao.");
    expect(html).toContain("Nada aqui assina ou envia");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Acompanhar/);
  });

  test("the box is a plain text field for an address and nothing else: it is not a password field and it does not complete itself", () => {
    const html = draw({ account: null, watch: watch() });
    const input = html.match(/<input[^>]*>/)![0];
    expect(input).toContain('type="text"');
    expect(input).toContain('autoComplete="off"');
    expect(input).toContain('spellCheck="false"');
    expect(input).not.toContain("password");
  });

  test("the box is not offered when the page does not give a way to follow, nor when a wallet is already behind the screen", () => {
    expect(draw({ account: null })).not.toContain("Ou acompanhe um endereco publico");
    expect(draw({ watch: watch() })).not.toContain("Ou acompanhe um endereco publico");
  });

  test("while an address is followed the screen says it is read only and not connected, offers to stop, and reads every network (a followed address has no network of its own)", () => {
    const html = draw({ watch: watch({ address: ACCOUNT, active: true }) });
    expect(html).toContain("Somente leitura: este endereco nao esta conectado.");
    expect(html).toContain("Parar de acompanhar");
    expect(html).not.toContain(">Rede atual<");
    expect(html).toContain("Todas as redes do seletor");
  });

  test("a wallet that is connected shows no read only mark", () => {
    const html = draw({ watch: watch({ address: ACCOUNT, active: false }) });
    expect(html).not.toContain("Somente leitura: este endereco nao esta conectado.");
    expect(html).not.toContain("Parar de acompanhar");
  });
});

describe("what the panel never is", () => {
  test("nothing in any state has a field to type (the only input is the checkbox of consent), and the text carries no accent, middle dot or dash", () => {
    for (const html of [draw({ account: null }), draw(), draw({ readout: readout(), nowMs: 1_000_000 }), draw({ reading: true }), draw({ result: resultReadout(), nowMs: 1_000_000 })]) {
      for (const input of html.matchAll(/<input[^>]*>/g)) expect(input[0]).toContain('type="checkbox"');
      expect(html).not.toMatch(/type="(text|password|search|number)"/);
      expect(html).not.toContain("<textarea");
      const visible = html.replace(/<[^>]*>/g, " ");
      expect(visible).not.toMatch(/[^\x20-\x7e]/);
    }
  });

  test("no state offers a way to send or sign", () => {
    for (const html of [draw(), draw({ readout: readout(), nowMs: 1_000_000 }), draw({ reading: true }), draw({ readingResult: true }), draw({ result: resultReadout(), nowMs: 1_000_000 })]) {
      const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
      for (const label of buttons) expect(label).toMatch(/^(Atualizar carteira|Cancelar|Ler resultado|Cancelar resultado|Pedir ao Inonu|Atualizar para analisar)$/);
    }
  });
});

describe("the Carteira tab", () => {
  test("the panel is part of the on-screen copy of the tab, and the other copy holds none", () => {
    const wallet = {} as UseOkxWalletResult;
    const names = (withSwitch: boolean) => JSON.stringify(DockWalletTab({ wallet, withSwitch }), (key, value) => (key === "type" && typeof value === "function" ? value.name : value));
    expect(names(true)).toContain("HoldingsPanel");
    expect(names(false)).not.toContain("HoldingsPanel");
  });
});
