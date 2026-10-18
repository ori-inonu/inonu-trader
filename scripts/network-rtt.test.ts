import { describe, expect, test } from "bun:test";
import { measure, parseSample, summarize } from "./network-rtt";

describe("network-rtt", () => {
  test("lê os tempos das três fases em segundos", () => {
    expect(parseSample("0.020;0.060;0.150")).toEqual({ connect: 0.02, tls: 0.06, firstByte: 0.15 });
  });

  test("tempo faltante, zerado ou fora de ordem invalida a amostra, nunca vira zero", () => {
    expect(parseSample("")).toBeNull();
    expect(parseSample("0.000000;0.000000;0.000000")).toBeNull();
    expect(parseSample("0.1;0.05;0.2")).toBeNull();
    expect(parseSample("0.1;0.2;0.15")).toBeNull();
    expect(parseSample("a;b;c")).toBeNull();
  });

  test("cada fase sai em ms e descontada da anterior", () => {
    const r = summarize("web3.okx.com", [parseSample("0.020;0.060;0.150"), parseSample("0.030;0.070;0.170"), null], 0);
    expect(r).toMatchObject({ host: "web3.okx.com", samples: 2, failures: 1 });
    expect(r.tcpMs).toMatchObject({ n: 2, min: 20, max: 30 });
    expect(r.tlsMs).toMatchObject({ min: 40, max: 40 });
    expect(r.serverMs).toMatchObject({ min: 90, max: 100 });
    expect(r.totalToFirstByteMs).toMatchObject({ min: 150, max: 170 });
  });

  test("sem nenhuma amostra válida não há número", () => {
    const r = summarize("x", [null, null], 0);
    expect(r.tcpMs).toBeNull();
    expect(r.failures).toBe(2);
  });

  test("measure chama uma vez por amostra, e uma falha do curl vira falha de amostra", async () => {
    let calls = 0;
    const r = await measure("https://web3.okx.com/", 4, async () => {
      calls += 1;
      if (calls === 3) throw new Error("curl não achou o host");
      return "0.010;0.030;0.080";
    });
    expect(calls).toBe(4);
    expect(r).toMatchObject({ samples: 3, failures: 1, host: "web3.okx.com" });
    expect(r.totalToFirstByteMs?.p50).toBe(80);
  });
});
