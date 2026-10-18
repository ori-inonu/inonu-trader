// RAS-6, AC-RAS-2: "Pedir ao Inonu" over the rows chosen in the Rastreador (two to five OKX instruments). One click reads each chosen
// instrument through the same source the single-instrument mode uses, makes ONE Brief with one candidate per instrument (plus holding),
// and the model chooses among those ids. No OnchainOS call is made. The model is not involved here (it only chooses among the ids this
// source produced). origin: synthetic_fixture, tests only; the exchange reads are fake.
import { describe, expect, test } from "bun:test";
import { MAX_BRIEF_BYTES, buildBrief, type BriefCandidate } from "../intel/brief";
import { HOLD_CANDIDATE, perpCandidate, spotCandidate } from "../intel/candidates";
import { SourceError, type AskRequest, type BriefSource } from "./ask";
import { createRankingSource } from "./source-ranking";

const NOW = 1_800_000_000_000;

interface Plan {
  readonly zones?: readonly { readonly nota: number; readonly fatores: readonly string[] }[];
  readonly negocios?: number;
  readonly razao?: number | null;
  readonly imb?: { readonly c: number; readonly v: number } | null;
  readonly ageMs?: number;
}

/** What the single-instrument source builds for an instrument, reduced to what the ranking reads. */
function okxBrief(instId: string, plan: Plan = {}) {
  const zones: BriefCandidate[] = (plan.zones ?? []).map((zone, index) => ({
    id: `zona:${instId.slice(0, 3).toLowerCase()}${index}`.padEnd(17, "0"),
    tipo: "zona" as const,
    limitesBps: [-80 - index, -40 - index] as const,
    nota: zone.nota,
    fatores: [...zone.fatores],
    estado: "ativa",
    idadeBarras: 3,
    invalidacaoBps: -120,
  }));
  const swap = instId.endsWith("-SWAP");
  const candidates: BriefCandidate[] = [...zones, swap ? perpCandidate(instId) : spotCandidate(instId), HOLD_CANDIDATE];
  const { brief } = buildBrief({
    alvo: { instId },
    asOfMs: NOW,
    familiasHabilitadas: ["E2", "E3"],
    fluxo: {
      janela: { negocios: plan.negocios ?? 300, desdeMs: NOW - 60_000, ateMs: NOW - 200, rejeitados: 0 },
      deltaRazao: plan.razao === undefined ? 0.125 : plan.razao,
      imb: plan.imb === undefined ? { c: 2, v: 1 } : plan.imb,
      seq: null,
      prg: null,
      exh: null,
    },
    candidatos: candidates,
    trilha: null,
    risco: null,
    regime: null,
    idades: { fluxo: plan.ageMs ?? 250, velas: 40_000 },
    origens: { fluxo: "okx_ws_trades", velas: "okx_rest", zonas: "okx_rest" },
    nulos: { trilha: "ativo da OKX: sem carteiras rastreadas", ...(plan.imb === null ? { "fluxo.imb": "aquecimento" } : {}) },
  });
  return { brief, candidates, onchainosCalls: 0 };
}

class FakeOkx implements BriefSource {
  readonly asked: AskRequest[] = [];
  constructor(private readonly plans: Record<string, Plan | Error | undefined> = {}) {}
  async build(request: AskRequest) {
    this.asked.push(request);
    const instId = request.alvo !== undefined && "instId" in request.alvo ? request.alvo.instId : "";
    const plan = this.plans[instId];
    if (plan instanceof Error) throw plan;
    return okxBrief(instId, plan);
  }
}

const ranking = (...ids: string[]): AskRequest => ({ modo: "ranking", alvos: ids.map((instId) => ({ instId })) });
const context = (signal = new AbortController().signal) => ({ signal, maxOnchainosCalls: 15 });
const make = (okx: BriefSource) => createRankingSource({ okx, now: () => NOW });
const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return "ok";
  } catch (error) {
    return error instanceof SourceError ? error.code : "other";
  }
};

describe("one Brief over the chosen rows (RAS-6)", () => {
  test("each chosen instrument is read once through the instrument source, in the mode ativo, and no OnchainOS call is spent", async () => {
    const okx = new FakeOkx();
    const built = await make(okx).build(ranking("BTC-USDT", "ETH-USDT-SWAP", "SOL-USDT"), context());
    expect(okx.asked).toEqual([
      { modo: "ativo", alvo: { instId: "BTC-USDT" } },
      { modo: "ativo", alvo: { instId: "ETH-USDT-SWAP" } },
      { modo: "ativo", alvo: { instId: "SOL-USDT" } },
    ]);
    expect(built.onchainosCalls).toBe(0);
    expect(built.brief.alvo).toEqual({ escopo: "ranking", instIds: ["BTC-USDT", "ETH-USDT-SWAP", "SOL-USDT"] });
  });

  test("the model's choices are the instruments and holding: one id per row, spot or perpetual by what the row is", async () => {
    const built = await make(new FakeOkx()).build(ranking("BTC-USDT", "ETH-USDT-SWAP"), context());
    expect(built.candidates.map((c) => c.id).sort()).toEqual(["manter", "perp:ETH-USDT-SWAP", "spot:BTC-USDT"]);
    expect(built.brief.candidatos.map((c) => c.id).sort()).toEqual(["manter", "perp:ETH-USDT-SWAP", "spot:BTC-USDT"]);
  });

  test("an instrument carries the score of its best zone, the families that built its zones and how many zones it has", async () => {
    const okx = new FakeOkx({
      "BTC-USDT": { zones: [{ nota: 41.2, fatores: ["imbalance", "poc"] }, { nota: 63.5, fatores: ["sequencial", "poc"] }] },
      "ETH-USDT": { zones: [] },
    });
    const built = await make(okx).build(ranking("BTC-USDT", "ETH-USDT"), context());
    const btc = built.candidates.find((c) => c.id === "spot:BTC-USDT")!;
    expect(btc).toMatchObject({ tipo: "spot", nota: 63.5, estado: "zonas:2" });
    expect(btc.fatores).toEqual(["imbalance", "poc", "sequencial"]);
    const eth = built.candidates.find((c) => c.id === "spot:ETH-USDT")!;
    expect(eth.nota).toBeUndefined();
    expect(eth.estado).toBe("sem_zonas");
  });

  test("the flow of each row is a few counts, never a tick, and the age and the origin of each row are kept", async () => {
    const okx = new FakeOkx({ "BTC-USDT": { negocios: 412, razao: -0.725, imb: { c: 3, v: 0 }, ageMs: 900 }, "ETH-USDT": { negocios: 55, razao: null, imb: null, ageMs: 4_000 } });
    const { brief } = await make(okx).build(ranking("BTC-USDT", "ETH-USDT"), context());
    expect(brief.fluxo).toEqual({ itens: { "BTC-USDT": { negocios: 412, deltaRazao: -0.725, imb: { c: 3, v: 0 } }, "ETH-USDT": { negocios: 55, deltaRazao: null, imb: null } } });
    expect(brief.idades).toEqual({ "BTC-USDT": 900, "ETH-USDT": 4_000 });
    expect(brief.origens["BTC-USDT"]).toBe("okx_ws_trades");
  });

  test("a flow measure that is null says why, row by row: the model reads a gap as a gap and not as a zero", async () => {
    const okx = new FakeOkx({ "BTC-USDT": { imb: null }, "ETH-USDT": { imb: { c: 1, v: 1 } } });
    const { brief } = await make(okx).build(ranking("BTC-USDT", "ETH-USDT"), context());
    expect(brief.nulos["BTC-USDT.imb"]).toBe("aquecimento");
    expect(brief.nulos["ETH-USDT.imb"]).toBeUndefined();
  });

  test("the same rows in another order make the same Brief, hash included", async () => {
    const a = await make(new FakeOkx()).build(ranking("BTC-USDT", "ETH-USDT", "SOL-USDT"), context());
    const b = await make(new FakeOkx()).build(ranking("SOL-USDT", "BTC-USDT", "ETH-USDT"), context());
    expect(b.brief.hash).toBe(a.brief.hash);
  });

  test("five rows with rich zones still fit in the Brief, and the words of an order never appear in it", async () => {
    const rich = { zones: [{ nota: 80, fatores: ["imbalance", "sequencial", "progressao", "exaustao"] }, { nota: 55, fatores: ["poc", "hvn"] }, { nota: 31, fatores: ["lvn"] }] };
    const okx = new FakeOkx(Object.fromEntries(["BTC-USDT", "ETH-USDT", "SOL-USDT", "DOGE-USDT", "XRP-USDT-SWAP"].map((id) => [id, rich])));
    const { brief } = await make(okx).build(ranking("BTC-USDT", "ETH-USDT", "SOL-USDT", "DOGE-USDT", "XRP-USDT-SWAP"), context());
    expect(new TextEncoder().encode(JSON.stringify(brief)).length).toBeLessThanOrEqual(MAX_BRIEF_BYTES);
    expect(brief.candidatos).toHaveLength(6);
    const words = /\b(comprar|compre|vender|venda|buy|sell|hold|action|signal|recommend|vote|side|sinal)\b/i;
    // the whole Brief, not only some of its parts
    expect(words.test(JSON.stringify(brief))).toBe(false);
  });
});

describe("a row that cannot be read is out, with the reason, and never a zero (RAS-6)", () => {
  test("the rest is ranked and the failed row is a note with the constant code of the refusal", async () => {
    const okx = new FakeOkx({ "ETH-USDT": new SourceError("instrumento_nao_suportado") });
    const { brief, candidates } = await make(okx).build(ranking("BTC-USDT", "ETH-USDT", "SOL-USDT"), context());
    expect(candidates.map((c) => c.id).sort()).toEqual(["manter", "spot:BTC-USDT", "spot:SOL-USDT"]);
    expect(brief.nulos["ETH-USDT"]).toBe("instrumento_nao_suportado");
    // an unreadable row is out of the Brief everywhere but the note of why: not in the target either
    expect(brief.alvo).toEqual({ escopo: "ranking", instIds: ["BTC-USDT", "SOL-USDT"] });
    expect(brief.fluxo).toEqual({ itens: { "BTC-USDT": expect.anything(), "SOL-USDT": expect.anything() } });
  });

  test("a failure that is not a refusal travels as a constant and leaks nothing", async () => {
    const okx = new FakeOkx({ "ETH-USDT": new Error("SENTINEL-secret-value") });
    const built = await make(okx).build(ranking("BTC-USDT", "ETH-USDT", "SOL-USDT"), context());
    expect(built.brief.nulos["ETH-USDT"]).toBe("leitura_falhou");
    expect(JSON.stringify(built)).not.toContain("SENTINEL");
  });

  test("with fewer than two readable rows there is nothing to rank: the click is refused before the model, with the provider calls already spent (zero)", async () => {
    const okx = new FakeOkx({ "ETH-USDT": new SourceError("okx_rate_limited"), "SOL-USDT": new SourceError("instrumento_nao_suportado") });
    const error = await make(okx).build(ranking("BTC-USDT", "ETH-USDT", "SOL-USDT"), context()).catch((e) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).code).toBe("sem_candidatos");
    expect((error as SourceError).onchainosCalls).toBe(0);
  });
});

describe("the request and the click are guarded (RAS-6, ASK-5)", () => {
  test("five rows with the longest ids do not fit in 2 KB: the click is refused with a constant code before the model, never cut silently", async () => {
    const ids = ["A", "B", "C", "D", "E"].map((c) => `${c.repeat(20)}-${c.repeat(20)}-SWAP`);
    const error = await make(new FakeOkx()).build(ranking(...ids), context()).catch((e) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).code).toBe("brief_grande_demais");
    expect((error as SourceError).onchainosCalls).toBe(0);
  });

  test("another mode, missing rows or one row are refused with a constant code and nothing is read", async () => {
    const okx = new FakeOkx();
    const source = make(okx);
    expect(await codeOf(source.build({ modo: "ativo", alvo: { instId: "BTC-USDT" } }, context()))).toBe("modo_nao_disponivel");
    expect(await codeOf(source.build({ modo: "ranking" }, context()))).toBe("alvo_invalido");
    expect(await codeOf(source.build(ranking("BTC-USDT"), context()))).toBe("alvo_invalido");
    expect(await codeOf(source.build({ modo: "ranking", alvos: Array.from({ length: 6 }, (_, i) => ({ instId: `T${i}-USDT` })) }, context()))).toBe("alvo_invalido");
    expect(okx.asked).toHaveLength(0);
  });

  test("a click cancelled before or during the reads stops reading and answers cancelado", async () => {
    const before = new AbortController();
    before.abort();
    const okx = new FakeOkx();
    expect(await codeOf(make(okx).build(ranking("BTC-USDT", "ETH-USDT"), context(before.signal)))).toBe("cancelado");
    expect(okx.asked).toHaveLength(0);

    const during = new AbortController();
    const reads: string[] = [];
    const slow: BriefSource = {
      async build(request) {
        const id = request.alvo !== undefined && "instId" in request.alvo ? request.alvo.instId : "";
        reads.push(id);
        during.abort();
        return okxBrief(id);
      },
    };
    expect(await codeOf(make(slow).build(ranking("BTC-USDT", "ETH-USDT", "SOL-USDT"), context(during.signal)))).toBe("cancelado");
    expect(reads).toEqual(["BTC-USDT"]);
  });
});
