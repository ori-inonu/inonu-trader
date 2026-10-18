/**
 * CLI of the read-only Onchain OS / OKX data capture. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 11.
 *
 *   plan  prints the calls one epoch would make and the quota cost. NO network, no credential read.
 *   run   captures into a folder in the format of the Jev Decision Lab. Needs --allow-network. The onchainos source also
 *         needs --credentials-from-env, which reads OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET and OKX_WEB3_API_PASSPHRASE.
 *
 * READ ONLY: no signing of transactions, no transaction building, no trade endpoint, no funds movement, no per call payment.
 * Output: JSON on stdout, a short Portuguese summary on stderr. Exit codes: 0 complete report (also when the duration
 * limit ended the run), 2 usage error, 3 the run had to stop (malformed record, provider failure, damaged folder).
 *
 * This is the composition root: it is the only place that touches the real fetch, clock and environment, and only in the
 * `import.meta.main` block at the end. `runCli` receives all of them by injection, so the tests never read a real
 * environment and never open a socket.
 */

import type { CaptureKind } from "../src/lab/capture-format.ts";
import { CAPTURE_NOTICE, runCapture, summarizePt } from "../src/onchainos/capture.ts";
import { createOnchainosCaptureSource, createPublicOkxCaptureSource, resolveOnchainosConfig, resolvePublicOkxConfig, type OnchainosTokenInput } from "../src/onchainos/capture-sources.ts";
import { CaptureError, type CaptureFs, type CaptureSource, type PlannedCall } from "../src/onchainos/capture-types.ts";
import { OnchainosError } from "../src/onchainos/errors.ts";
import { createOnchainosHttp, type FetchInit, type FetchLike, type FetchResponseLike, type OnchainosCredentials, type Tier } from "../src/onchainos/http.ts";
import { createMarketPriceClient } from "../src/onchainos/market-price.ts";
import { createPublicOkxClient, createPublicOkxHttp } from "../src/onchainos/public-okx.ts";

export interface CliIo {
  /** The environment, injected. Only the three OKX_WEB3_* names are ever read, and only with --credentials-from-env. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Test seam: an in memory file port. Absent in real use. */
  readonly fs?: CaptureFs;
}

export const ENV_NAMES = Object.freeze(["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE"] as const);

const USAGE = [
  "Captura somente leitura de dados do OKX Onchain OS e da API pública da OKX Exchange, no formato do Laboratório de Decisão do Jev",
  "",
  "uso:",
  "  bun --no-env-file run scripts/onchainos-capture.ts plan [--source public-okx|onchainos] [--inst ID,ID] [--token ALIAS=cadeia:endereco,...] [--kinds a,b] [--bar 1m] [--max-epochs N] [--epoch-ms ms] [--rps n]",
  "  bun --no-env-file run scripts/onchainos-capture.ts run --out <pasta> --max-epochs N --source public-okx|onchainos --allow-network [--credentials-from-env] [--max-duration-ms ms] [--inst ...] [--token ...] [--kinds ...] [--bar ...] [--epoch-ms ms] [--rps n] [--book-depth n] [--candles-limit n]",
  "  bun --no-env-file run scripts/onchainos-capture.ts --help",
  "",
  "plan: mostra as chamadas de uma época e o custo de cota por tier, SEM rede e sem ler credenciais. Sem --source usa public-okx com BTC-USDT e BTC-USDT-SWAP.",
  "run: captura para a pasta --out; repetir o comando na mesma pasta retoma sem duplicar. Nada é enviado sem --allow-network.",
  "     public-okx não usa chave. onchainos exige --credentials-from-env, que lê do ambiente OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET e OKX_WEB3_API_PASSPHRASE",
  "     (os valores nunca são impressos nem gravados) e --token ALIAS=cadeia:endereco, onde ALIAS vira o instrumento da captura (por exemplo WETH-USDC).",
  "     Para carregar o .env rode com bun run SEM --no-env-file; só faça isso quando decidir usar a fonte onchainos.",
  "--max-epochs é o total de épocas desejado na pasta; --max-duration-ms (padrão 300000) limita esta execução; --epoch-ms (padrão 60000) é a grade;",
  "--rps (padrão 1) é o ritmo máximo de requisições por segundo (até 5 em public-okx, até 10 em onchainos).",
  "",
  "Saída: JSON no stdout e um resumo curto em português no stderr.",
  "Códigos de saída: 0 relatório completo (inclui parada pelo limite de duração); 2 uso incorreto; 3 a execução precisou parar (registro malformado, falha do provedor, pasta inconsistente).",
  "Somente leitura: não assina, não monta transação, não envia ordem, não move fundos e não paga chamadas. Nada aqui prova lucro e nada aqui concede permissão.",
].join("\n");

class UsageError extends Error {}

const VALUE_FLAGS = ["--source", "--inst", "--token", "--kinds", "--bar", "--max-epochs", "--epoch-ms", "--rps", "--book-depth", "--candles-limit", "--out", "--max-duration-ms"] as const;
const BOOLEAN_FLAGS = ["--allow-network", "--credentials-from-env"] as const;
const PLAN_FLAGS: readonly string[] = ["--source", "--inst", "--token", "--kinds", "--bar", "--max-epochs", "--epoch-ms", "--rps", "--book-depth", "--candles-limit"];
const RUN_FLAGS: readonly string[] = [...PLAN_FLAGS, "--out", "--max-duration-ms", "--allow-network", "--credentials-from-env"];

interface Parsed {
  command: "plan" | "run";
  values: Map<string, string>;
  switches: Set<string>;
}

function parse(argv: readonly string[]): Parsed {
  const command = argv[0];
  if (command !== "plan" && command !== "run") throw new UsageError("informe o subcomando: plan ou run (ou --help)");
  const allowed = command === "plan" ? PLAN_FLAGS : RUN_FLAGS;
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index] as string;
    const isValue = (VALUE_FLAGS as readonly string[]).includes(token);
    const isSwitch = (BOOLEAN_FLAGS as readonly string[]).includes(token);
    if (!isValue && !isSwitch) throw new UsageError(token.startsWith("--") ? `flag desconhecida: ${token}` : "argumento inesperado");
    if (!allowed.includes(token)) throw new UsageError(`a flag ${token} não vale para ${command}`);
    if (isSwitch) {
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

function integer(parsed: Parsed, flag: string, minimum: number, maximum: number): number | undefined {
  const raw = parsed.values.get(flag);
  if (raw === undefined) return undefined;
  if (!/^\d{1,9}$/.test(raw)) throw new UsageError(`valor mal formado em ${flag}: use um inteiro sem sinal, sem vírgula e sem notação científica`);
  const value = Number(raw);
  if (value < minimum || value > maximum) throw new UsageError(`${flag} deve estar entre ${minimum} e ${maximum}`);
  return value;
}

function list(parsed: Parsed, flag: string): string[] | undefined {
  const raw = parsed.values.get(flag);
  if (raw === undefined) return undefined;
  const items = raw.split(",");
  if (items.some((item) => item === "" || item !== item.trim())) throw new UsageError(`lista mal formada em ${flag}: sem itens vazios nem espaços`);
  return items;
}

function tokens(parsed: Parsed): OnchainosTokenInput[] {
  const items = list(parsed, "--token");
  if (items === undefined) return [];
  return items.map((item) => {
    const match = /^([^=]+)=(\d{1,12}):(.+)$/.exec(item);
    if (match === null) throw new UsageError("--token deve ter o formato ALIAS=cadeia:endereco, por exemplo WETH-USDC=1:0xc02a...");
    return { alias: match[1] as string, chainIndex: match[2] as string, tokenContractAddress: match[3] as string };
  });
}

function requestsPerSecond(parsed: Parsed, maximum: number): number {
  const raw = parsed.values.get("--rps");
  if (raw === undefined) return 1;
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(raw)) throw new UsageError("valor mal formado em --rps: use um número decimal com ponto");
  const value = Number(raw);
  if (value < 0.1 || value > maximum) throw new UsageError(`--rps deve estar entre 0.1 e ${maximum} para esta fonte`);
  return value;
}

function sourceName(parsed: Parsed, required: boolean): "public-okx" | "onchainos" {
  const raw = parsed.values.get("--source");
  if (raw === undefined) {
    if (required) throw new UsageError("falta a flag --source (public-okx ou onchainos)");
    return "public-okx";
  }
  if (raw !== "public-okx" && raw !== "onchainos") throw new UsageError("--source deve ser public-okx ou onchainos");
  return raw;
}

// ---------------------------------------------------------------------------
// Wiring: the only place where clients are built from the injected io
// ---------------------------------------------------------------------------

function wirePublic(io: CliIo, rps: number, allowNetwork: boolean) {
  const http = createPublicOkxHttp({ fetch: io.fetch, now: io.now, sleep: io.sleep, allowNetwork, requestsPerSecond: rps, burst: 1 });
  return { http, client: createPublicOkxClient(http) };
}

function wireOnchainos(io: CliIo, rps: number, credentials: OnchainosCredentials | undefined, allowNetwork: boolean) {
  const http = createOnchainosHttp({ fetch: io.fetch, now: io.now, sleep: io.sleep, allowNetwork, requestsPerSecond: rps, burst: 1, ...(credentials === undefined ? {} : { credentials }) });
  return { http, market: createMarketPriceClient(http) };
}

type Wiring = { public: ReturnType<typeof wirePublic>; onchainos: ReturnType<typeof wireOnchainos> };

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function callCount(call: PlannedCall, epochs: number): { min: number; max: number } {
  if (call.frequency === "every_epoch") return { min: epochs, max: epochs };
  if (call.frequency === "first_epoch") return { min: 1, max: 1 };
  return { min: 1, max: epochs };
}

function planTotals(calls: readonly PlannedCall[], epochs: number, rps: number) {
  const byTier: Partial<Record<Tier, { min: number; max: number }>> = {};
  let minCalls = 0;
  let maxCalls = 0;
  let everyEpoch = 0;
  for (const call of calls) {
    const count = callCount(call, epochs);
    const current = byTier[call.tier] ?? { min: 0, max: 0 };
    byTier[call.tier] = { min: current.min + count.min, max: current.max + count.max };
    minCalls += count.min;
    maxCalls += count.max;
    if (call.frequency === "every_epoch") everyEpoch += 1;
  }
  const percent = (value: number): number => Number(((value / 100_000) * 100).toFixed(6));
  return {
    minCalls,
    maxCalls,
    byTier,
    costKnown: !calls.some((call) => call.tier === "unknown"),
    minDurationSeconds: Math.ceil(maxCalls / rps),
    everyEpochCalls: everyEpoch,
    freeMonthlyAllowance: {
      basic: 100_000,
      premium: 100_000,
      basicUsedPercentMax: percent(byTier.basic?.max ?? 0),
      premiumUsedPercentMax: percent(byTier.premium?.max ?? 0),
      note: "Plano Free do Market: 100 mil chamadas Basic e 100 mil Premium por mês; os endpoints free e as chamadas públicas da Exchange não consomem essa cota. Percentuais só desta captura.",
    },
  };
}

function buildSource(parsed: Parsed, name: "public-okx" | "onchainos", http: Wiring): CaptureSource {
  const kinds = list(parsed, "--kinds") as CaptureKind[] | undefined;
  const bookDepth = integer(parsed, "--book-depth", 1, 50);
  const candlesLimit = integer(parsed, "--candles-limit", 1, 300);
  if (name === "public-okx") {
    const instruments = list(parsed, "--inst");
    if (parsed.values.has("--token")) throw new UsageError("--token vale só para a fonte onchainos");
    const config = resolvePublicOkxConfig({
      ...(instruments === undefined ? {} : { instruments }),
      ...(kinds === undefined ? {} : { kinds }),
      ...(parsed.values.has("--bar") ? { bar: parsed.values.get("--bar") as never } : {}),
      ...(bookDepth === undefined ? {} : { bookDepth }),
      ...(candlesLimit === undefined ? {} : { candlesLimit }),
    });
    return createPublicOkxCaptureSource(http.public.client, config);
  }
  if (parsed.values.has("--inst")) throw new UsageError("--inst vale só para a fonte public-okx");
  if (parsed.values.has("--book-depth")) throw new UsageError("--book-depth vale só para a fonte public-okx");
  const given = tokens(parsed);
  if (given.length === 0) throw new UsageError("a fonte onchainos precisa de --token ALIAS=cadeia:endereco");
  const config = resolveOnchainosConfig({
    tokens: given,
    ...(kinds === undefined ? {} : { kinds }),
    ...(parsed.values.has("--bar") ? { bar: parsed.values.get("--bar") as never } : {}),
    ...(candlesLimit === undefined ? {} : { candlesLimit }),
  });
  return createOnchainosCaptureSource(http.onchainos.market, config);
}

async function plan(parsed: Parsed, io: CliIo): Promise<number> {
  const name = sourceName(parsed, false);
  const epochs = integer(parsed, "--max-epochs", 1, 100_000) ?? 60;
  const epochMs = integer(parsed, "--epoch-ms", 1_000, 86_400_000) ?? 60_000;
  const rps = requestsPerSecond(parsed, name === "public-okx" ? 5 : 10);
  // offline clients: nothing here can send, there are no credentials and allowNetwork is not set
  const offline: Wiring = { public: wirePublic(io, name === "public-okx" ? rps : 1, false), onchainos: wireOnchainos(io, name === "onchainos" ? rps : 1, undefined, false) };
  const source = buildSource(parsed, name, offline);
  const calls = source.plan();
  const totals = planTotals(calls, epochs, rps);
  const perEpochSeconds = Math.ceil(totals.everyEpochCalls / rps);
  const warnings: string[] = [];
  if (perEpochSeconds * 1_000 > epochMs) warnings.push(`as chamadas de uma época levam pelo menos ${perEpochSeconds} s no ritmo escolhido e a grade é de ${epochMs / 1000} s: células serão puladas; aumente --epoch-ms ou --rps`);
  const notes = [
    "O limite de requisições por segundo dos endpoints REST de Market não é documentado pela OKX: 1 por segundo é um piso conservador, não um limite medido.",
    "Cada tentativa enviada conta como uma chamada consumida da cota (hipótese conservadora; a OKX não documenta se chamadas com erro consomem cota).",
    "Chamadas de tier unknown (Gateway, DeFi, Social) têm custo desconhecido, nunca zero.",
    "Pagamento por chamada (x402) nunca é feito: uma resposta 402 vira erro.",
  ];
  const output = {
    schema: "onchainos-capture-plan-v1",
    network: "nenhuma chamada foi feita",
    source: name,
    epochs,
    epochMs,
    requestsPerSecond: rps,
    config: source.describe(),
    callsPerEpoch: calls,
    totals,
    warnings,
    notes,
    notice: CAPTURE_NOTICE,
  };
  io.stdout(`${JSON.stringify(output, null, 2)}\n`);
  io.stderr(
    [
      `Plano (sem rede): fonte ${name}, ${epochs} épocas de ${epochMs} ms; ${calls.length} chamadas distintas por época; entre ${totals.minCalls} e ${totals.maxCalls} chamadas no total.`,
      `Custo por tier (mínimo a máximo): ${Object.entries(totals.byTier).map(([tier, count]) => `${tier} ${count.min} a ${count.max}`).join("; ")}${totals.costKnown ? "" : "; há chamadas de custo desconhecido"}.`,
      ...warnings,
      CAPTURE_NOTICE,
    ].join("\n") + "\n",
  );
  return 0;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function credentials(io: CliIo): { apiKey: string; secretKey: string; passphrase: string } {
  const [keyName, secretName, passName] = ENV_NAMES;
  const key = io.env[keyName];
  const secret = io.env[secretName];
  const pass = io.env[passName];
  const missing = ENV_NAMES.filter((name) => {
    const value = io.env[name];
    return value === undefined || value === "";
  });
  if (missing.length > 0) throw new UsageError(`faltam variáveis de ambiente para --credentials-from-env: ${missing.join(", ")}`);
  return { apiKey: key as string, secretKey: secret as string, passphrase: pass as string };
}

async function run(parsed: Parsed, io: CliIo): Promise<number> {
  const name = sourceName(parsed, true);
  const out = parsed.values.get("--out");
  if (out === undefined) throw new UsageError("falta a flag --out");
  const maxEpochs = integer(parsed, "--max-epochs", 1, 100_000);
  if (maxEpochs === undefined) throw new UsageError("falta a flag --max-epochs");
  if (!parsed.switches.has("--allow-network")) throw new UsageError("run exige --allow-network: nada é enviado sem ele");
  const epochMs = integer(parsed, "--epoch-ms", 1_000, 86_400_000) ?? 60_000;
  const maxDurationMs = integer(parsed, "--max-duration-ms", 1, 86_400_000) ?? 300_000;
  const rps = requestsPerSecond(parsed, name === "public-okx" ? 5 : 10);

  let creds: ReturnType<typeof credentials> | undefined;
  if (name === "onchainos") {
    if (!parsed.switches.has("--credentials-from-env")) throw new UsageError("a fonte onchainos exige --credentials-from-env (as três variáveis OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET e OKX_WEB3_API_PASSPHRASE)");
    creds = credentials(io);
  } else if (parsed.switches.has("--credentials-from-env")) {
    throw new UsageError("a fonte public-okx não usa credenciais: retire --credentials-from-env");
  }

  // only the chosen source is allowed to send; the other client exists but stays offline
  const wiring: Wiring = {
    public: wirePublic(io, name === "public-okx" ? rps : 1, name === "public-okx"),
    onchainos: wireOnchainos(io, name === "onchainos" ? rps : 1, name === "onchainos" ? creds : undefined, name === "onchainos"),
  };
  const source = buildSource(parsed, name, wiring);
  io.stderr(name === "onchainos" ? "Fonte onchainos: credenciais lidas do ambiente por --credentials-from-env (os valores nunca são impressos nem gravados).\n" : "Fonte public-okx: API pública da OKX Exchange, sem chave.\n");

  const report = await runCapture({ outDir: out, source, maxEpochs, maxDurationMs, epochMs, now: io.now, sleep: io.sleep, ...(io.fs === undefined ? {} : { fs: io.fs }) });
  const quota = name === "onchainos" ? wiring.onchainos.http.quota.snapshot() : wiring.public.http.quota.snapshot();
  io.stdout(`${JSON.stringify({ ...report, calls: quota }, null, 2)}\n`);
  io.stderr(`${summarizePt(report).join("\n")}\n`);
  return report.status === "stopped" ? 3 : 0;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help") {
      io.stdout(`${USAGE}\n`);
      return 0;
    }
    const parsed = parse(argv);
    return parsed.command === "plan" ? await plan(parsed, io) : await run(parsed, io);
  } catch (error) {
    if (error instanceof UsageError || (error instanceof CaptureError && error.kind === "usage") || (error instanceof OnchainosError && error.kind === "invalid_request")) {
      io.stderr(`erro de uso: ${error instanceof OnchainosError ? error.detail : (error as Error).message}\nuse --help para ver as opções.\n`);
      return 2;
    }
    if (error instanceof CaptureError || error instanceof OnchainosError) {
      io.stderr(`erro: ${error.message}\n`);
      return 3;
    }
    io.stderr(`erro interno inesperado (${error instanceof Error ? error.name : typeof error})\n`);
    return 3;
  }
}

if (import.meta.main) {
  const real: CliIo = {
    env: process.env,
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    fetch: (url: string, init: FetchInit) => fetch(url, init as RequestInit) as unknown as Promise<FetchResponseLike>,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  process.exitCode = await runCli(Bun.argv.slice(2), real);
}

