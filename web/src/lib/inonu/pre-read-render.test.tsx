// The Inonu tab of the simple desk: the three lines the code already read, above the button that asks. Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DockInonu from "@/components/Desk/Dock/DockInonu";
import { InonuPreReadView } from "@/components/Desk/Dock/InonuPreRead";
import type { PreReadLine } from "./pre-read";

const lines: PreReadLine[] = [
  { kind: "cenario", tone: "worth", text: "Vale perguntar ao Inonu agora: 4 de 4 condicoes alinhadas e sem resposta recente." },
  { kind: "mercado", tone: "plain", text: "Mercado fluido: ir e voltar com US$ 1.000 custa menos de US$ 0,01 (menos de 0,01%)." },
  { kind: "resposta", tone: "plain", text: "Ultima resposta do Inonu: Esperar, ha 7 min." },
];

describe("what was read before asking", () => {
  const html = renderToStaticMarkup(<InonuPreReadView lines={lines} />);

  test("a titled section with one line for each thing the code read, and the promise that the model is asked only on a click", () => {
    expect(html).toContain('aria-label="O que o codigo ja leu"');
    expect(html).toContain("O que ja foi lido, sem consultar o modelo");
    expect(html.match(/<li/g)?.length).toBe(3);
    for (const line of lines) expect(html).toContain(line.text);
    expect(html).toContain("O Inonu so e consultado quando voce pedir.");
  });

  test("it holds no button and no field: it only shows", () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });

  test("plain ASCII, with no animation", () => {
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/[^\x20-\x7e]/);
    expect(html).not.toMatch(/animation|blink|pulse/i);
  });
});

describe("the Inonu tab", () => {
  const tree = (props: Parameters<typeof DockInonu>[0]) => JSON.stringify(DockInonu(props), (key, value) => (key === "type" && typeof value === "function" ? value.name : value));

  test("the tab stays a plain function: the pre-read, the ledger and the measurement are children that choose, by themselves, which desk they belong to", () => {
    const text = tree({ instId: "BTC-USDT", preRead: <InonuPreReadView lines={lines} /> });
    expect(text).toContain("InonuAsk");
    expect(text).toContain("InDetail");
    expect(text).toContain("InonuPreReadView");
    expect(text).toContain("InonuLedgerTail");
    expect(text).toContain("MedicaoPanel");
  });

  test("with no pre-read (an on-chain token) the tab has none, and still has the button that asks", () => {
    const text = tree({ instId: "BTC-USDT" });
    expect(text).not.toContain("InonuPreReadView");
    expect(text).toContain("InonuAsk");
  });
});
