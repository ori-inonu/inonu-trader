/**
 * Regras UNIVERSAIS da guarda (valem em qualquer projeto): segredos, histórico git, dependências, billing, MCP de
 * custo e migração, autoproteção. Cada regra é pura: recebe a chamada normalizada e diz se casa. Os motivos são
 * estáticos (nunca incluem texto do comando). As regras do projeto vêm de dados em guard-core.ts.
 *
 * Todas erram para o lado de negar na dúvida (um deny errado custa uma recusa; um allow errado custa o dano).
 * Contornos conhecidos (variável, script em arquivo, base64, eval dinâmico) estão no README.
 */
import { isInlineInterpreter, pathMatches, shellWriteHit, type Call, type Ctx, type Rule } from "./guard-core";
import { copyParts, globToRegExp, normPath, type Cmd } from "./shell";

// ---------- ajudantes ----------

/** Argumentos que não são flag, sem os valores das flags que consomem o argumento seguinte. */
function positionals(args: readonly string[], valueFlags: readonly string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i] ?? "";
    if (t === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (t.startsWith("-")) {
      if (valueFlags.includes(t)) i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Cluster de flags curtas (`-fd`, `-uf`) contém alguma das letras? Não olha flags longas (`--force`). */
function shortHas(args: readonly string[], letters: string): boolean {
  return args.some((a) => /^-[A-Za-z]+$/.test(a) && [...a.slice(1)].some((ch) => letters.includes(ch)));
}

const SECRET_NAME = /key|secret|token|password/i;

// ---------- (a) segredos ----------

const SECRET_CANDIDATES = [".env", ".env.local", ".env.production", ".credentials.json", ".claude.json", ".ssh", ".aws"];

function secretSeg(seg: string): boolean {
  if (seg === ".env.example") return false;
  return seg === ".ssh" || seg === ".aws" || seg === ".credentials.json" || /^\.claude\.json(?:\..*)?$/.test(seg) || /^\.env(?:\..+)?$/.test(seg);
}

/** Caminho de segredo: .env (menos .env.example), .credentials.json, .claude.json, .ssh, .aws, *.pem, *.key (e glob que alcança isso). */
export function isSecretPath(tok: string): boolean {
  if (/^\\\./.test(tok)) return false; // `\.env` é regex escapado, não caminho
  const segs = tok.replace(/\\/g, "/").toLowerCase().split("/");
  if (segs.some(secretSeg)) return true;
  const last = segs[segs.length - 1] ?? "";
  if (/\.(?:pem|key)$/.test(last)) return true;
  if (last.startsWith(".") && /[*?]/.test(last)) {
    const re = globToRegExp(last);
    return SECRET_CANDIDATES.some((c) => re.test(c));
  }
  return false;
}

/** Um argumento de comando referencia segredo? Entende `-Path:x`, `--file=x`, `f=@x` (curl) e `HEAD:x` (git). */
function secretTok(tok: string): boolean {
  const cands = [tok];
  if (tok.startsWith("-")) {
    const m = /^-{1,2}[\w-]+[:=](.+)$/.exec(tok);
    if (m?.[1] !== undefined) cands.push(m[1]);
  } else {
    const eq = tok.indexOf("=");
    if (eq > 0) cands.push(tok.slice(eq + 1));
  }
  const colon = tok.lastIndexOf(":");
  if (colon > 1) cands.push(tok.slice(colon + 1));
  return cands.some((c) => isSecretPath(c.replace(/^@/, "")));
}

const READ_VERBS = new Set([
  "cat", "type", "get-content", "gc", "more", "less", "head", "tail", "sls", "select-string", "rg", "grep", "egrep", "fgrep",
  "base64", "certutil", "findstr", "xxd", "od", "strings", "tac", "nl", "bat", "sed", "awk", "gawk", "cut", "sort", "uniq",
  "diff", "cmp", "source", ".", "jq", "yq", "openssl", "ssh-keygen",
]);
const COPY_READ = new Set(["cp", "copy", "copy-item", "cpi", "xcopy", "robocopy"]);
const EXFIL_VERBS = new Set([
  "curl", "wget", "scp", "rsync", "sftp", "ftp", "nc", "ncat", "tar", "zip", "7z", "7za", "compress-archive",
  "invoke-webrequest", "iwr", "invoke-restmethod", "irm",
]);
const GIT_READ = new Set(["show", "cat-file", "diff", "log", "blame", "grep"]);

/** Menção a arquivo de segredo dentro de código embutido (python -c, node -e...). */
function secretMention(cmdText: string): boolean {
  const t = cmdText.replace(/\.env\.example(?![\w-])/g, "");
  return (
    /(?:^|[\s"'(=/])\.env(?:\.[\w-]+)*(?=$|[\s"')\]},;:|&])/.test(t) ||
    /(?:^|[\s"'(=/])\.(?:credentials|claude)\.json/.test(t) ||
    /\/\.(?:ssh|aws)(?:\/|$|[\s"'])/.test(t) ||
    /\.pem(?=$|[\s"')])/.test(t)
  );
}

const PATTERN_VERBS = new Set(["rg", "grep", "egrep", "fgrep", "findstr"]);

/** Argumentos de um leitor que podem ser ARQUIVOS: o padrão de busca (rg/grep/sls) não conta como caminho. */
function readCandidates(c: Cmd): string[] {
  const a = c.args;
  if (PATTERN_VERBS.has(c.name)) {
    if (a.some((x) => x === "-e" || x === "--regexp" || x === "-f" || x === "--file" || x.startsWith("--regexp=") || x.startsWith("--file="))) return a;
    const k = a.findIndex((x) => !x.startsWith("-"));
    return k < 0 ? a : a.filter((_, i) => i !== k);
  }
  if (c.name === "sls" || c.name === "select-string") {
    const k = a.findIndex((x) => x.toLowerCase() === "-pattern");
    if (k >= 0) return a.filter((_, i) => i !== k + 1);
    const j = a.findIndex((x, i) => !x.startsWith("-") && (i === 0 || !(a[i - 1] ?? "").startsWith("-")));
    return j < 0 ? a : a.filter((_, i) => i !== j);
  }
  return a;
}

const VAR_ARG = /\$[\w{(]|%\w+%|``/;

function secretRead(call: Call): boolean | string {
  for (const c of call.cmds) {
    // `< .env` entrega o segredo ao processo, qualquer que seja o comando (while read, bun run...)
    if (c.inp.some(secretTok)) return "redirecionamento de entrada de segredo";
    // caminho em variável ou substituição (`f=.env; cat $f`) e o texto menciona um segredo: na dúvida, nega
    if ((READ_VERBS.has(c.name) || COPY_READ.has(c.name)) && c.args.some((a) => VAR_ARG.test(a)) && secretMention(call.cmdText)) return `${c.name} via variável`;
    if (READ_VERBS.has(c.name) && readCandidates(c).some(secretTok)) return `${c.name} sobre segredo`;
    if (COPY_READ.has(c.name) && (copyParts(c.args).sources.some(secretTok) || c.inp.some(secretTok))) return `${c.name} de segredo`;
    if (EXFIL_VERBS.has(c.name) && c.args.some(secretTok)) return `${c.name} com segredo`;
    if (c.name === "git" && c.args.some((a) => GIT_READ.has(a)) && c.args.some(secretTok)) return "git lendo segredo";
    if (isInlineInterpreter(c) && secretMention(call.cmdText)) return "código embutido lendo segredo";
  }
  if (/readall(?:text|lines|bytes)|\.read(?:text|bytes)\(|get-content/i.test(call.cmdText) && secretMention(call.cmdText)) return "leitura de segredo";
  return false;
}

const PRINT_VERBS = new Set(["echo", "printf", "write-host", "write-output", "write", "print", "out-host", "write-error", "out-string"]);
const PS_LIST_VERBS = new Set(["gci", "ls", "dir", "get-childitem", "get-item", "gi", "get-content", "gc", "type", "cat", "get-itemproperty", "gp"]);

/** Algum argumento expande uma variável cujo nome contém KEY, SECRET, TOKEN ou PASSWORD? */
function expandsSecretVar(arg: string): boolean {
  for (const m of arg.matchAll(/\$\{?(?:env:)?([A-Za-z_]\w*)\}?|%([A-Za-z_]\w*)%/g)) {
    if (SECRET_NAME.test(m[1] ?? m[2] ?? "")) return true;
  }
  return false;
}

function envDump(call: Call): boolean | string {
  for (const c of call.cmds) {
    const a = c.args;
    switch (c.name) {
      case "printenv":
        if (a.length === 0 || a.some((x) => !x.startsWith("-") && SECRET_NAME.test(x))) return "printenv";
        break;
      case "env":
        return "env sem comando";
      case "export":
        if (a.every((x) => x.startsWith("-"))) return "export sem argumento";
        break;
      case "declare":
      case "typeset":
        if (a.length === 0 || a.every((x) => /^-[a-zA-Z]*[xp][a-zA-Z]*$/.test(x))) return "declare -x/-p";
        break;
      case "set":
        if (a.length === 0) return "set sem argumento";
        break;
      case "compgen":
        if (a.some((x) => x === "-v" || x === "-e")) return "compgen -v";
        break;
      default:
        break;
    }
    if (PS_LIST_VERBS.has(c.name)) {
      for (const raw of a) {
        const m = /^(?:-\w+:)?env:(.*)$/i.exec(raw);
        if (m !== null) {
          const rest = m[1] ?? "";
          if (rest === "" || /^[*\\/]/.test(rest) || SECRET_NAME.test(rest)) return "Get-ChildItem Env:";
        }
      }
    }
    if (PRINT_VERBS.has(c.name) && a.some(expandsSecretVar)) return `${c.name} de variável secreta`;
    // `$env:CHAVE_API` sozinho imprime o valor; `$env:CHAVE_API = "x"` apenas atribui
    if (a.length === 0 && /^\$\{?env:\w*(?:key|secret|token|password)\w*\}?$/i.test(c.name)) return "variável secreta como comando";
    if (isInlineInterpreter(c) && /process\.env(?![.\w[])|bun\.env(?![.\w[])|deno\.env\.toobject|os\.environ(?![.\w[])|(?:process\.env|bun\.env)\.\w*(?:key|secret|token|password)|(?:process\.env|bun\.env)\[\s*['"][^'"]*(?:key|secret|token|password)|os\.getenv\(\s*['"][^'"]*(?:key|secret|token|password)/i.test(call.cmdText)) return "despejo do ambiente por código embutido";
  }
  if (/\[(?:system\.)?environment\]::getenvironmentvariables\b/.test(call.cmdText)) return "[Environment]::GetEnvironmentVariables";
  if (/\[(?:system\.)?environment\]::getenvironmentvariable\(\s*['"]?\w*(?:key|secret|token|password)/.test(call.cmdText)) return "GetEnvironmentVariable de variável secreta";
  return false;
}

// ---------- (b) histórico git ----------

const GIT_VALUE_GLOBALS = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"];

/** Devolve o detalhe da recusa para uma invocação `git ...` (args depois do nome), ou null. */
export function gitDenial(args: string[]): string | null {
  let i = 0;
  while (i < args.length && (args[i] ?? "").startsWith("-")) i += GIT_VALUE_GLOBALS.includes(args[i] ?? "") ? 2 : 1;
  const sub = args[i] ?? "";
  const rest = args.slice(i + 1);
  const has = (...flags: string[]): boolean => rest.some((a) => flags.includes(a));
  const pos = rest.filter((a) => !a.startsWith("-"));
  switch (sub) {
    case "push":
      if (rest.some((a) => a.startsWith("--force") || a === "--mirror" || a === "--delete" || a.startsWith("--prune")) || shortHas(rest, "fd")) return "push forçado, mirror, prune ou delete";
      if (pos.some((p) => p.startsWith(":") || p.startsWith("+"))) return "push com refspec de apagar (:ref) ou forçar (+ref)";
      return null;
    case "branch":
      return has("--delete", "--force") || shortHas(rest, "dDfM") ? "branch -d/-D/-f/-M" : null;
    case "reset":
      return has("--hard") ? "reset --hard" : null;
    case "clean": {
      const force = has("--force") || shortHas(rest, "f");
      const dry = has("--dry-run") || shortHas(rest, "n");
      return force && !dry ? "clean -f" : null;
    }
    case "checkout":
      if (has("--force") || shortHas(rest, "fB")) return "checkout -f/-B";
      if (rest.includes("--")) return "checkout -- (descarta alterações)";
      if (pos.includes(".")) return "checkout . (descarta alterações)";
      if (!has("--orphan", "--track", "--detach") && !shortHas(rest, "btl") && pos.length >= 2) return "checkout <ref> <caminho> (sobrescreve arquivos)";
      return null;
    case "switch":
      return has("--force", "--discard-changes", "--force-create") || shortHas(rest, "fC") ? "switch -f/-C" : null;
    case "restore":
      return "restore (descarta alterações)";
    case "stash":
      return rest[0] === "drop" || rest[0] === "clear" ? "stash drop/clear" : null;
    case "commit":
      return rest.some((a) => a.startsWith("--amend")) ? "commit --amend" : null;
    case "rebase":
      return "rebase";
    case "reflog":
      return rest[0] === "expire" || rest[0] === "delete" ? "reflog expire/delete" : null;
    case "gc":
      return rest.some((a) => a.startsWith("--prune")) ? "gc --prune" : null;
    case "prune":
      return "prune";
    case "update-ref":
      return has("-d", "--delete") ? "update-ref -d" : null;
    case "tag":
      return has("--delete", "--force") || shortHas(rest, "df") ? "tag -d/-f" : null;
    case "worktree":
      return rest[0] === "remove" ? "worktree remove" : null;
    case "filter-branch":
      return "filter-branch";
    case "filter-repo":
      return "filter-repo";
    default:
      return null;
  }
}

// ---------- (c) dependências ----------

const BUN_VALUE_FLAGS = ["--cwd", "-c", "--config", "--env-file", "-r", "--preload", "--registry", "--cache-dir", "--backend", "--filter", "-F", "--omit", "--concurrent-scripts", "--network-concurrency", "--tag"];
const NPM_VALUE_FLAGS = ["--prefix", "--cwd", "-C", "--workspace", "-w", "--registry", "--cache", "--userconfig", "--filter", "-F", "--tag", "--save-prefix", "--loglevel"];
const NPM_INSTALL = new Set(["install", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall"]);
const NPM_CHANGE = new Set(["add", "remove", "rm", "uninstall", "un", "unlink", "update", "up", "upgrade", "upgrade-interactive", "dedupe"]);

function depDenial(c: Cmd): string | null {
  const name = c.name;
  const a = c.args;
  if (name === "bun") {
    const pos = positionals(a, BUN_VALUE_FLAGS);
    const sub = pos[0] ?? "";
    if (["add", "a", "remove", "rm", "update", "upgrade"].includes(sub)) return `bun ${sub}`;
    if ((sub === "install" || sub === "i") && pos.length > 1) return "bun install <pacote>";
    if (sub === "pm" && pos[1] === "trust") return "bun pm trust";
    return null;
  }
  if (name === "npm" || name === "pnpm" || name === "yarn") {
    const pos = positionals(a, NPM_VALUE_FLAGS);
    const sub = (pos[0] ?? "").toLowerCase();
    if (NPM_CHANGE.has(sub)) return `${name} ${sub}`;
    if (NPM_INSTALL.has(sub) && pos.length > 1) return `${name} install <pacote>`;
    if (sub === "global" && NPM_CHANGE.has((pos[1] ?? "").toLowerCase())) return `${name} global ${pos[1]}`;
    if (sub === "audit" && pos[1] === "fix") return `${name} audit fix`;
    return null;
  }
  const pos = positionals(a);
  const sub = (pos[0] ?? "").toLowerCase();
  switch (name) {
    case "pip":
    case "pip2":
    case "pip3":
    case "pipx":
      return sub === "install" || sub === "uninstall" ? `${name} ${sub}` : null;
    case "python":
    case "python3":
    case "py": {
      const k = a.indexOf("-m");
      if (k >= 0 && /^pip[23]?$/.test(a[k + 1] ?? "") && ["install", "uninstall"].includes((positionals(a.slice(k + 2))[0] ?? "").toLowerCase())) return "python -m pip install";
      return null;
    }
    case "uv":
      if (["add", "remove"].includes(sub)) return `uv ${sub}`;
      if ((sub === "pip" || sub === "tool") && ["install", "uninstall"].includes((pos[1] ?? "").toLowerCase())) return `uv ${sub} ${pos[1]}`;
      return null;
    case "poetry":
      return ["add", "remove", "update"].includes(sub) ? `poetry ${sub}` : null;
    case "cargo":
      return ["install", "add", "remove", "update"].includes(sub) ? `cargo ${sub}` : null;
    case "winget":
    case "choco":
    case "chocolatey":
    case "scoop":
    case "brew":
    case "apt":
    case "apt-get":
    case "dnf":
    case "yum":
      return ["install", "upgrade", "uninstall", "import", "remove"].includes(sub) ? `${name} ${sub}` : null;
    case "go":
      return sub === "get" || sub === "install" ? `go ${sub}` : null;
    case "gem":
      return sub === "install" ? "gem install" : null;
    case "dotnet":
      return sub === "add" || (sub === "tool" && pos[1] === "install") ? "dotnet add/tool install" : null;
    case "deno":
      return ["add", "install", "remove"].includes(sub) ? `deno ${sub}` : null;
    case "install-module":
    case "install-package":
    case "install-script":
    case "install-psresource":
    case "update-module":
    case "save-module":
      return name;
    default:
      return null;
  }
}

const LOCKFILES = new Set(["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const DEP_KEYS = /\b(?:dependencies|devdependencies|optionaldependencies|peerdependencies|bundle[d]?dependencies|overrides|resolutions|trusteddependencies)\b/i;
const VERSION_LIKE = /^(?:[\^~<>=v\s]*\d[\w.\-+*xX\s<>=|^~]*|\*|latest|next|workspace:.*|npm:.*|github:.*|git\+.*|file:.*|link:.*|catalog:.*|https?:.*)$/;

/** O trecho de package.json toca dependências: chave de dependência ou linha `"nome": "versão"` (menos "version"). */
function touchesDeps(text: string): boolean {
  if (DEP_KEYS.test(text)) return true;
  for (const m of text.matchAll(/"([^"\n]+)"\s*:\s*"([^"\n]*)"/g)) {
    if (m[1] !== "version" && VERSION_LIKE.test(m[2] ?? "")) return true;
  }
  return false;
}

const baseOf = (normalizedPath: string): string => normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);

// ---------- (d) billing ----------

const ASKJEV_TOKEN = /(?:^|[\\/])ask-jev(?:\.[cm]?[jt]s)?$/i;
const CONSENSUS_TOKEN = /(?:^|[\\/])jev-consensus(?:\.[cm]?[jt]s)?$/i;
/** Comandos que só leem, listam ou movem arquivos: mencionar ask-jev.ts neles não o executa. */
const NONEXEC = new Set([
  "git", "cat", "type", "rg", "grep", "egrep", "fgrep", "ls", "dir", "head", "tail", "wc", "get-content", "gc", "select-string",
  "sls", "get-item", "get-childitem", "gci", "gi", "stat", "file", "echo", "write-host", "test-path", "diff", "findstr", "less",
  "more", "bat", "tsc", "code", "notepad", "cp", "copy", "mv", "move", "rm", "del", "copy-item", "move-item", "remove-item",
]);

function tokenIn(c: Cmd, re: RegExp): boolean {
  return re.test(c.name) || c.args.some((a) => re.test(a) || (a.includes("=") && re.test(a.slice(a.indexOf("=") + 1))));
}

function runsAskJev(call: Call): boolean {
  for (const c of call.cmds) {
    if (NONEXEC.has(c.name)) continue;
    if (tokenIn(c, ASKJEV_TOKEN)) return true;
    if (isInlineInterpreter(c) && /ask-jev(?!\.test)/i.test(call.command)) return true;
  }
  return false;
}

function paidByWorker(call: Call): boolean | string {
  if (!call.worker) return false;
  if (call.kind === "mcp") return call.tool.endsWith("__consensus_run") ? "consensus_run" : false;
  for (const c of call.cmds) {
    if (NONEXEC.has(c.name)) continue;
    if (c.args.some((a) => a === "--allow-paid-inference" || a.startsWith("--allow-paid-inference="))) return "--allow-paid-inference";
    if (tokenIn(c, CONSENSUS_TOKEN)) {
      const idx = c.args.findIndex((a) => CONSENSUS_TOKEN.test(a));
      const after = idx >= 0 ? c.args.slice(idx + 1) : c.args;
      if (after.includes("run")) return "jev-consensus run";
    }
  }
  return false;
}

// ---------- (e) MCP de custo e migração ----------

const MCP_MIGRATION = ["apply_migration", "execute_sql"];
const MCP_COST = ["create_project", "create_branch", "confirm_cost", "deploy_edge_function", "delete_branch", "merge_branch", "reset_branch", "rebase_branch", "pause_project", "restore_project"];
const mcpSuffix = (call: Call, names: readonly string[]): string | false => {
  if (call.kind !== "mcp") return false;
  const hit = names.find((n) => call.tool.endsWith(`__${n}`));
  return hit ?? false;
};

// ---------- (f) autoproteção ----------

const protectedCache = new Map<string, RegExp[]>();
function protectedRes(ctx: Ctx): RegExp[] {
  const key = `${ctx.home}|${ctx.guardHome}`;
  let res = protectedCache.get(key);
  if (res === undefined) {
    const h = normPath(ctx.home, "");
    const g = normPath(ctx.guardHome, "");
    const globs = ["**/.claude/settings*.json", "**/.claude/guard-rules.json", "**/.mcp.json"];
    if (h !== "") globs.push(`${h}/.claude/guard/**`, `${h}/.claude/claude.md`);
    if (g !== "") globs.push(`${g}/**`);
    res = globs.map(globToRegExp);
    protectedCache.set(key, res);
  }
  return res;
}

/** Menção, no texto do comando, a um arquivo protegido (para o caso de alvo em variável e de código embutido). */
function selfMention(cmdText: string): boolean {
  return /\.claude\/(?:settings[^/\s"']*\.json|guard|claude\.md)|\.mcp\.json/.test(cmdText);
}

// ---------- a lista ----------

const RULES: readonly Rule[] = [
  {
    id: "autoprotecao",
    topic: "autoproteção",
    reason: "autoproteção da guarda: settings*.json, ~/.claude/guard, ~/.claude/CLAUDE.md, .mcp.json e guard-rules.json não se alteram numa sessão sem supervisão (o dono libera com HARNESS_ADMIN=1)",
    match(call, ctx) {
      if (ctx.admin) return false;
      const res = protectedRes(ctx);
      if (call.kind === "file") return call.write && pathMatches(res, call) ? "edição de arquivo" : false;
      if (call.kind === "shell") return shellWriteHit(call, ctx, (p) => res.some((r) => r.test(p)), selfMention) ?? false;
      return false;
    },
  },
  {
    id: "seg-leitura",
    topic: "segredos",
    reason: "segredos, chaves e credenciais (.env, .credentials.json, .claude.json, .ssh, .aws, *.pem, *.key) não se leem, imprimem nem copiam; .env.example pode",
    match: (call) => (call.kind === "shell" ? secretRead(call) : false),
  },
  {
    id: "seg-ambiente",
    topic: "segredos",
    reason: "despejar o ambiente ou imprimir variável com KEY, SECRET, TOKEN ou PASSWORD expõe segredos",
    match: (call) => (call.kind === "shell" ? envDump(call) : false),
  },
  {
    id: "git-historico",
    topic: "histórico git",
    reason: "reescrever histórico, apagar branches ou descartar a árvore de trabalho é tema cercado (push forçado, branch -D, reset --hard, clean -f, checkout --, restore, stash drop, commit --amend, rebase, reflog expire, gc --prune, tag -d...)",
    match(call) {
      if (call.kind !== "shell") return false;
      for (const c of call.cmds) {
        const d = c.name === "git" ? gitDenial(c.args) : c.name === "git-filter-repo" ? "filter-repo" : null;
        if (d !== null) return d;
      }
      return false;
    },
  },
  {
    id: "dep-comando",
    topic: "dependências",
    reason: "adicionar, remover ou trocar dependências é tema cercado (bun add/remove/update, bun install <pacote>, npm/pnpm/yarn install <pacote>, pip/cargo/winget/choco install); `bun install` sem pacote é livre",
    match(call) {
      if (call.kind !== "shell") return false;
      for (const c of call.cmds) {
        const d = depDenial(c);
        if (d !== null) return d;
      }
      return false;
    },
  },
  {
    id: "dep-lockfile",
    topic: "dependências",
    reason: "lockfiles (bun.lock, bun.lockb, package-lock.json, pnpm-lock.yaml, yarn.lock) só mudam por instalação, nunca à mão",
    match(call, ctx) {
      if (call.kind === "file") return call.write && LOCKFILES.has(baseOf(call.path)) ? "edição de lockfile" : false;
      if (call.kind !== "shell") return false;
      return shellWriteHit(call, ctx, (p) => LOCKFILES.has(baseOf(p)), () => false) ?? false;
    },
  },
  {
    id: "dep-manifesto",
    topic: "dependências",
    reason: "alterar dependências em package.json (dependencies, devDependencies, optionalDependencies, peerDependencies, overrides, resolutions, trustedDependencies) é tema cercado",
    match(call, ctx) {
      if (call.kind === "file") return call.write && baseOf(call.path) === "package.json" && (touchesDeps(call.newText) || touchesDeps(call.oldText)) ? "package.json" : false;
      if (call.kind !== "shell") return false;
      if (!touchesDeps(call.command)) return false;
      return shellWriteHit(call, ctx, (p) => baseOf(p) === "package.json", () => false) ?? false;
    },
  },
  {
    id: "bill-askjev",
    topic: "billing",
    reason: "ask-jev.ts é consulta paga sem recibo nem meter; o caminho único é o MCP jev-consensus",
    match: (call) => (call.kind === "shell" ? runsAskJev(call) : false),
  },
  {
    id: "bill-worker",
    topic: "billing",
    reason: "subagente (worker) não faz chamada paga ao Jev (AGENTS.md); jev-consensus run, --allow-paid-inference e consensus_run ficam com a sessão principal",
    match: (call) => paidByWorker(call),
  },
  {
    id: "mcp-migracao",
    topic: "migrações",
    reason: "migração e SQL direto no banco (apply_migration, execute_sql) são tema cercado",
    match: (call) => mcpSuffix(call, MCP_MIGRATION),
  },
  {
    id: "mcp-custo",
    topic: "billing",
    reason: "ferramenta MCP de custo ou efeito externo (create_project, create_branch, confirm_cost, deploy_edge_function, delete_branch, merge_branch, reset_branch, rebase_branch, pause_project, restore_project) é tema cercado",
    match: (call) => mcpSuffix(call, MCP_COST),
  },
];

/** As regras universais, na ordem de avaliação. */
export function universalRules(): readonly Rule[] {
  return RULES;
}

/** Ids reservados (o arquivo de regras do projeto não pode repeti-los). */
export const UNIVERSAL_IDS: ReadonlySet<string> = new Set(RULES.map((r) => r.id));
