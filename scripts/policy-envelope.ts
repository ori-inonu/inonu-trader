/**
 * Read-only CLI for the risk envelope: derives the limits of a phase, or checks a settings file against one.
 *
 * Isolation (spec section 8): it never reads process.env, never uses the network and never writes to disk.
 * The only file it ever opens is the one named by --check, and it prints only known field names and numbers,
 * never text values from that file. Exit code 0 carries any complete report, conforming or not; the report,
 * not the code, carries the result. Exit code 2 is a usage or input error. There is no exit code 1.
 *
 * Everything it prints is risk engineering calculation, not authorization, not a recommendation and not a
 * forecast of return.
 */

import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { checkSettings, deriveLimits, PHASE_IDS, type PhaseId } from "../src/policy/envelope.ts";

const SCHEMA = "policy-envelope-v1";
const MAX_CHECK_BYTES = 1024 * 1024;
const USAGE = [
  "envelope de risco por fase (somente calculo e leitura)",
  "",
  "uso:",
  "  bun --no-env-file run scripts/policy-envelope.ts --capital <usd> --sigma <fracacao diaria> [--kelly-lower-bound <x>]",
  "  bun --no-env-file run scripts/policy-envelope.ts --check <arquivo.json> [--phase fase-0|fase-1|fase-2]",
  "  bun --no-env-file run scripts/policy-envelope.ts --help",
  "",
  "o resultado nao e autorizacao nem recomendacao de investimento.",
].join("\n");

/** A usage or input error. Nothing is ever printed to stdout when this is raised. */
class UsageError extends Error {}

function requireFlag(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index === -1) throw new UsageError(`falta a flag ${flag}`);
  if (args.indexOf(flag, index + 1) !== -1) throw new UsageError(`flag repetida: ${flag}`);
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new UsageError(`falta o valor de ${flag}`);
  return value;
}

const FLAG_NAMES = ["--capital", "--sigma", "--kelly-lower-bound", "--check", "--phase", "--help"];

/** Parses the documented number format: plain decimal with a dot, never an exponent and never a comma. */
function plainNumber(raw: string, flag: string): number {
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new UsageError(`valor mal formado em ${flag}: use ponto decimal e sem notacao cientifica`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new UsageError(`valor nao finito em ${flag}`);
  return value;
}

/** Reads only the file of --check: regular file, at most 1 MiB, no symlink followed, BOM tolerated. */
function readCheckFile(path: string): { name: string; parsed: unknown } {
  let stats;
  try {
    stats = statSync(path, { throwIfNoEntry: false });
  } catch {
    throw new UsageError("arquivo ausente ou ilegivel");
  }
  if (!stats) throw new UsageError("arquivo ausente ou ilegivel");
  if (stats.isSymbolicLink()) throw new UsageError("link simbolico nao e seguido");
  if (!stats.isFile()) throw new UsageError("o alvo de --check precisa ser um arquivo regular");
  if (stats.size > MAX_CHECK_BYTES) throw new UsageError("arquivo grande demais (limite de 1 MiB)");

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new UsageError("arquivo ausente ou ilegivel");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError("JSON malformado");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new UsageError("o JSON precisa ser um objeto");
  return { name: basename(path), parsed };
}

/** Renders a report as JSON with a deterministic key order, so two runs are byte for byte equal. */
function render(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function deriveReport(capitalUsd: number, sigmaDaily: number, kellyLowerBound?: number): { json: string; summary: string } {
  const limits = Object.fromEntries(
    PHASE_IDS.map((phase) => {
      try {
        return [phase, deriveLimits({ capitalUsd, sigmaDaily, phase, kellyLowerBound })];
      } catch (error) {
        return [phase, { error: (error as Error).message }];
      }
    }),
  );
  const json = render({
    schema: SCHEMA,
    kind: "derived-limits",
    input: { capitalUsd, sigmaDaily, kellyLowerBound: kellyLowerBound ?? null },
    limits,
    grantsPermission: false,
    io: { network: false, environment: false, filesRead: [] as string[] },
    note: "calculo de engenharia de risco; nao e autorizacao nem recomendacao de investimento",
  });
  return {
    json,
    summary: "limites derivados das 3 fases; isto e calculo de risco, nao autorizacao nem recomendacao.\n",
  };
}

function checkReport(file: { name: string; parsed: unknown }, phase: PhaseId | undefined): { json: string; summary: string } {
  const result = checkSettings(file.parsed, phase);
  const json = render({
    schema: SCHEMA,
    kind: "settings-check",
    phase: result.phase,
    phaseSource: phase === undefined ? "default" : "explicit",
    ok: result.ok,
    violations: result.violations,
    unknown: result.unknown,
    grantsPermission: false,
    io: { network: false, environment: false, filesRead: [file.name] },
    note: "relatorio de conformidade com o envelope; nao e autorizacao nem recomendacao de investimento",
  });
  const summary = [
    `fase ${result.phase} (${phase === undefined ? "padrao" : "explicita"}): ${result.ok ? "dentro do envelope" : "fora do envelope"}.`,
    `${result.violations.length} violacao(oes) e ${result.unknown.length} campo(s) desconhecido(s).`,
    "relatorio de conformidade; nao e autorizacao nem recomendacao de investimento.",
  ].join("\n") + "\n";
  return { json, summary };
}

export function main(argv: string[]): number {
  try {
    if (argv.includes("--help")) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    const unknown = argv.filter((argument, index) =>
      argument.startsWith("--") && !FLAG_NAMES.includes(argument) && !(index > 0 && FLAG_NAMES.includes(argv[index - 1]!)));
    if (unknown.length) throw new UsageError(`flag desconhecida: ${unknown[0]}`);

    const deriving = argv.includes("--capital") || argv.includes("--sigma");
    const checking = argv.includes("--check");
    if (deriving && checking) throw new UsageError("combinacao invalida: --capital/--sigma e --check nao juntos");
    if (!deriving && !checking) throw new UsageError("informe --capital e --sigma, ou --check");

    if (checking) {
      let phase: PhaseId | undefined;
      if (argv.includes("--phase")) {
        const raw = requireFlag(argv, "--phase");
        if (!PHASE_IDS.includes(raw as PhaseId)) throw new UsageError(`fase invalida: ${raw}`);
        phase = raw as PhaseId;
      }
      const { json, summary } = checkReport(readCheckFile(requireFlag(argv, "--check")), phase);
      process.stdout.write(json);
      process.stderr.write(summary);
      return 0;
    }

    const capitalUsd = plainNumber(requireFlag(argv, "--capital"), "--capital");
    const sigmaDaily = plainNumber(requireFlag(argv, "--sigma"), "--sigma");
    const kelly = argv.includes("--kelly-lower-bound") ? plainNumber(requireFlag(argv, "--kelly-lower-bound"), "--kelly-lower-bound") : undefined;
    const { json, summary } = deriveReport(capitalUsd, sigmaDaily, kelly);
    process.stdout.write(json);
    process.stderr.write(summary);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`erro de uso: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));