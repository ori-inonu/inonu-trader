import { expect, test } from "bun:test";
import { ownOutput, walletBinding } from "./execution-review";

test("a receipt auditor cannot create its own files inside the financial home", () => {
  const home = "C:/Users/gabri/financial-home";
  expect(ownOutput(home, home)).toBe(false);
  expect(ownOutput(home, home + "/data/agent")).toBe(false);
  expect(ownOutput(home, home + "/logs/../data")).toBe(false);
  expect(ownOutput(home, "C:/Users/gabri/jev-trader/data/decision-review")).toBe(true);
});

test("configuration supplies only an explicit managed wallet binding, never a watched address or a secret", () => {
  expect(walletBinding({ managed: { kind: "agentica", solana: "A".repeat(44) }, secret: "synthetic" })).toEqual({ wallet: "A".repeat(44), kind: "agente" });
  expect(walletBinding({ watch: { solana: "A".repeat(44) } })).toBeNull();
  expect(walletBinding({ managed: { kind: "unknown", solana: "A".repeat(44) } })).toBeNull();
});
