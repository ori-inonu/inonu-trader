// ASK-2, ASK-4, F2-DIG-4: "Pedir ao Inonu" asks about what is in focus: an OKX instrument goes to the exchange reads (mode ativo), an
// on-chain token goes to the OnchainOS gateway (mode token). The request is built by one function so the screen cannot mix them up:
// a token never travels as an instrument id, and an instrument never gets a chain. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { askButtonLabel, askRequestFor, journalInstId, subjectFromFocus, subjectKey, subjectLabel } from "./ask-target";

const TOKEN = { chainIndex: "501", address: "So11111111111111111111111111111111111111112", symbol: "SOL" };

describe("the subject of a request", () => {
  test("with no on-chain focus it is the OKX instrument", () => {
    expect(subjectFromFocus("BTC-USDT", null)).toEqual({ kind: "okx", instId: "BTC-USDT" });
  });

  test("with an on-chain focus it is the token, whatever OKX instrument the desk last followed", () => {
    expect(subjectFromFocus("BTC-USDT", TOKEN)).toEqual({ kind: "token", ...TOKEN });
  });

  test("the request of an instrument is the mode ativo with the instrument id, and nothing else", () => {
    expect(askRequestFor({ kind: "okx", instId: "ETH-USDT-SWAP" })).toEqual({ modo: "ativo", alvo: { instId: "ETH-USDT-SWAP" } });
  });

  test("the request of a token is the mode token with chain and address only: no symbol, no name, no instrument id", () => {
    const request = askRequestFor({ kind: "token", ...TOKEN });
    expect(request).toEqual({ modo: "token", alvo: { chainIndex: "501", address: TOKEN.address } });
    expect(JSON.stringify(request)).not.toContain("SOL");
  });

  test("a discovery is about a whole network: the request is the mode descoberta with the chain only", () => {
    const subject = { kind: "descoberta" as const, chainIndex: "501", chainName: "Solana" };
    expect(askRequestFor(subject)).toEqual({ modo: "descoberta", alvo: { chainIndex: "501" } });
    expect(subjectKey(subject)).toBe("descoberta:501");
    expect(subjectLabel(subject)).toBe("melhores entradas na rede Solana");
    expect(subjectKey({ kind: "descoberta", chainIndex: "8453", chainName: "Base" })).not.toBe(subjectKey(subject));
  });

  test("a ranking is about the rows chosen in the Rastreador: the request is the mode ranking with the instrument ids only (RAS-6)", () => {
    const subject = { kind: "ranking" as const, instIds: ["ETH-USDT", "BTC-USDT-SWAP", "SOL-USDT"] };
    expect(askRequestFor(subject)).toEqual({ modo: "ranking", alvos: [{ instId: "ETH-USDT" }, { instId: "BTC-USDT-SWAP" }, { instId: "SOL-USDT" }] });
    expect(subjectLabel(subject)).toBe("ranking de 3 ativos escolhidos");
    // the same rows in another order are the same subject: the answer on screen is not thrown away because a row was ticked first
    expect(subjectKey(subject)).toBe(subjectKey({ kind: "ranking", instIds: ["SOL-USDT", "ETH-USDT", "BTC-USDT-SWAP"] }));
    expect(subjectKey(subject)).not.toBe(subjectKey({ kind: "ranking", instIds: ["ETH-USDT", "BTC-USDT-SWAP"] }));
    expect(subjectKey(subject).startsWith("ranking:")).toBe(true);
    expect(subjectKey({ kind: "ranking", instIds: ["ETH-USDT", "BTC-USDT"] })).not.toBe(subjectKey({ kind: "okx", instId: "ETH-USDT" }));
  });

  test("the button says what the click will ask when it is not the usual question, and the usual one needs no text of its own", () => {
    expect(askButtonLabel({ kind: "okx", instId: "BTC-USDT" })).toBeUndefined();
    expect(askButtonLabel({ kind: "token", ...TOKEN })).toBeUndefined();
    expect(askButtonLabel({ kind: "descoberta", chainIndex: "501", chainName: "Solana" })).toBe("Pedir ao Inonu: melhores entradas agora");
    const label = askButtonLabel({ kind: "ranking", instIds: ["A-USDT", "B-USDT", "C-USDT"] });
    expect(label).toBe("Pedir ao Inonu: ranquear as 3 escolhidas");
    expect(label).not.toMatch(/[·—–]/);
  });

  test("the journal names the instrument the model picked from a ranking, and the subject itself when it picked nothing", () => {
    const ranking = { kind: "ranking" as const, instIds: ["ETH-USDT", "BTC-USDT-SWAP"] };
    expect(journalInstId(ranking, "spot:ETH-USDT")).toBe("ETH-USDT");
    expect(journalInstId(ranking, "perp:BTC-USDT-SWAP")).toBe("BTC-USDT-SWAP");
    expect(journalInstId(ranking, null)).toBe(subjectKey(ranking));
    expect(journalInstId(ranking, "manter")).toBe(subjectKey(ranking));
    // a pick that is not one of the rows is never taken as an instrument
    expect(journalInstId(ranking, "spot:DOGE-USDT")).toBe(subjectKey(ranking));
    expect(journalInstId({ kind: "okx", instId: "BTC-USDT" }, "spot:BTC-USDT")).toBe("BTC-USDT");
    expect(journalInstId({ kind: "token", ...TOKEN }, "token:501:abc")).toBe(`token:501:${TOKEN.address}`);
  });

  test("the key tells one subject from another, so an answer about one is never shown on the other", () => {
    const keys = new Set([
      subjectKey({ kind: "okx", instId: "BTC-USDT" }),
      subjectKey({ kind: "okx", instId: "ETH-USDT" }),
      subjectKey({ kind: "token", ...TOKEN }),
      subjectKey({ kind: "token", ...TOKEN, chainIndex: "8453" }),
      subjectKey({ kind: "token", ...TOKEN, address: "0xabc" }),
    ]);
    expect(keys.size).toBe(5);
    expect(subjectKey({ kind: "okx", instId: "BTC-USDT" })).toBe("BTC-USDT");
    expect(subjectKey({ kind: "token", ...TOKEN })).toBe(`token:501:${TOKEN.address}`);
  });

  test("the label names what is asked about: the instrument, or the token with its network", () => {
    expect(subjectLabel({ kind: "okx", instId: "BTC-USDT" })).toBe("BTC-USDT");
    expect(subjectLabel({ kind: "token", ...TOKEN })).toBe("SOL na rede 501");
  });

  test("plain ASCII and no middle dot or dash in what is shown", () => {
    const text = subjectLabel({ kind: "token", ...TOKEN });
    expect(text).not.toMatch(/[·—–]/);
    expect(text).toBe(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  });
});
