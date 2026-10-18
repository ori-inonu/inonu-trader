// T9.1, WAL-1: the one Solana account of the page, shared by every screen that shows it (the network list and "Minha carteira"). Looking for the provider asks for no access;
// only connect() reaches the wallet, and only a click calls it. Two screens mounted at once are one session, and the last one to leave takes it down. origin:
// synthetic_fixture, tests only (a fake provider and a fake clock).
import { describe, expect, test } from "bun:test";
import type { OkxSolanaProvider } from "../okx-solana";
import { createSolanaStore, solanaServerSnapshot, type SolanaStoreState } from "./solana-store";

const A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const key = (text: string) => ({ toString: () => text });

function fakeProvider() {
  const calls: string[] = [];
  const provider = {
    connect: () => {
      calls.push("connect");
      return Promise.resolve({ publicKey: key(A) });
    },
    on: () => {
      calls.push("on");
    },
    removeListener: () => {
      calls.push("off");
    },
  } as unknown as OkxSolanaProvider;
  return { provider, calls };
}

/** A clock the test turns by hand: schedule() queues, tick() runs what was due. */
function fakeClock() {
  const queue: { at: number; fn: () => void; live: boolean }[] = [];
  let now = 0;
  return {
    schedule: (fn: () => void, ms: number) => {
      const item = { at: now + ms, fn, live: true };
      queue.push(item);
      return () => {
        item.live = false;
      };
    },
    tick: (ms: number) => {
      now += ms;
      for (const item of queue) if (item.live && item.at <= now) {
        item.live = false;
        item.fn();
      }
    },
    pending: () => queue.filter((q) => q.live).length,
  };
}

describe("looking for the provider", () => {
  test("found at once: available and ready, and the wallet was asked for nothing but to listen", () => {
    const f = fakeProvider();
    const store = createSolanaStore({ schedule: fakeClock().schedule });
    store.retain({ okxwallet: { solana: f.provider } });
    expect(store.getSnapshot()).toMatchObject({ available: true, ready: true, snapshot: { status: "disconnected", account: null } });
    expect(f.calls).toEqual(["on", "on"]);
  });

  test("not there yet: it looks again later, finds it, and only then is it available", () => {
    const f = fakeProvider();
    const clock = fakeClock();
    const surface: { okxwallet?: unknown } = {};
    const store = createSolanaStore({ schedule: clock.schedule, lookAgainMs: [400, 1500] });
    store.retain(surface);
    expect(store.getSnapshot()).toMatchObject({ available: false, ready: false });
    surface.okxwallet = { solana: f.provider };
    clock.tick(400);
    expect(store.getSnapshot()).toMatchObject({ available: true, ready: true });
  });

  test("never there: after the last look it says the looking is over, and not before", () => {
    const clock = fakeClock();
    const store = createSolanaStore({ schedule: clock.schedule, lookAgainMs: [400, 1500] });
    store.retain({});
    clock.tick(400);
    expect(store.getSnapshot()).toMatchObject({ available: false, ready: false });
    clock.tick(1100);
    expect(store.getSnapshot()).toMatchObject({ available: false, ready: true });
  });

  test("a surface with something else under okxwallet.solana is not a provider", () => {
    const store = createSolanaStore({ schedule: fakeClock().schedule, lookAgainMs: [] });
    store.retain({ okxwallet: { solana: { connect: 1, on: "no" } } });
    expect(store.getSnapshot()).toMatchObject({ available: false, ready: true });
  });
});

describe("connecting", () => {
  test("only connect() reaches the wallet, and the account then reaches every listener", async () => {
    const f = fakeProvider();
    const store = createSolanaStore({ schedule: fakeClock().schedule });
    store.retain({ okxwallet: { solana: f.provider } });
    const seen: SolanaStoreState[] = [];
    store.subscribe(() => seen.push(store.getSnapshot()));
    expect(f.calls.includes("connect")).toBe(false);
    await store.connect();
    expect(f.calls.filter((c) => c === "connect").length).toBe(1);
    expect(store.getSnapshot().snapshot).toMatchObject({ status: "connected", account: A });
    expect(seen.map((s) => s.snapshot.status)).toEqual(["connecting", "connected"]);
  });

  test("with no provider, connect() does nothing and does not fail", async () => {
    const store = createSolanaStore({ schedule: fakeClock().schedule, lookAgainMs: [] });
    store.retain({});
    await store.connect();
    expect(store.getSnapshot().snapshot.status).toBe("disconnected");
  });

  test("disconnect() forgets the account here", async () => {
    const f = fakeProvider();
    const store = createSolanaStore({ schedule: fakeClock().schedule });
    store.retain({ okxwallet: { solana: f.provider } });
    await store.connect();
    store.disconnect();
    expect(store.getSnapshot().snapshot).toMatchObject({ status: "disconnected", account: null });
  });
});

describe("sharing", () => {
  test("two screens are one session: one set of listeners on the wallet, and the account of one is the account of the other", async () => {
    const f = fakeProvider();
    const store = createSolanaStore({ schedule: fakeClock().schedule });
    const surface = { okxwallet: { solana: f.provider } };
    const leaveFirst = store.retain(surface);
    const leaveSecond = store.retain(surface);
    expect(f.calls.filter((c) => c === "on").length).toBe(2);
    await store.connect();
    expect(store.getSnapshot().snapshot.account).toBe(A);
    leaveFirst();
    expect(store.getSnapshot().snapshot.account).toBe(A);
    expect(f.calls.includes("off")).toBe(false);
    leaveSecond();
    expect(f.calls.filter((c) => c === "off").length).toBe(2);
    expect(store.getSnapshot()).toMatchObject({ available: false, ready: false, snapshot: { status: "disconnected", account: null } });
  });

  test("leaving twice by the same handle does not take the other screen's session down", () => {
    const f = fakeProvider();
    const store = createSolanaStore({ schedule: fakeClock().schedule });
    const surface = { okxwallet: { solana: f.provider } };
    const leaveFirst = store.retain(surface);
    store.retain(surface);
    leaveFirst();
    leaveFirst();
    expect(store.getSnapshot().available).toBe(true);
  });

  test("leaving while it is still looking cancels the looking", () => {
    const clock = fakeClock();
    const store = createSolanaStore({ schedule: clock.schedule, lookAgainMs: [400, 1500] });
    const leave = store.retain({});
    expect(clock.pending()).toBeGreaterThan(0);
    leave();
    expect(clock.pending()).toBe(0);
  });

  test("a screen that mounts again later starts clean, and the snapshot between changes is the same object", () => {
    const f = fakeProvider();
    const store = createSolanaStore({ schedule: fakeClock().schedule });
    const leave = store.retain({ okxwallet: { solana: f.provider } });
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    leave();
    store.retain({ okxwallet: { solana: f.provider } });
    expect(store.getSnapshot().snapshot).toMatchObject({ status: "disconnected", account: null });
  });

  test("the snapshot the server renders is the empty one, with the looking not over", () => {
    expect(solanaServerSnapshot).toMatchObject({ available: false, ready: false, snapshot: { status: "disconnected", account: null } });
  });
});
