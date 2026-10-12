// Read-only: never constructs Market/Wallet, signs, approves or deposits.
import { ethers } from "ethers";
import orderbookAbi from "@kuru-labs/kuru-sdk/abi/OrderBook.json";
import { config } from "../src/config";
import { buildBook, log10, SEL_GET_L2_BOOK } from "../src/book";
import { makerEconomics } from "../src/economics";
// One deadline covers headers, response bodies, SDK calls and the subsequent book read.
// ethers v5's connection timeout races its HTTP request without cancelling it.
const controller = new AbortController();
const deadline = setTimeout(() => controller.abort(), 5_000);
let nextId = 1;
const pending = new Set<Promise<unknown>>();
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  if (!["eth_chainId", "eth_gasPrice", "eth_call"].includes(method)) throw new Error("Doctor only permits its read-only RPC methods");
  const id = nextId++;
  const request = (async () => {
    const response = await fetch(config.readRpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: controller.signal,
    });
    if (!response.ok) throw new Error("Doctor RPC HTTP failure");
    const body = await response.json() as { jsonrpc?: unknown; id?: unknown; error?: unknown; result?: T };
    if (body.jsonrpc !== "2.0" || body.id !== id || body.error || !Object.hasOwn(body, "result")) throw new Error("Doctor RPC response failure");
    return body.result as T;
  })();
  pending.add(request);
  try { return await request; } finally { pending.delete(request); }
}
async function readMarketParams() {
  // Use the installed SDK's ABI and field mapping without importing its second ethers runtime.
  const decoder = new ethers.utils.Interface(orderbookAbi.abi);
  const values = decoder.decodeFunctionResult("getMarketParams", await rpc<string>("eth_call", [
    { to: config.market, from: ethers.constants.AddressZero, data: decoder.encodeFunctionData("getMarketParams") }, "latest",
  ]));
  return {
    pricePrecision: ethers.BigNumber.from(values[0]), sizePrecision: ethers.BigNumber.from(values[1]),
    baseAssetAddress: values[2] as string, baseAssetDecimals: ethers.BigNumber.from(values[3]),
    quoteAssetAddress: values[4] as string, quoteAssetDecimals: ethers.BigNumber.from(values[5]),
    tickSize: ethers.BigNumber.from(values[6]), minSize: ethers.BigNumber.from(values[7]),
    maxSize: ethers.BigNumber.from(values[8]), takerFeeBps: ethers.BigNumber.from(values[9]),
    makerFeeBps: ethers.BigNumber.from(values[10]),
  };
}
const missing = [!process.env.TYPESAFE_AI_API_KEY && "TYPESAFE_AI_API_KEY", !config.privateKey && "PRIVATE_KEY"].filter(Boolean);
const result: Record<string, unknown> = { checkedAt: new Date().toISOString(), mode: config.dryRun ? "paper" : "live-requested", model: config.model, credentialsPresent: { jev: Boolean(process.env.TYPESAFE_AI_API_KEY), wallet: Boolean(config.privateKey) }, missing, investmentReady: false, reason: "Requires own credentials, funded/reconciled wallet and margin, longer cost-aware strategy validation. Doctor does not certify profitability or live execution.", limits: { bankrollUsd: config.bankrollUsd, maxLossUsd: config.maxLossUsd, maxSpendUsd: config.maxSpendUsd, quoteIntervalBlocks: config.quoteIntervalBlocks }, leverage: "funded spot only, no borrowing" };
try {
  const [chain, params, fee] = await Promise.all([rpc<string>("eth_chainId"), readMarketParams(), rpc<string>("eth_gasPrice")]);
  if (parseInt(chain, 16) !== config.chainId) throw new Error("RPC chain mismatch");
  const book = buildBook(await rpc<string>("eth_call", [{ to: config.market, data: SEL_GET_L2_BOOK }, "latest"]), params);
  const gasMon = (config.gasLimit ?? config.gasLimitFallback) * Number(BigInt(fee)) / 1e18;
  result.market = { chainId: config.chainId, address: config.market, quoteToken: params.quoteAssetAddress, mid: book.mid, spreadBps: book.spreadBps, minSizeMon: Number(params.minSize.toString()) / 10 ** log10(params.sizePrecision), makerFeeBpsRaw: params.makerFeeBps.toNumber(), takerFeeBps: params.takerFeeBps.toNumber(), gasPriceGwei: Number(BigInt(fee)) / 1e9, gasLimitAssumption: config.gasLimit ?? config.gasLimitFallback, gasMonPerQuote: gasMon, gasUsdPerQuote: gasMon * book.mid };
  const scale = 10 ** log10(params.pricePrecision), step = config.quoteInsideTicks * Number(params.tickSize.toString()) / scale;
  const buy = book.bid + step < book.ask ? book.bid + step : book.bid;
  const sell = book.ask - step > book.bid ? book.ask - step : book.ask;
  result.costScreen = { assumption: "Hypothetical two full fills at unchanged book; two quote gas costs, maker fees and one inference allowance. No forecast; additional inference/cancellation costs excluded.", buy, sell, inferenceBudgetTokens: config.inferenceBudgetTokens, bufferUsd: config.minNetEdgeUsd, ...makerEconomics({ buy, sell, size: config.tradeSizeMon, gasMonPerQuote: gasMon, mid: book.mid, feeBps: config.makerFeeBps, inferenceUsd: config.model === "mock" ? 0 : config.inferenceBudgetTokens * config.jevUsdPerMTok / 1e6, bufferUsd: config.minNetEdgeUsd }) };
  result.paperReady = params.makerFeeBps.isZero() && config.tradeSizeMon >= Number(params.minSize.toString()) / 10 ** log10(params.sizePrecision) && config.marginMon * book.mid <= config.bankrollUsd * config.maxCapitalFraction;
} catch { result.paperReady = false; result.rpcError = "RPC/market check failed; verify connectivity, chain and contract locally."; }
finally {
  clearTimeout(deadline);
  controller.abort();
  await Promise.allSettled([...pending]);
}
console.log(JSON.stringify(result, null, 2));
