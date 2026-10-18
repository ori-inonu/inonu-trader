/**
 * Journals SINTÉTICOS no formato dos journals reais do agente, para os testes: nunca dados reais. Um processo de preço
 * por token com um estado latente `a` (AR(1)) observável no brief (como o RSI) e que, com `signal > 0`, empurra o
 * retorno dos próximos passos. Com `signal = 0` o preço é um passeio aleatório puro e nenhum modelo pode ter sinal:
 * serve para medir se a máquina de veredito inventa sinal. Puro e determinístico (semente).
 */

import type { Journals } from "./report.ts";
import { createRng, type Rng } from "./rng.ts";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const STEP_MS = 5 * 60_000;
const LOOK_MS = 144_000;

export interface SyntheticOptions {
  readonly seed: number;
  readonly tokens: number;
  readonly looks: number;
  /** Força com que o estado latente move o retorno seguinte. 0 = sem sinal. */
  readonly signal: number;
  readonly startMs?: number;
  /** Fração das decisões de não agir que entram no placar. Padrão 0,3. */
  readonly scoreboardShare?: number;
}

function randomAddress(rng: Rng): string {
  let out = "";
  for (let i = 0; i < 44; i += 1) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return out;
}

function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

interface TokenPath {
  readonly address: string;
  /** preço no fim de cada passo de 5 min, desde o passo 0 */
  readonly price: number[];
  readonly state: number[];
}

function buildPaths(options: SyntheticOptions, rng: Rng): TokenPath[] {
  const steps = Math.ceil((options.looks * LOOK_MS) / STEP_MS) + 60;
  const sigma = 0.004;
  const kappa = options.signal * sigma;
  const out: TokenPath[] = [];
  for (let t = 0; t < options.tokens; t += 1) {
    const price: number[] = [0.001 * (1 + rng())];
    const state: number[] = [gaussian(rng)];
    for (let k = 1; k < steps; k += 1) {
      const prev = state[k - 1] as number;
      state.push(0.9 * prev + Math.sqrt(1 - 0.81) * gaussian(rng));
      const ret = kappa * prev + sigma * gaussian(rng);
      price.push((price[k - 1] as number) * Math.exp(ret));
    }
    out.push({ address: randomAddress(rng), price, state });
  }
  return out;
}

const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;

export function syntheticJournals(options: SyntheticOptions): Journals {
  const rng = createRng(options.seed);
  const start = options.startMs ?? Date.UTC(2026, 9, 17, 0, 0, 0);
  const share = options.scoreboardShare ?? 0.3;
  const paths = buildPaths(options, rng);
  const stepOf = (ms: number): number => Math.max(0, Math.floor((ms - start) / STEP_MS));
  const priceAt = (t: TokenPath, ms: number): number => t.price[Math.min(t.price.length - 1, stepOf(ms))] as number;
  const retOver = (t: TokenPath, ms: number, minutes: number): number => (priceAt(t, ms) / priceAt(t, ms - minutes * 60_000) - 1) * 100;

  const briefs: Array<Record<string, unknown>> = [];
  const scoreboard: Array<Record<string, unknown>> = [];
  const closings: Array<Record<string, unknown>> = [];
  const decisionsMeta: Array<Record<string, unknown>> = [];
  const equity: Array<Record<string, unknown>> = [];
  const WINDOWS: Array<[string, number]> = [["15m", 15 * 60_000], ["1h", 3_600_000], ["4h", 4 * 3_600_000]];
  const lastMark = new Map<string, number>();

  for (let i = 0; i < options.looks; i += 1) {
    const atMs = start + 6 * 3_600_000 + i * LOOK_MS;
    const cycleId = `cy-synthetic-${i.toString(36).padStart(5, "0")}-${Math.floor(rng() * 1e6).toString(36)}`;
    // 7 candidatos: uma rotação fixa dos tokens, com um pouco de aleatoriedade
    const picked = new Set<number>();
    while (picked.size < Math.min(7, options.tokens)) picked.add(Math.floor(rng() * options.tokens));
    const candidates: Array<Record<string, unknown>> = [{ id: "hold:token:501:native@agente", kind: "holding", stances: ["hold"], marks: [], families: [], triggers: [] }];
    const compras: Record<string, unknown> = {};
    const verdicts: Record<string, unknown> = {};
    const requested: Record<string, string> = {};
    const facets: Record<string, unknown> = {};
    for (const idx of picked) {
      const t = paths[idx] as TokenPath;
      const id = `buy:token:501:${t.address}`;
      const a = t.state[stepOf(atMs)] as number;
      const hasMomentum = rng() < 0.5;
      const rsi = Math.round(Math.min(95, Math.max(5, 50 + 12 * a + 3 * gaussian(rng))));
      const item: Record<string, unknown> = {
        s: `TK${idx}`,
        n: rng() < 0.3 ? Math.round(50 + 30 * rng()) : null,
        w: rng() < 0.3 ? 1 + Math.floor(rng() * 5) : 0,
        p: null,
        b: Math.round(48 + 16 * rng()),
        l: Math.round(100 + 3000 * rng()),
        v: Math.round(200 + 9000 * rng()),
        c: round(gaussian(rng) * 20, 1),
        h: Math.round(1000 + 50000 * rng()),
        t: Math.round(10 + 40 * rng()),
        d: 0,
        u: 0,
        r: 1 + Math.floor(rng() * 2),
        m: [],
        f: ["fluxo", "liquidez"],
        x: 68.4,
        y: 0,
        i: round(rng() * 0.4, 2),
        o: ["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"],
        pf: ["alvo_2", "alvo_5"],
        k: 0.0005,
        inf: Math.round(gaussian(rng) * 100),
        ut: Math.round(500 + 5000 * rng()),
        tm: { rsi, rp: Math.round(rng() * 100), r4: round(retOver(t, atMs, 240), 1), r24: round(gaussian(rng) * 10, 1), up: Math.round(rng() * 40), dd: Math.round(rng() * 30), sg: round(1 + rng() * 5, 2) },
        ...(hasMomentum ? { mo: { r5: round(retOver(t, atMs, 5), 1), r15: round(retOver(t, atMs, 15), 1), r1: round(retOver(t, atMs, 60), 1), rg: round(1 + rng() * 5, 1), vr: round(rng() * 3, 1), ag: 5 } } : {}),
      };
      compras[id] = item;
      candidates.push({ id, kind: "buy", stances: ["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"], marks: [], families: ["fluxo"], triggers: [] });
      // probabilidades do Jev: independentes do futuro (o Jev do teste não tem sinal), arredondadas a 2 casas
      const pb = Math.min(0.7, Math.max(0, rng() ** 3 * 0.9));
      const skip = round(1 - pb, 2);
      const tenth = round(pb * 0.8, 2);
      verdicts[id] = { skip, buy_tenth: tenth, buy_third: round(pb * 0.15, 2), buy_two_thirds: round(pb * 0.05, 2), buy_full: 0 };
      requested[id] = tenth > skip ? "buy_tenth" : "skip";
      facets[id] = { late_entry: round(rng(), 2), still_falling: round(rng(), 2), accumulating: round(rng(), 2), exit_easy: round(rng(), 2), distribution: round(rng(), 2), fading: round(rng(), 2) };

      // placar: só uma parte dos candidatos, com no máximo uma marca por token por hora
      const markKey = `${t.address}`;
      if (rng() < share && (lastMark.get(markKey) ?? -Infinity) + 3_600_000 <= atMs) {
        lastMark.set(markKey, atMs);
        const key = `${cycleId}:${id}|inacao`;
        scoreboard.push({ kind: "decision", key, cycleId, atMs, mode: "limitado", side: "sell", candidateId: id, chainIndex: "501", address: t.address, symbol: `TK${idx}`, stance: "skip", usd: 10, entryPriceUsd: priceAt(t, atMs), costUsd: null, posture: "neutra", profile: null, source: "modelo", families: ["fluxo"], triggers: [], wallet: "agente", inaction: true, facets: facets[id] });
        for (const [w, ms] of WINDOWS) {
          const missing = rng() < 0.07;
          scoreboard.push({ kind: "settlement", key, window: w, settledAtMs: atMs + ms + 120_000, priceUsd: missing ? null : priceAt(t, atMs + ms), reason: missing ? "sem_preco" : null });
        }
      }
      // fechamentos: só quando a escolha é comprar
      if (requested[id] === "buy_tenth") {
        const spent = rng() < 0.6;
        const quoteStart = atMs + 10_000;
        closings.push({
          v: 1,
          phase: "closing",
          cycleId,
          candidateId: id,
          requestId: `rq-${i}`,
          atMs: quoteStart,
          mode: "shadow",
          first: { pBuy: tenth, appliedByGate: "buy_tenth" },
          quote: spent ? { startedAtMs: quoteStart + 1, receivedAtMs: quoteStart + 1000 + Math.round(rng() * 300), disposition: "ok", fingerprint: `fp-${randomAddress(rng)}`, facts: { impactPct: -0.2 } } : null,
          quoteFailure: null,
          refusal: null,
          brief: spent ? { v: 1, cob: "parcial", sua: { p: tenth, f: { late_entry: 20, still_falling: 30, accumulating: 60, exit_easy: 80, distribution: 20, fading: 50 } }, cand: item, cot: { e: "ok", imp: -0.2, entra: 0.25 } } : null,
          answer: spent ? { buy: round(rng() * 0.3, 2), skip: 0.8 } : null,
          would: spent ? "skip" : null,
          wouldReason: spent ? "resposta_do_jev" : "reserva_para_primarias",
          applied: "buy_tenth",
          placed: "antes",
          phaseStartedAtMs: quoteStart,
          askedAtMs: spent ? quoteStart + 1100 : null,
          answeredAtMs: spent ? quoteStart + 1400 : null,
        });
      }
    }
    briefs.push({
      cycleId,
      atMs,
      mode: "limitado",
      briefHash: `bh-${i}-${Math.floor(rng() * 1e9).toString(16)}`,
      candidates,
      brief: { compras, posicoes: {}, carteira: {} },
      verdicts,
      requested,
      facets,
      contexto: { btc_1h: round(gaussian(rng) * 0.3, 1), btc_4h: 0.1, btc_24h: 0.4, eth_24h: 0.5, fund_btc_bps: 0.8, oi_btc_1h: 0.3 },
      posture: "neutra",
      valid: true,
    });
    decisionsMeta.push({ cycleId, atMs, metadata: { schemaVersion: 1, sourceRecordHash: `h-${i}-${randomAddress(rng)}`, askedAtMs: atMs + 9_000, answeredAtMs: atMs + 9_380, recordedAtMs: atMs + 9_400, factAvailableAtMs: atMs + 8_990, arm: "A" } });
    if (i % 2 === 0) {
      const held = paths[0] as TokenPath;
      equity.push({ atMs, usd: null, holdings: [{ id: `501:${held.address}`, units: 1000, priceUsd: priceAt(held, atMs) }] });
    }
  }
  return {
    briefs,
    scoreboard,
    closings,
    decisionsMeta,
    equity,
    files: {
      "briefs.jsonl": { lines: briefs.length, malformed: 0 },
      "scoreboard.jsonl": { lines: scoreboard.length, malformed: 0 },
      "closings.jsonl": { lines: closings.length, malformed: 0 },
      "decisions-meta.jsonl": { lines: decisionsMeta.length, malformed: 0 },
      "equity.jsonl": { lines: equity.length, malformed: 0 },
      "answers.jsonl": null,
      "prices.jsonl": null,
      "fills.jsonl": null,
    },
  };
}

/** Os journals sintéticos como texto JSONL por arquivo, para o teste do script que lê de uma pasta. */
export function toJsonl(rows: ReadonlyArray<Record<string, unknown>>): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length === 0 ? "" : "\n");
}
