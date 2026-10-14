// T5.7, T6.4, DOC-4: the chart, the Zonas view of the Radar tab and the Fluxo tab all read the same engine reading. They share ONE
// poll per instrument: the first reader starts it, the last one stops it, a late reader gets the current reading at once, and one
// instrument's reading never reaches another instrument's readers. The feed itself is injected, so no timer or network is involved.
import { describe, expect, test } from "bun:test";
import type { OverlayFeedState } from "./overlay-feed";
import { createOverlayShare } from "./overlay-share";

const LOADING: OverlayFeedState = { status: "loading", overlay: null, reason: null };
const FAILED: OverlayFeedState = { status: "erro", overlay: null, reason: "sem_conexao" };

function harness() {
  const made: { instId: string; started: number; stopped: number; poked: number; push: (s: OverlayFeedState) => void }[] = [];
  const share = createOverlayShare({
    make: ({ instId, onChange }) => {
      const feed = { instId, started: 0, stopped: 0, poked: 0, push: onChange };
      made.push(feed);
      return {
        start: () => {
          feed.started += 1;
          onChange(LOADING);
        },
        stop: () => {
          feed.stopped += 1;
        },
        poke: () => {
          feed.poked += 1;
        },
      };
    },
  });
  return { share, made };
}

describe("one poll per instrument", () => {
  test("the first reader starts the poll and sees the loading state; nothing is read for an instrument nobody reads", () => {
    const { share, made } = harness();
    expect(share.get("BTC-USDT")).toBeNull();
    expect(made).toHaveLength(0);
    const seen: (OverlayFeedState | null)[] = [];
    share.subscribe("BTC-USDT", () => seen.push(share.get("BTC-USDT")));
    expect(made).toHaveLength(1);
    expect(made[0]!.started).toBe(1);
    expect(share.get("BTC-USDT")).toEqual(LOADING);
  });

  test("a second reader of the same instrument starts nothing and gets the current reading at once", () => {
    const { share, made } = harness();
    share.subscribe("BTC-USDT", () => {});
    made[0]!.push(FAILED);
    let calls = 0;
    share.subscribe("BTC-USDT", () => (calls += 1));
    expect(made).toHaveLength(1);
    expect(made[0]!.started).toBe(1);
    expect(share.get("BTC-USDT")).toBe(FAILED);
    made[0]!.push(LOADING);
    expect(calls).toBe(1); // told of the next change, not of the old one
  });

  test("every reader hears every change, and the snapshot is the same object until something changes", () => {
    const { share, made } = harness();
    let a = 0;
    let b = 0;
    share.subscribe("ETH-USDT", () => (a += 1));
    share.subscribe("ETH-USDT", () => (b += 1));
    a = 0; // the first reader was told of the loading state when it started the poll
    const before = share.get("ETH-USDT");
    expect(share.get("ETH-USDT")).toBe(before);
    made[0]!.push(FAILED);
    expect([a, b]).toEqual([1, 1]);
    expect(share.get("ETH-USDT")).toBe(FAILED);
    expect(share.get("ETH-USDT")).toBe(share.get("ETH-USDT"));
  });

  test("the last reader to leave stops the poll and forgets the reading; the others keep it alive", () => {
    const { share, made } = harness();
    const stopA = share.subscribe("BTC-USDT", () => {});
    const stopB = share.subscribe("BTC-USDT", () => {});
    stopA();
    expect(made[0]!.stopped).toBe(0);
    expect(share.get("BTC-USDT")).toEqual(LOADING);
    stopB();
    expect(made[0]!.stopped).toBe(1);
    expect(share.get("BTC-USDT")).toBeNull();
    stopB(); // leaving twice is harmless
    expect(made[0]!.stopped).toBe(1);
  });

  test("a reader that comes back after everyone left starts a fresh poll", () => {
    const { share, made } = harness();
    share.subscribe("BTC-USDT", () => {})();
    share.subscribe("BTC-USDT", () => {});
    expect(made).toHaveLength(2);
    expect(made[1]!.started).toBe(1);
  });

  test("instruments are independent: a reading for one never reaches the readers of another", () => {
    const { share, made } = harness();
    let btc = 0;
    let eth = 0;
    share.subscribe("BTC-USDT", () => (btc += 1));
    share.subscribe("ETH-USDT", () => (eth += 1));
    expect(made.map((m) => m.instId)).toEqual(["BTC-USDT", "ETH-USDT"]);
    btc = 0;
    eth = 0; // each first reader was told of the loading state of its own poll
    made[0]!.push(FAILED);
    expect([btc, eth]).toEqual([1, 0]);
    expect(share.get("ETH-USDT")).toEqual(LOADING);
  });

  test("poke reads now for a polled instrument and does nothing for one nobody reads", () => {
    const { share, made } = harness();
    share.poke("BTC-USDT");
    expect(made).toHaveLength(0);
    share.subscribe("BTC-USDT", () => {});
    share.poke("BTC-USDT");
    expect(made[0]!.poked).toBe(1);
  });

  test("pokeAll reads now for every polled instrument once, and for none when nobody reads", () => {
    const { share, made } = harness();
    share.pokeAll();
    expect(made).toHaveLength(0);
    share.subscribe("BTC-USDT", () => {});
    share.subscribe("ETH-USDT", () => {});
    share.subscribe("ETH-USDT", () => {});
    share.pokeAll();
    expect(made.map((m) => m.poked)).toEqual([1, 1]);
  });

  test("a reading that arrives after the last reader left is dropped", () => {
    const { share, made } = harness();
    share.subscribe("BTC-USDT", () => {})();
    made[0]!.push(FAILED);
    expect(share.get("BTC-USDT")).toBeNull();
  });
});
