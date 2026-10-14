// T9.6, T9.7, WAL-6, WAL-7, AC-WAL-4: the draft of the order ticket. "Aceitar" on an answer of Inonu about a token only FILLS this draft (the network, the
// token, the side the model chose); nothing here sends, signs or prepares a transaction. The draft holds no secret, no amount the person did not type and no
// address that is not the exact address of a token. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { EVM_CHAINS } from "../evm-multichain";
import { TICKET_KEY, createTicketStore, draftAgeText, draftFromDecision, isTicketCandidate, ticketPlan } from "./ticket";

const BASE_TOKEN = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
const decision = (over: Partial<Parameters<typeof draftFromDecision>[0]> = {}) => ({
  candidateId: `token:8453:${BASE_TOKEN}`, action: "buy" as const, briefHash: "h".repeat(64), symbol: "DEGEN", atMs: 1_800_000_000_000, ...over,
});

describe("the draft that an accepted answer leaves", () => {
  test("a token the model chose becomes a draft with the network, the token, the side it chose and where it came from", () => {
    expect(draftFromDecision(decision())).toEqual({
      chainIndex: "8453", tokenAddress: BASE_TOKEN, tokenSymbol: "DEGEN", acao: "buy", origem: "inonu", briefHash: "h".repeat(64), atMs: 1_800_000_000_000,
    });
    expect(draftFromDecision(decision({ action: "sell" }))?.acao).toBe("sell");
  });

  test("an EVM address is kept in lower case, and a candidate that is not a token of a network with a plain address is refused", () => {
    expect(draftFromDecision(decision({ candidateId: `token:8453:${BASE_TOKEN.toUpperCase().replace("0X", "0x")}` }))?.tokenAddress).toBe(BASE_TOKEN);
    for (const bad of ["token:8453:", "token:8453", "token:abc:" + BASE_TOKEN, "token::" + BASE_TOKEN, `token:8453:${BASE_TOKEN} x`, "token:8453:" + "a".repeat(129), "token:8453:0x\u0000ab", "token:8453:ab\ncd", "token:8453:caf\u00e9"]) {
      expect(draftFromDecision(decision({ candidateId: bad }))).toBeNull();
    }
    // a Solana mint is case sensitive and kept as it is
    const mint = "So11111111111111111111111111111111111111112";
    expect(draftFromDecision(decision({ candidateId: `token:501:${mint}` }))?.tokenAddress).toBe(mint);
  });

  test("an address of another kind (a Sui type, a TON address, a short EVM one) still fills the ticket, which then says it cannot be quoted: the answer and the note agree", () => {
    expect(draftFromDecision(decision({ candidateId: "token:784:0x2::sui::SUI" }))).toMatchObject({ chainIndex: "784", tokenAddress: "0x2::sui::SUI" });
    expect(draftFromDecision(decision({ candidateId: "token:607:EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs" }))?.chainIndex).toBe("607");
    const short = draftFromDecision(decision({ candidateId: "token:8453:0x123" }))!;
    expect(short.tokenAddress).toBe("0x123");
    const plan = ticketPlan(short);
    expect(plan.quotable).toBe(false);
    expect(plan.chain?.name).toBe("Base");
    expect(plan.reason).toBe("O endereco deste token nao tem o formato de um token EVM");
    expect(isTicketCandidate("token:784:0x2::sui::SUI")).toBe(true);
    for (const id of [null, "manter", "token:8453:", "zona:a1b2c3d4e5f6", "spot:BTC-USDT"]) expect(isTicketCandidate(id)).toBe(false);
  });

  test("only a token with a side fills it: holding, a zone, a spot pair, a perpetual and nothing do not", () => {
    expect(draftFromDecision(decision({ action: "hold" }))).toBeNull();
    for (const id of [null, "manter", "zona:a1b2c3d4e5f6", "spot:BTC-USDT", "perp:BTC-USDT-SWAP"]) expect(draftFromDecision(decision({ candidateId: id }))).toBeNull();
  });

  test("the symbol is only for the person: cut, without control characters, and null when there is none", () => {
    expect(draftFromDecision(decision({ symbol: "S".repeat(100) }))?.tokenSymbol?.length).toBeLessThanOrEqual(20);
    expect(draftFromDecision(decision({ symbol: "A\u0000B" }))?.tokenSymbol).toBeNull();
    expect(draftFromDecision(decision({ symbol: null }))?.tokenSymbol).toBeNull();
  });

  test("what the producer makes is what the reader accepts: a hash that is not a plain hash is dropped (the draft is still made), and a moment that is not a number makes no draft", () => {
    for (const hash of ["", "sha256:abc", "x".repeat(200), "has space"]) {
      const draft = draftFromDecision(decision({ briefHash: hash }))!;
      expect(draft.briefHash).toBeNull();
      // and it survives the page: the reader takes it back
      const kept = new Map<string, string>();
      const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
      createTicketStore({ storage }).fill(draft);
      expect(createTicketStore({ storage }).get()).toEqual(draft);
    }
    expect(draftFromDecision(decision({ briefHash: "a".repeat(64) }))?.briefHash).toBe("a".repeat(64));
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY]) expect(draftFromDecision(decision({ atMs: at }))).toBeNull();
  });

  test("the draft says how old it is: it lives for the tab, and an hour later it must not read as new", () => {
    const at = 1_800_000_000_000;
    expect(draftAgeText(at, at + 4_000)).toBe("ha 4 s");
    expect(draftAgeText(at, at + 5 * 60_000)).toBe("ha 5 min");
    expect(draftAgeText(at, at + 3 * 3_600_000)).toBe("ha 3 h");
    expect(draftAgeText(at, at + 2 * 86_400_000)).toBe("ha 2 d");
    expect(draftAgeText(at, at - 10_000)).toBe("ha 0 s");
    expect(draftAgeText(at, Number.NaN)).toBe("-");
  });

  test("the draft carries no amount: the size is typed by the person", () => {
    expect(Object.keys(draftFromDecision(decision())!).sort()).toEqual(["acao", "atMs", "briefHash", "chainIndex", "origem", "tokenAddress", "tokenSymbol"]);
  });
});

describe("the store", () => {
  test("it holds one draft: a new one replaces the old, clearing empties it, and every listener hears each change once", () => {
    const store = createTicketStore();
    let heard = 0;
    const off = store.subscribe(() => (heard += 1));
    expect(store.get()).toBeNull();
    const first = draftFromDecision(decision())!;
    const second = draftFromDecision(decision({ candidateId: "token:8453:0x" + "2".repeat(40) }))!;
    store.fill(first);
    store.fill(second);
    expect(store.get()).toEqual(second);
    store.clear();
    expect(store.get()).toBeNull();
    expect(heard).toBe(3);
    off();
    store.fill(first);
    expect(heard).toBe(3);
  });

  test("clearing an empty store says nothing, and a listener that throws does not stop the others", () => {
    const store = createTicketStore();
    let heard = 0;
    store.subscribe(() => {
      throw new Error("x");
    });
    store.subscribe(() => (heard += 1));
    store.clear();
    expect(heard).toBe(0);
    store.fill(draftFromDecision(decision())!);
    expect(heard).toBe(1);
  });

  test("a draft is copied in and out: changing what was given or got never changes the store", () => {
    const store = createTicketStore();
    const given = { ...draftFromDecision(decision())! };
    store.fill(given);
    (given as { tokenAddress: string }).tokenAddress = "0xchanged";
    expect(store.get()!.tokenAddress).toBe(BASE_TOKEN);
    (store.get() as { tokenAddress: string }).tokenAddress = "0xchanged";
    expect(store.get()!.tokenAddress).toBe(BASE_TOKEN);
  });
});

describe("the draft survives the page (the Rastreador and the Mesa are two pages)", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
  };

  test("a draft filled on one page is there when the next page opens its own store on the same storage; clearing it clears it for the next page too", () => {
    const storage = memory();
    const one = createTicketStore({ storage });
    const draft = draftFromDecision(decision())!;
    one.fill(draft);
    expect(storage.data.has(TICKET_KEY)).toBe(true);
    const next = createTicketStore({ storage });
    expect(next.get()).toEqual(draft);
    next.clear();
    expect(storage.data.has(TICKET_KEY)).toBe(false);
    expect(createTicketStore({ storage }).get()).toBeNull();
  });

  test("what is kept is the draft and nothing else: no amount, no account, no key", () => {
    const storage = memory();
    createTicketStore({ storage }).fill(draftFromDecision(decision())!);
    expect(Object.keys(JSON.parse(storage.data.get(TICKET_KEY)!)).sort()).toEqual(["acao", "atMs", "briefHash", "chainIndex", "origem", "tokenAddress", "tokenSymbol"]);
  });

  test("a payload that is not exactly a draft is dropped when it is read: extra keys, wrong types, an address with markup, a text that is too long, broken json", () => {
    const good = draftFromDecision(decision())!;
    for (const bad of [
      "{not json",
      "null",
      "[]",
      JSON.stringify({ ...good, extra: 1 }),
      JSON.stringify({ ...good, chainIndex: "x1" }),
      JSON.stringify({ ...good, tokenAddress: "<script>alert(1)</script>" }),
      JSON.stringify({ ...good, tokenAddress: "0x" + "a".repeat(300) }),
      JSON.stringify({ ...good, acao: "hold" }),
      JSON.stringify({ ...good, origem: "alguem" }),
      JSON.stringify({ ...good, atMs: "now" }),
      JSON.stringify({ ...good, tokenSymbol: "S".repeat(300) }),
      JSON.stringify({ ...good, briefHash: 5 }),
    ]) {
      const storage = memory();
      storage.data.set(TICKET_KEY, bad);
      expect(createTicketStore({ storage }).get()).toBeNull();
    }
  });

  test("a storage that is blocked or full changes nothing: the draft lives in memory for the page", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    const store = createTicketStore({ storage: blocked });
    expect(store.get()).toBeNull();
    store.fill(draftFromDecision(decision())!);
    expect(store.get()?.chainIndex).toBe("8453");
    expect(() => store.clear()).not.toThrow();
    expect(createTicketStore({ storage: null }).get()).toBeNull();
  });
});

describe("what can be quoted", () => {
  test("on a network the app knows, a token received with a stable coin of that network: the coins to pay with come from the registry, with their decimals", () => {
    const plan = ticketPlan(draftFromDecision(decision())!);
    expect(plan.chain?.name).toBe("Base");
    expect(plan.pay.map((p) => p.symbol)).toEqual(["USDC"]);
    expect(plan.pay[0]).toMatchObject({ contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 });
    expect(plan.quotable).toBe(true);
    expect(plan.reason).toBeNull();
  });

  test("a network the app has no coin for, or an address of another kind, cannot be quoted, and says why", () => {
    const solana = ticketPlan(draftFromDecision(decision({ candidateId: "token:501:So11111111111111111111111111111111111111112" }))!);
    expect(solana.quotable).toBe(false);
    expect(solana.chain).toBeNull();
    expect(solana.reason).toBe("O app ainda nao tem uma moeda de pagamento conhecida para esta rede");
    expect(solana.pay).toEqual([]);
  });

  test("the ladder of quotes does not quote the side that gives the token away: the order panel does that one, reading the balance of the token", () => {
    const sell = ticketPlan(draftFromDecision(decision({ action: "sell" }))!);
    expect(sell.quotable).toBe(false);
    expect(sell.reason).toContain("painel Ordem pela minha carteira");
    expect(sell.chain?.name).toBe("Base");
  });

  test("a token that is the coin to pay with is not quoted against itself", () => {
    const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
    const plan = ticketPlan(draftFromDecision(decision({ candidateId: `token:8453:${usdc}` }))!);
    expect(plan.quotable).toBe(false);
    expect(plan.reason).toBe("O token e a propria moeda de pagamento");
  });

  test("every network of the registry that has a stable coin can quote; the others say so", () => {
    for (const chain of EVM_CHAINS) {
      const plan = ticketPlan({ chainIndex: chain.chainIndex, tokenAddress: "0x" + "9".repeat(40), tokenSymbol: null, acao: "buy", origem: "inonu", briefHash: null, atMs: 1 });
      expect(plan.quotable).toBe(chain.tokens.length > 0);
      if (chain.tokens.length === 0) expect(plan.reason).not.toBeNull();
    }
  });

  test("plain ASCII in every reason", () => {
    const reasons = [
      ticketPlan(draftFromDecision(decision({ candidateId: "token:501:So11111111111111111111111111111111111111112" }))!).reason,
      ticketPlan(draftFromDecision(decision({ action: "sell" }))!).reason,
      ticketPlan(draftFromDecision(decision({ candidateId: "token:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" }))!).reason,
    ];
    for (const r of reasons) expect(/^[\x20-\x7e]+$/.test(r!)).toBe(true);
  });
});
