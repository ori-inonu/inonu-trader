import { isClosing, sizeUsd } from "./sizing";
import type { Limits, Mode, Opportunity, Portfolio, Reason } from "./types";

/** Só replay e paper. Qualquer caminho de execução passa por aqui; não existe modo live neste módulo. */
export function assertPaperOrReplay(mode: string): asserts mode is Mode {
  if (mode !== "replay" && mode !== "paper") throw new Error(`modo '${mode}' desabilitado: só replay ou paper`);
}

export type BreakerState = "closed" | "open" | "half-open";

export interface Breaker {
  state: BreakerState;
  failures: number;
  openedAt: number;
  readonly threshold: number;
  readonly cooldownMs: number;
}

export interface Guard {
  readonly mode: Mode;
  readonly breaker: Breaker;
  /** Ids já decididos: a mesma oportunidade nunca gera duas decisões. */
  readonly decided: Set<string>;
}

export function createGuard(cfg: { mode: Mode; failureThreshold: number; cooldownMs: number }): Guard {
  assertPaperOrReplay(cfg.mode);
  const breaker: Breaker = { state: "closed", failures: 0, openedAt: 0, threshold: cfg.failureThreshold, cooldownMs: cfg.cooldownMs };
  return { mode: cfg.mode, breaker, decided: new Set() };
}

/** Aplica a transição por tempo: open vira half-open após o cooldown. */
function tick(b: Breaker, now: number): void {
  if (b.state === "open" && now - b.openedAt >= b.cooldownMs) b.state = "half-open";
}

export function breakerAllow(b: Breaker, now: number): boolean {
  tick(b, now);
  return b.state !== "open";
}

/** Registra o resultado de uma execução. Falhas em closed contam até o limite; em half-open reabrem. */
export function breakerRecord(b: Breaker, ok: boolean, now: number): void {
  tick(b, now);
  if (b.state === "open") return;
  if (ok) {
    b.state = "closed";
    b.failures = 0;
    return;
  }
  b.failures += 1;
  if (b.state === "half-open" || b.failures >= b.threshold) {
    b.state = "open";
    b.openedAt = now;
    b.failures = 0;
  }
}

/**
 * Limites de portfólio para um tamanho já escolhido. Retorna "ok" ou o primeiro motivo violado.
 * Fechar uma posição (`closing`) reduz risco: os limites de exposição, de perda do dia e de drawdown existem para
 * impedir risco novo e não podem impedir a saída.
 */
export function checkLimits(size: number, symbol: string, port: Portfolio, limits: Limits, closing = false): Reason {
  if (closing) return Number.isFinite(size) && size > 0 ? "ok" : "bad_data";
  const equity = port.equityUsd;
  const gross = Object.values(port.exposureUsd).reduce((sum, v) => sum + Math.abs(v), 0);
  const held = port.exposureUsd[symbol] ?? 0;
  if (held + size > limits.maxPositionPct * equity) return "exposure_limit";
  if (gross + size > limits.maxGrossExposurePct * equity) return "exposure_limit";
  if (port.dayPnlUsd <= -limits.maxDayLossPct * equity) return "day_loss_limit";
  if (port.peakEquityUsd - equity >= limits.maxDrawdownPct * port.peakEquityUsd) return "drawdown_limit";
  return "ok";
}

/**
 * Gate com estado para o caminho de execução: breaker, idempotência e limites.
 * Registra o id como decidido assim que passa do breaker, para que um reenvio vire "duplicate".
 */
export function checkControls(
  opp: Opportunity,
  port: Portfolio,
  limits: Limits,
  guard: Guard,
  clock: { now(): number },
): Reason {
  if (!breakerAllow(guard.breaker, clock.now())) return "breaker_open";
  if (guard.decided.has(opp.id)) return "duplicate";
  guard.decided.add(opp.id);
  return checkLimits(sizeUsd(opp, port, limits), opp.symbol, port, limits, isClosing(opp));
}

export interface NonceState {
  readonly last: number;
}

/** Próximo nonce da porta. Função pura: o estado novo é devolvido, nunca mutado. */
export function nextNonce(state: NonceState): { nonce: number; state: NonceState } {
  const nonce = state.last + 1;
  return { nonce, state: { last: nonce } };
}
