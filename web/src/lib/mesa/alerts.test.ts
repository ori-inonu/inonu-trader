import { describe, expect, test } from "bun:test";
import { FORBIDDEN_TEXT } from "./mesa-model";
import {
  ALERTS_KEY,
  alertProblemText,
  alertState,
  clearFired,
  createAlert,
  describeAlert,
  evaluateAlerts,
  levelPreview,
  markSeen,
  MAX_ALERTS,
  normalizeAlerts,
  parseLevel,
  priceMap,
  readStoredAlerts,
  removeAlert,
  unseenCount,
  writeStoredAlerts,
  type PriceAlert,
} from "./alerts";

const NOW = 1_791_742_100_000;
const waiting = (over: Partial<PriceAlert> = {}): PriceAlert => ({ id: "a1", instId: "BTC-USDT", level: 83_000, direction: "above", createdAtMs: NOW, firedAtMs: null, firedPrice: null, seen: true, ...over });
const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
};

describe("parseLevel reads a price the way a Brazilian reads it", () => {
  test("comma is the decimal mark and dots group thousands", () => {
    expect(parseLevel("82600")).toBe(82_600);
    expect(parseLevel("82.600,5")).toBe(82_600.5);
    expect(parseLevel("1.234.567")).toBe(1_234_567);
    expect(parseLevel("0,0000012")).toBe(0.0000012);
    expect(parseLevel("  1.234,56  ")).toBe(1_234.56);
  });

  test("without a comma a single dot is a decimal mark, so 82.600 is 82,6 and the preview shows it", () => {
    expect(parseLevel("82600.5")).toBe(82_600.5);
    expect(parseLevel("82.600")).toBe(82.6);
    expect(parseLevel("0.0123")).toBe(0.0123);
  });

  test("anything that is not a plain positive price is refused", () => {
    for (const text of ["", " ", "abc", "-5", "0", "0,0", "1e9", "1,2,3", "NaN", "Infinity", "82.600,5.1", "1..2", "1,", ",5", "99999999999999"]) expect(parseLevel(text)).toBeNull();
  });
});

describe("createAlert", () => {
  test("the direction comes from the last price: above when the level is higher, below when lower", () => {
    const up = createAlert({ instId: "BTC-USDT", text: "83000", last: 82_500, nowMs: NOW, existing: [] });
    expect(up.ok && up.alert).toMatchObject({ instId: "BTC-USDT", level: 83_000, direction: "above", firedAtMs: null, firedPrice: null, seen: true, createdAtMs: NOW });
    const down = createAlert({ instId: "BTC-USDT", text: "82000", last: 82_500, nowMs: NOW, existing: [] });
    expect(down.ok && down.alert.direction).toBe("below");
  });

  test("without a known price there is no alert, and an unknown price is never taken as zero", () => {
    for (const last of [null, undefined, Number.NaN, 0, -1]) {
      const result = createAlert({ instId: "BTC-USDT", text: "82000", last, nowMs: NOW, existing: [] });
      expect(result).toEqual({ ok: false, problem: "preco-indisponivel" });
    }
  });

  test("it says why it refused: bad level, level equal to the price, a copy already waiting, too many", () => {
    expect(createAlert({ instId: "BTC-USDT", text: "abc", last: 82_500, nowMs: NOW, existing: [] })).toEqual({ ok: false, problem: "nivel-invalido" });
    expect(createAlert({ instId: "BTC-USDT", text: "82500", last: 82_500, nowMs: NOW, existing: [] })).toEqual({ ok: false, problem: "nivel-igual" });
    expect(createAlert({ instId: "BTC-USDT", text: "83000", last: 82_500, nowMs: NOW, existing: [waiting()] })).toEqual({ ok: false, problem: "duplicado" });
    const full = Array.from({ length: MAX_ALERTS }, (_, i) => waiting({ id: `a${i}`, level: 90_000 + i }));
    expect(createAlert({ instId: "BTC-USDT", text: "83000", last: 82_500, nowMs: NOW, existing: full })).toEqual({ ok: false, problem: "limite" });
  });

  test("a fired copy does not block a new alert at the same level, and ids stay unique", () => {
    const fired = waiting({ firedAtMs: NOW, firedPrice: 83_010 });
    const again = createAlert({ instId: "BTC-USDT", text: "83000", last: 82_500, nowMs: NOW, existing: [fired] });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.alert.id).not.toBe(fired.id);
  });

  test("every refusal has words, and no word carries a forbidden character", () => {
    for (const problem of ["preco-indisponivel", "nivel-invalido", "nivel-igual", "duplicado", "limite"] as const) {
      expect(alertProblemText(problem).length).toBeGreaterThan(10);
      expect(alertProblemText(problem)).not.toMatch(FORBIDDEN_TEXT);
    }
  });
});

describe("levelPreview tells what the field will do before anything is created", () => {
  test("empty, invalid, no price, equal and ok", () => {
    expect(levelPreview("", 82_500).kind).toBe("empty");
    expect(levelPreview("abc", 82_500).kind).toBe("invalido");
    expect(levelPreview("83000", null).kind).toBe("sem-preco");
    expect(levelPreview("82500", 82_500).kind).toBe("igual");
    const ok = levelPreview("83.325", 82_500);
    expect(ok.kind).toBe("ok");
  });

  test("it reports direction and distance, and flags a level far from the price", () => {
    const up = levelPreview("90000", 82_500);
    expect(up).toMatchObject({ kind: "ok", direction: "above", far: false });
    expect(up.distancePct).toBeCloseTo((90_000 / 82_500 - 1) * 100, 6);
    const down = levelPreview("41000", 82_500);
    expect(down).toMatchObject({ kind: "ok", direction: "below", far: true });
    expect(levelPreview("82.600", 82_500)).toMatchObject({ kind: "ok", direction: "below", far: true });
  });
});

describe("evaluateAlerts", () => {
  test("an alert above fires when the price reaches the level, an alert below when it falls to it", () => {
    const alerts = [waiting({ id: "up", level: 83_000, direction: "above" }), waiting({ id: "down", level: 82_000, direction: "below" })];
    expect(evaluateAlerts(alerts, { "BTC-USDT": 82_999.9 }, NOW).fired).toEqual([]);
    const up = evaluateAlerts(alerts, { "BTC-USDT": 83_000 }, NOW);
    expect(up.fired.map((a) => a.id)).toEqual(["up"]);
    expect(up.alerts.find((a) => a.id === "up")).toMatchObject({ firedAtMs: NOW, firedPrice: 83_000, seen: false });
    const down = evaluateAlerts(alerts, { "BTC-USDT": 81_900 }, NOW);
    expect(down.fired.map((a) => a.id)).toEqual(["down"]);
    expect(down.alerts.find((a) => a.id === "down")?.firedPrice).toBe(81_900);
  });

  test("it fires once: a fired alert is not evaluated again", () => {
    const first = evaluateAlerts([waiting()], { "BTC-USDT": 83_500 }, NOW);
    const second = evaluateAlerts(first.alerts, { "BTC-USDT": 84_000 }, NOW + 1_000);
    expect(second.fired).toEqual([]);
    expect(second.alerts[0].firedAtMs).toBe(NOW);
    expect(second.alerts[0].firedPrice).toBe(83_500);
  });

  test("an unknown price evaluates nothing, and a symbol without a price stays waiting", () => {
    const alerts = [waiting({ direction: "below", level: 1 })];
    for (const price of [null, undefined, Number.NaN, 0, -3]) {
      const result = evaluateAlerts(alerts, { "BTC-USDT": price as number | null }, NOW);
      expect(result.fired).toEqual([]);
      expect(result.alerts).toBe(alerts);
    }
    expect(evaluateAlerts(alerts, { "ETH-USDT": 2_000 }, NOW).fired).toEqual([]);
  });

  test("an alert only listens to its own instrument", () => {
    const alerts = [waiting({ instId: "ETH-USDT", level: 2_600, direction: "above" })];
    expect(evaluateAlerts(alerts, { "BTC-USDT": 99_999, "ETH-USDT": 2_500 }, NOW).fired).toEqual([]);
    expect(evaluateAlerts(alerts, { "BTC-USDT": 1, "ETH-USDT": 2_601 }, NOW).fired).toHaveLength(1);
  });

  test("when nothing fires the very same array comes back, so a state update is a no-op", () => {
    const alerts = [waiting()];
    expect(evaluateAlerts(alerts, { "BTC-USDT": 82_000 }, NOW).alerts).toBe(alerts);
  });
});

describe("list handling", () => {
  test("unseenCount and markSeen only look at fired alerts the user has not seen", () => {
    const list = [waiting({ id: "a" }), waiting({ id: "b", firedAtMs: NOW, firedPrice: 83_001, seen: false }), waiting({ id: "c", firedAtMs: NOW, firedPrice: 83_002, seen: true })];
    expect(unseenCount(list)).toBe(1);
    const seen = markSeen(list);
    expect(unseenCount(seen)).toBe(0);
    expect(markSeen(seen)).toBe(seen);
  });

  test("remove drops one alert, clearFired drops only the fired ones", () => {
    const list = [waiting({ id: "a" }), waiting({ id: "b", firedAtMs: NOW, firedPrice: 83_001, seen: true })];
    expect(removeAlert(list, "a").map((a) => a.id)).toEqual(["b"]);
    expect(removeAlert(list, "zzz")).toBe(list);
    expect(clearFired(list).map((a) => a.id)).toEqual(["a"]);
    expect(clearFired([waiting()])).toHaveLength(1);
  });

  test("describeAlert says the instrument, the direction and the level in pt-BR, and the fire when it happened", () => {
    expect(describeAlert(waiting({ level: 82_600 }))).toBe("BTC-USDT acima de 82.600,00");
    expect(describeAlert(waiting({ direction: "below", level: 0.0123 }))).toBe("BTC-USDT abaixo de 0,012300");
    const fired = describeAlert(waiting({ firedAtMs: Date.UTC(2026, 9, 12, 17, 2, 11), firedPrice: 83_001.2 }));
    expect(fired).toBe("BTC-USDT acima de 83.000,00, disparou em 83.001,20 as 17:02:11 UTC");
    for (const text of [describeAlert(waiting()), fired]) expect(text).not.toMatch(FORBIDDEN_TEXT);
  });
});

describe("alertState", () => {
  test("a waiting alert says the current price, or that there is none; a fired one says price and time", () => {
    expect(alertState(waiting(), 82_500)).toBe("Esperando, preco atual 82.500,00");
    expect(alertState(waiting(), null)).toBe("Esperando, sem preco agora");
    expect(alertState(waiting(), undefined)).toBe("Esperando, sem preco agora");
    expect(alertState(waiting(), 0)).toBe("Esperando, sem preco agora");
    expect(alertState(waiting({ firedAtMs: Date.UTC(2026, 9, 12, 17, 2, 11), firedPrice: 83_001.2 }), 82_000)).toBe("Disparou em 83.001,20 as 17:02:11 UTC");
    for (const text of [alertState(waiting(), 82_500), alertState(waiting(), null)]) expect(text).not.toMatch(FORBIDDEN_TEXT);
  });
});

describe("storage", () => {
  test("a corrupt or foreign value never breaks the page and malformed entries are dropped", () => {
    expect(normalizeAlerts("nope")).toEqual([]);
    expect(normalizeAlerts(null)).toEqual([]);
    const good = waiting();
    const raw = [good, { ...good, id: "" }, { ...good, id: "b", instId: "btc usdt" }, { ...good, id: "c", level: -1 }, { ...good, id: "d", direction: "sideways" }, { ...good, id: "e", level: "83000" }, { ...good, id: "f", firedAtMs: 5, firedPrice: null }, 42, null];
    expect(normalizeAlerts(raw)).toEqual([good]);
  });

  test("it keeps at most MAX_ALERTS and ids stay unique", () => {
    const many = Array.from({ length: MAX_ALERTS + 5 }, (_, i) => waiting({ id: `a${i}`, level: 90_000 + i }));
    expect(normalizeAlerts(many)).toHaveLength(MAX_ALERTS);
    expect(normalizeAlerts([waiting(), waiting()])).toHaveLength(1);
  });

  test("writes and reads back through a storage, and tolerates one that throws", () => {
    const storage = memoryStorage();
    const list = [waiting(), waiting({ id: "b", firedAtMs: NOW, firedPrice: 83_001, seen: false })];
    writeStoredAlerts(list, storage);
    expect(storage.data.has(ALERTS_KEY)).toBe(true);
    expect(readStoredAlerts(storage)).toEqual(list);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readStoredAlerts(blocked)).toEqual([]);
    expect(() => writeStoredAlerts(list, blocked)).not.toThrow();
    expect(readStoredAlerts(null)).toEqual([]);
    storage.data.set(ALERTS_KEY, "{not json");
    expect(readStoredAlerts(storage)).toEqual([]);
  });
});

describe("priceMap", () => {
  const row = (instId: string, last: number | null) => ({ instId, ticker: last === null ? null : { last } });

  test("takes the watchlist rows and lets the focused instrument's own last price win", () => {
    const prices = priceMap([row("BTC-USDT", 82_000), row("ETH-USDT", 2_500)], "BTC-USDT", 82_100);
    expect(prices).toEqual({ "BTC-USDT": 82_100, "ETH-USDT": 2_500 });
  });

  test("an unknown price stays null, never zero", () => {
    const prices = priceMap([row("ETH-USDT", null), row("SOL-USDT", Number.NaN), row("OKB-USDT", 0)], "BTC-USDT", null);
    expect(prices).toEqual({ "ETH-USDT": null, "SOL-USDT": null, "OKB-USDT": null, "BTC-USDT": null });
  });
});
