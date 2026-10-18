import { createFixtureAdapter, createSyntheticAdapter } from "../src/okx-derivatives/adapter.ts";
import { SYNTHETIC_NOW_MS } from "../src/okx-derivatives/fixture.ts";
import { readLocalJson } from "../src/okx-derivatives/local-file.ts";
import { buildDerivativesReport } from "../src/okx-derivatives/report.ts";
import { DerivativesError } from "../src/okx-derivatives/types.ts";

// Offline evaluator of OKX perpetual strategies. Read-only: no network, no credentials, no .env,
// no orders, no signing. Without arguments it prints a report for a built-in synthetic fixture.

const HELP = [
  "Avaliador offline de derivativos perpétuos OKX: carry de funding (spot comprado e perpétuo vendido) e perpétuo direcional somente como risco.",
  "Demonstração sintética: bun --no-env-file run scripts/okx-derivatives.ts",
  "Arquivo local: bun --no-env-file run scripts/okx-derivatives.ts --snapshot <arquivo.json> [--now-ms <inteiro>]",
  "Somente leitura e sem rede: não envia ordens, não assina e não usa credenciais. Dados sintéticos provam aritmética, não rentabilidade.",
  "No modo arquivo, sem --now-ms o relógio local é usado; com --now-ms o resultado é reproduzível. O arquivo tem até 1 MiB, UTF-8 e JSON estritos.",
  "O veredito eligible/ineligible/unavailable não é autorização financeira. Valores desconhecidos bloqueiam a aprovação.",
  "",
].join("\n");

const MAX_CLOCK_MS = 8_640_000_000_000_000;

function parseArguments(args: string[]): { snapshotPath: string | null; nowMs: number | null } {
  if (args.length % 2 !== 0) throw new DerivativesError("invalid_arguments");
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || value === undefined || (flag !== "--snapshot" && flag !== "--now-ms") || flags.has(flag) || value === "" || value.startsWith("--")) {
      throw new DerivativesError("invalid_arguments");
    }
    flags.set(flag, value);
  }
  const snapshotPath = flags.get("--snapshot") ?? null;
  const clockText = flags.get("--now-ms");
  if (clockText !== undefined && snapshotPath === null) throw new DerivativesError("invalid_arguments");
  let nowMs: number | null = null;
  if (clockText !== undefined) {
    if (!/^(0|[1-9][0-9]{0,15})$/.test(clockText)) throw new DerivativesError("invalid_arguments");
    nowMs = Number(clockText);
    if (!Number.isSafeInteger(nowMs) || nowMs > MAX_CLOCK_MS) throw new DerivativesError("invalid_clock");
  }
  return { snapshotPath, nowMs };
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(HELP);
  } else {
    const parsed = parseArguments(args);
    const report = parsed.snapshotPath === null
      ? buildDerivativesReport(createSyntheticAdapter(), SYNTHETIC_NOW_MS)
      : buildDerivativesReport(createFixtureAdapter(readLocalJson(parsed.snapshotPath), "imported"), parsed.nowMs ?? Date.now());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
} catch (error) {
  const line = error instanceof DerivativesError ? (error.path === "" ? error.code : `${error.code} ${error.path}`) : "internal_error";
  process.stderr.write(`okx-derivatives: ${line}\n`);
  process.exitCode = 1;
}
