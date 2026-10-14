import { expect, test } from "bun:test";
import { holdingsSessionKey, resolveHoldingsScope, scheduleAutoRead, subscribeHoldingsRevision } from "./holdings-session";
import { createWalletStore } from "../wallet-store";
import type { Eip1193Provider, Eip1193RequestArguments, OkxDiscoverySurface } from "../okx-wallet";
import { createRunGuard } from "./run-guard";

const evm = "0x1111111111111111111111111111111111111111";
const solana = "SolanaAccountForSessionTest";

// the default with both families used to be the Solana account alone; it is now the one reading that joins both (see holdings-session-tudo.test.ts)
test("a connected Solana account and an EVM account default to the one reading of both", () => {
  expect(resolveHoldingsScope(null, {
    evmAccount: evm,
    solanaAccount: solana,
    solanaAvailable: true,
    followingEvm: false,
  })).toBe("tudo");
});

test("an EVM account defaults to all supported EVM networks", () => {
  expect(resolveHoldingsScope(null, {
    evmAccount: evm,
    solanaAccount: null,
    solanaAvailable: true,
    followingEvm: false,
  })).toBe("todas");
});

test("an explicit EVM scope wins over the connected Solana default", () => {
  expect(resolveHoldingsScope("atual", {
    evmAccount: evm,
    solanaAccount: solana,
    solanaAvailable: true,
    followingEvm: false,
  })).toBe("atual");
});

test("without an EVM account an EVM choice resolves to Solana", () => {
  expect(resolveHoldingsScope("todas", {
    evmAccount: null,
    solanaAccount: null,
    solanaAvailable: false,
    followingEvm: false,
  })).toBe("solana");
});

test("following an EVM address cannot depend on the extension network", () => {
  expect(resolveHoldingsScope("atual", {
    evmAccount: evm,
    solanaAccount: null,
    solanaAvailable: false,
    followingEvm: true,
  })).toBe("todas");
});

test("a selected Solana provider is preserved before it connects an account", () => {
  expect(resolveHoldingsScope("solana", {
    evmAccount: evm,
    solanaAccount: null,
    solanaAvailable: true,
    followingEvm: false,
  })).toBe("solana");
});

test("an unavailable Solana choice falls back to all EVM networks", () => {
  expect(resolveHoldingsScope("solana", {
    evmAccount: evm,
    solanaAccount: null,
    solanaAvailable: false,
    followingEvm: false,
  })).toBe("todas");
});

test("a Solana account remains selectable if provider availability lags", () => {
  expect(resolveHoldingsScope("solana", {
    evmAccount: evm,
    solanaAccount: solana,
    solanaAvailable: false,
    followingEvm: false,
  })).toBe("solana");
});

test("equal session inputs have equal keys even with new network arrays", () => {
  expect(holdingsSessionKey({ address: evm, networks: ["1", "10"], scope: "todas" }))
    .toBe(holdingsSessionKey({ address: evm, networks: ["1", "10"], scope: "todas" }));
});

test("another network list invalidates the current read", () => {
  expect(holdingsSessionKey({ address: evm, networks: ["1", "10"], scope: "todas" }))
    .not.toBe(holdingsSessionKey({ address: evm, networks: ["1", "137"], scope: "todas" }));
});

test("another scope invalidates the read even on the same network", () => {
  expect(holdingsSessionKey({ address: evm, networks: ["1"], scope: "atual" }))
    .not.toBe(holdingsSessionKey({ address: evm, networks: ["1"], scope: "todas" }));
});

test("another account invalidates the read", () => {
  expect(holdingsSessionKey({ address: evm, networks: ["1"], scope: "atual" }))
    .not.toBe(holdingsSessionKey({ address: null, networks: ["1"], scope: "atual" }));
});

test("Solana account case is significant for the session identity", () => {
  expect(holdingsSessionKey({ address: solana, networks: ["501"], scope: "solana" }))
    .not.toBe(holdingsSessionKey({ address: solana.toLowerCase(), networks: ["501"], scope: "solana" }));
});

for (const scope of ["atual", "todas"] as const) {
  test(`an EVM revision invalidates a ${scope} read`, () => {
    expect(holdingsSessionKey({ address: evm, networks: ["1"], scope, evmRevision: 0 }))
      .not.toBe(holdingsSessionKey({ address: evm, networks: ["1"], scope, evmRevision: 1 }));
  });
}

test("an EVM revision does not invalidate the Solana read", () => {
  expect(holdingsSessionKey({ address: solana, networks: ["501"], scope: "solana", evmRevision: 0 }))
    .toBe(holdingsSessionKey({ address: solana, networks: ["501"], scope: "solana", evmRevision: 1 }));
});

test("the initial EVM revision is stable when omitted", () => {
  expect(holdingsSessionKey({ address: evm, networks: ["1"], scope: "atual" }))
    .toBe(holdingsSessionKey({ address: evm, networks: ["1"], scope: "atual", evmRevision: 0 }));
});

test("an active automatic read starts once after the current effect", async () => {
  const reads: string[] = [];
  const cleanup = scheduleAutoRead(() => { reads.push("current"); });
  expect(reads).toEqual([]);
  await Promise.resolve();
  expect(reads).toEqual(["current"]);
  cleanup();
  await Promise.resolve();
  expect(reads).toEqual(["current"]);
});

test("effect cleanup cancels an automatic read that has not started", async () => {
  const reads: string[] = [];
  const cleanup = scheduleAutoRead(() => { reads.push("cancelled"); });
  cleanup();
  cleanup();
  await Promise.resolve();
  expect(reads).toEqual([]);
});

test("the StrictMode setup cleanup setup cycle starts only the current read", async () => {
  const reads: string[] = [];
  const cleanupFirst = scheduleAutoRead(() => { reads.push("first"); });
  cleanupFirst();
  const cleanupCurrent = scheduleAutoRead(() => { reads.push("current"); });
  await Promise.resolve();
  expect(reads).toEqual(["current"]);
  cleanupCurrent();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

class DelayedNativeProvider implements Eip1193Provider {
  account = evm;
  chain = "0x8f";
  readonly nativeRequested = deferred<void>();
  readonly nativeBalance = deferred<string>();
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  async request({ method }: Eip1193RequestArguments): Promise<unknown> {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [this.account];
    if (method === "eth_chainId") return this.chain;
    if (method === "eth_blockNumber") return "0x10";
    if (method === "eth_getBalance") {
      this.nativeRequested.resolve();
      return this.nativeBalance.promise;
    }
    if (method === "eth_call") return "0x" + "0".repeat(64);
    throw new Error(`Unexpected synthetic provider method: ${method}`);
  }

  on(event: string, listener: (...args: unknown[]) => void) {
    let listeners = this.handlers.get(event);
    if (!listeners) this.handlers.set(event, listeners = new Set());
    listeners.add(listener);
  }

  removeListener(event: string, listener: (...args: unknown[]) => void) {
    this.handlers.get(event)?.delete(listener);
  }

  emit(event: string, value: unknown) {
    for (const listener of this.handlers.get(event) ?? []) listener(value);
  }
}

function delayedWallet() {
  const provider = new DelayedNativeProvider();
  const surface: OkxDiscoverySurface = Object.assign(new EventTarget(), { okxwallet: provider });
  const store = createWalletStore();
  const release = store.retain(surface);
  return { provider, store, release };
}

test("native balance completion at the published revision preserves an in-flight holdings read", async () => {
  const { provider, store, release } = delayedWallet();
  const connection = store.connect();
  await provider.nativeRequested.promise;
  const revision = store.getSnapshot().revision;
  expect(store.getSnapshot().snapshot.status).toBe("reading");
  const guard = createRunGuard();
  const run = guard.begin();
  const unsubscribe = subscribeHoldingsRevision(store, "todas", () => guard.invalidate());
  try {
    provider.nativeBalance.resolve("0xde0b6b3a7640000");
    await connection;
    expect(store.getSnapshot().snapshot.status).toBe("connected");
    expect(store.getSnapshot().revision).toBe(revision);
    expect(run.signal.aborted).toBe(false);
    expect(run.isCurrent()).toBe(true);
  } finally {
    unsubscribe();
    provider.nativeBalance.resolve("0x0");
    release();
    await connection;
  }
});

function untilWalletPublishes(store: ReturnType<typeof createWalletStore>, ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Synthetic wallet did not publish the expected state"));
    }, 1_000);
    const check = () => {
      if (!ready()) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    };
    unsubscribe = store.subscribe(check);
    check();
  });
}

test("reading and connected status publications at one revision preserve holdings", async () => {
  const { provider, store, release } = delayedWallet();
  provider.nativeBalance.resolve("0x0");
  await store.connect();
  const revision = store.getSnapshot().revision;
  const guard = createRunGuard();
  const run = guard.begin();
  const unsubscribe = subscribeHoldingsRevision(store, "atual", () => guard.invalidate());
  try {
    const refresh = store.refresh();
    expect(store.getSnapshot().snapshot.status).toBe("reading");
    expect(store.getSnapshot().revision).toBe(revision);
    expect(run.signal.aborted).toBe(false);
    await refresh;
    expect(store.getSnapshot().snapshot.status).toBe("connected");
    expect(store.getSnapshot().revision).toBe(revision);
    expect(run.isCurrent()).toBe(true);
  } finally {
    unsubscribe();
    release();
  }
});

test("asynchronous identity hash publication at one revision preserves holdings", async () => {
  const { provider, store, release } = delayedWallet();
  provider.nativeBalance.resolve("0x0");
  await store.connect();
  await untilWalletPublishes(store, () => store.getSnapshot().identityKey !== null);
  const initialIdentityKey = store.getSnapshot().identityKey;
  provider.account = "0x2222222222222222222222222222222222222222";
  provider.emit("accountsChanged", [provider.account]);
  const revision = store.getSnapshot().revision;
  expect(store.getSnapshot().identityKey).toBeNull();
  const guard = createRunGuard();
  const run = guard.begin();
  const unsubscribe = subscribeHoldingsRevision(store, "todas", () => guard.invalidate());
  try {
    await untilWalletPublishes(store, () => store.getSnapshot().identityKey !== null);
    expect(store.getSnapshot().identityKey).not.toBe(initialIdentityKey);
    expect(store.getSnapshot().revision).toBe(revision);
    expect(run.signal.aborted).toBe(false);
    expect(run.isCurrent()).toBe(true);
  } finally {
    unsubscribe();
    release();
  }
});

const sessionEvents = [
  {
    label: "account change",
    emit(provider: DelayedNativeProvider) {
      provider.account = "0x2222222222222222222222222222222222222222";
      provider.emit("accountsChanged", [provider.account]);
    },
  },
  {
    label: "chain change",
    emit(provider: DelayedNativeProvider) {
      provider.chain = "0xc4";
      provider.emit("chainChanged", provider.chain);
    },
  },
  {
    label: "repeated account event",
    emit(provider: DelayedNativeProvider) { provider.emit("accountsChanged", [provider.account]); },
  },
  {
    label: "repeated chain event",
    emit(provider: DelayedNativeProvider) { provider.emit("chainChanged", provider.chain); },
  },
];

for (const scope of ["atual", "todas"] as const) {
  for (const event of sessionEvents) {
    test(`${event.label} synchronously retires a ${scope} read after the revision publishes`, async () => {
      const { provider, store, release } = delayedWallet();
      const connection = store.connect();
      await provider.nativeRequested.promise;
      const revision = store.getSnapshot().revision;
      const guard = createRunGuard();
      const run = guard.begin();
      const invalidatedRevisions: number[] = [];
      const unsubscribe = subscribeHoldingsRevision(store, scope, () => {
        invalidatedRevisions.push(store.getSnapshot().revision);
        guard.invalidate();
      });
      try {
        event.emit(provider);
        expect(store.getSnapshot().revision).toBeGreaterThan(revision);
        expect(invalidatedRevisions.length).toBeGreaterThan(0);
        expect(invalidatedRevisions.every((value) => value > revision)).toBe(true);
        expect(run.signal.aborted).toBe(true);
        expect(run.isCurrent()).toBe(false);
        provider.nativeBalance.resolve("0x0");
        await connection;
        expect(run.isCurrent()).toBe(false);
      } finally {
        unsubscribe();
        provider.nativeBalance.resolve("0x0");
        release();
        await connection;
      }
    });
  }
}

test("Solana holdings remain current through EVM account, chain, repeated and disconnect events", async () => {
  const { provider, store, release } = delayedWallet();
  const connection = store.connect();
  await provider.nativeRequested.promise;
  const revision = store.getSnapshot().revision;
  const guard = createRunGuard();
  const run = guard.begin();
  const unsubscribe = subscribeHoldingsRevision(store, "solana", () => guard.invalidate());
  try {
    for (const event of sessionEvents) {
      event.emit(provider);
      expect(run.signal.aborted).toBe(false);
      expect(run.isCurrent()).toBe(true);
    }
    provider.emit("disconnect", undefined);
    expect(store.getSnapshot().revision).toBeGreaterThan(revision);
    expect(run.signal.aborted).toBe(false);
    provider.nativeBalance.resolve("0x0");
    await connection;
    expect(run.isCurrent()).toBe(true);
  } finally {
    unsubscribe();
    provider.nativeBalance.resolve("0x0");
    release();
    await connection;
  }
});

test("unsubscribing stops retirement when a later EVM revision publishes", async () => {
  const { provider, store, release } = delayedWallet();
  const connection = store.connect();
  await provider.nativeRequested.promise;
  const revision = store.getSnapshot().revision;
  const guard = createRunGuard();
  const run = guard.begin();
  const unsubscribe = subscribeHoldingsRevision(store, "todas", () => guard.invalidate());
  try {
    unsubscribe();
    unsubscribe();
    provider.emit("chainChanged", provider.chain);
    expect(store.getSnapshot().revision).toBeGreaterThan(revision);
    expect(run.signal.aborted).toBe(false);
    provider.nativeBalance.resolve("0x0");
    await connection;
    expect(run.isCurrent()).toBe(true);
  } finally {
    unsubscribe();
    provider.nativeBalance.resolve("0x0");
    release();
    await connection;
  }
});
