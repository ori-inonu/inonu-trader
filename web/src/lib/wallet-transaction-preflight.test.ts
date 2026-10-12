import { describe, expect, it, spyOn } from "bun:test";
import { validateWalletTransactionProposal } from "./wallet-transaction-preflight";
import { createWalletSession, type Eip1193Provider, type Eip1193RequestArguments, type WalletSessionOptions } from "./okx-wallet";

const ACCOUNT = "0xabcd000000000000000000000000000000000000";
const OTHER = "0x1111111111111111111111111111111111111111";
class Provider implements Eip1193Provider {
  calls: Eip1193RequestArguments[] = [];
  events = new Map<string, Set<(...args: unknown[]) => void>>();
  respond: (args: Eip1193RequestArguments) => unknown = args => {
    if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") return [ACCOUNT];
    if (args.method === "eth_chainId") return "0x8f";
    if (args.method === "eth_call") return "0x" + "0".repeat(64);
    return "0x1";
  };
  request(args: Eip1193RequestArguments): Promise<unknown> { this.calls.push(args); return Promise.resolve(this.respond(args)); }
  on(event: string, listener: (...args: unknown[]) => void) { if (!this.events.has(event)) this.events.set(event, new Set()); this.events.get(event)!.add(listener); }
  removeListener(event: string, listener: (...args: unknown[]) => void) { this.events.get(event)?.delete(listener); }
  emit(event: string, ...args: unknown[]) { for (const listener of this.events.get(event) ?? []) listener(...args); }
}
async function connected(options: WalletSessionOptions = {}) {
  const provider = new Provider();
  const session = createWalletSession(provider, { now: () => 1000, ...options });
  await session.connect();
  expect(session.getSnapshot().status).toBe("connected");
  provider.calls.length = 0;
  return { provider, session };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const METHODS = ["eth_accounts", "eth_chainId", "eth_accounts", "eth_chainId"];
const reply = (method: string) => method === "eth_accounts" ? [ACCOUNT] : "0x8f";
const ticks = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

const proposal = () => ({
  version: 1,
  planId: "plan-fixture-1",
  quoteHash: "quote-fixture-1",
  chainId: "0x8f",
  from: "0xABCd000000000000000000000000000000000000",
  to: "0xDEf0000000000000000000000000000000000000",
  data: "0xABcd",
  valueAtomic: "9007199254740993",
  gasLimitAtomic: "21000",
  maxFeePerGasAtomic: "2",
  maxPriorityFeePerGasAtomic: "1",
  createdAtMs: 1000,
  expiresAtMs: 2000,
});

describe("wallet session public transaction preflight", () => {
  it("waits for each read before beginning the next round", async () => {
    const { provider, session } = await connected();
    const answers = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    let index = 0;
    provider.respond = () => answers[index++].promise;
    const pending = session.preflightTransaction(proposal());
    for (const stage of [0, 1, 2, 3]) {
      await ticks();
      expect(provider.calls.map(call => call.method)).toEqual(METHODS.slice(0, stage + 1));
      answers[stage].resolve(reply(METHODS[stage]));
    }
    expect((await pending).status).toBe("ready_for_review");
    session.dispose();
  });
  it("blocks a session connecting, reading, on an unsupported network or disposed", async () => {
    const provider = new Provider();
    const session = createWalletSession(provider, { now: () => 1000 });
    const accounts = deferred<unknown>();
    provider.respond = () => accounts.promise;
    const connecting = session.connect();
    await ticks();
    expect(session.getSnapshot().status).toBe("connecting");
    const consentCalls = provider.calls.length;
    expect(await session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "session_unavailable" });
    expect(provider.calls.length).toBe(consentCalls);
    accounts.resolve([]);
    await connecting;
    session.dispose();
    provider.calls.length = 0;
    expect(await session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "session_unavailable" });
    expect(provider.calls).toEqual([]);

    const active = await connected();
    const refreshAnswer = deferred<unknown>();
    active.provider.respond = () => refreshAnswer.promise;
    const refreshing = active.session.refresh();
    await ticks();
    expect(active.session.getSnapshot().status).toBe("reading");
    const refreshCalls = active.provider.calls.length;
    expect(await active.session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "session_unavailable" });
    expect(active.provider.calls.length).toBe(refreshCalls);
    refreshAnswer.resolve([]);
    await refreshing;
    active.session.dispose();

    const unsupported = new Provider(); const normal = unsupported.respond;
    unsupported.respond = args => args.method === "eth_chainId" ? "0x1" : normal(args);
    const wrongNetwork = createWalletSession(unsupported, { now: () => 1000 });
    await wrongNetwork.connect(); unsupported.calls.length = 0;
    expect(wrongNetwork.getSnapshot().status).toBe("wrong-network");
    expect(await wrongNetwork.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "session_unavailable" });
    expect(unsupported.calls).toEqual([]);
    wrongNetwork.dispose();
  });
  for (const stage of [0, 1, 2, 3]) {
    it(`ignores a late successful answer after timeout at read ${stage + 1}`, async () => {
      const { provider, session } = await connected({ timeoutMs: 3 });
      const answer = deferred<unknown>(); let index = 0;
      provider.respond = args => index++ === stage ? answer.promise : reply(args.method);
      const snapshot = session.getSnapshot(); let notices = 0;
      session.subscribe(() => notices++); const before = notices;
      expect(await session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "provider_timeout" });
      answer.resolve(reply(METHODS[stage])); await ticks();
      expect(provider.calls.map(call => call.method)).toEqual(METHODS.slice(0, stage + 1));
      expect(session.getSnapshot()).toBe(snapshot);
      expect(notices).toBe(before);
      session.dispose();
    });
    it(`stops at invalid identity response ${stage + 1}`, async () => {
      for (const response of stage % 2 === 0 ? [null, {}, [], ["bad"], [OTHER, ACCOUNT], [ACCOUNT, "bad"]] : [null, 143, {}, "0x08f", "0x1", "0x8f\n"]) {
        const { provider, session } = await connected();
        let index = 0;
        provider.respond = args => index++ === stage ? response : reply(args.method);
        const result = await session.preflightTransaction(proposal());
        expect(result.status).toBe("blocked");
        expect(result.executionQualified).toBe(false);
        expect(provider.calls.map(call => call.method)).toEqual(METHODS.slice(0, stage + 1));
        session.dispose();
      }
    });
    it(`uses the first authorized account in round ${stage + 1}`, async () => {
      const { provider, session } = await connected();
      provider.respond = args => args.method === "eth_accounts" ? [ACCOUNT.toUpperCase().replace("0X", "0x"), OTHER] : "0x8F";
      expect((await session.preflightTransaction(proposal())).status).toBe("ready_for_review");
      session.dispose();
    });
    for (const mode of ["reject", "throw", "timeout"] as const) it(`sanitizes ${mode} at read ${stage + 1} and ignores late settlement`, async () => {
      const { provider, session } = await connected({ timeoutMs: 3 });
      const answer = deferred<unknown>(); let index = 0;
      provider.respond = args => {
        if (index++ !== stage) return reply(args.method);
        if (mode === "throw") throw new Error("PRIVATE_PROVIDER_MESSAGE");
        if (mode === "reject") return Promise.reject(new Error("PRIVATE_PROVIDER_MESSAGE"));
        return answer.promise;
      };
      const snapshot = session.getSnapshot(); let notices = 0;
      session.subscribe(() => notices++); const before = notices;
      expect(await session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: mode === "timeout" ? "provider_timeout" : "provider_error" });
      answer.reject(new Error("LATE_PRIVATE_MESSAGE"));
      // Rejection is observed by the provider wait only for timeout cases.
      if (mode !== "timeout") void answer.promise.catch(() => {});
      await ticks();
      expect(provider.calls.map(call => call.method)).toEqual(METHODS.slice(0, stage + 1));
      expect(session.getSnapshot()).toBe(snapshot);
      expect(notices).toBe(before);
      session.dispose();
    });
    for (const event of ["accountsChanged", "chainChanged", "disconnect", "accountABA", "chainABA", "refresh", "reconnect", "switch", "localDisconnect", "dispose"] as const)
      it(`invalidates ${event} during read ${stage + 1}`, async () => {
        const { provider, session } = await connected();
        const started = deferred<void>(); const answer = deferred<unknown>();
        const normal = provider.respond; let index = 0;
        provider.respond = args => {
          if (index++ === stage) { started.resolve(); return answer.promise; }
          return normal(args);
        };
        let notifications = 0; session.subscribe(() => notifications++);
        const pending = session.preflightTransaction(proposal());
        await started.promise;
        if (event === "accountsChanged") provider.emit("accountsChanged", []);
        if (event === "chainChanged") provider.emit("chainChanged", "0xc4");
        if (event === "disconnect") provider.emit("disconnect");
        if (event === "accountABA") { provider.emit("accountsChanged", [OTHER]); provider.emit("accountsChanged", [ACCOUNT]); }
        if (event === "chainABA") { provider.emit("chainChanged", "0xc4"); provider.emit("chainChanged", "0x8f"); }
        if (event === "refresh") await session.refresh();
        if (event === "reconnect") await session.connect();
        if (event === "switch") await session.switchToXLayer();
        if (event === "localDisconnect") session.disconnect();
        if (event === "dispose") session.dispose();
        await ticks();
        const snapshot = session.getSnapshot(); const before = notifications; const calls = provider.calls.length;
        answer.resolve(reply(METHODS[stage]));
        expect(await pending).toEqual({ status: "blocked", executionQualified: false, reason: "session_changed" });
        await ticks();
        expect(session.getSnapshot()).toBe(snapshot);
        expect(notifications).toBe(before);
        expect(provider.calls.length).toBe(calls);
        session.dispose();
      });
  }
  for (const checkpoint of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (const mode of ["expiry", "regression", "invalid", "throw"] as const) it(`checks ${mode} at clock checkpoint ${checkpoint}`, async () => {
      let active = false; let reads = 0;
      const { provider, session } = await connected({ now: () => {
        if (!active) return 1000;
        if (++reads === checkpoint) {
          if (mode === "throw") throw new Error("PRIVATE_CLOCK_MESSAGE");
          return mode === "expiry" ? 2000 : mode === "regression" ? 999 : NaN;
        }
        return 1000;
      } });
      active = true;
      const result = await session.preflightTransaction(proposal());
      expect(result).toEqual({ status: "blocked", executionQualified: false, reason: mode === "expiry" ? "expired" : mode === "regression" ? (checkpoint === 1 ? "not_yet_valid" : "clock_regressed") : "invalid_clock" });
      expect(provider.calls.length).toBe(checkpoint === 1 ? 0 : Math.floor((checkpoint - 1) / 2));
      session.dispose();
    });
    it(`checks revision after clock callback ${checkpoint}`, async () => {
      let active = false; let reads = 0; let invalidate = () => {};
      const { session } = await connected({ now: () => { if (active && ++reads === checkpoint) invalidate(); return 1000; } });
      invalidate = () => session.disconnect(); active = true;
      expect(await session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "session_changed" });
      session.dispose();
    });
  }
  it("copies input before the first wait and returns the final observation time", async () => {
    let now = 1000;
    const { provider, session } = await connected({ now: () => now });
    const input = proposal(); const answer = deferred<unknown>(); const started = deferred<void>(); let index = 0;
    provider.respond = args => { if (index++ === 0) { started.resolve(); return answer.promise; } now = 1500; return reply(args.method); };
    const pending = session.preflightTransaction(input); await started.promise;
    input.from = OTHER; input.chainId = "0xc4"; input.valueAtomic = "0"; input.expiresAtMs = 999;
    answer.resolve([ACCOUNT]);
    const result = await pending;
    expect(result.status).toBe("ready_for_review");
    if (result.status !== "ready_for_review") throw new Error("expected review evidence");
    expect(result.proposal.from).toBe("0xabcd000000000000000000000000000000000000");
    expect(result.proposal.chainId).toBe("0x8f");
    expect(result.proposal.valueAtomic).toBe("9007199254740993");
    expect(result.proposal.expiresAtMs).toBe(2000);
    expect(result.observedAtMs).toBe(1500);
    expect(Object.isFrozen(result.proposal)).toBe(true);
    session.dispose();
  });
  it("blocks invalid input and disconnected sessions without RPC or consent", async () => {
    const provider = new Provider(); const session = createWalletSession(provider, { now: () => 1000 });
    expect((await session.preflightTransaction(proposal())).status).toBe("blocked");
    expect(provider.calls).toEqual([]);
    await session.connect(); provider.calls.length = 0;
    expect((await session.preflightTransaction({ ...proposal(), signature: "extra" })).status).toBe("blocked");
    expect(provider.calls).toEqual([]);
    for (const patch of [{ from: OTHER }, { chainId: "0xc4" }]) expect((await session.preflightTransaction({ ...proposal(), ...patch })).status).toBe("blocked");
    expect(provider.calls).toEqual([]);
    session.disconnect();
    expect((await session.preflightTransaction(proposal())).status).toBe("blocked");
    expect(provider.calls).toEqual([]);
    session.dispose();
  });
  it("accepts X Layer using its actual provider network", async () => {
    const provider = new Provider(); const normal = provider.respond;
    provider.respond = args => args.method === "eth_chainId" ? "0xc4" : normal(args);
    const session = createWalletSession(provider, { now: () => 1000 }); await session.connect(); provider.calls.length = 0;
    expect((await session.preflightTransaction({ ...proposal(), chainId: "0xc4" })).status).toBe("ready_for_review");
    expect(provider.calls.map(call => call.method)).toEqual(["eth_accounts", "eth_chainId", "eth_accounts", "eth_chainId"]);
    session.dispose();
  });
  for (const [configured, expected] of [[1, 1], [0.5, 0.5], [9000, 8000], [NaN, 8000], [Infinity, 8000], [-1, 8000], [0, 8000]] as const)
    it(`uses a positive finite bounded timeout for option ${configured}`, async () => {
      const { provider, session } = await connected({ timeoutMs: configured });
      provider.respond = () => new Promise(() => {});
      const durations: number[] = []; const native = globalThis.setTimeout;
      const timer = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, duration: number) => { durations.push(duration); return native(callback, 0); }) as typeof setTimeout);
      try {
        expect(await session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "provider_timeout" });
        expect(durations).toEqual([expected]);
      } finally { timer.mockRestore(); session.dispose(); }
    });
  it("honors the configured finite read timeout and ignores the late answer", async () => {
    const { provider, session } = await connected({ timeoutMs: 5 });
    const answer = deferred<unknown>();
    provider.respond = () => answer.promise;
    const snapshot = session.getSnapshot();
    const result = await session.preflightTransaction(proposal());
    expect(result).toEqual({ status: "blocked", executionQualified: false, reason: "provider_timeout" });
    answer.resolve([ACCOUNT]);
    await Promise.resolve(); await Promise.resolve();
    expect(provider.calls).toEqual([{ method: "eth_accounts" }]);
    expect(session.getSnapshot()).toBe(snapshot);
    session.dispose();
  });
  it("blocks expiration after the first provider await before reading again", async () => {
    let now = 1000;
    const { provider, session } = await connected({ now: () => now });
    provider.respond = () => { now = 2000; return [ACCOUNT]; };
    expect(await session.preflightTransaction(proposal())).toEqual({ status: "blocked", executionQualified: false, reason: "expired" });
    expect(provider.calls).toEqual([{ method: "eth_accounts" }]);
    session.dispose();
  });
  it("blocks a late response after disposal without another request or publication", async () => {
    const { provider, session } = await connected();
    const started = deferred<void>(); const answer = deferred<unknown>();
    provider.respond = () => { started.resolve(); return answer.promise; };
    const pending = session.preflightTransaction(proposal());
    await started.promise;
    session.dispose();
    const disposedSnapshot = session.getSnapshot();
    answer.resolve([ACCOUNT]);
    expect(await pending).toEqual({ status: "blocked", executionQualified: false, reason: "session_changed" });
    expect(provider.calls).toEqual([{ method: "eth_accounts" }]);
    expect(session.getSnapshot()).toBe(disposedSnapshot);
  });
  it("checks both sequential rounds through the connected provider without publishing", async () => {
    const { provider, session } = await connected();
    const snapshot = session.getSnapshot();
    const notifications: unknown[] = [];
    session.subscribe(next => notifications.push(next));
    const before = notifications.length;
    const result = await session.preflightTransaction(proposal());
    expect(result.status).toBe("ready_for_review");
    expect(result.executionQualified).toBe(false);
    expect(provider.calls).toEqual([{ method: "eth_accounts" }, { method: "eth_chainId" }, { method: "eth_accounts" }, { method: "eth_chainId" }]);
    expect(session.getSnapshot()).toBe(snapshot);
    expect(notifications.length).toBe(before);
    session.dispose();
  });
});

describe("wallet transaction proposal public validation", () => {
  it("rejects nonplain, missing, symbolic, accessor and throwing proxy inputs", () => {
    const missing = proposal() as Record<string, unknown>; delete missing.planId;
    const symbol = { ...proposal(), [Symbol("private")]: "extra" };
    const inherited = Object.assign(Object.create({ custom: true }), proposal());
    class Custom { constructor() { Object.assign(this, proposal()); } }
    const cycle = { ...proposal(), extra: null as unknown }; cycle.extra = cycle;
    for (const input of [null, undefined, true, 1, "text", [], missing, symbol, inherited, new Custom(), cycle,
      new Proxy(proposal(), { getPrototypeOf() { throw new Error("PRIVATE_TRAP"); } }),
      new Proxy(proposal(), { ownKeys() { throw new Error("PRIVATE_TRAP"); } }),
      new Proxy(proposal(), { getOwnPropertyDescriptor() { throw new Error("PRIVATE_TRAP"); } }),
    ]) expect(validateWalletTransactionProposal(input, 1000)).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_proposal" });
    let calls = 0;
    for (const field of Object.keys(proposal())) {
      const input = proposal();
      Object.defineProperty(input, field, { get() { calls++; throw new Error("GETTER_PRIVATE"); } });
      expect(validateWalletTransactionProposal(input, 1000).status).toBe("blocked");
      Object.defineProperty(input, field, { set() { calls++; } });
      expect(validateWalletTransactionProposal(input, 1000).status).toBe("blocked");
    }
    expect(calls).toBe(0);
    expect(validateWalletTransactionProposal(Object.assign(Object.create(null), proposal()), 1000).status).toBe("ready_for_review");
    const guarded = new Proxy(proposal(), { get() { calls++; throw new Error("PROPERTY_READ_PRIVATE"); } });
    expect(validateWalletTransactionProposal(guarded, 1000).status).toBe("ready_for_review");
    expect(calls).toBe(0);
  });
  it("enforces label, address and data boundaries without truncation", () => {
    for (const field of ["planId", "quoteHash"] as const) {
      expect(validateWalletTransactionProposal({ ...proposal(), [field]: "a".repeat(128) }, 1000).status).toBe("ready_for_review");
      for (const value of ["", "a".repeat(129), null, undefined, 1, {}, []]) expect(validateWalletTransactionProposal({ ...proposal(), [field]: value }, 1000).status).toBe("blocked");
    }
    for (const field of ["from", "to"] as const)
      for (const value of ["0x0000000000000000000000000000000000000000", "0x1", ACCOUNT + "0", ACCOUNT + "\n", ACCOUNT.slice(2), "0X" + ACCOUNT.slice(2), "0x" + "g".repeat(40), 0, null, {}]) expect(validateWalletTransactionProposal({ ...proposal(), [field]: value }, 1000).status).toBe("blocked");
    for (const data of ["0x", "0x" + "aB".repeat(65536)]) {
      const result = validateWalletTransactionProposal({ ...proposal(), data }, 1000);
      expect(result.status).toBe("ready_for_review");
      if (result.status === "ready_for_review") expect(result.proposal.data.length).toBe(data.length);
    }
    for (const data of ["0x" + "00".repeat(65537), "0x0", "0x00\n", "0X00", "0xgg", "", 0, null]) expect(validateWalletTransactionProposal({ ...proposal(), data }, 1000).status).toBe("blocked");
    for (const chainId of ["0x08f", "0x8F", "0xC4", "0x1", "143", 143, null]) expect(validateWalletTransactionProposal({ ...proposal(), chainId }, 1000).status).toBe("blocked");
    for (const version of [0, 2, "1", null, undefined]) expect(validateWalletTransactionProposal({ ...proposal(), version }, 1000).status).toBe("blocked");
  });
  it("rejects every noncanonical decimal field and enforces literal sum and priority boundaries", () => {
    for (const field of ["valueAtomic", "gasLimitAtomic", "maxFeePerGasAtomic", "maxPriorityFeePerGasAtomic"] as const)
      for (const value of ["00", "01", "-1", "+1", " 1", "1 ", "1\n", "1.0", "1e1", "0x1", "١", "", "9".repeat(79), 1, null, undefined, {}, []]) expect(validateWalletTransactionProposal({ ...proposal(), [field]: value }, 1000).status).toBe("blocked");
    const totalAtMax = { ...proposal(), gasLimitAtomic: "1", maxFeePerGasAtomic: "1", maxPriorityFeePerGasAtomic: "1", valueAtomic: "115792089237316195423570985008687907853269984665640564039457584007913129639934" };
    expect(validateWalletTransactionProposal(totalAtMax, 1000).status).toBe("ready_for_review");
    expect(validateWalletTransactionProposal({ ...totalAtMax, valueAtomic: "115792089237316195423570985008687907853269984665640564039457584007913129639935" }, 1000).status).toBe("blocked");
    expect(validateWalletTransactionProposal({ ...totalAtMax, maxPriorityFeePerGasAtomic: "2" }, 1000).status).toBe("blocked");
    expect(validateWalletTransactionProposal({ ...proposal(), gasLimitAtomic: "2", maxFeePerGasAtomic: "57896044618658097711785492504343953926634992332820282019728792003956564819967", maxPriorityFeePerGasAtomic: "0", valueAtomic: "1" }, 1000).status).toBe("ready_for_review");
    expect(validateWalletTransactionProposal({ ...proposal(), gasLimitAtomic: "2", maxFeePerGasAtomic: "57896044618658097711785492504343953926634992332820282019728792003956564819968", maxPriorityFeePerGasAtomic: "0", valueAtomic: "0" }, 1000).status).toBe("blocked");
  });
  it("enforces safe nonnegative timestamp endpoints and the maximal safe observation", () => {
    for (const field of ["createdAtMs", "expiresAtMs"] as const)
      for (const value of [-1, 1.1, NaN, Infinity, 9007199254740992, "1000", null, undefined]) expect(validateWalletTransactionProposal({ ...proposal(), [field]: value }, 1000).status).toBe("blocked");
    expect(validateWalletTransactionProposal({ ...proposal(), createdAtMs: 0, expiresAtMs: 1 }, 0).status).toBe("ready_for_review");
    expect(validateWalletTransactionProposal({ ...proposal(), createdAtMs: 0, expiresAtMs: 1 }, 1).status).toBe("blocked");
    expect(validateWalletTransactionProposal({ ...proposal(), createdAtMs: 9007199254740990, expiresAtMs: 9007199254740991 }, 9007199254740990).status).toBe("ready_for_review");
    expect(validateWalletTransactionProposal({ ...proposal(), createdAtMs: 9007199254740990, expiresAtMs: 9007199254740991 }, 9007199254740991).status).toBe("blocked");
  });
  it("accepts creation, rejects expiration and rejects invalid clocks", () => {
    expect(validateWalletTransactionProposal(proposal(), 1000).status).toBe("ready_for_review");
    expect(validateWalletTransactionProposal(proposal(), 1999).status).toBe("ready_for_review");
    expect(validateWalletTransactionProposal(proposal(), 999)).toEqual({ status: "blocked", executionQualified: false, reason: "not_yet_valid" });
    expect(validateWalletTransactionProposal(proposal(), 2000)).toEqual({ status: "blocked", executionQualified: false, reason: "expired" });
    for (const now of [-1, 1000.1, NaN, Infinity, 9007199254740992]) expect(validateWalletTransactionProposal(proposal(), now)).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_clock" });
    for (const patch of [{ createdAtMs: -1 }, { createdAtMs: 1000.1 }, { expiresAtMs: 9007199254740992 }, { expiresAtMs: 1000 }]) expect(validateWalletTransactionProposal({ ...proposal(), ...patch }, 1000).status).toBe("blocked");
  });
  it("bounds uint256 gas products and total with exact literal decimal oracles", () => {
    const max = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const overflow = "115792089237316195423570985008687907853269984665640564039457584007913129639936";
    const accepted = { ...proposal(), valueAtomic: "0", gasLimitAtomic: "1", maxFeePerGasAtomic: max, maxPriorityFeePerGasAtomic: "0" };
    expect(validateWalletTransactionProposal(accepted, 1000).status).toBe("ready_for_review");
    for (const patch of [{ valueAtomic: overflow }, { valueAtomic: max }, { gasLimitAtomic: "2" }, { valueAtomic: "01" }, { valueAtomic: "1e2" }, { maxPriorityFeePerGasAtomic: overflow }, { gasLimitAtomic: "0" }, { maxFeePerGasAtomic: "0" }])
      expect(validateWalletTransactionProposal({ ...accepted, ...patch }, 1000)).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_proposal" });
  });
  it("enforces the closed version, chains, labels, addresses and byte data", () => {
    for (const patch of [
      { version: 2 }, { chainId: "0x08f" }, { chainId: "0x1" },
      { planId: "" }, { quoteHash: "q".repeat(129) },
      { from: "0x0000000000000000000000000000000000000000" },
      { to: "0x1234" }, { data: "0x0" }, { data: "0xgg" },
    ]) expect(validateWalletTransactionProposal({ ...proposal(), ...patch }, 1000)).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_proposal" });
  });
  it("rejects extra fields and accessors without invoking getters", () => {
    expect(validateWalletTransactionProposal({ ...proposal(), extra: true }, 1000)).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_proposal" });
    let calls = 0;
    const input = proposal();
    Object.defineProperty(input, "planId", { get() { calls++; return "trap"; } });
    expect(validateWalletTransactionProposal(input, 1000)).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_proposal" });
    expect(calls).toBe(0);
  });
  it("copies and freezes a valid proposal without changing exact decimal amounts", () => {
    const input = proposal();
    const result = validateWalletTransactionProposal(input, 1000);
    expect(result).toEqual({
      status: "ready_for_review", executionQualified: false, observedAtMs: 1000,
      proposal: {
        version: 1, planId: "plan-fixture-1", quoteHash: "quote-fixture-1", chainId: "0x8f",
        from: "0xabcd000000000000000000000000000000000000",
        to: "0xdef0000000000000000000000000000000000000", data: "0xabcd",
        valueAtomic: "9007199254740993", gasLimitAtomic: "21000", maxFeePerGasAtomic: "2", maxPriorityFeePerGasAtomic: "1",
        createdAtMs: 1000, expiresAtMs: 2000,
      },
    });
    if (result.status !== "ready_for_review") throw new Error("expected review evidence");
    expect(Object.isFrozen(result.proposal)).toBe(true);
    input.valueAtomic = "0";
    expect(result.proposal.valueAtomic).toBe("9007199254740993");
  });
});

describe("wallet preflight V3 reproduction", () => {
  it("RV1 V3 preserves literal first14 second15 and records blocked schema mismatch", () => {
    // V1 has 13 allowed fields. The literal 14/15 witness is preserved rather
    // than silently replaced with a different stimulus or labeled a RED.
    const first14 = ["version", "planId", "quoteHash", "chainId", "from", "to", "data", "valueAtomic", "gasLimitAtomic", "maxFeePerGasAtomic", "maxPriorityFeePerGasAtomic", "createdAtMs", "expiresAtMs", "extraPreliminary"];
    const second15 = ["version", "planId", "quoteHash", "chainId", "from", "to", "data", "valueAtomic", "gasLimitAtomic", "maxFeePerGasAtomic", "maxPriorityFeePerGasAtomic", "createdAtMs", "expiresAtMs", "extraPreliminary", "extraCaptured"];
    const enumerated: string[][] = [];
    const input = new Proxy({ ...proposal(), extraPreliminary: true, extraCaptured: true }, {
      ownKeys() { const keys = enumerated.length === 0 ? first14 : second15; enumerated.push([...keys]); return [...keys]; },
    });
    const result = validateWalletTransactionProposal(input, 1000);
    console.log("V3_OBSERVATION " + JSON.stringify({ finding: "RV1", first14, second15, enumerated, result }));
    expect(result).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_proposal" });
  });
});

describe("wallet preflight V4 reproduction", () => {
  it("RV1 V4 blocks first13 permitted keys then captured14 with extra", () => {
    const first13 = ["version", "planId", "quoteHash", "chainId", "from", "to", "data", "valueAtomic", "gasLimitAtomic", "maxFeePerGasAtomic", "maxPriorityFeePerGasAtomic", "createdAtMs", "expiresAtMs"];
    const second14 = ["version", "planId", "quoteHash", "chainId", "from", "to", "data", "valueAtomic", "gasLimitAtomic", "maxFeePerGasAtomic", "maxPriorityFeePerGasAtomic", "createdAtMs", "expiresAtMs", "extraCaptured"];
    const enumerated: string[][] = [];
    const input = new Proxy({ ...proposal(), extraCaptured: true }, {
      ownKeys() { const keys = enumerated.length === 0 ? first13 : second14; enumerated.push([...keys]); return [...keys]; },
    });
    const result = validateWalletTransactionProposal(input, 1000);
    console.log("V4_OBSERVATION " + JSON.stringify({ finding: "RV1", first13, second14, enumerated, result }));
    expect(enumerated).toEqual([first13, second14]);
    expect(result).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_proposal" });
  });

  for (const targetRound of [1, 2]) {
    it(`RV2 V4 blocks actual first account divergence despite own map in round ${targetRound}`, async () => {
      const { provider, session } = await connected();
      let accountRound = 0;
      let mapCalls = 0;
      const deceptiveAccounts = [OTHER];
      Object.defineProperty(deceptiveAccounts, "map", {
        value() { mapCalls++; return [ACCOUNT]; }, configurable: true,
      });
      provider.respond = ({ method }) => {
        if (method === "eth_accounts") return ++accountRound === targetRound ? deceptiveAccounts : [ACCOUNT];
        return "0x8f";
      };
      try {
        const result = await session.preflightTransaction(proposal());
        console.log("V4_OBSERVATION " + JSON.stringify({ finding: "RV2", targetRound, actualFirstAccount: deceptiveAccounts[0], artificialMapAccount: ACCOUNT, mapCalls, calls: provider.calls.map(({ method }) => method), result }));
        expect(result).toEqual({ status: "blocked", executionQualified: false, reason: "identity_mismatch" });
        expect(mapCalls).toBe(0);
        expect(provider.calls.map(({ method }) => method)).toEqual(targetRound === 1 ? ["eth_accounts"] : ["eth_accounts", "eth_chainId", "eth_accounts"]);
      } finally { session.dispose(); }
    });

    it(`RV3 V4 blocks length2 index1 absent accounts in round ${targetRound}`, async () => {
      const { provider, session } = await connected();
      let accountRound = 0;
      const sparseAccounts = [ACCOUNT];
      sparseAccounts.length = 2;
      provider.respond = ({ method }) => {
        if (method === "eth_accounts") return ++accountRound === targetRound ? sparseAccounts : [ACCOUNT];
        return "0x8f";
      };
      try {
        const result = await session.preflightTransaction(proposal());
        console.log("V4_OBSERVATION " + JSON.stringify({ finding: "RV3", targetRound, firstAccount: sparseAccounts[0], length: sparseAccounts.length, index1Present: Object.hasOwn(sparseAccounts, 1), calls: provider.calls.map(({ method }) => method), result }));
        expect(result).toEqual({ status: "blocked", executionQualified: false, reason: "invalid_provider_response" });
        expect(provider.calls.map(({ method }) => method)).toEqual(targetRound === 1 ? ["eth_accounts"] : ["eth_accounts", "eth_chainId", "eth_accounts"]);
      } finally { session.dispose(); }
    });
  }
});

describe("wallet preflight V5 account descriptor boundaries", () => {
  for (const targetRound of [1, 2]) {
    for (const kind of ["index_accessor", "inherited_index", "length_trap", "index_trap"] as const)
      it(`blocks ${kind} without publication in account round ${targetRound}`, async () => {
        const { provider, session } = await connected();
        const accounts = [ACCOUNT];
        let getterCalls = 0;
        let response: unknown = accounts;
        if (kind === "index_accessor") Object.defineProperty(accounts, "1", {
          get() { getterCalls++; throw new Error("PRIVATE_INDEX_GETTER"); }, configurable: true,
        });
        if (kind === "inherited_index") {
          accounts.length = 2;
          Object.setPrototypeOf(accounts, Object.create(Array.prototype, {
            "1": { get() { getterCalls++; return OTHER; }, configurable: true },
          }));
        }
        if (kind === "length_trap" || kind === "index_trap") response = new Proxy(accounts, {
          getOwnPropertyDescriptor(target, key) {
            if (key === (kind === "length_trap" ? "length" : "0")) throw new Error("PRIVATE_DESCRIPTOR_TRAP");
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        });
        let accountRound = 0;
        provider.respond = ({ method }) => method === "eth_accounts"
          ? (++accountRound === targetRound ? response : [ACCOUNT]) : "0x8f";
        const snapshot = session.getSnapshot();
        let notices = 0; const unsubscribe = session.subscribe(() => notices++);
        const before = notices;
        const listeners = Array.from(provider.events.values(), entries => entries.size);
        try {
          expect(await session.preflightTransaction(proposal())).toEqual({
            status: "blocked", executionQualified: false, reason: "invalid_provider_response",
          });
          expect(getterCalls).toBe(0);
          expect(provider.calls.map(({ method }) => method)).toEqual(targetRound === 1
            ? ["eth_accounts"] : ["eth_accounts", "eth_chainId", "eth_accounts"]);
          expect(session.getSnapshot()).toBe(snapshot);
          expect(notices).toBe(before);
          expect(Array.from(provider.events.values(), entries => entries.size)).toEqual(listeners);
        } finally { unsubscribe(); session.dispose(); }
      });

    it(`accepts actual accounts without reading map/some getters in round ${targetRound}`, async () => {
      const { provider, session } = await connected();
      const accounts = [ACCOUNT, OTHER];
      let methodGetterCalls = 0;
      for (const method of ["map", "some"]) Object.defineProperty(accounts, method, {
        get() { methodGetterCalls++; throw new Error("PRIVATE_METHOD_GETTER"); }, configurable: true,
      });
      let accountRound = 0;
      provider.respond = ({ method }) => method === "eth_accounts"
        ? (++accountRound === targetRound ? accounts : [ACCOUNT]) : "0x8f";
      try {
        const result = await session.preflightTransaction(proposal());
        expect(result.status).toBe("ready_for_review");
        expect(result.executionQualified).toBe(false);
        expect(methodGetterCalls).toBe(0);
        expect(provider.calls.map(({ method }) => method)).toEqual([
          "eth_accounts", "eth_chainId", "eth_accounts", "eth_chainId",
        ]);
      } finally { session.dispose(); }
    });
  }
  it("sanitizes revoked arrays on the existing account event boundary", async () => {
    const { provider, session } = await connected();
    const revoked = Proxy.revocable([ACCOUNT], {});
    revoked.revoke();
    try {
      expect(() => provider.emit("accountsChanged", revoked.proxy)).not.toThrow();
      expect(session.getSnapshot().status).toBe("error");
      expect(session.getSnapshot().account).toBeNull();
      expect(session.getSnapshot().error).toBe("A carteira retornou um endereço inválido. Reconecte no OKX.");
      expect(provider.calls).toEqual([]);
    } finally { session.dispose(); }
  });
});
