/**
 * Conformance with the OKX documentation pages read on 2026-10-12 (a second consultation, of the market endpoints and the
 * error tables). Each test names the page fact it pins. SYNTHETIC data only; no network.
 *
 * Pages: market-price, market-token-basic-info, market-token-top-liquidity, market-token-advanced-info,
 * onchaindata-error-code and market-price-error-code under https://web3.okx.com/onchainos/dev-docs/market/.
 */

import { describe, expect, test } from "bun:test";
import { OnchainosError } from "../onchainos/errors.ts";
import { envelope, makeStack } from "../onchainos/fakes.ts";
import { classify, collectWalletEvidence, type CollectRequest } from "./collector.ts";
import { FIXTURE_ACCOUNT, FIXTURE_TOKEN_A } from "./fixtures.ts";
import { readLiquidity, readPrices, readRisk, readTokenDecimals } from "./adapters/okx-read.ts";

const MIXED = "0x00000000000000000000000000000000000A0001";
const LOWER = "0x00000000000000000000000000000000000a0001";
const BALANCES_PATH = "/api/v6/dex/balance/all-token-balances-by-address";

describe("market-price: 'for EVM chains use all-lowercase addresses'", () => {
  test("a mixed-case EVM contract is sent in lowercase, in the body, and still matches the answer", async () => {
    const { http, fake } = makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: LOWER, time: "1759999990000", price: "4" }]) }]);
    const read = await readPrices(http, [{ chainIndex: "1", tokenContractAddress: MIXED }]);
    expect(JSON.parse(fake.calls[0]!.body!)).toEqual([{ chainIndex: "1", tokenContractAddress: LOWER }]);
    expect(read.value.prices).toHaveLength(1);
    expect(read.value.missing).toEqual([]);
  });

  test("the same holds for basic-info, top-liquidity and advanced-info", async () => {
    const info = makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: LOWER, decimal: "6" }]) }]);
    await readTokenDecimals(info.http, [{ chainIndex: "1", tokenContractAddress: MIXED }]);
    expect(JSON.parse(info.fake.calls[0]!.body!)).toEqual([{ chainIndex: "1", tokenContractAddress: LOWER }]);
    const pools = makeStack([{ body: envelope([{ liquidityUsd: "1" }]) }]);
    await readLiquidity(pools.http, { chainIndex: "1", tokenContractAddress: MIXED });
    expect(new URLSearchParams(pools.fake.calls[0]!.query).get("tokenContractAddress")).toBe(LOWER);
    const risk = makeStack([{ body: envelope({ riskControlLevel: "1", tokenTags: [] }) }]);
    await readRisk(risk.http, { chainIndex: "1", tokenContractAddress: MIXED });
    expect(new URLSearchParams(risk.fake.calls[0]!.query).get("tokenContractAddress")).toBe(LOWER);
  });
});

describe("response shapes of the pages", () => {
  test("top-liquidity: data is an array of pools with extra fields, nulls and empty strings the code does not need", async () => {
    const pool = { pool: "A/B", protocolName: "P", liquidityUsd: "1000.5", liquidityAmount: [{ tokenAmount: "1", tokenSymbol: "A", tokenContractAddress: LOWER }], liquidityProviderFeePercent: "", hookFeePercent: null, sniperTaxPercent: { buy: "", sell: "" }, poolLogoUrl: "x", poolAddress: LOWER, poolCreator: LOWER };
    const { http } = makeStack([{ body: envelope([pool, { ...pool, liquidityUsd: "0.5" }]) }]);
    const read = await readLiquidity(http, { chainIndex: "1", tokenContractAddress: LOWER });
    expect(read.value).toMatchObject({ poolsRead: 2, liquidityUsdLowerBoundText: "1001", scope: "top_pools_lower_bound" });
  });

  test("advanced-info: data is an object; riskControlLevel is a string 0 to 5, and 5 is 'high, manually configured'", async () => {
    const { http } = makeStack([{ body: envelope({ riskControlLevel: "5", tokenTags: ["honeypot", "lowLiquidity"], top10HoldPercent: "10", chainIndex: "1" }) }, { body: envelope({ riskControlLevel: "6" }) }]);
    const high = await readRisk(http, { chainIndex: "1", tokenContractAddress: LOWER });
    expect(high.value).toMatchObject({ riskControlLevel: 5, tags: ["honeypot", "lowLiquidity"] });
    const wild = await readRisk(http, { chainIndex: "1", tokenContractAddress: LOWER });
    expect(wild.value.riskControlLevel).toBeNull();
  });

  test("basic-info: the precision field is `decimal`, a string", async () => {
    const { http } = makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: LOWER, decimal: "18", tokenName: "n", tokenSymbol: "s", tagList: { communityRecognized: true } }]) }]);
    const read = await readTokenDecimals(http, [{ chainIndex: "1", tokenContractAddress: LOWER }]);
    expect(read.value.tokenInfo[0]!.decimals).toBe(18);
  });

  test("market-price: `time` is a string of Unix milliseconds and `price` has no declared currency", async () => {
    const { http } = makeStack([{ body: envelope([{ chainIndex: "1", tokenContractAddress: LOWER, time: "1759999990000", price: "4.5" }]) }]);
    const read = await readPrices(http, [{ chainIndex: "1", tokenContractAddress: LOWER }]);
    expect(read.value.prices[0]).toMatchObject({ timeMs: 1_759_999_990_000, priceText: "4.5", currency: null });
  });
});

describe("the official error tables (onchaindata-error-code and market-price-error-code)", () => {
  const http = (httpStatus: number, apiCode: string) => new OnchainosError("http", "x", { httpStatus, apiCode });
  const api = (apiCode: string) => new OnchainosError("api", "x", { httpStatus: 200, apiCode });

  test("50125 (HTTP 401) 'your API key or region has no access' is an access denial, not a bad credential", () => {
    expect(classify(http(401, "50125"))).toMatchObject({ code: "access_denied_or_region_restricted", stop: "access_denied" });
    expect(classify(api("50125"))).toMatchObject({ code: "access_denied_or_region_restricted", stop: "access_denied" });
  });

  test("50103 to 50114 (HTTP 401) are credential problems and end the refresh", () => {
    for (const code of ["50103", "50104", "50105", "50106", "50107", "50111", "50112", "50113", "50114"]) {
      expect(classify(http(401, code))).toMatchObject({ code: "credentials_rejected", stop: "credentials_rejected" });
    }
    expect(classify(http(401, "99999"))).toMatchObject({ code: "credentials_rejected", stop: "credentials_rejected" });
    // an auth code that arrives with HTTP 200 (as 50038 does) is still a credential problem
    expect(classify(api("50111"))).toMatchObject({ code: "credentials_rejected", stop: "credentials_rejected" });
    expect(classify(api("50115")).stop).toBeNull();
    expect(classify(api("50102")).stop).toBeNull();
  });

  test("50038 'unsupported chain' comes with HTTP 200 and only costs that call", () => {
    expect(classify(api("50038"))).toEqual({ code: "chain_unsupported", stop: null, httpStatus: 200, apiCode: "50038" });
  });

  test("50011 (429) is a rate limit that ends the refresh, 50014 50036 51000 (400) are parameter errors that do not, 50026 (500) is transient", () => {
    expect(classify(new OnchainosError("rate_limited", "x", { httpStatus: 429, apiCode: "50011" }))).toMatchObject({ code: "rate_limited", stop: "rate_limited" });
    for (const code of ["50014", "50036", "51000"]) expect(classify(http(400, code)).stop).toBeNull();
    expect(classify(http(500, "50026")).stop).toBeNull();
    expect(classify(http(404, "50404")).stop).toBeNull();
  });

  test("a payment demand (the docs describe a pay per call mode) is never answered with a payment", () => {
    expect(classify(http(402, "0"))).toMatchObject({ code: "payment_required", stop: "payment_required" });
  });

  const request: CollectRequest = { address: FIXTURE_ACCOUNT, chains: ["1"], excludeRiskToken: "1", totalValue: false, market: false };

  test("end to end: an unsupported chain is a typed error of the balances section; an access denial ends the refresh", async () => {
    const unsupported = makeStack(() => ({ body: envelope([], "50038", "Unsupported chain. Please check that chainIndex is correct") }));
    const a = await collectWalletEvidence({ http: unsupported.http, now: unsupported.clock.now }, request, { origin: "synthetic_fixture" });
    expect(a.evidence.collection?.errors).toEqual([{ section: "balances", code: "chain_unsupported", httpStatus: 200, apiCode: "50038" }]);
    expect(a.evidence.collection?.stoppedBy).toBeNull();

    const denied = makeStack((call) => ({ status: 401, body: { code: "50125", msg: "Your API key or region has no access to the current service" }, ...(call.path === BALANCES_PATH ? {} : {}) }), { maxRetries: 0 });
    const b = await collectWalletEvidence({ http: denied.http, now: denied.clock.now }, { ...request, totalValue: true }, { origin: "synthetic_fixture" });
    expect(b.evidence.collection?.stoppedBy).toBe("access_denied");
    expect(b.evidence.collection?.errors[0]).toMatchObject({ code: "access_denied_or_region_restricted", httpStatus: 401, apiCode: "50125" });
    expect(denied.fake.calls).toHaveLength(1);
    expect(FIXTURE_TOKEN_A.length).toBe(42);
  });
});
