/** Contagem por dia do mês corrente (chave "01".."31", UTC), como o `usage-YYYY-MM.json` do gateway grava. */
export type DailyUse = Readonly<Record<string, number>>;

export interface Projection {
  readonly month: string;
  readonly franquia: number;
  readonly used: number;
  /** Chamadas por dia: média dos últimos dias completos (até `windowDays`), sem contar hoje. Null sem nenhum dia completo. */
  readonly ratePerDay: number | null;
  readonly daysInMonth: number;
  /** Uso ao fim do mês se o ritmo se mantiver. Null sem ritmo. */
  readonly projectedMonth: number | null;
  /** Dia do mês (1..31) em que a franquia acaba ao ritmo atual; null se não acaba dentro do mês ou sem ritmo. */
  readonly exhaustionDay: number | null;
  /** Chamadas por dia que ainda cabem até o fim do mês sem estourar a franquia. */
  readonly sustainablePerDay: number;
  /** O ritmo projetado passa da franquia. */
  readonly overQuota: boolean;
}

/**
 * Projeta o mês a partir da série diária. Pura: o instante vem de fora. O dia corrente é parcial, então só entra
 * em `used`, nunca no ritmo.
 */
export function projectMonth(days: DailyUse, nowMs: number, franquia: number, windowDays = 3): Projection {
  const now = new Date(nowMs);
  const month = now.toISOString().slice(0, 7);
  const today = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const used = Object.values(days).reduce((sum, n) => sum + n, 0);

  const complete = Object.keys(days)
    .map(Number)
    .filter((d) => d < today)
    .sort((a, b) => b - a)
    .slice(0, windowDays);
  const ratePerDay = complete.length === 0 ? null : complete.reduce((sum, d) => sum + (days[String(d).padStart(2, "0")] ?? 0), 0) / complete.length;

  const todayUse = days[String(today).padStart(2, "0")] ?? 0;
  const left = daysInMonth - today;
  const projectedMonth = ratePerDay === null ? null : Math.round(used - todayUse + Math.max(todayUse, ratePerDay) + ratePerDay * left);
  let exhaustionDay: number | null = null;
  if (ratePerDay !== null && ratePerDay > 0) {
    const remainingToday = Math.max(0, franquia - used);
    if (remainingToday <= 0) exhaustionDay = today;
    else {
      const daysNeeded = Math.ceil(remainingToday / ratePerDay);
      const day = today + daysNeeded;
      exhaustionDay = day <= daysInMonth ? day : null;
    }
  }
  return {
    month,
    franquia,
    used,
    ratePerDay: ratePerDay === null ? null : Math.round(ratePerDay),
    daysInMonth,
    projectedMonth,
    exhaustionDay,
    sustainablePerDay: left <= 0 ? 0 : Math.max(0, Math.floor((franquia - used) / left)),
    overQuota: projectedMonth !== null && projectedMonth > franquia,
  };
}
