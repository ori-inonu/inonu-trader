// T7.1 / ASK-3, ING-2, AC-ASK-2, AC-ING-1: the Evidence Brief the model is asked about: compact, deterministic, hashed, with
// the unknown as null plus a reason, and regenerated only when something material changed. origin: synthetic_fixture.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { BriefTooLarge, buildBrief, materialChange, type BriefCandidate, type BriefInput } from "./brief";

const zone = (id: string, nota: number, estado = "ativa", extra: Partial<BriefCandidate> = {}): BriefCandidate => ({
  id: `zona:${id}`,
  tipo: "zona",
  limitesBps: [-120, -80],
  nota,
  fatores: ["E1", "E2"],
  idadeBarras: 12,
  estado,
  invalidacaoBps: -130,
  ...extra,
});

const input = (over: Partial<BriefInput> = {}): BriefInput => ({
  alvo: { instId: "BTC-USDT-SWAP" },
  asOfMs: 1_800_000_000_000,
  familiasHabilitadas: ["E1", "E2", "E3", "E4", "E5"],
  fluxo: { delta: -2, cvd: 180, desde: 1_799_990_000_000, imb: { c: 3, v: 1 }, seq: [{ lado: "c", nivelInicial: 200, nivelFinal: 202, comprimento: 3 }], prg: [], exh: [], absorcao: null, aprox: false },
  candidatos: [zone("a1b2c3d4e5f6", 35.9), { id: "perp:BTC-USDT-SWAP", tipo: "perp" }, { id: "manter", tipo: "manter" }],
  trilha: null,
  risco: null,
  regime: { funding: 0.0001, oiVar: 0.02, btcBeta: null },
  idades: { fluxo: 800, zonas: 1500, regime: 30_000 },
  origens: { fluxo: "okx_public_v5", zonas: "okx_public_v5", regime: "okx_public_v5" },
  nulos: { trilha: "ativo da OKX: sem carteiras rastreadas", risco: "nao se aplica a perpetuo", "regime.btcBeta": "nao medido" },
  ...over,
});

const canonical = (value: unknown): string => JSON.stringify(sortKeys(value));
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, sortKeys(v)]));
  return value;
}

describe("shape, determinism and hash", () => {
  test("a typical Brief is well under 2 KB and says what it is", () => {
    const { brief, json, bytes } = buildBrief(input());
    expect(bytes).toBe(new TextEncoder().encode(json).length);
    expect(bytes).toBeLessThanOrEqual(2048);
    expect(brief.schemaVersion).toBe(1);
    expect(brief.alvo).toEqual({ instId: "BTC-USDT-SWAP" });
    expect(brief.familiasHabilitadas).toEqual(["E1", "E2", "E3", "E4", "E5"]);
    expect(brief.nulos.trilha).toMatch(/OKX/);
  });

  test("the same content in another key and candidate order gives the same JSON and the same hash", () => {
    const a = buildBrief(input());
    const shuffled = input({ candidatos: [...input().candidatos].reverse(), nulos: Object.fromEntries(Object.entries(input().nulos).reverse()), idades: { regime: 30_000, zonas: 1500, fluxo: 800 } });
    const b = buildBrief(shuffled);
    expect(b.json).toBe(a.json);
    expect(b.brief.hash).toBe(a.brief.hash);
  });

  test("the hash is the SHA-256 of the canonical form without the hash field, and changes with any content", () => {
    const { brief } = buildBrief(input());
    const { hash, ...rest } = brief;
    expect(hash).toBe(createHash("sha256").update(canonical(rest)).digest("hex"));
    expect(buildBrief(input({ asOfMs: 1_800_000_000_001 })).brief.hash).not.toBe(hash);
    expect(buildBrief(input({ candidatos: [zone("a1b2c3d4e5f6", 36.0), { id: "manter", tipo: "manter" }] })).brief.hash).not.toBe(hash);
  });

  test("candidates come in a fixed order: zones by score, then tokens, spot, perpetuals, then the option to keep", () => {
    const { brief } = buildBrief(input({ candidatos: [{ id: "manter", tipo: "manter" }, { id: "perp:X", tipo: "perp" }, { id: "spot:X", tipo: "spot" }, { id: "token:1:0xa", tipo: "token", nota: 60 }, zone("low", 20), zone("high", 80)] }));
    expect(brief.candidatos.map((c) => c.id)).toEqual(["zona:high", "zona:low", "token:1:0xa", "spot:X", "perp:X", "manter"]);
  });

  test("numbers are rounded to what the model needs: the score to two decimals, distances to whole basis points", () => {
    const { brief } = buildBrief(input({ candidatos: [zone("a", 27.4509, "ativa", { limitesBps: [-120.4, -79.6], invalidacaoBps: -130.6 }), { id: "manter", tipo: "manter" }] }));
    const z = brief.candidatos[0]!;
    expect(z.nota).toBe(27.45);
    expect(z.limitesBps).toEqual([-120, -80]);
    expect(z.invalidacaoBps).toBe(-131);
  });

  test("a number that is not finite is an error, not a null in disguise", () => {
    expect(() => buildBrief(input({ fluxo: { delta: Number.NaN, cvd: 0, desde: 0, imb: { c: 0, v: 0 }, seq: [], prg: [], exh: [], absorcao: null, aprox: false } }))).toThrow();
  });

  test("no word of an order appears anywhere in the Brief (whole-word scan of the JSON)", () => {
    const { json } = buildBrief(input());
    for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(json)).toBe(false);
  });
});

describe("the 2 KB budget (ASK-3)", () => {
  const many = (n: number): BriefCandidate[] => Array.from({ length: n }, (_, i) => zone(`z${String(i).padStart(3, "0")}`, 20 + i, "ativa", { fatores: ["E1", "E2", "E3", "E4"] }));
  const size = (candidatos: BriefCandidate[], over: Partial<BriefInput> = {}) => buildBrief(input({ candidatos, ...over }), { maxBytes: 1_000_000 }).bytes;
  const keep: BriefCandidate[] = [{ id: "manter", tipo: "manter" }];
  const stripped = (list: BriefCandidate[]) => list.map(({ fatores: _omit, ...rest }) => rest);

  test("when it does not fit, the factors go first and the loss is written in nulos", () => {
    const candidates = [...many(8), ...keep];
    const full = size(candidates);
    const noFactors = size(stripped(candidates));
    expect(full).toBeGreaterThan(noFactors + 60);
    const limit = noFactors + 60; // room for the note that says what was cut
    const { brief, bytes } = buildBrief(input({ candidatos: candidates }), { maxBytes: limit });
    expect(bytes).toBeLessThanOrEqual(limit);
    expect(brief.candidatos.every((c) => c.fatores === undefined)).toBe(true);
    expect(brief.nulos.fatores).toBe("descartado_por_tamanho");
    expect(brief.candidatos.filter((c) => c.tipo === "zona")).toHaveLength(8); // no zone needed to go
  });

  test("nothing is written to nulos when nothing was cut", () => {
    const { brief } = buildBrief(input());
    expect(brief.nulos.fatores).toBeUndefined();
    expect(brief.nulos.zonas).toBeUndefined();
  });

  test("then the zones of the lowest score go, and the ids of everything else stay", () => {
    const others: BriefCandidate[] = [{ id: "spot:BTC-USDT", tipo: "spot" }, { id: "perp:BTC-USDT-SWAP", tipo: "perp" }, { id: "manter", tipo: "manter" }];
    const candidates = [...many(30), ...others];
    const overhead = size(others);
    const perZone = (size(stripped([...many(30), ...others])) - overhead) / 30;
    const limit = Math.round(overhead + 10 * perZone + 150);
    const { brief, bytes } = buildBrief(input({ candidatos: candidates }), { maxBytes: limit });
    expect(bytes).toBeLessThanOrEqual(limit);
    const zones = brief.candidatos.filter((c) => c.tipo === "zona");
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.length).toBeLessThan(30);
    expect(Math.min(...zones.map((z) => z.nota!))).toBeGreaterThan(20); // the survivors are the best ones
    expect(brief.candidatos.map((c) => c.id)).toEqual(expect.arrayContaining(["spot:BTC-USDT", "perp:BTC-USDT-SWAP", "manter"]));
    expect(brief.nulos.zonas).toMatch(/^descartadas_por_tamanho:[0-9]+$/);
    expect(brief.idades).toBeDefined();
  });

  test("the regime goes after the zones, and when even the ids do not fit it is an error rather than a silent cut", () => {
    const plain: BriefCandidate[] = [{ id: "spot:BTC-USDT", tipo: "spot" }, { id: "manter", tipo: "manter" }];
    const withRegime = size(plain);
    const { brief, bytes } = buildBrief(input({ candidatos: plain }), { maxBytes: withRegime - 8 });
    expect(bytes).toBeLessThanOrEqual(withRegime - 8);
    expect(brief.regime).toBeNull();
    expect(brief.nulos.regime).toBe("descartado_por_tamanho");
    const ids: BriefCandidate[] = Array.from({ length: 120 }, (_, i) => ({ id: `token:1:0x${String(i).padStart(40, "0")}`, tipo: "token" as const }));
    expect(() => buildBrief(input({ candidatos: ids }))).toThrow(BriefTooLarge);
  });
});

describe("materialChange (ING-2): only a material factor regenerates the Brief", () => {
  const base = buildBrief(input()).brief;
  const next = (over: Partial<BriefInput>) => buildBrief(input(over)).brief;

  test("nothing yet means a first Brief is always new", () => {
    expect(materialChange(null, base)).toEqual({ changed: true, reasons: ["primeiro"] });
  });

  test("the same content, or a tick of noise in a number that is not material, changes nothing", () => {
    expect(materialChange(base, base)).toEqual({ changed: false, reasons: [] });
    const noise = next({ fluxo: { ...input().fluxo!, delta: -3, cvd: 190 } });
    expect(materialChange(base, noise).changed).toBe(false);
  });

  test("a zone changing state, appearing or ending is material", () => {
    expect(materialChange(base, next({ candidatos: [zone("a1b2c3d4e5f6", 35.9, "testada"), { id: "perp:BTC-USDT-SWAP", tipo: "perp" }, { id: "manter", tipo: "manter" }] })).reasons).toContain("estado:zona:a1b2c3d4e5f6");
    expect(materialChange(base, next({ candidatos: [...input().candidatos, zone("new", 40)] })).reasons).toContain("nova:zona:new");
    expect(materialChange(base, next({ candidatos: input().candidatos.filter((c) => c.tipo !== "zona") })).reasons).toContain("fim:zona:a1b2c3d4e5f6");
  });

  test("a run appearing or ending is material", () => {
    expect(materialChange(base, next({ fluxo: { ...input().fluxo!, seq: [] } })).reasons).toContain("fluxo.seq");
    expect(materialChange(base, next({ fluxo: { ...input().fluxo!, exh: [{ extremo: "baixo", niveis: [402, 401, 400] }] } })).reasons).toContain("fluxo.exh");
  });

  test("a score moving 10 points or more is material, 9.99 is not", () => {
    expect(materialChange(base, next({ candidatos: [zone("a1b2c3d4e5f6", 45.9), { id: "manter", tipo: "manter" }, { id: "perp:BTC-USDT-SWAP", tipo: "perp" }] })).reasons).toContain("nota:zona:a1b2c3d4e5f6");
    expect(materialChange(base, next({ candidatos: [zone("a1b2c3d4e5f6", 45.89), { id: "manter", tipo: "manter" }, { id: "perp:BTC-USDT-SWAP", tipo: "perp" }] })).changed).toBe(false);
  });

  test("a datum older than its TTL is material", () => {
    const stale = next({ idades: { fluxo: 800, zonas: 1500, regime: 900_000 } });
    expect(materialChange(base, stale, { regime: 600_000 }).reasons).toContain("idade:regime");
    expect(materialChange(base, stale).changed).toBe(false); // no TTL given for it
  });
});
