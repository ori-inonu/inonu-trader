/**
 * Command line of the wallet evidence layer, over INJECTED input and output (env, fetch, clock, file port, stdout).
 * Commands:
 *   demo     offline, synthetic, no network and no environment.
 *   plan     the calls one refresh would make, with their limits. No network.
 *   refresh  one on-demand read of OKX. Refuses unless THREE switches are given: --live, --credentials-from-env and
 *            --allow-network. Sends the wallet address to OKX, reads only, never signs or moves anything.
 *
 * The real wiring (process.env, global fetch, console) is in main.ts, the only file that touches them.
 */

import type { CaptureFs } from "../onchainos/capture-types.ts";
import { OnchainosError } from "../onchainos/errors.ts";
import { createOnchainosHttp, type FetchLike } from "../onchainos/http.ts";
import { DEFAULTS, collectWalletEvidence, CollectorUsageError, planCalls, type CollectRequest } from "./collector.ts";
import { runDemo } from "./demo.ts";
import { FIXTURE_LABEL } from "./fixtures.ts";
import { summarizeEvidence } from "./report.ts";
import { createEvidenceStore } from "./store.ts";
import { accountRefOf, isCleanCollection } from "./evidence.ts";
import { WALLET_ENDPOINTS } from "./adapters/okx-endpoints.ts";
import { endpoint as marketEndpoint } from "../onchainos/endpoints.ts";
import type { TimeFrameCode } from "./address-analysis.ts";

export const CREDENTIAL_ENV_NAMES = Object.freeze(["OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE"] as const);

export interface CliIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly fs: CaptureFs;
}

const HELP = [
  "Evidencia de carteira OKX, somente leitura",
  "  demo                                  demonstracao offline com dados SINTETICOS",
  "  plan --address A --chains 1,501 [...] chamadas que uma atualizacao faria (sem rede)",
  "  refresh --live --credentials-from-env --allow-network --address A --chains 1,501 [...]",
  "                                        uma leitura sob demanda; envia o endereco a OKX; nao assina nem move nada",
  "Opcoes de plan e refresh: --risk-filter 0|1  --history  --pnl-chains 1,501  --pnl-timeframe 1..5  --liquidity  --risk  --probe",
  "                          Address Analysis (exigem --pnl-chains): --pnl-tokens 1:0xabc,501:Mint  --dex-history --dex-days N (1 a 365, padrao 30)  --support-check",
  "                          --no-total  --no-market  --max-calls N  --max-pages N  --deadline-ms N  --per-token-cap N",
  "                          --cache-ttl-ms N  --max-age-ms N  --store-dir DIR  --force  --json",
  "Nao ha agendamento: cada execucao e uma atualizacao. Credenciais: OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET, OKX_WEB3_API_PASSPHRASE.",
];

class Usage extends Error {}

interface Parsed {
  readonly command: string;
  readonly values: Map<string, string>;
  readonly switches: Set<string>;
}

const VALUE_FLAGS = new Set(["--address", "--chains", "--risk-filter", "--pnl-chains", "--pnl-timeframe", "--max-calls", "--max-pages", "--deadline-ms", "--per-token-cap", "--cache-ttl-ms", "--max-age-ms", "--store-dir", "--pnl-tokens", "--dex-days"]);
const SWITCHES = new Set(["--live", "--credentials-from-env", "--allow-network", "--history", "--liquidity", "--risk", "--probe", "--no-total", "--no-market", "--force", "--json", "--help", "--dex-history", "--support-check"]);

function parse(argv: readonly string[]): Parsed {
  const [command = "help", ...rest] = argv;
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (VALUE_FLAGS.has(arg)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Usage(`${arg} exige um valor`);
      values.set(arg, value);
      index += 1;
    } else if (SWITCHES.has(arg)) switches.add(arg);
    else throw new Usage(`opcao desconhecida${/^--[a-z][a-z-]{0,30}$/.test(arg) ? `: ${arg}` : " (o valor nao e exibido)"}`);
  }
  return { command, values, switches };
}

function integer(parsed: Parsed, flag: string): number | undefined {
  const raw = parsed.values.get(flag);
  if (raw === undefined) return undefined;
  if (!/^\d{1,9}$/.test(raw)) throw new Usage(`${flag} deve ser um inteiro`);
  return Number(raw);
}

function requestOf(parsed: Parsed): CollectRequest {
  const address = parsed.values.get("--address");
  const chains = parsed.values.get("--chains");
  if (address === undefined || chains === undefined) throw new Usage("informe --address e --chains");
  const riskFilter = parsed.values.get("--risk-filter");
  if (riskFilter !== undefined && riskFilter !== "0" && riskFilter !== "1") throw new Usage("--risk-filter deve ser 0 ou 1");
  const pnlChains = parsed.values.get("--pnl-chains");
  const frame = parsed.values.get("--pnl-timeframe");
  if (frame !== undefined && !/^[1-5]$/.test(frame)) throw new Usage("--pnl-timeframe deve ser de 1 a 5");
  const days = integer(parsed, "--dex-days");
  if (days !== undefined && (days < 1 || days > 365)) throw new Usage("--dex-days deve ser de 1 a 365");
  if (days !== undefined && !parsed.switches.has("--dex-history")) throw new Usage("--dex-days exige --dex-history");
  const tokens = (parsed.values.get("--pnl-tokens") ?? "")
    .split(",")
    .filter((item) => item !== "")
    .map((item) => {
      const colon = item.indexOf(":");
      const chainIndex = item.slice(0, colon);
      const tokenContractAddress = item.slice(colon + 1);
      if (colon < 1 || !/^\d{1,12}$/.test(chainIndex) || tokenContractAddress === "" || tokenContractAddress.length > 128) throw new Usage("--pnl-tokens usa rede:contrato, separados por virgula");
      return { chainIndex, tokenContractAddress };
    });
  const analysisOptions = tokens.length > 0 || parsed.switches.has("--dex-history") || parsed.switches.has("--support-check");
  if (pnlChains === undefined && analysisOptions) throw new Usage("--pnl-tokens, --dex-history e --support-check exigem --pnl-chains");
  return {
    address,
    chains: chains.split(",").filter((item) => item !== ""),
    ...(riskFilter === undefined ? {} : { excludeRiskToken: riskFilter }),
    totalValue: !parsed.switches.has("--no-total"),
    ...(parsed.switches.has("--history") ? { history: {} } : {}),
    ...(pnlChains === undefined
      ? {}
      : {
          addressAnalysis: {
            chains: pnlChains.split(",").filter((item) => item !== ""),
            ...(frame === undefined ? {} : { timeFrame: frame as TimeFrameCode }),
            ...(tokens.length > 0 ? { tokens } : {}),
            ...(parsed.switches.has("--dex-history") ? { dexHistory: { days: days ?? 30 } } : {}),
            ...(parsed.switches.has("--support-check") ? { supportCheck: true } : {}),
          },
        }),
    market: parsed.switches.has("--no-market") ? false : { price: true, decimals: true, liquidity: parsed.switches.has("--liquidity"), risk: parsed.switches.has("--risk") },
    riskProbe: parsed.switches.has("--probe"),
  };
}

function configOf(parsed: Parsed) {
  const maxCalls = integer(parsed, "--max-calls");
  const maxPages = integer(parsed, "--max-pages");
  const deadlineMs = integer(parsed, "--deadline-ms");
  const perTokenCap = integer(parsed, "--per-token-cap");
  const cacheTtlMs = integer(parsed, "--cache-ttl-ms");
  const maxAgeMs = integer(parsed, "--max-age-ms");
  return {
    ...(maxAgeMs === undefined ? {} : { maxAgeMs }),
    ...(maxCalls === undefined ? {} : { maxCalls }),
    ...(maxPages === undefined ? {} : { maxPagesPerEndpoint: maxPages }),
    ...(deadlineMs === undefined ? {} : { deadlineMs }),
    ...(perTokenCap === undefined ? {} : { perTokenCap }),
    ...(cacheTtlMs === undefined ? {} : { cacheTtlMs }),
    ...(parsed.switches.has("--force") ? { forceRefresh: true } : {}),
  };
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv[0] === "--help" || argv[0] === "-h") {
    for (const line of HELP) io.out(line);
    return 0;
  }
  let parsed: Parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.err(error instanceof Usage ? error.message : "argumentos invalidos");
    io.err(HELP[0]!);
    return 2;
  }
  if (parsed.command === "help" || parsed.switches.has("--help")) {
    for (const line of HELP) io.out(line);
    return 0;
  }

  if (parsed.command === "demo") {
    const scenarios = runDemo();
    io.out(FIXTURE_LABEL);
    let failed = 0;
    for (const scenario of scenarios) {
      io.out("");
      io.out(`[${scenario.acceptance}] ${scenario.title}`);
      for (const expectation of scenario.expectations) {
        io.out(`  ${expectation.holds ? "confere" : "FALHOU"}: ${expectation.claim}`);
        if (!expectation.holds) failed += 1;
      }
      if (parsed.switches.has("--json")) io.out(JSON.stringify(scenario.evidence));
      else for (const line of summarizeEvidence(scenario.evidence)) io.out(`    ${line}`);
    }
    io.out("");
    io.out(failed === 0 ? "Todas as expectativas da demonstracao conferem. Nenhuma chamada de rede foi feita." : `${failed} expectativas falharam.`);
    return failed === 0 ? 0 : 1;
  }

  if (parsed.command === "plan" || parsed.command === "refresh") {
    let request: CollectRequest;
    let config: ReturnType<typeof configOf>;
    try {
      request = requestOf(parsed);
      config = configOf(parsed);
    } catch (error) {
      io.err(error instanceof Usage ? error.message : "argumentos invalidos");
      return 2;
    }

    if (parsed.command === "plan") {
      io.out("Plano de uma atualizacao sob demanda (pior caso, sem rede, sem credenciais):");
      for (const item of planCalls(request, config)) io.out(`  ${item.what}: ate ${item.max} chamada(s)`);
      io.out(`Teto de chamadas ${config.maxCalls ?? DEFAULTS.maxCalls}, paginas por endpoint ${config.maxPagesPerEndpoint ?? DEFAULTS.maxPagesPerEndpoint}, prazo ${config.deadlineMs ?? DEFAULTS.deadlineMs} ms, timeout por chamada 10000 ms, 1 requisicao por segundo.`);
      io.out("Saldo, historico e portfolio: tier, limite de taxa e codigos de erro nao declarados pelas paginas da OKX (custo de cota desconhecido). Mercado: tier do registro do projeto, abaixo.");
      for (const endpoint of WALLET_ENDPOINTS) io.out(`  ${endpoint.id}: ${endpoint.method} ${endpoint.path} (${endpoint.docUrl})`);
      for (const id of ["market.price.price", "market.token.basic-info", "market.token.top-liquidity", "market.token.advanced-info"] as const) {
        const spec = marketEndpoint(id);
        io.out(`  ${id}: ${spec.method} ${spec.path} (tier ${spec.tier}, ${spec.docUrl})`);
      }
      io.out(`Conta (apenas o hash): ${accountRefOf(request.address).sha256.slice(0, 16)}`);
      return 0;
    }

    for (const required of ["--live", "--credentials-from-env", "--allow-network"]) {
      if (!parsed.switches.has(required)) {
        io.err(`refresh recusado: falta ${required}. Nada foi enviado. Use plan para ver as chamadas, ou demo para a demonstracao offline.`);
        return 2;
      }
    }
    const missing = CREDENTIAL_ENV_NAMES.filter((name) => (io.env[name] ?? "") === "");
    if (missing.length > 0) {
      io.err(`refresh recusado: variaveis ausentes no ambiente do processo: ${missing.join(", ")}. Nenhuma chave foi criada e nada foi enviado.`);
      return 2;
    }
    io.err("Atencao: o endereco informado sera enviado a OKX nesta leitura. Somente leitura; nada e assinado, enviado ou movido.");
    try {
      const http = createOnchainosHttp({
        fetch: io.fetch,
        now: io.now,
        sleep: io.sleep,
        credentials: { apiKey: io.env.OKX_WEB3_API_KEY!, secretKey: io.env.OKX_WEB3_API_SECRET!, passphrase: io.env.OKX_WEB3_API_PASSPHRASE! },
        allowNetwork: true,
      });
      const storeDir = parsed.values.get("--store-dir");
      const store = storeDir === undefined ? undefined : createEvidenceStore({ fs: io.fs, dir: storeDir });
      const outcome = await collectWalletEvidence({ http, now: io.now, ...(store === undefined ? {} : { store }) }, request, { origin: "okx_web3_api", ...config });
      const json = parsed.switches.has("--json");
      // With --json stdout carries ONLY the evidence; every note goes to stderr.
      const note = json ? io.err : io.out;
      if (json) io.out(JSON.stringify(outcome.evidence));
      else for (const line of summarizeEvidence(outcome.evidence)) io.out(line);
      if (outcome.cache.hit) note(`Servido do cache local (idade ${outcome.cache.ageMs} ms); nenhuma chamada foi feita.`);
      if (outcome.quota !== null) note(`Requisicoes HTTP enviadas, com retentativas: ${outcome.quota.totalAttempts} (o teto de chamadas conta chamadas logicas); custo de cota ${outcome.quota.costKnown ? "conhecido" : "desconhecido"}.`);
      if (outcome.persisted !== null && !outcome.persisted.written) note(`Gravacao recusada: ${outcome.persisted.error ?? outcome.persisted.finding?.code ?? "motivo desconhecido"}`);
      const effectiveMaxAge = config.maxAgeMs ?? DEFAULTS.maxAgeMs;
      if ((config.cacheTtlMs ?? 0) > effectiveMaxAge) note(`TTL do cache limitado ao limite de frescor (${effectiveMaxAge} ms); use --max-age-ms para ampliar os dois.`);
      // Exit 0 only for an evidence that read everything it set out to read and could be written when asked to be.
      return isCleanCollection(outcome.evidence) && outcome.persisted?.error === undefined ? 0 : 1;
    } catch (error) {
      if (error instanceof CollectorUsageError || error instanceof OnchainosError) io.err(`falha de uso: ${error instanceof OnchainosError ? error.kind : error.message}`);
      else io.err("falha inesperada; nenhum detalhe e exibido para nao vazar dados");
      return 2;
    }
  }

  io.err("comando desconhecido (o valor nao e exibido)");
  for (const line of HELP) io.err(line);
  return 2;
}
