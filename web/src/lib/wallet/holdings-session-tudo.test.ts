// The scope that reads both kinds of account at once ("tudo"): when it is the default, when a choice of it holds, what makes its read start over. The other scopes keep the rules
// they had (see holdings-session.test.ts). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { holdingsSessionKey, resolveHoldingsScope, subscribeHoldingsRevision } from "./holdings-session";

const evm = "0x1111111111111111111111111111111111111111";
const solana = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const both = { evmAccount: evm, solanaAccount: solana, solanaAvailable: true, followingEvm: false } as const;

describe("which scope a person gets", () => {
  test("with both accounts and no choice yet, the one reading is the default", () => {
    expect(resolveHoldingsScope(null, both)).toBe("tudo");
    // a followed (read-only) EVM address and a connected Solana account are two accounts too
    expect(resolveHoldingsScope(null, { ...both, followingEvm: true })).toBe("tudo");
  });

  test("with only one account there is nothing to join, and the default is what it always was", () => {
    expect(resolveHoldingsScope(null, { ...both, solanaAccount: null })).toBe("todas");
    expect(resolveHoldingsScope(null, { ...both, evmAccount: null })).toBe("solana");
    expect(resolveHoldingsScope(null, { ...both, solanaAccount: null, solanaAvailable: false })).toBe("todas");
  });

  test("a choice of the one reading holds while both accounts are there", () => {
    expect(resolveHoldingsScope("tudo", both)).toBe("tudo");
    expect(resolveHoldingsScope("tudo", { ...both, followingEvm: true })).toBe("tudo");
  });

  test("a choice of the one reading falls back when an account goes away: Solana alone has no EVM to join, and no Solana account leaves the EVM networks", () => {
    expect(resolveHoldingsScope("tudo", { ...both, solanaAccount: null })).toBe("todas");
    expect(resolveHoldingsScope("tudo", { ...both, solanaAccount: null, solanaAvailable: false })).toBe("todas");
    expect(resolveHoldingsScope("tudo", { ...both, evmAccount: null })).toBe("solana");
  });

  test("an explicit choice of any other scope still wins over the default", () => {
    expect(resolveHoldingsScope("atual", both)).toBe("atual");
    expect(resolveHoldingsScope("todas", both)).toBe("todas");
    expect(resolveHoldingsScope("solana", both)).toBe("solana");
  });
});

describe("what makes its read start over", () => {
  const key = (over: Partial<Parameters<typeof holdingsSessionKey>[0]> = {}) => holdingsSessionKey({ address: `${evm}+${solana}`, networks: ["1", "10", "501"], scope: "tudo", evmRevision: 0, ...over });

  test("the same inputs are the same read, even with new arrays", () => {
    expect(key()).toBe(key({ networks: ["1", "10", "501"] }));
  });

  test("another EVM address, another Solana account (case counts), another list of networks or another scope is another read", () => {
    expect(key()).not.toBe(key({ address: `${evm.replace("1111", "2222")}+${solana}` }));
    expect(key()).not.toBe(key({ address: `${evm}+${solana.toLowerCase()}` }));
    expect(key()).not.toBe(key({ networks: ["1", "501"] }));
    expect(key()).not.toBe(key({ scope: "todas" }));
  });

  test("an EVM revision starts it over, since the EVM account is half of it", () => {
    expect(key({ evmRevision: 0 })).not.toBe(key({ evmRevision: 1 }));
  });

  test("a revision of the EVM wallet invalidates the one reading, as it does the EVM scopes", () => {
    let revision = 0;
    const listeners = new Set<() => void>();
    const store = { getSnapshot: () => ({ revision }), subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)) };
    let invalidated = 0;
    const off = subscribeHoldingsRevision(store, "tudo", () => (invalidated += 1));
    for (const l of listeners) l();
    expect(invalidated).toBe(0);
    revision = 1;
    for (const l of listeners) l();
    expect(invalidated).toBe(1);
    off();
    expect(listeners.size).toBe(0);
  });
});
