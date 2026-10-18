// Ciclo de melhoria probabilística do agente JEV: auditoria de dados, conjunto rotulado, experimentos de calibração
// e previsão, medida de hesitação e política de saída antecipada, tudo OFFLINE sobre um snapshot explicitamente fornecido.
// Run: bun --no-env-file scripts/prob-cycle.ts --dir <pasta de snapshot> [--out data/bench/prob-cycle.json] [--seed N] [--resamples N] [--now <ms>]
// SOMENTE LEITURA nos journals: nenhum arquivo da pasta de dados é aberto para escrita, não há rede, ordem, credencial
// nem chamada ao Jev. O relatório não contém endereços de token, assinaturas, ids de ciclo nem segredos; antes de gravar
// o script confere isso contra os próprios dados de entrada e recusa gravar se algum id escapar.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseJsonl, type Row } from "../src/prob/dataset.ts";
import { ACTIVE_JOURNALS as PARSED, PRESENCE_ONLY_JOURNALS as PRESENCE_ONLY, buildReport, leaksIn, type Journals, type ProbReport } from "../src/prob/report.ts";

export interface CliOptions {
  /** Pasta data/agent com os journals (somente leitura). */
  readonly dir: string;
  readonly out: string;
  readonly seed: number;
  readonly resamples: number;
  /** Relógio de fora: só vira o carimbo do relatório. */
  readonly nowMs: number;
}

export const DEFAULT_SEED = 20_261_017;
export const DEFAULT_RESAMPLES = 2000;


/** Lê os journals em modo somente leitura. Arquivo ausente vira null em `files` e lista vazia. */
export function readJournals(dir: string): Journals {
  if (!existsSync(dir)) throw new Error("pasta dos journals não encontrada: passe --dir");
  const files: Record<string, { lines: number | null; malformed: number | null } | null> = {};
  const data: Record<string, Row[]> = {};
  for (const name of PARSED) {
    const path = join(dir, `${name}.jsonl`);
    if (!existsSync(path)) {
      files[`${name}.jsonl`] = null;
      data[name] = [];
      continue;
    }
    const { rows, malformed } = parseJsonl(readFileSync(path, "utf8"));
    files[`${name}.jsonl`] = { lines: rows.length + malformed, malformed };
    data[name] = rows;
  }
  for (const name of PRESENCE_ONLY) {
    const path = join(dir, `${name}.jsonl`);
    files[`${name}.jsonl`] = existsSync(path) ? { lines: null, malformed: null } : null;
  }
  return {
    briefs: data.briefs ?? [],
    scoreboard: data.scoreboard ?? [],
    closings: data.closings ?? [],
    decisionsMeta: data["decisions-meta"] ?? [],
    equity: data.equity ?? [],
    files,
  };
}

/** O caminho de saída não pode ficar dentro da pasta dos journals: este script nunca escreve nos dados do agente. */
function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try { return realpathSync(absolute); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    if (lstatSync(absolute, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("link sem destino valido");
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    return join(canonicalPath(parent), basename(absolute));
  }
}

function isOutside(dir: string, out: string): boolean {
  const rel = relative(dir, out);
  return rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel);
}

// Resolve ancestrais existentes, inclusive junctions. Requer diretorios estaveis durante a execucao.
export function outsideDataDir(dir: string, out: string): boolean {
  return isOutside(resolve(dir), resolve(out)) && isOutside(canonicalPath(dir), canonicalPath(out));
}

export function runProbCycle(options: CliOptions): { report: ProbReport; path: string } {
  if (!outsideDataDir(options.dir, options.out)) throw new Error("recusado: a saída ficaria dentro da pasta dos journals (somente leitura)");
  const journals = readJournals(options.dir);
  const report = buildReport(journals, { seed: options.seed, resamples: options.resamples, nowMs: options.nowMs });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const leaks = leaksIn(text, journals);
  if (leaks.length > 0) throw new Error(`recusado: o relatório conteria identificadores dos dados (${leaks.join(", ")})`);
  const path = resolve(options.out);
  mkdirSync(dirname(path), { recursive: true });
  if (!outsideDataDir(options.dir, path)) throw new Error("recusado: saida nos journals (somente leitura)");
  writeFileSync(path, text, { flag: "wx" });
  return { report, path };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

export function summaryLine(report: ProbReport, path: string): string {
  const conj = report.conjunto as { linhasDeCandidato: number; tokens: number; cobertura: Record<string, { labeled: number; rows: number }> };
  const veredictos = report.experimentos.map((e) => `${e.id.split("-")[0]}:${e.veredito}`).join(" ");
  const c1h = conj.cobertura["1h"];
  return `prob-cycle: ${conj.linhasDeCandidato} candidatos, ${conj.tokens} tokens, rotulados 1h=${c1h?.labeled ?? 0}; ${veredictos} -> ${path}`;
}

if (import.meta.main) {
  const dir = arg("--dir");
  if (dir === undefined) throw new Error("passe --dir com a pasta data/agent");
  const out = resolve(import.meta.dir, "..", arg("--out") ?? "data/bench/prob-cycle.json");
  const seed = Number(arg("--seed") ?? DEFAULT_SEED);
  const resamples = Number(arg("--resamples") ?? DEFAULT_RESAMPLES);
  const nowMs = Number(arg("--now") ?? Date.now());
  if (!Number.isFinite(seed) || !Number.isInteger(resamples) || resamples < 1 || !Number.isFinite(nowMs)) throw new Error("argumentos inválidos");
  const { report, path } = runProbCycle({ dir, out, seed, resamples, nowMs });
  console.log(summaryLine(report, path));
}
