import { canonicalJson } from "./canonical.ts";
import { isMultipleOf } from "./contract.ts";
import { abs, cmp, parseDecimal, ppmOf, rat, ratInt, sign, type Rat } from "./decimal.ts";
import {
  DerivativesError,
  type AccessState, type Book, type CarryRoles, type DerivativesErrorCode, type DirectionalRoles, type Evaluation, type FeePair,
  type FundingHistoryEntry, type FundingSnapshot, type Level, type MarkSnapshot, type ParsedInput, type PerpInstrument, type PositionSide,
  type Policy, type Role, type Snapshot, type SourceClaim, type SpotInstrument,
} from "./types.ts";

// Strict validation of the input file (snapshot + evaluation). Exact keys at every object level,
// strict decimal text for every price, size and rate (JSON numbers are rejected), ordered and
// bounded books and history. Errors carry a schema path built only from schema names and array
// indexes, never from input content. Optional unknown-able facts (fees, maintenance margin rate,
// access) default to UNKNOWN (null), never to zero.

export const SCHEMA = "okx_derivatives_input_v1";

export const DEFAULT_POLICY: Policy = Object.freeze({
  maxLeverage: 3,
  minLiquidationDistancePpm: 250000,
  minNetOnNotionalPpm: 1000,
  maxSnapshotAgeMs: 60000,
  maxBookSkewMs: 5000,
  minFundingObservations: 3,
  adverseBasisPpm: 2000,
  stressMovesPpm: Object.freeze([100000, 250000]) as readonly number[],
  stressGapPpm: 500000,
});

const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const MAX_BOOK_LEVELS = 400;
const MAX_HISTORY_ENTRIES = 1000;
const MAX_LEVERAGE_VALUES = 12;
const MAX_QUANTITY = ratInt(10n ** 15n);
const MAX_FUNDING_RATE = rat(1n, 100n);
const MAX_FEE = rat(1n, 100n);
const MAX_MAINTENANCE_RATE = rat(1n, 2n);

const INSTRUMENT_ID = /^[A-Z0-9]{1,20}(?:-[A-Z0-9]{1,20}){1,3}$/;
const CURRENCY = /^[A-Z0-9]{1,20}$/;
const STATE = /^[a-z_]{1,32}$/;

function codeFor(path: string): DerivativesErrorCode {
  if (path === "snapshot" || path.startsWith("snapshot.")) return "invalid_snapshot";
  if (path === "evaluation" || path.startsWith("evaluation.")) return "invalid_evaluation";
  return "invalid_input";
}

function fail(path: string): never {
  throw new DerivativesError(codeFor(path), path);
}

function join(parent: string, key: string): string {
  return parent === "" ? key : `${parent}.${key}`;
}

function at(parent: string, index: number): string {
  return `${parent}[${index}]`;
}

/** Plain object with exactly the allowed own enumerable data keys; returns a prototype-less copy. */
function exact(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) fail(path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) fail(path);
    if (descriptor.value === undefined) fail(join(path, key));
    result[key] = descriptor.value;
  }
  for (const key of required) {
    if (!(key in result)) fail(join(path, key));
  }
  return result;
}

function list(value: unknown, path: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length > max || value.length < min) fail(path);
  if (Object.keys(value).length !== value.length) fail(path);
  return value;
}

function text(value: unknown, path: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(path);
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) fail(path);
  return value as T;
}

function safeInt(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(path);
  return value;
}

function timestamp(value: unknown, path: string): number {
  return safeInt(value, path, 0, MAX_TIMESTAMP_MS);
}

function positive(value: unknown, path: string): Rat {
  const parsed = parseDecimal(value);
  if (parsed === null || sign(parsed) <= 0 || cmp(parsed, MAX_QUANTITY) > 0) fail(path);
  return parsed;
}

function fundingRate(value: unknown, path: string): Rat {
  const parsed = parseDecimal(value);
  if (parsed === null || cmp(abs(parsed), MAX_FUNDING_RATE) > 0) fail(path);
  return parsed;
}

/** Unknown-able trading fee cost: null or absent is UNKNOWN. Rounded up to ppm. */
function feeCostPpm(value: unknown, path: string, allowRebate: boolean): bigint | null {
  if (value === undefined || value === null) return null;
  const parsed = parseDecimal(value);
  if (parsed === null || cmp(abs(parsed), MAX_FEE) > 0 || (!allowRebate && sign(parsed) < 0)) fail(path);
  return ppmOf(parsed, "ceil");
}

function parseFeePair(value: unknown, path: string, allowTakerRebate = false): FeePair {
  if (value === undefined) return { makerCostPpm: null, takerCostPpm: null };
  const pair = exact(value, path, [], ["makerCost", "takerCost"]);
  return {
    makerCostPpm: feeCostPpm(pair.makerCost, join(path, "makerCost"), true),
    takerCostPpm: feeCostPpm(pair.takerCost, join(path, "takerCost"), allowTakerRebate),
  };
}

function parseSpot(value: unknown, path: string): SpotInstrument {
  const o = exact(value, path, ["instId", "baseCcy", "quoteCcy", "tickSz", "lotSz", "minSz", "state"]);
  return {
    instId: text(o.instId, join(path, "instId"), INSTRUMENT_ID),
    baseCcy: text(o.baseCcy, join(path, "baseCcy"), CURRENCY),
    quoteCcy: text(o.quoteCcy, join(path, "quoteCcy"), CURRENCY),
    tickSz: positive(o.tickSz, join(path, "tickSz")),
    lotSz: positive(o.lotSz, join(path, "lotSz")),
    minSz: positive(o.minSz, join(path, "minSz")),
    state: text(o.state, join(path, "state"), STATE),
  };
}

function parsePerp(value: unknown, path: string): PerpInstrument {
  const o = exact(value, path, ["instId", "ctType", "ctVal", "ctMult", "ctValCcy", "settleCcy", "tickSz", "lotSz", "minSz", "maxLeverage", "state"]);
  return {
    instId: text(o.instId, join(path, "instId"), INSTRUMENT_ID),
    ctType: oneOf(o.ctType, join(path, "ctType"), ["linear", "inverse"] as const),
    ctVal: positive(o.ctVal, join(path, "ctVal")),
    ctMult: positive(o.ctMult, join(path, "ctMult")),
    ctValCcy: text(o.ctValCcy, join(path, "ctValCcy"), CURRENCY),
    settleCcy: text(o.settleCcy, join(path, "settleCcy"), CURRENCY),
    tickSz: positive(o.tickSz, join(path, "tickSz")),
    lotSz: positive(o.lotSz, join(path, "lotSz")),
    minSz: positive(o.minSz, join(path, "minSz")),
    maxLeverage: safeInt(o.maxLeverage, join(path, "maxLeverage"), 1, 1000),
    state: text(o.state, join(path, "state"), STATE),
  };
}

function parseLevels(value: unknown, path: string, order: "descending" | "ascending", tick: Rat): Level[] {
  const rows = list(value, path, MAX_BOOK_LEVELS);
  const levels: Level[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const rowPath = at(path, index);
    const row = rows[index];
    if (!Array.isArray(row) || row.length !== 2 || Object.keys(row).length !== 2) fail(rowPath);
    const price = positive(row[0], rowPath);
    const size = positive(row[1], rowPath);
    if (!isMultipleOf(price, tick)) fail(rowPath);
    const previous = levels[index - 1];
    if (previous !== undefined) {
      const direction = cmp(price, previous.price);
      if (order === "descending" ? direction >= 0 : direction <= 0) fail(rowPath);
    }
    levels.push({ price, size });
  }
  return levels;
}

function parseBook(value: unknown, path: string, tick: Rat): Book {
  const o = exact(value, path, ["tsMs", "bids", "asks"]);
  return {
    tsMs: timestamp(o.tsMs, join(path, "tsMs")),
    bids: parseLevels(o.bids, join(path, "bids"), "descending", tick),
    asks: parseLevels(o.asks, join(path, "asks"), "ascending", tick),
  };
}

function parseMark(value: unknown, path: string): MarkSnapshot {
  const o = exact(value, path, ["tsMs", "markPx"]);
  return { tsMs: timestamp(o.tsMs, join(path, "tsMs")), markPx: positive(o.markPx, join(path, "markPx")) };
}

function parseFunding(value: unknown, path: string): FundingSnapshot {
  const o = exact(value, path, ["tsMs", "currentRate", "fundingTimeMs", "nextFundingTimeMs", "history"]);
  const tsMs = timestamp(o.tsMs, join(path, "tsMs"));
  const currentRate = fundingRate(o.currentRate, join(path, "currentRate"));
  const fundingTimeMs = timestamp(o.fundingTimeMs, join(path, "fundingTimeMs"));
  if (fundingTimeMs < tsMs) fail(join(path, "fundingTimeMs"));
  const nextFundingTimeMs = timestamp(o.nextFundingTimeMs, join(path, "nextFundingTimeMs"));
  const historyPath = join(path, "history");
  const rows = list(o.history, historyPath, MAX_HISTORY_ENTRIES);
  const history: FundingHistoryEntry[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const rowPath = at(historyPath, index);
    const row = exact(rows[index], rowPath, ["fundingTimeMs", "rate"]);
    const settledAtMs = timestamp(row.fundingTimeMs, join(rowPath, "fundingTimeMs"));
    const rate = fundingRate(row.rate, join(rowPath, "rate"));
    const previous = history[index - 1];
    // a settlement that happens after the capture cannot be known yet; history is strictly ascending
    if (settledAtMs > tsMs || (previous !== undefined && settledAtMs <= previous.fundingTimeMs)) fail(rowPath);
    history.push({ fundingTimeMs: settledAtMs, rate });
  }
  return { tsMs, currentRate, fundingTimeMs, nextFundingTimeMs, history };
}

function parseSnapshot(value: unknown, path: string): Snapshot {
  const o = exact(value, path, ["spot", "perp", "books", "mark", "funding"], ["fees", "maintenanceMarginRate", "access"]);
  const spot = parseSpot(o.spot, join(path, "spot"));
  const perp = parsePerp(o.perp, join(path, "perp"));
  const booksPath = join(path, "books");
  const books = exact(o.books, booksPath, ["spot", "perp"]);

  let fees: Snapshot["fees"] = { spot: { makerCostPpm: null, takerCostPpm: null }, perp: { makerCostPpm: null, takerCostPpm: null } };
  if (o.fees !== undefined) {
    const feesPath = join(path, "fees");
    const f = exact(o.fees, feesPath, [], ["spot", "perp"]);
    fees = { spot: parseFeePair(f.spot, join(feesPath, "spot")), perp: parseFeePair(f.perp, join(feesPath, "perp")) };
  }

  let maintenanceMarginRatePpm: bigint | null = null;
  if (o.maintenanceMarginRate !== undefined && o.maintenanceMarginRate !== null) {
    const mmrPath = join(path, "maintenanceMarginRate");
    const parsed = parseDecimal(o.maintenanceMarginRate);
    if (parsed === null || sign(parsed) <= 0 || cmp(parsed, MAX_MAINTENANCE_RATE) > 0) fail(mmrPath);
    maintenanceMarginRatePpm = ppmOf(parsed, "ceil");
  }

  let access: AccessState = "unknown";
  if (o.access !== undefined) {
    const accessPath = join(path, "access");
    const a = exact(o.access, accessPath, [], ["derivatives"]);
    if (a.derivatives !== undefined) access = oneOf(a.derivatives, join(accessPath, "derivatives"), ["unknown", "operator_confirmed", "operator_denied"] as const);
  }

  return {
    spot,
    perp,
    books: { spot: parseBook(books.spot, join(booksPath, "spot"), spot.tickSz), perp: parseBook(books.perp, join(booksPath, "perp"), perp.tickSz) },
    mark: parseMark(o.mark, join(path, "mark")),
    funding: parseFunding(o.funding, join(path, "funding")),
    fees,
    maintenanceMarginRatePpm,
    access,
  };
}

function parseRoles<K extends string>(value: unknown, path: string, keys: readonly K[]): Record<K, Role> {
  const roles = {} as Record<K, Role>;
  if (value === undefined) {
    for (const key of keys) roles[key] = "taker";
    return roles;
  }
  const o = exact(value, path, keys);
  for (const key of keys) roles[key] = oneOf(o[key], join(path, key), ["maker", "taker"] as const);
  return roles;
}

function parsePolicy(value: unknown, path: string): Policy {
  const base = { ...DEFAULT_POLICY, stressMovesPpm: [...DEFAULT_POLICY.stressMovesPpm] };
  if (value === undefined || value === null) return base;
  const o = exact(value, path, [], [
    "maxLeverage", "minLiquidationDistancePpm", "minNetOnNotionalPpm", "maxSnapshotAgeMs", "maxBookSkewMs",
    "minFundingObservations", "adverseBasisPpm", "stressMovesPpm", "stressGapPpm",
  ]);
  const pick = (key: keyof Policy, min: number, max: number): number =>
    o[key] === undefined ? (base[key] as number) : safeInt(o[key], join(path, key), min, max);

  let stressMovesPpm = base.stressMovesPpm;
  if (o.stressMovesPpm !== undefined) {
    const movesPath = join(path, "stressMovesPpm");
    const rows = list(o.stressMovesPpm, movesPath, 6, 1);
    stressMovesPpm = [];
    for (const row of rows) {
      const move = safeInt(row, movesPath, 1, 999_999);
      const previous = stressMovesPpm[stressMovesPpm.length - 1];
      if (previous !== undefined && move <= previous) fail(movesPath);
      stressMovesPpm.push(move);
    }
  }
  const stressGapPpm = pick("stressGapPpm", 1, 999_999);
  const largestMove = stressMovesPpm[stressMovesPpm.length - 1] as number;
  if (stressGapPpm <= largestMove) fail(join(path, o.stressGapPpm !== undefined ? "stressGapPpm" : "stressMovesPpm"));

  return {
    maxLeverage: pick("maxLeverage", 1, 125),
    minLiquidationDistancePpm: pick("minLiquidationDistancePpm", 0, 1_000_000),
    minNetOnNotionalPpm: pick("minNetOnNotionalPpm", 0, 1_000_000),
    maxSnapshotAgeMs: pick("maxSnapshotAgeMs", 1, 3_600_000),
    maxBookSkewMs: pick("maxBookSkewMs", 0, 3_600_000),
    minFundingObservations: pick("minFundingObservations", 1, 1000),
    adverseBasisPpm: pick("adverseBasisPpm", 0, 1_000_000),
    stressMovesPpm,
    stressGapPpm,
  };
}

function parseEvaluation(value: unknown, path: string): Evaluation {
  const o = exact(value, path, ["carry", "leverages", "holdingSettlements"], ["directional", "policy"]);

  const carryPath = join(path, "carry");
  const carry = exact(o.carry, carryPath, ["contracts"], ["roles"]);
  const carryRoles = parseRoles(carry.roles, join(carryPath, "roles"), ["spotOpen", "perpOpen", "spotClose", "perpClose"] as const);

  let directional: Evaluation["directional"] = null;
  if (o.directional !== undefined && o.directional !== null) {
    const directionalPath = join(path, "directional");
    const d = exact(o.directional, directionalPath, ["side", "contracts"], ["roles"]);
    const side: PositionSide = oneOf(d.side, join(directionalPath, "side"), ["long", "short"] as const);
    directional = {
      side,
      contracts: positive(d.contracts, join(directionalPath, "contracts")),
      roles: parseRoles(d.roles, join(directionalPath, "roles"), ["open", "close"] as const),
    };
  }

  const leveragesPath = join(path, "leverages");
  const leverages: number[] = [];
  for (const entry of list(o.leverages, leveragesPath, MAX_LEVERAGE_VALUES, 1)) {
    const leverage = safeInt(entry, leveragesPath, 1, 125);
    const previous = leverages[leverages.length - 1];
    if (previous !== undefined && leverage <= previous) fail(leveragesPath);
    leverages.push(leverage);
  }

  return {
    carry: { contracts: positive(carry.contracts, join(carryPath, "contracts")), roles: carryRoles as CarryRoles },
    directional: directional === null ? null : { ...directional, roles: directional.roles as DirectionalRoles },
    leverages,
    holdingSettlements: safeInt(o.holdingSettlements, join(path, "holdingSettlements"), 1, 1000),
    policy: parsePolicy(o.policy, join(path, "policy")),
  };
}

/** Validates the raw input strictly and returns exact typed values. Throws DerivativesError. */
export function parseDerivativesInput(raw: unknown): ParsedInput {
  const root = exact(raw, "", ["schema", "sourceClaim", "snapshot", "evaluation"]);
  if (root.schema !== SCHEMA) fail("schema");
  const sourceClaim: SourceClaim = oneOf(root.sourceClaim, "sourceClaim", ["synthetic", "operator_claimed"] as const);
  const snapshot = parseSnapshot(root.snapshot, "snapshot");
  const evaluation = parseEvaluation(root.evaluation, "evaluation");
  return { sourceClaim, snapshot, evaluation, canonicalJson: canonicalJson(raw) };
}
