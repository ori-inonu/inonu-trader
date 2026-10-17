/**
 * Saúde do executor: separa falha de condição (impacto alto, simulação) de falha de ambiente (Gas Station pendente,
 * sem saldo para a taxa). Uma falha de ambiente se repete idêntica a cada tentativa até alguém agir, então insistir só
 * gasta cotação e ciclo. Depois de `threshold` falhas seguidas com motivo persistente o breaker abre: recusa tentar
 * (`executor_unavailable`) e libera uma única sonda por vez, com espera que dobra até `maxCooldownMs`.
 * Puro: o instante vem de fora e o estado é um objeto simples que pode ser salvo e restaurado.
 */

export type HealthState = "closed" | "open" | "half-open";

export interface HealthConfig {
  /** Falhas persistentes seguidas, com o mesmo motivo, que abrem o breaker. */
  readonly threshold: number;
  readonly baseCooldownMs: number;
  readonly maxCooldownMs: number;
  /** Motivos que só mudam quando uma pessoa age. Os demais são transitórios e nunca abrem o breaker. */
  readonly persistent: ReadonlySet<string>;
}

export const DEFAULT_HEALTH: HealthConfig = {
  threshold: 3,
  baseCooldownMs: 15 * 60_000,
  maxCooldownMs: 4 * 3_600_000,
  persistent: new Set(["gas_station_pendente", "taxa_sem_saldo"]),
};

export interface HealthSnapshot {
  readonly state: HealthState;
  /** Falhas persistentes seguidas do motivo `reason`. */
  readonly streak: number;
  readonly reason: string | null;
  readonly openedAtMs: number;
  /** Quantas vezes seguidas o breaker reabriu: o expoente da espera. */
  readonly reopens: number;
  readonly probing: boolean;
}

export type Allow =
  | { readonly ok: true; readonly probe: boolean }
  | { readonly ok: false; readonly reason: "executor_unavailable"; readonly blockedBy: string; readonly retryAtMs: number };

export type Outcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface ExecutorHealth {
  /** Há tentativa possível agora? Não consome a sonda: serve para a decisão saber, antes de montar uma ordem. */
  peek(nowMs: number): boolean;
  /** Pede autorização para enviar UMA ordem; quando a resposta é uma sonda, a ordem enviada é a sonda. */
  allow(nowMs: number): Allow;
  record(nowMs: number, outcome: Outcome): void;
  snapshot(): HealthSnapshot;
}

const CLOSED: HealthSnapshot = { state: "closed", streak: 0, reason: null, openedAtMs: 0, reopens: 0, probing: false };

export function createExecutorHealth(config: HealthConfig = DEFAULT_HEALTH, restore: HealthSnapshot = CLOSED): ExecutorHealth {
  let s: { -readonly [K in keyof HealthSnapshot]: HealthSnapshot[K] } = { ...restore };
  const cooldown = () => Math.min(config.maxCooldownMs, config.baseCooldownMs * 2 ** s.reopens);

  return {
    peek(nowMs) {
      if (s.state === "closed") return true;
      if (s.state === "open") return nowMs >= s.openedAtMs + cooldown();
      return !s.probing;
    },

    allow(nowMs) {
      if (s.state === "closed") return { ok: true, probe: false };
      const retryAtMs = s.openedAtMs + cooldown();
      if (s.state === "open" && nowMs < retryAtMs) return { ok: false, reason: "executor_unavailable", blockedBy: s.reason ?? "desconhecido", retryAtMs };
      s.state = "half-open";
      // Uma sonda por vez: enquanto ela não responde, as demais tentativas esperam.
      if (s.probing) return { ok: false, reason: "executor_unavailable", blockedBy: s.reason ?? "desconhecido", retryAtMs: nowMs + config.baseCooldownMs };
      s.probing = true;
      return { ok: true, probe: true };
    },

    record(nowMs, outcome) {
      if (outcome.ok) {
        s = { ...CLOSED };
        return;
      }
      const persistent = config.persistent.has(outcome.reason);
      if (s.state === "half-open") {
        s.probing = false;
        if (!persistent) return; // falha transitória na sonda não prova que o ambiente segue quebrado
        s = { state: "open", streak: config.threshold, reason: outcome.reason, openedAtMs: nowMs, reopens: s.reopens + 1, probing: false };
        return;
      }
      if (!persistent) return;
      s.streak = s.reason === outcome.reason ? s.streak + 1 : 1;
      s.reason = outcome.reason;
      if (s.streak >= config.threshold) {
        s.state = "open";
        s.openedAtMs = nowMs;
      }
    },

    snapshot: () => ({ ...s }),
  };
}
