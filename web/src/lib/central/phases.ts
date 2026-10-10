// Limits per phase, computed for a capital the user types.
//
// Source: docs/research/R3-estrategias-e-alavancagem.md section 6 (envelope de politica recomendado) and
// docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md sections 5 and 8. These are risk engineering parameters, not a personalized
// recommendation and not a forecast. Nothing here is read by the executor: the page only shows what the documents say.

import {
  LIQUIDATION_FLOOR_HORIZON_DAYS,
  LIQUIDATION_FLOOR_MIN,
  LIQUIDATION_FLOOR_SIGMA_MULTIPLE,
  liquidationDistanceFloor,
  maxExposureFraction,
} from "./leverage-math";
import { formatUsd } from "./format";

export const PHASE_IDS = [0, 1, 2] as const;
export type PhaseId = (typeof PHASE_IDS)[number];

export const PHASE_PARAMETERS = {
  /** Daily stop (DLL): fraction of the equity at the start of the UTC day. */
  dailyStopFraction: 0.02,
  weeklyStopFraction: 0.05,
  /** Peak to trough drawdown that closes everything and requires a manual reactivation. */
  drawdownStopFraction: 0.1,
  /** Cap of the position fraction per asset: f <= min(25%, DLL/(2*sigma)). */
  maxExposureCap: 0.25,
  /** Gas, inference and fees per session. */
  sessionCostCapFraction: 0.01,
  /** Single order cap in R3 section 6. */
  orderCapFraction: { 1: 0.1, 2: 0.05 },
  /** Stricter single order cap written in the architecture document, section 5. */
  architectureOrderCapFraction: { 1: 0.01, 2: 0.02 },
  phase2LeverageCap: 2,
  /** Phase 2 leverage is also limited to this fraction of the lower bound of the estimated Kelly leverage. */
  kellyFractionCap: 0.25,
  /** Total notional in phase 2, as a multiple of the capital. */
  totalNotionalMultiple: 2,
  /** Phase 2 exposed capital: share of the operational wallet per venue. */
  operationalCapitalShareCap: 0.25,
  liquidationFloorMin: LIQUIDATION_FLOOR_MIN,
  liquidationFloorSigmaMultiple: LIQUIDATION_FLOOR_SIGMA_MULTIPLE,
  liquidationFloorHorizonDays: LIQUIDATION_FLOOR_HORIZON_DAYS,
} as const;

export interface ReferenceSigma {
  id: "BTC" | "ETH" | "SOL" | "MON";
  label: string;
  /** Daily volatility as a fraction: sigma = max(sigma_30d, sigma_90d) (R3 section 6). */
  sigma: number;
}

export const PHASE_REFERENCE_SIGMAS: readonly ReferenceSigma[] = [
  { id: "BTC", label: "BTC", sigma: 0.0196 },
  { id: "ETH", label: "ETH", sigma: 0.0246 },
  { id: "SOL", label: "SOL", sigma: 0.0325 },
  { id: "MON", label: "MON", sigma: 0.0667 },
];

export const PHASE_LABELS: Readonly<Record<PhaseId, { short: string; long: string }>> = {
  0: { short: "Fase 0", long: "Fase 0: paper e leitura (hoje)" },
  1: { short: "Fase 1", long: "Fase 1: micro-live spot, só com autorização explícita" },
  2: { short: "Fase 2", long: "Fase 2: vantagem validada fora da amostra" },
};

export const PHASE_PROMOTION_CRITERIA: readonly string[] = [
  "Autorização financeira explícita e assinante separado.",
  "Janelas congeladas fora da amostra, com custos conservadores contra caixa, contra manter inventário e contra um market maker simples.",
  "Limite inferior do retorno líquido diário acima de zero, com t maior ou igual a 2 (Sharpe 2 exige cerca de 365 dias de dados; Sharpe 4, cerca de 90).",
  "Fills reais conciliados.",
  "A fase 1 testa operação (assinatura, reconciliação, saída) e não prova lucro. Posições alavancadas só na fase 2 e só com vantagem medida no mesmo instrumento.",
];

export interface AssetPositionLimit {
  /** f = min(25%, DLL/(2*sigma)). */
  fraction: number;
  usd: number;
  /** DLL/(2*sigma) before the cap. */
  uncappedFraction: number;
  limitedBy: "cap" | "volatility";
}

export interface PhaseProfile {
  phase: PhaseId;
  maxLeverage: number;
  kellyFractionCap: number | null;
  exposedCapitalUsd: number;
  orderCapUsd: number | null;
  architectureOrderCapUsd: number | null;
  assetPosition: AssetPositionLimit | null;
  totalNotionalCapUsd: number | null;
  dailyStopUsd: number | null;
  weeklyStopUsd: number | null;
  drawdownStopUsd: number | null;
  sessionCostCapUsd: number | null;
  /** Minimum distance to the liquidation price, as a fraction of the price. */
  liquidationFloor: number | null;
}

function assertInputs(capitalUsd: number, sigma: number): void {
  if (!Number.isFinite(capitalUsd) || capitalUsd <= 0) throw new RangeError("capitalUsd must be a finite positive number");
  if (!Number.isFinite(sigma) || sigma <= 0) throw new RangeError("sigma must be a finite positive number");
}

export function computePhaseProfile(capitalUsd: number, sigma: number, phase: PhaseId): PhaseProfile {
  assertInputs(capitalUsd, sigma);
  const p = PHASE_PARAMETERS;
  if (phase === 0) {
    return {
      phase,
      maxLeverage: 0,
      kellyFractionCap: null,
      exposedCapitalUsd: 0,
      orderCapUsd: null,
      architectureOrderCapUsd: null,
      assetPosition: null,
      totalNotionalCapUsd: null,
      dailyStopUsd: null,
      weeklyStopUsd: null,
      drawdownStopUsd: null,
      sessionCostCapUsd: null,
      liquidationFloor: null,
    };
  }
  const uncappedFraction = maxExposureFraction(p.dailyStopFraction, sigma);
  const limitedBy = uncappedFraction >= p.maxExposureCap ? "cap" : "volatility";
  const fraction = Math.min(p.maxExposureCap, uncappedFraction);
  const second = phase === 2;
  return {
    phase,
    maxLeverage: second ? p.phase2LeverageCap : 1,
    kellyFractionCap: second ? p.kellyFractionCap : null,
    exposedCapitalUsd: second ? capitalUsd * p.operationalCapitalShareCap : capitalUsd,
    orderCapUsd: capitalUsd * p.orderCapFraction[phase],
    architectureOrderCapUsd: capitalUsd * p.architectureOrderCapFraction[phase],
    assetPosition: { fraction, usd: capitalUsd * fraction, uncappedFraction, limitedBy },
    totalNotionalCapUsd: second ? capitalUsd * p.totalNotionalMultiple : null,
    dailyStopUsd: capitalUsd * p.dailyStopFraction,
    weeklyStopUsd: capitalUsd * p.weeklyStopFraction,
    drawdownStopUsd: capitalUsd * p.drawdownStopFraction,
    sessionCostCapUsd: capitalUsd * p.sessionCostCapFraction,
    liquidationFloor: second ? liquidationDistanceFloor(sigma) : null,
  };
}

export function computePhaseProfiles(capitalUsd: number, sigma: number): PhaseProfile[] {
  assertInputs(capitalUsd, sigma);
  return PHASE_IDS.map((phase) => computePhaseProfile(capitalUsd, sigma, phase));
}

export type PhaseCell =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "leverage"; max: number; note?: string }
  | { kind: "usd"; usd: number; fraction?: number; note?: string }
  | { kind: "position"; position: AssetPositionLimit }
  | { kind: "floor"; fraction: number };

export interface PhaseTableRow {
  id: string;
  label: string;
  /** Where the number comes from, in plain words. */
  basis: string;
  cells: [PhaseCell, PhaseCell, PhaseCell];
}

const NONE: PhaseCell = { kind: "none" };

/** The table "perfil de limites por fase", row by row, for a capital and a daily volatility. */
export function buildPhaseTable(capitalUsd: number, sigma: number): PhaseTableRow[] {
  const [phase0, phase1, phase2] = computePhaseProfiles(capitalUsd, sigma) as [PhaseProfile, PhaseProfile, PhaseProfile];
  const p = PHASE_PARAMETERS;
  const money = (profile: PhaseProfile, key: "dailyStopUsd" | "weeklyStopUsd" | "drawdownStopUsd" | "sessionCostCapUsd", fraction: number, note?: string): PhaseCell => {
    const usd = profile[key];
    if (usd === null) return NONE;
    return note ? { kind: "usd", usd, fraction, note } : { kind: "usd", usd, fraction };
  };
  const orderCell = (profile: PhaseProfile, phase: 1 | 2): PhaseCell => ({
    kind: "usd",
    usd: profile.orderCapUsd as number,
    fraction: p.orderCapFraction[phase],
    note: `a arquitetura (seção 5) é mais estrita: até ${formatUsd(profile.architectureOrderCapUsd as number)} (${p.architectureOrderCapFraction[phase] * 100}%)`,
  });
  const text = (value: string): PhaseCell => ({ kind: "text", text: value });
  const sameText = (value: string): [PhaseCell, PhaseCell, PhaseCell] => [text(value), text(value), text(value)];

  return [
    {
      id: "leverage",
      label: "Alavancagem máxima",
      basis: "R3 4.4: com sigma de 6%, a chance de tocar a liquidação em 30 dias é 12,8% a 2x e 31% a 3x.",
      cells: [
        { kind: "leverage", max: 0, note: "sem perpétuos e sem empréstimo" },
        { kind: "leverage", max: 1, note: "spot, sem empréstimo" },
        { kind: "leverage", max: p.phase2LeverageCap, note: "e no máximo 0,25 do limite inferior do Kelly estimado" },
      ],
    },
    {
      id: "exposed-capital",
      label: "Capital exposto",
      basis: "Sem vantagem validada, a perda total é um cenário plausível. Fase 1: carteira operacional separada.",
      cells: [
        { kind: "usd", usd: phase0.exposedCapitalUsd },
        { kind: "usd", usd: phase1.exposedCapitalUsd, fraction: 1, note: "carteira operacional separada; perda total aceitável pelo dono" },
        { kind: "usd", usd: phase2.exposedCapitalUsd, fraction: p.operationalCapitalShareCap, note: "da carteira operacional, por venue" },
      ],
    },
    {
      id: "asset-position",
      label: "Posição por ativo",
      basis: "R3 4.8: f é no máximo o menor entre 25% e DLL/(2*sigma), com DLL de 2%.",
      cells: [
        NONE,
        { kind: "position", position: phase1.assetPosition as AssetPositionLimit },
        { kind: "position", position: phase2.assetPosition as AssetPositionLimit },
      ],
    },
    {
      id: "order-cap",
      label: "Ordem individual",
      basis: "R3 seção 6: 10% na fase 1 e 5% na fase 2 do capital operacional, somada às ordens abertas e ao inventário dentro de f.",
      cells: [NONE, orderCell(phase1, 1), orderCell(phase2, 2)],
    },
    {
      id: "daily-stop",
      label: "Parada diária",
      basis: "Patrimônio do início do dia (UTC). Com f igual a 1, dispara em cerca de 31% dos dias (sigma de 4%).",
      cells: [NONE, money(phase1, "dailyStopUsd", p.dailyStopFraction, "sem novas ordens até o dia seguinte (UTC)"), money(phase2, "dailyStopUsd", p.dailyStopFraction, "sem novas ordens até o dia seguinte (UTC)")],
    },
    {
      id: "session-cost-cap",
      label: "Teto de custos por sessão",
      basis: "Gás, inferência e taxas. Cotar a cada bloco custa cerca de US$ 253,71 por dia só de gás (R3).",
      cells: [NONE, money(phase1, "sessionCostCapUsd", p.sessionCostCapFraction), money(phase2, "sessionCostCapUsd", p.sessionCostCapFraction)],
    },
    {
      id: "weekly-stop",
      label: "Parada semanal",
      basis: "2,5 vezes a parada diária.",
      cells: [NONE, money(phase1, "weeklyStopUsd", p.weeklyStopFraction), money(phase2, "weeklyStopUsd", p.weeklyStopFraction)],
    },
    {
      id: "drawdown-stop",
      label: "Drawdown de pico a vale",
      basis: "R3 4.8: com f de 0,25 e sigma de 4%, 6,8% de chance de tocar -10% em 30 dias; com f de 1, 64,8%.",
      cells: [NONE, money(phase1, "drawdownStopUsd", p.drawdownStopFraction, "encerra e exige reativação manual"), money(phase2, "drawdownStopUsd", p.drawdownStopFraction, "encerra e exige reativação manual")],
    },
    {
      id: "liquidation-floor",
      label: "Piso de distância de liquidação",
      basis: "max(35%, 2,5 * sigma * raiz(7)) até o preço de liquidação da venue; abaixo disso, só reduzir.",
      cells: [NONE, NONE, { kind: "floor", fraction: phase2.liquidationFloor as number }],
    },
    {
      id: "cooldowns",
      label: "Cooldowns",
      basis: "Evitam reentrada reativa depois de perdas.",
      cells: [
        NONE,
        text("15 min após parada de operação; 24 h após a diária; 72 h após a semanal; manual após drawdown ou margem abaixo de 150%"),
        text("15 min após parada de operação; 24 h após a diária; 72 h após a semanal; manual após drawdown ou margem abaixo de 150%"),
      ],
    },
    {
      id: "pace",
      label: "Ritmo e Jev",
      basis: "O custo fixo por transação domina. Nunca decidir por contagem fixa de blocos.",
      cells: [
        text("filtro econômico antes de qualquer inferência"),
        text("filtro econômico antes da inferência; limite de gás por transação e custo registrado; sem Jev disponível, manter (hold)"),
        text("filtro econômico antes da inferência; limite de gás por transação e custo registrado; sem Jev disponível, manter (hold)"),
      ],
    },
    {
      id: "kill-switches",
      label: "Kill switches",
      basis: "Interrompem a operação sem depender do modelo.",
      cells: sameText("dado velho, divergência de reconciliação, gás acima de 2x a mediana, desvio de oráculo, incidente da venue, falha de assinatura"),
    },
    {
      id: "reinvestment",
      label: "Reinvestimento",
      basis: "R3 seção 6.",
      cells: sameText("só ganho líquido realizado e conciliado"),
    },
  ];
}
