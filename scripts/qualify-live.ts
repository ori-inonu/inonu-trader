// Read-only qualification report for the live-execution gate (docs/LIVE-QUALIFICATION.md).
//
// It does NOT lift, weaken or bypass the gate in Market.init(), and it never sends, signs or approves anything.
// No network, no RPC, no file writes. It reads: the configuration (like scripts/doctor.ts), data/live-authorization.json,
// data/live-evidence.json and, only to compare SHA-256, the local files the manifest names inside the data directory.
// Secrets are reduced to booleans; the only value derived from PRIVATE_KEY is the public address, used for comparison
// and never printed. Exit code 0 for any complete report; the report carries the status. Usage errors exit 2.
import { createHash } from "node:crypto";
import { createReadStream, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ethers } from "ethers";
import {
  AUTHORIZATION_TEMPLATE,
  EVIDENCE_TEMPLATE,
  REQUIRED_ARTIFACTS,
  evaluateLiveQualification,
  isSafeRelativePath,
  isSha256Hex,
  parseIsoTimestamp,
  type ArtifactCheck,
  type ConfigSnapshot,
  type InputError,
  type LiveQualificationInput,
  type LiveQualificationReport,
} from "../src/live-qualification";

type Env = Record<string, string | undefined>;
type LoadedConfig = ReturnType<typeof import("../src/config").loadConfig>;
type Raw = Record<string, unknown>;

export class UsageError extends Error {}

export const MAX_JSON_BYTES = 1_048_576;

export const USAGE = [
  "Uso: bun run scripts/qualify-live.ts [--data-dir <pasta>] [--now <ISO 8601>] [--print-template authorization|evidence] [--help]",
  "  --data-dir <pasta>                       pasta com live-authorization.json e live-evidence.json (padrão: data, relativa ao diretório atual)",
  "  --now <ISO 8601 com fuso>                relógio fixo para relatório reproduzível, por exemplo 2026-10-11T12:00:00Z",
  "  --print-template authorization|evidence  imprime o modelo vazio (que falha na validação até ser preenchido) e sai",
  "Somente leitura: nunca envia, assina, aprova nem deposita nada; sem rede e sem RPC.",
  "O bloqueio em Market.init() não é alterado por este comando.",
  "Saída: JSON no stdout e resumo em pt-BR no stderr. Código 0 para qualquer relatório completo; uso incorreto sai com 2.",
].join("\n");

const BANNED_MARKS = new RegExp(`[${[0xb7, 0x2013, 0x2014, 0x2212, 0x2022, 0x2219, 0x22c5, 0x2027, 0x30fb].map((code) => String.fromCharCode(code)).join("")}]`, "g");
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Text taken from the command line or from files, made safe to print. */
const shown = (value: string, max = 60): string => {
  const clean = value.replace(BANNED_MARKS, "-").replace(CONTROL_CHARS, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
};

const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export interface CliOptions {
  dataDir: string;
  nowMs: number | null;
  printTemplate: "authorization" | "evidence" | null;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { dataDir: "data", nowMs: null, printTemplate: null, help: false };
  const seen = new Set<string>();
  const valueOf = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) throw new UsageError(`${flag} exige um valor`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (seen.has(arg)) throw new UsageError(`flag repetida: ${shown(arg, 30)}`);
    switch (arg) {
      case "--help":
        options.help = true;
        break;
      case "--data-dir":
        options.dataDir = valueOf(arg, index);
        index += 1;
        break;
      case "--now": {
        const parsed = parseIsoTimestamp(valueOf(arg, index));
        if (parsed === null) throw new UsageError("--now exige data e hora ISO 8601 com fuso, por exemplo 2026-10-11T12:00:00Z");
        options.nowMs = parsed;
        index += 1;
        break;
      }
      case "--print-template": {
        const kind = valueOf(arg, index);
        if (kind !== "authorization" && kind !== "evidence") throw new UsageError("--print-template aceita authorization ou evidence");
        options.printTemplate = kind;
        index += 1;
        break;
      }
      default:
        throw new UsageError(`argumento desconhecido: ${shown(arg, 30)}`);
    }
    seen.add(arg);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Local file reads (read-only)
// ---------------------------------------------------------------------------

export type JsonRead = { state: "absent" } | { state: "error"; error: InputError } | { state: "ok"; value: unknown };

const MISSING_CODES = new Set(["ENOENT", "ENOTDIR"]);
const errorCode = (error: unknown): string | undefined => (typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined);

export async function readJsonFile(path: string): Promise<JsonRead> {
  let stat;
  try { stat = lstatSync(path); }
  catch (error) { return MISSING_CODES.has(errorCode(error) ?? "") ? { state: "absent" } : { state: "error", error: "unreadable" }; }
  if (!stat.isFile() || stat.size > MAX_JSON_BYTES) return { state: "error", error: "unreadable" };
  let text: string;
  try { text = await Bun.file(path).text(); }
  catch { return { state: "error", error: "unreadable" }; }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try { return { state: "ok", value: JSON.parse(text) as unknown }; }
  catch { return { state: "error", error: "malformed-json" }; }
}

function sha256File(path: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", fail)
      .on("end", () => done(hash.digest("hex")));
  });
}

const inside = (root: string, target: string): boolean => {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/**
 * Compares the SHA-256 of the local files the manifest declares. Only well-formed declarations are looked at; a file
 * is hashed only if it is a regular file (never a link) whose real path stays inside the data directory.
 */
export async function verifyArtifacts(manifest: unknown, dataDir: string): Promise<{ checks: Record<string, ArtifactCheck>; filesRead: string[] }> {
  const checks: Record<string, ArtifactCheck> = {};
  const filesRead: string[] = [];
  if (!isRecord(manifest) || !isRecord(manifest.artifacts)) return { checks, filesRead };
  const root = resolve(dataDir);
  for (const id of REQUIRED_ARTIFACTS) {
    const entry = manifest.artifacts[id];
    if (!isRecord(entry) || !isSafeRelativePath(entry.path) || !isSha256Hex(entry.sha256)) continue;
    const target = resolve(root, entry.path);
    if (!inside(root, target)) { checks[id] = { status: "outside-data-dir" }; continue; }
    let stat;
    try { stat = lstatSync(target); }
    catch (error) { checks[id] = { status: MISSING_CODES.has(errorCode(error) ?? "") ? "missing" : "unreadable" }; continue; }
    if (!stat.isFile()) { checks[id] = { status: "not-regular-file" }; continue; }
    try {
      if (!inside(realpathSync(root), realpathSync(target))) { checks[id] = { status: "outside-data-dir" }; continue; }
      const digest = await sha256File(target);
      filesRead.push(shown(entry.path, 120));
      checks[id] = { status: digest === entry.sha256.toLowerCase() ? "match" : "mismatch" };
    } catch {
      checks[id] = { status: "unreadable" };
    }
  }
  return { checks, filesRead };
}

// ---------------------------------------------------------------------------
// Configuration snapshot (booleans for secrets, never values)
// ---------------------------------------------------------------------------

function toSnapshot(config: LoadedConfig, env: Env): ConfigSnapshot {
  let signerAddress: string | null = null;
  if (config.privateKey) {
    // Public address only: computed locally from the key material, never printed, nothing is signed or sent.
    try { signerAddress = ethers.utils.computeAddress(config.privateKey); } catch { signerAddress = null; }
  }
  return {
    dryRun: config.dryRun,
    model: config.model,
    jevModelId: config.jevModelId,
    bankrollUsd: config.bankrollUsd,
    maxLossUsd: config.maxLossUsd,
    maxSpendUsd: config.maxSpendUsd,
    tradeSizeMon: config.tradeSizeMon,
    maxPositionMon: config.maxPositionMon,
    maxCapitalFraction: config.maxCapitalFraction,
    quoteIntervalBlocks: config.quoteIntervalBlocks,
    minConfidence: config.minConfidence,
    economicGate: config.economicGate,
    walletKeyPresent: Boolean(config.privateKey),
    jevKeyPresent: Boolean(env.TYPESAFE_AI_API_KEY),
    liveAckSet: env.LIVE_ACK === "OWN_FUNDS_RISK",
    autoDeposit: config.autoDeposit,
    signerAddress,
  };
}

/** Config errors are static strings today; this keeps it that way even if one ever echoes a value. */
function describeConfigError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const masked = message.replace(/(?:0x)?[0-9a-fA-F]{16,}/g, "<hex>");
  return /^[A-Za-z0-9_=,.:/ -]{1,160}$/.test(masked) ? masked : "falha ao carregar a configuração";
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface BuildOptions {
  env: Env;
  dataDir: string;
  now: () => number;
  loadConfig: (env: Env) => LoadedConfig | Promise<LoadedConfig>;
}

export interface BuildResult {
  report: LiveQualificationReport;
  configLoad: { ok: true } | { ok: false; error: string };
  filesRead: string[];
}

export async function buildReport(options: BuildOptions): Promise<BuildResult> {
  let snapshot: ConfigSnapshot | null = null;
  let configLoad: BuildResult["configLoad"];
  try {
    snapshot = toSnapshot(await options.loadConfig(options.env), options.env);
    configLoad = { ok: true };
  } catch (error) {
    configLoad = { ok: false, error: describeConfigError(error) };
  }

  const filesRead: string[] = [];
  const authorizationFile = await readJsonFile(join(options.dataDir, "live-authorization.json"));
  const evidenceFile = await readJsonFile(join(options.dataDir, "live-evidence.json"));
  const wasRead = (file: JsonRead) => file.state === "ok" || (file.state === "error" && file.error === "malformed-json");
  if (wasRead(authorizationFile)) filesRead.push("live-authorization.json");
  if (wasRead(evidenceFile)) filesRead.push("live-evidence.json");
  const verification = evidenceFile.state === "ok" ? await verifyArtifacts(evidenceFile.value, options.dataDir) : { checks: {}, filesRead: [] };
  filesRead.push(...verification.filesRead);

  const input: LiveQualificationInput = { config: snapshot, artifactChecks: verification.checks, now: options.now };
  if (authorizationFile.state === "ok") input.authorization = authorizationFile.value;
  if (authorizationFile.state === "error") input.authorizationError = authorizationFile.error;
  if (evidenceFile.state === "ok") input.evidence = evidenceFile.value;
  if (evidenceFile.state === "error") input.evidenceError = evidenceFile.error;
  return { report: evaluateLiveQualification(input), configLoad, filesRead };
}

const INPUT_LABEL: Record<string, string> = { present: "presente", absent: "ausente", "malformed-json": "JSON malformado", unreadable: "ilegível" };
const CLAIM_LABEL = (value: boolean | null) => (value === null ? "indeterminado" : value ? "sim" : "não");

/** Short pt-BR summary for the terminal. */
export function renderSummary({ report, configLoad }: BuildResult): string[] {
  const { summary } = report;
  const counts = summary.counts;
  const lines = [
    "INONU TRADER: verificador de qualificação para execução real (somente leitura)",
    `Gerado em ${report.evaluatedAt}. Perfil de cadência: ${report.cadenceProfile}.`,
    configLoad.ok ? "Configuração: carregada." : `Configuração: NÃO carregada (${configLoad.error}).`,
    `Registro de autorização: ${INPUT_LABEL[report.inputs.authorization]}. Manifesto de evidências: ${INPUT_LABEL[report.inputs.evidence]}.`,
    `Itens: ${counts.total} (atendidos ${counts.met}, não atendidos ${counts.unmet}, sem evidência ${counts.unknown}).`,
    `Checklist completa para revisão do dono: ${summary.readyForOwnerReview ? "SIM" : "NÃO"} (isto não é autorização para operar).`,
  ];
  if (summary.blockers.length > 0) {
    const first = summary.blockers.slice(0, 10);
    const rest = summary.blockers.length - first.length;
    lines.push(`Bloqueios (${summary.blockers.length}): ${first.join(", ")}${rest > 0 ? ` e mais ${rest} (veja o JSON)` : ""}.`);
  }
  lines.push(`Alegações do tweet sustentadas pela configuração: ${report.claims.map((claim) => `${claim.id}=${CLAIM_LABEL(claim.supportedByConfig)}`).join(", ")}.`);
  lines.push("AVISO: o bloqueio de execução em Market.init() está inalterado; este relatório não o levanta. Nada foi enviado, assinado ou depositado, e nenhum approve de token foi feito. Sem rede e sem RPC.");
  lines.push("O assistente não preenche o registro de autorização, não fornece chaves e não executa sessão live. Só o dono decide, em commit separado e revisado (docs/LIVE-QUALIFICATION.md).");
  return lines;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function main(argv: readonly string[], env: Env): Promise<number> {
  let options: CliOptions;
  try { options = parseArgs(argv); }
  catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (options.help) { console.log(USAGE); return 0; }
  if (options.printTemplate) {
    console.log(JSON.stringify(options.printTemplate === "authorization" ? AUTHORIZATION_TEMPLATE : EVIDENCE_TEMPLATE, null, 2));
    return 0;
  }
  const fixedNow = options.nowMs;
  const result = await buildReport({
    env,
    dataDir: options.dataDir,
    now: fixedNow === null ? () => Date.now() : () => fixedNow,
    // Lazy on purpose: an invalid environment becomes a reported configLoad error instead of a crash at import time.
    loadConfig: async (source) => (await import("../src/config")).loadConfig(source),
  });
  console.log(JSON.stringify({
    ...result.report,
    configLoad: result.configLoad,
    io: { network: false, rpc: false, signing: false, transactionsSent: 0, filesRead: result.filesRead },
  }, null, 2));
  console.error(renderSummary(result).join("\n"));
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2), process.env);
