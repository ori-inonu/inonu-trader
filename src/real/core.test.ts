import { expect, test } from "bun:test";
import { createOnchainosHttp } from "../onchainos/http.ts";
import { envelope, makeClock, makeFakeFetch, type FakeCall, type FakeReply } from "../onchainos/fakes.ts";
import { createRealCore, sanitizeCoreSample } from "./core.ts";
import { checkPreparedProposal, minimumOutputRaw } from "./preflight.ts";
import type { Inventory, MarketCandles, MarketPrices, NormalizedQuote } from "./types.ts";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const INPUT = { correlationId: "cycle-1", chainIndex: "1", address: ADDRESS, revision: 2 };
const TOKEN = "0x2222222222222222222222222222222222222222";
const TOKEN2 = "0x3333333333333333333333333333333333333333";
const PAIR = { fromToken: TOKEN, toToken: TOKEN2, amount: "9007199254740993", slippagePercent: "0.5" };
const ROUTER = "0x4444444444444444444444444444444444444444";

function quoteRow(amount = PAIR.amount) {
  return { chainIndex: "1", swapMode: "exactIn", fromTokenAmount: amount, toTokenAmount: "10000000000000001",
    fromToken: { tokenContractAddress: TOKEN, decimal: "6", tokenUnitPrice: "1", isHoneyPot: false, taxRate: "0" },
    toToken: { tokenContractAddress: TOKEN2, decimal: "18", tokenUnitPrice: "1", isHoneyPot: false, taxRate: "0" },
    priceImpactPercent: "-0.01", tradeFee: "0.001", estimateGasFee: "21000", dexRouterList: [],
    debugAddress: ADDRESS, debugSecret: "canary-provider-private-text" };
}

function swapReply(call: FakeCall): FakeReply {
  if (call.path.endsWith("/aggregator/quote")) return { body: envelope([quoteRow()]) };
  if (call.path.endsWith("/aggregator/swap")) return { body: envelope([{ routerResult: quoteRow(), tx: {
    from: ADDRESS, to: ROUTER, data: "0xabcdef010000000000000000000000000000000000000000000000000000000000000000", value: "0", minReceiveAmount: "9950000000000000", gas: "21000", gasPrice: "1000000", slippagePercent: "0.5",
  } }]) };
  return supportAndBalance(call, [{ chainIndex: "1", address: ADDRESS, tokenContractAddress: TOKEN, balance: "9007199254.740993", rawBalance: PAIR.amount, tokenPrice: "1", isRiskToken: false }]);
}

function online(script: (call: FakeCall) => FakeReply) {
  const clock = makeClock();
  const fake = makeFakeFetch(script, clock);
  const http = createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep,
    credentials: { apiKey: "test-core-key", secretKey: "test-core-secret", passphrase: "test-core-pass" },
    allowNetwork: true, requestsPerSecond: 10, burst: 10, maxRetries: 0 });
  return { clock, fake, core: createRealCore({ http, now: clock.now }) };
}

function supportAndBalance(call: FakeCall, assets: unknown[], supported: string[] = ["1"]): FakeReply {
  if (call.path.endsWith("/supported/chain")) return { body: envelope(supported.map((chainIndex) => ({ chainIndex }))) };
  if (call.path.endsWith("/all-token-balances-by-address")) return { body: envelope([{ tokenAssets: assets }]) };
  return { body: envelope([]) };
}

test("missing Web3 credentials yield explicit blocked envelopes without network or wallet address", async () => {
  const clock = makeClock();
  const fake = makeFakeFetch([], clock);
  const http = createOnchainosHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep });
  const sample = await createRealCore({ http, now: clock.now }).read(INPUT);
  expect(fake.calls).toHaveLength(0);
  expect(sample.proposal).toBeNull();
  expect(sample.holdReasons).toContain("web3-credentials-unavailable");
  expect(sample.envelopes.balance?.status).toBe("blocked");
  expect(sample.envelopes.balance?.httpStatus).toBeNull();
  expect(JSON.stringify(sample)).not.toContain(ADDRESS);
  expect(sample.identityKey).toMatch(/^[a-f0-9]{64}$/);
  expect(sample.capabilities.every((item) => !item.exercisedReal && !item.financiallyQualified)).toBe(true);
});

test("capability stages name optional dependencies without claiming real or financial qualification", async () => {
  const { core } = online((call) => supportAndBalance(call, []));
  const sample = await core.read(INPUT);
  for (const family of ["simulation", "defi", "signals", "funding"] as const) {
    const item = sample.capabilities.find((item) => item.family === family);
    expect(item).toBeDefined();
    expect(item?.documented).toBe(true);
    expect(item?.integrated).toBe(false);
    expect(item?.exercisedReal).toBe(false);
    expect(item?.financiallyQualified).toBe(false);
    expect(item?.nextRequirement?.length).toBeGreaterThan(0);
  }
  expect(sample.capabilities.find((item) => item.family === "funding")?.source).toBe("okx-public-v5");
  expect(sample.capabilities.find((item) => item.family === "simulation")?.reason).toContain("whitelist");
});

test("capability availability follows independent family support and sanitized actual read failures", async () => {
  const { core, fake } = online((call) => {
    if (call.path.endsWith("/aggregator/supported/chain")) return { body: envelope([{ chainIndex: "137" }]) };
    if (call.path.endsWith("/market/price")) return { status: 429, body: envelope([], "50011", `provider-private ${ADDRESS} test-core-secret`) };
    return supportAndBalance(call, [{ chainIndex: "1", address: ADDRESS, tokenContractAddress: TOKEN, balance: "1", rawBalance: "1", tokenPrice: "1", isRiskToken: false }]);
  });
  const sample = await core.read({ ...INPUT, pair: { ...PAIR, amount: "1" } });
  expect(sample.envelopes.balance?.status).toBe("ready");
  expect(sample.envelopes.prices?.httpStatus).toBe(429);
  expect(sample.envelopes.prices?.error).toBe("onchainos-rate_limited");
  expect(sample.capabilities.find((item) => item.family === "market")?.status).toBe("error");
  expect(sample.capabilities.find((item) => item.family === "balance")?.status).toBe("ready");
  expect(sample.capabilities.find((item) => item.family === "dex")?.status).toBe("unsupported");
  expect(fake.calls.some((call) => call.path.endsWith("/aggregator/quote") || call.path.endsWith("/aggregator/swap"))).toBe(false);
  expect(JSON.stringify(sample)).not.toContain("provider-private");
  expect(JSON.stringify(sample)).not.toContain("test-core-secret");
  expect(JSON.stringify(sample)).not.toContain(ADDRESS);
});

test("persistent sample removes unsigned build payload and calldata without mutating the ephemeral proposal", async () => {
  const { core } = online(swapReply);
  const sample = await core.read({ ...INPUT, pair: PAIR });
  const data = sample.proposal!.transaction.data;
  const persisted = sanitizeCoreSample(sample);
  expect(persisted.envelopes.build?.data).toBeNull();
  expect(persisted.proposal).not.toHaveProperty("transaction");
  expect(persisted.proposal?.transactionHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(persisted)).not.toContain(data);
  expect(JSON.stringify(persisted)).not.toContain(ADDRESS);
  expect(JSON.stringify(persisted)).not.toContain("canary-provider-private-text");
  expect(sample.proposal!.transaction.data).toBe(data);
  expect(persisted.envelopes.quote?.data).toEqual(sample.envelopes.quote?.data);
});

test("covered exact-in balance permits authenticated quote and unsigned build while semantic preflight remains blocked", async () => {
  const { core, fake } = online(swapReply);
  const sample = await core.read({ ...INPUT, pair: PAIR });
  const quote = sample.envelopes.quote?.data as NormalizedQuote;
  expect(sample.envelopes.quote?.status).toBe("ready");
  expect(sample.envelopes.quote?.expiresAtMs).toBe(sample.envelopes.quote!.receivedAtMs + 15_000);
  expect(quote.fromTokenAmount).toBe(PAIR.amount);
  expect(quote.toTokenAmount).toBe("10000000000000001");
  expect(quote.fromToken.decimalsSource).toBe("provider-reference");
  expect(sample.envelopes.build?.status).toBe("ready");
  expect(sample.proposal?.balanceRaw).toBe(PAIR.amount);
  expect(sample.proposal?.executionEnabled).toBe(false);
  expect(sample.proposal?.transaction.signed).toBe(false);
  expect(sample.proposal?.preflight.structuralChecksPassed).toBe(true);
  expect(sample.proposal?.preflight.semanticChecksPassed).toBe(false);
  expect(sample.proposal?.preflight.reasons).toContain("calldata-abi-unqualified");
  expect(sample.proposal?.preflight.reasons).toContain("router-policy-unqualified");
  expect(sample.holdReasons).toContain("token-decimals-unqualified");
  const quoteCall = fake.calls.find((call) => call.path.endsWith("/aggregator/quote"));
  const buildCall = fake.calls.find((call) => call.path.endsWith("/aggregator/swap"));
  expect(new URLSearchParams(quoteCall?.query).get("amount")).toBe(PAIR.amount);
  expect(new URLSearchParams(buildCall?.query).get("approveTransaction")).toBe("false");
  expect(new URLSearchParams(buildCall?.query).get("autoSlippage")).toBe("false");
  expect(fake.calls.every((call) => !call.path.includes("broadcast") && !call.path.includes("approve-transaction"))).toBe(true);
  expect(JSON.stringify(sample)).not.toContain(ADDRESS);
  expect(JSON.stringify(sample)).not.toContain("canary-provider-private-text");
});

test("unsigned build cannot silently replace the sampled quote outcome", async () => {
  const { core } = online((call) => {
    if (call.path.endsWith("/aggregator/swap")) {
      const reply = swapReply(call);
      const body = reply.body as { data: { routerResult: ReturnType<typeof quoteRow> }[] };
      body.data[0]!.routerResult.toTokenAmount = "20000000000000000";
      return reply;
    }
    return swapReply(call);
  });
  const sample = await core.read({ ...INPUT, pair: PAIR });
  expect(sample.envelopes.quote?.status).toBe("ready");
  expect(sample.envelopes.build?.status).toBe("error");
  expect(sample.proposal).toBeNull();
  expect(sample.holdReasons).toContain("onchainos-schema");
});

test("proposal consumption rejects changes to sampled token, quantity, age and session parameters", async () => {
  const { core, clock } = online(swapReply);
  const proposal = (await core.read({ ...INPUT, pair: PAIR })).proposal!;
  const state = { identityKey: proposal.identityKey, chainIndex: "1", revision: INPUT.revision, now: clock.now() };
  expect(checkPreparedProposal(proposal, state).structuralChecksPassed).toBe(true);
  const changed = structuredClone(proposal);
  changed.fromToken = TOKEN2;
  expect(checkPreparedProposal(changed, state).structuralChecksPassed).toBe(false);
  expect(checkPreparedProposal(changed, state).reasons).toContain("proposal-parameters-mutated");
  expect(checkPreparedProposal(proposal, { ...state, now: proposal.expiresAtMs }).reasons).toContain("proposal-stale");
  expect(checkPreparedProposal(proposal, { ...state, revision: 3 }).reasons).toContain("proposal-revision-mismatch");
  expect(checkPreparedProposal(proposal, { ...state, identityKey: "different" }).reasons).toContain("proposal-identity-mismatch");
  const changedCalldata = structuredClone(proposal);
  changedCalldata.transaction.data = "0x12345678";
  expect(checkPreparedProposal(changedCalldata, state).reasons).toContain("proposal-transaction-mutated");
  expect(minimumOutputRaw("10000000000000001", "0.5")).toBe("9950000000000000");
});

test("market uses observed tokens, preserves exact unknown-currency prices, and excludes open candles", async () => {
  const timestamp = "1700000000000";
  const { core, fake } = online((call) => {
    if (call.path.endsWith("/market/price")) return { body: envelope([{ chainIndex: "1", tokenContractAddress: TOKEN, price: "12345678901234567890.123456789", time: timestamp }]) };
    if (call.path.endsWith("/market/candles")) return { body: envelope([
      [timestamp, "1", "2", "1", "2", "3", "4", "0"],
      [String(Number(timestamp) - 60_000), "1", "2", "1", "2", "3", "4", "1"],
    ]) };
    return supportAndBalance(call, [{ chainIndex: "1", address: ADDRESS, tokenContractAddress: TOKEN, balance: "1", rawBalance: "1", tokenPrice: "2", isRiskToken: false }]);
  });
  const sample = await core.read(INPUT);
  const prices = sample.envelopes.prices?.data as MarketPrices;
  const candles = sample.envelopes.candles?.data as MarketCandles;
  expect(sample.envelopes.prices?.status).toBe("ready");
  expect(sample.envelopes.prices?.unit).toBe("quote-currency-unknown");
  expect(sample.envelopes.prices?.method).toBe("POST");
  expect(sample.envelopes.prices?.mode).toBe("unverified");
  expect(sample.envelopes.candles?.method).toBe("GET");
  expect(prices.prices[0]?.price).toBe("12345678901234567890.123456789");
  expect(sample.envelopes.prices?.sourceAtMs).toBe(Number(timestamp));
  expect(sample.envelopes.prices?.expiresAtMs).toBe(Number(timestamp) + 60_000);
  expect(candles.series[0]?.candles).toHaveLength(1);
  expect(candles.series[0]?.candles[0]?.confirmed).toBe(true);
  expect(sample.envelopes.candles?.sourceAtMs).toBe(Number(timestamp));
  const priceCall = fake.calls.find((call) => call.path.endsWith("/market/price"));
  expect(priceCall?.method).toBe("POST");
  expect(JSON.parse(priceCall?.body ?? "null")).toEqual([{ chainIndex: "1", tokenContractAddress: TOKEN }]);
  expect(sample.holdReasons).toContain("market-price-currency-unqualified");
});

test("inventory cannot value an unqualified balance even when balance and rawBalance are identical", async () => {
  const { core } = online((call) => supportAndBalance(call, [{ chainIndex: "1", address: ADDRESS,
    tokenContractAddress: TOKEN, balance: "1000000", rawBalance: "1000000", tokenPrice: "2", isRiskToken: false }]));
  const sample = await core.read(INPUT);
  const inventory = sample.envelopes.balance?.data as Inventory;
  expect(inventory.assets[0]?.valueUsd).toBeNull();
  expect(inventory.assets[0]?.balance).toBe("1000000");
  expect(inventory.assets[0]?.rawBalance).toBe("1000000");
  expect(inventory.assets[0]?.tokenPriceUsd).toBe("2");
  expect(inventory.assets[0]?.decimals).toBeNull();
  expect(inventory.knownValueUsd).toBeNull();
  expect(inventory.completeValueUsd).toBeNull();
  expect(inventory.coverage).toEqual({ observedAssets: 1, rawBalanceKnown: 1, usdKnown: 0, scope: "observed-tokens-only" });
  expect(sample.envelopes.balance?.unit).toBe("balance-unit-unknown");
  expect(sample.envelopes.balance?.mode).toBe("unverified");
  expect(sample.capabilities.every((item) => !item.exercisedReal && !item.financiallyQualified)).toBe(true);
  expect(sample.proposal).toBeNull();
});

test("inventory preserves exact provider quantities and prices with unknown economic coverage through separate support reads", async () => {
  const { core, fake, clock } = online((call) => supportAndBalance(call, [
    { chainIndex: "1", address: ADDRESS, tokenContractAddress: TOKEN, symbol: "AAA", balance: "9007199.254740993", rawBalance: "9007199254740993", tokenPrice: "0.2", isRiskToken: false },
    { chainIndex: "1", address: ADDRESS, tokenContractAddress: TOKEN2, symbol: "BBB", balance: "1", rawBalance: "", tokenPrice: "", isRiskToken: false },
  ]));
  const sample = await core.read(INPUT);
  const balance = sample.envelopes.balance;
  const inventory = balance?.data as Inventory;
  expect(balance?.status).toBe("ready");
  expect(balance?.expiresAtMs).toBe(clock.now() + 60_000);
  expect(balance?.sourceAtMs).toBeNull();
  expect(balance?.httpStatus).toBe(200);
  expect(balance?.method).toBe("GET");
  expect(balance?.unit).toBe("balance-unit-unknown");
  expect(inventory.assets[0]?.balance).toBe("9007199.254740993");
  expect(inventory.assets[0]?.rawBalance).toBe("9007199254740993");
  expect(inventory.assets[0]?.tokenPriceUsd).toBe("0.2");
  expect(inventory.assets[0]?.decimals).toBeNull();
  expect(inventory.assets[0]?.valueUsd).toBeNull();
  expect(inventory.assets[1]?.rawBalance).toBeNull();
  expect(inventory.knownValueUsd).toBeNull();
  expect(inventory.completeValueUsd).toBeNull();
  expect(inventory.coverage).toEqual({ observedAssets: 2, rawBalanceKnown: 1, usdKnown: 0, scope: "observed-tokens-only" });
  expect(fake.calls.slice(0, 3).map((call) => call.path)).toEqual([
    "/api/v6/dex/market/supported/chain", "/api/v6/dex/balance/supported/chain", "/api/v6/dex/aggregator/supported/chain",
  ]);
  const balanceCall = fake.calls.find((call) => call.path.endsWith("/all-token-balances-by-address"));
  expect(new URLSearchParams(balanceCall?.query).get("excludeRiskToken")).toBe("0");
  expect(JSON.stringify(sample)).not.toContain(ADDRESS);
});

test("inventory rejects missing, malformed or wallet-address token identities instead of retaining provider metadata", async () => {
  for (const tokenContractAddress of [null, "invalid-token", ADDRESS]) {
    const { core } = online((call) => supportAndBalance(call, [{ chainIndex: "1", address: ADDRESS, tokenContractAddress, balance: "1", rawBalance: "1", tokenPrice: "1", isRiskToken: false }]));
    const sample = await core.read(INPUT);
    expect(sample.envelopes.balance?.status).toBe("error");
    expect(sample.envelopes.balance?.data).toBeNull();
    expect(JSON.stringify(sample)).not.toContain(ADDRESS);
  }
});

test("quote preserves bounded token routes and exact protocol percentages while discarding route metadata", async () => {
  const routedQuote = { ...quoteRow(), router: `${TOKEN}--${TOKEN2}`, dexRouterList: [{
    fromToken: { tokenContractAddress: TOKEN, debugAddress: ADDRESS }, toToken: { tokenContractAddress: TOKEN2 },
    fromTokenIndex: "0", toTokenIndex: "1", dexProtocol: { dexName: "Uniswap V4", percent: "100", debugSecret: "route-private-canary" },
    privateWallet: ADDRESS,
  }] };
  const { core } = online((call) => {
    if (call.path.endsWith("/aggregator/quote")) return { body: envelope([routedQuote]) };
    if (call.path.endsWith("/aggregator/swap")) return { body: envelope([{ routerResult: routedQuote, tx: {
      from: ADDRESS, to: ROUTER, data: "0xabcdef01", value: "0", minReceiveAmount: "9950000000000000", slippagePercent: "0.5",
    } }]) };
    return swapReply(call);
  });
  const sample = await core.read({ ...INPUT, pair: PAIR });
  const quote = sample.envelopes.quote?.data as NormalizedQuote;
  expect(quote).toHaveProperty("mainRoute", [TOKEN, TOKEN2]);
  expect(quote).toHaveProperty("routes", [{ fromToken: TOKEN, toToken: TOKEN2, fromTokenIndex: "0", toTokenIndex: "1", dexName: "Uniswap V4", percent: "100" }]);
  expect(quote.routeCount).toBe(1);
  expect(sample.envelopes.build?.status).toBe("ready");
  expect(JSON.stringify(sanitizeCoreSample(sample))).not.toContain("route-private-canary");
  expect(JSON.stringify(sanitizeCoreSample(sample))).not.toContain(ADDRESS);
});

test("bounded market reads expose omitted observed tokens and cannot claim complete capability coverage", async () => {
  const tokens = [TOKEN, TOKEN2, ROUTER, "0x5555555555555555555555555555555555555555", "0x6666666666666666666666666666666666666666"];
  const { core, fake } = online((call) => {
    if (call.path.endsWith("/market/price")) return { body: envelope(tokens.slice(0, 4).map((tokenContractAddress) => ({ chainIndex: "1", tokenContractAddress, price: "1", time: "1700000000000" }))) };
    if (call.path.endsWith("/market/candles")) return { body: envelope([["1699999940000", "1", "1", "1", "1", "1", "1", "1"]]) };
    return supportAndBalance(call, tokens.map((tokenContractAddress) => ({ chainIndex: "1", tokenContractAddress, balance: "1", rawBalance: "1", tokenPrice: "1", isRiskToken: false })));
  });
  const sample = await core.read(INPUT);
  expect(sample.envelopes.prices?.data).toHaveProperty("omittedTokens", [tokens[4]]);
  expect(sample.envelopes.candles?.data).toHaveProperty("omittedTokens", [tokens[4]]);
  expect(fake.calls.filter((call) => call.path.endsWith("/market/candles"))).toHaveLength(4);
  expect(sample.holdReasons).toContain("market-token-coverage-limited");
  expect(sample.capabilities.find((item) => item.family === "market")?.status).toBe("blocked");
});

test("proposal consumption rejects unknown or non-finite clocks rather than extending validity", async () => {
  const { core, clock } = online(swapReply);
  const sample = await core.read({ ...INPUT, pair: PAIR });
  const proposal = sample.proposal!;
  for (const now of [NaN, Infinity, -1]) {
    const result = checkPreparedProposal(proposal, { identityKey: proposal.identityKey, chainIndex: "1", revision: 2, now });
    expect(result.structuralChecksPassed).toBe(false);
    expect(result.reasons).toContain("proposal-time-invalid");
  }
  const changed = structuredClone(proposal);
  changed.expiresAtMs = NaN;
  expect(checkPreparedProposal(changed, { identityKey: proposal.identityKey, chainIndex: "1", revision: 2, now: clock.now() }).reasons).toContain("proposal-time-invalid");
});
