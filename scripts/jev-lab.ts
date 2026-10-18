/**
 * Jev Decision Lab CLI. Specification: docs/JEV-LABORATORIO-DE-DECISAO.md section 10.
 *
 * SHADOW ONLY: it records hypothetical decisions and measures what they would have returned. It never executes,
 * signs, sends, approves or reads a key. It never reads process.env, never uses the network and writes only into the
 * folder given by --out (through the journal module). Its Jev is the deterministic mock unless the caller injects a
 * chooser through `deps` (scripts/jev-lab-real.ts does, for the real Jev); every output says which one it was.
 *
 * Output: the JSON report on stdout (deterministic byte for byte), a short Portuguese summary on stderr.
 * Exit codes: 0 complete run or report; 2 usage or input error; 3 journal integrity stop (nothing is overwritten).
 * Everything printed is arithmetic on the data given; nothing here proves profit and nothing grants permission.
 */

import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaptureFormatError } from "../src/lab/capture-format.ts";
import { FileJournal, JournalError, digestBytes, type JsonObject } from "../src/lab/journal.ts";
import { defaultRoster, describePolicy, type LabChooser } from "../src/lab/policies.ts";
import { buildReplaySpec, buildReport, buildSyntheticSpec, manifestOf, renderSummaryPt, runEpochs, type RunSpec, type RunSummary } from "../src/lab/run.ts";
import { LeakError, ReplaySource, SyntheticSource, syntheticConfig, type DataSource } from "../src/lab/source.ts";
import { DAY_MS, HOUR_MS, type LabReport } from "../src/lab/types.ts";

/** What the caller can plug into the CLI. Every field is optional; without them the CLI is exactly the mock CLI. */
export interface LabCliDeps {
  /** The Jev behind the roster. Absent: the deterministic MockJevChooser, announced loudly. */
  chooser?: LabChooser;
  /** USD per million input tokens. Absent or null: the inference cost stays unknown (null), never zero. */
  inferenceUsdPerMTok?: number | null;
  /** Timeout of one consultation in ms; it is part of the manifest, so a different value is a different run. */
  timeoutMs?: number;
  /** Asked after each epoch is stored; true ends the run cleanly (the rest stays pending and can be resumed). */
  shouldStop?: () => boolean;
  /** Extra lines for the short summary, placed before the standing disclaimer, which stays last. */
  summaryLines?: (report: LabReport) => string[];
}

function usage(deps?: LabCliDeps): string {
  const injected = deps?.chooser !== undefined && !deps.chooser.isMock;
  return [
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
    injected
      ? "O Jev desta execução é o seletor injetado pelo chamador (consulta real, com o custo e a rede do próprio seletor); sem ele seria o MockJevChooser."
      : "O Jev desta CLI é sempre o MockJevChooser (regra determinística e offline), nunca o Jev real.",
    "Saída: relatório em JSON no stdout, resumo curto em português no stderr.",
    "Códigos de saída: 0 execução ou relatório completo; 2 uso incorreto ou entrada inválida; 3 parada de integridade do diário.",
    injected
      ? "Esta CLI nunca lê variáveis de ambiente, nunca assina e só escreve dentro de --out."
      : "Nunca lê variáveis de ambiente, nunca usa a rede, nunca assina e só escreve dentro de --out.",
    "Nada aqui prova lucro e nada aqui concede permissão.",
  ].join("\n");
}

/** A usage or input error: exit 2, nothing on stdout. */
export class UsageError extends Error {}

const VALUE_FLAGS = ["--epochs", "--seed", "--planted-edge", "--out", "--capture", "--journal", "--step-ms", "--horizon-ms", "--bar-ms", "--frozen-at-ms"] as const;
const BOOLEAN_FLAGS = ["--synthetic"] as const;
const RUN_FLAGS: readonly string[] = ["--synthetic", "--capture", "--epochs", "--seed", "--planted-edge", "--out", "--step-ms", "--horizon-ms", "--bar-ms", "--frozen-at-ms"];
const REPORT_FLAGS: readonly string[] = ["--journal"];
const MAX_CAPTURE_BYTES = 268_435_456;

export interface Parsed {
  command: "run" | "report";
  values: Map<string, string>;
  switches: Set<string>;
}

export function parse(argv: readonly string[]): Parsed {
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

export interface Prepared {
  source: DataSource;
  spec: RunSpec;
  roster: ReturnType<typeof defaultRoster>;
}

/** The source, the manifest and the roster of a run. `requireOut: false` is for callers that only plan and write nothing. */
export function prepareRun(parsed: Parsed, deps?: LabCliDeps, options: { requireOut?: boolean } = {}): Prepared {
  const synthetic = parsed.switches.has("--synthetic");
  const capture = parsed.values.get("--capture");
  if (synthetic === (capture !== undefined)) throw new UsageError("informe exatamente um de --synthetic ou --capture");
  if ((options.requireOut ?? true) && !parsed.values.has("--out")) throw new UsageError("falta a flag --out");
  const stepMs = integer(parsed, "--step-ms", 1_000, 31 * DAY_MS);
  const horizonMs = integer(parsed, "--horizon-ms", 1_000, 31 * DAY_MS);
  const barMs = integer(parsed, "--bar-ms", 1_000, DAY_MS);
  const frozenAtMs = integer(parsed, "--frozen-at-ms", 0, 4_102_444_800_000);
  const rosterOptions = (seed: number) => ({
    seed,
    ...(deps?.chooser === undefined ? {} : { chooser: deps.chooser }),
    ...(deps?.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    ...(deps?.inferenceUsdPerMTok === undefined ? {} : { inferenceUsdPerMTok: deps.inferenceUsdPerMTok }),
  });
  const specOptions = {
    frozenAtMs,
    ...(deps?.inferenceUsdPerMTok === undefined ? {} : { inferenceUsdPerMTok: deps.inferenceUsdPerMTok }),
    ...(deps?.timeoutMs === undefined ? {} : { jevTimeoutMs: deps.timeoutMs }),
  };

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
    const roster = defaultRoster(rosterOptions(seed));
    return { source: new SyntheticSource(config), spec: buildSyntheticSpec(config, roster.map((policy) => describePolicy(policy)), specOptions), roster };
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
  const roster = defaultRoster(rosterOptions(seed));
  let spec: RunSpec;
  try {
    spec = buildReplaySpec(source, digest, roster.map((policy) => describePolicy(policy)), {
      stepMs: stepMs ?? 6 * HOUR_MS,
      horizonMs: horizonMs ?? 24 * HOUR_MS,
      barMs: barMs ?? 15 * 60_000,
      seed,
      ...specOptions,
    });
  } catch (error) {
    if (error instanceof RangeError) throw new UsageError(error.message);
    throw error;
  }
  return { source, spec, roster };
}

function commaNumber(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

function leverageText(value: number): string {
  return Number.isInteger(value) ? String(value) : commaNumber(value, 2);
}

/**
 * The leverage that the measured advantage of the Jev justifies, as a DIAGNOSTIC: zero unless the Kelly lower bound of
 * the Jev is positive, and zero whenever the measure comes from the mock or from synthetic data. It grants nothing:
 * the phase stays fase-0 and lifting real execution needs the four conditions of decision D11.
 */
export function leverageAllowanceLines(report: LabReport): string[] {
  const subject = report.policies.find((policy) => policy.tested && !policy.baseline) ?? null;
  const bound = subject?.portfolio.kellyLowerBound ?? null;
  const cap = subject?.portfolio.leverageCapPhase2 ?? null;
  const formula = bound !== null && bound > 0 && cap !== null ? cap : 0;
  const simulatedBy: string[] = [];
  if (report.jev.isMock) simulatedBy.push("o Mock");
  if (report.mode === "synthetic") simulatedBy.push("dados sintéticos");
  const simulated = simulatedBy.length > 0;
  const plural = simulatedBy.length > 1 || report.mode === "synthetic";
  let why: string;
  if (bound === null || cap === null) why = "faltam dados para o limite inferior do Kelly";
  else if (!(bound > 0)) why = "o limite inferior do Kelly não é positivo";
  else if (simulated) why = `a medida usa ${simulatedBy.join(" e ")}, que só ${plural ? "testam" : "testa"} a máquina e não ${plural ? "justificam" : "justifica"} alavancagem; a fórmula bruta daria ${leverageText(formula)}x`;
  else why = `teto da fase 2 pela fórmula do envelope, a partir do limite inferior do Kelly de ${commaNumber(bound, 2)}`;
  const justified = simulated ? 0 : formula;
  const failed = report.gate.failed.map((criterion) => criterion.id).join(", ") || "nenhum";
  const unknown = report.gate.unknown.map((criterion) => criterion.id).join(", ") || "nenhum";
  return [
    `Alavancagem que a vantagem medida do Jev justifica: ${leverageText(justified)}x (${why}).`,
    `Critérios que faltam: reprovados ${failed}; desconhecidos ${unknown}.`,
    "Isto é diagnóstico e não concede nada: a alavancagem permitida hoje continua 0x (fase-0), e levantar a execução real exige as quatro condições da decisão D11 (autorização do dono, checklist qualify:live completo, revisão independente do código final e commit separado).",
  ];
}

/** The cost of a Jev that was really consulted, from the journal: known only when every consultation reported valid usage. */
export function inferenceLines(report: LabReport): string[] {
  const subject = report.policies.find((policy) => policy.tested && !policy.baseline) ?? null;
  if (subject === null || subject.chooser === null || subject.chooser.isMock || subject.inference.consulted === 0) return [];
  const { inference, statuses } = subject;
  const cost = inference.costUsdTotal === null ? "desconhecido (há consultas sem uso de tokens válido, e desconhecido nunca vira zero)" : `${commaNumber(inference.costUsdTotal, 4)} USD`;
  const tokens = inference.inputTokensTotal === null ? "desconhecidos" : String(inference.inputTokensTotal);
  const invalid = statuses["invalid-choice"] + statuses.malformed;
  const failures = invalid + statuses.timeout + statuses.error;
  return [
    `Custo de inferência do Jev real (${subject.chooser.name}): ${cost} em ${inference.consulted} épocas consultadas, tokens de entrada ${tokens}; sem resposta válida: ${failures} (tempo esgotado ${statuses.timeout}, erro ${statuses.error}, resposta inválida ${invalid}).`,
  ];
}

function emit(report: LabReport, extra: string[] = [], deps?: LabCliDeps): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const lines = renderSummaryPt(report);
  const disclaimer = lines.pop() as string;
  const added = [...inferenceLines(report), ...leverageAllowanceLines(report), ...(deps?.summaryLines?.(report) ?? [])];
  process.stderr.write(`${[...lines, ...added, ...extra, disclaimer].join("\n")}\n`);
}

/** Thrown by the snapshot hook to end a run after an epoch was stored; never leaves this module. */
class StopRequested extends Error {}

export async function main(argv: readonly string[], deps?: LabCliDeps): Promise<number> {
  try {
    if (argv.includes("--help")) {
      process.stdout.write(`${usage(deps)}\n`);
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
      emit(buildReport(data), [`Diário lido: ${path}.`], deps);
      return 0;
    }

    const prepared = prepareRun(parsed, deps);
    const out = parsed.values.get("--out") as string;
    const journal = FileJournal.open(out, manifestOf(prepared.spec) as JsonObject);
    const shouldStop = deps?.shouldStop;
    let storedNow = 0;
    let summary: RunSummary | null = null;
    try {
      summary = await runEpochs({
        source: prepared.source,
        policies: prepared.roster,
        spec: prepared.spec,
        journal,
        snapshot: () => {
          journal.snapshot();
          if (shouldStop === undefined) return;
          storedNow += 1;
          if (shouldStop()) throw new StopRequested();
        },
        ...(shouldStop === undefined ? {} : { snapshotEvery: 1 }),
      });
    } catch (error) {
      if (!(error instanceof StopRequested)) throw error;
    }
    journal.snapshot();
    const file = join(out, "journal.jsonl");
    let line: string;
    if (summary !== null) {
      line = `Diário: ${file} (épocas novas ${summary.processed}, já completas ${summary.skipped}, pendentes ${summary.pending}).`;
    } else {
      const complete = journal.data().epochs.length;
      line = `Diário: ${file} (épocas novas ${storedNow}, já completas ${complete - storedNow}, pendentes ${prepared.spec.epochs - complete}; parada pedida pelo chamador: o resto fica pendente e a execução pode ser retomada na mesma pasta).`;
    }
    emit(buildReport(journal.data()), [line], deps);
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
