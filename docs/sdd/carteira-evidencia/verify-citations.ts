/**
 * Confere as citações de arquivo e de linha dos três documentos desta pasta SDD contra um commit (padrão: `main`).
 *
 *   bun --no-env-file docs/sdd/carteira-evidencia/verify-citations.ts [ref]
 *
 * Somente leitura: lista arquivos com `git ls-files` e conta linhas com `git show`. Sai com código 1 se houver citação
 * de arquivo ausente, de linha fora da faixa ou ambígua sem contexto.
 *
 * O que NÃO prova: que a linha diz o que o texto afirma. Isso vem dos inventários e de reconferências por amostragem,
 * registradas em tasks.md. Caminhos fora do commit (árvores não commitadas, planejados, arquivos gerados em `data/`,
 * declarados inexistentes) são reconhecidos por lista explícita abaixo, para que um erro de digitação não se esconda.
 */

import { resolve } from "node:path";

const REF = process.argv[2] ?? "main";
const DIR = import.meta.dir;
const ROOT = resolve(DIR, "..", "..", "..");
const DOCS = ["requirements.md", "design.md", "tasks.md"];

function git(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString().trim()}`);
  return result.stdout.toString();
}

const tracked = git(["ls-tree", "-r", "--name-only", REF]).split("\n").filter(Boolean);
const trackedSet = new Set(tracked);
const byBase = new Map<string, string[]>();
for (const path of tracked) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  byBase.set(base, [...(byBase.get(base) ?? []), path]);
}

const lineCache = new Map<string, number>();
function lineCount(path: string): number {
  const cached = lineCache.get(path);
  if (cached !== undefined) return cached;
  const text = git(["show", `${REF}:${path}`]);
  const count = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  lineCache.set(path, count);
  return count;
}

// Fora do commit, por decisão documentada nos próprios SDD.
const UNCOMMITTED = ["src/okx-wallet/valuation-diagnostics", "docs/okx-portfolio-v1/VALUATION-DIAGNOSTICS-SPEC", "docs/okx-portfolio-v1/CAPITAL-BOUNDARY-AUDIT", "src/mobile-decision-report", "docs/mobile-decision-report", "src/real/", "docs/real-integration", "web/src/lib/wallet-store", "web/src/lib/real-pipeline", "src/onchainos/archive-discovery"];
const UNCOMMITTED_BASE = new Set(["valuation-diagnostics.ts", "wallet-store.ts"]);
const PLANNED = ["src/portfolio-", "web/src/lib/portfolio-evidence", "docs/sdd/carteira-evidencia"];
const DECLARED_ABSENT = ["OKX-HISTORICAL-ARCHIVES.md", "docs/OKX-HISTORICAL-ARCHIVES.md", "src/opportunities", "data/onchainos.env", "evidence/implementation-v1"];
const GENERATED = new Set(["latest.json", "cycles.jsonl", "reads.jsonl", "session.jsonl", "events.jsonl", "ledger.json", "snapshots.jsonl"]);
const NOT_FILES = new Set([".env", "process.env", "/"]);
const SIBLINGS = new Set([...DOCS, "verify-citations.ts"]);
const ROOT_PREFERRED = new Set(["README.md", "CLAUDE.md", "SPEC.md", "package.json", "CONTRIBUTING.md"]);
const EXT = "(?:ts|tsx|json|md|mjs|toml|mdc|css|jsonl|py|sh|env|sqlite)";
const TOKEN = /^(?<p>[A-Za-z0-9_@./\-[\]*]+?)(?::(?<l>\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*))?$/;

const maxLine = (lines: string) => Math.max(...lines.split(",").flatMap((part) => part.split("-").map(Number)));

function classify(p: string, lines: string | undefined, context: string): string {
  const path = p.replaceAll("\\", "/");
  if (NOT_FILES.has(path)) return "nao_e_arquivo";
  if (SIBLINGS.has(path)) return "irmao_na_pasta_sdd";
  if (GENERATED.has(path)) return "gerado_em_data";
  if (UNCOMMITTED_BASE.has(path)) return "fora_do_commit(por_nome)";
  if (!path.includes("/") && /src\/portfolio-|web\/src\/lib\/portfolio-evidence/.test(context)) return "planejado";
  if (PLANNED.some((x) => path.includes(x))) return "planejado";
  if (DECLARED_ABSENT.some((x) => path.includes(x))) return "declarado_inexistente_no_commit";
  if (path.startsWith("data/")) return "ignorado_pelo_git";
  if (UNCOMMITTED.some((x) => path.includes(x))) return "fora_do_commit(lista)";

  let resolved: string | null = null;
  if (path.includes("/")) {
    if (trackedSet.has(path)) resolved = path;
    else if (tracked.some((t) => t.startsWith(`${path.replace(/\/$/, "")}/`))) return "diretorio_no_commit";
    else {
      const suffix = tracked.filter((t) => t.endsWith(`/${path}`));
      if (suffix.length === 1) resolved = suffix[0]!;
      else return suffix.length > 1 ? `AMBIGUO(${suffix.length})` : "AUSENTE";
    }
  } else {
    let candidates = byBase.get(path) ?? [];
    if (candidates.length > 1) {
      const dirs = [...context.replaceAll("\\", "/").matchAll(/((?:[\w.-]+\/)+)[\w.-]+\.(?:ts|tsx|md|json|mjs)/g)].map((m) => m[1]!);
      const narrowed = candidates.filter((t) => dirs.some((d) => t.startsWith(d)));
      if (narrowed.length === 1) candidates = narrowed;
      const root = candidates.filter((t) => !t.includes("/"));
      if (candidates.length > 1 && root.length === 1 && ROOT_PREFERRED.has(path)) candidates = root;
    }
    if (candidates.length === 0) return "AUSENTE";
    if (candidates.length > 1) {
      if (!lines) return `AMBIGUO(${candidates.length})`;
      const ok = candidates.filter((t) => lineCount(t) >= maxLine(lines));
      return ok.length === 0 ? `LINHA_FORA_DA_FAIXA_EM_TODOS(${candidates.length})` : `AMBIGUO(${ok.length}_de_${candidates.length})`;
    }
    resolved = candidates[0]!;
  }
  if (lines) {
    const total = lineCount(resolved);
    const wanted = maxLine(lines);
    return wanted <= total ? "arquivo_e_linha_ok" : `LINHA_FORA_DA_FAIXA(${wanted}>${total})`;
  }
  return "arquivo_ok";
}

const counts = new Map<string, number>();
const problems: string[] = [];
let total = 0;
for (const name of DOCS) {
  const text = await Bun.file(resolve(DIR, name)).text();
  for (const line of text.split("\n")) {
    for (const span of line.matchAll(/`([^`\n]+)`/g)) {
      for (const raw of span[1]!.split(/[ ,;]+(?=[A-Za-z0-9_@./-])/)) {
        const piece = raw.trim().replace(/[.)]+$/, "");
        const match = TOKEN.exec(piece);
        if (!match?.groups) continue;
        const p = match.groups.p!;
        if (!(new RegExp(`\\.${EXT}$`).test(p) || p.endsWith("/") || p === "/")) continue;
        if (p.startsWith("http") || p.startsWith("~") || p.includes("<") || p.includes("*")) continue;
        const result = classify(p, match.groups.l, line);
        total += 1;
        counts.set(result, (counts.get(result) ?? 0) + 1);
        if (/^(AUSENTE|LINHA|AMBIGUO)/.test(result)) problems.push(`${name}: ${piece} -> ${result}`);
      }
    }
  }
}

console.log(`commit conferido: ${REF} (${git(["rev-parse", "--short", REF]).trim()})`);
console.log(`referencias conferidas: ${total}`);
for (const [key, value] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${key}: ${value}`);
console.log(`problemas (ausente, linha fora da faixa ou ambiguo sem contexto): ${problems.length}`);
for (const problem of problems) console.log(`  ${problem}`);
process.exit(problems.length === 0 ? 0 : 1);
