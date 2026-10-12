import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadOperatorConfig, operatorLiveGate } from "./config";

// The shared template is read as text; nothing here reads .env or the process environment.
const EXAMPLE = readFileSync(join(import.meta.dir, "..", "..", ".env.example"), "utf8");

/** The assignments that are really on: lines that do not start with a comment mark. */
function activeAssignments(text: string): Map<string, string> {
  const active = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) active.set(match[1]!, match[2]!.trim());
  }
  return active;
}

test("the shared example keeps no active Solana key line: the Solana execution is off and nothing reads the key (R8 F1)", () => {
  const active = activeAssignments(EXAMPLE);
  expect(active.has("SOLANA_PRIVATE_KEY")).toBe(false);
  // A line that anyone can copy into .env must not invite pasting a secret that nothing uses.
  expect(EXAMPLE.split(/\r?\n/).filter((line) => /^\s*SOLANA_PRIVATE_KEY\s*=/.test(line))).toEqual([]);
  // The commented hint stays, so the variable is still documented for the day a transaction policy exists.
  expect(EXAMPLE).toContain("# SOLANA_PRIVATE_KEY=");
});

test("the active lines of the example load as a valid operator config with the Solana key absent and the live gate closed", () => {
  const active = Object.fromEntries(activeAssignments(EXAMPLE));
  const config = loadOperatorConfig(active);
  expect(config.solanaSecret).toBeNull();
  expect(config.execute).toBe(false);
  expect(config.liveAck).toBe(false);
  expect(config.evmPrivateKey).toBeNull();
  expect(config.trustQuoteUnits).toBe(false);
  expect(config.trustBridgeApi).toBe(false);
  const gate = operatorLiveGate(config, "jev-latest");
  expect(gate.live).toBe(false);
  expect(gate.reasons).toEqual(["OPERATOR_EXECUTE is not true", "OPERATOR_LIVE_ACK is not OWN_FUNDS_RISK_OPERATOR", "OPERATOR_PRIVATE_KEY is not set"]);
  // Loading without the Solana line, as the shipped example now does, gives the same result as the old empty line.
  expect(loadOperatorConfig({ ...active, SOLANA_PRIVATE_KEY: "" })).toEqual(config);
});

test("the shared example ships every execution gate closed and no secret value", () => {
  const active = activeAssignments(EXAMPLE);
  expect(active.get("OPERATOR_EXECUTE")).toBe("false");
  expect(active.get("OPERATOR_LIVE_ACK")).toBe("");
  expect(active.get("LIVE_ACK")).toBe("");
  expect(active.get("DRY_RUN")).toBe("true");
  expect(active.get("OPERATOR_TRUST_QUOTE_UNITS")).toBe("false");
  expect(active.get("OPERATOR_TRUST_BRIDGE_API")).toBe("false");
  for (const [name, value] of active) {
    if (/(KEY|SECRET|PASSPHRASE|TOKEN)$/.test(name)) expect({ name, value }).toEqual({ name, value: "" });
  }
});
