import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Teto diario de chamadas pagas ao Jev, somado entre execucoes (o teto por execucao continua em --max-calls). */
export const JEV_DAILY_CALLS = 200;

const read = (path: string): Record<string, number> => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, number>) : {});

/** Chamadas ainda permitidas hoje (UTC). */
export function remainingToday(path: string, now = new Date(), limit = JEV_DAILY_CALLS): number {
  return Math.max(0, limit - (read(path)[now.toISOString().slice(0, 10)] ?? 0));
}

/** Soma `sent` ao dia de hoje; guarda so o dia corrente. */
export function spend(path: string, sent: number, now = new Date()): void {
  const day = now.toISOString().slice(0, 10);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ [day]: (read(path)[day] ?? 0) + sent }));
}
