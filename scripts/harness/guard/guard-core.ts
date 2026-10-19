/**
 * Núcleo PURO da guarda PreToolUse (sem E/S, sem relógio): `evaluate(input, rules, ctx)` decide allow ou deny para uma
 * chamada de ferramenta. As regras universais ficam em builtin-rules.ts; as do projeto vêm de dados
 * (`.claude/guard-rules.json`, esquema versão 1) compilados aqui por `compileRulesFile`. Quem lê stdin, o modo e escreve
 * o log é guard.ts. O núcleo só nega; não registra nada e nunca executa o comando.
 */
import { analyze, directoryTarget, globToRegExp, isInlineInterpreter, normPath, writeTargets, type Cmd } from "./shell";

export interface HookInput {
  session_id?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  agent_id?: string;
  agent_type?: string;
}

export interface Decision {
  decision: "allow" | "deny";
  rule?: string;
  reason?: string;
  topic?: string;
  /** Só em allow: id da regra que lançou exceção durante a avaliação (a regra foi pulada). */
  error?: string;
}

/** Contexto injetado (mantém `evaluate` puro). `admin` já considera HARNESS_ADMIN e o arquivo ADMIN. */
export interface Ctx {
  admin: boolean;
  home: string;
  guardHome: string;
  projectDir: string;
}

export type Kind = "shell" | "file" | "mcp" | "other";

/** Chamada normalizada: tudo que as regras precisam, calculado uma vez. */
export interface Call {
  tool: string;
  kind: Kind;
  ps: boolean;
  /** Ferramenta que grava arquivo (Edit, Write, NotebookEdit, MultiEdit). */
  write: boolean;
  /** `agent_id` presente = subagente (worker). */
  worker: boolean;
  command: string;
  /** Comando com `\` virando `/` e em minúsculas. */
  cmdText: string;
  cmds: Cmd[];
  /** Caminho do arquivo normalizado (barras `/`, minúsculas, home expandida). */
  path: string;
  /** Caminho relativo ao diretório do projeto, ou "" se estiver fora dele. */
  rel: string;
  oldText: string;
  newText: string;
  cwd: string;
}

export interface Rule {
  id: string;
  topic: string;
  reason: string;
  /** true = casa; string = casa e acrescenta o detalhe (estático) ao motivo. */
  match(call: Call, ctx: Ctx): boolean | string;
}

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
const FILE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit", "Read"]);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Normaliza a entrada do hook numa `Call`. Tolerante: campos ausentes ou de tipo errado viram vazios. */
export function buildCall(input: HookInput, ctx: Ctx): Call {
  const tool = str(input.tool_name);
  const ti: Record<string, unknown> = typeof input.tool_input === "object" && input.tool_input !== null ? input.tool_input : {};
  const cwd = str(input.cwd);
  const call: Call = {
    tool,
    kind: "other",
    ps: tool === "PowerShell",
    write: WRITE_TOOLS.has(tool),
    worker: typeof input.agent_id === "string" && input.agent_id !== "",
    command: "",
    cmdText: "",
    cmds: [],
    path: "",
    rel: "",
    oldText: "",
    newText: "",
    cwd,
  };
  if (SHELL_TOOLS.has(tool)) {
    call.kind = "shell";
    call.command = str(ti.command);
    call.cmdText = call.command.replace(/\\/g, "/").toLowerCase();
    call.cmds = analyze(call.command, call.ps);
  } else if (FILE_TOOLS.has(tool)) {
    call.kind = "file";
    const raw = str(ti.file_path) || str(ti.notebook_path) || str(ti.path);
    call.path = raw === "" ? "" : normPath(raw, ctx.home, cwd);
    const proj = normPath(ctx.projectDir, ctx.home);
    if (proj !== "" && call.path.startsWith(`${proj}/`)) call.rel = call.path.slice(proj.length + 1);
    if (tool === "Write") call.newText = str(ti.content);
    else if (tool === "NotebookEdit") call.newText = str(ti.new_source);
    else if (tool === "Edit") {
      call.newText = str(ti.new_string);
      call.oldText = str(ti.old_string);
    } else if (tool === "MultiEdit" && Array.isArray(ti.edits)) {
      for (const e of ti.edits as unknown[]) {
        if (typeof e === "object" && e !== null) {
          call.newText += `${str((e as Record<string, unknown>).new_string)}\n`;
          call.oldText += `${str((e as Record<string, unknown>).old_string)}\n`;
        }
      }
    }
  } else if (tool.startsWith("mcp__")) call.kind = "mcp";
  return call;
}

/**
 * A primeira regra que casa nega; nenhuma casando, permite. Uma regra que lança é pulada (falha aberta só dela, as
 * outras continuam valendo); se nenhuma negou e alguma lançou, o resultado é allow com `error` = id da regra que lançou.
 * Entrada que o próprio `buildCall` não consegue normalizar propaga a exceção (quem chama decide a falha aberta).
 */
export function evaluate(input: HookInput, rules: readonly Rule[], ctx: Ctx): Decision {
  const call = buildCall(input, ctx);
  if (call.kind === "other") return { decision: "allow" };
  let error: string | undefined;
  for (const r of rules) {
    let hit: boolean | string;
    try {
      hit = r.match(call, ctx);
    } catch {
      error ??= r.id;
      continue;
    }
    if (hit !== false) return { decision: "deny", rule: r.id, topic: r.topic, reason: typeof hit === "string" ? `${r.reason} (${hit})` : r.reason };
  }
  return error === undefined ? { decision: "allow" } : { decision: "allow", error };
}

// ---------- ajudantes compartilhados pelas regras ----------

/** O caminho do arquivo casa algum dos globs (inteiro, ou relativo ao projeto)? */
export function pathMatches(res: readonly RegExp[], call: Call): boolean {
  if (call.path === "") return false;
  return res.some((r) => r.test(call.path) || (call.rel !== "" && r.test(call.rel)));
}

export { isInlineInterpreter };

const WRITEISH = /write|append|\bopen\s*\(|create|renam|unlink|remov|rmdir|copy|\bmove|save|dump|truncate|\breplace|\bsed\b|\btee\b|set-content|out-file/i;
const HAS_VAR = /[$%]\w|\$\(\)|%\w/;
const HOME_VAR = /^(?:\$\{?env:(?:userprofile|home)|\$\{?home|\$\{?userprofile|%userprofile%|%home%)/i;
const MAX_DIRECTORY_CANDIDATES = 64;

/**
 * O comando grava, move ou apaga algo que `test` reconhece (caminho já normalizado)? Cobre redirecionamentos, os
 * verbos de escrita (rm, mv, tee, Set-Content, sed -i, cp/Copy-Item só pelo destino...), alvo em variável
 * (`Set-Content $p`) quando o texto menciona o caminho e interpretador com código embutido que menciona o caminho.
 * Devolve o detalhe do motivo ou null.
 */
export function shellWriteHit(call: Call, ctx: Ctx, test: (normalized: string) => boolean, mention: (cmdText: string) => boolean): string | null {
  let indirect = false;
  const directories = new Set([normPath(call.cwd, ctx.home)]);
  let directoryOverflow = false;
  for (const c of call.cmds) {
    const target = directoryTarget(c);
    if (target !== null) {
      for (const cwd of [...directories]) {
        const next = normPath(target, ctx.home, cwd);
        if (directories.has(next)) continue;
        if (directories.size >= MAX_DIRECTORY_CANDIDATES) { directoryOverflow = true; break; }
        directories.add(next);
      }
    }
    for (const t of writeTargets(c)) {
      if (directoryOverflow) return `escrita com diretorio ambiguo (mais de ${MAX_DIRECTORY_CANDIDATES} candidatos)`;
      if ([...directories].some(cwd => test(normPath(t, ctx.home, cwd)))) return "escrita via shell";
      if (HAS_VAR.test(t) && !HOME_VAR.test(t)) indirect = true;
    }
  }
  if (indirect && mention(call.cmdText)) return "escrita via variável";
  if (call.cmds.some(isInlineInterpreter) && mention(call.cmdText) && WRITEISH.test(call.cmdText)) return "escrita via interpretador";
  return null;
}

// ---------- regras de projeto (dados) ----------

export interface ProjectRuleDef {
  id: string;
  topic: string;
  tools: string[];
  commandRegex?: string[];
  pathGlobs?: string[];
  contentRegex?: string[];
  toolNameRegex?: string[];
  workerOnly?: boolean;
  reason: string;
}

export interface ProtectedPathDef {
  glob: string;
  topic: string;
  reason: string;
}

export interface RulesFile {
  version: 1;
  rules: ProjectRuleDef[];
  protectedPaths?: ProtectedPathDef[];
}

const RULE_KEYS = ["id", "topic", "tools", "commandRegex", "pathGlobs", "contentRegex", "toolNameRegex", "workerOnly", "reason"];
const TOOL_NAMES = ["Bash", "PowerShell", "Edit", "Write", "NotebookEdit", "MultiEdit", "Read", "mcp"];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Compila a fonte de regex com a flag `i`; recusa regex inválida e a que casa a cadeia vazia (negaria tudo). */
function compileRe(source: unknown, where: string, errors: string[]): RegExp | null {
  if (typeof source !== "string" || source === "") {
    errors.push(`${where}: esperado um texto de regex não vazio`);
    return null;
  }
  try {
    const re = new RegExp(source, "i");
    if (re.test("")) {
      errors.push(`${where}: a regex casa a cadeia vazia e negaria tudo (${JSON.stringify(source)})`);
      return null;
    }
    return re;
  } catch (e) {
    errors.push(`${where}: regex inválida ${JSON.stringify(source)} (${e instanceof Error ? e.message : "erro"})`);
    return null;
  }
}

function reList(v: unknown, where: string, errors: string[]): RegExp[] {
  if (!Array.isArray(v) || v.length === 0) {
    errors.push(`${where}: esperado uma lista não vazia de regex`);
    return [];
  }
  return v.map((s, i) => compileRe(s, `${where}[${i}]`, errors)).filter((r): r is RegExp => r !== null);
}

function globList(v: unknown, where: string, errors: string[]): RegExp[] {
  if (!Array.isArray(v) || v.length === 0) {
    errors.push(`${where}: esperado uma lista não vazia de globs`);
    return [];
  }
  const out: RegExp[] = [];
  v.forEach((g, i) => {
    if (!nonEmpty(g)) errors.push(`${where}[${i}]: esperado um glob não vazio`);
    else out.push(globToRegExp(g));
  });
  return out;
}

interface Compiled {
  rules: Rule[];
  errors: string[];
}

/** Valida e compila o arquivo de regras. `reserved` = ids que o projeto não pode reutilizar (os universais). */
export function compileRulesData(data: unknown, reserved: ReadonlySet<string> = new Set()): Compiled {
  const errors: string[] = [];
  const rules: Rule[] = [];
  if (!isObj(data)) return { rules, errors: ["raiz: esperado um objeto JSON"] };
  for (const k of Object.keys(data)) if (!["version", "rules", "protectedPaths"].includes(k)) errors.push(`raiz: chave desconhecida "${k}"`);
  if (data.version !== 1) errors.push(`version: esperado 1, veio ${JSON.stringify(data.version)}`);
  if (!Array.isArray(data.rules)) errors.push(`rules: esperado uma lista (pode ser vazia)`);
  const seen = new Set<string>();
  (Array.isArray(data.rules) ? data.rules : []).forEach((def: unknown, i: number) => {
    const w = `rules[${i}]`;
    if (!isObj(def)) {
      errors.push(`${w}: esperado um objeto`);
      return;
    }
    for (const k of Object.keys(def)) if (!RULE_KEYS.includes(k)) errors.push(`${w}: chave desconhecida "${k}"`);
    const id = def.id;
    if (typeof id !== "string" || !ID_RE.test(id)) errors.push(`${w}.id: esperado texto de letras, dígitos e . _ : - (até 64), veio ${JSON.stringify(id)}`);
    else if (seen.has(id)) errors.push(`${w}.id: "${id}" repetido`);
    else if (reserved.has(id)) errors.push(`${w}.id: "${id}" é de uma regra universal`);
    else seen.add(id);
    if (!nonEmpty(def.topic)) errors.push(`${w}.topic: esperado texto não vazio`);
    if (!nonEmpty(def.reason)) errors.push(`${w}.reason: esperado texto não vazio`);
    if (def.workerOnly !== undefined && typeof def.workerOnly !== "boolean") errors.push(`${w}.workerOnly: esperado true ou false`);
    const tools = Array.isArray(def.tools) ? def.tools : [];
    if (tools.length === 0) errors.push(`${w}.tools: esperado uma lista não vazia`);
    for (const t of tools) if (typeof t !== "string" || !TOOL_NAMES.includes(t)) errors.push(`${w}.tools: ferramenta desconhecida ${JSON.stringify(t)} (valem ${TOOL_NAMES.join(", ")})`);
    const hasShell = tools.some((t) => t === "Bash" || t === "PowerShell");
    const hasFile = tools.some((t) => t === "Edit" || t === "Write" || t === "NotebookEdit" || t === "MultiEdit" || t === "Read");
    const hasMcp = tools.includes("mcp");
    const command = def.commandRegex !== undefined || hasShell ? reList(def.commandRegex, `${w}.commandRegex`, errors) : [];
    const globs = def.pathGlobs !== undefined || hasFile ? globList(def.pathGlobs, `${w}.pathGlobs`, errors) : [];
    const content = def.contentRegex !== undefined ? reList(def.contentRegex, `${w}.contentRegex`, errors) : [];
    const names = def.toolNameRegex !== undefined || hasMcp ? reList(def.toolNameRegex, `${w}.toolNameRegex`, errors) : [];
    if (def.commandRegex !== undefined && !hasShell) errors.push(`${w}.commandRegex: só vale com Bash ou PowerShell em "tools"`);
    if ((def.pathGlobs !== undefined || def.contentRegex !== undefined) && !hasFile) errors.push(`${w}: pathGlobs e contentRegex só valem com Edit, Write, NotebookEdit, MultiEdit ou Read em "tools"`);
    if (def.contentRegex !== undefined && def.pathGlobs === undefined) errors.push(`${w}.contentRegex: precisa de pathGlobs`);
    if (def.toolNameRegex !== undefined && !hasMcp) errors.push(`${w}.toolNameRegex: só vale com "mcp" em "tools"`);
    if (typeof id !== "string" || !nonEmpty(def.topic) || !nonEmpty(def.reason)) return;
    const toolSet = new Set(tools.filter((t): t is string => typeof t === "string"));
    const workerOnly = def.workerOnly === true;
    rules.push({
      id,
      topic: def.topic,
      reason: def.reason,
      match(call) {
        if (workerOnly && !call.worker) return false;
        if (call.kind === "shell") return toolSet.has(call.tool) && command.some((re) => re.test(call.command) || re.test(call.command.replace(/\\/g, "/")));
        if (call.kind === "file") {
          if (!toolSet.has(call.tool) || !pathMatches(globs, call)) return false;
          return content.length === 0 || content.some((re) => re.test(call.newText) || re.test(call.oldText));
        }
        if (call.kind === "mcp") return toolSet.has("mcp") && names.some((re) => re.test(call.tool));
        return false;
      },
    });
  });
  if (data.protectedPaths !== undefined && !Array.isArray(data.protectedPaths)) errors.push(`protectedPaths: esperado uma lista`);
  (Array.isArray(data.protectedPaths) ? data.protectedPaths : []).forEach((def: unknown, i: number) => {
    const w = `protectedPaths[${i}]`;
    if (!isObj(def)) {
      errors.push(`${w}: esperado um objeto`);
      return;
    }
    for (const k of Object.keys(def)) if (!["glob", "topic", "reason"].includes(k)) errors.push(`${w}: chave desconhecida "${k}"`);
    if (!nonEmpty(def.glob)) errors.push(`${w}.glob: esperado texto não vazio`);
    if (!nonEmpty(def.topic)) errors.push(`${w}.topic: esperado texto não vazio`);
    if (!nonEmpty(def.reason)) errors.push(`${w}.reason: esperado texto não vazio`);
    if (!nonEmpty(def.glob) || !nonEmpty(def.topic) || !nonEmpty(def.reason)) return;
    const re = globToRegExp(def.glob);
    // trecho final do glob (sem `**/`), usado quando o alvo do shell é uma variável
    const tail = def.glob.replace(/\\/g, "/").toLowerCase().replace(/^(?:\*\*\/)+/, "");
    const literalTail = /[*?]/.test(tail) ? "" : tail;
    rules.push({
      id: `protected-path-${i + 1}`,
      topic: def.topic,
      reason: def.reason,
      match(call, ctx) {
        if (call.kind === "file") return call.write && pathMatches([re], call);
        if (call.kind === "shell") {
          const proj = `${normPath(ctx.projectDir, ctx.home)}/`;
          const test = (p: string): boolean => re.test(p) || (p.startsWith(proj) && re.test(p.slice(proj.length)));
          return shellWriteHit(call, ctx, test, (t) => literalTail !== "" && t.includes(literalTail)) ?? false;
        }
        return false;
      },
    });
  });
  return { rules, errors };
}

/** Lê o texto JSON do arquivo de regras. Qualquer erro vira lista de erros (e nenhuma regra). */
export function compileRulesText(text: string, reserved: ReadonlySet<string> = new Set()): Compiled {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { rules: [], errors: [`JSON inválido: ${e instanceof Error ? e.message : "erro"}`] };
  }
  const c = compileRulesData(data, reserved);
  return c.errors.length > 0 ? { rules: [], errors: c.errors } : c;
}
