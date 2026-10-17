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
  /** Chamadas liberadas por endpoint (dia e mês UTC), independentes do pool: mostram onde a franquia é gasta. */
  endpoints?: Record<string, Partial<Record<"d" | "m", Usage>>>;
}

/** Ledger no diretorio git comum (mesmo arquivo para todos os worktrees do repo); JEV_API_BUDGET_LEDGER (caminho completo) sobrepoe; fora do git usa data/ local. */
export function defaultLedgerPath(gitCommonDir: () => string | null = runGit): string {
  if (process.env.JEV_API_BUDGET_LEDGER) return process.env.JEV_API_BUDGET_LEDGER;
  const common = gitCommonDir();
  const base = common === null ? resolve(".") : resolve(common, "..");
  return resolve(base, "data", "api-budget", "ledger.json");
}

/** Diretório git comum, ou null quando não há git no PATH (app instalado) ou fora de um repositório. Nunca lança. */
function runGit(): string | null {
  try {
    const out = Bun.spawnSync(["git", "rev-parse", "--git-common-dir"], { stdout: "pipe", stderr: "ignore" });
    return out.exitCode === 0 ? out.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

const emptyState = (): LedgerState => ({ usage: {}, blocked: {}, cooldown: {} });

/** Interpreta o texto salvo. Só JSON inválido ou de forma errada lança SyntaxError: é o que conta como corrupção. */
function parseState(text: string): LedgerState {
  const raw = JSON.parse(text) as Partial<LedgerState> | null;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new SyntaxError("forma inválida");
  return { ...raw, usage: raw.usage ?? {}, blocked: raw.blocked ?? {}, cooldown: raw.cooldown ?? {} };
}

/**
 * Estado salvo, ou vazio quando o arquivo não existe. Arquivo de conteúdo inválido (truncado por uma queda) é posto de
 * lado em `.corrupt` e o orçamento recomeça. Erro de leitura (EBUSY, EPERM, EACCES) NÃO é corrupção: perder o estado
 * reabriria um bloqueio 402 ou um cooldown 429, então a leitura é repetida e, persistindo, o erro sobe.
 */
async function loadState(path: string): Promise<LedgerState> {
  let text = "";
  for (let attempt = 0; ; attempt++) {
    try {
      text = readFileSync(path, "utf8");
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return emptyState();
      if ((code !== "EPERM" && code !== "EBUSY") || attempt >= 4) throw error;
      await Bun.sleep(20 * (attempt + 1));
    }
  }
  try {
    return parseState(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    try {
      renameSync(path, `${path}.corrupt`);
    } catch {
      /* a gravação seguinte substitui o arquivo de qualquer forma */
    }
    return emptyState();
  }
}

/** Trava com mais de 10 s é de processo morto. Retorna true quando a trava sumiu ou foi reclamada e vale tentar de novo já. */
function reclaimIfStale(lock: string): boolean {
  let age: number;
  try {
    age = Date.now() - statSync(lock).mtimeMs;
  } catch {
    return true; // o dono soltou entre o mkdir que falhou e o stat
  }
  if (age <= 10_000) return false;
  // Renomear é atômico: se dois esperam, só um consegue, e ninguém remove a trava que o outro acabou de criar.
  const aside = `${lock}.stale-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try {
    renameSync(lock, aside);
  } catch {
    return true;
  }
  rmSync(aside, { recursive: true, force: true });
  return true;
}

/**
 * Leitura, alteração e gravação sob exclusão mútua por diretório (mkdir é atômico). A gravação vai para arquivo
 * temporário e depois é renomeada.
 */
export async function updateLedger<T>(path: string, body: (state: LedgerState) => T): Promise<T> {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  for (let attempt = 0; ; attempt++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (reclaimIfStale(lock)) continue;
      if (attempt > 600) throw new Error("ledger do api-budget travado");
      await Bun.sleep(25);
    }
  }
  try {
    const state = await loadState(path);
    const result = body(state);
    writeFileSync(`${path}.tmp`, JSON.stringify(state));
    // No Windows o rename sobre um arquivo aberto por um leitor (o relatório) pode falhar por instantes.
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(`${path}.tmp`, path);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if ((code !== "EPERM" && code !== "EBUSY") || attempt >= 4) throw error;
        await Bun.sleep(20 * (attempt + 1));
      }
    }
    return result;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Leitura sem escrita e sem trava, para relatórios. Arquivo ausente ou ilegível é um ledger vazio. */
export function readLedger(path: string): LedgerState {
  try {
    return parseState(readFileSync(path, "utf8"));
  } catch {
    return emptyState();
  }
}
