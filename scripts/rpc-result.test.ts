import { expect, test } from "bun:test";
import { rpcHexResult } from "./rpc-result";

test("RPC probes extract only a successful literal hexadecimal result", () => {
  expect(rpcHexResult({ jsonrpc: "2.0", id: 1, result: "0xAb01" })).toBe("0xAb01");
  expect(rpcHexResult({ result: "0x0" })).toBe("0x0");
  for (const value of [null, [], {}, { result: 10 }, { result: "0x" }, { result: "1" },
    { result: "0xg" }, { result: " 0x1" }, { result: "0x1\n" }, { result: "0x1\r" },
    { error: { code: -1, message: "PRIVATE_SENTINEL" } }, { result: "0x1", error: {} }]) {
    expect(() => rpcHexResult(value)).toThrow("invalid_rpc_hex_result");
    try { rpcHexResult(value); } catch (error) { expect(String(error)).not.toContain("PRIVATE_SENTINEL"); }
  }
});
