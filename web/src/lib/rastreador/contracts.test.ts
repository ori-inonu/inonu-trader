// FLX-11, DAT-1: a perpetual's volume on the exchange is in CONTRACTS. In US dollars it is contracts times the size of one contract
// (ctVal times ctMult, in coin) times the price, and the size comes from the exchange's own list of instruments; without it the
// volume is unknown (null), never a guess. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { CONTRACTS_URL, createContractReader, parseContracts } from "./contracts";

const row = (over: Record<string, unknown> = {}) => ({ instId: "BTC-USDT-SWAP", instType: "SWAP", ctVal: "0.01", ctMult: "1", ctType: "linear", ctValCcy: "BTC", settleCcy: "USDT", ...over });

describe("parseContracts", () => {
  test("the size of one contract in coin is ctVal times ctMult, for the linear USDT perpetuals", () => {
    const sizes = parseContracts([row(), row({ instId: "ETH-USDT-SWAP", ctVal: "0.1" }), row({ instId: "DOGE-USDT-SWAP", ctVal: "1000", ctMult: "2" })]);
    expect(sizes.get("BTC-USDT-SWAP")).toBe(0.01);
    expect(sizes.get("ETH-USDT-SWAP")).toBe(0.1);
    expect(sizes.get("DOGE-USDT-SWAP")).toBe(2000);
  });

  test("a coin margined contract, another quote, a bad number or a row that is not a row is left out, not guessed", () => {
    const sizes = parseContracts([
      row({ instId: "BTC-USD-SWAP", ctType: "inverse" }),
      row({ instId: "BTC-USDC-SWAP", settleCcy: "USDC" }),
      row({ instId: "X-USDT-SWAP", ctVal: "abc" }),
      row({ instId: "Y-USDT-SWAP", ctVal: "0" }),
      row({ instId: "Z-USDT-SWAP", ctMult: "-1" }),
      null,
      "x",
      row({ instId: undefined }),
    ]);
    expect([...sizes.keys()]).toEqual([]);
  });

  test("not a list is nothing", () => {
    expect(parseContracts(null).size).toBe(0);
    expect(parseContracts({}).size).toBe(0);
  });
});

describe("the reader", () => {
  const answer = (body: string, status = 200) => async (url: string) => ({ ok: status < 400, status, text: async () => body, url });

  test("one free read of the exchange's list of perpetuals, and the sizes come back", async () => {
    const urls: string[] = [];
    const reader = createContractReader({ fetch: async (url) => (urls.push(url), { ok: true, status: 200, text: async () => JSON.stringify({ code: "0", data: [row()] }) }) });
    const sizes = await reader.read();
    expect(urls).toEqual([CONTRACTS_URL]);
    expect(CONTRACTS_URL).toBe("https://www.okx.com/api/v5/public/instruments?instType=SWAP");
    expect(sizes?.get("BTC-USDT-SWAP")).toBe(0.01);
  });

  test("a refusal, a bad answer or no connection is null, so the caller knows it does not have the sizes and tries again later", async () => {
    expect(await createContractReader({ fetch: answer("", 500) }).read()).toBeNull();
    expect(await createContractReader({ fetch: answer("not json") }).read()).toBeNull();
    expect(await createContractReader({ fetch: answer(JSON.stringify({ code: "50011", data: [] })) }).read()).toBeNull();
    expect(
      await createContractReader({
        fetch: async () => {
          throw new Error("offline");
        },
      }).read(),
    ).toBeNull();
  });
});
