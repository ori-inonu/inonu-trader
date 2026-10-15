// T2.2 / T2.5 / CFG-2, CFG-9: import the four secrets from the local env files into the vault. Only the four names are
// ever looked at (the .env of this machine also holds the Kuru trader's private key), and the report never shows a value.
import { describe, expect, test } from "bun:test";
import { parseAllowedEnv, provision, type ProvisionOptions } from "./provision";
import { VAULT_NAMES, type AsyncVault } from "./vault";

const S = "SENTINEL-77aa91c3e5d20b48";

function memoryVault(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const sets: string[] = [];
  const vault: AsyncVault = {
    get: async (name) => data.get(name) ?? null,
    set: async (name, value) => { sets.push(name); data.set(name, value); },
    delete: async (name) => data.delete(name),
  };
  return { vault, data, sets };
}

const files = (map: Record<string, string>): ProvisionOptions["readFile"] => (path) => map[path] ?? null;

describe("parseAllowedEnv", () => {
  test("reads plain, quoted, exported and commented values of the four names, and nothing else", () => {
    const text = [
      "# a comment",
      "OKX_WEB3_API_KEY=key-plain-12345 # trailing comment",
      "export OKX_WEB3_API_SECRET='secret-single-12345'",
      'OKX_WEB3_API_PASSPHRASE="pass-double-12345"',
      "TYPESAFE_AI_API_KEY=model-key-12345678",
      "PRIVATE_KEY=0xDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
      "LIVE_ACK=OWN_FUNDS_RISK",
      "MODEL=jev",
    ].join("\n");
    const parsed = parseAllowedEnv(text);
    expect(Object.keys(parsed.values).sort()).toEqual([...VAULT_NAMES].sort());
    expect(parsed.values.OKX_WEB3_API_KEY).toBe("key-plain-12345");
    expect(parsed.values.OKX_WEB3_API_SECRET).toBe("secret-single-12345");
    expect(parsed.values.OKX_WEB3_API_PASSPHRASE).toBe("pass-double-12345");
    expect(JSON.stringify(parsed)).not.toMatch(/DEADBEEF|OWN_FUNDS|jev/);
  });

  test("a value the vault would refuse is reported invalid, not imported", () => {
    const parsed = parseAllowedEnv("OKX_WEB3_API_KEY=short\nOKX_WEB3_API_SECRET='has'quote-12345'");
    expect(parsed.values).toEqual({});
    expect(parsed.invalid.sort()).toEqual(["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET"]);
  });

  test("an unexpanded ${NAME} reference is a placeholder, not a key: invalid, never imported", () => {
    const parsed = parseAllowedEnv("TYPESAFE_AI_API_KEY=${TYPESAFE_AI_KEY}\nOKX_WEB3_API_KEY=\"${SOME_OTHER_VAR_123}\"");
    expect(parsed.values).toEqual({});
    expect(parsed.invalid.sort()).toEqual(["OKX_WEB3_API_KEY", "TYPESAFE_AI_API_KEY"]);
    // a real value that merely contains a dollar sign is still a value
    expect(parseAllowedEnv("OKX_WEB3_API_KEY=ab${cd}ef-123456").values.OKX_WEB3_API_KEY).toBe("ab${cd}ef-123456");
  });

  test("the store's own escape for a dollar sign is undone", () => {
    expect(parseAllowedEnv("OKX_WEB3_API_KEY='abc\\$def-12345'").values.OKX_WEB3_API_KEY).toBe("abc$def-12345");
  });
});

describe("provision", () => {
  const sources = ["data/onchainos.env", "data/jev.env", ".env"];
  const all = files({
    "data/onchainos.env": "OKX_WEB3_API_KEY=okx-key-" + S + "\nOKX_WEB3_API_SECRET=okx-secret-" + S + "\nOKX_WEB3_API_PASSPHRASE=okx-pass-" + S,
    ".env": "TYPESAFE_AI_API_KEY=model-" + S + "\nPRIVATE_KEY=0xDEADBEEFDEADBEEFDEADBEEFDEADBEEF\nLIVE_ACK=OWN_FUNDS_RISK",
  });

  test("imports each of the four from the first source that has it and writes only those names", async () => {
    const m = memoryVault();
    const report = await provision({ sources, vault: m.vault, readFile: all });
    expect(m.sets.sort()).toEqual([...VAULT_NAMES].sort());
    expect(m.data.get("OKX_WEB3_API_KEY")).toBe("okx-key-" + S);
    expect(m.data.has("PRIVATE_KEY")).toBe(false);
    expect(report.entries.map((e) => [e.name, e.outcome, e.source])).toEqual([
      ["OKX_WEB3_API_KEY", "imported", "data/onchainos.env"],
      ["OKX_WEB3_API_SECRET", "imported", "data/onchainos.env"],
      ["OKX_WEB3_API_PASSPHRASE", "imported", "data/onchainos.env"],
      ["TYPESAFE_AI_API_KEY", "imported", ".env"],
    ]);
  });

  test("the report never contains a value: only a tail for the two key ids", async () => {
    const report = await provision({ sources, vault: memoryVault().vault, readFile: all });
    const text = JSON.stringify(report);
    expect(text).not.toContain("SENTINEL");
    expect(text).not.toMatch(/DEADBEEF|OWN_FUNDS/);
    const byName = Object.fromEntries(report.entries.map((e) => [e.name, e]));
    expect(byName.OKX_WEB3_API_KEY!.last4).toBe(("okx-key-" + S).slice(-4));
    expect(byName.TYPESAFE_AI_API_KEY!.last4).toBe(("model-" + S).slice(-4));
    expect(byName.OKX_WEB3_API_SECRET!.last4).toBeNull();
    expect(byName.OKX_WEB3_API_PASSPHRASE!.last4).toBeNull();
  });

  test("an earlier source wins over a later one for the same name", async () => {
    const m = memoryVault();
    await provision({ sources: ["a.env", "b.env"], vault: m.vault, readFile: files({ "a.env": "OKX_WEB3_API_KEY=from-a-12345678", "b.env": "OKX_WEB3_API_KEY=from-b-12345678" }) });
    expect(m.data.get("OKX_WEB3_API_KEY")).toBe("from-a-12345678");
  });

  test("a value already in the vault is kept unless force is given", async () => {
    const m = memoryVault({ OKX_WEB3_API_KEY: "already-in-the-vault" });
    const kept = await provision({ sources, vault: m.vault, readFile: all });
    expect(kept.entries[0]).toMatchObject({ name: "OKX_WEB3_API_KEY", outcome: "already" });
    expect(m.data.get("OKX_WEB3_API_KEY")).toBe("already-in-the-vault");
    const forced = await provision({ sources, vault: m.vault, readFile: all, force: true });
    expect(forced.entries[0]).toMatchObject({ outcome: "imported" });
    expect(m.data.get("OKX_WEB3_API_KEY")).toBe("okx-key-" + S);
  });

  test("dry-run writes nothing and says what it would do", async () => {
    const m = memoryVault();
    const report = await provision({ sources, vault: m.vault, readFile: all, dryRun: true });
    expect(m.sets).toEqual([]);
    expect(report.entries.every((e) => e.outcome === "would_import")).toBe(true);
  });

  test("a missing source and a name that no source has are reported, not errors", async () => {
    const m = memoryVault();
    const report = await provision({ sources: ["nope.env"], vault: m.vault, readFile: files({}) });
    expect(report.entries.every((e) => e.outcome === "missing")).toBe(true);
    expect(m.sets).toEqual([]);
  });

  test("a failing vault write is reported as failed for that name and the others still go", async () => {
    const m = memoryVault();
    const real = m.vault.set;
    m.vault.set = async (name, value) => { if (name === "OKX_WEB3_API_SECRET") throw new Error("boom " + S); return real(name, value); };
    const report = await provision({ sources, vault: m.vault, readFile: all });
    const outcomes = Object.fromEntries(report.entries.map((e) => [e.name, e.outcome]));
    expect(outcomes).toEqual({ OKX_WEB3_API_KEY: "imported", OKX_WEB3_API_SECRET: "failed", OKX_WEB3_API_PASSPHRASE: "imported", TYPESAFE_AI_API_KEY: "imported" });
    expect(JSON.stringify(report)).not.toContain("boom");
  });
});
