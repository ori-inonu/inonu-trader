// T5.7, T6.4: the desk reads what the engine measured (`GET /inonu/engine`) strictly, in price, and keeps polling cheap and
// cancellable. A malformed answer is nothing at all, never a half-drawn layer.
import { describe, expect, test } from "bun:test";
import { createOverlayClient, parseOverlay, type ChartOverlay } from "./overlay";

const GOOD = {
  ok: true, instId: "BTC-USDT", asOfMs: 1_800_000_005_000, fonte: "okx_ws_trades", price: 101, atr14: 2, tickSz: "0.5", step: 0.5, binTicks: 1,
  aquecimento: { fechadas: 3, necessarias: 50, pronto: false },
  niveis: [{ baixo: 99, alto: 99.5, c: 60, v: 10, imb: "c", volume: null, alerta: { c: true, v: false } }, { baixo: 99.5, alto: 100, c: 90, v: 10, imb: null, volume: "c", alerta: null }],
  corridas: { sequencial: [{ lado: "c", baixo: 99, alto: 100.5, n: 3 }], progressao: [], exaustao: [{ extremo: "baixo", baixo: 99, alto: 100, n: 3 }] },
  perfil: { poc: { baixo: 99.5, alto: 100 }, val: 99, vah: 100, hvn: [{ baixo: 99.5, alto: 100 }], lvn: [] },
  absorcao: { lado: "v", razaoVolume: 1.2 },
  zonas: [{ id: "a1b2c3d4e5f6", lado: "demanda", baixo: 99, alto: 100.5, nota: 72.2, estado: "ativa", fatores: ["E2", "E3"], idadeBarras: 0, invalidacao: 98.8, primeiroTs: 1_800_000_000_000 }],
  nulos: { "fluxo.cvd": "aquecimento" },
};

describe("parseOverlay", () => {
  test("reads a good overlay field by field", () => {
    const o = parseOverlay(GOOD) as ChartOverlay;
    expect(o.instId).toBe("BTC-USDT");
    expect(o.niveis[0]).toEqual({ baixo: 99, alto: 99.5, c: 60, v: 10, imb: "c", volume: null, alerta: { c: true, v: false } });
    expect(o.corridas.sequencial).toEqual([{ lado: "c", baixo: 99, alto: 100.5, n: 3 }]);
    expect(o.zonas[0]).toMatchObject({ lado: "demanda", estado: "ativa", fatores: ["E2", "E3"], invalidacao: 98.8 });
    expect(o.aquecimento).toEqual({ fechadas: 3, necessarias: 50, pronto: false, restaurado: 0 });
    expect(o.perfil.poc).toEqual({ baixo: 99.5, alto: 100 });
  });

  test("the count restored from the previous run is read, and a malformed one is no overlay at all", () => {
    expect(parseOverlay({ ...GOOD, aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 12 } })!.aquecimento.restaurado).toBe(12);
    expect(parseOverlay({ ...GOOD, aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: -1 } })).toBeNull();
    expect(parseOverlay({ ...GOOD, aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: "3" } })).toBeNull();
  });

  test("the unit of a level in base currency and the totals of the window are read when the core sends them, and are simply absent from an older core", () => {
    const old = parseOverlay(GOOD) as ChartOverlay;
    expect(old.unidade).toBeUndefined();
    expect(old.totais).toBeUndefined();
    const o = parseOverlay({ ...GOOD, unidade: "0.00000001", totais: { c: 27_400_000, v: 84_200_000 } }) as ChartOverlay;
    expect(o.unidade).toBe("0.00000001");
    expect(o.totais).toEqual({ c: 27_400_000, v: 84_200_000 });
  });

  test("a unit that is not a positive decimal, or totals that are not two counts, are no overlay at all", () => {
    for (const unidade of ["abc", "0", "-1", "1e-8", "", 5, null]) expect(parseOverlay({ ...GOOD, unidade })).toBeNull();
    for (const totais of [{ c: -1, v: 1 }, { c: "1", v: 1 }, { c: 1 }, "x", null, []]) expect(parseOverlay({ ...GOOD, totais })).toBeNull();
  });

  test("an empty window is valid: nothing to draw, nothing invented", () => {
    const o = parseOverlay({ ...GOOD, price: null, niveis: [], zonas: [], perfil: { poc: null, val: null, vah: null, hvn: [], lvn: [] }, absorcao: null, atr14: null });
    expect(o).not.toBeNull();
    expect(o!.niveis).toEqual([]);
  });

  test("anything off the contract is null: wrong flag, a band that is not a band, a bad state, a non finite number", () => {
    const bad: unknown[] = [
      null, "x", {}, { ...GOOD, ok: false }, { ...GOOD, instId: 5 }, { ...GOOD, fonte: "outra" },
      { ...GOOD, niveis: [{ ...GOOD.niveis[0], alto: 98 }] },
      { ...GOOD, niveis: [{ ...GOOD.niveis[0], c: -1 }] },
      { ...GOOD, niveis: [{ ...GOOD.niveis[0], imb: "x" }] },
      { ...GOOD, zonas: [{ ...GOOD.zonas[0], estado: "mitigada" }] },
      { ...GOOD, zonas: [{ ...GOOD.zonas[0], lado: "comprar" }] },
      { ...GOOD, zonas: [{ ...GOOD.zonas[0], baixo: Number.NaN }] },
      { ...GOOD, corridas: { ...GOOD.corridas, sequencial: [{ lado: "x", baixo: 1, alto: 2, n: 3 }] } },
      { ...GOOD, aquecimento: { fechadas: "3", necessarias: 50, pronto: false } },
    ];
    for (const raw of bad) expect(parseOverlay(raw)).toBeNull();
  });

  test("lists are bounded so a hostile or buggy server cannot make the chart draw thousands of boxes", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ baixo: 100 + i, alto: 101 + i, c: 1, v: 1, imb: null, volume: null, alerta: null }));
    const zones = Array.from({ length: 40 }, (_, i) => ({ ...GOOD.zonas[0], id: String(i).padStart(12, "0"), baixo: 90 + i, alto: 91 + i }));
    const o = parseOverlay({ ...GOOD, niveis: many, zonas: zones })!;
    expect(o.niveis.length).toBeLessThanOrEqual(200);
    expect(o.zonas.length).toBeLessThanOrEqual(12);
  });

  test("strings that reach the screen are cut: ids and factors are short plain tokens", () => {
    const o = parseOverlay({ ...GOOD, zonas: [{ ...GOOD.zonas[0], id: "a".repeat(80), fatores: ["E2", "x".repeat(50)] }] })!;
    expect(o.zonas[0]!.id.length).toBeLessThanOrEqual(24);
    expect(o.zonas[0]!.fatores.every((f) => f.length <= 4)).toBe(true);
  });
});

describe("the client", () => {
  function fakeFetch(body: unknown, status = 200) {
    const calls: { url: string; signal?: AbortSignal }[] = [];
    const f = (async (url: string, init?: { signal?: AbortSignal }) => {
      calls.push({ url, signal: init?.signal });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }) as never;
    return { calls, f };
  }

  test("asks the engine route of its own origin for the instrument, with no intent header (it is free)", async () => {
    const { calls, f } = fakeFetch(GOOD);
    const out = await createOverlayClient("", f).fetch("BTC-USDT");
    expect(out.ok).toBe(true);
    expect(calls[0]!.url).toBe("/inonu/engine?instId=BTC-USDT");
  });

  test("failures are named outcomes, never exceptions", async () => {
    const out = async (f: never) => createOverlayClient("", f).fetch("BTC-USDT");
    expect(await out(fakeFetch("nope", 404).f)).toEqual({ ok: false, reason: "servidor_sem_rota" });
    expect(await out(fakeFetch({ ok: false, code: "instrumento_nao_suportado" }, 400).f)).toEqual({ ok: false, reason: "instrumento_nao_suportado" });
    expect(await out(fakeFetch({ ok: false, code: "forbidden" }, 403).f)).toEqual({ ok: false, reason: "origem_negada" });
    expect(await out(fakeFetch("<html>", 200).f)).toEqual({ ok: false, reason: "resposta_invalida" });
    expect(await out((async () => { throw new Error("offline"); }) as never)).toEqual({ ok: false, reason: "sem_conexao" });
  });

  test("an id that is not an instrument never leaves the browser", async () => {
    const { calls, f } = fakeFetch(GOOD);
    expect(await createOverlayClient("", f).fetch("bad id")).toEqual({ ok: false, reason: "alvo_invalido" });
    expect(calls).toEqual([]);
  });
});
