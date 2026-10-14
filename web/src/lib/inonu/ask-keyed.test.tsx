// ASK-2, ASK-14: an answer belongs to the subject it was asked about. The panel that holds it is keyed by the subject, so when the desk
// moves to another instrument, token or network, the panel (with its answer, its state and its pending request) is replaced by a fresh one:
// an answer that arrives late cannot land under the new subject, and Aceitar cannot write the old decision with the new subject's name.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import DockInonu from "@/components/Desk/Dock/DockInonu";
import InonuAsk from "@/components/Desk/InonuAsk";
import { DiscoveryMenu } from "@/components/Desk/TopbarDiscovery";
import { subjectKey } from "./ask-target";

function find(node: ReactNode, type: unknown): ReactElement<{ children?: ReactNode }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) return element;
  return find(element.props.children, type);
}

describe("the panel is keyed by what it asks about", () => {
  test("in the Inonu tab: an OKX instrument, then another, then a token each get their own panel", () => {
    const keyOf = (props: Parameters<typeof DockInonu>[0]) => find(DockInonu(props), InonuAsk)?.key;
    expect(keyOf({ instId: "BTC-USDT" })).toBe("BTC-USDT");
    expect(keyOf({ instId: "ETH-USDT" })).toBe("ETH-USDT");
    const token = { kind: "token" as const, chainIndex: "501", address: "AAA", symbol: "AAA" };
    expect(keyOf({ instId: "BTC-USDT", subject: token })).toBe(subjectKey(token));
    expect(new Set([keyOf({ instId: "BTC-USDT" }), keyOf({ instId: "ETH-USDT" }), keyOf({ instId: "BTC-USDT", subject: token })]).size).toBe(3);
  });

  test("in the discovery menu: another network is another panel", () => {
    const keyOf = (chainIndex: string) => find(DiscoveryMenu({ chainIndex, chainName: "x" }), InonuAsk)?.key;
    expect(keyOf("501")).toBe("descoberta:501");
    expect(keyOf("8453")).toBe("descoberta:8453");
  });
});
