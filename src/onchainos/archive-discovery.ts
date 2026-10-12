/** Bounded, metadata-only OKX archive discovery. No listed archive is fetched. */
import { OnchainosError } from "./errors.ts";
import { MAX_EPOCH_MS } from "./values.ts";
import { createTransport, TokenBucket, QuotaCounters, type FetchLike, type ReadMeta, type HttpInfo, type CallEvent } from "./http.ts";

export const ARCHIVE_ENDPOINT = Object.freeze({ path: "/api/v5/public/market-data-history", tier: "public" as const });
export type ArchiveModule = "1" | "2" | "3" | "4" | "5" | "6" | "11";
export type ArchiveInstType = "SPOT" | "FUTURES" | "SWAP" | "OPTION";
export type ArchiveAggregation = "daily" | "monthly";
export interface ArchiveQuery {
  readonly module: ArchiveModule;
  readonly instType: ArchiveInstType;
  readonly instIdList?: string;
  readonly instFamilyList?: string;
  readonly dateAggrType: ArchiveAggregation;
  readonly begin: string;
  readonly end: string;
}
export interface ArchiveDatePolicy {
  readonly timezone: "UTC+0" | "UTC+8";
  readonly offsetMinutes: 0 | 480;
  readonly aggregation: ArchiveAggregation;
  readonly beginDate: string;
  readonly endDate: string;
  readonly inclusiveBuckets: number;
  readonly endDayOnly: boolean;
}
export interface NormalizedArchiveRequest {
  readonly query: ArchiveQuery;
  readonly selectors: readonly string[];
  readonly selectorField: "instIdList" | "instFamilyList";
  readonly datePolicy: ArchiveDatePolicy;
}
const MODULES: readonly string[] = ["1", "2", "3", "4", "5", "6", "11"];
const INST_TYPES: readonly string[] = ["SPOT", "FUTURES", "SWAP", "OPTION"];
const DAY_MS = 86_400_000;
type Failure = (detail: string) => never;
const requestFail: Failure = (detail) => { throw new OnchainosError("invalid_request", detail, { endpoint: ARCHIVE_ENDPOINT.path }); };
const schemaFail: Failure = (detail) => { throw new OnchainosError("schema", detail, { endpoint: ARCHIVE_ENDPOINT.path }); };

function record(value: unknown, allowed: readonly string[], required: readonly string[], fail: Failure): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("expected a plain object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail("unexpected object prototype");
  const keys = Reflect.ownKeys(value);
  if (keys.length > allowed.length) return fail("unexpected fields");
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.includes(key)) return fail("unexpected field");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return fail("accessor fields are not accepted");
  }
  if (required.some((key) => !Object.hasOwn(value, key))) return fail("missing required field");
  return value as Record<string, unknown>;
}
function epoch(value: unknown, fail: Failure): number {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,12})$/.test(value)) return fail("expected decimal Unix milliseconds");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_EPOCH_MS) return fail("milliseconds outside adapter bound 1970-2100");
  return parsed;
}
function boundedList(value: unknown, maximum: number, fail: Failure): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail("expected a plain list");
  if (value.length > maximum) return fail("list exceeds adapter bound");
  if (Reflect.ownKeys(value).length !== value.length + 1) return fail("list must be dense without extra fields");
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return fail("list must contain plain values");
  }
  return value;
}
function dateKey(ms: number, offset: number, aggregation: ArchiveAggregation): string {
  return new Date(ms + offset * 60_000).toISOString().slice(0, aggregation === "daily" ? 10 : 7);
}
function bucketIndex(ms: number, offset: number, aggregation: ArchiveAggregation): number {
  if (aggregation === "daily") return Math.floor((ms + offset * 60_000) / DAY_MS);
  const shifted = new Date(ms + offset * 60_000);
  return shifted.getUTCFullYear() * 12 + shifted.getUTCMonth();
}
function identity(value: unknown, fail: Failure): string {
  if (typeof value !== "string" || value.length > 80 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value)) return fail("invalid instrument identity");
  return value;
}

/** Pure request boundary. Documented comma-separated strings or bounded lists are accepted. */
export function normalizeArchiveRequest(input: unknown): NormalizedArchiveRequest {
  const raw = record(input, ["module", "instType", "instIdList", "instFamilyList", "dateAggrType", "begin", "end"], ["module", "instType", "dateAggrType", "begin", "end"], requestFail);
  if (typeof raw.module !== "string" || !MODULES.includes(raw.module)) return requestFail("unsupported archive module");
  if (typeof raw.instType !== "string" || !INST_TYPES.includes(raw.instType)) return requestFail("unsupported instrument type");
  if (raw.dateAggrType !== "daily" && raw.dateAggrType !== "monthly") return requestFail("unsupported aggregation");
  const module = raw.module as ArchiveModule;
  const instType = raw.instType as ArchiveInstType;
  const aggregation = raw.dateAggrType;
  const selectorField = instType === "SPOT" ? "instIdList" : "instFamilyList";
  const otherField = selectorField === "instIdList" ? "instFamilyList" : "instIdList";
  if (Object.hasOwn(raw, otherField) || !Object.hasOwn(raw, selectorField)) return requestFail("exactly the applicable selector list is required");
  const rawList = raw[selectorField];
  let list: unknown[];
  if (typeof rawList === "string") {
    if (rawList.length > 809) return requestFail("selector list too long");
    list = rawList.split(",");
  } else if (Array.isArray(rawList)) list = boundedList(rawList, 10, requestFail);
  else return requestFail("selector list must be text or a plain list");
  if (list.length < 1 || list.length > 10) return requestFail("selector list requires 1-10 entries");
  const selectors = list.map((value) => identity(value, requestFail));
  if (new Set(selectors).size !== selectors.length) return requestFail("duplicate selector");
  if (selectors.includes("ANY") && (selectors.length !== 1 || aggregation !== "daily" || !["1", "2", "3", "11"].includes(module))) return requestFail("ANY is restricted to one daily selector for modules 1,2,3,11");
  if (module === "3" && (instType === "SPOT" || (aggregation === "daily" && selectors[0] !== "ANY"))) return requestFail("funding adapter requires non-SPOT and daily ANY");
  if (module === "6" && aggregation === "monthly") return requestFail("module6 does not support monthly");
  if (module === "6" && instType === "OPTION" && selectors.length !== 1) return requestFail("module6 OPTION requires one family");
  const begin = epoch(raw.begin, requestFail);
  const end = epoch(raw.end, requestFail);
  if (begin > end) return requestFail("begin must not exceed end");
  const offsetMinutes = ["4", "5", "6"].includes(module) ? 0 : 480;
  const requestedBuckets = bucketIndex(end, offsetMinutes, aggregation) - bucketIndex(begin, offsetMinutes, aggregation) + 1;
  if (requestedBuckets > 10) return requestFail("at most ten inclusive date buckets are permitted");
  const endDayOnly = module === "6" && instType === "OPTION";
  const beginDate = dateKey(endDayOnly ? end : begin, offsetMinutes, aggregation);
  const endDate = dateKey(end, offsetMinutes, aggregation);
  if (module === "5" && beginDate < (aggregation === "daily" ? "2025-11-01" : "2025-11")) return requestFail("module5 adapter starts at 2025-11-01");
  const query: ArchiveQuery = Object.freeze({ module, instType, [selectorField]: selectors.join(","), dateAggrType: aggregation, begin: raw.begin as string, end: raw.end as string });
  return Object.freeze({ query, selectors: Object.freeze(selectors), selectorField, datePolicy: Object.freeze({ timezone: offsetMinutes === 0 ? "UTC+0" : "UTC+8", offsetMinutes, aggregation, beginDate, endDate, inclusiveBuckets: endDayOnly ? 1 : requestedBuckets, endDayOnly }) });
}

export interface ArchiveGroup {
  readonly instId: string;
  readonly instFamily: string;
  readonly instType?: ArchiveInstType;
  readonly dateRangeStartMs: number;
  readonly dateRangeEndMs: number;
  readonly groupSizeMB: string;
  readonly listedFileCount: number;
}
export interface ArchiveFile {
  readonly instId: string;
  readonly instFamily: string;
  readonly filename: string;
  readonly url: string;
  readonly sizeMB: string;
  readonly dateTimestampMs: number;
  readonly dateTimestampText: string;
  readonly dateKey: string;
  readonly timestampAlias: "dateTs" | "dataTs" | "both";
}
export interface ArchiveListing {
  readonly dateAggrType: ArchiveAggregation;
  readonly providerTimestampMs: number;
  readonly totalSizeMB: string;
  readonly groups: readonly ArchiveGroup[];
  readonly files: readonly ArchiveFile[];
}
function sizeText(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return schemaFail("expected bounded nonnegative decimal MB text");
  return value;
}
function archiveUrl(value: unknown, filename: unknown): { url: string; filename: string } {
  if (typeof filename !== "string" || filename.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9_-]*\.zip$/.test(filename)) return schemaFail("invalid archive filename");
  if (typeof value !== "string" || value.length > 2048 || /[\x00-\x20\x7f%\\?#]/.test(value)) return schemaFail("invalid archive URL");
  let parsed: URL;
  try { parsed = new URL(value); } catch { return schemaFail("invalid archive URL"); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "static.okx.com" || parsed.username !== "" || parsed.password !== "" || parsed.port !== "" || parsed.href !== value) return schemaFail("archive URL must be canonical public HTTPS");
  const prefix = "/cdn/okex/traderecords/";
  if (!parsed.pathname.startsWith(prefix)) return schemaFail("archive URL outside public archive prefix");
  const segments = parsed.pathname.slice(prefix.length).split("/");
  if (segments.at(-1) !== filename || segments.slice(0, -1).some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) return schemaFail("unsafe archive path or filename mismatch");
  return { url: value, filename };
}

/** Parses transport envelope data only; the date/data alias is retained explicitly. */
export function parseArchiveResponse(data: unknown, request: NormalizedArchiveRequest): ArchiveListing {
  const normalized = normalizeArchiveRequest(request.query);
  const policy = normalized.datePolicy;
  const rows = boundedList(data, 1, schemaFail);
  if (rows.length !== 1) return schemaFail("expected exactly one archive response row");
  const row = record(rows[0], ["dateAggrType", "details", "totalSizeMB", "ts"], ["dateAggrType", "details", "totalSizeMB", "ts"], schemaFail);
  if (row.dateAggrType !== normalized.query.dateAggrType) return schemaFail("response aggregation does not match request");
  const providerTimestampMs = epoch(row.ts, schemaFail);
  const totalSizeMB = sizeText(row.totalSizeMB);
  const details = boundedList(row.details, 100, schemaFail);
  const validatedGroups: { raw: Record<string, unknown>; files: unknown[] }[] = [];
  let count = 0;
  for (const entry of details) {
    const raw = record(entry, ["dateRangeStart", "dateRangeEnd", "instId", "instFamily", "instType", "groupSizeMB", "groupDetails"], ["dateRangeStart", "dateRangeEnd", "instId", "instFamily", "groupSizeMB", "groupDetails"], schemaFail);
    const files = boundedList(raw.groupDetails, 2000, schemaFail);
    count += files.length;
    if (count > 2000) return schemaFail("response exceeds two thousand listed files");
    validatedGroups.push({ raw, files });
  }
  const groups: ArchiveGroup[] = [];
  const files: ArchiveFile[] = [];
  const seenGroups = new Set<string>();
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();
  for (const entry of validatedGroups) {
    const raw = entry.raw;
    const isSpot = normalized.query.instType === "SPOT";
    const selected = identity(isSpot ? raw.instId : raw.instFamily, schemaFail);
    if (selected === "ANY" || (isSpot ? raw.instFamily : raw.instId) !== "" || (normalized.selectors[0] !== "ANY" && !normalized.selectors.includes(selected))) return schemaFail("response identity outside requested selectors");
    if (Object.hasOwn(raw, "instType") && raw.instType !== normalized.query.instType) return schemaFail("response instrument type does not match request");
    if (seenGroups.has(selected)) return schemaFail("duplicate archive group");
    seenGroups.add(selected);
    const start = epoch(raw.dateRangeStart, schemaFail);
    const end = epoch(raw.dateRangeEnd, schemaFail);
    const startKey = dateKey(start, policy.offsetMinutes, policy.aggregation);
    const endKey = dateKey(end, policy.offsetMinutes, policy.aggregation);
    if (start > end || startKey < policy.beginDate || endKey > policy.endDate) return schemaFail("group date range outside effective query");
    const instId = raw.instId as string;
    const instFamily = raw.instFamily as string;
    groups.push(Object.freeze({ instId, instFamily, ...(Object.hasOwn(raw, "instType") ? { instType: raw.instType as ArchiveInstType } : {}), dateRangeStartMs: start, dateRangeEndMs: end, groupSizeMB: sizeText(raw.groupSizeMB), listedFileCount: entry.files.length }));
    for (const value of entry.files) {
      const file = record(value, ["dateTs", "dataTs", "filename", "sizeMB", "url"], ["filename", "sizeMB", "url"], schemaFail);
      const hasDate = Object.hasOwn(file, "dateTs");
      const hasData = Object.hasOwn(file, "dataTs");
      if (!hasDate && !hasData) return schemaFail("missing documented timestamp alias");
      const dateTimestampMs = epoch(hasDate ? file.dateTs : file.dataTs, schemaFail);
      if (hasDate && hasData && (epoch(file.dataTs, schemaFail) !== dateTimestampMs || file.dateTs !== file.dataTs)) return schemaFail("conflicting timestamp aliases");
      const key = dateKey(dateTimestampMs, policy.offsetMinutes, policy.aggregation);
      if (key < startKey || key > endKey || key < policy.beginDate || key > policy.endDate) return schemaFail("file date outside group or effective query");
      const location = archiveUrl(file.url, file.filename);
      if (seenUrls.has(location.url) || seenNames.has(location.filename)) return schemaFail("duplicate listed archive file");
      seenUrls.add(location.url);
      seenNames.add(location.filename);
      files.push(Object.freeze({ instId, instFamily, ...location, sizeMB: sizeText(file.sizeMB), dateTimestampMs, dateTimestampText: (hasDate ? file.dateTs : file.dataTs) as string, dateKey: key, timestampAlias: hasDate && hasData ? "both" : hasDate ? "dateTs" : "dataTs" }));
    }
  }
  return Object.freeze({ dateAggrType: normalized.query.dateAggrType, providerTimestampMs, totalSizeMB, groups: Object.freeze(groups), files: Object.freeze(files) });
}

export const ARCHIVE_SCHEMA_VERSION = "okx_archive_discovery_v1" as const;
export const ARCHIVE_QUALIFICATION = Object.freeze({ historicalCoverage: "unknown", rights: "unknown", fileAccess: "unknown", fileSchema: "unknown", executionAvailability: "unknown", strategyQualified: false, financiallyAuthorized: false } as const);
export interface ArchiveDiscoveryResult extends ArchiveListing {
  readonly schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  readonly request: NormalizedArchiveRequest;
  readonly meta: ReadMeta;
  readonly qualification: typeof ARCHIVE_QUALIFICATION;
}
export interface ArchiveDiscoveryOptions {
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly allowNetwork?: boolean;
  readonly onCall?: (event: CallEvent) => void;
}
export interface ArchiveDiscoveryClient {
  readonly info: HttpInfo;
  readonly quota: QuotaCounters;
  discover(input: unknown): Promise<ArchiveDiscoveryResult>;
}

/** One fixed public metadata endpoint, injected ports, offline unless explicitly enabled. */
export function createArchiveDiscoveryClient(options: ArchiveDiscoveryOptions): ArchiveDiscoveryClient {
  const checked = record(options, ["fetch", "now", "sleep", "allowNetwork", "onCall"], ["fetch", "now", "sleep"], requestFail);
  if (typeof checked.fetch !== "function" || typeof checked.now !== "function" || typeof checked.sleep !== "function" || (Object.hasOwn(checked, "allowNetwork") && typeof checked.allowNetwork !== "boolean") || (Object.hasOwn(checked, "onCall") && checked.onCall !== undefined && typeof checked.onCall !== "function")) return requestFail("invalid injected discovery ports");
  const ready = options.allowNetwork === true;
  const quota = new QuotaCounters();
  const info: HttpInfo = Object.freeze({ source: "okx-public-v5", origin: "https://www.okx.com", ready, requestsPerSecond: 1, burst: 1, timeoutMs: 10_000, maxRetries: 0 });
  const transport = createTransport({ source: info.source, origin: info.origin, pathPattern: /^\/api\/v5\/public\/market-data-history$/, fetch: options.fetch, now: options.now, sleep: options.sleep, limiter: new TokenBucket({ ratePerSecond: 1, burst: 1, now: options.now, sleep: options.sleep }), quota, canSend: () => ready, offlineDetail: "archive discovery is offline unless allowNetwork is true", secrets: [], timeoutMs: 10_000, maxRetries: 0, backoffBaseMs: 0, backoffMaxMs: 0, maxResponseChars: 1_000_000, onCall: options.onCall });
  return Object.freeze({ info, quota, async discover(input: unknown): Promise<ArchiveDiscoveryResult> {
    const request = normalizeArchiveRequest(input);
    const reply = await transport.request("GET", ARCHIVE_ENDPOINT, { query: { ...request.query } });
    const listing = parseArchiveResponse(reply.data, request);
    return Object.freeze({ schemaVersion: ARCHIVE_SCHEMA_VERSION, request, meta: Object.freeze({ ...reply.meta }), ...listing, qualification: ARCHIVE_QUALIFICATION });
  } });
}
