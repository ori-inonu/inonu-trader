// Código ocioso por alcançabilidade estática: módulos de src/ que nenhum ponto de entrada alcança, direta ou indiretamente.
// Entradas: o launcher do app, o processo do núcleo, o CLI do agente, o servidor, src/index.ts e todo script operacional.
// Segue importações estáticas, import() e require() com texto literal e caminhos .ts em texto (processos lançados por spawn).
// Limite: nome de módulo montado em tempo de execução não é seguido. O resultado é uma LISTA DE CANDIDATOS, nunca uma ordem de remoção.
// Run: bun --no-env-file scripts/idle-code.ts [--json]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
// core-entry.ts é o processo do núcleo, lançado por caminho em texto pelo launcher (plan.ts), não por importação.
const ENTRIES = ["src/local-host/main.ts", "src/local-host/core-entry.ts", "src/agent/cli.ts", "src/server.ts", "src/index.ts"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const isTest = (file: string) => /\.test\.ts$/.test(file);
const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");

/** Caminhos .ts em texto ("src/agent/cli.ts", "./runner.ts"). */
export function pathLiterals(text: string): string[] {
  return [...text.matchAll(/["'`]((?:\.{1,2}\/)?[\w./-]+\.ts)["'`]/g)].map((m) => m[1]!);
}

/** Referências a outros módulos: importações relativas e caminhos .ts em texto. */
export function importsOf(text: string): string[] {
  const specs = new Set<string>();
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) specs.add(m[1]!);
  for (const m of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]!);
  for (const literal of pathLiterals(text)) specs.add(literal);
  return [...specs].filter((s) => s.startsWith(".") || /^(src|scripts)\//.test(s));
}

/** Resolve uma referência a partir do arquivo e, para caminhos em texto, a partir da raiz do repositório. */
export function resolveRef(from: string, spec: string, exists: (path: string) => boolean = existsSync): string | null {
  const bare = (path: string) => path.replace(/\.(ts|js)$/, "");
  const bases = [resolve(dirname(from), spec), resolve(ROOT, spec)];
  for (const base of bases) {
    for (const candidate of [base, `${bare(base)}.ts`, join(bare(base), "index.ts")]) {
      if (candidate.endsWith(".ts") && exists(candidate)) return candidate;
    }
  }
  return null;
}

export function reachable(entries: readonly string[], read: (file: string) => string, exists: (path: string) => boolean = existsSync): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !exists(file)) continue;
    seen.add(file);
    for (const spec of importsOf(read(file))) {
      const target = resolveRef(file, spec, exists);
      if (target !== null) queue.push(target);
    }
  }
  return seen;
}

export function findIdle(): { file: string; lines: number }[] {
  const srcFiles = walk(join(ROOT, "src")).filter((f) => f.endsWith(".ts") && !isTest(f));
  const scripts = walk(join(ROOT, "scripts")).filter((f) => f.endsWith(".ts") && !isTest(f) && dirname(f) === join(ROOT, "scripts"));
  const entries = [...ENTRIES.map((e) => join(ROOT, e)), ...scripts];
  const live = reachable(entries, (f) => readFileSync(f, "utf8"));
  return srcFiles
    .filter((f) => !live.has(f))
    .map((f) => ({ file: rel(f), lines: readFileSync(f, "utf8").split("\n").length }))
    .sort((a, b) => b.lines - a.lines);
}

if (import.meta.main) {
  const idle = findIdle();
  if (process.argv.includes("--json")) console.log(JSON.stringify(idle, null, 2));
  else {
    const byDir = new Map<string, { files: number; lines: number }>();
    for (const { file, lines } of idle) {
      const dir = file.split("/").slice(0, 2).join("/");
      const cur = byDir.get(dir) ?? { files: 0, lines: 0 };
      byDir.set(dir, { files: cur.files + 1, lines: cur.lines + lines });
    }
    console.log(`${idle.length} módulos de src/ sem alcance estático a partir das entradas (${idle.reduce((s, f) => s + f.lines, 0)} linhas). Candidatos, não ordem de remoção:`);
    for (const [dir, v] of [...byDir].sort((a, b) => b[1].lines - a[1].lines)) console.log(`  ${dir}: ${v.files} arquivos, ${v.lines} linhas`);
  }
}
