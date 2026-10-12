/** Bounded read-only EVM RPC seam. Consent and actual network qualification belong to the caller. */
import { createHash } from "node:crypto";
import { utils } from "ethers";
import { chainByIndex } from "../okx-wallet/chains.ts";

export type RpcReadChain = "196" | "143";
export type RpcReadMethod = "eth_chainId" | "eth_getBlockByNumber" | "eth_getBalance" | "eth_getCode" | "eth_call";
export type RpcReadFetch = (url: string, init: RequestInit) => Promise<Response>;
export interface RpcReadInput {
  address: string;
  chainIndex: RpcReadChain;
  identityKey: string;
  revision: number;
  correlationId: string;
  tokens: readonly string[];
  spender?: string;
}
export interface RpcReadOptions {
  fetch: RpcReadFetch;
  now?: () => number;
  endpoints?: Partial<Record<RpcReadChain, string>>;
  timeoutMs?: number;
  maxTokens?: number;
  maxResponseBytes?: number;
  maxTotalBytes?: number;
  ttlMs?: number;
}
export interface RpcReadReceipt {
  source: "evm-rpc-read";
  mode: "unverified";
  endpoint: string;
  httpMethod: "POST";
  rpcMethod: RpcReadMethod;
  requestId: number;
  blockNumber: string | null;
  requestedAtMs: number;
  receivedAtMs: number | null;
  httpStatus: number | null;
  outcome: "ready" | "blocked";
  reason: string | null;
}
export interface RpcReadToken {
  token: string;
  rawBalance: string | null;
  decimals: number | null;
  decimalsMethod: "erc20-decimals";
  codeHash: string | null;
  allowanceRaw: string | null;
  allowanceRequested: boolean;
  reasons: string[];
}
export interface RpcReadSnapshot {
  source: "evm-rpc-read";
  mode: "unverified";
  status: "ready" | "blocked";
  exercisedReal: false;
  financiallyQualified: false;
  executionEnabled: false;
  context: { chainIndex: RpcReadChain | null; identityKey: string | null; revision: number | null;
    correlationId: string | null; blockNumber: string | null; blockHash: string | null;
    observedAtMs: number; expiresAtMs: number };
  blockConsistent: boolean;
  nativeBalanceRaw: string | null;
  nativeDecimals: number | null;
  nativeDecimalsMethod: "native-chain-metadata";
  tokens: RpcReadToken[];
  receipts: RpcReadReceipt[];
  reasons: string[];
  deployment: null;
  decoder: null;
  dependencies: string[];
}
const DEFAULT_ENDPOINTS: Record<RpcReadChain, string> = { "196": "https://rpc.xlayer.tech", "143": "https://rpc.monad.xyz" };
const DEFAULTS = { timeoutMs: 10_000, maxTokens: 8, maxResponseBytes: 32_768, maxTotalBytes: 262_144, ttlMs: 60_000 };
const addressWord = (address: string) => address.slice(2).toLowerCase().padStart(64, "0");
class ReadFailure extends Error { constructor(readonly reason: string, readonly fatal = false) { super(reason); } }
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
function validInput(input: RpcReadInput, maxTokens: number): boolean {
  if (!input || !ADDRESS.test(input.address) || !["196", "143"].includes(input.chainIndex)
    || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.identityKey !== "string"
    || input.identityKey !== createHash("sha256").update(`${input.chainIndex}:${input.address.toLowerCase()}`).digest("hex")
    || typeof input.correlationId !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(input.correlationId)
    || input.correlationId.toLowerCase().includes(input.address.toLowerCase())
    || !Array.isArray(input.tokens) || input.tokens.length > maxTokens
    || input.spender !== undefined && !ADDRESS.test(input.spender)) return false;
  return input.tokens.every(token => typeof token === "string" && ADDRESS.test(token)
    && token.toLowerCase() !== input.address.toLowerCase() && token.toLowerCase() !== `0x${"ee".repeat(20)}`)
    && new Set(input.tokens.map(token => token.toLowerCase())).size === input.tokens.length;
}
function uintQuantity(value: unknown): string {
  if (typeof value !== "string" || value.length > 66 || !QUANTITY.test(value)) throw new ReadFailure("invalid-quantity");
  return BigInt(value).toString();
}
function uintWord(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) throw new ReadFailure("invalid-abi-word");
  return BigInt(value).toString();
}
function readBlock(value: unknown): { number: string; hash: string } {
  if (value === null || typeof value !== "object") throw new ReadFailure("invalid-block");
  const block = value as { number?: unknown; hash?: unknown };
  try { uintQuantity(block.number); } catch { throw new ReadFailure("invalid-block"); }
  if (typeof block.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(block.hash) || /^0x0{64}$/i.test(block.hash)) throw new ReadFailure("invalid-block");
  return { number: (block.number as string).toLowerCase(), hash: block.hash.toLowerCase() };
}

export function createRpcReadAdapter(options: RpcReadOptions) {
  if (!options || typeof options.fetch !== "function" || options.now !== undefined && typeof options.now !== "function") throw new Error("invalid-rpc-options");
  const fetch = options.fetch;
  const now = options.now ?? Date.now;
  const endpoints = { ...(options.endpoints ?? DEFAULT_ENDPOINTS) };
  const limits = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const value = options[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < (key === "maxTokens" ? 0 : 1) || value > DEFAULTS[key]) throw new Error("invalid-rpc-options");
    limits[key] = value;
  }
  return { async read(input: RpcReadInput, signal?: AbortSignal): Promise<RpcReadSnapshot> {
    const started = now();
    const result: RpcReadSnapshot = { source: "evm-rpc-read", mode: "unverified", status: "blocked", exercisedReal: false,
      financiallyQualified: false, executionEnabled: false, context: { chainIndex: null,
        identityKey: null, revision: null, correlationId: null,
        blockNumber: null, blockHash: null, observedAtMs: started, expiresAtMs: started + limits.ttlMs },
      blockConsistent: false, nativeBalanceRaw: null, nativeDecimals: null,
      nativeDecimalsMethod: "native-chain-metadata", tokens: [], receipts: [], reasons: [], deployment: null, decoder: null,
      dependencies: ["router-deployment-unqualified", "complete-calldata-decoder-unqualified", "production-rpc-read-unverified"] };
    if (!validInput(input, limits.maxTokens)) { result.reasons.push("invalid-input"); return result; }
    input = { address: input.address, chainIndex: input.chainIndex, identityKey: input.identityKey,
      revision: input.revision, correlationId: input.correlationId, tokens: [...input.tokens], spender: input.spender };
    if (signal?.aborted) { result.reasons.push("read-aborted"); return result; }
    Object.assign(result.context, { chainIndex: input.chainIndex, identityKey: input.identityKey,
      revision: input.revision, correlationId: input.correlationId });
    result.nativeDecimals = chainByIndex(input.chainIndex)?.nativeDecimals ?? null;
    const endpoint = endpoints[input.chainIndex];
    let endpointHost: string;
    try {
      const url = new URL(endpoint!);
      if (url.protocol !== "https:" || url.username || url.password || url.hash
        || url.host.toLowerCase().includes(input.address.toLowerCase())) throw new Error();
      endpointHost = url.host;
    } catch { result.reasons.push("endpoint-unavailable"); return result; }
    const controller = new AbortController();
    let stopFailure: ReadFailure | null = null;
    let activeReader: { cancel(): Promise<void> } | null = null;
    let rejectStopped!: (error: ReadFailure) => void;
    const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
    // Attach immediately so an abort between RPCs cannot become an unhandled rejection.
    void stopped.catch(() => {});
    const stop = (reason: string) => {
      if (stopFailure) return;
      stopFailure = new ReadFailure(reason, true);
      controller.abort();
      if (activeReader) void activeReader.cancel().catch(() => {});
      rejectStopped(stopFailure);
    };
    const onAbort = () => stop("read-aborted");
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const timeout = setTimeout(() => stop("read-timeout"), Math.max(0, limits.timeoutMs - Math.max(0, now() - started)));
    const bounded = <T>(work: Promise<T>): Promise<T> => stopFailure ? Promise.reject(stopFailure) : Promise.race([work, stopped]);
    let totalBytes = 0;
    async function responseText(response: Response): Promise<string> {
      if (!response.body) return "";
      const reader = response.body.getReader();
      activeReader = reader;
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await bounded(reader.read());
          if (stopFailure) throw stopFailure;
          if (part.done) break;
          size += part.value.byteLength;
          totalBytes += part.value.byteLength;
          if (size > limits.maxResponseBytes) throw new ReadFailure("response-too-large", true);
          if (totalBytes > limits.maxTotalBytes) throw new ReadFailure("total-response-too-large", true);
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } finally {
        activeReader = null;
        void reader.cancel().catch(() => {});
        try { reader.releaseLock(); } catch { /* A pending, ignored reader may still own the lock. */ }
      }
    }
    let requestId = 0;
    async function rpc(method: RpcReadMethod, params: unknown[], blockNumber: string | null = null): Promise<unknown> {
      if (stopFailure) throw stopFailure;
      const receipt: RpcReadReceipt = { source: "evm-rpc-read", mode: "unverified", endpoint: endpointHost,
        httpMethod: "POST", rpcMethod: method, requestId: ++requestId, blockNumber, requestedAtMs: now(),
        receivedAtMs: null, httpStatus: null, outcome: "blocked", reason: null };
      result.receipts.push(receipt);
      try {
        const response = await bounded(fetch(endpoint!, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: receipt.requestId, method, params }), signal: controller.signal,
          cache: "no-store", redirect: "error" }).then(response => {
            if (stopFailure && response.body) void response.body.cancel().catch(() => {});
            return response;
          }));
        receipt.httpStatus = response.status;
        if (!response.ok) { if (response.body) void response.body.cancel().catch(() => {}); throw new ReadFailure("http-error"); }
        let envelope: unknown;
        try { envelope = JSON.parse(await responseText(response)); }
        catch (error) { if (error instanceof ReadFailure) throw error; throw new ReadFailure("rpc-json-invalid"); }
        if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new ReadFailure("rpc-envelope-invalid");
        const record = envelope as Record<string, unknown>;
        const hasResult = Object.hasOwn(record, "result");
        const hasError = Object.hasOwn(record, "error");
        if (record.jsonrpc !== "2.0" || record.id !== receipt.requestId || hasResult === hasError) throw new ReadFailure("rpc-envelope-invalid");
        if (hasError) {
          if (!record.error || typeof record.error !== "object" || Array.isArray(record.error)) throw new ReadFailure("rpc-envelope-invalid");
          const error = record.error as Record<string, unknown>;
          if (!Number.isSafeInteger(error.code) || typeof error.message !== "string") throw new ReadFailure("rpc-envelope-invalid");
          throw new ReadFailure("rpc-error");
        }
        receipt.outcome = "ready";
        return record.result;
      } catch (error) {
        const failure = error instanceof ReadFailure ? error : new ReadFailure("transport-error");
        receipt.reason = failure.reason;
        throw failure;
      } finally { receipt.receivedAtMs = now(); }
    }
    try {
      if (uintQuantity(await rpc("eth_chainId", [])) !== input.chainIndex) throw new ReadFailure("chain-mismatch");
      const block = readBlock(await rpc("eth_getBlockByNumber", ["latest", false]));
      result.context.blockNumber = block.number;
      result.context.blockHash = block.hash;
      result.nativeBalanceRaw = uintQuantity(await rpc("eth_getBalance", [input.address, block.number], block.number));
      for (const token of input.tokens) {
        const state: RpcReadToken = { token: token.toLowerCase(), rawBalance: null, decimals: null, decimalsMethod: "erc20-decimals",
          codeHash: null, allowanceRaw: null, allowanceRequested: input.spender !== undefined, reasons: [] };
        result.tokens.push(state);
        try {
          const code = await rpc("eth_getCode", [token, block.number], block.number);
          if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(code)) throw new ReadFailure("token-code-unavailable");
          state.codeHash = utils.keccak256(code);
        } catch (error) {
          if (error instanceof ReadFailure && error.fatal) throw error;
          state.reasons.push("token-code-unavailable");
          if (!result.reasons.includes("token-read-incomplete")) result.reasons.push("token-read-incomplete");
          continue;
        }
        const call = (data: string) => rpc("eth_call", [{ to: token, data }, block.number], block.number);
        try { state.rawBalance = uintWord(await call(`0x70a08231${addressWord(input.address)}`)); }
        catch (error) { if (error instanceof ReadFailure && error.fatal) throw error; state.reasons.push("token-balance-unavailable"); }
        try {
          const raw = uintWord(await call("0x313ce567"));
          if (BigInt(raw) > 255n) throw new ReadFailure("token-unit-invalid");
          state.decimals = Number(raw);
        } catch (error) { if (error instanceof ReadFailure && error.fatal) throw error; state.reasons.push("token-unit-invalid"); }
        if (input.spender) {
          try { state.allowanceRaw = uintWord(await call(`0xdd62ed3e${addressWord(input.address)}${addressWord(input.spender)}`)); }
          catch (error) { if (error instanceof ReadFailure && error.fatal) throw error; state.reasons.push("token-allowance-unavailable"); }
        }
        if (state.reasons.length > 0 && !result.reasons.includes("token-read-incomplete")) result.reasons.push("token-read-incomplete");
      }
      const finalBlock = readBlock(await rpc("eth_getBlockByNumber", [block.number, false], block.number));
      if (finalBlock.number !== block.number || finalBlock.hash !== block.hash) throw new ReadFailure("block-changed");
      result.blockConsistent = true;
      result.status = result.reasons.length === 0 ? "ready" : "blocked";
    } catch (error) {
      result.reasons.push(error instanceof ReadFailure ? error.reason : "read-failed");
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", onAbort); }
    if (!result.blockConsistent) {
      result.nativeBalanceRaw = null;
      for (const token of result.tokens) {
        token.rawBalance = null; token.decimals = null; token.codeHash = null; token.allowanceRaw = null;
        token.reasons.push("block-unverified");
      }
    }
    result.context.observedAtMs = now();
    result.context.expiresAtMs = result.context.observedAtMs + limits.ttlMs;
    return result;
  } };
}
