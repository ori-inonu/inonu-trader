/**
 * The routes that hand the person's own wallet what it needs to carry out a confirmed order (WAL-10): the swap and the approval. origin: shape_of_docs_with_synthetic_values: the keys are the ones the provider's
 * documentation lists (`routerResult`, `tx`, `dexContractAddress`...); every address and amount here is made up.
 */
import { describe, expect, test } from "bun:test";
import { endpointFor } from "../catalog";
import { TRADE_ENDPOINTS } from "./trade";

const [swap, approve] = TRADE_ENDPOINTS as readonly [(typeof TRADE_ENDPOINTS)[number], (typeof TRADE_ENDPOINTS)[number]];
const WALLET = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOKEN = "0xAAAA000000000000000000000000000000000001";
const ROUTER = "0x1111111254eeb25477b68fb85ed929f73a960582";
const SOL_WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_TOKEN = "So11111111111111111111111111111111111111112";
const good = { chainIndex: "8453", amount: "100000000", fromToken: USDC, toToken: TOKEN, slippagePercent: "1", userWalletAddress: WALLET };

const answer = (over: Record<string, unknown> = {}, txOver: Record<string, unknown> = {}) => [
  {
    routerResult: {
      chainIndex: "8453", fromTokenAmount: "100000000", toTokenAmount: "250000000000000000000", priceImpactPercent: "0.12", tradeFee: "0.4", estimateGasFee: "180000",
      fromToken: { tokenContractAddress: USDC, tokenSymbol: "USDC", decimal: "6", tokenUnitPrice: "1", taxRate: "0", isHoneyPot: false },
      toToken: { tokenContractAddress: TOKEN, tokenSymbol: "AAA", decimal: "18", tokenUnitPrice: "0.4", taxRate: "0", isHoneyPot: false },
      dexRouterList: [{ dexProtocol: { dexName: "Uniswap V3", percent: "100" } }],
      ...over,
    },
    tx: { from: WALLET, to: ROUTER, value: "0", gas: "250000", gasPrice: "1000000", maxPriorityFeePerGas: "100000", minReceiveAmount: "247500000000000000000", slippagePercent: "1", data: "0x12aa3caf0000", ...txOver },
  },
];

describe("the routes", () => {
  test("they are in the catalog, never cached, and counted as Basic", () => {
    expect(endpointFor("/onchain/swap")).toBe(swap);
    expect(endpointFor("/onchain/approve")).toBe(approve);
    for (const ep of TRADE_ENDPOINTS) expect(ep.tier).toBe("basic");
    const v = swap.validate(good);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.ttlMs).toBe(0);
    const a = approve.validate({ chainIndex: "8453", token: USDC, amount: "100000000" });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.ttlMs).toBe(0);
  });

  test("the swap request carries the wallet, the slippage and the tokens as the provider names them", () => {
    const v = swap.validate(good);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.request.method).toBe("GET");
    const url = new URL(`https://x${v.request.path}`);
    expect(url.pathname).toBe("/api/v6/dex/aggregator/swap");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      chainIndex: "8453", amount: "100000000", fromTokenAddress: USDC.toLowerCase(), toTokenAddress: TOKEN.toLowerCase(), slippagePercent: "1", userWalletAddress: WALLET,
    });
  });

  test("a Solana order keeps the case of the mint and the wallet", () => {
    const v = swap.validate({ chainIndex: "501", amount: "5000000", fromToken: SOL_USDC, toToken: SOL_TOKEN, slippagePercent: "2.5", userWalletAddress: SOL_WALLET });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const url = new URL(`https://x${v.request.path}`);
    expect(url.searchParams.get("fromTokenAddress")).toBe(SOL_USDC);
    expect(url.searchParams.get("userWalletAddress")).toBe(SOL_WALLET);
  });

  test("anything out of shape is refused before the provider is asked", () => {
    const bad = (over: Record<string, string | undefined>) => {
      const p: Record<string, string> = { ...good };
      for (const [k, v] of Object.entries(over)) {
        if (v === undefined) delete p[k];
        else p[k] = v;
      }
      return swap.validate(p).ok;
    };
    expect(bad({ amount: "0" })).toBe(false);
    expect(bad({ amount: "1.5" })).toBe(false);
    expect(bad({ amount: "-1" })).toBe(false);
    expect(bad({ slippagePercent: "0" })).toBe(false);
    expect(bad({ slippagePercent: "5.01" })).toBe(false);
    expect(bad({ slippagePercent: "50" })).toBe(false);
    expect(bad({ slippagePercent: "abc" })).toBe(false);
    expect(bad({ slippagePercent: undefined })).toBe(false);
    expect(bad({ userWalletAddress: "0x123" })).toBe(false);
    expect(bad({ userWalletAddress: undefined })).toBe(false);
    expect(bad({ fromToken: "native" })).toBe(false);
    expect(bad({ toToken: USDC })).toBe(false);
    expect(bad({ chainIndex: "abc" })).toBe(false);
    // a Solana mint on an EVM network, and an EVM address on Solana
    expect(bad({ toToken: SOL_TOKEN })).toBe(false);
    expect(swap.validate({ chainIndex: "501", amount: "1", fromToken: USDC, toToken: SOL_TOKEN, slippagePercent: "1", userWalletAddress: SOL_WALLET }).ok).toBe(false);
    expect(swap.validate({ ...good, extra: "1" }).ok).toBe(false);
  });

  test("the approval is for the exact amount, on an EVM network, for a token contract", () => {
    expect(approve.validate({ chainIndex: "8453", token: USDC, amount: "100000000" }).ok).toBe(true);
    expect(approve.validate({ chainIndex: "501", token: SOL_USDC, amount: "100" }).ok).toBe(false);
    expect(approve.validate({ chainIndex: "8453", token: USDC, amount: "0" }).ok).toBe(false);
    expect(approve.validate({ chainIndex: "8453", token: USDC }).ok).toBe(false);
    expect(approve.validate({ chainIndex: "8453", token: "native", amount: "1" }).ok).toBe(false);
    expect(approve.validate({ chainIndex: "8453", token: USDC, amount: "1", spender: ROUTER }).ok).toBe(false);
  });
});

describe("the swap answer", () => {
  const read = (data: unknown) => {
    const n = swap.normalize(data);
    if (!n.ok) throw new Error("refused");
    return n.data as { chainIndex: string; family: string; tx: Record<string, unknown>; route: Record<string, unknown> };
  };

  test("the transaction and the route are kept, amounts as exact strings", () => {
    const r = read(answer());
    expect(r.family).toBe("evm");
    expect(r.tx).toEqual({ from: WALLET, to: ROUTER, data: "0x12aa3caf0000", value: "0", gas: "250000", gasPrice: "1000000", maxPriorityFeePerGas: "100000", minReceiveAmount: "247500000000000000000", slippagePercent: 1 });
    expect(r.route).toMatchObject({ fromAmount: "100000000", toAmount: "250000000000000000000", priceImpactPct: 0.12, dexNames: ["Uniswap V3"] });
    expect(r.route.fromToken).toMatchObject({ symbol: "USDC", decimals: 6, isHoneyPot: false, taxRate: 0 });
    expect(r.route.toToken).toMatchObject({ symbol: "AAA", decimals: 18, isHoneyPot: false });
  });

  test("an unknown honeypot flag stays unknown, never safe", () => {
    const r = read(answer({ toToken: { tokenContractAddress: TOKEN, tokenSymbol: "AAA", decimal: "18" } }));
    expect(r.route.toToken).toMatchObject({ isHoneyPot: null, taxRate: null });
  });

  test("a Solana answer carries the serialized transaction and no router address", () => {
    const r = read(answer({ chainIndex: "501" }, { to: "", data: "AQAB3xYz+/abc=" }));
    expect(r.family).toBe("solana");
    expect(r.tx).toMatchObject({ to: null, data: "AQAB3xYz+/abc=" });
  });

  test("anything that is not a whole transaction makes the answer invalid, never a partial one", () => {
    const refused = (data: unknown) => swap.normalize(data).ok === false;
    expect(refused([])).toBe(true);
    expect(refused(null)).toBe(true);
    expect(refused([{ tx: answer()[0]!.tx }])).toBe(true);
    expect(refused([{ routerResult: answer()[0]!.routerResult }])).toBe(true);
    expect(refused(answer({}, { data: "0x" }))).toBe(true);
    expect(refused(answer({}, { data: "not hex" }))).toBe(true);
    expect(refused(answer({}, { data: "0x" + "ab".repeat(20_000) }))).toBe(true);
    expect(refused(answer({}, { to: "0x123" }))).toBe(true);
    expect(refused(answer({}, { to: undefined }))).toBe(true);
    expect(refused(answer({ fromTokenAmount: "1.5" }))).toBe(true);
    expect(refused(answer({ toTokenAmount: "" }))).toBe(true);
    expect(refused(answer({ fromToken: {} }))).toBe(true);
  });

  test("an unreadable minimum or slippage is null, not a made up number", () => {
    const r = read(answer({}, { minReceiveAmount: "", slippagePercent: "" }));
    expect(r.tx.minReceiveAmount).toBeNull();
    expect(r.tx.slippagePercent).toBeNull();
  });

  test("text from the provider is stripped of control and direction characters", () => {
    const r = read(answer({ fromToken: { tokenContractAddress: USDC, tokenSymbol: "US\u202EDC\n", decimal: "6" } }));
    expect(r.route.fromToken).toMatchObject({ symbol: "USDC" });
  });
});

describe("the approval answer", () => {
  const spender = "0x40aa958dd87fc8305b97f2ba922cddca374bcd7f";
  test("the calldata and the spender are kept", () => {
    const n = approve.normalize([{ data: "0x095ea7b3000000", dexContractAddress: spender, gasLimit: "50000", gasPrice: "1000000" }]);
    expect(n).toEqual({ ok: true, data: { data: "0x095ea7b3000000", spender, gasLimit: "50000", gasPrice: "1000000" } });
  });

  test("a spender that is not an address, or no calldata, is refused", () => {
    expect(approve.normalize([{ data: "0x095ea7b3000000", dexContractAddress: "router" }]).ok).toBe(false);
    expect(approve.normalize([{ dexContractAddress: spender }]).ok).toBe(false);
    expect(approve.normalize([{ data: "0x", dexContractAddress: spender }]).ok).toBe(false);
    expect(approve.normalize([]).ok).toBe(false);
  });
});
