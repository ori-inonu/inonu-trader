// T4.5: the tail of the Inonu tab. Today's totals and the latest requests of the ledger, under the button that asks. Pure view, drawn without a
// network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DockInonu from "@/components/Desk/Dock/DockInonu";
import { InonuLedgerTailView } from "@/components/Desk/Dock/InonuLedgerTail";

describe("the tail of the Inonu tab", () => {
  test("the totals of the day and each latest request are lines of a list under a titled section", () => {
    const html = renderToStaticMarkup(<InonuLedgerTailView tail={{ headline: "Hoje: 2 consultas ao modelo, 1.500 tokens, custo em dolar nao medido", recent: ["ha 30 s, ativo, jev-latest, respondido, 740 tokens, 0,8 s", "ha 2 min, token, sem modelo, recusado (sem registros de carteiras)"] }} />);
    expect(html).toContain('aria-label="Ultimos pedidos ao Inonu"');
    expect(html).toContain("Ultimos pedidos");
    expect(html).toContain("Hoje: 2 consultas ao modelo, 1.500 tokens, custo em dolar nao medido");
    expect(html.match(/<li/g)?.length).toBe(2);
    // the list holds the refused requests too, while the headline counts only the consultations of the model: the section says so
    expect(html).toContain("A lista inclui os pedidos recusados");
    expect(html).toContain("recusado (sem registros de carteiras)");
  });

  test("with nothing to list there is a headline and no empty list", () => {
    const html = renderToStaticMarkup(<InonuLedgerTailView tail={{ headline: "Hoje: nenhuma consulta ao modelo", recent: [] }} />);
    expect(html).toContain("Hoje: nenhuma consulta ao modelo");
    expect(html).not.toContain("<ul");
  });

  test("the tab holds it under the panel that asks, and plain ASCII with nothing that blinks", () => {
    const tab = renderToStaticMarkup(<InonuLedgerTailView tail={{ headline: "O registro de pedidos nao esta disponivel agora", recent: [] }} />);
    expect(/^[\x20-\x7e\s]*$/.test(tab.replace(/<[^>]*>/g, " "))).toBe(true);
    expect(tab).not.toMatch(/animation|blink|pulse/i);
    // the tab itself stays a plain function without hooks: the tail is a child element with its own hooks
    const element = DockInonu({ instId: "BTC-USDT" });
    const text = JSON.stringify(element, (key, value) => (key === "type" && typeof value === "function" ? value.name : value));
    expect(text).toContain("InonuAsk");
    expect(text).toContain("InonuLedgerTail");
  });
});
