import { describe, expect, test } from "bun:test";
import { FEATURE_NAMES } from "../intel/features/types";
import type { Snapshot } from "../outcomes/types";
import { targetsFrom } from "./targets";

const snap = (values: Record<string, number | null>, todas: NonNullable<Snapshot["zones"]["todas"]> = []): Pick<Snapshot, "price" | "zones" | "features"> => ({
  price: 100,
  zones: { demanda: null, oferta: null, todas },
  features: { v: 1, instId: "ETH-USDT", asOfMs: 1, values: Object.fromEntries(FEATURE_NAMES.map((n) => [n, values[n] ?? null])), nulos: {}, idades: {} },
});

const zones = [
  { id: "a", lado: "oferta" as const, baixo: 103, alto: 104, invalidacao: 105, nota: 50 },
  { id: "b", lado: "demanda" as const, baixo: 96, alto: 97, invalidacao: 95, nota: 60 },
];

describe("targets from a snapshot", () => {
  test("a buy looks at the near edge of the supply zone, the profile levels and the pools above", () => {
    const t = targetsFrom(snap({ "flow.pocBps": -50, "flow.vahBps": 120, "smc15.poolAboveBps": 250, "smc1h.poolAboveBps": null, "smc15.poolBelowBps": 100 }, zones), "compra");
    expect(t.map((x) => [x.tipo, Math.round(x.preco * 100) / 100])).toEqual([["zona_oposta", 103], ["perfil", 99.5], ["perfil", 101.2], ["piscina", 102.5]]);
  });
  test("a sell looks at the near edge of the demand zone, the profile levels and the pools below", () => {
    const t = targetsFrom(snap({ "flow.valBps": -300, "smc1h.poolBelowBps": 400, "smc15.poolAboveBps": 100 }, zones), "venda");
    expect(t.map((x) => [x.tipo, Math.round(x.preco * 100) / 100])).toEqual([["zona_oposta", 97], ["perfil", 97], ["piscina", 96]]);
  });
  test("nothing known is nothing offered, and a zone without a side is not an opposing zone", () => {
    expect(targetsFrom(snap({}), "compra")).toEqual([]);
    expect(targetsFrom(snap({}, [{ baixo: 103, alto: 104, invalidacao: null, nota: 40 }]), "compra")).toEqual([]);
  });
  test("a level that would be at or under zero is dropped", () => {
    expect(targetsFrom(snap({ "smc15.poolBelowBps": 10_000 }), "venda")).toEqual([]);
  });
});
