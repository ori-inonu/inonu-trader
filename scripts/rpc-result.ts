/** Validate probe JSON without trusting its shape, coercing values, or exposing error bodies. */
export function rpcHexResult(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("result" in value) || "error" in value) {
    throw new Error("invalid_rpc_hex_result");
  }
  const result = value.result;
  if (typeof result !== "string" || result !== result.trim() || !/^0x[0-9a-fA-F]+$/u.test(result)) {
    throw new Error("invalid_rpc_hex_result");
  }
  return result;
}
