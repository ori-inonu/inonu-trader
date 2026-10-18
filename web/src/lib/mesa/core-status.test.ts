// INF, DOC: the two source chips of the installed app read the core, not the old producers. "Inonu" is ready when the model has a key (it answers a click,
// nothing runs by itself) and the OnchainOS is ready when the gateway has credentials. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { InonuStatus } from "@/lib/inonu/client";
import type { OnchainStatus } from "@/lib/onchain/client";
import { applyCoreChips, coreChips } from "./core-status";
import type { FeedChip } from "./mesa-model";

const NOW = 1_700_000_000_000;
const inonu = (over: Partial<InonuStatus> = {}, feedState: string | null = "live"): InonuStatus => ({
  modelConfigured: true, running: null, today: { calls: 6, usd: null }, engine: { feedState, messagesPerSecond: 15, instruments: [] }, ...over,
});
const gateway = (over: Partial<OnchainStatus> = {}): OnchainStatus => ({ credential: "complete", lastCallMs: null, lastCode: null, cooldownUntilMs: null, clockOffsetMs: null, ...over });

describe("the Inonu chip", () => {
  test("a model with a key and a live feed is ready, and says it only answers a click", () => {
    expect(coreChips({ inonu: inonu(), gateway: null }, NOW).inonu).toEqual({ tone: "live", detail: "pronto, so responde ao clique", word: "pronto" });
  });

  test("no key is not ready: it says where to fix it", () => {
    expect(coreChips({ inonu: inonu({ modelConfigured: false }), gateway: null }, NOW).inonu).toEqual({ tone: "late", detail: "sem chave do modelo, veja Configuracoes" });
  });

  test("a feed that is not live is said, because the answer is made from it; an unknown feed state does not block", () => {
    expect(coreChips({ inonu: inonu({}, "reconnecting"), gateway: null }, NOW).inonu).toEqual({ tone: "late", detail: "pronto, mas o fluxo ao vivo esta fora" });
    expect(coreChips({ inonu: inonu({}, null), gateway: null }, NOW).inonu?.tone).toBe("live");
  });

  test("a core that did not answer leaves the chip to the old reading", () => {
    expect(coreChips({ inonu: null, gateway: null }, NOW)).toEqual({ inonu: null, onchainos: null });
  });
});

describe("the OnchainOS chip", () => {
  const chip = (g: OnchainStatus) => coreChips({ inonu: null, gateway: g }, NOW).onchainos;

  test("credentials: none is down, partial is late, complete is ready", () => {
    expect(chip(gateway({ credential: "absent" }))).toEqual({ tone: "down", detail: "sem credenciais, veja Configuracoes" });
    expect(chip(gateway({ credential: "incomplete" }))).toEqual({ tone: "late", detail: "credenciais incompletas, veja Configuracoes" });
    expect(chip(gateway())).toEqual({ tone: "live", detail: "pronto, sem leituras ainda", word: "pronto" });
  });

  test("the age of the last read, and the provider's own code when it refused", () => {
    expect(chip(gateway({ lastCallMs: NOW - 5_000, lastCode: 0 }))).toEqual({ tone: "live", detail: "ultima leitura ha 5 s", word: "pronto" });
    expect(chip(gateway({ lastCallMs: NOW - 125_000, lastCode: 0 }))?.detail).toBe("ultima leitura ha 2 min");
    expect(chip(gateway({ lastCallMs: NOW - 3 * 3_600_000, lastCode: 0 }))?.detail).toBe("ultima leitura ha 3 h");
    expect(chip(gateway({ lastCallMs: NOW - 5_000, lastCode: 50011 }))).toEqual({ tone: "late", detail: "ultima leitura ha 5 s com erro 50011" });
  });

  test("a pause for the provider's limit is said while it lasts, and stops being said when it ends", () => {
    expect(chip(gateway({ lastCallMs: NOW - 1000, lastCode: 50011, cooldownUntilMs: NOW + 20_000 }))).toEqual({ tone: "late", detail: "em pausa por limite da OKX" });
    expect(chip(gateway({ lastCallMs: NOW - 40_000, lastCode: 0, cooldownUntilMs: NOW - 10_000 }))?.tone).toBe("live");
  });

  test("a clock that is behind the last read does not print a negative age", () => {
    expect(chip(gateway({ lastCallMs: NOW + 60_000, lastCode: 0 }))?.detail).toBe("ultima leitura ha 0 s");
  });
});

describe("applyCoreChips", () => {
  const chips: FeedChip[] = [
    { id: "okx-public-ws", label: "OKX tempo real", tone: "live", detail: null },
    { id: "jev-backend", label: "Inonu", tone: "down", detail: "produtor desligado" },
    { id: "okx-wallet", label: "Carteira OKX", tone: "off", detail: "extensao nao encontrada" },
    { id: "onchainos", label: "OnchainOS", tone: "down", detail: "sem ciclo do operador" },
  ];

  test("only the two chips of the core change, in place, with their label and id kept", () => {
    const out = applyCoreChips(chips, { inonu: { tone: "live", detail: "pronto, so responde ao clique", word: "pronto" }, onchainos: { tone: "live", detail: "ultima leitura ha 5 s", word: "pronto" } });
    expect(out.map((c) => c.id)).toEqual(chips.map((c) => c.id));
    expect(out[1]).toEqual({ id: "jev-backend", label: "Inonu", tone: "live", detail: "pronto, so responde ao clique", word: "pronto" });
    expect(out[3]).toEqual({ id: "onchainos", label: "OnchainOS", tone: "live", detail: "ultima leitura ha 5 s", word: "pronto" });
    expect(out[0]).toBe(chips[0]!);
    expect(out[2]).toBe(chips[2]!);
  });

  test("a chip whose core part did not answer stays as the old reading made it", () => {
    const out = applyCoreChips(chips, { inonu: null, onchainos: { tone: "late", detail: "em pausa por limite da OKX" } });
    expect(out[1]).toBe(chips[1]!);
    expect(out[3]!.detail).toBe("em pausa por limite da OKX");
  });

  test("no text of the new chips has an accent, a dash or a middle dot", () => {
    const all = [
      coreChips({ inonu: inonu(), gateway: gateway() }, NOW), coreChips({ inonu: inonu({ modelConfigured: false }), gateway: gateway({ credential: "absent" }) }, NOW),
      coreChips({ inonu: inonu({}, "stale"), gateway: gateway({ credential: "incomplete" }) }, NOW), coreChips({ inonu: null, gateway: gateway({ lastCallMs: NOW - 9_000, lastCode: 50011, cooldownUntilMs: NOW + 1 }) }, NOW),
    ];
    for (const c of all) for (const p of [c.inonu, c.onchainos]) if (p !== null) expect(p.detail).not.toMatch(/[^\x20-\x7e]/);
  });
});
