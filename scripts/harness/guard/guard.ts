/**
 * Guarda PreToolUse (hook do Claude Code) que NEGA temas cercados numa sessão sem supervisão. Lê o JSON do hook no
 * stdin, aplica as regras universais (builtin-rules.ts) e as do projeto (`.claude/guard-rules.json`) e, no modo
 * `enforce`, escreve UMA linha JSON com permissionDecision "deny". No modo `observe` (padrão) nunca nega: só registra
 * `would-deny`. Qualquer erro interno é falha aberta: exit 0 e nenhum stdout. Estado em `GUARD_HOME`
 * (padrão ~/.claude/guard): `mode`, `log.jsonl`, `ADMIN`. O log NUNCA guarda texto de comando, caminho nem conteúdo.
 *
 * Uso: bun guard.ts                       (hook, stdin)
 *      bun guard.ts --validate-rules <arquivo>
 *      bun guard.ts --promote-check | --promote | --status
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { UNIVERSAL_IDS, universalRules } from "./builtin-rules";
import { compileRulesText, evaluate, type Ctx, type HookInput, type Rule } from "./guard-core";

export type Mode = "observe" | "enforce";
type Env = Record<string, string | undefined>;

export interface LogRecord {
  ts: string;
  tool: string;
  decision: "allow" | "would-deny" | "deny";
  rule: string | null;
  topic: string | null;
  mode: Mode;
  permission_mode: string | null;
  worker: boolean;
  session: string;
  head2: string;
  /** Milissegundos desde o início do processo até gravar o log (latência do hook, sem a partida do Bun). */
  ms?: number;
}

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const ADMIN_TTL_MS = 2 * 60 * 60 * 1000;
const PROMOTE_MIN_DAYS = 7;
const PROMOTE_MIN_CALLS = 200;

// ---------- estado em GUARD_HOME ----------

export function guardHomeDir(env: Env = process.env): string {
  const g = env.GUARD_HOME;
  return g !== undefined && g.trim() !== "" ? g : join(homedir(), ".claude", "guard");
}

/** `observe` ou `enforce`; arquivo ausente, vazio ou com lixo = observe. */
export function readMode(home: string): Mode {
  try {
    return readFileSync(join(home, "mode"), "utf8").trim().toLowerCase() === "enforce" ? "enforce" : "observe";
  } catch {
    return "observe";
  }
}

/** HARNESS_ADMIN=1 no ambiente do processo, ou arquivo ADMIN em GUARD_HOME modificado nas últimas 2 horas. */
export function adminActive(env: Env, home: string, nowMs: number): boolean {
  if (env.HARNESS_ADMIN === "1") return true;
  try {
    const st = statSync(join(home, "ADMIN"));
    const age = nowMs - st.mtimeMs;
    return st.isFile() && age <= ADMIN_TTL_MS && age >= -60_000;
  } catch {
    return false;
  }
}

// ---------- log ----------

const WORD = /^[a-z][a-z0-9.-]{0,19}$/i;

/** Apenas verbos conhecidos podem ocupar a segunda palavra do resumo; nomes de scripts ou argumentos livres nao entram. */
const SUBCOMMANDS = new Map(Object.entries({
  git: "status diff log add commit push switch fetch pull show branch stash worktree checkout merge rebase reset clean restore revert tag remote init clone config ls-remote rev-parse cherry-pick",
  bun: "test run install add remove update build x init create link unlink pm publish patch upgrade repl completions",
  npm: "test run install ci add remove uninstall update audit cache exec init create pack publish link view config search info login logout",
  pnpm: "test run install add remove update audit store exec dlx init create pack publish link list why",
  yarn: "test run install add remove up upgrade audit cache exec dlx init create pack publish link config info",
  pip: "install uninstall download list show check cache freeze config index",
  pip3: "install uninstall download list show check cache freeze config index",
  cargo: "build test run install check fmt clippy add remove update search publish metadata doc clean",
  gh: "pr issue repo api auth run workflow release gist search browse extension codespace ssh-key gpg-key secret variable cache",
  docker: "build run exec ps images pull push compose container image volume network logs inspect stop start rm rmi login logout",
  winget: "install uninstall list upgrade search show source export import settings",
  choco: "install uninstall list upgrade search info source pack push",
  scoop: "install uninstall list update search info bucket status cleanup reset",
  dotnet: "build test run tool add remove restore nuget new publish clean pack list",
  go: "build test run install mod get list env fmt vet version clean",
  uv: "pip run venv init add remove sync lock python tool build publish tree",
  poetry: "install add remove update run env build publish lock show check config",
  kubectl: "get describe apply delete logs exec config create edit rollout scale port-forward version",
  az: "account group resource storage vm network deployment keyvault webapp aks login logout",
  aws: "s3 s3api ec2 sts iam logs configure cloudformation lambda dynamodb",
  supabase: "start stop status db migration functions projects branches link login logout init gen",
  claude: "auth update install doctor mcp plugin setup-token",
  deno: "run test task check fmt lint compile install uninstall add remove cache info init publish",
  brew: "install uninstall update upgrade search info list services tap untap cleanup doctor",
  apt: "install remove update upgrade search show list autoremove",
  "apt-get": "install remove update upgrade autoremove clean",
}).map(([tool, verbs]) => [tool, new Set(verbs.split(" "))] as const));

/**
 * Resumo mínimo do comando para o log: a primeira palavra (se for palavra simples /^[a-z][a-z0-9.-]*$/i, até 20 caracteres) e,
 * só quando a segunda palavra e um verbo conhecido daquela ferramenta ("git push", "bun test").
 * Qualquer outra coisa vira "?"; Edit, Write, NotebookEdit e MCP, "-". Nunca grava argumento (`echo segredo` vira "echo").
 */
export function head2Of(tool: string, command: string): string {
  if (tool !== "Bash" && tool !== "PowerShell") return "-";
  const w = command.slice(0, 200).trim().split(/\s+/);
  const a = (w[0] ?? "").toLowerCase();
  if (!WORD.test(a)) return "?";
  const b = (w[1] ?? "").toLowerCase();
  return SUBCOMMANDS.get(a)?.has(b) ? `${a} ${b}` : a;
}

export function sessionHash(id: unknown): string {
  return typeof id === "string" && id !== "" ? new Bun.CryptoHasher("sha1").update(id).digest("hex").slice(0, 8) : "00000000";
}

export function appendLog(home: string, rec: LogRecord): void {
  const f = join(home, "log.jsonl");
  const line = `${JSON.stringify(rec)}\n`;
  try {
    appendFileSync(f, line);
  } catch {
    mkdirSync(home, { recursive: true });
    appendFileSync(f, line);
  }
  try {
    if (statSync(f).size > MAX_LOG_BYTES) {
      const old = join(home, "log.1.jsonl");
      try {
        renameSync(f, old);
      } catch {
        unlinkSync(old);
        renameSync(f, old);
      }
    }
  } catch {
    // rotação é melhor esforço
  }
}

/** Registros do log (log.1.jsonl antes de log.jsonl). Linhas quebradas são ignoradas. */
export function readLogs(home: string): LogRecord[] {
  const out: LogRecord[] = [];
  for (const name of ["log.1.jsonl", "log.jsonl"]) {
    let text = "";
    try {
      text = readFileSync(join(home, name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (line === "") continue;
      try {
        const r = JSON.parse(line) as LogRecord;
        if (typeof r === "object" && r !== null && typeof r.ts === "string") out.push(r);
      } catch {
        // linha incompleta
      }
    }
  }
  return out;
}

// ---------- regras do projeto ----------

function loadProjectRules(projectDir: string): Rule[] {
  let text: string;
  try {
    text = readFileSync(join(projectDir, ".claude", "guard-rules.json"), "utf8");
  } catch {
    return [];
  }
  const c = compileRulesText(text.replace(/^﻿/, ""), UNIVERSAL_IDS);
  if (c.errors.length > 0) console.error(`guarda: guard-rules.json inválido (${c.errors.length} erro(s), ex.: ${c.errors[0]}); só valem as regras universais`);
  return c.rules;
}

// ---------- decisão ----------

function denyLine(rule: string, reason: string): string {
  const r = reason.replace(/[.\s]+$/, "");
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `[guarda:${rule}] ${r}. Registre o bloqueio (goal.ts blocked) e siga com outra tarefa; não pergunte ao dono.`,
    },
  })}\n`;
}

export interface RunOptions {
  env?: Env;
  now?: number;
  /** Substitui as regras (testes). */
  rules?: readonly Rule[];
  /** Substitui a home do usuário (testes). */
  homeDir?: string;
}

/** Processa uma chamada do hook. Devolve o stdout (vazio ou uma linha JSON). Nunca lança: erro interno = falha aberta. */
export function runGuard(stdin: string, opts: RunOptions = {}): string {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  const home = guardHomeDir(env);
  let input: HookInput;
  try {
    const j: unknown = JSON.parse(stdin);
    if (typeof j !== "object" || j === null || Array.isArray(j)) return "";
    input = j as HookInput;
  } catch {
    return "";
  }
  const mode = readMode(home);
  const tool = typeof input.tool_name === "string" ? input.tool_name.slice(0, 120) : "";
  const base = {
    tool,
    mode,
    permission_mode: typeof input.permission_mode === "string" ? input.permission_mode.slice(0, 40) : null,
    worker: typeof input.agent_id === "string" && input.agent_id !== "",
    session: sessionHash(input.session_id),
  };
  const log = (decision: LogRecord["decision"], rule: string | null, topic: string | null, head2: string): void => {
    try {
      appendLog(home, { ts: new Date(now).toISOString(), ...base, decision, rule, topic, head2, ms: Math.round(performance.now()) });
    } catch {
      // o log nunca derruba a guarda
    }
  };
  try {
    const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const ctx: Ctx = { admin: adminActive(env, home, now), home: opts.homeDir ?? homedir(), guardHome: home, projectDir };
    const rules = opts.rules ?? [...universalRules(), ...loadProjectRules(projectDir)];
    const d = evaluate(input, rules, ctx);
    const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
    const head2 = head2Of(tool, command);
    if (d.decision === "allow") {
      if (d.error === undefined) log("allow", null, null, head2);
      else log("allow", "internal-error", "erro", head2);
      return "";
    }
    const rule = d.rule ?? "?";
    if (mode === "enforce") {
      log("deny", rule, d.topic ?? null, head2);
      return denyLine(rule, d.reason ?? "tema cercado");
    }
    log("would-deny", rule, d.topic ?? null, head2);
    return "";
  } catch {
    log("allow", "internal-error", "erro", "?");
    return "";
  }
}

// ---------- promoção e status ----------

const BENIGN_TWO: Record<string, ReadonlySet<string>> = {
  git: new Set(["status", "diff", "log", "add", "commit", "push", "switch", "fetch", "pull", "show", "branch", "stash", "worktree"]),
  bun: new Set(["test", "run", "install", "x", "build"]),
};
const BENIGN_ONE = new Set(["rg", "ls", "dir", "cat", "type", "node", "tsc", "python", "pwsh", "powershell"]);

/** O `head2` é de um comando de rotina (o conjunto benigno da promoção)? */
export function isBenignHead(head2: string): boolean {
  const [a = "", b = ""] = head2.split(" ");
  return BENIGN_ONE.has(a) || (BENIGN_TWO[a]?.has(b) ?? false);
}

export interface PromoteCheck {
  promote: boolean;
  reasons: string[];
}

/** Promove quando o log tem ≥7 dias, ≥200 chamadas e zero would-deny/deny em comando benigno. */
export function promoteCheck(home: string, nowMs: number): PromoteCheck {
  const recs = readLogs(home);
  if (recs.length === 0) return { promote: false, reasons: ["log vazio ou ausente"] };
  const reasons: string[] = [];
  const first = Date.parse(recs[0]?.ts ?? "");
  const days = Number.isFinite(first) ? (nowMs - first) / 86_400_000 : 0;
  if (days < PROMOTE_MIN_DAYS) reasons.push(`o log tem ${days.toFixed(1)} dia(s), o mínimo é ${PROMOTE_MIN_DAYS}`);
  if (recs.length < PROMOTE_MIN_CALLS) reasons.push(`${recs.length} chamada(s) registrada(s), o mínimo é ${PROMOTE_MIN_CALLS}`);
  const bad = recs.filter((r) => (r.decision === "would-deny" || r.decision === "deny") && isBenignHead(r.head2));
  if (bad.length > 0) {
    const byRule = new Map<string, number>();
    for (const r of bad) byRule.set(r.rule ?? "?", (byRule.get(r.rule ?? "?") ?? 0) + 1);
    reasons.push(`${bad.length} recusa(s) em comando benigno (${[...byRule].map(([k, v]) => `${k} x${v}`).join(", ")}); revise as regras e limpe o log`);
  }
  return { promote: reasons.length === 0, reasons };
}

const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;

export function statusText(home: string, env: Env, nowMs: number): string {
  const recs = readLogs(home);
  const lines = [`modo: ${readMode(home)}`, `chamadas: ${recs.length}`];
  const by = new Map<string, { would: number; deny: number }>();
  for (const r of recs) {
    if (r.decision === "allow") continue;
    const e = by.get(r.rule ?? "?") ?? { would: 0, deny: 0 };
    if (r.decision === "deny") e.deny++;
    else e.would++;
    by.set(r.rule ?? "?", e);
  }
  lines.push(by.size === 0 ? "recusas por regra: nenhuma" : "recusas por regra:");
  for (const [k, v] of [...by].sort()) lines.push(`  ${k}: would-deny ${v.would}, deny ${v.deny}`);
  const ms = recs.map((r) => r.ms).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  if (ms.length > 0) lines.push(`latência interna (ms, do início do processo ao log): p50 ${pct(ms, 0.5)}, p95 ${pct(ms, 0.95)}, máx ${ms[ms.length - 1]} (n=${ms.length})`);
  lines.push(`ADMIN: ${adminActive(env, home, nowMs) ? "ativo" : "inativo"}`);
  return lines.join("\n");
}

// ---------- validação do arquivo de regras ----------

/** Valida um arquivo guard-rules.json. Devolve a mensagem e o código de saída (0 ou 1). */
export function validateRulesFile(file: string): { message: string; code: number } {
  let text: string;
  try {
    text = readFileSync(file, "utf8").replace(/^﻿/, "");
  } catch (e) {
    return { message: `erro: não consegui ler ${file} (${e instanceof Error ? e.message : "erro"})`, code: 1 };
  }
  const c = compileRulesText(text, UNIVERSAL_IDS);
  if (c.errors.length > 0) return { message: [`${file}: ${c.errors.length} erro(s)`, ...c.errors.map((e) => `  erro: ${e}`)].join("\n"), code: 1 };
  return { message: `ok: ${file} (versão 1, ${c.rules.length} regra(s) compilada(s), incluindo protectedPaths)`, code: 0 };
}

// ---------- entrada ----------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const home = guardHomeDir();
  const flag = args[0];
  if (flag === "--validate-rules") {
    const file = args[1];
    if (file === undefined) {
      console.error("uso: bun guard.ts --validate-rules <arquivo>");
      process.exitCode = 1;
      return;
    }
    const r = validateRulesFile(file);
    (r.code === 0 ? console.log : console.error)(r.message);
    process.exitCode = r.code;
    return;
  }
  if (flag === "--promote-check" || flag === "--promote") {
    const r = promoteCheck(home, Date.now());
    console.log(r.promote ? "promote" : `wait: ${r.reasons.join("; ")}`);
    if (flag === "--promote" && r.promote) {
      mkdirSync(home, { recursive: true });
      writeFileSync(join(home, "mode"), "enforce\n");
      console.log(`modo enforce gravado em ${join(home, "mode")}`);
    }
    return;
  }
  if (flag === "--status") {
    console.log(statusText(home, process.env, Date.now()));
    return;
  }
  if (flag === "--help" || flag === "-h") {
    console.log("bun guard.ts (hook PreToolUse via stdin) | --validate-rules <arquivo> | --promote-check | --promote | --status");
    return;
  }
  // modo hook: nada além do JSON de decisão no stdout; qualquer erro = falha aberta
  const out = runGuard(await Bun.stdin.text());
  if (out !== "") await Bun.write(Bun.stdout, out);
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    // falha aberta
  }
  process.exit(process.exitCode ?? 0);
}
