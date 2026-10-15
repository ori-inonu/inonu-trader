import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_CAPITAL_USD, MAX_RISK_PCT, createProfileStore, validProfile } from "./profile-store";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "inonu-perfil-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the profile file", () => {
  test("nothing stored is no profile", () => {
    expect(createProfileStore({ file: join(tmp(), "perfil.json") }).read()).toEqual({ capitalUsd: null, riskPct: null });
  });

  test("what is written is what is read, atomically, with no temporary file left behind", () => {
    const dir = tmp();
    const store = createProfileStore({ file: join(dir, "sub", "perfil.json") });
    expect(store.write({ capitalUsd: 2500, riskPct: 0.5 })).toBe(true);
    expect(store.read()).toEqual({ capitalUsd: 2500, riskPct: 0.5 });
    expect(readdirSync(join(dir, "sub"))).toEqual(["perfil.json"]);
    expect(JSON.parse(readFileSync(join(dir, "sub", "perfil.json"), "utf8"))).toEqual({ v: 1, capitalUsd: 2500, riskPct: 0.5 });
  });

  test("two nulls clear it", () => {
    const store = createProfileStore({ file: join(tmp(), "perfil.json") });
    store.write({ capitalUsd: 100, riskPct: 1 });
    expect(store.write({ capitalUsd: null, riskPct: null })).toBe(true);
    expect(store.read()).toEqual({ capitalUsd: null, riskPct: null });
  });

  test("a value that is not a sensible profile is refused and the old one stays", () => {
    const store = createProfileStore({ file: join(tmp(), "perfil.json") });
    store.write({ capitalUsd: 100, riskPct: 1 });
    for (const bad of [
      { capitalUsd: 0, riskPct: 1 }, { capitalUsd: -5, riskPct: 1 }, { capitalUsd: 100, riskPct: 0 }, { capitalUsd: 100, riskPct: MAX_RISK_PCT + 0.1 },
      { capitalUsd: MAX_CAPITAL_USD + 1, riskPct: 1 }, { capitalUsd: 100, riskPct: null }, { capitalUsd: null, riskPct: 1 }, { capitalUsd: Number.NaN, riskPct: 1 },
      { capitalUsd: "100", riskPct: 1 }, { capitalUsd: 100, riskPct: 1, extra: true }, { capitalUsd: 100 }, null, [], "x",
    ]) {
      expect(store.write(bad as never), JSON.stringify(bad)).toBe(false);
    }
    expect(store.read()).toEqual({ capitalUsd: 100, riskPct: 1 });
  });

  test("a damaged or foreign file reads as no profile", () => {
    const dir = tmp();
    const file = join(dir, "perfil.json");
    for (const text of ["{not json", "[]", JSON.stringify({ v: 2, capitalUsd: 100, riskPct: 1 }), JSON.stringify({ v: 1, capitalUsd: 100, riskPct: 50 }), JSON.stringify({ v: 1, capitalUsd: "x", riskPct: 1 })]) {
      writeFileSync(file, text);
      expect(createProfileStore({ file }).read(), text).toEqual({ capitalUsd: null, riskPct: null });
    }
  });

  test("a folder that cannot be written is a false, not an exception", () => {
    const dir = tmp();
    writeFileSync(join(dir, "blocker"), "x");
    expect(createProfileStore({ file: join(dir, "blocker", "inside", "perfil.json") }).write({ capitalUsd: 100, riskPct: 1 })).toBe(false);
  });

  test("validProfile is the same rule", () => {
    expect(validProfile({ capitalUsd: 1, riskPct: MAX_RISK_PCT })).toBe(true);
    expect(validProfile({ capitalUsd: null, riskPct: null })).toBe(true);
    expect(validProfile({ capitalUsd: 1, riskPct: 11 })).toBe(false);
  });
});
