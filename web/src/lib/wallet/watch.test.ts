// A public address followed in read-only. The box refuses, by shape, whatever looks like a private key or a recovery phrase. origin: synthetic_fixture, tests only
// (the addresses are made up or public; the "secrets" below are random looking strings, not real ones).
import { describe, expect, test } from "bun:test";
import { loadWatch, parseWatchInput, saveWatch, WATCH_KEY } from "./watch";

const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const SOLANA = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("parseWatchInput", () => {
  test("an EVM address is taken in lower case and a Solana address as it is, with the family that tells them apart", () => {
    expect(parseWatchInput(EVM)).toEqual({ ok: true, address: EVM.toLowerCase(), family: "evm" });
    expect(parseWatchInput(SOLANA)).toEqual({ ok: true, address: SOLANA, family: "solana" });
    expect(parseWatchInput(`  ${EVM}\n`)).toEqual({ ok: true, address: EVM.toLowerCase(), family: "evm" });
  });

  test("a private key is refused by its shape, in hex with or without 0x and as a long base58 string, and the answer says why", () => {
    const hex = "a".repeat(64);
    const keys = [hex, `0x${hex}`, "5Kb8kLf9zgWQnogidDA76MzPL6TsZZY36hWXMssSzNydYXYB9KF".padEnd(88, "k"), "A1b2C3".repeat(12)];
    for (const key of keys) {
      const r = parseWatchInput(key);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("chave privada");
    }
  });

  test("a recovery phrase, or anything with a space in it, is refused and the answer says why", () => {
    for (const phrase of [Array.from({ length: 12 }, (_, i) => `word${i}`).join(" "), "dois words", `${EVM} ${EVM}`, "x\ty"]) {
      const r = parseWatchInput(phrase);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("frase de recuperacao");
    }
  });

  test("the rest is not an address: empty, too short, too long, wrong characters", () => {
    for (const bad of ["", "   ", "0x123", `${EVM}0`, "0xZZcdEf0123456789aBcDeF0123456789AbCdEf01", "abc", "1".repeat(31), "O".repeat(40), "../etc", "x".repeat(201)]) {
      expect(parseWatchInput(bad).ok).toBe(false);
    }
  });

  test("nothing a refusal says repeats what was pasted", () => {
    const secret = "deadbeef".repeat(8);
    const r = parseWatchInput(secret);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).not.toContain("deadbeef");
  });
});

describe("storage", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  };

  test("the address is kept and read back, and stopping forgets it", () => {
    const store = memory();
    saveWatch(store, EVM.toLowerCase());
    expect(store.data.get(WATCH_KEY)).toBe(EVM.toLowerCase());
    expect(loadWatch(store)).toEqual({ address: EVM.toLowerCase(), family: "evm" });
    saveWatch(store, null);
    expect(loadWatch(store)).toBeNull();
  });

  test("whatever is in the store is read again through the same rules: a key someone put there is nothing", () => {
    const store = memory();
    store.data.set(WATCH_KEY, "a".repeat(64));
    expect(loadWatch(store)).toBeNull();
    store.data.set(WATCH_KEY, "twelve words are not an address");
    expect(loadWatch(store)).toBeNull();
  });

  test("a storage that is missing, blocked or full never breaks anything", () => {
    expect(loadWatch(null)).toBeNull();
    expect(() => saveWatch(null, EVM)).not.toThrow();
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(loadWatch(broken)).toBeNull();
    expect(() => saveWatch(broken, EVM)).not.toThrow();
  });
});
