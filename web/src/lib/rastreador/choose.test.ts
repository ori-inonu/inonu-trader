// RAS-6: the rows a person ticks in the Rastreador to ask Inonu to rank them. Two to five, never more: ten rows would cost about twenty
// model and exchange reads, over the cap of a click. The choice is kept as ids, not as rows, so a refresh of the table (a price that
// moved, a filter that took the row out of view) does not lose it. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { CHOOSE_MAX, CHOOSE_MIN, canRank, chosenIds, chosenLine, rankingSubjectOf, toggleChosen } from "./choose";

describe("ticking rows (RAS-6)", () => {
  test("a row is ticked, and ticked again takes it back out; the order of ticking is kept", () => {
    let chosen: readonly string[] = [];
    chosen = toggleChosen(chosen, "BTC-USDT");
    chosen = toggleChosen(chosen, "ETH-USDT");
    expect(chosen).toEqual(["BTC-USDT", "ETH-USDT"]);
    expect(toggleChosen(chosen, "BTC-USDT")).toEqual(["ETH-USDT"]);
  });

  test("never more than five: the sixth tick changes nothing, and the same list comes back so the screen can say why", () => {
    expect(CHOOSE_MIN).toBe(2);
    expect(CHOOSE_MAX).toBe(5);
    const five = ["A-USDT", "B-USDT", "C-USDT", "D-USDT", "E-USDT"];
    expect(toggleChosen(five, "F-USDT")).toBe(five);
    // taking one out is always allowed, and then the sixth fits
    expect(toggleChosen(toggleChosen(five, "A-USDT"), "F-USDT")).toEqual(["B-USDT", "C-USDT", "D-USDT", "E-USDT", "F-USDT"]);
  });

  test("the list is never changed in place", () => {
    const before = Object.freeze(["BTC-USDT"]);
    expect(toggleChosen(before, "ETH-USDT")).toEqual(["BTC-USDT", "ETH-USDT"]);
    expect(before).toEqual(["BTC-USDT"]);
  });
});

describe("what can be asked (RAS-6)", () => {
  test("a ranking needs two rows at least: one row is a click on that row, not a ranking", () => {
    expect(canRank([])).toBe(false);
    expect(canRank(["BTC-USDT"])).toBe(false);
    expect(canRank(["BTC-USDT", "ETH-USDT"])).toBe(true);
    expect(canRank(["A-USDT", "B-USDT", "C-USDT", "D-USDT", "E-USDT"])).toBe(true);
    expect(canRank(["A-USDT", "B-USDT", "C-USDT", "D-USDT", "E-USDT", "F-USDT"])).toBe(false);
  });

  test("the choice is checked against the whole universe, not the filtered table: a filter that hides a ticked row keeps it, a pair the exchange no longer lists drops out", () => {
    const universe = [{ id: "BTC-USDT" }, { id: "ETH-USDT" }];
    expect(chosenIds(["ETH-USDT", "SOL-USDT"], universe)).toEqual(["ETH-USDT"]);
    expect(chosenIds(["ETH-USDT", "BTC-USDT"], universe)).toEqual(["ETH-USDT", "BTC-USDT"]);
    expect(chosenIds([], universe)).toEqual([]);
    // while the universe has not arrived nothing is dropped: the table is empty, not the choice
    expect(chosenIds(["ETH-USDT"], null)).toEqual(["ETH-USDT"]);
  });

  test("while one of the two lists did not arrive, the rows of that market are kept: they are not gone, the exchange just did not answer for them", () => {
    const universe = [{ id: "BTC-USDT" }];
    expect(chosenIds(["BTC-USDT", "ETH-USDT-SWAP"], universe, "perp")).toEqual(["BTC-USDT", "ETH-USDT-SWAP"]);
    // the market that did arrive is still checked: a spot pair that is not in it is gone
    expect(chosenIds(["BTC-USDT", "ETH-USDT-SWAP", "XYZ-USDT"], universe, "perp")).toEqual(["BTC-USDT", "ETH-USDT-SWAP"]);
    expect(chosenIds(["BTC-USDT", "XYZ-USDT", "ETH-USDT-SWAP"], [{ id: "ETH-USDT-SWAP" }], "spot")).toEqual(["BTC-USDT", "XYZ-USDT", "ETH-USDT-SWAP"]);
    expect(chosenIds(["BTC-USDT", "ETH-USDT-SWAP"], universe, null)).toEqual(["BTC-USDT"]);
  });

  test("the line under the section counts the rows and says what is missing or that the limit was reached", () => {
    expect(chosenLine(1)).toBe("1 de 5 linhas escolhidas. Falta pelo menos uma para ranquear");
    expect(chosenLine(2)).toBe("2 de 5 linhas escolhidas");
    expect(chosenLine(4)).toBe("4 de 5 linhas escolhidas");
    expect(chosenLine(5)).toBe("5 de 5 linhas escolhidas. Limite de 5 por pedido");
  });

  test("the subject of the ranking carries the ids in the order they were ticked, and is null when there is nothing to rank", () => {
    expect(rankingSubjectOf(["ETH-USDT", "BTC-USDT"])).toEqual({ kind: "ranking", instIds: ["ETH-USDT", "BTC-USDT"] });
    expect(rankingSubjectOf(["ETH-USDT"])).toBeNull();
    expect(rankingSubjectOf([])).toBeNull();
  });
});
