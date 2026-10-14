// "Minha carteira" with the one reading of both kinds of account (scope "tudo"): it is offered only when both accounts are there, it shows both addresses, one total, one list of
// holdings with the network of each, and it says what did not answer instead of passing a partial total for a whole one. Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HoldingsPanelView, readTarget, scopeNetworks, type HoldingsPanelViewProps, type HoldingsReadout } from "@/components/Desk/Dock/HoldingsPanel";
import { SWITCHABLE_CHAINS } from "./chains";
import type { BalanceRow } from "./holdings";
import type { SolanaSide } from "./solana-account";

const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const SOL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const noop = () => {};
const meta = (ageMs = 0) => ({ tier: "free" as const, cachedAtMs: 1, ageMs, stale: false, budget: { tier: "free" as const, used: 1, cap: null } });
const base = SWITCHABLE_CHAINS.find((c) => c.name === "Base") ?? SWITCHABLE_CHAINS[0]!;
const current = { chainIndex: base.chainIndex, name: base.name };
const side = (over: Partial<SolanaSide> = {}): SolanaSide => ({ available: true, ready: true, connecting: false, account: SOL, errorText: null, notice: null, onConnect: noop, ...over });
const brow = (chainIndex: string, symbol: string, valueUsd: number | null): BalanceRow => ({ chainIndex, symbol, tokenAddress: null, balance: 1, priceUsd: valueUsd, valueUsd, flaggedRisk: false });
const readout = (over: Partial<HoldingsReadout> = {}): HoldingsReadout => ({
  receivedAtMs: 1_000_000,
  networks: [...SWITCHABLE_CHAINS.map((c) => c.chainIndex), "501"],
  value: { ok: true, data: { totalValueUsd: 1615 }, meta: meta(4000) },
  balances: { ok: true, data: { rows: [brow("1", "ETH", 1000), brow("501", "SOL", 375), brow(base.chainIndex, "ETH", 240)], total: 3 }, meta: meta(2000) },
  history: { ok: true, data: { cursor: null, rows: [] }, meta: meta(1000) },
  missing: [],
  ...over,
});
const props = (over: Partial<HoldingsPanelViewProps> = {}): HoldingsPanelViewProps => ({
  account: EVM, current, scope: "tudo", readout: null, reading: false, onScope: noop, onRead: noop, onCancel: noop,
  timeFrame: 3, result: null, readingResult: false, onTimeFrame: noop, onReadResult: noop, onCancelResult: noop,
  solana: side(), joint: { evmAddress: EVM, solanaAddress: SOL }, ...over,
});
const draw = (over: Partial<HoldingsPanelViewProps> = {}) => renderToStaticMarkup(<HoldingsPanelView {...props(over)} />);
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("when the one reading is offered", () => {
  test("with both accounts, it is the first choice and the chosen one, after the networks of the list and Solana", () => {
    const html = draw();
    expect(html.match(/<option[^>]*value="(tudo|atual|todas|solana)"/g)?.length).toBe(4);
    expect(html).toMatch(/<option[^>]*value="tudo"[^>]*selected=""[^>]*>EVM e Solana juntas<\/option>|<option[^>]*selected=""[^>]*value="tudo"[^>]*>EVM e Solana juntas<\/option>/);
    expect(html.indexOf('value="tudo"')).toBeLessThan(html.indexOf('value="atual"'));
  });

  test("without both accounts it is not offered, whatever the scope says", () => {
    expect(draw({ joint: undefined, scope: "todas" })).not.toMatch(/value="tudo"/);
    expect(draw({ joint: undefined, scope: "atual", solana: undefined })).not.toMatch(/value="tudo"/);
  });

  test("the choices that were there are still there, and the other scopes show only their own account", () => {
    const evmOnly = draw({ scope: "atual" });
    expect(evmOnly).toContain(EVM);
    expect(evmOnly).not.toContain(SOL);
    const solOnly = draw({ scope: "solana" });
    expect(solOnly).toContain(SOL);
    expect(solOnly).not.toContain(EVM);
  });
});

describe("the reading as one", () => {
  test("it shows both addresses whole, says the networks are both kinds, and offers to refresh", () => {
    const html = draw();
    expect(html).toContain(EVM);
    expect(html).toContain(SOL);
    expect(text(html)).toContain("EVM e Solana");
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Atualizar carteira<\/button>/);
    expect(html).not.toContain("Conectar Solana");
  });

  test("while it is being read, the only button cancels", () => {
    const html = draw({ reading: true });
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Atualizar carteira");
  });

  test("it says what a reading of both costs: groups of EVM networks and Solana apart, free, through the local server, never to the model", () => {
    const t = text(draw());
    expect(t).toContain("grupos de 4");
    expect(t).toContain("a Solana a parte");
    expect(t).toContain("nunca ao modelo");
    expect(t).toContain("Nada aqui assina ou envia");
  });

  test("total, holdings with the network of each, and where it came from and how old", () => {
    const html = draw({ readout: readout(), nowMs: 1_006_000 });
    expect(html).toContain("US$ 1.615,00");
    const t = text(html);
    expect(t).toContain("Solana");
    expect(t).toContain("Ethereum");
    expect(html).not.toContain("Rede 501");
    expect(html).toContain("Origem: OKX OnchainOS pelo servidor local");
    expect(t).toMatch(/em .*Ethereum.*Solana\./);
  });

  test("a complete reading does not say it is partial", () => {
    const t = text(draw({ readout: readout(), nowMs: 1_006_000 }));
    expect(t).not.toContain("Leitura parcial");
    expect(t).not.toContain("(parcial)");
  });
});

describe("what did not answer", () => {
  const missing = [
    { label: "BNB Chain", what: "saldos" as const, reason: "A OKX respondeu com erro." },
    { label: "BNB Chain", what: "valor" as const, reason: "A OKX respondeu com erro." },
    { label: "Solana", what: "historico" as const, reason: "A OKX respondeu com erro." },
  ];

  test("it is named, with the block and the reason, and the total says it is partial", () => {
    const html = draw({ readout: readout({ missing }), nowMs: 1_006_000 });
    const t = text(html);
    expect(t).toContain("Leitura parcial");
    expect(t).toContain("BNB Chain (saldos, valor)");
    expect(t).toContain("Solana (historico)");
    expect(t).toContain("A OKX respondeu com erro.");
    expect(t).toMatch(/US\$ 1\.615,00 \(parcial\)/);
  });

  test("a gap in the holdings alone does not call the total partial: the provider's total did not miss anything", () => {
    const t = text(draw({ readout: readout({ missing: [missing[0]!] }), nowMs: 1_006_000 }));
    expect(t).toContain("Leitura parcial");
    expect(t).not.toContain("(parcial)");
  });

  test("a block that failed whole says so by itself, and the others stay", () => {
    const html = draw({ readout: readout({ history: { ok: false, error: "provider_error" }, missing: [{ label: "Redes EVM", what: "historico", reason: "A OKX respondeu com erro." }] }), nowMs: 1_006_000 });
    expect(html).toContain("A OKX respondeu com erro");
    expect(html).toContain("US$ 1.615,00");
  });
});

describe("what is read", () => {
  test("the networks of the one reading are the EVM ones of the list and Solana last; the single target belongs to the other scopes", () => {
    const all = scopeNetworks("tudo", null);
    expect(all.at(-1)).toBe("501");
    expect(all.slice(0, -1)).toEqual(scopeNetworks("todas", null));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeLessThanOrEqual(20);
    // one address and the networks of its family: the joint reading is two targets, built where it is read
    expect(readTarget("tudo", { evmAccount: EVM, current, solanaAccount: SOL })).toBeNull();
  });
});

describe("how it is written", () => {
  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks, no word of an order", () => {
    const states = [
      draw(), draw({ reading: true }), draw({ readout: readout(), nowMs: 1_006_000 }),
      draw({ readout: readout({ missing: [{ label: "Solana", what: "saldos", reason: "A OKX respondeu com erro." }] }), nowMs: 1_006_000 }),
    ];
    for (const html of states) {
      const t = text(html);
      expect(/^[\x20-\x7e\s]*$/.test(t)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(t)).toBe(false);
    }
  });
});
