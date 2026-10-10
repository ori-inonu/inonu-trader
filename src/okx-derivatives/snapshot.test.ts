import { expect, test } from "bun:test";
import { parseDecimal, rat, ratInt } from "./decimal.ts";
import { syntheticInput } from "./fixture.ts";
import { DEFAULT_POLICY, parseDerivativesInput } from "./snapshot.ts";
import { DerivativesError, type DerivativesErrorCode } from "./types.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

function input(): Json {
  return syntheticInput() as Json;
}

function mutated(mutate: (value: Json) => void): Json {
  const value = input();
  mutate(value);
  return value;
}

function resolve(root: Json, path: string): Json {
  if (path === "") return root;
  let node: Json = root;
  for (const token of path.replace(/\[(\d+)\]/g, ".$1").split(".")) node = node[token];
  return node;
}

function codeFor(path: string): DerivativesErrorCode {
  if (path === "snapshot" || path.startsWith("snapshot.")) return "invalid_snapshot";
  if (path === "evaluation" || path.startsWith("evaluation.")) return "invalid_evaluation";
  return "invalid_input";
}

function fails(value: unknown, path: string) {
  try {
    parseDerivativesInput(value);
  } catch (error) {
    expect(error).toBeInstanceOf(DerivativesError);
    if (!(error instanceof DerivativesError)) throw error;
    expect(error.path).toBe(path);
    expect(error.code).toBe(codeFor(path));
    expect(error.message).toBe(path === "" ? error.code : `${error.code} ${path}`);
    return;
  }
  throw new Error(`expected a failure at "${path}"`);
}

function objectPaths(value: unknown, path = ""): string[] {
  const paths: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => paths.push(...objectPaths(item, `${path}[${index}]`)));
    return paths;
  }
  if (value !== null && typeof value === "object") {
    paths.push(path);
    for (const [key, child] of Object.entries(value)) paths.push(...objectPaths(child, path === "" ? key : `${path}.${key}`));
  }
  return paths;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test("OKX-DERIV D14: the synthetic input is valid and becomes exact typed values", () => {
  const parsed = parseDerivativesInput(input());
  expect(parsed.sourceClaim).toBe("synthetic");
  expect(parsed.snapshot.spot.instId).toBe("SYN-USDT");
  expect(parsed.snapshot.perp.ctVal).toEqual(rat(1n, 10n));
  expect(parsed.snapshot.perp.ctType).toBe("linear");
  expect(parsed.snapshot.perp.maxLeverage).toBe(50);
  expect(parsed.snapshot.books.perp.asks[0]).toEqual({ price: dec("1001.2"), size: ratInt(200) });
  expect(parsed.snapshot.books.spot.bids.map((level) => level.price)).toEqual([dec("999.9"), dec("999.8"), dec("999.7"), dec("999.5")]);
  expect(parsed.snapshot.mark.markPx).toEqual(dec("1001.1"));
  expect(parsed.snapshot.funding.history).toHaveLength(9);
  expect(parsed.snapshot.funding.nextFundingTimeMs - parsed.snapshot.funding.fundingTimeMs).toBe(8 * 3_600_000);
  expect(parsed.snapshot.fees).toEqual({ spot: { makerCostPpm: 500n, takerCostPpm: 700n }, perp: { makerCostPpm: 100n, takerCostPpm: 400n } });
  expect(parsed.snapshot.maintenanceMarginRatePpm).toBe(4000n);
  expect(parsed.snapshot.access).toBe("operator_confirmed");
  expect(parsed.evaluation.carry).toEqual({ contracts: ratInt(400), roles: { spotOpen: "taker", perpOpen: "taker", spotClose: "taker", perpClose: "taker" } });
  expect(parsed.evaluation.directional).toEqual({ side: "long", contracts: ratInt(400), roles: { open: "taker", close: "taker" } });
  expect(parsed.evaluation.leverages).toEqual([1, 2, 3, 5, 10, 20]);
  expect(parsed.evaluation.holdingSettlements).toBe(90);
  expect(parsed.evaluation.policy).toEqual(DEFAULT_POLICY);
});

test("OKX-DERIV D7: the default policy is the documented, configurable research default", () => {
  expect(DEFAULT_POLICY).toEqual({
    maxLeverage: 3,
    minLiquidationDistancePpm: 250000,
    minNetOnNotionalPpm: 1000,
    maxSnapshotAgeMs: 60000,
    maxBookSkewMs: 5000,
    minFundingObservations: 3,
    adverseBasisPpm: 2000,
    stressMovesPpm: [100000, 250000],
    stressGapPpm: 500000,
  });
});

test("OKX-DERIV D14: parsing is pure, accepts frozen input and returns detached values", () => {
  const frozen = deepFreeze(input());
  const parsedFrozen = parseDerivativesInput(frozen);
  const raw = input();
  const parsed = parseDerivativesInput(raw);
  raw.snapshot.perp.ctVal = "999";
  raw.evaluation.leverages.push(99);
  expect(parsed.snapshot.perp.ctVal).toEqual(rat(1n, 10n));
  expect(parsed.evaluation.leverages).toEqual([1, 2, 3, 5, 10, 20]);
  expect(parsedFrozen.canonicalJson).toBe(parseDerivativesInput(input()).canonicalJson);
  // canonical text ignores key order
  const reordered: Json = { evaluation: input().evaluation, snapshot: input().snapshot, sourceClaim: "synthetic", schema: "okx_derivatives_input_v1" };
  expect(parseDerivativesInput(reordered).canonicalJson).toBe(parsedFrozen.canonicalJson);
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.mark.markPx = "1001.2"; })).canonicalJson).not.toBe(parsedFrozen.canonicalJson);
});

test("OKX-DERIV D14: the top level requires the exact schema, a known source claim and no extra keys", () => {
  for (const notAnObject of [null, undefined, [], "text", 42, true]) fails(notAnObject, "");
  fails(mutated((value) => { value.schema = "okx_derivatives_input_v2"; }), "schema");
  fails(mutated((value) => { delete value.schema; }), "schema");
  fails(mutated((value) => { value.sourceClaim = "okx_authenticated"; }), "sourceClaim");
  fails(mutated((value) => { delete value.sourceClaim; }), "sourceClaim");
  fails(mutated((value) => { delete value.snapshot; }), "snapshot");
  fails(mutated((value) => { delete value.evaluation; }), "evaluation");
  expect(parseDerivativesInput(mutated((value) => { value.sourceClaim = "operator_claimed"; })).sourceClaim).toBe("operator_claimed");
});

test("OKX-DERIV D14: an unknown key is rejected at every object level and is reported at the parent path", () => {
  const paths = objectPaths(input());
  expect(paths.length).toBeGreaterThan(14);
  for (const path of paths) {
    const raw = input();
    resolve(raw, path)["PRIVATE_SENTINEL_KEY"] = 1;
    fails(raw, path);
  }
});

test("OKX-DERIV D14: every required key is enforced and only the documented unknown-able facts are optional", () => {
  const optional = new Set([
    "snapshot.fees", "snapshot.fees.spot", "snapshot.fees.perp",
    "snapshot.fees.spot.makerCost", "snapshot.fees.spot.takerCost", "snapshot.fees.perp.makerCost", "snapshot.fees.perp.takerCost",
    "snapshot.maintenanceMarginRate", "snapshot.access", "snapshot.access.derivatives", "evaluation.directional",
  ]);
  for (const path of objectPaths(input())) {
    for (const key of Object.keys(resolve(input(), path))) {
      const keyPath = path === "" ? key : `${path}.${key}`;
      const raw = input();
      delete resolve(raw, path)[key];
      if (optional.has(keyPath)) {
        expect(() => parseDerivativesInput(raw)).not.toThrow();
      } else {
        fails(raw, keyPath);
      }
    }
  }
});

test("OKX-DERIV D14: decimals must be strict strings; JSON numbers and loose grammar are rejected", () => {
  const fields = [
    "snapshot.spot.tickSz", "snapshot.spot.lotSz", "snapshot.spot.minSz",
    "snapshot.perp.ctVal", "snapshot.perp.ctMult", "snapshot.perp.tickSz", "snapshot.perp.lotSz", "snapshot.perp.minSz",
    "snapshot.mark.markPx", "snapshot.funding.currentRate", "snapshot.funding.history[0].rate", "evaluation.carry.contracts",
  ];
  for (const field of fields) {
    const parent = field.slice(0, field.lastIndexOf(".")).replace(/\.$/, "");
    const key = field.slice(field.lastIndexOf(".") + 1);
    for (const bad of [5, 0.1, "1e3", "+1", ".5", "1.", "01", "", " 1", "1 ", "NaN", null, {}, [], true]) {
      const raw = input();
      resolve(raw, parent)[key] = bad;
      fails(raw, field);
    }
  }
  for (const field of fields.filter((name) => !name.endsWith("Rate") && !name.endsWith(".rate"))) {
    const parent = field.slice(0, field.lastIndexOf("."));
    const key = field.slice(field.lastIndexOf(".") + 1);
    for (const bad of ["0", "-1", "-0.5"]) {
      const raw = input();
      resolve(raw, parent)[key] = bad;
      fails(raw, field);
    }
  }
});

test("OKX-DERIV D5: funding rates are signed fractions per period bounded at 1 percent", () => {
  const accepted = (rate: string) => parseDerivativesInput(mutated((value) => { value.snapshot.funding.currentRate = rate; value.snapshot.funding.history[0].rate = rate; }));
  expect(accepted("0.01").snapshot.funding.currentRate).toEqual(dec("0.01"));
  expect(accepted("-0.00005").snapshot.funding.history[0]?.rate).toEqual(dec("-0.00005"));
  expect(accepted("0").snapshot.funding.currentRate).toEqual(ratInt(0));
  for (const bad of ["0.011", "-0.011", "1", "-1", "5"]) {
    fails(mutated((value) => { value.snapshot.funding.currentRate = bad; }), "snapshot.funding.currentRate");
    fails(mutated((value) => { value.snapshot.funding.history[2].rate = bad; }), "snapshot.funding.history[2].rate");
  }
});

test("OKX-DERIV D14: books must be sorted best first, without duplicate prices, on the instrument tick", () => {
  fails(mutated((value) => { value.snapshot.books.perp.bids.reverse(); }), "snapshot.books.perp.bids[1]");
  fails(mutated((value) => { value.snapshot.books.spot.asks.reverse(); }), "snapshot.books.spot.asks[1]");
  fails(mutated((value) => { value.snapshot.books.spot.bids[1][0] = "999.9"; }), "snapshot.books.spot.bids[1]");
  fails(mutated((value) => { value.snapshot.books.perp.asks[2][0] = "1001.3"; }), "snapshot.books.perp.asks[2]");
  // a price off the tick (0.1) or a non-positive size or price
  fails(mutated((value) => { value.snapshot.books.spot.bids[0][0] = "999.95"; }), "snapshot.books.spot.bids[0]");
  fails(mutated((value) => { value.snapshot.books.spot.bids[0][1] = "0"; }), "snapshot.books.spot.bids[0]");
  fails(mutated((value) => { value.snapshot.books.spot.bids[0][1] = "-3"; }), "snapshot.books.spot.bids[0]");
  fails(mutated((value) => { value.snapshot.books.spot.asks[3][0] = "-1000.5"; }), "snapshot.books.spot.asks[3]");
  // each level is exactly [price, size] as text
  fails(mutated((value) => { value.snapshot.books.perp.bids[0] = ["1001.0", "200", "0", "3"]; }), "snapshot.books.perp.bids[0]");
  fails(mutated((value) => { value.snapshot.books.perp.bids[0] = ["1001.0"]; }), "snapshot.books.perp.bids[0]");
  fails(mutated((value) => { value.snapshot.books.perp.bids[0] = [1001, 200]; }), "snapshot.books.perp.bids[0]");
  fails(mutated((value) => { value.snapshot.books.perp.bids[0] = { price: "1001.0", size: "200" }; }), "snapshot.books.perp.bids[0]");
  fails(mutated((value) => { value.snapshot.books.perp.bids = "none"; }), "snapshot.books.perp.bids");
});

test("OKX-DERIV D14: book depth is bounded at 400 levels and empty sides are structurally valid", () => {
  const levels = (count: number, start: number, step: number) => Array.from({ length: count }, (_, index) => [String(start + index * step), "1"]);
  const ok = mutated((value) => { value.snapshot.books.spot.asks = levels(400, 1000, 1); value.snapshot.books.spot.bids = levels(400, 999, -1); });
  expect(parseDerivativesInput(ok).snapshot.books.spot.asks).toHaveLength(400);
  fails(mutated((value) => { value.snapshot.books.spot.asks = levels(401, 1000, 1); }), "snapshot.books.spot.asks");
  const empty = parseDerivativesInput(mutated((value) => { value.snapshot.books.perp.asks = []; value.snapshot.books.perp.bids = []; }));
  expect(empty.snapshot.books.perp.asks).toEqual([]);
});

test("OKX-DERIV D14: timestamps are safe non-negative integer milliseconds", () => {
  const stamps = ["snapshot.books.spot.tsMs", "snapshot.books.perp.tsMs", "snapshot.mark.tsMs", "snapshot.funding.tsMs", "snapshot.funding.fundingTimeMs", "snapshot.funding.nextFundingTimeMs"];
  for (const stamp of stamps) {
    const parent = stamp.slice(0, stamp.lastIndexOf("."));
    const key = stamp.slice(stamp.lastIndexOf(".") + 1);
    for (const bad of [-1, 1.5, "1800000000000", Number.NaN, Number.POSITIVE_INFINITY, 8_640_000_000_000_001, null]) {
      const raw = input();
      resolve(raw, parent)[key] = bad;
      fails(raw, stamp);
    }
  }
});

test("OKX-DERIV D5: funding history must be strictly ascending, already settled and before the pending settlement", () => {
  const swap = mutated((value) => {
    const history = value.snapshot.funding.history;
    [history[3], history[4]] = [history[4], history[3]];
  });
  fails(swap, "snapshot.funding.history[4]");
  fails(mutated((value) => { value.snapshot.funding.history[5].fundingTimeMs = value.snapshot.funding.history[4].fundingTimeMs; }), "snapshot.funding.history[5]");
  // a history entry that settles after the data was captured cannot be known yet
  fails(mutated((value) => { value.snapshot.funding.history[8].fundingTimeMs = value.snapshot.funding.tsMs + 1; }), "snapshot.funding.history[8]");
  // the pending settlement cannot precede the capture
  fails(mutated((value) => { value.snapshot.funding.fundingTimeMs = value.snapshot.funding.tsMs - 1; }), "snapshot.funding.fundingTimeMs");
  const long = mutated((value) => {
    value.snapshot.funding.history = Array.from({ length: 1001 }, (_, index) => ({ fundingTimeMs: index, rate: "0" }));
  });
  fails(long, "snapshot.funding.history");
  // an empty or short history is structurally valid: the evaluator reports it as unavailable
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.funding.history = []; })).snapshot.funding.history).toEqual([]);
  // an odd interval is also structurally valid: the evaluator reports funding:invalid_interval
  expect(() => parseDerivativesInput(mutated((value) => { value.snapshot.funding.nextFundingTimeMs = value.snapshot.funding.fundingTimeMs + 3 * 3_600_000; }))).not.toThrow();
});

test("OKX-DERIV D4: fees are optional unknown-able costs; absent or null never becomes zero", () => {
  const unknown = { spot: { makerCostPpm: null, takerCostPpm: null }, perp: { makerCostPpm: null, takerCostPpm: null } };
  expect(parseDerivativesInput(mutated((value) => { delete value.snapshot.fees; })).snapshot.fees).toEqual(unknown);
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.fees = {}; })).snapshot.fees).toEqual(unknown);
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.fees = { spot: {}, perp: {} }; })).snapshot.fees).toEqual(unknown);
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.fees = { spot: { takerCost: null, makerCost: null }, perp: { takerCost: null } }; })).snapshot.fees).toEqual(unknown);
  const partial = parseDerivativesInput(mutated((value) => { delete value.snapshot.fees.perp.makerCost; })).snapshot.fees;
  expect(partial.perp).toEqual({ makerCostPpm: null, takerCostPpm: 400n });
  expect(partial.spot).toEqual({ makerCostPpm: 500n, takerCostPpm: 700n });
});

test("OKX-DERIV D4: fee costs round up to ppm, allow maker rebates and reject implausible or mis-signed values", () => {
  const fee = (path: [string, string], text: unknown) => mutated((value) => { value.snapshot.fees[path[0]][path[1]] = text; });
  expect(parseDerivativesInput(fee(["perp", "takerCost"], "0.0000004")).snapshot.fees.perp.takerCostPpm).toBe(1n);
  expect(parseDerivativesInput(fee(["perp", "makerCost"], "-0.0002")).snapshot.fees.perp.makerCostPpm).toBe(-200n);
  expect(parseDerivativesInput(fee(["perp", "makerCost"], "-0.0000005")).snapshot.fees.perp.makerCostPpm).toBe(0n);
  expect(parseDerivativesInput(fee(["spot", "takerCost"], "0.01")).snapshot.fees.spot.takerCostPpm).toBe(10000n);
  expect(parseDerivativesInput(fee(["spot", "makerCost"], "0")).snapshot.fees.spot.makerCostPpm).toBe(0n);
  // a taker cannot be a rebate: the OKX API sign convention pasted unconverted ends up here
  fails(fee(["perp", "takerCost"], "-0.0005"), "snapshot.fees.perp.takerCost");
  fails(fee(["spot", "takerCost"], "-0.0001"), "snapshot.fees.spot.takerCost");
  for (const bad of ["0.011", "-0.011", "1", "x", 0.0004, 4, true, {}]) {
    fails(fee(["perp", "makerCost"], bad), "snapshot.fees.perp.makerCost");
  }
  fails(mutated((value) => { value.snapshot.fees.perp.extra = "0.1"; }), "snapshot.fees.perp");
  fails(mutated((value) => { value.snapshot.fees = []; }), "snapshot.fees");
});

test("OKX-DERIV D8: the maintenance margin rate is optional, positive, at most 50 percent and rounded up to ppm", () => {
  expect(parseDerivativesInput(mutated((value) => { delete value.snapshot.maintenanceMarginRate; })).snapshot.maintenanceMarginRatePpm).toBeNull();
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.maintenanceMarginRate = null; })).snapshot.maintenanceMarginRatePpm).toBeNull();
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.maintenanceMarginRate = "0.5"; })).snapshot.maintenanceMarginRatePpm).toBe(500000n);
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.maintenanceMarginRate = "0.0040001"; })).snapshot.maintenanceMarginRatePpm).toBe(4001n);
  for (const bad of ["0", "0.51", "1", "-0.004", "0.4%", 0.004, 4000, true]) {
    fails(mutated((value) => { value.snapshot.maintenanceMarginRate = bad; }), "snapshot.maintenanceMarginRate");
  }
});

test("OKX-DERIV D14: access defaults to unknown and accepts only the three documented states", () => {
  expect(parseDerivativesInput(mutated((value) => { delete value.snapshot.access; })).snapshot.access).toBe("unknown");
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.access = {}; })).snapshot.access).toBe("unknown");
  for (const state of ["unknown", "operator_confirmed", "operator_denied"] as const) {
    expect(parseDerivativesInput(mutated((value) => { value.snapshot.access = { derivatives: state }; })).snapshot.access).toBe(state);
  }
  for (const bad of ["confirmed", "OPERATOR_CONFIRMED", true, null, 1]) {
    fails(mutated((value) => { value.snapshot.access = { derivatives: bad }; }), "snapshot.access.derivatives");
  }
});

test("OKX-DERIV D2: instrument fields are validated; an inverse contract parses but is reported unavailable later", () => {
  expect(parseDerivativesInput(mutated((value) => { value.snapshot.perp.ctType = "inverse"; })).snapshot.perp.ctType).toBe("inverse");
  fails(mutated((value) => { value.snapshot.perp.ctType = "quanto"; }), "snapshot.perp.ctType");
  for (const bad of [0, -1, 1.5, 1001, "50", null]) fails(mutated((value) => { value.snapshot.perp.maxLeverage = bad; }), "snapshot.perp.maxLeverage");
  for (const bad of ["Live", "", "live!", 1, null, "x".repeat(33)]) fails(mutated((value) => { value.snapshot.perp.state = bad; }), "snapshot.perp.state");
  for (const bad of ["syn-usdt", "", "SYN USDT", "SYN-USDT-SWAP-EXTRA-MORE", 7]) fails(mutated((value) => { value.snapshot.spot.instId = bad; }), "snapshot.spot.instId");
  for (const bad of ["syn", "", "SYN-X", "S".repeat(21), 5]) {
    fails(mutated((value) => { value.snapshot.perp.ctValCcy = bad; }), "snapshot.perp.ctValCcy");
    fails(mutated((value) => { value.snapshot.perp.settleCcy = bad; }), "snapshot.perp.settleCcy");
    fails(mutated((value) => { value.snapshot.spot.baseCcy = bad; }), "snapshot.spot.baseCcy");
    fails(mutated((value) => { value.snapshot.spot.quoteCcy = bad; }), "snapshot.spot.quoteCcy");
  }
});

test("OKX-DERIV D7: evaluation requires bounded, ordered leverages, a positive holding horizon and a positive size", () => {
  const accepted = (mutate: (value: Json) => void) => parseDerivativesInput(mutated(mutate)).evaluation;
  expect(accepted((value) => { value.evaluation.leverages = [1]; }).leverages).toEqual([1]);
  expect(accepted((value) => { value.evaluation.leverages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 125]; }).leverages).toHaveLength(12);
  for (const bad of [[], [3, 2], [2, 2], [0, 1], [1, 126], [1.5], ["3"], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], "1,2", null]) {
    fails(mutated((value) => { value.evaluation.leverages = bad; }), "evaluation.leverages");
  }
  expect(accepted((value) => { value.evaluation.holdingSettlements = 1000; }).holdingSettlements).toBe(1000);
  for (const bad of [0, -1, 1001, 1.5, "90", null]) fails(mutated((value) => { value.evaluation.holdingSettlements = bad; }), "evaluation.holdingSettlements");
  fails(mutated((value) => { value.evaluation.carry.contracts = "0"; }), "evaluation.carry.contracts");
  fails(mutated((value) => { value.evaluation.carry.contracts = 400; }), "evaluation.carry.contracts");
});

test("OKX-DERIV D3: execution roles are explicit maker or taker per leg and default to taker", () => {
  const withRoles = parseDerivativesInput(mutated((value) => {
    value.evaluation.carry.roles = { spotOpen: "maker", perpOpen: "taker", spotClose: "maker", perpClose: "taker" };
    value.evaluation.directional.roles = { open: "maker", close: "taker" };
  })).evaluation;
  expect(withRoles.carry.roles).toEqual({ spotOpen: "maker", perpOpen: "taker", spotClose: "maker", perpClose: "taker" });
  expect(withRoles.directional?.roles).toEqual({ open: "maker", close: "taker" });
  fails(mutated((value) => { value.evaluation.carry.roles = { spotOpen: "maker" }; }), "evaluation.carry.roles.perpOpen");
  fails(mutated((value) => { value.evaluation.carry.roles = { spotOpen: "market", perpOpen: "taker", spotClose: "taker", perpClose: "taker" }; }), "evaluation.carry.roles.spotOpen");
  fails(mutated((value) => { value.evaluation.directional.roles = { open: "taker", close: "mid" }; }), "evaluation.directional.roles.close");
});

test("OKX-DERIV D13: the directional section is optional and its side is explicit", () => {
  expect(parseDerivativesInput(mutated((value) => { delete value.evaluation.directional; })).evaluation.directional).toBeNull();
  expect(parseDerivativesInput(mutated((value) => { value.evaluation.directional = null; })).evaluation.directional).toBeNull();
  expect(parseDerivativesInput(mutated((value) => { value.evaluation.directional.side = "short"; })).evaluation.directional?.side).toBe("short");
  for (const bad of ["LONG", "buy", "", null, 1]) fails(mutated((value) => { value.evaluation.directional.side = bad; }), "evaluation.directional.side");
  fails(mutated((value) => { value.evaluation.directional.contracts = "-1"; }), "evaluation.directional.contracts");
});

test("OKX-DERIV D11: policy keys are optional overrides with bounded integer ranges", () => {
  const policyOf = (policy: unknown) => parseDerivativesInput(mutated((value) => { value.evaluation.policy = policy; })).evaluation.policy;
  expect(policyOf({})).toEqual(DEFAULT_POLICY);
  expect(policyOf(null)).toEqual(DEFAULT_POLICY);
  expect(policyOf({ maxLeverage: 5, stressGapPpm: 600000 })).toEqual({ ...DEFAULT_POLICY, maxLeverage: 5, stressGapPpm: 600000 });
  expect(policyOf({ stressMovesPpm: [50000, 100000, 200000], stressGapPpm: 300000 }).stressMovesPpm).toEqual([50000, 100000, 200000]);
  expect(policyOf({ minLiquidationDistancePpm: 0, minNetOnNotionalPpm: 0, maxBookSkewMs: 0, adverseBasisPpm: 0 }).minLiquidationDistancePpm).toBe(0);
  const ranges: Array<[string, unknown[]]> = [
    ["maxLeverage", [0, 126, 1.5, "3", null]],
    ["minLiquidationDistancePpm", [-1, 1000001, 0.5, "250000"]],
    ["minNetOnNotionalPpm", [-1, 1000001, 0.5]],
    ["maxSnapshotAgeMs", [0, 3600001, 1.5]],
    ["maxBookSkewMs", [-1, 3600001, 1.5]],
    ["minFundingObservations", [0, 1001, 1.5]],
    ["adverseBasisPpm", [-1, 1000001, 0.5]],
    ["stressGapPpm", [0, 1000000, 1.5, 250000]],
    ["stressMovesPpm", [[], [0], [1000000], [250000, 100000], [100000, 100000], [1, 2, 3, 4, 5, 6, 7], [1.5], "100000", [100000, 600000]]],
  ];
  for (const [key, values] of ranges) {
    for (const bad of values) fails(mutated((value) => { value.evaluation.policy = { [key]: bad }; }), `evaluation.policy.${key}`);
  }
  fails(mutated((value) => { value.evaluation.policy = { maxLeverages: 1 }; }), "evaluation.policy");
  fails(mutated((value) => { value.evaluation.policy = []; }), "evaluation.policy");
});

test("OKX-DERIV D14: hostile objects are rejected: own proto keys, non-plain prototypes and accessors", () => {
  const withProto = JSON.parse('{"__proto__": {"polluted": true}, "schema": "okx_derivatives_input_v1"}') as unknown;
  fails(withProto, "");
  expect(({} as Json).polluted).toBeUndefined();

  class Impostor { schema = "okx_derivatives_input_v1"; }
  fails(new Impostor(), "");
  fails(Object.create({ inherited: 1 }), "");
  fails(new Map(), "");

  const accessor = input();
  Object.defineProperty(accessor, "snapshot", { get: () => syntheticInput().snapshot, enumerable: true });
  fails(accessor, "");

  const undefinedMember = input();
  undefinedMember.snapshot.maintenanceMarginRate = undefined;
  fails(undefinedMember, "snapshot.maintenanceMarginRate");

  const sparse = input();
  sparse.evaluation.leverages = new Array(3);
  fails(sparse, "evaluation.leverages");

  // an array carrying a named property besides its elements is not plain JSON data
  const extraProperty = input();
  const leverages = [1, 2, 3] as number[] & { extra?: number };
  leverages.extra = 1;
  extraProperty.evaluation.leverages = leverages;
  fails(extraProperty, "evaluation.leverages");
});

test("OKX-DERIV D14: error paths use schema names only and never echo input content", () => {
  const sentinel = "PRIVATE_SENTINEL_KEY";
  const hostile = [
    mutated((value) => { value.snapshot[sentinel] = 1; }),
    mutated((value) => { value.snapshot.perp.ctVal = sentinel; }),
    mutated((value) => { value.snapshot.books.spot.bids[1] = [sentinel, sentinel]; }),
    mutated((value) => { value.evaluation.policy = { [sentinel]: 1 }; }),
    mutated((value) => { value[sentinel] = 1; }),
  ];
  for (const raw of hostile) {
    try {
      parseDerivativesInput(raw);
    } catch (error) {
      expect(error).toBeInstanceOf(DerivativesError);
      if (error instanceof DerivativesError) {
        expect(error.message).not.toContain("SENTINEL");
        expect(error.path).not.toContain("SENTINEL");
      }
      continue;
    }
    throw new Error("expected a failure");
  }
});
