import { resolve } from "node:path";
import {
  createOkxReadOnlyClient,
  getInternalOkxApiErrorKind,
  isOkxReadOnlyClient,
  type OkxApiCredentials,
  type OkxReadOnlyClient,
  type TokenIdentity,
} from "../src/okx-api";
import {
  normalizeOpportunity,
  screenOpportunity,
  validateOpportunityPolicy,
  type AddressComparison,
  type NormalizedOpportunity,
  type OpportunityPolicy,
  type OpportunityScreening,
} from "../src/okx-opportunities";
import { normalizeTokenAddress } from "../src/okx-market/token-identity";

const MAX_SCAN_TOKENS = 30;
const STAGES = ["NEW", "MIGRATING", "MIGRATED"] as const;
type MemePumpStage = (typeof STAGES)[number];

export interface SyntheticTokenFixture {
  identity: TokenIdentity;
  addressComparison: AddressComparison;
  price: string | number;
  priceAgeMs: number;
  holders: unknown;
  tokenTags?: unknown;
  top10HoldPercent?: unknown;
  riskControlLevel?: unknown;
  pools: unknown[];
  honeypotAssessment?: "detected" | "not_detected" | null;
}

export interface SyntheticScanFixture {
  source: "synthetic_fixture";
  policy: OpportunityPolicy;
  tokens: SyntheticTokenFixture[];
}

export interface OkxScanDependencies {
  loadFixture(): Promise<unknown>;
  readPolicy(path: string): Promise<unknown>;
  createClient(credentials: OkxApiCredentials): OkxReadOnlyClient;
  now(): Date;
}

export interface OkxScanItem {
  opportunity: NormalizedOpportunity;
  screening: OpportunityScreening;
}

export interface OkxScanReport {
  mode: "synthetic_fixture" | "read_only_scan";
  dataOrigin: "synthetic_only" | "unknown";
  implementationProvenance: "synthetic_fixture" | "okx_api_factory" | "unknown";
  externalAccessObserved: false;
  observedAt: string;
  clientMethodInvocations: number;
  apiCostUsd: null;
  quotaStatus: "unknown";
  policy: OpportunityPolicy;
  items: OkxScanItem[];
}

type ScanOptions =
  | { mode: "offline" }
  | {
    mode: "live";
    chainIndex: string;
    stage: MemePumpStage;
    addressComparison: AddressComparison;
    limit: number;
    policyPath: string;
  };

const defaultDependencies: OkxScanDependencies = {
  async loadFixture() {
    return await Bun.file(new URL("./fixtures/okx-scan-synthetic.json", import.meta.url)).json();
  },
  async readPolicy(path) {
    return await Bun.file(resolve(path)).json();
  },
  createClient(credentials) {
    return createOkxReadOnlyClient({ credentials, allowLiveRequests: true });
  },
  now() {
    return new Date();
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenIdentity(value: unknown): value is TokenIdentity {
  return isRecord(value) && typeof value.chainIndex === "string" && /^\d{1,12}$/.test(value.chainIndex) &&
    typeof value.tokenContractAddress === "string" && value.tokenContractAddress.length > 0 &&
    value.tokenContractAddress.trim() === value.tokenContractAddress;
}

function parseArguments(args: string[]): ScanOptions {
  if (args.length === 0) return { mode: "offline" };
  let live = false;
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--live") {
      if (live) throw new Error("Invalid live scan arguments");
      live = true;
      continue;
    }
    if (!["--chain-index", "--stage", "--address-comparison", "--limit", "--policy"].includes(argument) || values.has(argument))
      throw new Error("Invalid live scan arguments");
    const value = args[index + 1];
    if (!value || value.startsWith("--") || value.trim() !== value) throw new Error("Invalid live scan arguments");
    values.set(argument, value);
    index++;
  }
  if (!live) throw new Error("Invalid live scan arguments");

  const chainIndex = values.get("--chain-index");
  const stage = values.get("--stage");
  const addressComparison = values.get("--address-comparison");
  const rawLimit = values.get("--limit");
  const policyPath = values.get("--policy");
  if (!chainIndex || !/^\d{1,12}$/.test(chainIndex) || !stage || !STAGES.includes(stage as MemePumpStage) ||
    (addressComparison !== "case-sensitive" && addressComparison !== "case-insensitive") ||
    !rawLimit || !/^[1-9]\d*$/.test(rawLimit) || !policyPath)
    throw new Error("Live mode requires explicit network, stage, address comparison, limit and policy");
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SCAN_TOKENS)
    throw new Error("Invalid live scan arguments");
  return { mode: "live", chainIndex, stage: stage as MemePumpStage, addressComparison, limit, policyPath };
}

function validDate(date: Date): number {
  const timestamp = date instanceof Date ? date.getTime() : Number.NaN;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("Invalid scan clock");
  return timestamp;
}

function readFixture(value: unknown): SyntheticScanFixture {
  if (!isRecord(value) || value.source !== "synthetic_fixture" || !Array.isArray(value.tokens) || value.tokens.length > MAX_SCAN_TOKENS)
    throw new Error("Invalid synthetic fixture");
  validateOpportunityPolicy(value.policy);
  for (const item of value.tokens) {
    if (!isRecord(item) || !isTokenIdentity(item.identity) ||
      (item.addressComparison !== "case-sensitive" && item.addressComparison !== "case-insensitive") ||
      !Number.isSafeInteger(item.priceAgeMs) || (item.priceAgeMs as number) < 0 ||
      (typeof item.price !== "string" && typeof item.price !== "number") || !Array.isArray(item.pools))
      throw new Error("Invalid synthetic fixture");
  }
  return value as unknown as SyntheticScanFixture;
}

function normalizeFixtureItem(
  item: SyntheticTokenFixture,
  observedAtMs: number,
  policy: OpportunityPolicy,
): OkxScanItem {
  const opportunity = normalizeOpportunity({
    identity: item.identity,
    addressComparison: item.addressComparison,
    observedAtMs,
    priceInfo: {
      ...item.identity,
      price: item.price,
      time: String(observedAtMs - item.priceAgeMs),
      holders: item.holders,
    },
    advancedInfo: {
      ...item.identity,
      tokenTags: item.tokenTags,
      top10HoldPercent: item.top10HoldPercent,
      riskControlLevel: item.riskControlLevel,
    },
    pools: item.pools,
    honeypotAssessment: item.honeypotAssessment,
  });
  return { opportunity, screening: screenOpportunity(opportunity, policy) };
}

function tokenKey(token: TokenIdentity): string {
  return JSON.stringify([token.chainIndex, normalizeTokenAddress(token.chainIndex, token.tokenContractAddress)]);
}

function readCredentials(environment: Record<string, string | undefined>): OkxApiCredentials {
  const credentials = {
    apiKey: environment.OKX_API_KEY,
    secretKey: environment.OKX_SECRET_KEY,
    passphrase: environment.OKX_API_PASSPHRASE,
  };
  if (Object.values(credentials).some((value) =>
    typeof value !== "string" || value.length === 0 || value.trim() !== value,
  )) throw new Error("Live mode requires complete OKX API credentials");
  return credentials as OkxApiCredentials;
}

async function loadPolicy(path: string, dependencies: OkxScanDependencies): Promise<OpportunityPolicy> {
  let value: unknown;
  try {
    value = await dependencies.readPolicy(path);
    validateOpportunityPolicy(value);
  } catch {
    throw new Error("Policy file is missing or invalid");
  }
  return value;
}

async function runOffline(dependencies: OkxScanDependencies): Promise<OkxScanReport> {
  const fixture = readFixture(await dependencies.loadFixture());
  const observedAtMs = validDate(dependencies.now());
  if (fixture.tokens.some((item) => item.priceAgeMs > observedAtMs)) throw new Error("Invalid synthetic fixture");
  return {
    mode: "synthetic_fixture",
    dataOrigin: "synthetic_only",
    implementationProvenance: "synthetic_fixture",
    externalAccessObserved: false,
    observedAt: new Date(observedAtMs).toISOString(),
    clientMethodInvocations: 0,
    apiCostUsd: null,
    quotaStatus: "unknown",
    policy: fixture.policy,
    items: fixture.tokens.map((item) => normalizeFixtureItem(item, observedAtMs, fixture.policy)),
  };
}

async function runLive(
  options: Extract<ScanOptions, { mode: "live" }>,
  environment: Record<string, string | undefined>,
  dependencies: OkxScanDependencies,
): Promise<OkxScanReport> {
  const policy = await loadPolicy(options.policyPath, dependencies);
  const credentials = readCredentials(environment);
  const client = dependencies.createClient(credentials);
  let clientMethodInvocations = 0;

  clientMethodInvocations++;
  const tokenList = await client.getMemePumpTokenList({
    chainIndex: options.chainIndex,
    stage: options.stage,
    limit: options.limit,
  });
  if (!Array.isArray(tokenList.items) || tokenList.items.length > options.limit ||
    tokenList.items.some((token) => !isTokenIdentity(token) || token.chainIndex !== options.chainIndex))
    throw new Error("OKX token response exceeded the requested identity or limit");
  const tokens = tokenList.items.map(({ chainIndex, tokenContractAddress }) => ({ chainIndex, tokenContractAddress }));
  const requestedKeys = new Set(tokens.map(tokenKey));
  if (requestedKeys.size !== tokens.length) throw new Error("OKX token response contained duplicate identities");

  let prices: Awaited<ReturnType<OkxReadOnlyClient["getTokenPriceInfo"]>> = [];
  if (tokens.length > 0) {
    clientMethodInvocations++;
    prices = await client.getTokenPriceInfo(tokens);
  }
  const pricesByIdentity = new Map<string, (typeof prices)[number]>();
  for (const price of prices) {
    const key = tokenKey(price);
    if (!requestedKeys.has(key) || pricesByIdentity.has(key))
      throw new Error("OKX price response contained an unexpected or duplicate identity");
    pricesByIdentity.set(key, price);
  }

  const enriched: { identity: TokenIdentity; priceInfo?: unknown; advancedInfo: unknown; pools: unknown }[] = [];
  for (const token of tokens) {
    clientMethodInvocations++;
    const advancedInfo = await client.getTokenAdvancedInfo(token);
    clientMethodInvocations++;
    const pools = await client.getTokenTopLiquidity(token);
    const priceInfo = pricesByIdentity.get(tokenKey(token));
    enriched.push({ identity: token, ...(priceInfo ? { priceInfo } : {}), advancedInfo, pools });
  }

  const observedAtMs = validDate(dependencies.now());
  const items = enriched.map(({ identity, priceInfo, advancedInfo, pools }) => {
    const opportunity = normalizeOpportunity({
      identity,
      addressComparison: options.addressComparison,
      observedAtMs,
      ...(priceInfo ? { priceInfo } : {}),
      advancedInfo,
      pools,
    });
    return { opportunity, screening: screenOpportunity(opportunity, policy) };
  });
  return {
    mode: "read_only_scan",
    dataOrigin: "unknown",
    implementationProvenance: isOkxReadOnlyClient(client) ? "okx_api_factory" : "unknown",
    externalAccessObserved: false,
    observedAt: new Date(observedAtMs).toISOString(),
    clientMethodInvocations,
    apiCostUsd: null,
    quotaStatus: "unknown",
    policy,
    items,
  };
}

export async function runOkxScan(
  args: string[],
  environment: Record<string, string | undefined>,
  dependencies: OkxScanDependencies = defaultDependencies,
): Promise<OkxScanReport> {
  const options = parseArguments(args);
  return options.mode === "offline"
    ? runOffline(dependencies)
    : runLive(options, environment, dependencies);
}

if (import.meta.main) {
  runOkxScan(process.argv.slice(2), process.env)
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error: unknown) => {
      const kind = getInternalOkxApiErrorKind(error);
      const message = kind ? `OKX read failed (${kind})` : "OKX scan failed";
      process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
      process.exitCode = 1;
    });
}
