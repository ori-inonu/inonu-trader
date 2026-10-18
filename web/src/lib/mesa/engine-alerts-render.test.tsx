// ASK-13, AC-ASK-7, T7.10: the alerts of the engine in the bell of the top bar. Each alert is a sentence about what changed and a button that
// asks the Inonu; the alerts themselves are computed here and never call the model (the files that make them do not even reach the client
// of the model). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertsMenu } from "@/components/Desk/TopbarAlerts";
import type { EngineAlert } from "@/lib/inonu/engine-alerts";
import { FORBIDDEN_TEXT } from "./mesa-model";

const NOW = 1_800_000_000_000;
const noop = () => {};
const alerts: EngineAlert[] = [
  { id: "BTC-USDT|zona_nova|z1", instId: "BTC-USDT", kind: "zona_nova", text: "Zona de oferta nova entre 101,2 e 101,6, nota 71,00", atMs: NOW - 5_000 },
  { id: "BTC-USDT|absorcao|c", instId: "BTC-USDT", kind: "absorcao", text: "Absorcao compradora, volume 2,5 vezes o das velas passadas", atMs: NOW - 5 * 60_000 },
];
const draw = (over: Partial<Parameters<typeof AlertsMenu>[0]> = {}) =>
  renderToStaticMarkup(<AlertsMenu instId="BTC-USDT" prices={{ "BTC-USDT": 100 }} nowMs={NOW} engineNowMs={NOW} engineAlerts={alerts} engineUnseen={2} onEngineAsk={noop} onEngineSeen={noop} {...over} />);

describe("the engine alerts in the bell", () => {
  test("a section of its own, with one sentence and one button per alert", () => {
    const html = draw();
    expect(html).toContain("Alertas do motor");
    expect(html).toContain('aria-label="Alertas do motor"');
    for (const alert of alerts) expect(html).toContain(alert.text);
    expect(html.match(/>Pedir ao Inonu</g)).toHaveLength(2);
    expect(html).toContain('aria-label="Pedir ao Inonu sobre: Zona de oferta nova entre 101,2 e 101,6, nota 71,00"');
  });

  test("each alert says how long ago it was, and that nothing asked the model", () => {
    const html = draw();
    expect(html).toContain("agora");
    expect(html).toContain("ha 5 min");
    expect(html).toContain("Calculados aqui, sem modelo");
    expect(html).toContain("So o botao Pedir ao Inonu consulta o modelo");
  });

  test("the badge counts what the person has not seen yet, from the engine too", () => {
    const html = draw();
    expect(html).toMatch(/data-badge=""[^>]*>2</);
    expect(html).toContain("2 alertas dispararam");
    expect(draw({ engineUnseen: 0 })).not.toContain("data-badge");
  });

  test("with none, the section says so and has no button", () => {
    const html = draw({ engineAlerts: [], engineUnseen: 0 });
    expect(html).toContain("Nenhuma mudanca do fluxo ou das zonas ainda");
    expect(html).not.toContain(">Pedir ao Inonu<");
  });

  test("without the engine props the bell is the one it was: price alerts only", () => {
    const html = renderToStaticMarkup(<AlertsMenu instId="BTC-USDT" prices={{ "BTC-USDT": 100 }} nowMs={NOW} />);
    expect(html).not.toContain("Alertas do motor");
    expect(html).toContain("Alertas de preco");
  });

  test("plain ASCII, no middle dot or dash, no word of an order", () => {
    const html = draw().replace(/ class="[^"]*"/g, "");
    expect(html).not.toMatch(/[·—–]/);
    expect(html).not.toMatch(FORBIDDEN_TEXT);
    expect(html).not.toMatch(/blink|pulse|piscar|pulsar/i);
  });
});

describe("an alert never calls the model", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  test("the files that detect, store and carry an alert do not reach the client of the model or the network", () => {
    for (const path of ["../inonu/engine-alerts.ts", "../inonu/useEngineAlerts.ts", "../inonu/ask-trigger.ts"]) {
      const source = read(path);
      expect(source).not.toMatch(/createInonuClient|\/inonu\/ask|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
      expect(source).not.toMatch(/from "\.\/client"/);
    }
  });

  test("the bell and the desk that wires it only leave a request in the trigger: neither reaches the client of the model", () => {
    for (const path of ["../../components/Desk/TopbarAlerts.tsx", "../../components/Desk/MesaView.tsx", "../../components/Desk/DeskRail.tsx"]) {
      const source = read(path);
      // the client of the model, or the address it posts to as a string; importing the ask-target or the ask-trigger helpers is fine
      expect(source).not.toMatch(/createInonuClient|from "@\/lib\/inonu\/client"|["'`]\/inonu\/ask|client\.ask\(/);
    }
  });
});
