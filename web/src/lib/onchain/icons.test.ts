// ICO-1 to ICO-3: which currency icon belongs to what the desk draws. Pure: the picture itself is fetched by the local core.
import { describe, expect, test } from "bun:test";
import { ICON_PATH, chainIconSymbol, iconUrl, instrumentIconSymbol } from "./icons";

describe("iconUrl", () => {
  test("is a path on the desk's own origin, lowercase, with the symbol encoded", () => {
    expect(iconUrl("BTC", "")).toBe(`${ICON_PATH}btc`);
    expect(iconUrl("Okb", "http://127.0.0.1:47321")).toBe("http://127.0.0.1:47321/inonu/icon/okb");
    expect(iconUrl("a/b", "")).toBe(`${ICON_PATH}a%2Fb`);
  });

  test("an empty or unusable symbol has no icon", () => {
    expect(iconUrl("", "")).toBeNull();
    expect(iconUrl("   ", "")).toBeNull();
    expect(iconUrl("x".repeat(40), "")).toBeNull();
  });
});

describe("instrumentIconSymbol", () => {
  test("the base currency of a spot pair, a perpetual or a future", () => {
    expect(instrumentIconSymbol("BTC-USDT")).toBe("btc");
    expect(instrumentIconSymbol("ETH-USDT-SWAP")).toBe("eth");
    expect(instrumentIconSymbol("SOL-USD-250627")).toBe("sol");
  });

  test("anything that is not an instrument id has none", () => {
    expect(instrumentIconSymbol("")).toBeNull();
    expect(instrumentIconSymbol("btc")).toBeNull();
    expect(instrumentIconSymbol("BTC USDT")).toBeNull();
  });
});

describe("chainIconSymbol", () => {
  test("a network is drawn with the icon of its native currency", () => {
    expect(chainIconSymbol("196", "XL")).toBe("okb");
    expect(chainIconSymbol("1", "ETH")).toBe("eth");
    expect(chainIconSymbol("501", "SOL")).toBe("sol");
    expect(chainIconSymbol("0", "BTC")).toBe("btc");
    expect(chainIconSymbol("56", "BNB")).toBe("bnb");
    expect(chainIconSymbol("195", "TRX")).toBe("trx");
    expect(chainIconSymbol("784", "SUI")).toBe("sui");
    expect(chainIconSymbol("8453", "BASE")).toBe("eth");
  });

  test("the layer 2 networks that pay gas in ETH, and the other known natives", () => {
    for (const chain of ["10", "42161", "59144", "324", "534352", "81457", "1101"]) expect(chainIconSymbol(chain, "L2")).toBe("eth");
    expect(chainIconSymbol("137", "POL")).toBe("pol");
    expect(chainIconSymbol("43114", "AVAX")).toBe("avax");
    expect(chainIconSymbol("637", "APT")).toBe("apt");
    expect(chainIconSymbol("607", "TON")).toBe("ton");
  });

  test("a network that is not in the table shows its letters: its badge is never guessed as a currency, because a different coin can have the same letters", () => {
    expect(chainIconSymbol("5042", "ARC")).toBeNull(); // the Arc network, not the ARC token
    expect(chainIconSymbol("4663", "RH")).toBeNull();
    expect(chainIconSymbol("999", "?")).toBeNull();
    expect(chainIconSymbol("999", "")).toBeNull();
  });
});
