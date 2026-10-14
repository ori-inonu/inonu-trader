// T9.1 and T9.2, WAL-1 and WAL-2: Solana in the "Trocar rede" list of the Carteira tab. Solana is not an EVM network: the extension keeps its account apart, so there is
// nothing to switch. Choosing it in the list and clicking connects the Solana account (the click of a person, the wallet asks them), and says so. Pure drawing.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DockWalletTab from "@/components/Desk/Dock/DockWalletTab";
import { WalletChainSwitchView, type WalletChainSwitchViewProps } from "@/components/Desk/Dock/WalletChainSwitch";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import { SWITCHABLE_CHAINS } from "./chains";
import type { SolanaSide } from "./solana-account";

const SOL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const noop = () => {};
const side = (over: Partial<SolanaSide> = {}): SolanaSide => ({ available: true, ready: true, connecting: false, account: null, errorText: null, notice: null, onConnect: noop, ...over });
const props = (over: Partial<WalletChainSwitchViewProps> = {}): WalletChainSwitchViewProps => ({
  chains: SWITCHABLE_CHAINS, connected: true, currentChainIdHex: "0x8f", selected: "0x8f", busy: false, message: null, onSelect: noop, onSwitch: noop, solana: side(), ...over,
});
const draw = (over: Partial<WalletChainSwitchViewProps> = {}) => renderToStaticMarkup(<WalletChainSwitchView {...props(over)} />);
const text = (html: string) => html.replace(/<[^>]*>/g, " ");

describe("Solana in the list", () => {
  test("it is one more choice after the networks of the list, and the EVM choices are all still there", () => {
    const html = draw();
    expect(html.match(/<option/g)?.length).toBe(SWITCHABLE_CHAINS.length + 1);
    expect(html).toMatch(/<option[^>]*value="solana"[^>]*>Solana<\/option>/);
    for (const name of ["Monad", "X Layer", "Ethereum", "Base"]) expect(html).toContain(name);
  });

  test("with Solana chosen, the button connects the Solana account and does not claim to switch a network", () => {
    const html = draw({ selected: "solana" });
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Conectar Solana<\/button>/);
    expect(html).not.toContain(">Trocar rede</button>");
    expect(html).toContain("A Solana tem conta propria na carteira");
    expect(html).toContain("nao ha rede para trocar");
  });

  test("while the wallet is asking the person, the button waits", () => {
    expect(draw({ selected: "solana", solana: side({ connecting: true }) })).toMatch(/<button[^>]*disabled=""[^>]*>Aguardando a carteira<\/button>/);
  });

  test("connected: the choice says so and the button has nothing left to do", () => {
    const html = draw({ selected: "solana", solana: side({ account: SOL }) });
    expect(html).toMatch(/<option[^>]*value="solana"[^>]*>Solana \(conectada\)<\/option>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Solana conectada<\/button>/);
  });

  test("the reason a click did not connect is said, as the wallet answered, in our words", () => {
    const html = draw({ selected: "solana", message: { tone: "erro", text: "Voce recusou o pedido na carteira. Nada foi alterado" } });
    expect(html).toContain("Voce recusou o pedido na carteira. Nada foi alterado");
    expect(html).toContain('data-tone="erro"');
  });

  test("a network of the list still switches as before when Solana is not the choice", () => {
    expect(draw({ selected: "0x2105" })).toMatch(/<button(?![^>]*disabled)[^>]*>Trocar rede<\/button>/);
    expect(draw()).toMatch(/<button[^>]*disabled=""[^>]*>Trocar rede<\/button>/);
    expect(draw()).not.toContain("A Solana tem conta propria");
  });
});

describe("the wallet has only the Solana side", () => {
  test("the EVM networks are not offered, Solana is, and the person is told what the others need", () => {
    const html = draw({ connected: false, currentChainIdHex: null, selected: "0x8f" });
    expect(html.match(/<option/g)?.length).toBe(1);
    expect(html).toMatch(/<option[^>]*value="solana"[^>]*selected=""|<option[^>]*selected=""[^>]*value="solana"/);
    expect(html).toContain("Conectar Solana");
    expect(html).toContain("Para trocar entre as redes EVM, conecte a carteira EVM");
  });

  test("it is the same with Solana already connected", () => {
    const html = draw({ connected: false, currentChainIdHex: null, selected: "solana", solana: side({ account: SOL }) });
    expect(html).toContain("Solana conectada");
  });
});

describe("the extension has no Solana provider", () => {
  test("with a connected EVM wallet, the choice is listed but cannot be taken, and the reason is on it", () => {
    const html = draw({ solana: side({ available: false, ready: true }) });
    expect(html).toMatch(/<option[^>]*disabled=""[^>]*>Solana \(nao encontrada\)<\/option>/);
    expect(html).toMatch(/<option[^>]*value="0x8f"/);
  });

  test("while it is still being looked for, the choice does not claim the absence", () => {
    const html = draw({ solana: side({ available: false, ready: false }) });
    expect(html).not.toContain("nao encontrada");
  });

  test("with no wallet of either kind it is what it always was: a sentence and nothing to click", () => {
    const html = draw({ connected: false, currentChainIdHex: null, solana: side({ available: false, ready: true }) });
    expect(html).toContain("Conecte a carteira para trocar de rede");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<button");
  });
});

describe("the tab and how it is written", () => {
  test("the tab still mounts the switch and the panel (the two that share the one Solana account) only on the copy that is on screen", () => {
    const wallet = {} as UseOkxWalletResult;
    const names = (withSwitch: boolean) => JSON.stringify(DockWalletTab({ wallet, withSwitch }), (key, value) => (key === "type" && typeof value === "function" ? value.name : value));
    expect(names(true)).not.toContain("PortfolioConsultation");
    expect(names(true)).toContain("HoldingsPanel");
    expect(names(false)).not.toContain("WalletChainSwitch");
    expect(names(false)).not.toContain("HoldingsPanel");
    expect(names(false)).toContain("DockWallet");
  });

  test("the reason a Solana click did not connect, and what the wallet told by itself, are said in the section", () => {
    const refused = draw({ selected: "solana", solana: side({ errorText: "Voce recusou o pedido na carteira. Nada foi alterado" }) });
    expect(refused).toContain("Voce recusou o pedido na carteira. Nada foi alterado");
    expect(refused).toContain('data-tone="erro"');
    expect(draw({ selected: "solana", solana: side({ notice: "A carteira Solana foi desconectada. Conecte de novo para ler." }) })).toContain("A carteira Solana foi desconectada");
    // and only when Solana is the choice
    expect(draw({ selected: "0x2105", solana: side({ errorText: "Voce recusou o pedido na carteira. Nada foi alterado" }) })).not.toContain("Voce recusou");
  });

  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks, no word of an order", () => {
    const states = [draw(), draw({ selected: "solana" }), draw({ selected: "solana", solana: side({ account: SOL }) }), draw({ connected: false, selected: "solana" }), draw({ solana: side({ available: false }) })];
    for (const html of states) {
      const t = text(html);
      expect(/^[\x20-\x7e\s]*$/.test(t)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(t)).toBe(false);
    }
  });
});
