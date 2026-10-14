// The manual portfolio consultation of the Carteira tab, drawn as the server draws it (the Solana provider is looked for only in the browser, so no Solana side is shown here):
// for a page with no Solana side it must be what it was, word for word, and offer no choice of wallet. The Solana flow itself (connect, read, consult) is in the modules
// that carry it, which have their own tests, and was seen working in a browser page with a fake provider. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import PortfolioConsultation from "@/components/Desk/Dock/PortfolioConsultation";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";

const noop = () => {};
const wallet = (over: Record<string, unknown> = {}) =>
  ({
    available: true, ready: true, revision: 0, identityKey: null,
    snapshot: { status: "disconnected", account: null, chainId: null, observation: null },
    connect: async () => {}, refresh: async () => {}, switchToMonad: async () => {}, switchToXLayer: async () => {}, disconnect: noop,
    preflightTransaction: async () => ({}), getSessionToken: () => 0, subscribeSessionInvalidation: () => noop, ...over,
  }) as unknown as UseOkxWalletResult;
const draw = (w: UseOkxWalletResult = wallet()) => renderToStaticMarkup(<PortfolioConsultation wallet={w} candidate={null} />);
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("a page with no Solana side", () => {
  test("it is the EVM consultation it was: connect to read, partial on Monad or X Layer, nothing to consult", () => {
    const html = draw();
    expect(html).toContain("Conectar carteira para leitura");
    expect(html).toContain("Leitura parcial de Monad ou X Layer");
    expect(html).toContain("Conecte a carteira e atualize os saldos.");
    expect(html).toContain("Endereco da carteira nao enviado");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Consultar carteira com Inonu<\/button>/);
  });

  test("it offers no choice of wallet, since there is only one", () => {
    const html = draw();
    expect(html).not.toContain("Carteira a consultar");
    expect(html).not.toContain("aria-pressed");
    expect(text(html)).not.toContain("Conectar Solana");
  });

  test("with the EVM wallet connected and nothing read yet it still asks for the balances, as before", () => {
    const html = draw(wallet({ snapshot: { status: "connected", account: "0x" + "a".repeat(40), chainId: "0x8f", observation: null } }));
    expect(text(html)).toContain("carteira conectada");
    expect(text(html)).toContain("Rede Monad");
    expect(html).toContain("Atualizar leitura da carteira");
    expect(html).not.toContain("Conectar carteira para leitura");
  });

  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks", () => {
    for (const html of [draw(), draw(wallet({ snapshot: { status: "connected", account: "0x" + "a".repeat(40), chainId: "0xc4", observation: null } }))]) {
      expect(/^[\x20-\x7e\s]*$/.test(text(html))).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });
});
