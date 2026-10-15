import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { endpointFor } from "../onchain-read/catalog";
import { MAX_BRIEF_BYTES, buildBrief } from "./brief";
import { buildOnchainDigest, onchainBriefInput, type DigestInput } from "./onchain-digest";
import type { GatewayLike } from "./onchain-nulos";

/** What the gateway's normalizers emit for the real-shaped fixtures, wrapped as the gateway envelope. */
function gw(route: string, fixture: string, ageMs = 30_000): GatewayLike {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL(`../onchain-read/fixtures/${fixture}.json`, import.meta.url)), "utf8"));
  const n = endpointFor(route)!.normalize(raw.data);
  if (!n.ok) throw new Error(`${fixture} does not normalize`);
  return { ok: true, data: n.data, meta: { ageMs, stale: false } };
}

const TARGET = { chainIndex: "1", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" };
const SETS = { netUnsoldUsd: [100, 400, 900, 1500, 2600, 4100, 6200, 9100, 15000, 22000], liquidityUsd: [1e5, 5e5, 1e6, 5e6, 2e7, 1e8] };
const OKX = { origin: "okx_instrument" } as const;

function full(overrides: Partial<DigestInput["sources"]> = {}): DigestInput {
  return {
    sources: {
      signals: gw("/onchain/signals", "signals-live", 120_000),
      risk: gw("/onchain/token-risk", "token-risk", 41_000),
      cluster: gw("/onchain/clusters", "clusters", 60_000),
      priceInfo: gw("/onchain/price-info", "price-info", 20_000),
      pools: gw("/onchain/pools", "pools", 200_000),
      trades: gw("/onchain/trades", "trades", 10_000),
      sentiment: gw("/onchain/sentiment", "sentiment", 90_000),
      quote: gw("/onchain/quote", "quote", 5_000),
      ...overrides,
    },
    sets: SETS,
    quality: null,
    symbol: OKX,
  };
}

describe("buildOnchainDigest with every source answering", () => {
  const digest = buildOnchainDigest(full());

  test("the trail is a 0 to 100 note over the components that exist, with the absent ones listed", () => {
    expect(digest.trilha).not.toBeNull();
    expect(digest.trilha!.nota).toBeGreaterThan(0);
    expect(digest.trilha!.nota).toBeLessThanOrEqual(100);
    // quality needs full wallet addresses joined with the leaderboard: not supplied here
    expect(digest.trilha!.componentesAusentes).toContain("qualidade");
    expect(digest.nulos["trilha.qualidade"]).toBe("sem_enderecos");
    expect(Object.keys(digest.trilha!.componentes).sort()).toEqual(["carteiras", "compra", "concentracao", "fluxo", "liquidez", "naoVendida", "qualidade", "risco", "sentimento"]);
  });

  test("risk keeps the provider's level and only documented flags", () => {
    // the fixture holds 74.0083 percent in the top 10, above the prior of 50: the derived flag is added to the documented tag
    expect(digest.risco).toEqual({ nivel: 1, flags: ["communityRecognized", "top10_alto"] });
    // the fixture carries one undocumented tag (ok_tag-2): it never reaches the Brief
    expect(JSON.stringify(digest)).not.toContain("ok_tag-2");
    expect(digest.nulos["risco.tags_descartadas"]).toBe("1");
  });

  test("the risk component is (5 - level) / 5", () => {
    expect(digest.trilha!.componentes.risco).toBeCloseTo(0.8, 3);
  });

  test("flow is an approximation and says so", () => {
    expect(digest.fluxo).toMatchObject({ aprox: true });
    expect((digest.fluxo as { buyShare: number }).buyShare).toBeGreaterThanOrEqual(0);
  });

  test("each answered source carries its age and the origin is OnchainOS", () => {
    expect(digest.idades.signals).toBe(120_000);
    expect(digest.idades["token-risk"]).toBe(41_000);
    expect(digest.origens.signals).toBe("onchainos");
    expect(digest.origens["token-risk"]).toBe("onchainos");
  });

  test("the digest is deterministic", () => {
    expect(JSON.stringify(buildOnchainDigest(full()))).toBe(JSON.stringify(digest));
  });
});

describe("the three states of the unknown reach the notes (F2-DIG-3)", () => {
  test("a skipped call, an empty answer and a failure are told apart", () => {
    const d = buildOnchainDigest(full({ signals: { ok: false, error: "budget_exhausted" }, cluster: { ok: true, data: null }, trades: { ok: false, error: "schema" } }));
    expect(d.nulos["trilha.compra"]).toBe("nao_consultado:orcamento");
    expect(d.nulos["trilha.carteiras"]).toBe("nao_consultado:orcamento");
    expect(d.nulos["trilha.naoVendida"]).toBe("nao_consultado:orcamento");
    expect(d.nulos["trilha.fluxo"]).toBe("erro:schema");
    expect(d.trilha!.componentesAusentes).toEqual(expect.arrayContaining(["compra", "carteiras", "naoVendida", "fluxo"]));
    // the cluster answered empty: the concentration falls back to the top 10 share of the risk answer, and says so
    expect(d.trilha!.componentes.concentracao).not.toBeNull();
    expect(d.nulos.clusters).toBe("vazio_valido");
  });

  test("a source that was not asked for is its own reason", () => {
    const sources = full().sources;
    const { quote: _quote, ...rest } = sources;
    const d = buildOnchainDigest({ ...full(), sources: rest });
    expect(d.nulos.quote).toBe("nao_consultado:nao_pedido");
  });

  test("nothing at all gives a digest without a score, not a zero", () => {
    const d = buildOnchainDigest({ sources: {}, sets: { netUnsoldUsd: [], liquidityUsd: [] }, quality: null, symbol: OKX });
    expect(d.trilha!.nota).toBeNull();
    expect(d.trilha!.componentesAusentes).toHaveLength(9);
    expect(d.risco).toBeNull();
  });

  test("an empty reference set leaves the purchase and liquidity absent with their own reason", () => {
    const d = buildOnchainDigest({ ...full(), sets: { netUnsoldUsd: [], liquidityUsd: [] } });
    expect(d.nulos["trilha.compra"]).toBe("sem_conjunto");
    expect(d.nulos["trilha.liquidez"]).toBe("sem_conjunto");
  });
});

describe("honeypot zeroes the note (SMT-4)", () => {
  test("a quote that flags the token", () => {
    const quote = gw("/onchain/quote", "quote");
    const flagged = { ...quote, data: { ...(quote as { data: Record<string, unknown> }).data, toToken: { ...((quote as { data: { toToken: object } }).data.toToken), isHoneyPot: true } } } as GatewayLike;
    const d = buildOnchainDigest(full({ quote: flagged }));
    expect(d.honeypot).toBe(true);
    expect(d.trilha!.nota).toBe(0);
    expect(d.risco!.flags).toContain("honeypot");
  });
  test("an answer from nowhere is unknown, not safe, and the note is not zeroed", () => {
    const d = buildOnchainDigest(full({ quote: undefined, risk: { ok: false, error: "rate_limited" } }));
    expect(d.honeypot).toBeNull();
    expect(d.trilha!.nota).toBeGreaterThan(0);
  });
});

describe("what the tracked wallets paid, against the price now (V-CUSTO-1)", () => {
  const signals: GatewayLike = {
    ok: true,
    data: [
      { amountUsd: 1000, soldRatioPct: 10, walletCount: 3, priceUsd: 2.0 },
      { amountUsd: 3000, soldRatioPct: 50, walletCount: 4, priceUsd: 2.5 },
    ],
    meta: { ageMs: 1_000, stale: false },
  };
  const priceInfo: GatewayLike = { ok: true, data: [{ price: 2.5, liquidityUsd: 1e6, change: { m5: 0.1, h1: 0.2, h4: 0.3, h24: 0.4 }, volume: { m5: 1, h1: 2, h4: 3, h24: 4 } }], meta: { ageMs: 2_000, stale: false } };

  test("the volume weighted cost in basis points of the price, and the share already sold", () => {
    const d = buildOnchainDigest(full({ signals, priceInfo }));
    // cost (2 x 1000 + 2.5 x 3000) / 4000 = 2.375; price 2.5: (2.375 - 2.5) / 2.5 = -5 percent = -500 bps; sold 0.4
    expect((d.fluxo as { custo: unknown }).custo).toEqual({ sinaisBps: -500, distribuicao: 0.4, corroborado: false });
  });

  test("without the price now the cost is kept and the distance is unknown, not zero", () => {
    const { priceInfo: _unused, ...rest } = full({ signals }).sources;
    const d = buildOnchainDigest({ ...full(), sources: { ...rest, signals } });
    expect((d.fluxo as { custo: { sinaisBps: number | null } }).custo.sinaisBps).toBeNull();
  });

  test("the top traders of wallet type 3 corroborate only with an ATR, which a token digest does not have yet: never claimed", () => {
    const topTraders: GatewayLike = { ok: true, data: [{ wallet: "w", avgBuyPrice: 2.3, boughtAmount: 1000, soldAmount: 100 }], meta: { ageMs: 1_000, stale: false } };
    const d = buildOnchainDigest(full({ signals, priceInfo, topTraders }));
    expect((d.fluxo as { custo: { corroborado: boolean } }).custo.corroborado).toBe(false);
  });

  test("no usable signal means no cost at all", () => {
    const d = buildOnchainDigest(full({ signals: { ok: true, data: [] } }));
    expect((d.fluxo as { custo: unknown }).custo).toBeNull();
  });
});

describe("what never reaches the Brief", () => {
  test("full wallet addresses of the internal shape are not copied", () => {
    const signals = full().sources.signals as { ok: true; data: Array<Record<string, unknown>>; meta: { ageMs: number; stale: boolean } };
    const withWallets = { ...signals, data: signals.data.map((r) => ({ ...r, wallets: ["WalletPlaceholder1111111111111111111111111111"] })) };
    const d = buildOnchainDigest(full({ signals: withWallets }));
    expect(JSON.stringify(d)).not.toContain("WalletPlaceholder");
  });
  test("no text of third parties: names, symbols, pool names and protocols stay out", () => {
    const s = JSON.stringify(buildOnchainDigest(full()));
    for (const word of ["WETH", "Uniswap", "Wrapped", "http"]) expect(s).not.toContain(word);
  });
  test("the numeric cluster fields, whose scale is ambiguous, do not enter the note", () => {
    const s = JSON.stringify(buildOnchainDigest(full()));
    for (const word of ["top100", "sameFundSource", "rugPull", "holderNewAddress"]) expect(s).not.toContain(word);
  });
});

describe("onchainBriefInput", () => {
  test("goes through buildBrief, stays under 2 KB and has a stable hash", () => {
    const digest = buildOnchainDigest(full());
    const input = onchainBriefInput(TARGET, 1_791_850_000_000, digest);
    const a = buildBrief(input);
    const b = buildBrief(onchainBriefInput(TARGET, 1_791_850_000_000, buildOnchainDigest(full())));
    expect(a.bytes).toBeLessThan(MAX_BRIEF_BYTES);
    expect(a.brief.hash).toBe(b.brief.hash);
  });
  test("the candidate is a token with its note and the only other choice is to hold", () => {
    const input = onchainBriefInput(TARGET, 1, buildOnchainDigest(full()));
    expect(input.candidatos.map((c) => c.id)).toEqual([`token:1:${TARGET.address}`, "manter"]);
    expect(input.candidatos[0]!.tipo).toBe("token");
    expect(input.regime).toBeNull();
    expect(input.nulos.regime).toBe("nao_se_aplica_a_token");
  });
  test("a note that was not computed does not invent a candidate note", () => {
    const empty = buildOnchainDigest({ sources: {}, sets: { netUnsoldUsd: [], liquidityUsd: [] }, quality: null, symbol: OKX });
    const input = onchainBriefInput(TARGET, 1, empty);
    expect(input.candidatos[0]).toEqual({ id: `token:1:${TARGET.address}`, tipo: "token" });
  });
});
