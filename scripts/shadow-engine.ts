// Replay do motor de decisão sobre os fechamentos REAIS do agente (closings.jsonl, somente leitura): para cada compra em que o
// modelo se inclinou e a cotação foi lida, o que o motor teria decidido com custos completos, e onde discorda da produção.
// A probabilidade do modelo NÃO é chance de ganho (a legenda do próprio brief diz): "bruta" a usa assim mesmo como teste de
// estresse da decisão de produção sob custo completo; "ausente" mostra o que sobra sem ela. Nada aqui é desempenho nem lucro.
// Run: bun --no-env-file scripts/shadow-engine.ts [--closings <closings.jsonl>] [--pwin bruta|ausente]
// Saída: data/bench/shadow-engine.json (sem ids de ciclo, endereços nem assinaturas)
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ClosingRecord } from "../src/agent/closing";
import { SHADOW_ASSUMPTIONS } from "../src/decision-shadow/adapter";
import { SHADOW_LIMITS, createEngineShadow, type PWinSource, type ShadowRecord } from "../src/decision-shadow/shadow";
import { dist, type Dist } from "../src/decision/metrics";

export interface ShadowSummary {
  generatedAt: string;
  pWinMode: PWinSource["mode"];
  total: number;
  /** Fechamentos que o motor conseguiu avaliar: todos os insumos presentes. */
  evaluated: number;
  notEvaluated: { count: number; missing: Record<string, number> };
  engine: { byAction: Record<string, number>; byReason: Record<string, number>; netEdgeBps: Dist | null; grossEdgeBps: Dist | null; costBps: Dist | null };
  production: { would: Record<string, number> };
  /** Cruzamento: o que a produção faria (comprar, pular, sem resposta) contra o que o motor decidiu. */
  agreement: Record<string, Record<string, number>>;
  /** Compras que a produção faria e o motor recusa, e o motivo principal da recusa. */
  productionBuysEngineRefuses: { count: number; byReason: Record<string, number> };
  engineOperates: number;
  assumptions: { version: string; horizonMs: number; slippageBps: number; mevBps: number; failProb: number; failCostUsd: number };
  limits: { minNetEdgeBps: number; maxQuoteAgeMs: number; maxRiskScore: number };
  limitations: string[];
}

const bump = (m: Record<string, number>, k: string): void => void (m[k] = (m[k] ?? 0) + 1);
const sorted = (m: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));

export function summarizeShadow(records: readonly ShadowRecord[], pWinMode: PWinSource["mode"], nowMs: number): ShadowSummary {
  const byAction: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const would: Record<string, number> = {};
  const missing: Record<string, number> = {};
  const agreement: Record<string, Record<string, number>> = {};
  const refuseReasons: Record<string, number> = {};
  const net: number[] = [];
  const gross: number[] = [];
  const cost: number[] = [];
  let evaluated = 0;
  let engineOperates = 0;
  let refuses = 0;
  for (const r of records) {
    const prod = r.production.would ?? "sem_resposta";
    bump(would, prod);
    const eng = r.engine === null ? "nao_avaliavel" : r.engine.action;
    (agreement[prod] ??= {})[eng] = ((agreement[prod] ??= {})[eng] ?? 0) + 1;
    if (r.engine === null) {
      for (const m of r.missing) bump(missing, m);
      continue;
    }
    evaluated++;
    bump(byAction, r.engine.action);
    for (const reason of r.engine.reasons.slice(0, 1)) bump(byReason, reason);
    net.push(r.engine.netEdgeBps);
    gross.push(r.engine.grossEdgeBps);
    cost.push(r.engine.costBps);
    if (r.engine.action !== "NAO_OPERAR") engineOperates++;
    if (r.production.would === "buy" && r.engine.action === "NAO_OPERAR") {
      refuses++;
      bump(refuseReasons, r.engine.reasons[0] ?? "sem_motivo");
    }
  }
  return {
    generatedAt: new Date(nowMs).toISOString(),
    pWinMode,
    total: records.length,
    evaluated,
    notEvaluated: { count: records.length - evaluated, missing: sorted(missing) },
    engine: { byAction: sorted(byAction), byReason: sorted(byReason), netEdgeBps: dist(net, 1), grossEdgeBps: dist(gross, 1), costBps: dist(cost, 1) },
    production: { would: sorted(would) },
    agreement,
    productionBuysEngineRefuses: { count: refuses, byReason: sorted(refuseReasons) },
    engineOperates,
    assumptions: { ...SHADOW_ASSUMPTIONS },
    limits: { minNetEdgeBps: SHADOW_LIMITS.minNetEdgeBps, maxQuoteAgeMs: SHADOW_LIMITS.maxQuoteAgeMs, maxRiskScore: SHADOW_LIMITS.maxRiskScore },
    limitations: [
      "A probabilidade do modelo não é chance de ganho: com 'bruta' a comparação mostra o que a decisão de produção vira sob custo completo, não quem acerta.",
      "Não há desfecho de preço ligado a estes fechamentos (só 1 de 108 se liga ao scoreboard): o replay não diz quem teria ganho mais.",
      "Horizonte, MEV, probabilidade de falha e a saída (mesmo impacto e imposto da entrada) são premissas declaradas; o slippage é o p95 medido em poucas execuções.",
      "Patrimônio derivado do tamanho da compra e da fração da carteira; perda do dia, pico e demais posições entram neutros.",
    ],
  };
}

export function replayClosings(closings: readonly ClosingRecord[], pWin: PWinSource): ShadowRecord[] {
  const out: ShadowRecord[] = [];
  for (const c of closings) {
    // O relógio do replay é um segundo depois da cotação: a idade da cotação no momento em que ela foi usada.
    const shadow = createEngineShadow({ pWin, clock: { now: () => (c.quote?.receivedAtMs ?? c.atMs) + 1000 }, log: (r) => void out.push(r) });
    shadow.observe(c);
  }
  return out;
}

export function readClosings(path: string): ClosingRecord[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as ClosingRecord];
      } catch {
        return [];
      }
    });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const base = process.env.LOCALAPPDATA === undefined ? undefined : join(process.env.LOCALAPPDATA, "InonuTrader", "data", "agent", "closings.jsonl");
  const path = arg("--closings") ?? base;
  if (path === undefined || !existsSync(path)) throw new Error("closings.jsonl não encontrado: passe --closings");
  const mode = (arg("--pwin") ?? "bruta") === "ausente" ? ("ausente" as const) : ("bruta" as const);
  const summary = summarizeShadow(replayClosings(readClosings(path), { mode }), mode, Date.now());
  const out = resolve(import.meta.dir, "..", "data/bench/shadow-engine.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`);
  const a = summary.agreement;
  console.log(
    `shadow-engine (${mode}): fechamentos=${summary.total} avaliáveis=${summary.evaluated} motor opera=${summary.engineOperates} ` +
      `produção compraria=${summary.production.would.buy ?? 0} e o motor recusa=${summary.productionBuysEngineRefuses.count} ` +
      `(motivos: ${Object.entries(summary.productionBuysEngineRefuses.byReason).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum"}) | cruzamento ${JSON.stringify(a)}`,
  );

}
