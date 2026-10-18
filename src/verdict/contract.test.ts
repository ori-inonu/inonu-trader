import { describe, expect, test } from "bun:test";
import { FEATURE_NAMES, type FeatureVector } from "../intel/features/types";
import { Rng } from "../lab/rng";
import { buildPlacar } from "../outcomes/scoreboard";
import { parsePerfil, parsePlacar, parseVeredito } from "../../web/src/lib/veredito/parse";
import { composeVerdict, type VerdictInput } from "./compose";
import { validProfile } from "./profile-store";

/**
 * The web build cannot import from `src/`, so the desk has its own strict reader of what the core sends. This test feeds the real
 * output of the composer, of the Placar and of the profile rule through that reader, so a field added or renamed on one side and not
 * on the other fails here instead of drawing a broken card.
 */
const features = (values: Record<string, number | null>, nulos: Record<string, string> = {}, idades: Record<string, number> = {}): FeatureVector => ({
  v: 1, instId: "ETH-USDT", asOfMs: 1, values: Object.fromEntries(FEATURE_NAMES.map((n) => [n, values[n] ?? null])), nulos, idades,
});
const BULL = { "trend.ema1h": 1, "trend.ema4h": 1, "flow.warm": 1, "flow.absorbSide": 1, "smc15.breakDir": 1, "smc15.breakChoch": 1, "smc15.breakAge": 4, "smc15.sweepKind": 1, "smc15.sweepAge": 3, "zone.demandNota": 62, "zone.demandBps": 20, "cost.moveToCost1h": 4.2 };
const demand = { baixo: 98.5, alto: 99.5, invalidacao: 98, nota: 62.4 };

const base = (over: Partial<VerdictInput> = {}): VerdictInput => ({
  action: "buy", market: "spot", price: 100, jev: { consistency: 0.8, orderingsAgree: true }, features: features(BULL), zone: demand, atr15m: 1, costRoundTripBps: 24,
  targets: [{ preco: 103, tipo: "zona_oposta" }], profile: { capitalUsd: 1000, riskPct: 1 }, placarMedido: false, ...over,
});

describe("the reader of the desk accepts everything the composer says", () => {
  test("every scenario of the acceptance", () => {
    const scenarios: VerdictInput[] = [
      base(), base({ action: "sell", market: "perp" }), base({ action: "hold" }), base({ action: null, failure: "sem_chave" }), base({ action: null, failure: "modelo_falhou" }),
      base({ features: features({ ...BULL, "flow.warm": 0 }) }), base({ features: features(BULL, { bars15m: "velas_velhas" }) }), base({ features: features({ ...BULL, "cost.moveToCost1h": 0.5 }) }),
      base({ jev: { consistency: 0.1, orderingsAgree: true } }), base({ jev: { consistency: 0.9, orderingsAgree: false } }), base({ market: "token", tokenRisk: { honeypot: true, level: null } }),
      base({ zone: null, targets: [], profile: null }), base({ market: "token", zone: null, features: null }), base({ price: 97.5 }), base({ price: null }), base({ costRoundTripBps: 800 }),
    ];
    for (const s of scenarios) {
      const wire = JSON.parse(JSON.stringify(composeVerdict(s)));
      expect(parseVeredito(wire), JSON.stringify(wire)).toEqual(wire);
    }
  });

  test("and over thousands of random inputs, without one refusal", () => {
    const rng = new Rng(77, "contract");
    const pick = <T,>(xs: readonly T[]): T => xs[rng.int(xs.length)]!;
    for (let i = 0; i < 3000; i += 1) {
      const v = composeVerdict(base({
        action: pick(["buy", "sell", "hold", null] as const),
        failure: pick([null, "sem_chave", "modelo_falhou"] as const),
        market: pick(["spot", "perp", "token"] as const),
        price: pick([100, 97, 103, null]),
        jev: pick([null, { consistency: rng.next(), orderingsAgree: pick([true, false, null]) }]),
        features: pick([null, features({ ...BULL, "flow.warm": pick([0, 1]), "cost.moveToCost1h": rng.next() * 5, "drv.fundingBps": pick([null, -7, 8]), "mom.rsi15m": pick([null, 20, 80]) })]),
        zone: pick([null, demand]),
        atr15m: pick([null, 1]),
        costRoundTripBps: pick([null, 24, 500]),
        profile: pick([null, { capitalUsd: 1000, riskPct: 1 }, { capitalUsd: 50, riskPct: 9 }]),
        placarMedido: pick([true, false]),
      }));
      const wire = JSON.parse(JSON.stringify(v));
      expect(parseVeredito(wire), JSON.stringify(wire)).toEqual(wire);
    }
  });
});

describe("the Placar and the profile", () => {
  const snap = (id: string) => ({ id, asOfMs: 1, instId: "ETH-USDT", market: "spot" as const, price: 100, costRoundTripBps: 24, atr15m: 1, zones: { demanda: null, oferta: null }, features: features({}), origem: "pedido" as const });
  test("the Placar of an empty store and of a measured one", () => {
    const empty = JSON.parse(JSON.stringify({ ok: true, placar: buildPlacar({ decisions: [], snapshots: [], labels: [] }) }));
    expect(parsePlacar(empty)?.estado).toBe("nao_medido");
    const decisions = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, atMs: i, instId: "ETH-USDT", modo: "ativo", action: "buy" as const, candidateId: "zona:a", briefHash: null, snapshotId: `s${i}`, reutilizado: false, probabilidades: null, veredito: null }));
    const labels = decisions.map((d, i) => ({ snapshotId: d.snapshotId!, horizonte: "1h" as const, completo: true, motivoIncompleto: null, brutoLongBps: 30, liquidoLongBps: i % 3 === 0 ? -6 : 6, liquidoShortBps: -54, maxAltaBps: 1, maxQuedaBps: 1, barreiraLong: null, barreiraShort: null, zonaDemanda: null, zonaOferta: null }));
    const measured = JSON.parse(JSON.stringify({ ok: true, placar: buildPlacar({ decisions, snapshots: decisions.map((d) => snap(d.snapshotId!)), labels }) }));
    const parsed = parsePlacar(measured);
    expect(parsed?.estado).toBe("medido");
    expect(parsed?.medidas).toBe(30);
  });

  test("the profile rule of the core and the reader of the desk agree", () => {
    for (const p of [{ capitalUsd: 1000, riskPct: 0.5 }, { capitalUsd: null, riskPct: null }, { capitalUsd: 1000, riskPct: null }, { capitalUsd: null, riskPct: 1 }]) {
      const readable = parsePerfil(p) !== null;
      const storable = validProfile(p);
      // anything the core would store must be readable by the desk; the desk may be stricter only in shape, never looser
      if (storable) expect(readable, JSON.stringify(p)).toBe(true);
      if (!readable) expect(storable, JSON.stringify(p)).toBe(false);
    }
  });
});
