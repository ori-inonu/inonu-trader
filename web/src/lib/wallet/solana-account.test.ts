// T9.1, WAL-1: the Solana account of the connected OKX Wallet. The session connects only when asked (the click of a person), one request at a time, and it only
// learns the account: it never reads balances by itself, never signs and never sends. Texts are ours (see errors.ts), never the wallet's. origin: synthetic_fixture,
// tests only (a fake provider; no extension and no real account involved).
import { describe, expect, test } from "bun:test";
import type { OkxSolanaProvider } from "../okx-solana";
import { walletError } from "./errors";
import { createSolanaAccountSession, solanaSideOf, type SolanaAccountSnapshot } from "./solana-account";

const A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const key = (text: string) => ({ toString: () => text });

type Listener = (...args: unknown[]) => void;
function fakeProvider(connect: () => Promise<unknown>) {
  const calls: string[] = [];
  const listeners = new Map<string, Set<Listener>>();
  const provider = {
    connect: () => {
      calls.push("connect");
      return connect();
    },
    on: (event: string, listener: Listener) => {
      calls.push(`on:${event}`);
      (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(listener);
    },
    removeListener: (event: string, listener: Listener) => {
      calls.push(`off:${event}`);
      listeners.get(event)?.delete(listener);
    },
  } as unknown as OkxSolanaProvider;
  const emit = (event: string, ...args: unknown[]) => {
    for (const l of [...(listeners.get(event) ?? [])]) l(...args);
  };
  return { provider, calls, emit, count: (event: string) => listeners.get(event)?.size ?? 0 };
}
const resolveWith = (publicKey: unknown) => () => Promise.resolve({ publicKey });
const rejectWith = (code: number | null) => () => Promise.reject(code === null ? new Error("x") : Object.assign(new Error("wallet words"), { code }));

describe("connecting", () => {
  test("creating the session asks the wallet for nothing: no connect, only the two listeners", () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    expect(f.calls).toEqual(["on:accountChanged", "on:disconnect"]);
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null, error: null });
  });

  test("a click connects once and the account is the one the wallet gave", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    await session.connect();
    expect(f.calls.filter((c) => c === "connect").length).toBe(1);
    expect(session.getSnapshot()).toMatchObject({ status: "connected", account: A, error: null });
  });

  test("the snapshots go through connecting before connected, and a listener hears them", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    const seen: string[] = [];
    session.subscribe((s) => seen.push(s.status));
    await session.connect();
    expect(seen).toEqual(["connecting", "connected"]);
  });

  test("a refusal (4001) leaves it disconnected, with our words and not the wallet's", async () => {
    const f = fakeProvider(rejectWith(4001));
    const session = createSolanaAccountSession(f.provider);
    await session.connect();
    const s = session.getSnapshot();
    expect(s.status).toBe("disconnected");
    expect(s.account).toBeNull();
    expect(s.error?.kind).toBe("recusado");
    expect(JSON.stringify(s)).not.toContain("wallet words");
  });

  test("a request that is already waiting (-32002), an unknown failure and a throw at once are each said, never raised", async () => {
    const pending = createSolanaAccountSession(fakeProvider(rejectWith(-32002)).provider);
    await pending.connect();
    expect(pending.getSnapshot().error?.kind).toBe("pedido_pendente");

    const unknown = createSolanaAccountSession(fakeProvider(rejectWith(null)).provider);
    await unknown.connect();
    expect(unknown.getSnapshot().error?.kind).toBe("desconhecido");

    const thrown = createSolanaAccountSession(fakeProvider(() => { throw new Error("sync"); }).provider);
    await thrown.connect();
    expect(thrown.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
    expect(thrown.getSnapshot().error).not.toBeNull();
  });

  test("a second click while the first is waiting asks the wallet nothing more", async () => {
    let release: (v: unknown) => void = () => {};
    const f = fakeProvider(() => new Promise((resolve) => { release = resolve; }));
    const session = createSolanaAccountSession(f.provider);
    const first = session.connect();
    await session.connect();
    expect(f.calls.filter((c) => c === "connect").length).toBe(1);
    expect(session.getSnapshot().status).toBe("connecting");
    release({ publicKey: key(A) });
    await first;
    expect(session.getSnapshot()).toMatchObject({ status: "connected", account: A });
  });

  test("an answer that is not an account is a failure, not a connection", async () => {
    for (const publicKey of [undefined, null, key("not an address"), key(""), "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", { toString: () => { throw new Error("hostile"); } }]) {
      const session = createSolanaAccountSession(fakeProvider(resolveWith(publicKey)).provider);
      await session.connect();
      expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
      expect(session.getSnapshot().error).not.toBeNull();
    }
  });

  test("a wallet that does not answer in time is said, and its late answer changes nothing", async () => {
    let release: (v: unknown) => void = () => {};
    const f = fakeProvider(() => new Promise((resolve) => { release = resolve; }));
    const session = createSolanaAccountSession(f.provider, { timeoutMs: 20 });
    await session.connect();
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
    expect(session.getSnapshot().error?.kind).toBe("tempo_esgotado");
    release({ publicKey: key(A) });
    await new Promise((r) => setTimeout(r, 5));
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
  });
});

describe("what the wallet tells afterwards", () => {
  test("the account changed: the new one replaces the old, and the person is told", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    await session.connect();
    f.emit("accountChanged", key(B));
    expect(session.getSnapshot()).toMatchObject({ status: "connected", account: B });
    expect(session.getSnapshot().notice).toContain("conta");
  });

  test("the account went away (null) or the wallet disconnected: no account is kept, and the person is told", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    await session.connect();
    f.emit("accountChanged", null);
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
    expect(session.getSnapshot().notice).not.toBeNull();

    await session.connect();
    expect(session.getSnapshot().account).toBe(A);
    expect(session.getSnapshot().notice).toBeNull();
    f.emit("disconnect");
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
    expect(session.getSnapshot().notice).not.toBeNull();
  });

  test("an account the wallet announces that is not an address does not become the account", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    await session.connect();
    f.emit("accountChanged", key("0xnope"));
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
  });

  test("an event without a connection first is not a connection: the wallet cannot connect the app by itself", () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    f.emit("accountChanged", key(A));
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
  });
});

describe("what a screen is given", () => {
  const snap = (over: Partial<SolanaAccountSnapshot> = {}): SolanaAccountSnapshot => ({ status: "disconnected", account: null, error: null, notice: null, ...over });
  const hook = (snapshot: SolanaAccountSnapshot, connect: () => Promise<void> = () => Promise.resolve()) => ({ available: true, ready: true, snapshot, connect });

  test("the account is known only when it is connected: never half way", () => {
    expect(solanaSideOf(hook(snap({ status: "connected", account: A }))).account).toBe(A);
    expect(solanaSideOf(hook(snap({ status: "connecting", account: A }))).account).toBeNull();
    expect(solanaSideOf(hook(snap({ status: "disconnected", account: A }))).account).toBeNull();
  });

  test("a click that is waiting, the reason a click failed and what the wallet told by itself are passed on in our words", () => {
    expect(solanaSideOf(hook(snap({ status: "connecting" }))).connecting).toBe(true);
    const failed = solanaSideOf(hook(snap({ error: walletError("recusado", 4001), notice: "x" })));
    expect(failed.errorText).toBe(walletError("recusado").text);
    expect(failed.notice).toBe("x");
    expect(solanaSideOf(hook(snap())).errorText).toBeNull();
  });

  test("the provider flags pass as they are, and the click calls connect once and nothing else", () => {
    let calls = 0;
    const side = solanaSideOf({ available: false, ready: false, snapshot: snap(), connect: () => { calls += 1; return Promise.resolve(); } });
    expect(side).toMatchObject({ available: false, ready: false });
    expect(calls).toBe(0);
    side.onConnect();
    expect(calls).toBe(1);
  });
});

describe("leaving", () => {
  test("disconnecting here forgets the account, asks the wallet for nothing, and later events do not bring it back", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    await session.connect();
    const before = f.calls.length;
    session.disconnect();
    expect(f.calls.length).toBe(before);
    expect(session.getSnapshot()).toMatchObject({ status: "disconnected", account: null });
    f.emit("accountChanged", key(B));
    expect(session.getSnapshot().account).toBeNull();
    await session.connect();
    expect(session.getSnapshot().account).toBe(A);
  });

  test("disposing takes both listeners off and silences the session", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    const seen: SolanaAccountSnapshot[] = [];
    session.subscribe((s) => seen.push(s));
    session.dispose();
    expect(f.count("accountChanged")).toBe(0);
    expect(f.count("disconnect")).toBe(0);
    await session.connect();
    expect(seen.length).toBe(0);
    expect(f.calls.filter((c) => c === "connect").length).toBe(0);
  });

  test("the provider is only ever asked to connect, to listen and to stop listening", async () => {
    const f = fakeProvider(resolveWith(key(A)));
    const session = createSolanaAccountSession(f.provider);
    await session.connect();
    session.disconnect();
    session.dispose();
    for (const call of f.calls) expect(["connect", "on:accountChanged", "on:disconnect", "off:accountChanged", "off:disconnect"]).toContain(call);
  });
});
