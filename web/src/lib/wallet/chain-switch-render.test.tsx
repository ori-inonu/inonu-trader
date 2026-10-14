// T9.2, WAL-2: the "Trocar rede" section of the Carteira tab. A person picks one of the networks the app lists and clicks; the wallet asks them to
// confirm. The view only draws and calls back; the hook that finds the wallet and does the switch is not rendered here. Plain ASCII, nothing that
// blinks, no word of an order. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DockWalletTab from "@/components/Desk/Dock/DockWalletTab";
import { WalletChainSwitchView, type WalletChainSwitchViewProps } from "@/components/Desk/Dock/WalletChainSwitch";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import { SWITCHABLE_CHAINS } from "./chains";

const noop = () => {};
const props = (over: Partial<WalletChainSwitchViewProps> = {}): WalletChainSwitchViewProps => ({
  chains: SWITCHABLE_CHAINS, connected: true, currentChainIdHex: "0x8f", selected: "0x8f", busy: false, message: null, onSelect: noop, onSwitch: noop, ...over,
});
const draw = (over: Partial<WalletChainSwitchViewProps> = {}) => renderToStaticMarkup(<WalletChainSwitchView {...props(over)} />);

describe("the section", () => {
  test("without a connected wallet it says what to do and offers nothing to click", () => {
    const html = draw({ connected: false, currentChainIdHex: null });
    expect(html).toContain("Conecte a carteira para trocar de rede");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<button");
  });

  test("connected: one choice per network of the list, the current one marked, and the button waits for another one", () => {
    const html = draw();
    expect(html).toContain('aria-label="Rede da carteira"');
    expect(html.match(/<option/g)?.length).toBe(SWITCHABLE_CHAINS.length);
    expect(html).toContain("Monad (atual)");
    for (const name of ["X Layer", "Ethereum", "BNB Chain", "Base", "Arbitrum One", "Polygon", "Optimism"]) expect(html).toContain(name);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Trocar rede<\/button>/);
    const other = draw({ selected: "0x2105" });
    expect(other).toMatch(/<button(?![^>]*disabled)[^>]*>Trocar rede<\/button>/);
    expect(other).toMatch(/<option[^>]*value="0x2105"[^>]*selected=""|<option[^>]*selected=""[^>]*value="0x2105"/);
  });

  test("while the wallet is asking the person, the choice and the button wait", () => {
    const html = draw({ selected: "0x2105", busy: true });
    expect(html).toContain("Aguardando a carteira");
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aguardando a carteira<\/button>/);
  });

  test("a network the app does not list is said as it is, not hidden and not guessed", () => {
    const html = draw({ currentChainIdHex: "0x999", selected: "0x8f" });
    expect(html).toContain("Rede atual da carteira: 0x999, fora da lista do app");
    expect(html).not.toContain("(atual)");
  });

  test("the result is said in a status line, as the wallet answered, in our words", () => {
    expect(draw({ message: { tone: "ok", text: "Rede trocada para Base" } })).toMatch(/role="status"[^>]*>[^<]*Rede trocada para Base/);
    const failed = draw({ message: { tone: "erro", text: "Voce recusou o pedido na carteira. Nada foi alterado" } });
    expect(failed).toContain("Voce recusou o pedido na carteira. Nada foi alterado");
    expect(failed).toContain('data-tone="erro"');
  });

  test("it tells that the wallet confirms, that an unknown network is added only with that confirmation, and that nothing is sent", () => {
    const html = draw();
    expect(html).toContain("A troca pede a sua confirmacao na carteira");
    expect(html).toContain("Se a carteira nao conhecer a rede, ela so e adicionada com a sua confirmacao");
    expect(html).toContain("Nenhuma transacao e enviada");
    expect(html).toContain("A leitura cobre as redes da lista e a conta Solana separadamente");
  });

  test("the tab mounts the switch only when it is the copy on screen: two copies would find the wallet twice", () => {
    const wallet = {} as UseOkxWalletResult;
    const names = (withSwitch: boolean) => JSON.stringify(DockWalletTab({ wallet, withSwitch }), (key, value) => (key === "type" && typeof value === "function" ? value.name : value));
    expect(names(true)).toContain("HoldingsPanel");
    expect(names(true)).not.toContain("PortfolioConsultation");
    expect(names(false)).not.toContain("WalletChainSwitch");
    expect(names(false)).toContain("DockWallet");
  });

  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks, no word of an order", () => {
    for (const html of [draw(), draw({ connected: false }), draw({ busy: true, selected: "0xa" }), draw({ currentChainIdHex: "0x999" }), draw({ message: { tone: "ok", text: "Rede Base adicionada e selecionada" } })]) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
    }
  });
});
