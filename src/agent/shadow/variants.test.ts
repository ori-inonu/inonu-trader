import { describe, expect, test } from "bun:test";
import { A_ANCESTOR, entryCostOf, equalSlotEntries, H1_TRIGGER, H4_MARK, H6_CASH_REASONS, H6_FRAME, HYPOTHESES, holdUntilPlan, isCashReason, medianOf, portfolioView, preferenceOf, preferExistingAccounts, slotKeysOf, topNByPreference } from "./variants";
import type { Candidate, Position } from "../types";

const plan = { profile: "alvo_10", sinceEntryPct: 1, toTargetPct: 9, toStopPct: 7, hoursHeld: 0.1, hoursLeft: 35, targetHit: false, trimmed: false };
const holding = (over: Partial<Candidate> = {}): Candidate => ({
  id: "hold:token:501:EMBER@agente", kind: "holding", symbol: "EMBER", chainIndex: "501", address: "EMBER", heldUsd: 10, stances: ["hold", "trim_third", "trim_half", "exit_all"], usdByStance: { hold: 0, trim_third: 3, trim_half: 5, exit_all: 10 },
  facts: null, triggers: [], families: [], marks: [], wallet: "agente", profiles: [], plan, timing: null, ...over,
});
const buy = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id: `buy:token:501:${id}`, kind: "buy", symbol: id, chainIndex: "501", address: id, heldUsd: 0, stances: ["skip", "buy_tenth", "buy_third"], usdByStance: { skip: 0, buy_tenth: 10.85, buy_third: 36 },
  facts: null, triggers: [], families: [], marks: [], wallet: "agente", profiles: ["alvo_5"], plan: null, timing: null, ...over,
});
const verdict = (pSkip: number, pTenth: number): { choice: string; probabilities: Record<string, number>; confidence: number | null } => ({ choice: pSkip >= pTenth ? "skip" : "buy_tenth", probabilities: { skip: pSkip, buy_tenth: pTenth, buy_third: Math.round((1 - pSkip - pTenth) * 1e6) / 1e6 }, confidence: null });

describe("the six hypotheses are registered, each with one main change, against the exact bytes of the version in force", () => {
  test("there are six, with distinct ids", () => {
    expect(HYPOTHESES.map((h) => h.id)).toEqual(["H1", "H2", "H3", "H4", "H5", "H6"]);
  });

  test("the ancestor is the sha256 of the packaged release the live agent runs", () => {
    expect(A_ANCESTOR.sha256).toBe("6dce963a635865dfcfcb5c59348e1f1373c404da6cf07614ff04d30b9c04d60f");
  });
});

describe("H1, hold until the plan: a holding under a plan is only kept, unless the thesis breaks", () => {
  test("a holding with a plan and no break is offered only hold, and told why", () => {
    const c = holdUntilPlan(holding());
    expect([c.stances, c.triggers]).toEqual([["hold"], [H1_TRIGGER]]);
  });

  test("a risk mark from the provider keeps every stance: the thesis broke", () => {
    const c = holding({ triggers: ["sinal_de_risco"] });
    expect(holdUntilPlan(c)).toBe(c);
  });

  test("a holding with no plan is not touched: nothing was promised for it", () => {
    const c = holding({ plan: null });
    expect(holdUntilPlan(c)).toBe(c);
  });

  test("a purchase is not touched", () => {
    const c = buy("AAA");
    expect(holdUntilPlan(c)).toBe(c);
  });
});

describe("H2, enter the best: the Jev's preference ranks the purchases when most of the cash is idle", () => {
  const cands = [buy("AAA"), buy("BBB"), buy("CCC"), buy("DDD")];
  const skipAll = Object.fromEntries(cands.map((c) => [c.id, "skip"]));
  const verdicts = { [cands[0]!.id]: verdict(0.77, 0.2), [cands[1]!.id]: verdict(0.55, 0.4), [cands[2]!.id]: verdict(0.9, 0.05), [cands[3]!.id]: verdict(0.6, 0.3) };

  test("the preference is the highest probability the answer gives to an option that buys, the one the Placar and the screen read", () => {
    expect(preferenceOf(verdict(0.5, 0.3))).toBeCloseTo(0.3, 6);
  });

  test("an answer with no probabilities has no preference: unknown is never invented", () => {
    expect(preferenceOf({ choice: "skip", probabilities: null, confidence: null })).toBeNull();
  });

  test("the three highest above the floor are entered at the smallest size, and the one under the floor is not", () => {
    const r = topNByPreference({ stances: skipAll, verdicts, candidates: cands, idleShare: 0.91, profile: "alvo_5" });
    expect(r.entered).toEqual([cands[1]!.id, cands[3]!.id, cands[0]!.id]);
  });

  test("each entry is the smallest size on offer", () => {
    const r = topNByPreference({ stances: skipAll, verdicts, candidates: cands, idleShare: 0.91, profile: "alvo_5" });
    expect(r.stances[cands[1]!.id]).toBe("buy_tenth");
  });

  test("with most of the cash at work nothing is moved", () => {
    expect(topNByPreference({ stances: skipAll, verdicts, candidates: cands, idleShare: 0.3, profile: "alvo_5" }).entered).toEqual([]);
  });

  test("what the Jev already chose to buy counts toward N", () => {
    const stances = { ...skipAll, [cands[2]!.id]: "buy_tenth", [cands[0]!.id]: "buy_tenth" };
    expect(topNByPreference({ stances, verdicts, candidates: cands, idleShare: 0.91, profile: "alvo_5" }).entered).toEqual([cands[1]!.id]);
  });

  test("the answer the Jev gave is not changed", () => {
    const stances = { ...skipAll };
    topNByPreference({ stances, verdicts, candidates: cands, idleShare: 0.91, profile: "alvo_5" });
    expect(stances).toEqual(skipAll);
  });

  test("without the profile the owner registered for the round nothing is entered over a skip", () => {
    expect(topNByPreference({ stances: skipAll, verdicts, candidates: cands, idleShare: 0.91 }).entered).toEqual([]);
  });

  test("every entry over a skip is opened with that profile, and a candidate that does not offer it takes none", () => {
    const narrowed = cands.map((c, i) => (i === 1 ? { ...c, profiles: ["alvo_20"] } : c));
    const r = topNByPreference({ stances: skipAll, verdicts, candidates: narrowed, idleShare: 0.91, profile: "alvo_5" });
    expect([r.profile, r.entered.includes(cands[1]!.id)]).toEqual(["alvo_5", false]);
  });

  test("a purchase the code left closed (only skip) is never entered", () => {
    const closed = buy("ZZZ", { stances: ["skip"], usdByStance: { skip: 0 } });
    const r = topNByPreference({ stances: { [closed.id]: "skip" }, verdicts: { [closed.id]: verdict(0.1, 0.8) }, candidates: [closed], idleShare: 0.95, profile: "alvo_5" });
    expect(r.entered).toEqual([]);
  });
});

describe("H3, the total cost of entering: a first account is a cost, and an unknown part is never zero", () => {
  test("a token never held costs its account plus the fee, shown as a percent of each size", () => {
    const f = entryCostOf(buy("AAA"), { firstTime: true, accountUsd: 0.18, feeUsd: 0.0005 });
    expect(f.totalPctBySize.buy_tenth).toBe(1.66);
  });

  test("a token already held pays no account", () => {
    expect(entryCostOf(buy("AAA"), { firstTime: false, accountUsd: 0.18, feeUsd: 0.0005 }).totalUsd).toBe(0.0005);
  });

  test("a first account whose cost was not measured makes the total unknown, not smaller", () => {
    expect(entryCostOf(buy("AAA"), { firstTime: true, accountUsd: null, feeUsd: 0.0005 }).totalUsd).toBeNull();
  });

  test("a fee that was not read makes the total unknown", () => {
    expect(entryCostOf(buy("AAA"), { firstTime: false, accountUsd: null, feeUsd: null }).totalUsd).toBeNull();
  });

  test("the account cost is measured as the median of the wallet's own first buys", () => {
    expect(medianOf([0.157, 0.197, 0.187])).toBe(0.187);
  });
});

describe("H4, existing accounts first: reordered and marked, never hidden", () => {
  test("a token whose account exists comes first and carries the mark", () => {
    const out = preferExistingAccounts([buy("NEW"), buy("OLD")], (c) => c.symbol === "OLD");
    expect([out[0]!.symbol, out[0]!.marks.includes(H4_MARK)]).toEqual(["OLD", true]);
  });

  test("every purchase is still there", () => {
    expect(preferExistingAccounts([buy("NEW"), buy("OLD"), buy("OTHER")], (c) => c.symbol === "OLD")).toHaveLength(3);
  });

  test("with no account known the order is exactly the one given", () => {
    const list = [buy("A1"), buy("B1")];
    expect(preferExistingAccounts(list, () => false).map((c) => c.symbol)).toEqual(["A1", "B1"]);
  });
});

describe("H5, N equal positions: N is the owner's, the Jev ranks which tokens, and nothing here recommends a value", () => {
  const key = (c: Candidate): string => `${c.chainIndex}:${c.address}`;
  const six = ["A1", "B1", "C1", "D1", "E1", "F1"].map((id) => buy(id));
  const prefs = (values: number[]): Record<string, { choice: string; probabilities: Record<string, number>; confidence: number | null }> =>
    Object.fromEntries(six.map((c, i) => [c.id, { choice: "skip", probabilities: { skip: 1 - values[i]!, buy_tenth: values[i]! }, confidence: null }]));
  const input = (over: Partial<Parameters<typeof equalSlotEntries>[0]> = {}) => ({ totalUsd: 118.39, reserveUsd: 5, cashUsd: 118.39, n: 5, heldKeys: new Set<string>(), candidates: six, verdicts: prefs([0.05, 0.4, 0.2, 0.3, 0.02, 0.1]), profile: "alvo_5", ...over });

  test("each slot is an equal share of what is managed less the reserve, cut down to the cent", () => {
    expect(equalSlotEntries(input({ n: 10 })).targetUsd).toBe(11.33);
  });

  test("the slots are filled with the tokens the Jev prefers the most, in that order", () => {
    expect(equalSlotEntries(input({ n: 3 })).entries).toEqual([six[1]!.id, six[3]!.id, six[2]!.id]);
  });

  test("only the open slots are filled: a held token occupies one", () => {
    expect(equalSlotEntries(input({ n: 3, heldKeys: new Set([`501:HELD1`, `501:HELD2`]) })).entries).toHaveLength(1);
  });

  test("a token already held is not bought again", () => {
    expect(equalSlotEntries(input({ n: 5, heldKeys: new Set([key(six[1]!)]) })).entries).not.toContain(six[1]!.id);
  });

  test("a purchase the code left closed takes no slot", () => {
    const closed = buy("ZZ", { stances: ["skip"], usdByStance: { skip: 0 } });
    const v = { ...prefs([0.05, 0.4, 0.2, 0.3, 0.02, 0.1]), [closed.id]: { choice: "skip", probabilities: { skip: 0.1, buy_tenth: 0.9 }, confidence: null } };
    expect(equalSlotEntries(input({ n: 6, candidates: [...six, closed], verdicts: v })).entries).not.toContain(closed.id);
  });

  test("a purchase whose preference is unknown takes no slot: unknown is never invented", () => {
    expect(equalSlotEntries(input({ n: 6, verdicts: {} })).entries).toEqual([]);
  });

  test("with no floor registered even a low preference takes a slot, which is what the owner asked to test", () => {
    expect(equalSlotEntries(input({ n: 6 })).entries).toHaveLength(6);
  });

  test("a registered floor keeps the lower preferences out", () => {
    expect(equalSlotEntries(input({ n: 6, floor: 0.1 })).entries).toEqual([six[1]!.id, six[3]!.id, six[2]!.id, six[5]!.id]);
  });

  test("N that is not a positive whole number gives no slot and no size", () => {
    const r = [equalSlotEntries(input({ n: 0 })), equalSlotEntries(input({ n: 2.5 }))].map((x) => [x.targetUsd, x.entries.length]);
    expect(r).toEqual([[null, 0], [null, 0]]);
  });

  test("a reserve as large as the portfolio leaves nothing to allocate", () => {
    expect(equalSlotEntries(input({ totalUsd: 5 })).entries).toEqual([]);
  });

  test("without the profile the owner registered for the round nothing is entered", () => {
    expect(equalSlotEntries(input({ profile: null })).entries).toEqual([]);
  });

  test("a candidate that does not offer the registered profile takes no slot", () => {
    const narrowed = six.map((c, i) => (i === 1 ? { ...c, profiles: ["alvo_20"] } : c));
    expect(equalSlotEntries(input({ n: 6, candidates: narrowed })).entries).not.toContain(six[1]!.id);
  });

  test("when cash runs out the remaining slots stay cash: the slots are filled in the order of preference", () => {
    const r = equalSlotEntries(input({ n: 5, cashUsd: 50 }));
    expect([r.affordable, r.entries]).toEqual([2, [six[1]!.id, six[3]!.id]]);
  });

  test("when the portfolio starts at or above N positions nothing is entered and nothing is sold to get down to N", () => {
    expect(equalSlotEntries(input({ n: 2, heldKeys: new Set(["501:H1", "501:H2", "501:H3"]) })).entries).toEqual([]);
  });

  test("the cash, the native coin, an unpriced token and the other wallet occupy no slot; a priced token of the agent does", () => {
    const p = (over: Partial<Position>): Position => ({ id: "x", chainIndex: "501", address: "TOK", symbol: "T", wallet: "agente", usd: 12, balanceMinor: "1", decimals: 6, isCash: false, ...over }) as Position;
    const keys = slotKeysOf([p({}), p({ isCash: true, address: "USDC" }), p({ address: "native" }), p({ address: "NOVALUE", usd: null }), p({ address: "OTHER", wallet: "principal" })]);
    expect([...keys]).toEqual(["501:TOK"]);
  });

  test("ties break by id, so the same answer always gives the same entries", () => {
    const v = Object.fromEntries(six.map((c) => [c.id, { choice: "skip", probabilities: { skip: 0.8, buy_tenth: 0.2 }, confidence: null }]));
    expect(equalSlotEntries(input({ n: 2, verdicts: v })).entries).toEqual([six[0]!.id, six[1]!.id]);
  });
});

describe("H6, joint allocation chosen by the Jev: the Jev sees the whole portfolio and says why cash stays unallocated, and the code never turns a skip into a purchase", () => {
  const p = (over: Partial<Position>): Position => ({ id: "x", chainIndex: "501", address: "TOK", symbol: "T", wallet: "agente", usd: 10, balanceMinor: "1", decimals: 6, isCash: false, ...over }) as Position;
  const usdc = (usd: number): Position => p({ isCash: true, address: "USDC", usd });

  test("the share of cash and of each position is of the whole portfolio of the agent wallet", () => {
    const v = portfolioView({ positions: [usdc(90), p({ address: "A1", usd: 10 })] });
    expect([v.cashSharePct, v.positions[0]!.sharePct]).toEqual([90, 10]);
  });

  test("concentration counts the cash as one component, as the measurement of the 24 hours does", () => {
    expect(portfolioView({ positions: [usdc(90), p({ address: "A1", usd: 10 })] }).hhi).toBe(0.82);
  });

  test("the native coin is the fee reserve, not a position, and the other wallet is not tradable here", () => {
    const v = portfolioView({ positions: [usdc(90), p({ address: "native", usd: 5 }), p({ address: "A1", usd: 10, wallet: "principal" })] });
    expect([v.positions.length, v.nativeUsd]).toEqual([0, 5]);
  });

  test("cash on a network is split into what is already committed to pending orders and what is available", () => {
    const v = portfolioView({ positions: [usdc(100)], pendingUsd: { "501": 25 } });
    expect(v.byChain["501"]).toEqual({ cashUsd: 100, committedUsd: 25, availableUsd: 75 });
  });

  test("a pending amount larger than the cash leaves nothing available, never a negative", () => {
    expect(portfolioView({ positions: [usdc(10)], pendingUsd: { "501": 25 } }).byChain["501"]!.availableUsd).toBe(0);
  });

  test("what is not known stays unknown: the correlation of the positions is null, never a made-up diversification", () => {
    expect(portfolioView({ positions: [usdc(50), p({ address: "A1" }), p({ address: "B1" })] }).correlation).toBeNull();
  });

  test("an empty portfolio has no shares, not a division by zero", () => {
    expect(portfolioView({ positions: [] })).toMatchObject({ totalUsd: 0, cashSharePct: null, hhi: null });
  });

  test("the reason the Jev gives for cash left unallocated is one of the fixed codes", () => {
    expect(H6_CASH_REASONS.every((r) => isCashReason(r))).toBe(true);
  });

  test("a reason that is not on the list is refused, so a free text never enters as a code", () => {
    expect([isCashReason("porque sim"), isCashReason(null), isCashReason(3)]).toEqual([false, false, false]);
  });

  test("the question is framed on the whole portfolio and on the cost of idle cash, and it never says to buy", () => {
    expect([/whole portfolio/i.test(H6_FRAME.goal), /idle cash/i.test(H6_FRAME.goal), /\bmust buy\b|\bbuy at least\b/i.test(H6_FRAME.goal)]).toEqual([true, true, false]);
  });
});
