import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sem teto diario de chamadas pagas ao Jev: decisao do dono em 2026-10-17, que substitui o teto de 200 por dia UTC. O ledger segue contando o uso do dia, somado entre execucoes e worktrees, para visibilidade.
 * O teto por execucao e opcional: so vale quando --max-calls (ou max_calls no MCP) e informado.
 */
export const JEV_DAILY_CALLS = Number.POSITIVE_INFINITY;

/** Ledger no diretorio git comum: todos os worktrees do repo compartilham o mesmo arquivo. */
export const quotaPath = (): string => {
  const out = Bun.spawnSync(["git", "rev-parse", "--git-common-dir"], { stdout: "pipe", stderr: "ignore" });
  return resolve(out.exitCode === 0 ? out.stdout.toString().trim() : "data", "jev-quota.json");
};

const read = (path: string): Record<string, number> => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, number>) : {});

/** Exclusao mutua por diretorio (mkdir e atomico); trava com mais de 10 s e considerada de processo morto. */
export async function locked<T>(path: string, body: () => T): Promise<T> {
  const lock = `${path}.lock`;
  for (let i = 0; ; i++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { recursive: true, force: true });
      else if (i > 600) throw new Error("ledger de chamadas ao Jev travado");
      else await Bun.sleep(25);
    }
  }
  try {
    return body();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

const adjust = (path: string, delta: number, day: string): number => {
  const ledger = read(path);
  writeFileSync(path, JSON.stringify({ [day]: Math.max(0, (ledger[day] ?? 0) + delta) }));
  return ledger[day] ?? 0;
};

/** Reserva ANTES de enviar: devolve quantas chamadas (ate `want`) o dia ainda permite, ja descontadas. Queda do processo mantem a reserva. */
export function reserve(path: string, want: number, now = new Date(), limit = JEV_DAILY_CALLS): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  return locked(path, () => {
    const granted = Math.min(want, Math.max(0, limit - (read(path)[day] ?? 0)));
    if (granted > 0) adjust(path, granted, day);
    return granted;
  });
}

/** Devolve o que a reserva nao gastou. */
export const refund = (path: string, unused: number, now = new Date()): Promise<void> =>
  unused > 0 ? locked(path, () => void adjust(path, -unused, now.toISOString().slice(0, 10))) : Promise.resolve();
