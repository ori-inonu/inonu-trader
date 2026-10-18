// Replay real: lê data/events.jsonl em streaming (linha a linha) e passa cada oportunidade
// reconstruível pelo evaluate() de src/decision/pipeline.ts. Campo ausente vira contagem, nunca valor inventado.
// Run: bun --no-env-file scripts/replay-real.ts [--events <caminho.jsonl>]
// Padrão: data/events.jsonl do worktree. --events lê outro arquivo (ex.: checkout principal), somente leitura.
// Saída: data/bench/replay-real.json (do worktree). Não altera o arquivo de eventos nem outros arquivos de data/.
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { evaluate } from "../src/decision/pipeline";
import type { Decision, Limits, Opportunity, Portfolio } from "../src/decision/types";
import { wilsonInterval } from "../src/lab/stats";
import { LIMITS } from "./bench-decision";

export const SOURCE = "data/events.jsonl";
export const EDGE_MIN_BPS = 30;

export interface ReplayOptions {
  /** Carteira real. O evento não traz estado de carteira: sem isto nenhuma oportunidade é avaliada. */
  portfolio?: Portfolio;
  limits?: Limits;
  /** Rótulo de origem gravado no relatório. */
  source?: string;
}

export interface Reconstrucao {
  original: "buy" | "sell" | "hold" | null;
  /** Campos obrigatórios do Opportunity que o evento não fornece. Vazio => reconstruível. */
  ausentes: string[];
  opp?: Opportunity;
}

export interface Report {
  source: string;
  generatedAt: string;
  lidos: number;
  malformados: number;
  validos: number;
  semDecisao: number;
  decisaoOriginal: { buy: number; sell: number; hold: number };
  comDadoSuficiente: number;
  avaliadosPeloPipeline: number;
  decisoesPipeline: Record<Decision["action"], number>;
  naoOperarPorMotivo: Record<string, number>;
  edgeLiquido: {
    minBps: number;
    n: number;
    acima: number;
    fracao: number | null;
    ic95: [number, number] | null;
    motivo: string;
  };
  camposAusentes: Record<string, number>;
  divergenciaSpread: number;
  nota: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const COST_KEYS = ["dexFeeBps", "slippageBps", "impactBps", "mevBps", "exitExtraBps", "gasUsd", "failProb", "failCostUsd"] as const;

/** Reconstrói uma oportunidade do evento. Nunca preenche campo ausente: registra e segue. */
export function reconstruir(ev: Obj, linha: number, portfolio?: Portfolio): Reconstrucao {
  const dec = ev.decision == null ? undefined : obj(ev.decision);
  const act = dec?.action;
  const original = act === "buy" || act === "sell" || act === "hold" ? act : null;
  const side = original === "buy" || original === "sell" ? original : undefined;
  const ts = num(ev.ts);
  const up = num(dec?.upIn10);
  // upIn10 é a probabilidade de alta em 10 blocos: a de acerto é essa para compra e o complemento para venda.
  const pWin = up === undefined || side === undefined ? undefined : side === "buy" ? up : 1 - up;
  const costs = obj(ev.costs);
  const campos: [string, unknown][] = [
    ["venue", str(ev.venue)], ["chain", str(ev.chain)], ["symbol", str(ev.symbol)], ["side", side],
    ["atMs", ts], ["quoteAtMs", ts], ["priceUsd", num(ev.priceUsd)], ["upBps", num(ev.upBps)], ["downBps", num(ev.downBps)],
    ["pWin", pWin], ["horizonMs", num(ev.horizonMs)], ["liquidityUsd", num(ev.liquidityUsd)], ["riskScore", num(ev.riskScore)],
    ["costs.spreadBps", num(ev.spreadBps)],
    ...COST_KEYS.map((k) => [`costs.${k}`, num(costs[k])] as [string, unknown]),
    ["portfolio", portfolio],
  ];
  const ausentes = campos.filter(([, v]) => v === undefined).map(([k]) => k);
  if (ausentes.length > 0 || portfolio === undefined) return { original, ausentes };
  const f = Object.fromEntries(campos) as Record<string, unknown>;
  const n = (k: string) => f[k] as number;
  const opp: Opportunity = {
    id: `linha-${linha}`, venue: f.venue as string, chain: f.chain as string, symbol: f.symbol as string,
    side: side as "buy" | "sell", atMs: n("atMs"), quoteAtMs: n("quoteAtMs"), priceUsd: n("priceUsd"),
    upBps: n("upBps"), downBps: n("downBps"), pWin: n("pWin"), horizonMs: n("horizonMs"),
    liquidityUsd: n("liquidityUsd"), riskScore: n("riskScore"),
    costs: {
      dexFeeBps: n("costs.dexFeeBps"), spreadBps: n("costs.spreadBps"), slippageBps: n("costs.slippageBps"),
      impactBps: n("costs.impactBps"), mevBps: n("costs.mevBps"), exitExtraBps: n("costs.exitExtraBps"),
      gasUsd: n("costs.gasUsd"), failProb: n("costs.failProb"), failCostUsd: n("costs.failCostUsd"),
    },
  };
  return { original, ausentes, opp };
}

/** Spread reportado diverge do bid/ask em mais de 1 bp: contagem de inconsistência, não correção. */
function spreadDivergente(ev: Obj): boolean {
  const bid = num(ev.bestBid), ask = num(ev.bestAsk), mid = num(ev.mid), s = num(ev.spreadBps);
  if (bid === undefined || ask === undefined || mid === undefined || s === undefined || mid <= 0) return false;
  return Math.abs(((ask - bid) / mid) * 10_000 - s) > 1;
}

/** Lê linhas (streaming ou array), conta tudo e devolve o relatório. Linha malformada é ignorada e contada. */
export async function replay(lines: AsyncIterable<string> | Iterable<string>, opts: ReplayOptions = {}): Promise<Report> {
  const limits = opts.limits ?? LIMITS;
  const original = { buy: 0, sell: 0, hold: 0 };
  const pipeline: Record<Decision["action"], number> = { COMPRAR: 0, VENDER: 0, NAO_OPERAR: 0 };
  const motivos: Record<string, number> = {};
  const ausentes = new Map<string, number>();
  let lidos = 0, malformados = 0, validos = 0, semDecisao = 0, suficientes = 0, avaliados = 0, acima = 0, divergencia = 0;
  let linha = 0;
  for await (const raw of lines) {
    const texto = raw.trim();
    if (texto === "") continue;
    lidos++;
    linha++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(texto);
    } catch {
      malformados++;
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      malformados++;
      continue;
    }
    validos++;
    const ev = parsed as Obj;
    if (spreadDivergente(ev)) divergencia++;
    const rec = reconstruir(ev, linha, opts.portfolio);
    if (rec.original === null) semDecisao++;
    else original[rec.original]++;
    for (const c of rec.ausentes) ausentes.set(c, (ausentes.get(c) ?? 0) + 1);
    const opp = rec.opp;
    if (!opp || !opts.portfolio) continue;
    suficientes++;
    const d = evaluate(opp, opts.portfolio, limits, { now: () => opp.atMs });
    avaliados++;
    pipeline[d.action]++;
    if (d.action === "NAO_OPERAR") {
      const motivo = d.reasons[0] ?? "sem_motivo";
      motivos[motivo] = (motivos[motivo] ?? 0) + 1;
    }
    if (d.netEdgeBps >= EDGE_MIN_BPS) acima++;
  }
  const ic = avaliados > 0 ? wilsonInterval(acima, avaliados) : null;
  return {
    source: opts.source ?? SOURCE,
    generatedAt: new Date().toISOString(),
    lidos, malformados, validos, semDecisao,
    decisaoOriginal: original,
    comDadoSuficiente: suficientes,
    avaliadosPeloPipeline: avaliados,
    decisoesPipeline: pipeline,
    naoOperarPorMotivo: motivos,
    edgeLiquido: {
      minBps: EDGE_MIN_BPS,
      n: avaliados,
      acima,
      fracao: avaliados > 0 ? acima / avaliados : null,
      ic95: ic ? [Math.round(ic[0] * 1e4) / 1e4, Math.round(ic[1] * 1e4) / 1e4] : null,
      motivo: avaliados > 0
        ? "medido sobre avaliadosPeloPipeline"
        : "schema não permite reconstruir edge líquido: nenhum evento reúne os campos obrigatórios do Opportunity (ver camposAusentes); nada foi estimado",
    },
    camposAusentes: Object.fromEntries([...ausentes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    divergenciaSpread: divergencia,
    nota: "pWin vem de decision.upIn10 (complemento para venda). Não existem no evento: venue, chain, symbol, priceUsd, upBps, downBps, horizonMs, liquidez, riskScore, custos em USD (gasMon é em MON), slippage, impacto, MEV, falha e portfólio. Nenhum valor foi preenchido nem zerado.",
  };
}

export async function main(events: string = SOURCE): Promise<Report> {
  const root = resolve(import.meta.dir, "..");
  const rl = createInterface({ input: createReadStream(resolve(root, events)), crlfDelay: Infinity });
  const report = await replay(rl, { source: events });
  const out = resolve(root, "data/bench/replay-real.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/** Lê --events <caminho> da linha de comando; sem a opção usa o arquivo padrão do worktree. */
function eventsArg(argv: string[] = process.argv): string {
  const i = argv.indexOf("--events");
  if (i === -1) return SOURCE;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error("--events exige um caminho");
  return v;
}

if (import.meta.main) {
  const r = await main(eventsArg());
  console.log(`lidos=${r.lidos} malformados=${r.malformados} suficientes=${r.comDadoSuficiente} edge=${r.edgeLiquido.motivo}`);
}
