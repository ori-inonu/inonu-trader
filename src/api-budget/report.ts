import type { LedgerState, Period } from "./ledger.ts";
import { ceilings, entryId, monthlyRemaining, poolId, type BudgetEntry, type BudgetRegistry, type Ceilings } from "./registry.ts";

export interface PoolReport {
  readonly pool: string;
  readonly module: string;
  /** Nome da variável de ambiente da chave; nunca o valor. */
  readonly key: string;
  readonly endpoints: number;
  /** Teto teórico por janela, derivado de rps/rpm/rph/rpd. Null: o provedor não publicou limite. */
  readonly ceilings: Ceilings;
  /** Consumo nas janelas correntes do ledger. */
  readonly used: { readonly minute: number; readonly hour: number; readonly day: number; readonly month: number };
  /** Franquia mensal separada dos tetos: total, consumo do mês e o que resta. */
  readonly monthly: { readonly franquia: number | null; readonly used: number; readonly remaining: number | null; readonly usedPct: number | null };
  /** Todas as entradas do pool têm limites confirmados na documentação. */
  readonly validated: boolean;
  /** Quantas entradas do pool não foram confirmadas na documentação (0 quando `validated`). */
  readonly unvalidated: number;
  readonly fontes: readonly string[];
  /** Endpoints do pool que mais consumiram no mês corrente (até 5). */
  readonly topEndpoints: readonly { readonly endpoint: string; readonly today: number; readonly month: number }[];
  readonly expiresAt: number | null;
  readonly blockedUntil: number | null;
  readonly cooldownUntil: number | null;
  /** Estado de uso agora: ok, ou o motivo que nega chamadas neste instante. */
  readonly status: "ok" | "expired" | "blocked_402" | "cooldown_429" | "exhausted";
}

export interface BudgetReport {
  readonly generatedAt: string;
  readonly pools: readonly PoolReport[];
}

const stamps = (now: number): Record<Period, string> => ({
  min: String(Math.floor(now / 60_000)),
  h: String(Math.floor(now / 3_600_000)),
  d: new Date(now).toISOString().slice(0, 10),
  m: new Date(now).toISOString().slice(0, 7),
});

const usedNow = (state: LedgerState, id: string, period: Period, now: number): number => {
  const usage = state.usage[id]?.[period];
  return usage !== undefined && usage.stamp === stamps(now)[period] ? usage.n : 0;
};

/** Um relatório por pool. Não escreve em lugar nenhum: pode rodar em paralelo com o processo que consome. */
export function budgetReport(registry: BudgetRegistry, state: LedgerState, now: number): BudgetReport {
  const groups = new Map<string, BudgetEntry[]>();
  for (const entry of registry.entries) {
    const id = poolId(entry);
    groups.set(id, [...(groups.get(id) ?? []), entry]);
  }
  const pools: PoolReport[] = [];
  for (const [id, entries] of groups) {
    const first = entries[0]!;
    const month = usedNow(state, id, "m", now);
    const franquia = first.franquiaMensal ?? null;
    const remaining = monthlyRemaining(first, month);
    const blocked = state.blocked[id];
    const cooldown = state.cooldown[id];
    const expired = first.expiresAt !== undefined && now >= first.expiresAt;
    const caps = ceilings(first);
    const exhausted =
      (franquia !== null && month >= franquia) ||
      (caps.minute !== null && usedNow(state, id, "min", now) >= caps.minute) ||
      (caps.hour !== null && usedNow(state, id, "h", now) >= caps.hour) ||
      (caps.day !== null && usedNow(state, id, "d", now) >= caps.day);
    pools.push({
      pool: first.pool ?? `${first.endpoint}`,
      module: first.module,
      key: first.key,
      endpoints: entries.length,
      ceilings: caps,
      used: { minute: usedNow(state, id, "min", now), hour: usedNow(state, id, "h", now), day: usedNow(state, id, "d", now), month },
      monthly: { franquia, used: month, remaining, usedPct: franquia === null ? null : Math.round((month / franquia) * 10_000) / 100 },
      validated: entries.every((e) => e.validated),
      unvalidated: entries.filter((e) => !e.validated).length,
      fontes: [...new Set(entries.map((e) => e.fonte))],
      topEndpoints: entries
        .map((e) => {
          const calls = state.endpoints?.[entryId(e)];
          const at = stamps(now);
          return { endpoint: e.endpoint, today: calls?.d?.stamp === at.d ? calls.d.n : 0, month: calls?.m?.stamp === at.m ? calls.m.n : 0 };
        })
        .filter((e) => e.month > 0)
        .sort((a, b) => b.month - a.month)
        .slice(0, 5),
      expiresAt: first.expiresAt ?? null,
      blockedUntil: blocked !== undefined && now < blocked ? blocked : null,
      cooldownUntil: cooldown !== undefined && now < cooldown ? cooldown : null,
      status: expired ? "expired" : blocked !== undefined && now < blocked ? "blocked_402" : cooldown !== undefined && now < cooldown ? "cooldown_429" : exhausted ? "exhausted" : "ok",
    });
  }
  return { generatedAt: new Date(now).toISOString(), pools };
}
