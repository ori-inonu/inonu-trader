import { endpoint } from "../onchainos/endpoints.ts";
import { createDefiReadClient, type DefiChainRow, type DefiDetail } from "../onchainos/defi-read.ts";
import { ERROR_KINDS, OnchainosError } from "../onchainos/errors.ts";
import type { OnchainosHttp, ReadMeta } from "../onchainos/http.ts";
import type { Read } from "../onchainos/read.ts";
import { createSignalsClient, type LeaderboardQuery, type LeaderboardRow } from "../onchainos/signals.ts";
import { LEADERBOARD_SORTS, LEADERBOARD_TIME_FRAMES, LEADERBOARD_WALLET_TYPES } from "../onchainos/signals.ts";
import { readChainIndex, readNumericId } from "../onchainos/values.ts";
import type { Capability, SourceEnvelope } from "./types.ts";

export interface RealExtensionsInput {
  correlationId: string;
  chainIndex: string;
  revision: number;
  enabledFamilies?: readonly ("defi" | "signals")[];
  config?: {
    defi?: { qualifiedChainIndexes: readonly string[]; ttlMs: number; investmentId?: string };
    signals?: { qualifiedChainIndexes: readonly string[]; ttlMs: number;
      leaderboardQuery: Pick<LeaderboardQuery, "timeFrame" | "sortBy" | "walletType"> };
  };
}

export interface ExtensionCapability extends Capability { method: "GET" | "POST" }
export interface RealExtensionsSample {
  correlationId: string;
  chainIndex: string;
  revision: number;
  envelopes: {
    defiChains: SourceEnvelope<DefiChainRow[]>;
    defiDetail: SourceEnvelope<DefiDetail>;
    leaderboard: SourceEnvelope<LeaderboardRow[]>;
  };
  capabilities: ExtensionCapability[];
}

const SPECS = {
  defiChains: endpoint("defi.product.supported-chains"),
  defiDetail: endpoint("defi.product.detail"),
  leaderboard: endpoint("market.leaderboard.list"),
  latest: endpoint("market.signal.list"),
} as const;
type EnvelopeKey = keyof RealExtensionsSample["envelopes"];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function validIdentity(input: RealExtensionsInput): boolean {
  return record(input) && onlyKeys(input, ["correlationId", "chainIndex", "revision", "enabledFamilies", "config"])
    && typeof input.chainIndex === "string" && readChainIndex(input.chainIndex) !== null
    && typeof input.correlationId === "string" && /^[a-zA-Z0-9._:-]{1,96}$/.test(input.correlationId)
    && Number.isSafeInteger(input.revision) && input.revision >= 0
    && (input.enabledFamilies === undefined || (Array.isArray(input.enabledFamilies)
      && input.enabledFamilies.every((family) => family === "defi" || family === "signals")));
}
function validConfig(family: "defi" | "signals", value: unknown): boolean {
  if (!record(value) || !onlyKeys(value, family === "defi"
    ? ["qualifiedChainIndexes", "ttlMs", "investmentId"] : ["qualifiedChainIndexes", "ttlMs", "leaderboardQuery"])) return false;
  if (typeof value.ttlMs !== "number" || !Number.isFinite(value.ttlMs) || value.ttlMs <= 0) return false;
  if (value.qualifiedChainIndexes !== undefined && (!Array.isArray(value.qualifiedChainIndexes)
    || value.qualifiedChainIndexes.some((chain) => typeof chain !== "string" || readChainIndex(chain) === null))) return false;
  if (family === "defi") return value.investmentId === undefined || readNumericId(value.investmentId) !== null;
  const query = value.leaderboardQuery;
  return record(query) && onlyKeys(query, ["timeFrame", "sortBy", "walletType"])
    && typeof query.timeFrame === "string" && Object.hasOwn(LEADERBOARD_TIME_FRAMES, query.timeFrame)
    && typeof query.sortBy === "string" && Object.hasOwn(LEADERBOARD_SORTS, query.sortBy)
    && (query.walletType === undefined || (typeof query.walletType === "string" && Object.hasOwn(LEADERBOARD_WALLET_TYPES, query.walletType)));
}

function snapshotInput(input: RealExtensionsInput): RealExtensionsInput {
  const snapshot = { ...input, enabledFamilies: input.enabledFamilies?.slice(),
    config: record(input.config) ? { ...input.config } : input.config };
  const defi = snapshot.config?.defi;
  if (validConfig("defi", defi) && Array.isArray(defi?.qualifiedChainIndexes)) {
    snapshot.config!.defi = { ...defi!, qualifiedChainIndexes: defi!.qualifiedChainIndexes.slice() };
  }
  const signals = snapshot.config?.signals;
  if (validConfig("signals", signals) && Array.isArray(signals?.qualifiedChainIndexes)) {
    snapshot.config!.signals = { ...signals!, qualifiedChainIndexes: signals!.qualifiedChainIndexes.slice(),
      leaderboardQuery: { ...signals!.leaderboardQuery } };
  }
  return snapshot;
}

function blocked<T>(input: RealExtensionsInput, key: EnvelopeKey, at: number, reason: string): SourceEnvelope<T> {
  return { status: "blocked", source: "onchainos-rest-v6", mode: "unverified", endpoint: SPECS[key].path,
    method: "GET", chainIndex: input.chainIndex, correlationId: input.correlationId,
    requestedAtMs: at, receivedAtMs: at, sourceAtMs: null, expiresAtMs: at,
    httpStatus: null, unit: null, error: reason, data: null };
}

function compatibleMeta(meta: ReadMeta, key: EnvelopeKey, ttlMs: number): boolean {
  return record(meta) && meta.source === "onchainos-rest-v6" && meta.endpoint === SPECS[key].path
    && meta.attempts === 1 && Number.isFinite(meta.requestedAtMs) && meta.requestedAtMs >= 0
    && Number.isFinite(meta.receivedAtMs) && meta.receivedAtMs >= meta.requestedAtMs
    && Number.isFinite(meta.receivedAtMs + ttlMs)
    && (meta.httpStatus === undefined || meta.httpStatus === null || httpStatus(meta.httpStatus) !== null);
}
function httpStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function capabilities(sample: RealExtensionsSample): ExtensionCapability[] {
  const rows = (["defiChains", "defiDetail", "leaderboard"] as const).map((key): ExtensionCapability => {
    const envelope = sample.envelopes[key];
    return { id: SPECS[key].id, family: key === "leaderboard" ? "signals" : "defi", chainIndex: sample.chainIndex,
      endpoint: SPECS[key].path, method: "GET", source: "onchainos-rest-v6", documented: true,
      implemented: true, integrated: true, exercisedReal: false, financiallyQualified: false,
      status: envelope.status, reason: envelope.error,
      nextRequirement: "independent-endpoint-chain-access-and-source-freshness-evidence" };
  });
  rows.push({ id: SPECS.latest.id, family: "signals", chainIndex: sample.chainIndex,
    endpoint: SPECS.latest.path, method: "POST", source: "onchainos-rest-v6", documented: true,
    implemented: true, integrated: false, exercisedReal: false, financiallyQualified: false,
    status: "blocked", reason: "latest-signals-post-excluded",
    nextRequirement: "separate-post-profile-budget-and-endpoint-chain-entitlement-qualification" });
  return rows;
}

/** Injected read adapter; transport receipts and qualified config provenance belong to the caller. */
export function createRealExtensions(options: { http: OnchainosHttp; now: () => number }) {
  const defi = createDefiReadClient(options.http);
  const signals = createSignalsClient(options.http);
  const transportReason = () => {
    if (options.http.info.ready !== true) return "web3-credentials-unavailable";
    if (options.http.info.source !== "onchainos-rest-v6") return "extension-source-incompatible";
    if (options.http.info.maxRetries !== 0) return "extension-retries-not-zero";
    return null;
  };
  async function capture<T>(input: RealExtensionsInput, key: EnvelopeKey, ttlMs: number,
    operation: () => Promise<Read<T>>, signal?: AbortSignal): Promise<SourceEnvelope<T>> {
    const startedAtMs = options.now();
    if (signal?.aborted) return blocked(input, key, startedAtMs, "extension-aborted");
    const unavailable = transportReason();
    if (unavailable !== null) return blocked(input, key, startedAtMs, unavailable);
    try {
      const result = await operation();
      if (signal?.aborted) return { ...blocked<T>(input, key, startedAtMs, "extension-aborted"), receivedAtMs: options.now() };
      if (!compatibleMeta(result.meta, key, ttlMs)) return {
        ...blocked<T>(input, key, startedAtMs, "extension-metadata-incompatible"), status: "error", receivedAtMs: options.now(),
      };
      return { ...blocked<T>(input, key, startedAtMs, "extension-read-pending"), status: "ready", error: null,
        requestedAtMs: result.meta.requestedAtMs, receivedAtMs: result.meta.receivedAtMs,
        expiresAtMs: result.meta.receivedAtMs + ttlMs, httpStatus: result.meta.httpStatus ?? null, data: result.value };
    } catch (error) {
      if (signal?.aborted) return { ...blocked<T>(input, key, startedAtMs, "extension-aborted"), receivedAtMs: options.now() };
      const typed = error instanceof OnchainosError && ERROR_KINDS.includes(error.kind);
      return { ...blocked<T>(input, key, startedAtMs, typed ? `onchainos-${error.kind}` : "onchainos-schema"),
        status: "error", receivedAtMs: options.now(), httpStatus: typed ? httpStatus(error.httpStatus) : null };
    }
  }
  return { async read(input: RealExtensionsInput, signal?: AbortSignal): Promise<RealExtensionsSample> {
    const at = options.now();
    const invalidInput = !validIdentity(input);
    if (invalidInput) input = { correlationId: "invalid-correlation", chainIndex: "", revision: -1 };
    else input = snapshotInput(input);
    const reason = (family: "defi" | "signals") => {
      if (invalidInput) return "invalid-extension-input";
      if (signal?.aborted) return "extension-aborted";
      if (!input.enabledFamilies?.includes(family)) return "extension-disabled";
      if (input.config !== undefined && (!record(input.config) || !onlyKeys(input.config, ["defi", "signals"]))) return "invalid-extension-config";
      const config = input.config?.[family];
      if (!config) return "extension-config-required";
      if (!validConfig(family, config)) return "invalid-extension-config";
      const unavailable = transportReason();
      if (unavailable !== null) return unavailable;
      if (!config.qualifiedChainIndexes?.includes(input.chainIndex)) return "extension-chain-unqualified";
      return "extension-read-pending";
    };
    const sample: RealExtensionsSample = { correlationId: input.correlationId, chainIndex: input.chainIndex,
      revision: input.revision, envelopes: {
        defiChains: blocked(input, "defiChains", at, reason("defi")),
        defiDetail: blocked(input, "defiDetail", at, reason("defi")),
        leaderboard: blocked(input, "leaderboard", at, reason("signals")),
      }, capabilities: [] };
    if (reason("defi") === "extension-read-pending") {
      const config = input.config!.defi!;
      sample.envelopes.defiChains = await capture(input, "defiChains", config.ttlMs, () => defi.supportedChains(), signal);
      sample.envelopes.defiDetail = blocked(input, "defiDetail", options.now(), signal?.aborted ? "extension-aborted" : "defi-catalog-unavailable");
      if (sample.envelopes.defiChains.status === "ready") {
        const supported = sample.envelopes.defiChains.data!.some((row) => row.chainIndex === input.chainIndex);
        sample.envelopes.defiDetail = blocked(input, "defiDetail", options.now(), supported ? "defi-investment-id-required" : "defi-chain-not-listed");
        if (supported && config.investmentId !== undefined) {
          sample.envelopes.defiDetail = await capture(input, "defiDetail", config.ttlMs, () => defi.detail(config.investmentId!), signal);
          if (sample.envelopes.defiDetail.status === "ready" && sample.envelopes.defiDetail.data!.chainIndex !== input.chainIndex) {
            sample.envelopes.defiDetail = { ...sample.envelopes.defiDetail, status: "blocked",
              error: "defi-detail-identity-mismatch", data: null };
          }
        }
      }
    }
    const signalsReason = reason("signals");
    if (signalsReason === "extension-read-pending") {
      const config = input.config!.signals!;
      sample.envelopes.leaderboard = await capture(input, "leaderboard", config.ttlMs,
        () => signals.leaderboard({ chainIndex: input.chainIndex, timeFrame: config.leaderboardQuery.timeFrame,
          sortBy: config.leaderboardQuery.sortBy, walletType: config.leaderboardQuery.walletType }), signal);
    } else {
      sample.envelopes.leaderboard = blocked(input, "leaderboard", options.now(), signalsReason);
    }
    sample.capabilities = capabilities(sample);
    return sample;
  } };
}
