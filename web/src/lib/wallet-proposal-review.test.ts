import { expect, it } from "bun:test";
import { createWalletProposalReview, walletProposalReviewMessage } from "./wallet-proposal-review";
import type { WalletTransactionPreflightResult } from "./wallet-transaction-preflight";

const NOW = 1_800_000_000_000;
const PROPOSAL = {
  version: 1 as const, planId: "manual-plan", quoteHash: "unverified-quote", chainId: "0xc4" as const,
  from: "0x2222222222222222222222222222222222222222",
  to: "0x3333333333333333333333333333333333333333", data: "0xabcd",
  valueAtomic: "7", gasLimitAtomic: "21000", maxFeePerGasAtomic: "3", maxPriorityFeePerGasAtomic: "1",
  createdAtMs: NOW - 100, expiresAtMs: NOW + 5000,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

it("coalesces duplicate checks of the same pending content", async () => {
  let calls = 0;
  const pending = deferred<{ status: "ready_for_review"; executionQualified: false; proposal: typeof PROPOSAL; observedAtMs: number }>();
  const review = createWalletProposalReview({ preflightTransaction: () => { calls++; return pending.promise; }, getSessionToken: () => 1, now: () => NOW });
  review.edit(JSON.stringify(PROPOSAL));
  const first = review.check(); const second = review.check();
  expect(calls).toBe(1);
  pending.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });
  await Promise.all([first, second]);
  expect(review.getSnapshot().status).toBe("ready_for_review");
});

it("blocks a result that expires while the provider is pending", async () => {
  let clock = NOW;
  const pending = deferred<{ status: "ready_for_review"; executionQualified: false; proposal: typeof PROPOSAL; observedAtMs: number }>();
  const review = createWalletProposalReview({ preflightTransaction: () => pending.promise, getSessionToken: () => 1, now: () => clock });
  review.edit(JSON.stringify(PROPOSAL)); const check = review.check();
  clock = NOW + 5000;
  pending.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });
  await check;
  expect(review.getSnapshot()).toMatchObject({ status: "blocked", reason: "expired", proposal: null, executionQualified: false });
});

it("blocks a clock regression before asynchronous publication", async () => {
  let clock = NOW;
  const pending = deferred<{ status: "ready_for_review"; executionQualified: false; proposal: typeof PROPOSAL; observedAtMs: number }>();
  const review = createWalletProposalReview({ preflightTransaction: () => pending.promise, getSessionToken: () => 1, now: () => clock });
  review.edit(JSON.stringify(PROPOSAL)); const check = review.check();
  clock = NOW - 1;
  pending.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });
  await check;
  expect(review.getSnapshot()).toMatchObject({ status: "blocked", reason: "clock_regressed", proposal: null });
});

it("revalidates a retained ready result synchronously without a provider call", async () => {
  let clock = NOW; let calls = 0;
  const review = createWalletProposalReview({ preflightTransaction: async () => { calls++; return { status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW }; }, getSessionToken: () => 1, now: () => clock });
  review.edit(JSON.stringify(PROPOSAL)); await review.check();
  clock = NOW + 5000;
  const current = review.validateCurrent();
  expect(current).toMatchObject({ status: "blocked", reason: "expired", proposal: null });
  expect(calls).toBe(1);
});

it("notifies subscribers on edits and clearing then stops after disposal", () => {
  const review = createWalletProposalReview({ preflightTransaction: async () => ({ status: "blocked", executionQualified: false, reason: "provider_error" }), getSessionToken: () => 1, now: () => NOW });
  const statuses: string[] = [];
  review.subscribe(() => statuses.push(review.getSnapshot().status));
  review.edit("{}"); review.clear();
  expect(statuses).toEqual(["edited", "empty"]);
  review.dispose(); review.edit("ignored");
  expect(statuses).toEqual(["edited", "empty"]);
  expect(review.getSnapshot().proposal).toBeNull();
});

it("blocks programmatic oversized UTF-16 input before parsing or provider calls", async () => {
  let calls = 0;
  const review = createWalletProposalReview({
    preflightTransaction: async () => { calls++; return { status: "blocked", executionQualified: false, reason: "provider_error" }; },
    getSessionToken: () => 1,
    now: () => 1_800_000_000_000,
  });
  review.edit(" ".repeat(262145));
  await review.check();
  expect(review.getSnapshot().status).toBe("blocked");
  expect(review.getSnapshot().reason).toBe("input_too_large");
  expect(calls).toBe(0);
  expect(review.getSnapshot().executionQualified).toBe(false);
});

it("blocks a result from an invalidated session generation", async () => {
  let token = 4;
  const pending = deferred<{ status: "ready_for_review"; executionQualified: false; proposal: typeof PROPOSAL; observedAtMs: number }>();
  const review = createWalletProposalReview({ preflightTransaction: () => pending.promise, getSessionToken: () => token, now: () => NOW });
  review.edit(JSON.stringify(PROPOSAL));
  const check = review.check();
  token = 6;
  pending.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });
  await check;
  expect(review.getSnapshot()).toMatchObject({ status: "blocked", reason: "session_changed", proposal: null, executionQualified: false });
});

it("editing invalidates a pending result even when the same text returns (ABA)", async () => {
  const pending = deferred<{ status: "ready_for_review"; executionQualified: false; proposal: typeof PROPOSAL; observedAtMs: number }>();
  const review = createWalletProposalReview({ preflightTransaction: () => pending.promise, getSessionToken: () => 1, now: () => NOW });
  const text = JSON.stringify(PROPOSAL);
  review.edit(text);
  const check = review.check();
  expect(review.getSnapshot().status).toBe("checking");
  review.edit("{}");
  review.edit(text);
  pending.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });
  await check;
  expect(review.getSnapshot()).toMatchObject({ status: "edited", proposal: null, observedAtMs: null, executionQualified: false });
});

it("checks explicit valid JSON and publishes the normalized captured proposal", async () => {
  const inputs: unknown[] = [];
  const review = createWalletProposalReview({
    preflightTransaction: async (input) => {
      inputs.push(input);
      return { status: "ready_for_review", executionQualified: false, proposal: { ...PROPOSAL, data: "0xabcd" }, observedAtMs: NOW };
    }, getSessionToken: () => 1, now: () => NOW,
  });
  review.edit(JSON.stringify({ ...PROPOSAL, data: "0xABCD" }));
  expect(inputs).toEqual([]);
  await review.check();
  expect(inputs).toEqual([{ ...PROPOSAL, data: "0xABCD" }]);
  expect(review.getSnapshot()).toMatchObject({ status: "ready_for_review", executionQualified: false, proposal: { ...PROPOSAL, data: "0xabcd" }, observedAtMs: NOW });
});

for (const [label, text, reason] of [
  ["empty", "", "input_empty"], ["whitespace", " \n\t", "input_empty"], ["invalid JSON", "{", "invalid_json"],
  ["null", "null", "invalid_proposal"], ["array", "[]", "invalid_proposal"],
  ["extra key", JSON.stringify({ ...PROPOSAL, unexpected: true }), "invalid_proposal"],
  ["atomic number", JSON.stringify({ ...PROPOSAL, valueAtomic: 7 }), "invalid_proposal"],
  ["atomic leading zero", JSON.stringify({ ...PROPOSAL, valueAtomic: "07" }), "invalid_proposal"],
  ["invalid network", JSON.stringify({ ...PROPOSAL, chainId: "0x1" }), "invalid_proposal"],
  ["future", JSON.stringify({ ...PROPOSAL, createdAtMs: NOW + 1 }), "not_yet_valid"],
  ["expired inclusive", JSON.stringify({ ...PROPOSAL, expiresAtMs: NOW }), "expired"],
  ["calldata too long", JSON.stringify({ ...PROPOSAL, data: "0x" + "ab".repeat(65537) }), "invalid_proposal"],
] as const) {
  it(`blocks ${label} without provider calls or a previous result`, async () => {
    let calls = 0;
    const review = createWalletProposalReview({ preflightTransaction: async () => { calls++; return { status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW }; }, getSessionToken: () => 1, now: () => NOW });
    review.edit(JSON.stringify(PROPOSAL)); await review.check(); expect(review.getSnapshot().status).toBe("ready_for_review");
    review.edit(text); await review.check();
    expect(review.getSnapshot()).toMatchObject({ status: "blocked", reason, proposal: null, observedAtMs: null, executionQualified: false });
    expect(calls).toBe(1);
  });
}

for (const length of [262144, 262145]) {
  it(`applies literal UTF-16 boundary ${length} with a surrogate pair`, async () => {
    let calls = 0;
    const text = JSON.stringify({ ...PROPOSAL, planId: "emoji-💠" });
    const padded = text + " ".repeat(length - text.length);
    expect(padded.length).toBe(length);
    const review = createWalletProposalReview({ preflightTransaction: async (input) => { calls++; return { status: "ready_for_review", executionQualified: false, proposal: input as typeof PROPOSAL, observedAtMs: NOW }; }, getSessionToken: () => 1, now: () => NOW });
    review.edit(padded); await review.check();
    expect(review.getSnapshot()).toMatchObject(length === 262144 ? { status: "ready_for_review", proposal: { ...PROPOSAL, planId: "emoji-💠" }, executionQualified: false } : { status: "blocked", reason: "input_too_large", proposal: null, executionQualified: false });
    expect(calls).toBe(length === 262144 ? 1 : 0);
  });
}

it("accepts the literal maximum calldata without truncation", async () => {
  const data = "0x" + "AB".repeat(65536);
  const normalized = "0x" + "ab".repeat(65536);
  const review = createWalletProposalReview({ preflightTransaction: async () => ({ status: "ready_for_review", executionQualified: false, proposal: { ...PROPOSAL, data: normalized }, observedAtMs: NOW }), getSessionToken: () => 1, now: () => NOW });
  expect(data.length).toBe(131074); review.edit(JSON.stringify({ ...PROPOSAL, data })); await review.check();
  expect(review.getSnapshot().status).toBe("ready_for_review");
  expect(review.getSnapshot().proposal?.data).toBe(normalized);
});

for (const action of ["clear", "dispose"] as const) {
  it(`${action} invalidates pending publication`, async () => {
    const pending = deferred<WalletTransactionPreflightResult>();
    const review = createWalletProposalReview({ preflightTransaction: () => pending.promise, getSessionToken: () => 1, now: () => NOW });
    const statuses: string[] = [];review.subscribe(() => statuses.push(review.getSnapshot().status));
    review.edit(JSON.stringify(PROPOSAL));const check = review.check();review[action]();
    const before = [...statuses];pending.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });await check;
    expect(statuses).toEqual(before);expect(review.getSnapshot()).toMatchObject({ status: action === "clear" ? "empty" : "blocked", proposal: null, observedAtMs: null, executionQualified: false });
  });
}

it("keeps the latest request when old results arrive out of order", async () => {
  const first = deferred<WalletTransactionPreflightResult>(), second = deferred<WalletTransactionPreflightResult>();let calls = 0;
  const review = createWalletProposalReview({ preflightTransaction: () => ++calls === 1 ? first.promise : second.promise, getSessionToken: () => 1, now: () => NOW });
  review.edit(JSON.stringify(PROPOSAL));const oldCheck = review.check();
  const next = { ...PROPOSAL, planId: "new-request" };review.edit(JSON.stringify(next));const newCheck = review.check();
  second.resolve({ status: "ready_for_review", executionQualified: false, proposal: next, observedAtMs: NOW });await newCheck;
  first.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });await oldCheck;
  expect(review.getSnapshot()).toMatchObject({ status: "ready_for_review", proposal: next, executionQualified: false });expect(calls).toBe(2);
});

for (const mode of ["sync", "reject"] as const) {
  it(`sanitizes unexpected ${mode} errors without leaking private text`, async () => {
    const review = createWalletProposalReview({ preflightTransaction: () => { if(mode === "sync")throw new Error("PRIVATE ERROR <script>");return Promise.reject(new Error("PRIVATE ERROR <script>")); }, getSessionToken: () => 1, now: () => NOW });
    review.edit(JSON.stringify(PROPOSAL));await review.check();
    expect(review.getSnapshot()).toMatchObject({ status: "blocked", reason: "provider_error", proposal: null, executionQualified: false });
    expect(walletProposalReviewMessage(review.getSnapshot().reason)).toBe("Não foi possível conferir a resposta da carteira.");
    expect(JSON.stringify(review.getSnapshot())).not.toContain("PRIVATE ERROR");
  });
}

for (const value of [NaN, Infinity, -1, NOW + .5, Number.MAX_SAFE_INTEGER + 1]) {
  for (const phase of ["before", "pending", "ready"] as const) {
    it(`blocks invalid clock ${String(value)} at ${phase}`, async () => {
      let clock = phase === "before" ? value : NOW;let calls = 0;
      const pending = deferred<WalletTransactionPreflightResult>();
      const review = createWalletProposalReview({ preflightTransaction: () => { calls++;return pending.promise; }, getSessionToken: () => 1, now: () => clock });
      review.edit(JSON.stringify(PROPOSAL));const check = review.check();
      if (phase === "pending")clock=value;
      pending.resolve({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW });await check;
      if (phase === "ready") {clock=value;review.validateCurrent();}
      expect(review.getSnapshot()).toMatchObject({ status: "blocked", reason: "invalid_clock", proposal: null, executionQualified: false });
      expect(calls).toBe(phase === "before" ? 0 : 1);
    });
  }
}

it("blocks throwing clocks and rejects future provider observation", async () => {
  const throwing = createWalletProposalReview({ preflightTransaction: async () => { throw new Error("should not call"); }, getSessionToken: () => 1, now: () => {throw new Error("PRIVATE CLOCK");} });
  throwing.edit(JSON.stringify(PROPOSAL));await throwing.check();expect(throwing.getSnapshot().reason).toBe("invalid_clock");
  const future = createWalletProposalReview({ preflightTransaction: async () => ({ status: "ready_for_review", executionQualified: false, proposal: PROPOSAL, observedAtMs: NOW+1 }), getSessionToken: () => 1, now: () => NOW });
  future.edit(JSON.stringify(PROPOSAL));await future.check();expect(future.getSnapshot()).toMatchObject({ status: "blocked", reason: "clock_regressed", proposal: null });
});

for (const reason of ["session_unavailable","identity_mismatch","expired","not_yet_valid","provider_timeout","invalid_provider_response"] as const) {
  it(`preserves session block ${reason} with execution disabled`, async () => {
    const review = createWalletProposalReview({ preflightTransaction: async () => ({status: "blocked", reason, executionQualified:false}), getSessionToken:()=>1, now:()=>NOW });
    review.edit(JSON.stringify(PROPOSAL));await review.check();expect(review.getSnapshot()).toMatchObject({status:"blocked",reason,proposal:null,executionQualified:false});
  });
}

it("removes a ready result for token ABA and rejects later restoration", async () => {
  let token = 1;
  const review = createWalletProposalReview({preflightTransaction:async()=>({status:"ready_for_review",executionQualified:false,proposal:PROPOSAL,observedAtMs:NOW}),getSessionToken:()=>token,now:()=>NOW});
  review.edit(JSON.stringify(PROPOSAL));await review.check();token=3;
  expect(review.validateCurrent()).toMatchObject({status:"blocked",reason:"session_changed",proposal:null});
  token=1;expect(review.validateCurrent().status).toBe("blocked");
});

it("sanitizes unknown reason with a literal generic message", () => {
  expect(walletProposalReviewMessage("<script>PRIVATE RESPONSE</script>")).toBe("A proposta não pôde ser conferida. Revise os dados e a conexão.");
});
