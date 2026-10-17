import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Janelas de contagem: minuto, hora, dia (UTC) e mês (UTC). */
export type Period = "min" | "h" | "d" | "m";

/** Uso de uma janela. `stamp` identifica a janela; um stamp antigo significa uso zero. */
export interface Usage {
  readonly stamp: string;
  readonly n: number;
}

/** Estado persistido entre processos: uso por janela, bloqueio 402 e cooldown 429, em epoch ms. */
export interface LedgerState {
  usage: Record<string, Partial<Record<Period, Usage>>>;
  blocked: Record<string, number>;
  cooldown: Record<string, number>;
}

/** Ledger no diretorio git comum (mesmo arquivo para todos os worktrees do repo); JEV_API_BUDGET_LEDGER (caminho completo) sobrepoe; fora do git usa data/ local. */
export function defaultLedgerPath(): string {
  if (process.env.JEV_API_BUDGET_LEDGER) return process.env.JEV_API_BUDGET_LEDGER;
  const out = Bun.spawnSync(["git", "rev-parse", "--git-common-dir"], { stdout: "pipe", stderr: "ignore" });
  const base = out.exitCode === 0 ? resolve(out.stdout.toString().trim(), "..") : resolve(".");
  return resolve(base, "data", "api-budget", "ledger.json");
}

/**
 * Leitura, alteração e gravação sob exclusão mútua por diretório (mkdir é atômico). Trava com mais de 10 s é de
 * processo morto e é removida. A gravação vai para arquivo temporário e depois é renomeada.
 */
export async function updateLedger<T>(path: string, body: (state: LedgerState) => T): Promise<T> {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  for (let attempt = 0; ; attempt++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { recursive: true, force: true });
      else if (attempt > 600) throw new Error("ledger do api-budget travado");
      else await Bun.sleep(25);
    }
  }
  try {
    const state: LedgerState = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as LedgerState) : { usage: {}, blocked: {}, cooldown: {} };
    const result = body(state);
    writeFileSync(`${path}.tmp`, JSON.stringify(state));
    renameSync(`${path}.tmp`, path);
    return result;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Leitura sem escrita e sem trava, para relatórios. Arquivo ausente ou ilegível é um ledger vazio. */
export function readLedger(path: string): LedgerState {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<LedgerState>;
    return { usage: raw.usage ?? {}, blocked: raw.blocked ?? {}, cooldown: raw.cooldown ?? {} };
  } catch {
    return { usage: {}, blocked: {}, cooldown: {} };
  }
}
