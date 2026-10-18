import { describe, expect, test } from "bun:test";
import { FakeClock, createFakeWebSocketCtor } from "./desk-test-kit";
import {
  OKX_BUSINESS_WS_URL,
  OKX_PUBLIC_WS_URL,
  createOkxSocket,
  type OkxProtocolError,
  type OkxSocketOptions,
  type OkxWsMessage,
} from "./okx-ws";
import type { DeskFeedStatus } from "./types";

const FORBIDDEN = new RegExp("[" + String.fromCharCode(0xb7, 0x2014, 0x2013) + "]");

function setup(overrides: Partial<OkxSocketOptions> = {}) {
  const clock = new FakeClock();
  const { Ctor, instances } = createFakeWebSocketCtor();
  const messages: OkxWsMessage[] = [];
  const errors: OkxProtocolError[] = [];
  const statuses: DeskFeedStatus[] = [];
  const opens: boolean[] = [];
  const socket = createOkxSocket({
    feedId: "okx-public-ws",
    WebSocketCtor: Ctor,
    now: clock.now,
    timers: clock,
    random: () => 1,
    onMessage: (m) => messages.push(m),
    onProtocolError: (e) => errors.push(e),
    onStatusChange: (s) => statuses.push(s),
    onOpen: (info) => opens.push(info.reconnect),
    ...overrides,
  });
  return { clock, instances, messages, errors, statuses, opens, socket };
}

const tickerFrame = (instId = "BTC-USDT") => ({ arg: { channel: "tickers", instId }, data: [{ instId, last: "1" }] });

describe("connection and dispatch", () => {
  test("connects to the public or business url, resends nothing when there is nothing to subscribe", () => {
    const a = setup();
    a.socket.start();
    expect(a.instances).toHaveLength(1);
    expect(a.instances[0]?.url).toBe(OKX_PUBLIC_WS_URL);
    expect(a.socket.getStatus().state).toBe("connecting");
    a.instances[0]?.open();
    expect(a.instances[0]?.sent).toEqual([]);

    const b = setup({ feedId: "okx-business-ws" });
    b.socket.start();
    expect(b.instances[0]?.url).toBe(OKX_BUSINESS_WS_URL);
  });

  test("start is idempotent", () => {
    const { socket, instances } = setup();
    socket.start();
    socket.start();
    expect(instances).toHaveLength(1);
  });

  test("dispatches arg, action and data and ignores acks, errors and malformed frames", () => {
    const { socket, instances, messages, errors } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    ws.receive({ event: "subscribe", arg: { channel: "books", instId: "BTC-USDT" } });
    ws.receive({ arg: { channel: "books", instId: "BTC-USDT" }, action: "snapshot", data: [{ asks: [] }] });
    ws.receive({ arg: { channel: "books", instId: "BTC-USDT" }, action: "update", data: [{ asks: [] }, { bids: [] }] });
    ws.receive(tickerFrame());
    ws.receive("not json");
    ws.receive("[1,2]");
    ws.receive({ arg: { channel: "books" }, data: [] });
    ws.receive({ arg: { channel: "books", instId: "X" }, data: "nope" });
    ws.receive({ event: "error", code: "60018", msg: "Wrong URL or channel" });
    expect(messages.map((m) => [m.arg.channel, m.action, m.data.length])).toEqual([
      ["books", "snapshot", 1],
      ["books", "update", 2],
      ["tickers", null, 1],
    ]);
    expect(errors).toEqual([{ code: "60018", message: "Wrong URL or channel" }]);
    expect(socket.getStats()).toEqual({ messages: { books: 2, tickers: 1 }, malformed: 4, errors: 1, pongs: 0 });
  });

  test("a non text frame is counted as malformed", () => {
    const { socket, instances } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    ws.onmessage?.({ data: new ArrayBuffer(4) });
    expect(socket.getStats().malformed).toBe(1);
  });
});

describe("subscriptions", () => {
  test("subscribes at runtime, deduplicates and unsubscribes", () => {
    const { socket, instances } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    socket.subscribe({ channel: "trades", instId: "BTC-USDT" }, { channel: "tickers", instId: "BTC-USDT" });
    socket.subscribe({ channel: "trades", instId: "BTC-USDT" });
    socket.unsubscribe({ channel: "trades", instId: "BTC-USDT" });
    socket.unsubscribe({ channel: "trades", instId: "NOT-HERE" });
    expect(ws.ops()).toEqual([
      { op: "subscribe", args: [{ channel: "trades", instId: "BTC-USDT" }, { channel: "tickers", instId: "BTC-USDT" }] },
      { op: "unsubscribe", args: [{ channel: "trades", instId: "BTC-USDT" }] },
    ]);
    expect(socket.subscriptions()).toEqual([{ channel: "tickers", instId: "BTC-USDT" }]);
  });

  test("subscriptions made before the socket opens are sent when it opens", () => {
    const { socket, instances } = setup();
    socket.subscribe({ channel: "books", instId: "A-USDT" });
    socket.start();
    const ws = instances[0]!;
    expect(ws.sent).toEqual([]);
    ws.open();
    expect(ws.ops()).toEqual([{ op: "subscribe", args: [{ channel: "books", instId: "A-USDT" }] }]);
  });

  test("setSubscriptions sends one unsubscribe for what left and one subscribe for what is new", () => {
    const { socket, instances } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    socket.setSubscriptions([{ channel: "trades", instId: "A-USDT" }, { channel: "books", instId: "A-USDT" }]);
    socket.setSubscriptions([{ channel: "trades", instId: "B-USDT" }, { channel: "books", instId: "A-USDT" }]);
    expect(ws.ops()).toEqual([
      { op: "subscribe", args: [{ channel: "trades", instId: "A-USDT" }, { channel: "books", instId: "A-USDT" }] },
      { op: "unsubscribe", args: [{ channel: "trades", instId: "A-USDT" }] },
      { op: "subscribe", args: [{ channel: "trades", instId: "B-USDT" }] },
    ]);
  });

  test("resubscribe asks OKX for a fresh snapshot", () => {
    const { socket, instances } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    const arg = { channel: "books", instId: "A-USDT" };
    socket.resubscribe(arg); // not subscribed: nothing happens
    socket.subscribe(arg);
    socket.resubscribe(arg);
    expect(ws.ops()).toEqual([
      { op: "subscribe", args: [arg] },
      { op: "unsubscribe", args: [arg] },
      { op: "subscribe", args: [arg] },
    ]);
  });

  test("everything is resubscribed after a reconnect, minus what was unsubscribed meanwhile", () => {
    const { socket, instances, clock, opens } = setup();
    socket.start();
    socket.subscribe({ channel: "books", instId: "A-USDT" }, { channel: "trades", instId: "A-USDT" }, { channel: "tickers", instId: "A-USDT" });
    instances[0]?.open();
    socket.unsubscribe({ channel: "trades", instId: "A-USDT" });
    instances[0]?.serverClose();
    clock.advance(1000);
    expect(instances).toHaveLength(2);
    instances[1]?.open();
    expect(instances[1]?.ops()).toEqual([
      { op: "subscribe", args: [{ channel: "books", instId: "A-USDT" }, { channel: "tickers", instId: "A-USDT" }] },
    ]);
    expect(opens).toEqual([false, true]);
  });
});

describe("heartbeat", () => {
  test("sends ping after 20 s of silence and not before", () => {
    const { socket, instances, clock } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    clock.advance(19_999);
    expect(ws.sent).toEqual([]);
    clock.advance(1);
    expect(ws.sent).toEqual(["ping"]);
  });

  test("any inbound frame resets the silence clock", () => {
    const { socket, instances, clock } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    clock.advance(15_000);
    ws.receive(tickerFrame());
    clock.advance(19_000);
    expect(ws.sent).toEqual([]);
    clock.advance(1_000);
    expect(ws.sent).toEqual(["ping"]);
  });

  test("a pong keeps the connection and the next ping follows 20 s later", () => {
    const { socket, instances, clock } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    clock.advance(20_000);
    ws.receive("pong");
    clock.advance(4_000);
    expect(instances).toHaveLength(1);
    expect(ws.closeCall).toBeNull();
    clock.advance(16_000);
    expect(ws.sent).toEqual(["ping", "ping"]);
    expect(socket.getStats().pongs).toBe(1);
  });

  test("no answer within the timeout closes the socket and reconnects", () => {
    const { socket, instances, clock } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    clock.advance(20_000);
    clock.advance(4_999);
    expect(ws.closeCall).toBeNull();
    clock.advance(1);
    expect(ws.closeCall).not.toBeNull();
    expect(socket.getStatus().state).toBe("reconnecting");
    clock.advance(1_000);
    expect(instances).toHaveLength(2);
  });
});

describe("reconnect and backoff", () => {
  test("delays double from 1 s up to 30 s", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    socket.start();
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    delays.forEach((delay, i) => {
      instances[i]?.serverClose(1006);
      clock.advance(delay - 1);
      expect(instances).toHaveLength(i + 1);
      clock.advance(1);
      expect(instances).toHaveLength(i + 2);
    });
  });

  test("jitter shrinks the delay to at most 25 percent and never beyond the cap", () => {
    const { socket, instances, clock } = setup({ random: () => 0 });
    socket.start();
    instances[0]?.serverClose();
    clock.advance(749);
    expect(instances).toHaveLength(1);
    clock.advance(1);
    expect(instances).toHaveLength(2);
    instances[1]?.serverClose();
    clock.advance(1_499);
    expect(instances).toHaveLength(2);
    clock.advance(1);
    expect(instances).toHaveLength(3);
  });

  test("a connection that stayed open long enough resets the backoff", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    socket.start();
    instances[0]?.serverClose();
    clock.advance(1_000);
    instances[1]?.serverClose();
    clock.advance(2_000);
    expect(instances).toHaveLength(3);
    instances[2]?.open();
    clock.advance(10_000);
    ws2Heartbeat(instances[2]);
    instances[2]?.serverClose();
    clock.advance(999);
    expect(instances).toHaveLength(3);
    clock.advance(1);
    expect(instances).toHaveLength(4);
  });

  test("a connection that opens and drops at once keeps growing the backoff", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    socket.start();
    instances[0]?.open();
    instances[0]?.serverClose();
    clock.advance(1_000);
    instances[1]?.open();
    instances[1]?.serverClose();
    clock.advance(1_999);
    expect(instances).toHaveLength(2);
    clock.advance(1);
    expect(instances).toHaveLength(3);
  });

  test("the reconnect counter and the Portuguese reasons follow the states", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    socket.start();
    expect(socket.getStatus()).toMatchObject({ state: "connecting", reconnects: 0 });
    instances[0]?.serverClose(1006);
    expect(socket.getStatus()).toMatchObject({ state: "reconnecting", reconnects: 0 });
    expect(socket.getStatus().detail).toContain("Nova tentativa em 1 s");
    clock.advance(1_000);
    expect(socket.getStatus()).toMatchObject({ state: "reconnecting", reconnects: 1 });
    expect(socket.getStatus().detail).toContain("tentativa 2");
  });

  test("after five failed attempts the feed is reported as failed but keeps retrying", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    socket.start();
    for (let i = 0; i < 5; i += 1) {
      instances[i]?.serverClose();
      if (i < 4) clock.advance(2 ** i * 1000);
    }
    const status = socket.getStatus();
    expect(status.state).toBe("failed");
    expect(status.detail).toContain("5 tentativas");
    clock.advance(16_000);
    expect(instances).toHaveLength(6);
    instances[5]?.open();
    instances[5]?.receive(tickerFrame());
    expect(socket.getStatus().state).toBe("live");
  });

  test("a service upgrade notice reconnects at the base delay", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    socket.start();
    instances[0]?.open();
    instances[0]?.receive({ event: "notice", code: "64008", msg: "The connection will soon be closed for a service upgrade." });
    expect(instances[0]?.closeCall).not.toBeNull();
    clock.advance(1_000);
    expect(instances).toHaveLength(2);
  });

  test("frames from a socket that was replaced are ignored", () => {
    const { socket, instances, clock, messages } = setup({ random: () => 1 });
    socket.start();
    const old = instances[0]!;
    old.open();
    old.serverClose();
    clock.advance(1_000);
    instances[1]?.open();
    old.receive(tickerFrame("OLD-USDT"));
    old.serverClose();
    expect(messages).toHaveLength(0);
    expect(socket.getStatus().state).not.toBe("reconnecting");
    expect(instances).toHaveLength(2);
  });

  test("stop closes the socket, cancels the retry and allows a clean restart", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    socket.start();
    instances[0]?.open();
    socket.stop();
    expect(instances[0]?.closeCall?.code).toBe(1000);
    expect(socket.getStatus()).toMatchObject({ state: "idle" });
    clock.advance(120_000);
    expect(instances).toHaveLength(1);
    socket.start();
    expect(instances).toHaveLength(2);
    instances[1]?.serverClose();
    socket.stop();
    clock.advance(120_000);
    expect(instances).toHaveLength(2);
    expect(clock.pendingCount()).toBe(0);
  });
});

function ws2Heartbeat(ws: { receive(frame: unknown): void } | undefined): void {
  ws?.receive(tickerFrame());
}

describe("feed status", () => {
  test("waits for data, goes live, turns stale after the window and recovers with new data", () => {
    const { socket, instances, clock } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    expect(socket.getStatus()).toMatchObject({ state: "connecting", lastMessageAtMs: null, freshnessMs: 5_000 });
    expect(socket.getStatus().detail).toContain("aguardando");
    ws.receive({ event: "subscribe", arg: { channel: "tickers", instId: "BTC-USDT" } });
    expect(socket.getStatus().state).toBe("connecting");
    ws.receive(tickerFrame());
    const received = clock.now();
    expect(socket.getStatus()).toMatchObject({ state: "live", lastMessageAtMs: received, detail: null });
    clock.advance(5_000);
    expect(socket.getStatus().state).toBe("live");
    clock.advance(1);
    const stale = socket.getStatus();
    expect(stale.state).toBe("stale");
    expect(stale.detail).toContain("Sem dados");
    ws.receive(tickerFrame());
    expect(socket.getStatus().state).toBe("live");
  });

  test("connected but never receiving data becomes stale after the window", () => {
    const { socket, instances, clock } = setup();
    socket.start();
    instances[0]?.open();
    clock.advance(5_001);
    const status = socket.getStatus();
    expect(status.state).toBe("stale");
    expect(status.detail).toContain("sem dados");
  });

  test("a pong or an ack does not count as a data message", () => {
    const { socket, instances, clock } = setup();
    socket.start();
    const ws = instances[0]!;
    ws.open();
    ws.receive(tickerFrame());
    clock.advance(20_000);
    ws.receive("pong");
    ws.receive({ event: "subscribe", arg: { channel: "x", instId: "y" } });
    expect(socket.getStatus().state).toBe("stale");
  });

  test("uses the business freshness window and honors an override", () => {
    const business = setup({ feedId: "okx-business-ws" });
    business.socket.start();
    business.instances[0]?.open();
    business.instances[0]?.receive({ arg: { channel: "candle1m", instId: "BTC-USDT" }, data: [[]] });
    for (let i = 0; i < 3; i += 1) {
      business.clock.advance(20_000);
      business.instances[0]?.receive("pong");
    }
    business.clock.advance(10_000);
    expect(business.socket.getStatus()).toMatchObject({ state: "live", freshnessMs: 70_000, id: "okx-business-ws" });
    business.clock.advance(1);
    expect(business.socket.getStatus().state).toBe("stale");

    const custom = setup({ freshnessMs: 1_000 });
    expect(custom.socket.getStatus().freshnessMs).toBe(1_000);
  });

  test("reports every transition once through onStatusChange", () => {
    const { socket, instances, statuses } = setup();
    socket.start();
    instances[0]?.open();
    instances[0]?.receive(tickerFrame());
    instances[0]?.receive(tickerFrame());
    instances[0]?.serverClose();
    expect(statuses.map((s) => s.state)).toEqual(["connecting", "connecting", "live", "reconnecting"]);
  });

  test("an idle socket and every status text avoid middle dots and dashes", () => {
    const { socket, instances, clock } = setup({ random: () => 1 });
    const seen: DeskFeedStatus[] = [socket.getStatus()];
    socket.start();
    seen.push(socket.getStatus());
    instances[0]?.open();
    seen.push(socket.getStatus());
    clock.advance(6_000);
    seen.push(socket.getStatus());
    instances[0]?.receive(tickerFrame());
    clock.advance(6_000);
    seen.push(socket.getStatus());
    instances[0]?.serverClose();
    seen.push(socket.getStatus());
    for (let i = 1; i < 8; i += 1) {
      clock.advance(2 ** i * 1000);
      instances[i]?.serverClose();
      seen.push(socket.getStatus());
    }
    socket.stop();
    seen.push(socket.getStatus());
    expect(seen.length).toBeGreaterThan(8);
    for (const status of seen) {
      if (status.state !== "live") expect(status.detail).not.toBeNull();
      expect(FORBIDDEN.test(status.detail ?? "")).toBe(false);
    }
  });
});
