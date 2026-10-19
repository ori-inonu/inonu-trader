/**
 * Jev Decision Lab with the REAL Jev, in SHADOW, under a hard cost cap. Specification: src/lab-jev/docs/spec.md.
 *
 * This is the ONLY file of the lab family that reads the environment, and it reads exactly three variables:
 *   TYPESAFE_AI_API_KEY   the key of the provider (only checked for presence here; the SDK sends it, nothing prints it)
 *   JEV_MODEL_ID          the model, default "jev-latest"
 *   JEV_USD_PER_MTOK      the price in USD per million input tokens (required to apply the cap in dollars)
 * Run it with a file that holds only those variables, and without the automatic .env:
 *   bun --no-env-file --env-file=data/jev.env run scripts/jev-lab-real.ts plan --capture <captura.jsonl>
 *   bun --no-env-file --env-file=data/jev.env run scripts/jev-lab-real.ts run --capture <captura.jsonl> --out <pasta> --max-usd 1 --max-calls 450 --allow-paid-inference
 *
 * It never executes, signs, sends or approves anything: it records what the Jev WOULD choose on a capture of the past
 * and measures what that choice would have returned, net of conservative costs. `plan` needs no key and no network.
 * `run` refuses without --allow-paid-inference, without both caps, with a cap above the hard maxima, without the key or
 * the price. Exit codes: 0 complete or stopped by the cap (the rest stays pending and the same folder resumes); 2 usage
 * or refusal; 3 any stop (journal integrity, failed preflight, the Jev stopped answering, unexpected error).
 * The key is never printed, never written to the journal and never part of an error message.
 */

import { validateChooserAnswer } from "../src/lab/policies.ts";
import { MemoryJournal } from "../src/lab/journal.ts";
import { STANDING_DISCLAIMER, manifestOf, runEpochs } from "../src/lab/run.ts";
import {
  JEV_LAB_HARD_MAX_CALLS,
  JEV_LAB_HARD_MAX_USD,
  JEV_LAB_PROMPT_VERSION,
  JevLabChooser,
  type JevEvaluateFn,
  type JevStopReason,
} from "../src/lab-jev/jev-chooser.ts";
import { PlanChooser, type ConsultationPlan } from "../src/lab-jev/plan-chooser.ts";
import { UsageError, main as runLab, parse, prepareRun, type LabCliDeps } from "./jev-lab.ts";

export const HARD_MAX_USD = JEV_LAB_HARD_MAX_USD;
export const HARD_MAX_CALLS = JEV_LAB_HARD_MAX_CALLS;
export const DEFAULT_TIMEOUT_MS = 20_000;
/** The abort of the connection comes this much after the timeout of the policy, so the policy is the one that records it. */
export const ABORT_MARGIN_MS = 2_000;
export const DEFAULT_MODEL_ID = "jev-latest";

const USAGE = [
  "Jev Decision Lab com o Jev REAL (somente sombra: nada é executado, assinado ou enviado)",
  "",
  "uso (com um arquivo que tenha só TYPESAFE_AI_API_KEY, JEV_MODEL_ID e JEV_USD_PER_MTOK):",
  "  bun --no-env-file --env-file=data/jev.env run scripts/jev-lab-real.ts plan --capture <captura.jsonl> [--usd-per-mtok <n>] [--seed <S>] [--step-ms <ms>] [--horizon-ms <ms>] [--bar-ms <ms>] [--frozen-at-ms <ms>]",
  "  bun --no-env-file --env-file=data/jev.env run scripts/jev-lab-real.ts run --capture <captura.jsonl> --out <pasta> --max-usd <n> --max-calls <n> --allow-paid-inference [--timeout-ms <ms>] [--seed <S>] [--step-ms <ms>] [--horizon-ms <ms>] [--bar-ms <ms>] [--frozen-at-ms <ms>]",
  "  bun --no-env-file run scripts/jev-lab-real.ts --help",
  "",
  "plan: estima épocas, consultas, tokens e custo; NÃO usa rede e NÃO precisa de chave.",
  `run: consulta o Jev real uma vez por época com candidatos. Recusa sem --allow-paid-inference, sem os dois tetos, com --max-usd acima de ${HARD_MAX_USD} USD ou --max-calls acima de ${HARD_MAX_CALLS}, sem a chave ou sem o preço.`,
  "     Imprime o custo estimado antes, faz uma consulta de pré-voo e para quando o teto ou a paciência com falhas acabar; o diário guarda tokens e custo por época e repetir o comando na mesma pasta continua dali.",
  "",
  "A captura vem de fora (formato JSONL do laboratório, src/lab/docs/spec.md, seção 3.4). O Jev só vê números, ids opacos e enumerações; nunca texto livre.",
  "Saída: relatório em JSON no stdout, resumo curto em português no stderr.",
  "Códigos de saída: 0 execução completa ou parada pelo teto; 2 uso incorreto ou recusa; 3 qualquer parada por erro.",
  "A chave nunca é impressa nem gravada. Nada aqui prova lucro e nada aqui concede permissão.",
].join("\n");

/** A refusal: the run does not start. Exit 2, nothing on stdout. */
class Refusal extends UsageError {}

export interface RealDeps {
  /** The environment to read. Default: the environment of the process (this is the only file that reads it). */
  env?: Readonly<Record<string, string | undefined>>;
  /** For tests: the evaluation function. Default: the AI SDK. */
  evaluate?: JevEvaluateFn;
  /** For tests: an SDK model whose fetch is fake. */
  model?: unknown;
  /** For tests: the clock of the latency, so that two runs write the same bytes. */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface OwnArgs {
  maxUsd: string | null;
  maxCalls: string | null;
  usdPerMTok: string | null;
  timeoutMs: string | null;
  allowPaid: boolean;
  /** Everything else, for the parser of the lab CLI. */
  lab: string[];
}

const OWN_VALUE_FLAGS = ["--max-usd", "--max-calls", "--usd-per-mtok", "--timeout-ms"] as const;

function splitArgs(args: readonly string[]): OwnArgs {
  const own: OwnArgs = { maxUsd: null, maxCalls: null, usdPerMTok: null, timeoutMs: null, allowPaid: false, lab: [] };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] as string;
    if (token === "--allow-paid-inference") {
      if (seen.has(token)) throw new UsageError(`flag repetida: ${token}`);
      seen.add(token);
      own.allowPaid = true;
      continue;
    }
    if ((OWN_VALUE_FLAGS as readonly string[]).includes(token)) {
      if (seen.has(token)) throw new UsageError(`flag repetida: ${token}`);
      seen.add(token);
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--") || value === "") throw new UsageError(`falta o valor de ${token}`);
      index += 1;
      if (token === "--max-usd") own.maxUsd = value;
      else if (token === "--max-calls") own.maxCalls = value;
      else if (token === "--usd-per-mtok") own.usdPerMTok = value;
      else own.timeoutMs = value;
      continue;
    }
    own.lab.push(token);
  }
  for (const flag of ["--synthetic", "--epochs", "--planted-edge"]) {
    if (own.lab.includes(flag)) throw new UsageError(`${flag} não vale aqui: o Jev real só roda sobre uma captura (--capture)`);
  }
  return own;
}

function decimalValue(raw: string, flag: string): number {
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(raw)) throw new UsageError(`valor mal formado em ${flag}: use ponto decimal e sem notação científica`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new UsageError(`valor mal formado em ${flag}`);
  return value;
}

function integerValue(raw: string, flag: string, minimum: number, maximum: number): number {
  if (!/^\d{1,9}$/.test(raw)) throw new UsageError(`valor mal formado em ${flag}: use um inteiro sem sinal, sem vírgula e sem notação científica`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new UsageError(`${flag} deve estar entre ${minimum} e ${maximum}`);
  return value;
}

// ---------------------------------------------------------------------------
// The environment: three variables, never echoed
// ---------------------------------------------------------------------------

interface RealEnv {
  hasKey: boolean;
  modelId: string;
  usdPerMTok: number | null;
}

/** Reads the three variables. The key is only compared and measured here; no message ever contains an env value. */
function readEnv(env: Readonly<Record<string, string | undefined>>): RealEnv {
  const key = env.TYPESAFE_AI_API_KEY;
  const hasKey = typeof key === "string" && key.length >= 8 && !/\s/.test(key);
  const rawModel = env.JEV_MODEL_ID;
  const modelId = rawModel === undefined || rawModel === "" ? DEFAULT_MODEL_ID : rawModel;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(modelId)) throw new Refusal("JEV_MODEL_ID tem formato inválido (use letras, dígitos e . _ : -, até 64 caracteres)");
  // A model id that is the key, contains it or is a long piece of it would put the key into the journal: never accept it.
  if (typeof key === "string" && key.length > 0 && (modelId === key || modelId.includes(key) || (modelId.length >= 8 && key.includes(modelId)))) {
    throw new Refusal("JEV_MODEL_ID não pode conter a chave; confira o arquivo de ambiente");
  }
  const rawPrice = env.JEV_USD_PER_MTOK;
  let usdPerMTok: number | null = null;
  if (rawPrice !== undefined && rawPrice !== "") {
    if (!/^\d{1,6}(\.\d{1,6})?$/.test(rawPrice) || !(Number(rawPrice) > 0)) throw new Refusal("JEV_USD_PER_MTOK tem formato inválido (use ponto decimal, acima de zero)");
    usdPerMTok = Number(rawPrice);
  }
  return { hasKey, modelId, usdPerMTok };
}

// ---------------------------------------------------------------------------
// The plan: the real pipeline with a counting stand-in, offline
// ---------------------------------------------------------------------------

function pt(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

interface Planned {
  plan: ConsultationPlan;
  chooser: PlanChooser;
  source: string;
  digest: string;
  records: number;
  epochs: number;
  stepMs: number;
  horizonMs: number;
  barMs: number;
  spanDays: number;
  firstEpochMs: number;
}

async function planFor(lab: readonly string[], timeoutMs: number): Promise<Planned> {
  const parsed = parse(["run", ...lab]);
  if (!parsed.values.has("--capture")) throw new UsageError("falta a flag --capture");
  const chooser = new PlanChooser();
  const prepared = prepareRun(parsed, { chooser, timeoutMs }, { requireOut: false });
  const journal = new MemoryJournal(manifestOf(prepared.spec));
  await runEpochs({ source: prepared.source, policies: prepared.roster, spec: prepared.spec, journal });
  const detail = prepared.spec.sourceDetail as { digest?: unknown; records?: unknown };
  return {
    plan: chooser.summary(),
    chooser,
    source: prepared.spec.source,
    digest: typeof detail.digest === "string" ? detail.digest : "",
    records: typeof detail.records === "number" ? detail.records : 0,
    epochs: journal.data().epochs.length,
    stepMs: prepared.spec.stepMs,
    horizonMs: prepared.spec.horizonMs,
    barMs: prepared.spec.barMs,
    spanDays: (journal.data().epochs.length * prepared.spec.stepMs) / 86_400_000,
    firstEpochMs: prepared.spec.firstEpochMs,
  };
}

interface Money {
  typicalUsd: number | null;
  conservativeUsd: number | null;
  maxCallUsd: number | null;
}

function moneyFor(plan: ConsultationPlan, usdPerMTok: number | null): Money {
  if (usdPerMTok === null || plan.typicalTokens === null || plan.conservativeTokens === null) return { typicalUsd: null, conservativeUsd: null, maxCallUsd: null };
  return {
    typicalUsd: (plan.typicalTokens.total / 1_000_000) * usdPerMTok,
    conservativeUsd: (plan.conservativeTokens.total / 1_000_000) * usdPerMTok,
    maxCallUsd: (plan.conservativeTokens.max / 1_000_000) * usdPerMTok,
  };
}

function planLines(planned: Planned, price: number | null, priceSource: string): string[] {
  const { plan } = planned;
  const money = moneyFor(plan, price);
  const lines = [
    `Captura: ${planned.source} (${planned.records} registros). Janela: ${planned.epochs} épocas, ${pt(planned.spanDays, 1)} dias, passo ${pt(planned.stepMs / 3_600_000, 1)} h, horizonte ${pt(planned.horizonMs / 3_600_000, 1)} h.`,
    `Consultas ao Jev: ${plan.calls} (uma por época com candidatos).${plan.rejected > 0 ? ` ATENÇÃO: ${plan.rejected} estados seriam recusados por estar fora do vocabulário.` : ""}`,
  ];
  if (plan.candidates !== null && plan.typicalTokens !== null && plan.conservativeTokens !== null) {
    lines.push(
      `Candidatos por consulta: mínimo ${plan.candidates.min}, média ${pt(plan.candidates.mean, 1)}, máximo ${plan.candidates.max}. Tokens de entrada por consulta: típico ${pt(plan.typicalTokens.mean, 0)} em média, conservador ${pt(plan.conservativeTokens.mean, 0)} em média e ${plan.conservativeTokens.max} no máximo.`,
    );
  }
  if (price === null || money.typicalUsd === null || money.conservativeUsd === null) {
    lines.push("Preço desconhecido: informe JEV_USD_PER_MTOK ou --usd-per-mtok para estimar o custo.");
  } else {
    lines.push(`Preço: ${pt(price, 4)} USD por milhão de tokens de entrada (${priceSource}). Custo estimado: ${pt(money.typicalUsd, 4)} USD (típico) e até ${pt(money.conservativeUsd, 4)} USD (conservador), sem contar o pré-voo.`);
  }
  lines.push(`Máximos duros de uma execução: ${HARD_MAX_USD} USD e ${HARD_MAX_CALLS} chamadas.`);
  return lines;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function out(text: string): void {
  process.stdout.write(text);
}

function err(text: string): void {
  process.stderr.write(text);
}

const STOP_TEXT: Record<JevStopReason, string> = {
  calls: "o teto de chamadas foi atingido",
  usd: "o teto de custo em USD foi atingido (o próximo passo não cabe nele)",
  failures: "o Jev parou de responder (falhas consecutivas)",
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export async function main(argv: readonly string[], deps: RealDeps = {}): Promise<number> {
  try {
    if (argv.includes("--help")) {
      out(`${USAGE}\n`);
      return 0;
    }
    const command = argv[0];
    if (command !== "plan" && command !== "run") throw new UsageError("informe o subcomando: plan ou run");
    const own = splitArgs(argv.slice(1));
    const env = deps.env ?? process.env;
    if (command === "plan") return await runPlan(own, env);
    return await runReal(own, env, deps);
  } catch (error) {
    if (error instanceof Refusal) {
      err(`recusado: ${error.message}\n`);
      return 2;
    }
    if (error instanceof UsageError) {
      err(`erro de uso: ${error.message}\n`);
      return 2;
    }
    // Never the message: it could carry something that was not meant to be printed. The name is enough to know where to look.
    err(`PARADA: erro inesperado (${error instanceof Error ? error.name : "desconhecido"}). Nada mais foi consultado.\n`);
    return 3;
  }
}

async function runPlan(own: OwnArgs, env: Readonly<Record<string, string | undefined>>): Promise<number> {
  if (own.maxUsd !== null) throw new UsageError("a flag --max-usd não vale para plan");
  if (own.maxCalls !== null) throw new UsageError("a flag --max-calls não vale para plan");
  if (own.timeoutMs !== null) throw new UsageError("a flag --timeout-ms não vale para plan");
  if (own.allowPaid) throw new UsageError("a flag --allow-paid-inference não vale para plan: o plano não faz consulta nenhuma");
  if (own.lab.includes("--out")) throw new UsageError("a flag --out não vale para plan: o plano não grava nada");
  let price: number | null = null;
  let priceSource = "";
  if (own.usdPerMTok !== null) {
    price = decimalValue(own.usdPerMTok, "--usd-per-mtok");
    if (!(price > 0)) throw new UsageError("--usd-per-mtok deve ser maior que zero");
    priceSource = "--usd-per-mtok";
  } else {
    const rawPrice = env.JEV_USD_PER_MTOK;
    if (rawPrice !== undefined && rawPrice !== "") {
      if (!/^\d{1,6}(\.\d{1,6})?$/.test(rawPrice) || !(Number(rawPrice) > 0)) throw new Refusal("JEV_USD_PER_MTOK tem formato inválido (use ponto decimal, acima de zero)");
      price = Number(rawPrice);
      priceSource = "JEV_USD_PER_MTOK";
    }
  }
  const planned = await planFor(own.lab, DEFAULT_TIMEOUT_MS);
  const money = moneyFor(planned.plan, price);
  const document = {
    schema: "jev-lab-real-plan-v1",
    network: false,
    keyRequired: false,
    capture: { source: planned.source, digest: planned.digest, records: planned.records },
    window: { firstEpochMs: planned.firstEpochMs, epochs: planned.epochs, spanDays: planned.spanDays, stepMs: planned.stepMs, horizonMs: planned.horizonMs, barMs: planned.barMs },
    consultations: planned.plan,
    price: { usdPerMTok: price, source: price === null ? null : priceSource },
    cost: money,
    hardMaxima: { usd: HARD_MAX_USD, calls: HARD_MAX_CALLS },
    disclaimer: STANDING_DISCLAIMER,
  };
  out(`${JSON.stringify(document, null, 2)}\n`);
  err(`${["JEV LAB (Jev real, plano): estimativa SEM rede e SEM chave; nada é executado, assinado ou enviado.", ...planLines(planned, price, priceSource), STANDING_DISCLAIMER].join("\n")}\n`);
  return 0;
}

async function runReal(own: OwnArgs, env: Readonly<Record<string, string | undefined>>, deps: RealDeps): Promise<number> {
  // 1. Refusals that need nothing but the arguments.
  if (!own.allowPaid) throw new Refusal("esta execução faz consultas pagas ao Jev real; confirme com --allow-paid-inference");
  if (own.maxUsd === null || own.maxCalls === null) throw new Refusal("informe os dois tetos, --max-usd e --max-calls");
  if (own.usdPerMTok !== null) throw new UsageError("a flag --usd-per-mtok só vale para plan: em run o preço vem de JEV_USD_PER_MTOK");
  const maxUsd = decimalValue(own.maxUsd, "--max-usd");
  const maxCalls = integerValue(own.maxCalls, "--max-calls", 1, 1_000_000);
  if (!(maxUsd > 0)) throw new Refusal("--max-usd deve ser maior que zero");
  if (maxUsd > HARD_MAX_USD) throw new Refusal(`--max-usd acima do máximo duro de ${HARD_MAX_USD} USD por execução`);
  if (maxCalls > HARD_MAX_CALLS) throw new Refusal(`--max-calls acima do máximo duro de ${HARD_MAX_CALLS} chamadas por execução`);
  if (maxCalls < 2) throw new Refusal("--max-calls precisa ser pelo menos 2: o pré-voo usa uma chamada e a janela precisa de outra");
  const timeoutMs = own.timeoutMs === null ? DEFAULT_TIMEOUT_MS : integerValue(own.timeoutMs, "--timeout-ms", 1_000, 120_000);
  if (!own.lab.includes("--out")) throw new UsageError("falta a flag --out");

  // 2. The environment.
  const real = readEnv(env);
  if (!real.hasKey) throw new Refusal("falta TYPESAFE_AI_API_KEY no ambiente (use --env-file=data/jev.env com um arquivo que tenha só as três variáveis)");
  if (real.usdPerMTok === null) throw new Refusal("falta JEV_USD_PER_MTOK (preço em USD por milhão de tokens de entrada): sem ele o teto em USD não pode ser aplicado");
  const price = real.usdPerMTok;

  // 3. The plan, offline, before anything is spent.
  const planned = await planFor(own.lab, timeoutMs);
  const plan = planned.plan;
  if (plan.calls === 0 || planned.chooser.firstState === null || plan.conservativeTokens === null) throw new Refusal("a janela não tem nenhuma consulta ao Jev (nenhuma época com candidatos): não há o que medir");
  if (plan.rejected > 0) throw new Refusal(`${plan.rejected} estados da janela estão fora do vocabulário do Jev: corrija a captura ou a lista de critérios antes de pagar por consultas`);
  const money = moneyFor(plan, price);
  const maxCallUsd = money.maxCallUsd as number;
  if (maxUsd < 2 * maxCallUsd) throw new Refusal(`--max-usd não cobre nem o pré-voo e uma consulta (cada consulta pode custar até ${pt(maxCallUsd, 4)} USD)`);
  const needCalls = plan.calls + 1;
  const needUsd = (money.conservativeUsd as number) + maxCallUsd;
  err(`${["JEV LAB (Jev real, em sombra): consultas pagas ao Jev, nada é executado, assinado ou enviado.", `Modelo: ${real.modelId} (instrução ${JEV_LAB_PROMPT_VERSION}).`, ...planLines(planned, price, "JEV_USD_PER_MTOK"), `Tetos desta execução: ${pt(maxUsd, 4)} USD e ${maxCalls} chamadas (o pré-voo usa uma).`].join("\n")}\n`);
  if (maxCalls < needCalls || maxUsd < needUsd) {
    err(`ATENÇÃO: os tetos não cobrem a janela inteira (precisaria de ${needCalls} chamadas e até ${pt(needUsd, 4)} USD). A execução vai parar quando o teto acabar; as épocas restantes ficam pendentes e repetir o comando na mesma pasta continua dali.\n`);
  }

  // 4. The real chooser, with the caps, and the preflight.
  const chooser = new JevLabChooser({
    modelId: real.modelId,
    usdPerMTok: price,
    maxCalls,
    maxUsd,
    abortAfterMs: timeoutMs + ABORT_MARGIN_MS,
    expectedCallUsd: maxCallUsd,
    ...(deps.evaluate === undefined ? {} : { evaluate: deps.evaluate }),
    ...(deps.model === undefined ? {} : { model: deps.model }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });
  try {
    const answer = await chooser.choose(planned.chooser.firstState);
    const known = ["hold", ...planned.chooser.firstState.candidates.map((candidate) => candidate.key)];
    if (!validateChooserAnswer(answer, known).ok) throw new Error("preflight answer not valid");
  } catch {
    err("PARADA: o pré-voo falhou (o Jev não devolveu uma resposta válida). Nada foi gravado no diário. Confira a chave, o modelo e a rede.\n");
    return 3;
  }

  // 5. The run itself: the same lab CLI, with the real Jev injected and a stop that comes BEFORE a call that would not fit.
  const labDeps: LabCliDeps = {
    chooser,
    inferenceUsdPerMTok: price,
    timeoutMs,
    shouldStop: () => chooser.stopReason() !== null,
    summaryLines: (report) => meterLines(chooser, report.run.pendingEpochs),
  };
  const code = await runLab(["run", ...own.lab], labDeps);
  if (code !== 0) return code;
  return chooser.stopReason() === "failures" ? 3 : 0;
}

function meterLines(chooser: JevLabChooser, pending: number): string[] {
  const meter = chooser.meter();
  const lines = [
    `Orçamento do Jev real: ${meter.callsStarted} de ${meter.maxCalls} chamadas e até ${pt(meter.upperBoundUsd, 4)} USD de ${pt(meter.maxUsd, 4)} USD (custo conhecido ${pt(meter.knownUsd, 4)} USD em ${meter.inputTokensKnown} tokens de entrada; o pré-voo está incluído; ${meter.callsWithoutUsage} chamadas sem uso de tokens válido foram contadas pela estimativa).`,
  ];
  const reason = chooser.stopReason();
  if (reason === "failures") {
    lines.push(`PARADA: ${STOP_TEXT.failures}. Confira a chave, o modelo e a rede; ${pending} épocas ficaram pendentes e as últimas ${meter.consecutiveFailures} ficaram gravadas como falhas.`);
  } else if (reason !== null) {
    lines.push(`Execução parada pelo teto: ${STOP_TEXT[reason]}. ${pending} épocas ficaram pendentes; rode de novo na mesma pasta com tetos maiores para continuar sem consultar duas vezes.`);
  }
  return lines;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
