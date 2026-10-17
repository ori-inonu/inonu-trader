import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ClosingRecord } from "../agent/closing";
import { evaluate } from "../decision/pipeline";
import type { Limits, Portfolio } from "../decision/types";
import { SHADOW_ASSUMPTIONS, derivePortfolio, opportunityFromClosing, type ShadowAssumptions } from "./adapter";

/**
 * Limites do motor na sombra. O edge mínimo é o alvo líquido do dono (30 bps); os demais seguem a ordem de grandeza do
 * agente (risco do provedor até 4 de 5, cotação de no máximo 15 s, que é a janela de validade da cotação do fechamento).
 */
export const SHADOW_LIMITS: Limits = {
  minNetEdgeBps: 30,
  maxQuoteAgeMs: 15_000,
  maxSlippageBps: 50,
  maxGasUsd: 1,
  maxRiskScore: 0.8,
  minLiquidityMultiple: 20,
  maxPositionPct: 0.35,
  maxGrossExposurePct: 0.9,
  maxDayLossPct: 0.05,
  maxDrawdownPct: 0.2,
  maxCorrelation: 0.8,
  kellyFraction: 0.25,
};

/** De onde vem a probabilidade de ganho. "bruta" usa a resposta do modelo como se fosse chance de ganho: só exploratório. */
export type PWinSource = { readonly mode: "ausente" } | { readonly mode: "bruta" } | { readonly mode: "calibrada"; readonly calibrate: (p: number) => number | null };

export interface ShadowRecord {
  readonly v: 1;
  readonly tsMs: number;
  readonly cycleId: string;
  readonly candidateId: string;
  /** O que a produção fez e disse nesta compra. */
  readonly production: { readonly would: "buy" | "skip" | null; readonly wouldReason: string; readonly applied: string; readonly firstPBuy: number | null; readonly answerBuy: number | null };
  /** "bruta_nao_calibrada": a resposta do modelo tratada como chance de ganho. Nunca pode alimentar uma ordem. */
  readonly pWin: { readonly mode: "calibrada" | "bruta_nao_calibrada" | "ausente"; readonly value: number | null };
  /** A decisão do motor; null quando a oportunidade não é avaliável. */
  readonly engine: { readonly action: string; readonly reasons: readonly string[]; readonly grossEdgeBps: number; readonly costBps: number; readonly netEdgeBps: number; readonly sizeUsd: number } | null;
  /** Campos que o registro não trouxe: a oportunidade não foi avaliada. */
  readonly missing: readonly string[];
  /** Premissas aplicadas nesta avaliação. */
  readonly assumptions: readonly string[];
  /** O que entrou na conta, para juntar depois ao que o preço fez e calibrar. */
  readonly inputs: { readonly quoteAgeMs: number | null; readonly impactBps: number | null; readonly liquidityUsd: number | null; readonly riskScore: number | null; readonly upBps: number | null; readonly downBps: number | null };
}

export interface EngineShadowOptions {
  readonly pWin: PWinSource;
  /** Relógio da avaliação. Ao vivo é o relógio local; no replay é o instante da cotação. */
  readonly clock: { now(): number };
  readonly limits?: Limits;
  readonly assumptions?: ShadowAssumptions;
  /** O executor pode cotar e enviar agora (saída do breaker de saúde). Ausente conta como disponível. */
  readonly executorAvailable?: () => boolean;
  /** Carteira real, quando a produção a conhece; ausente: derivada do próprio registro. */
  readonly portfolio?: () => Portfolio | null;
  readonly log: (record: ShadowRecord) => void;
}

export interface EngineShadow {
  /** Avalia uma compra do fechamento ao lado da produção e registra a divergência. Nunca lança e nunca mexe em ordem. */
  observe(record: ClosingRecord): ShadowRecord | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function createEngineShadow(options: EngineShadowOptions): EngineShadow {
  const limits = options.limits ?? SHADOW_LIMITS;
  const assumptions = options.assumptions ?? SHADOW_ASSUMPTIONS;
  return {
    observe(record) {
      try {
        const answerBuy = num(record.answer?.buy);
        const firstPBuy = num(record.first.pBuy);
        const raw = answerBuy ?? firstPBuy;
        let pWin: number | null = null;
        let mode: ShadowRecord["pWin"]["mode"] = "ausente";
        if (options.pWin.mode === "bruta" && raw !== null) {
          pWin = raw;
          mode = "bruta_nao_calibrada";
        } else if (options.pWin.mode === "calibrada" && raw !== null) {
          pWin = options.pWin.calibrate(raw);
          mode = pWin === null ? "ausente" : "calibrada";
        }

        const adapted = opportunityFromClosing(record, pWin, assumptions);
        const production = { would: record.would, wouldReason: record.wouldReason, applied: record.applied, firstPBuy, answerBuy };
        const cand = record.brief?.cand as Record<string, unknown> | undefined;
        const quote = record.quote;
        const base = {
          v: 1 as const,
          tsMs: options.clock.now(),
          cycleId: record.cycleId,
          candidateId: record.candidateId,
          production,
          pWin: { mode, value: pWin },
        };
        const inputs = {
          quoteAgeMs: quote === null ? null : options.clock.now() - quote.receivedAtMs,
          impactBps: num(quote?.facts.impactPct) === null ? null : Math.abs(quote!.facts.impactPct as number) * 100,
          liquidityUsd: num(cand?.l) === null ? null : (cand!.l as number) * 1000,
          riskScore: num(cand?.r) === null ? null : (cand!.r as number) / 5,
          upBps: num(record.brief?.plano.alvo) === null ? null : record.brief!.plano.alvo * 100,
          downBps: num(record.brief?.plano.stop) === null ? null : record.brief!.plano.stop * 100,
        };
        if (!adapted.ok) {
          const out: ShadowRecord = { ...base, engine: null, missing: adapted.missing, assumptions: [], inputs };
          options.log(out);
          return out;
        }
        const derived = options.portfolio?.() ?? null;
        const portfolio = derived ?? derivePortfolio(record)?.portfolio ?? null;
        if (portfolio === null) {
          const out: ShadowRecord = { ...base, engine: null, missing: ["portfolio"], assumptions: [], inputs };
          options.log(out);
          return out;
        }
        const executorAvailable = options.executorAvailable?.() ?? true;
        const decision = evaluate(adapted.opportunity, { ...portfolio, executorAvailable }, limits, options.clock);
        const notes = [...adapted.notes, ...(derived === null ? derivePortfolio(record)?.notes ?? [] : [])];
        const out: ShadowRecord = {
          ...base,
          engine: { action: decision.action, reasons: decision.reasons, grossEdgeBps: decision.grossEdgeBps, costBps: decision.costBps, netEdgeBps: decision.netEdgeBps, sizeUsd: decision.sizeUsd },
          missing: [],
          assumptions: notes,
          inputs,
        };
        options.log(out);
        return out;
      } catch {
        return null;
      }
    },
  };
}

/** Uma linha JSON por avaliação, em append. Falha de escrita não muda nada. */
export function jsonlShadowSink(path: string): (record: ShadowRecord) => void {
  return (record) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${JSON.stringify(record)}\n`);
    } catch {
      /* a sombra não pode custar nada à produção */
    }
  };
}

/** Montagem de produção: arquivo próprio na pasta do agente; probabilidade bruta e marcada como tal; desligável por JEV_ENGINE_SHADOW=0. */
export function createProductionShadow(options: { readonly dir: string; readonly now: () => number; readonly executorAvailable?: () => boolean; readonly enabled?: () => boolean }): EngineShadow {
  const inner = createEngineShadow({ pWin: { mode: "bruta" }, clock: { now: options.now }, ...(options.executorAvailable === undefined ? {} : { executorAvailable: options.executorAvailable }), log: jsonlShadowSink(join(options.dir, "engine-shadow.jsonl")) });
  return { observe: (record) => (options.enabled?.() === false ? null : inner.observe(record)) };
}
