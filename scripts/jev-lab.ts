/**
 * Jev Decision Lab CLI. Specification: docs/JEV-LABORATORIO-DE-DECISAO.md section 10.
 *
 * SHADOW ONLY: it records hypothetical decisions and measures what they would have returned. It never executes,
 * signs, sends, approves or reads a key. It never reads process.env, never uses the network and writes only into the
 * folder given by --out (through the journal module). Its Jev is ALWAYS the deterministic mock and every output says so.
 *
 * Output: the JSON report on stdout (deterministic byte for byte), a short Portuguese summary on stderr.
 * Exit codes: 0 complete run or report; 2 usage or input error; 3 journal integrity stop (nothing is overwritten).
 * Everything printed is arithmetic on the data given; nothing here proves profit and nothing grants permission.
 */

import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaptureFormatError } from "../src/lab/capture-format.ts";
import { FileJournal, JournalError, digestBytes, type JsonObject } from "../src/lab/journal.ts";
import { defaultRoster, describePolicy } from "../src/lab/policies.ts";
import { buildReplaySpec, buildReport, buildSyntheticSpec, manifestOf, renderSummaryPt, runEpochs, type RunSpec } from "../src/lab/run.ts";
import { LeakError, ReplaySource, SyntheticSource, syntheticConfig, type DataSource } from "../src/lab/source.ts";
import { DAY_MS, HOUR_MS } from "../src/lab/types.ts";

const USAGE = [
  "Jev Decision Lab: laboratório de decisão do Jev (somente sombra: nada é executado, assinado ou enviado)",
  "",
  "uso:",
  "  bun --no-env-file run scripts/jev-lab.ts run --synthetic --epochs <N> --seed <S> [--planted-edge <bps>] --out <pasta>",
  "  bun --no-env-file run scripts/jev-lab.ts run --capture <arquivo.jsonl> --out <pasta> [--seed <S>] [--step-ms <ms>] [--horizon-ms <ms>] [--bar-ms <ms>] [--frozen-at-ms <ms>]",
  "  bun --no-env-file run scripts/jev-lab.ts report --journal <pasta ou arquivo journal.jsonl>",
  "  bun --no-env-file run scripts/jev-lab.ts --help",
  "",
  "run: roda a grade de épocas, grava o diário em <pasta>/journal.jsonl (só anexa; repetir o comando retoma sem duplicar)",
  "     e imprime o relatório. --planted-edge planta, na fonte sintética, uma vantagem de <bps> por decisão.",
  "     --capture lê uma captura no formato JSONL do laboratório (docs/JEV-LABORATORIO-DE-DECISAO.md, seção 3.4).",
  "report: reconstrói o relatório só a partir de um diário existente.",
  "",
  "O Jev desta CLI é sempre o MockJevChooser (regra determinística e offline), nunca o Jev real.",
  "Saída: relatório em JSON no stdout, resumo curto em português no stderr.",
  "Códigos de saída: 0 execução ou relatório completo; 2 uso incorreto ou entrada inválida; 3 parada de integridade do diário.",
  "Nunca lê variáveis de ambiente, nunca usa a rede, nunca assina e só escreve dentro de --out.",
  "Nada aqui prova lucro e nada aqui concede permissão.",
].join("\n");

/** A usage or input error: exit 2, nothing on stdout. */
class UsageError extends Error {}

const VALUE_FLAGS = ["--epochs", "--seed", "--planted-edge", "--out", "--capture", "--journal", "--step-ms", "--horizon-ms", "--bar-ms", "--frozen-at-ms"] as const;
const BOOLEAN_FLAGS = ["--synthetic"] as const;
const RUN_FLAGS: readonly string[] = ["--synthetic", "--capture", "--epochs", "--seed", "--planted-edge", "--out", "--step-ms", "--horizon-ms", "--bar-ms", "--frozen-at-ms"];
const REPORT_FLAGS: readonly string[] = ["--journal"];
const MAX_CAPTURE_BYTES = 268_435_456;

interface Parsed {
  command: "run" | "report";
  values: Map<string, string>;
  switches: Set<string>;
}

function parse(argv: readonly string[]): Parsed {
  const command = argv[0];
  if (command !== "run" && command !== "report") throw new UsageError("informe o subcomando: run ou report");
  const allowed = command === "run" ? RUN_FLAGS : REPORT_FLAGS;
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (!(VALUE_FLAGS as readonly string[]).includes(token) && !(BOOLEAN_FLAGS as readonly string[]).includes(token)) {
      throw new UsageError(token.startsWith("--") ? `flag desconhecida: ${token}` : "argumento inesperado");
    }
    if (!allowed.includes(token)) throw new UsageError(`a flag ${token} não vale para ${command}`);
    if ((BOOLEAN_FLAGS as readonly string[]).includes(token)) {
      if (switches.has(token)) throw new UsageError(`flag repetida: ${token}`);
      switches.add(token);
      continue;
    }
    if (values.has(token)) throw new UsageError(`flag repetida: ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--") || value === "") throw new UsageError(`falta o valor de ${token}`);
    values.set(token, value);
    index += 1;
  }
  return { command, values, switches };
}

function integer(parsed: Parsed, flag: string, minimum: number, maximum: number): number | null {
  const raw = parsed.values.get(flag);
  if (raw === undefined) return null;
  if (!/^\d{1,16}$/.test(raw)) throw new UsageError(`valor mal formado em ${flag}: use um inteiro sem sinal, sem vírgula e sem notação científica`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new UsageError(`${flag} deve estar entre ${minimum} e ${maximum}`);
  return value;
}

function decimal(parsed: Parsed, flag: string, minimum: number, maximum: number): number | null {
  const raw = parsed.values.get(flag);
  if (raw === undefined) return null;
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(raw)) throw new UsageError(`valor mal formado em ${flag}: use ponto decimal e sem notação científica`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new UsageError(`${flag} deve estar entre ${minimum} e ${maximum}`);
  return value;
}

function required<T>(value: T | null, flag: string): T {
  if (value === null) throw new UsageError(`falta a flag ${flag}`);
  return value;
}

function readCapture(path: string): Uint8Array {
  let stats;
  try {
    stats = lstatSync(path, { throwIfNoEntry: false });
  } catch {
    throw new UsageError("arquivo de captura ausente ou ilegível");
  }
  if (!stats) throw new UsageError("arquivo de captura ausente ou ilegível");
  if (stats.isSymbolicLink()) throw new UsageError("link simbólico não é seguido");
  if (!stats.isFile()) throw new UsageError("--capture precisa ser um arquivo regular");
  if (stats.size > MAX_CAPTURE_BYTES) throw new UsageError("captura grande demais (limite de 256 MiB)");
  try {
    return readFileSync(path);
  } catch {
    throw new UsageError("arquivo de captura ausente ou ilegível");
  }
}

interface Prepared {
  source: DataSource;
  spec: RunSpec;
  roster: ReturnType<typeof defaultRoster>;
}

function prepareRun(parsed: Parsed): Prepared {
  const synthetic = parsed.switches.has("--synthetic");
  const capture = parsed.values.get("--capture");
  if (synthetic === (capture !== undefined)) throw new UsageError("informe exatamente um de --synthetic ou --capture");
  if (!parsed.values.has("--out")) throw new UsageError("falta a flag --out");
  const stepMs = integer(parsed, "--step-ms", 1_000, 31 * DAY_MS);
  const horizonMs = integer(parsed, "--horizon-ms", 1_000, 31 * DAY_MS);
  const barMs = integer(parsed, "--bar-ms", 1_000, DAY_MS);
  const frozenAtMs = integer(parsed, "--frozen-at-ms", 0, 4_102_444_800_000);

  if (synthetic) {
    for (const flag of ["--capture"]) if (parsed.values.has(flag)) throw new UsageError(`${flag} não vale com --synthetic`);
    const epochs = required(integer(parsed, "--epochs", 1, 50_000), "--epochs");
    const seed = required(integer(parsed, "--seed", 0, 4_294_967_295), "--seed");
    const plantedEdgeBps = decimal(parsed, "--planted-edge", 0, 10_000) ?? 0;
    let config;
    try {
      config = syntheticConfig({
        seed,
        epochs,
        plantedEdgeBps,
        ...(stepMs === null ? {} : { stepMs }),
        ...(horizonMs === null ? {} : { horizonMs }),
        ...(barMs === null ? {} : { barMs }),
      });
    } catch (error) {
      if (error instanceof RangeError) throw new UsageError(`configuração sintética inválida: ${error.message}`);
      throw error;
    }
    const roster = defaultRoster({ seed });
    return { source: new SyntheticSource(config), spec: buildSyntheticSpec(config, roster.map((policy) => describePolicy(policy)), { frozenAtMs }), roster };
  }

  for (const flag of ["--epochs", "--planted-edge"]) if (parsed.values.has(flag)) throw new UsageError(`${flag} só vale com --synthetic`);
  const seed = integer(parsed, "--seed", 0, 4_294_967_295) ?? 0;
  const bytes = readCapture(capture as string);
  const digest = digestBytes(bytes);
  let source: ReplaySource;
  try {
    source = ReplaySource.fromBytes(bytes, `replay:${digest.slice(0, 16)}`);
  } catch (error) {
    if (error instanceof CaptureFormatError) throw new UsageError(`captura inválida: ${error.message}`);
    if (error instanceof RangeError) throw new UsageError("captura sem registros");
    throw error;
  }
  const roster = defaultRoster({ seed });
  let spec: RunSpec;
  try {
    spec = buildReplaySpec(source, digest, roster.map((policy) => describePolicy(policy)), {
      stepMs: stepMs ?? 6 * HOUR_MS,
      horizonMs: horizonMs ?? 24 * HOUR_MS,
      barMs: barMs ?? 15 * 60_000,
      seed,
      frozenAtMs,
    });
  } catch (error) {
    if (error instanceof RangeError) throw new UsageError(error.message);
    throw error;
  }
  return { source, spec, roster };
}

function emit(report: ReturnType<typeof buildReport>, extra: string[] = []): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const lines = renderSummaryPt(report);
  const disclaimer = lines.pop() as string;
  process.stderr.write(`${[...lines, ...extra, disclaimer].join("\n")}\n`);
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    if (argv.includes("--help")) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    const parsed = parse(argv);

    if (parsed.command === "report") {
      const raw = parsed.values.get("--journal");
      if (raw === undefined) throw new UsageError("falta a flag --journal");
      let path = raw;
      try {
        if (lstatSync(path).isDirectory()) path = join(path, "journal.jsonl");
      } catch {
        throw new UsageError("diário ausente ou ilegível");
      }
      let data;
      try {
        data = FileJournal.read(path);
      } catch (error) {
        if (error instanceof JournalError && error.kind === "missing") throw new UsageError("diário ausente");
        throw error;
      }
      emit(buildReport(data), [`Diário lido: ${path}.`]);
      return 0;
    }

    const prepared = prepareRun(parsed);
    const out = parsed.values.get("--out") as string;
    const journal = FileJournal.open(out, manifestOf(prepared.spec) as JsonObject);
    const summary = await runEpochs({ source: prepared.source, policies: prepared.roster, spec: prepared.spec, journal, snapshot: () => journal.snapshot() });
    journal.snapshot();
    emit(buildReport(journal.data()), [`Diário: ${join(out, "journal.jsonl")} (épocas novas ${summary.processed}, já completas ${summary.skipped}, pendentes ${summary.pending}).`]);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`erro de uso: ${error.message}\n`);
      return 2;
    }
    if (error instanceof JournalError) {
      process.stderr.write(`PARADA de integridade do diário (${error.kind}): ${error.message}\n`);
      return 3;
    }
    if (error instanceof LeakError) {
      process.stderr.write(`PARADA: ${error.message}. Nada da época foi gravado.\n`);
      return 3;
    }
    throw error;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
