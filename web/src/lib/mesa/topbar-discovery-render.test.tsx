// ASK-12, AC-ASK-7, T7.10: the discovery of "Pedir ao Inonu" ("melhores entradas agora") is asked from the top bar. The menu names the network it
// will read, says what it costs (the OnchainOS reads of that one click, at most 15), and holds the one button that asks: opening the
// panel asks nothing. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeskRail from "@/components/Desk/DeskRail";
import { DiscoveryMenu } from "@/components/Desk/TopbarDiscovery";
import { FORBIDDEN_TEXT, type FeedChip } from "./mesa-model";

const chips: FeedChip[] = [{ id: "okx-public-ws", label: "OKX tempo real", tone: "live", detail: null }];
const menu = () => renderToStaticMarkup(<DiscoveryMenu chainIndex="501" chainName="Solana" />);

describe("the discovery menu", () => {
  test("a named button in the bar, and a hidden panel that holds the only button that asks", () => {
    const html = menu();
    expect(html).toMatch(/<button[^>]*data-tool="discovery"[^>]*aria-expanded="false"/);
    expect(html).toContain("Descobrir");
    expect(html).toMatch(/role="group"[^>]*aria-label="Descobrir entradas"[^>]*hidden=""/);
    expect(html).toContain("Pedir ao Inonu: melhores entradas agora");
    expect(html.match(/Pedir ao Inonu: melhores entradas agora/g)).toHaveLength(1);
  });

  test("it names the network and says what the click costs, and that nothing runs before it", () => {
    const html = menu();
    expect(html).toContain("melhores entradas na rede Solana");
    expect(html).toContain("Nada roda antes do clique");
    expect(html).toContain("ate 15 leituras");
    expect(html).toContain("Consultivo");
  });

  test("plain ASCII, no middle dot or dash, no word of an order, nothing blinking", () => {
    const html = menu().replace(/ class="[^"]*"/g, "");
    expect(html).not.toMatch(/[·—–]/);
    expect(html).not.toMatch(FORBIDDEN_TEXT);
    expect(html).not.toMatch(/blink|pulse|piscar|pulsar/i);
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).toBe(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  });
});

describe("the bar", () => {
  const render = (props: Partial<Parameters<typeof DeskRail>[0]> = {}) => renderToStaticMarkup(<DeskRail chips={chips} skewMs={0} nowMs={1_791_742_100_000} {...props} />);

  test("the discovery menu sits first in the group of tools when the owner gives it", () => {
    const html = render({ discovery: <DiscoveryMenu chainIndex="501" chainName="Solana" /> });
    const group = html.slice(html.indexOf('aria-label="Ferramentas"'));
    expect(group.indexOf('data-tool="discovery"')).toBeGreaterThan(-1);
    expect(group.indexOf('data-tool="discovery"')).toBeLessThan(group.indexOf('data-tool="alerts"'));
  });

  test("without it the bar is the same as before: no discovery button", () => {
    expect(render()).not.toContain('data-tool="discovery"');
  });
});
