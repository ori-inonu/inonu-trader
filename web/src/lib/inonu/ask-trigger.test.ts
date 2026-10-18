// ASK-13: the button of an alert is the only thing that starts a consultation. It does not call the model itself: it leaves a request for
// the subject (the Inonu panel of that instrument), and the panel asks, once, when it sees it. A request left before the panel exists is
// kept for a few seconds, then forgotten: an old click must never become a paid call minutes later, when some other panel appears.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { ASK_REQUEST_TTL_MS, createAskTrigger, takeAndAsk } from "./ask-trigger";

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
};

describe("the trigger left by an alert", () => {
  test("a request is taken once, by the subject it was left for, and by nobody else", () => {
    const trigger = createAskTrigger();
    trigger.request("BTC-USDT");
    expect(trigger.take("ETH-USDT")).toBe(false);
    expect(trigger.take("BTC-USDT")).toBe(true);
    expect(trigger.take("BTC-USDT")).toBe(false);
  });

  test("a request left before the panel exists waits for it, and two clicks before it appeared are one request", () => {
    const c = clock();
    const trigger = createAskTrigger({ now: c.now });
    trigger.request("BTC-USDT");
    c.advance(2_000);
    trigger.request("BTC-USDT");
    c.advance(3_000);
    expect(trigger.take("BTC-USDT")).toBe(true);
    expect(trigger.take("BTC-USDT")).toBe(false);
  });

  test("a request that nobody took inside its window is forgotten: an old click never becomes a call when some panel appears later", () => {
    const c = clock();
    const trigger = createAskTrigger({ now: c.now });
    trigger.request("BTC-USDT");
    c.advance(ASK_REQUEST_TTL_MS + 1);
    expect(trigger.take("BTC-USDT")).toBe(false);
    expect(trigger.pending().size).toBe(0);
    // and a new click after that works again
    trigger.request("BTC-USDT");
    expect(trigger.take("BTC-USDT")).toBe(true);
  });

  test("the window is short, seconds and not minutes", () => {
    expect(ASK_REQUEST_TTL_MS).toBeGreaterThanOrEqual(5_000);
    expect(ASK_REQUEST_TTL_MS).toBeLessThanOrEqual(30_000);
  });

  test("a listener hears each new request, and stops hearing when it leaves", () => {
    const trigger = createAskTrigger();
    let heard = 0;
    const stop = trigger.subscribe(() => (heard += 1));
    trigger.request("BTC-USDT");
    trigger.request("ETH-USDT");
    expect(heard).toBe(2);
    stop();
    trigger.request("SOL-USDT");
    expect(heard).toBe(2);
  });

  test("the panel asks once for a request that is waiting for it, and never for one that is not", () => {
    const trigger = createAskTrigger();
    let asked = 0;
    expect(takeAndAsk(trigger, "BTC-USDT", () => (asked += 1))).toBe(false);
    expect(asked).toBe(0);
    trigger.request("BTC-USDT");
    expect(takeAndAsk(trigger, "ETH-USDT", () => (asked += 1))).toBe(false);
    expect(takeAndAsk(trigger, "BTC-USDT", () => (asked += 1))).toBe(true);
    expect(takeAndAsk(trigger, "BTC-USDT", () => (asked += 1))).toBe(false);
    expect(asked).toBe(1);
  });

  test("it holds nothing but the subject keys: no price, no text, nothing a model could read", () => {
    const trigger = createAskTrigger();
    trigger.request("BTC-USDT");
    expect(JSON.stringify([...trigger.pending()])).toBe('["BTC-USDT"]');
  });
});
