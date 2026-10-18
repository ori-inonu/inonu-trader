export interface WalletTransactionProposal {
  readonly version: 1;
  readonly planId: string;
  readonly quoteHash: string;
  readonly chainId: "0x8f" | "0xc4";
  readonly from: string;
  readonly to: string;
  readonly data: string;
  readonly valueAtomic: string;
  readonly gasLimitAtomic: string;
  readonly maxFeePerGasAtomic: string;
  readonly maxPriorityFeePerGasAtomic: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export type WalletTransactionPreflightResult =
  | { readonly status: "ready_for_review"; readonly executionQualified: false; readonly proposal: WalletTransactionProposal; readonly observedAtMs: number }
  | { readonly status: "blocked"; readonly executionQualified: false; readonly reason: string };

const fields = ["version", "planId", "quoteHash", "chainId", "from", "to", "data", "valueAtomic", "gasLimitAtomic", "maxFeePerGasAtomic", "maxPriorityFeePerGasAtomic", "createdAtMs", "expiresAtMs"] as const;
const UINT256_MAX = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const blocked = (reason = "invalid_proposal"): WalletTransactionPreflightResult => ({ status: "blocked", reason, executionQualified: false });

export function validateWalletTransactionProposal(input: unknown, nowMs: number): WalletTransactionPreflightResult {
  try {
    if (input === null || typeof input !== "object") return blocked();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return blocked();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some(key => typeof key !== "string" || !fields.includes(key as typeof fields[number]))) return blocked();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const capturedKeys = Reflect.ownKeys(descriptors);
    if (capturedKeys.length !== keys.length || capturedKeys.some(key => !keys.includes(key))) return blocked();
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor)) return blocked();
      values[field] = descriptor.value;
    }
    const source = values as unknown as WalletTransactionProposal;
    const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}(?![\s\S])/.test(value) && !/^0x0{40}(?![\s\S])/.test(value);
    const label = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128;
    if (source.version !== 1 || !label(source.planId) || !label(source.quoteHash) || (source.chainId !== "0x8f" && source.chainId !== "0xc4") || !address(source.from) || !address(source.to) || typeof source.data !== "string" || source.data.length > 131074 || !/^0x(?:[0-9a-fA-F]{2})*(?![\s\S])/.test(source.data)) return blocked();
    const amounts = [source.valueAtomic, source.gasLimitAtomic, source.maxFeePerGasAtomic, source.maxPriorityFeePerGasAtomic];
    if (amounts.some(value => typeof value !== "string" || value.length > 78 || !/^(?:0|[1-9][0-9]*)(?![\s\S])/.test(value))) return blocked();
    const [value, gas, fee, priority] = amounts.map(value => BigInt(value));
    if (amounts.some(amount => BigInt(amount) > UINT256_MAX) || gas <= BigInt(0) || fee <= BigInt(0) || priority > fee || gas * fee > UINT256_MAX || value + gas * fee > UINT256_MAX) return blocked();
    const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    if (!timestamp(source.createdAtMs) || !timestamp(source.expiresAtMs) || source.createdAtMs >= source.expiresAtMs) return blocked();
    if (!timestamp(nowMs)) return blocked("invalid_clock");
    if (nowMs < source.createdAtMs) return blocked("not_yet_valid");
    if (nowMs >= source.expiresAtMs) return blocked("expired");
    const proposal = Object.freeze({ ...source, from: source.from.toLowerCase(), to: source.to.toLowerCase(), data: source.data.toLowerCase() });
    return { status: "ready_for_review", executionQualified: false, proposal, observedAtMs: nowMs };
  } catch { return blocked(); }
}
