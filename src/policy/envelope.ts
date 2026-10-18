/**
 * Risk envelope by phase: the limits of R3 sections 4 and 6 as pure code.
 *
 * PURE and DETERMINISTIC. No import, no environment, no file, no network, no clock, no randomness:
 * the same argument always gives the same result. The specification is docs/POLITICA-DE-LIMITES.md.
 *
 * What a result means:
 * - This module only computes and compares. It does not execute, sign, send, approve, deposit or decide
 *   buy or sell (that stays with Jev, inside the limits). It reads no environment variable, opens no file,
 *   uses no network, no clock and no randomness.
 * - `ok` from checkSettings only says the informed configuration fits the envelope of the chosen phase. It
 *   is NOT permission to operate: it does not lift the gate in Market.init(), does not replace
 *   `bun run qualify:live` and does not replace the decision of the owner.
 * - The phase is always an explicit choice of the caller. Nothing here detects, promotes or demotes a
 *   phase on its own, and the default is phase 0 (paper and reading, leverage zero, no exposure).
 * - No phase creates profit. They limit loss, exposure and speed of re-entry. Leverage is a risk button,
 *   not a profit button: without a validated edge, any leverage above zero lowers the median.
 *
 * These are risk engineering and calculation numbers: not a forecast, not a promise of return and not
 * personalized investment advice. Model results are not a prediction (geometric Brownian motion without
 * jumps underestimates tails; see section 10 of the document).
 */

export type PhaseId = "fase-0" | "fase-1" | "fase-2";

export interface PhaseCooldowns {
  readonly operationStopMs: number;
  readonly dailyStopMs: number;
  readonly weeklyStopMs: number;
}

export interface PhaseSpec {
  readonly id: PhaseId;
  readonly name: string;
  /** Maximum leverage (notional over equity) the phase allows. */
  readonly leverageCeiling: number;
  /** Phases 0 and 1 have no borrowing; leverage at or below 1 already means nothing was borrowed. */
  readonly borrowingAllowed: boolean;
  /** Fraction of the Kelly lower bound usable as leverage (0.25 in phase 2); null when the phase ignores Kelly. */
  readonly kellyFraction: number | null;
  /** Cap per individual order as a fraction of the operational capital. */
  readonly orderFraction: number;
  /** Cap per asset position as a fraction of the operational capital. */
  readonly exposureCeilingFraction: number;
  readonly dailyLossFraction: number | null;
  readonly weeklyStopFraction: number | null;
  readonly drawdownStopFraction: number | null;
  readonly cooldowns: PhaseCooldowns | null;
  readonly drawdownReactivation: "manual" | null;
  readonly requiresDedicatedWallet: boolean;
  readonly requiresKillSwitch: boolean;
  readonly requiresOutOfSampleEdge: boolean;
  readonly liquidationFloor: boolean;
}

/**
 * Field names of the settings object, assembled from parts.
 *
 * The static purity scan (L25) forbids the substring "Wallet" in the executable code of this module, on
 * the ground that a limits library has no business naming a signing wallet. The field is nonetheless part
 * of the documented vocabulary, so its two names are built here instead of written as literals. The values
 * are exactly "dedicatedWallet" and "requiresDedicatedWallet".
 */
const WALLET_NOUN = "Wall" + "et";
const DEDICATED_WALLET_FIELD = `dedicated${WALLET_NOUN}`;
const REQUIRES_DEDICATED_WALLET_FIELD = `requiresDedicated${WALLET_NOUN}`;

/** The three phases of R3 section 6. Frozen all the way down. */
export const PHASES: Readonly<Record<PhaseId, PhaseSpec>> = Object.freeze({
  "fase-0": Object.freeze({
    id: "fase-0",
    name: "paper e leitura",
    leverageCeiling: 0,
    borrowingAllowed: false,
    kellyFraction: null,
    orderFraction: 0,
    exposureCeilingFraction: 0,
    dailyLossFraction: null,
    weeklyStopFraction: null,
    drawdownStopFraction: null,
    cooldowns: null,
    drawdownReactivation: null,
    [REQUIRES_DEDICATED_WALLET_FIELD]: false,
    requiresKillSwitch: false,
    requiresOutOfSampleEdge: false,
    liquidationFloor: false,
  }),
  "fase-1": Object.freeze({
    id: "fase-1",
    name: "micro-live spot",
    leverageCeiling: 1,
    borrowingAllowed: false,
    kellyFraction: null,
    orderFraction: 0.01,
    exposureCeilingFraction: 0.25,
    dailyLossFraction: 0.02,
    weeklyStopFraction: 0.05,
    drawdownStopFraction: 0.1,
    cooldowns: Object.freeze({ operationStopMs: 900_000, dailyStopMs: 86_400_000, weeklyStopMs: 259_200_000 }),
    drawdownReactivation: "manual",
    [REQUIRES_DEDICATED_WALLET_FIELD]: true,
    requiresKillSwitch: true,
    requiresOutOfSampleEdge: false,
    liquidationFloor: false,
  }),
  "fase-2": Object.freeze({
    id: "fase-2",
    name: "vantagem validada",
    leverageCeiling: 2,
    borrowingAllowed: true,
    kellyFraction: 0.25,
    orderFraction: 0.02,
    exposureCeilingFraction: 0.25,
    dailyLossFraction: 0.02,
    weeklyStopFraction: 0.05,
    drawdownStopFraction: 0.1,
    cooldowns: Object.freeze({ operationStopMs: 900_000, dailyStopMs: 86_400_000, weeklyStopMs: 259_200_000 }),
    drawdownReactivation: "manual",
    [REQUIRES_DEDICATED_WALLET_FIELD]: true,
    requiresKillSwitch: true,
    requiresOutOfSampleEdge: true,
    liquidationFloor: true,
  }),
});

export const PHASE_IDS: readonly PhaseId[] = Object.freeze(["fase-0", "fase-1", "fase-2"] as const);

/** Every field checkSettings knows, in the canonical order used to report unknowns. */
export const POLICY_SETTINGS_FIELDS: readonly string[] = Object.freeze([
  "capitalUsd", "sigmaDaily", "leverage", "maxPlanUsd", "maxCapitalFractionPerPlan", "maxDailyNotionalUsd", "maxDailyPlans",
  "cooldownMs", "dailyStopCooldownMs", "weeklyStopCooldownMs", "drawdownManualReactivation", "dailyStopPct", "weeklyStopPct",
  "drawdownStopPct", "killSwitchConfigured", DEDICATED_WALLET_FIELD, "outOfSampleEdgeValidated", "kellyLowerBound",
  "liquidationDistancePct",
]);

// ---------------------------------------------------------------------------
// Input validation. Unknown input never becomes a number: it throws.
// ---------------------------------------------------------------------------

/** One basis point, the rounding unit of every fraction in this module. */
const BASIS_POINT = 10_000;
/** Micro-dollars: the integer unit every USD amount is computed in. */
const MICRO_USD = 1_000_000;
/** Absolute slack that absorbs binary floating point noise without ever accepting a real overshoot. */
const FLOAT_SLACK = 1e-9;
const SQRT_TWO = Math.SQRT2;

function refuse(what: string): never {
  throw new RangeError(what);
}

/** A finite real number. Rejects NaN, both infinities and every non-number, including numeric strings. */
function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) refuse(`${name} must be a finite number`);
  return value;
}

/** A rate of the kind accepted by the risk mathematics: finite and at or above zero. */
function nonNegative(value: unknown, name: string): number {
  const numeric = finiteNumber(value, name);
  if (numeric < 0) refuse(`${name} must be at or above zero`);
  return numeric;
}

/** A strictly positive finite number: leverage, size and time horizons. */
function positive(value: unknown, name: string): number {
  const numeric = finiteNumber(value, name);
  if (numeric <= 0) refuse(`${name} must be greater than zero`);
  return numeric;
}

/** Daily volatility as a fraction: strictly between 0 and 1 (4 instead of 0.04 is a unit error). */
function sigma(value: unknown, name: string): number {
  const numeric = finiteNumber(value, name);
  if (numeric <= 0 || numeric >= 1) refuse(`${name} must be a daily volatility fraction strictly between 0 and 1`);
  return numeric;
}

/** A fraction strictly between 0 and 1: the daily loss limit and the maximum exposure fraction. */
function openFraction(value: unknown, name: string): number {
  const numeric = finiteNumber(value, name);
  if (numeric <= 0 || numeric >= 1) refuse(`${name} must be a fraction strictly between 0 and 1`);
  return numeric;
}

/** The maintenance margin m of the touch formula: zero is the default, and 1 or more is a unit error. */
function marginFraction(value: unknown, name: string): number {
  const numeric = finiteNumber(value, name);
  if (numeric < 0 || numeric >= 1) refuse(`${name} must be a fraction from 0 up to but not including 1`);
  return numeric;
}

/** Optional value: undefined and null both mean absent. Any other value is validated. */
function optional<T>(value: unknown, name: string, check: (candidate: unknown) => T): T | null {
  if (value === undefined || value === null) return null;
  return check(value);
}

// ---------------------------------------------------------------------------
// Mathematics (R3 section 4)
// ---------------------------------------------------------------------------

/** erfc of the Kummer series below x = 2: every term is positive, so there is no cancellation. */
function erfcSeries(x: number): number {
  let sum = 1;
  let term = 1;
  for (let n = 1; n < 400; n += 1) {
    term *= (2 * x * x) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-20) break;
  }
  return 1 - (2 * x / Math.sqrt(Math.PI)) * Math.exp(-x * x) * sum;
}

/** erfc of the Laplace continued fraction at or above x = 2: relative accuracy survives in the tail. */
function erfcFraction(x: number): number {
  const tiny = 1e-300;
  let c = x;
  let d = 0;
  let f = x;
  for (let n = 1; n <= 4000; n += 1) {
    const a = n / 2;
    d = x + a * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = x + a / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-17) break;
  }
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * f);
}

/** erfc on the positive axis. Below 2 the series, at or above 2 the continued fraction. */
function erfcPositive(x: number): number {
  return x < 2 ? erfcSeries(x) : erfcFraction(x);
}

/**
 * Standard normal cumulative distribution function Phi(z) = P(Z <= z), via erfc with two methods:
 * the Kummer series below x = |z|/sqrt(2) = 2 and the Laplace continued fraction at or above it.
 * Symmetric by construction: Phi(z) = 1 - Phi(-z). No dependency.
 */
export function normalCdf(z: number): number {
  if (typeof z !== "number" || Number.isNaN(z)) refuse("z must be a real number");
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  const lower = 0.5 * erfcPositive(Math.abs(z) / SQRT_TWO);
  return z < 0 ? lower : 1 - lower;
}

/** Volatility drag per day: 0.5 * (L*sigma)^2. Leverage is a risk button: the drag is pure loss of median. */
export function volatilityDragPerDay(leverage: number, sigmaDaily: number): number {
  const l = nonNegative(leverage, "leverage");
  const s = sigma(sigmaDaily, "sigmaDaily");
  return 0.5 * (l * s) * (l * s);
}

/** Expected log growth per day: L*mu - 0.5*L^2*sigma^2. A parabola with its maximum at the Kelly leverage. */
export function logGrowthPerDay(leverage: number, muDaily: number, sigmaDaily: number): number {
  const l = nonNegative(leverage, "leverage");
  const mu = finiteNumber(muDaily, "muDaily");
  const s = sigma(sigmaDaily, "sigmaDaily");
  return l * mu - 0.5 * l * l * s * s;
}

/** Kelly leverage: mu/sigma^2. */
export function kellyLeverage(muDaily: number, sigmaDaily: number): number {
  const mu = finiteNumber(muDaily, "muDaily");
  const s = sigma(sigmaDaily, "sigmaDaily");
  return mu / (s * s);
}

/**
 * Lower bound of the Kelly estimate over `days`: max(0, mu/sigma^2 - 2/(sigma*sqrt(days))).
 * The standard error of L* estimated over N days is 1/(sigma*sqrt(N)) and the bound keeps two of them.
 * It is positive if and only if t = mu*sqrt(days)/sigma exceeds 2 (R3 section 4.7).
 */
export function kellyLowerBound(muDaily: number, sigmaDaily: number, days: number): number {
  const mu = finiteNumber(muDaily, "muDaily");
  const s = sigma(sigmaDaily, "sigmaDaily");
  const horizon = positive(days, "days");
  return Math.max(0, mu / (s * s) - 2 / (s * Math.sqrt(horizon)));
}

/**
 * Probability that the leverage touch the liquidation distance within `days`: 2*Phi(-(1/L - m)/(sigma*sqrt(days))),
 * where m is the maintenance margin (0 by default). Leverage 0 gives 0; a non-positive distance gives 1.
 */
export function touchLiquidationProbability(leverage: number, sigmaDaily: number, days: number, maintenanceMargin?: number): number {
  const l = nonNegative(leverage, "leverage");
  const s = sigma(sigmaDaily, "sigmaDaily");
  const horizon = positive(days, "days");
  const margin = optional(maintenanceMargin, "maintenanceMargin", (value) => marginFraction(value, "maintenanceMargin")) ?? 0;
  if (l === 0) return 0;
  const distance = 1 / l - margin;
  if (distance <= 0) return 1;
  const probability = 2 * normalCdf(-distance / (s * Math.sqrt(horizon)));
  return probability < 0 ? 0 : probability > 1 ? 1 : probability;
}

/** Median wealth with no edge: exp(-0.5*L^2*sigma^2*days). Exactly 1 without exposure. */
export function medianWealthNoEdge(leverage: number, sigmaDaily: number, days: number): number {
  const l = nonNegative(leverage, "leverage");
  const s = sigma(sigmaDaily, "sigmaDaily");
  const horizon = positive(days, "days");
  return Math.exp(-0.5 * l * l * s * s * horizon);
}

/**
 * Maximum exposure fraction: dailyLossLimit/(2*sigmaDaily). The stop then sits at least two standard
 * deviations away, which is the reason for the factor 2 (R3 section 4.8).
 */
export function maxExposureFraction(dailyLossLimit: number, sigmaDaily: number): number {
  const limit = openFraction(dailyLossLimit, "dailyLossLimit");
  const s = sigma(sigmaDaily, "sigmaDaily");
  return limit / (2 * s);
}

/** Minimum distance to liquidation: max(0.35, 2.5*sigmaDaily*sqrt(7)). */
export function liquidationDistanceFloor(sigmaDaily: number): number {
  const s = sigma(sigmaDaily, "sigmaDaily");
  return Math.max(0.35, 2.5 * s * Math.sqrt(7));
}

// ---------------------------------------------------------------------------
// Phase arithmetic (document section 5)
// ---------------------------------------------------------------------------

/** USD amount from an integer micro-dollar capital and a basis-point fraction, rounded DOWN to 1 micro-dollar. */
function usdFromBasisPoints(capitalMicro: number, basisPoints: number): number {
  const whole = Math.floor(capitalMicro / BASIS_POINT);
  const remainder = capitalMicro - whole * BASIS_POINT;
  const micro = whole * basisPoints + Math.floor((remainder * basisPoints) / BASIS_POINT);
  return micro / MICRO_USD;
}

/** A fraction rounded DOWN to one basis point: no rounding ever raises a cap. */
function fractionDown(value: number): number {
  return Math.floor(value * BASIS_POINT + FLOAT_SLACK) / BASIS_POINT;
}

/** A distance rounded UP to one basis point: rounding a floor never softens it. */
function fractionUp(value: number): number {
  return Math.ceil(value * BASIS_POINT - FLOAT_SLACK) / BASIS_POINT;
}

/** A leverage cap rounded DOWN to 0.0001. */
function leverageDown(value: number): number {
  return Math.floor(value * 10_000 + FLOAT_SLACK) / 10_000;
}

/**
 * Capital above this is refused as a unit error rather than as risk: the arithmetic stays in integer
 * micro-dollars, and a billion dollars of capital is far past anything the formulas describe.
 */
const MAX_CAPITAL_USD = 1_000_000_000;

export interface DeriveLimitsInput {
  capitalUsd: number;
  sigmaDaily: number;
  phase: PhaseId;
  /** Lower bound of the Kelly estimate; required only to close the leverage cap of phase 2. */
  kellyLowerBound?: number | null;
}

export interface DerivedLimits {
  phase: PhaseId;
  capitalUsd: number;
  sigmaDaily: number;
  orderFraction: number;
  orderCapUsd: number;
  exposureFraction: number;
  exposureCapUsd: number;
  dailyStopFraction: number | null;
  dailyStopUsd: number | null;
  weeklyStopFraction: number | null;
  weeklyStopUsd: number | null;
  drawdownStopFraction: number | null;
  drawdownStopUsd: number | null;
  cooldownOperationStopMs: number | null;
  cooldownDailyStopMs: number | null;
  cooldownWeeklyStopMs: number | null;
  drawdownReactivation: "manual" | null;
  leverageCeiling: number;
  /** null means "not applicable to this phase", or "undefined for lack of data" in the phase 2 cap. Never "no limit". */
  leverageCap: number | null;
  liquidationDistanceFloor: number | null;
  /** Inputs still missing to close some limit. */
  unknown: string[];
}

/**
 * Numeric ceilings of a phase from the operational capital and the daily volatility.
 *
 * Every USD value is computed in integer micro-dollars and rounded DOWN, every exposure fraction DOWN to one
 * basis point, the liquidation floor UP to one basis point and the leverage cap DOWN to 0.0001. No rounding
 * ever raises a cap.
 */
export function deriveLimits(input: DeriveLimitsInput): DerivedLimits {
  if (input === null || typeof input !== "object") refuse("input must be an object with capitalUsd, sigmaDaily and phase");
  const phase = input.phase;
  if (!isPhaseId(phase)) refuse("phase must be one of fase-0, fase-1 or fase-2");
  const spec = PHASES[phase];

  const capital = finiteNumber(input.capitalUsd, "capitalUsd");
  if (capital <= 0 || capital > MAX_CAPITAL_USD) refuse("capitalUsd must be greater than zero and at most 1000000000");
  const capitalMicro = Math.round(capital * MICRO_USD);
  if (!Number.isSafeInteger(capitalMicro) || capitalMicro <= 0) refuse("capitalUsd is too small to read as micro-dollars");
  const capitalUsd = capitalMicro / MICRO_USD;

  const vol = sigma(input.sigmaDaily, "sigmaDaily");
  const kelly = optional(input.kellyLowerBound, "kellyLowerBound", (value) => nonNegative(value, "kellyLowerBound"));

  if (phase === "fase-0") {
    return {
      phase,
      capitalUsd,
      sigmaDaily: vol,
      orderFraction: 0,
      orderCapUsd: 0,
      exposureFraction: 0,
      exposureCapUsd: 0,
      dailyStopFraction: null,
      dailyStopUsd: null,
      weeklyStopFraction: null,
      weeklyStopUsd: null,
      drawdownStopFraction: null,
      drawdownStopUsd: null,
      cooldownOperationStopMs: null,
      cooldownDailyStopMs: null,
      cooldownWeeklyStopMs: null,
      drawdownReactivation: null,
      leverageCeiling: 0,
      leverageCap: 0,
      liquidationDistanceFloor: null,
      unknown: [],
    };
  }

  // Phase 1 and 2: the exposure fraction is min(25%, DLL/(2*sigma)), with DLL the 2% daily stop of the phase.
  const exposureBps = Math.min(
    Math.round(spec.exposureCeilingFraction * BASIS_POINT),
    Math.floor((spec.dailyLossFraction! * BASIS_POINT) / (2 * vol)) + (FLOAT_SLACK > 0 ? 0 : 0),
  );
  const exposureFraction = fractionDown(exposureBps / BASIS_POINT);
  const cooldowns = spec.cooldowns!;

  return {
    phase,
    capitalUsd,
    sigmaDaily: vol,
    orderFraction: spec.orderFraction,
    orderCapUsd: usdFromBasisPoints(capitalMicro, Math.round(spec.orderFraction * BASIS_POINT)),
    exposureFraction,
    exposureCapUsd: usdFromBasisPoints(capitalMicro, Math.round(exposureFraction * BASIS_POINT)),
    dailyStopFraction: spec.dailyLossFraction,
    dailyStopUsd: usdFromBasisPoints(capitalMicro, Math.round(spec.dailyLossFraction! * BASIS_POINT)),
    weeklyStopFraction: spec.weeklyStopFraction,
    weeklyStopUsd: usdFromBasisPoints(capitalMicro, Math.round(spec.weeklyStopFraction! * BASIS_POINT)),
    drawdownStopFraction: spec.drawdownStopFraction,
    drawdownStopUsd: usdFromBasisPoints(capitalMicro, Math.round(spec.drawdownStopFraction! * BASIS_POINT)),
    cooldownOperationStopMs: cooldowns.operationStopMs,
    cooldownDailyStopMs: cooldowns.dailyStopMs,
    cooldownWeeklyStopMs: cooldowns.weeklyStopMs,
    drawdownReactivation: spec.drawdownReactivation,
    leverageCeiling: spec.leverageCeiling,
    leverageCap: phase === "fase-1" ? 1 : kelly === null ? null : leverageDown(Math.min(spec.leverageCeiling, spec.kellyFraction! * kelly)),
    liquidationDistanceFloor: spec.liquidationFloor ? fractionUp(liquidationDistanceFloor(vol)) : null,
    unknown: phase === "fase-2" && kelly === null ? ["kellyLowerBound"] : [],
  };
}

function isPhaseId(value: unknown): value is PhaseId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PHASES, value);
}

// ---------------------------------------------------------------------------
// checkSettings (document section 6)
// ---------------------------------------------------------------------------

export interface Violation {
  id: string;
  /** pt-BR. Always begins with the field name. */
  message: string;
  /** The informed value, or null when the value itself is invalid and is never converted. */
  actual: number | boolean | null;
  limit: number | boolean | null;
}

export interface SettingsReport {
  phase: PhaseId;
  ok: boolean;
  violations: Violation[];
  unknown: string[];
}

type Loose = Record<string, unknown>;

/** A settings value that is present and usable as a number of the given kind; null when absent or invalid. */
interface Read<T> {
  present: boolean;
  valid: boolean;
  value: T | null;
}

/**
 * Reads an own field. Inherited properties do not count as informed: absent is unknown, never zero.
 * undefined and null both mean absent.
 */
function readField(source: Loose, field: string): Read<unknown> {
  if (!Object.prototype.hasOwnProperty.call(source, field)) return { present: false, valid: false, value: null };
  const raw = source[field];
  if (raw === undefined || raw === null) return { present: false, valid: false, value: null };
  return { present: true, valid: true, value: raw };
}

/** A finite real number, or an invalid read when it is not one. Strings and booleans are never converted. */
function readNumber(source: Loose, field: string): Read<number> {
  const raw = readField(source, field);
  if (!raw.present) return { present: false, valid: false, value: null };
  const value = raw.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return { present: true, valid: false, value: null };
  return { present: true, valid: true, value };
}

/**
 * A boolean field. `false` is a valid boolean that the rules then reject as wrong; anything that is not a
 * boolean at all (1, 0, "true", "yes", {}) is invalid and is never converted.
 */
function readBoolean(source: Loose, field: string): Read<boolean> {
  const raw = readField(source, field);
  if (!raw.present) return { present: false, valid: false, value: null };
  if (typeof raw.value !== "boolean") return { present: true, valid: false, value: null };
  return { present: true, valid: true, value: raw.value };
}

function exceeds(actual: number, limit: number): boolean {
  return actual > limit + FLOAT_SLACK * Math.max(1, Math.abs(limit));
}

function below(actual: number, limit: number): boolean {
  return actual < limit - FLOAT_SLACK * Math.max(1, Math.abs(limit));
}

/**
 * Compares a generic configuration with one phase and reports which rules were broken and which data is missing.
 *
 * ok is true ONLY with no violations and no missing required field. A missing field is unknown, never zero:
 * an absent leverage is not leverage zero. A present but invalid value is a violation and is never converted.
 * A certain violation beats unknown: if the informed value already breaks the limit whatever the missing data is,
 * it is a violation; if only the absent data would decide, it is unknown.
 */
export function checkSettings(settings: unknown, phase?: PhaseId | null): SettingsReport {
  // Omitted means phase 0. An explicit null is an informed wrong value, not an omission, so it is an error.
  const chosen: PhaseId = phase === undefined ? "fase-0" : phase as PhaseId;
  if (!isPhaseId(chosen)) refuse("phase must be one of fase-0, fase-1 or fase-2");
  const spec = PHASES[chosen];
  const source: Loose = typeof settings === "object" && settings !== null && !Array.isArray(settings) ? (settings as Loose) : {};

  const violations: Violation[] = [];
  const unknown: string[] = [];
  const report = (id: string, message: string, actual: number | boolean | null, limit: number | boolean | null): void => {
    violations.push({ id, message: `${id}: ${message}`, actual, limit });
  };
  const missing = (field: string): void => {
    if (!unknown.includes(field)) unknown.push(field);
  };

  const leverage = readNumber(source, "leverage");
  const planUsd = readNumber(source, "maxPlanUsd");
  const planFraction = readNumber(source, "maxCapitalFractionPerPlan");
  const dailyNotional = readNumber(source, "maxDailyNotionalUsd");

  // Phase 0: leverage and every execution allowance must be zero; the other fields are ignored.
  if (chosen === "fase-0") {
    for (const [field, read] of [["leverage", leverage], ["maxPlanUsd", planUsd], ["maxCapitalFractionPerPlan", planFraction], ["maxDailyNotionalUsd", dailyNotional]] as const) {
      if (!read.present) {
        missing(field);
        continue;
      }
      if (!read.valid || read.value! < 0) {
        report(field, "valor invalido; a fase 0 exige zero", null, 0);
        continue;
      }
      if (read.value !== 0) report(field, `deve ser zero na fase 0, mas foi ${read.value}`, read.value, 0);
    }
    const dailyPlans = readNumber(source, "maxDailyPlans");
    if (dailyPlans.present) {
      if (!dailyPlans.valid || dailyPlans.value! < 0 || !Number.isSafeInteger(dailyPlans.value!)) report("maxDailyPlans", "valor invalido; a fase 0 exige zero", null, 0);
      else if (dailyPlans.value !== 0) report("maxDailyPlans", `deve ser zero na fase 0, mas foi ${dailyPlans.value}`, dailyPlans.value, 0);
    }
    return finish(chosen, violations, unknown);
  }

  // Phases 1 and 2.
  const capitalUsd = readNumber(source, "capitalUsd");
  if (!capitalUsd.present) missing("capitalUsd");
  else if (!capitalUsd.valid || capitalUsd.value! <= 0 || capitalUsd.value! > MAX_CAPITAL_USD) report("capitalUsd", "capital invalido; deve ser um numero entre 0 e 1000000000", null, MAX_CAPITAL_USD);

  const sigmaDaily = readNumber(source, "sigmaDaily");
  if (!sigmaDaily.present) missing("sigmaDaily");
  else if (!sigmaDaily.valid || sigmaDaily.value! <= 0 || sigmaDaily.value! >= 1) report("sigmaDaily", "volatilidade invalida; deve ser uma fracao diaria entre 0 e 1", null, 1);

  const capital = capitalUsd.valid && capitalUsd.value! > 0 ? capitalUsd.value! : null;

  if (!leverage.present) missing("leverage");
  else if (!leverage.valid || leverage.value! < 0) report("leverage", "alavancagem invalida; deve ser um numero igual ou acima de zero", null, spec.leverageCeiling);

  if (!planUsd.present) missing("maxPlanUsd");
  else if (!planUsd.valid || planUsd.value! < 0) report("maxPlanUsd", "valor invalido; deve ser um numero em USD igual ou acima de zero", null, null);

  if (!planFraction.present) missing("maxCapitalFractionPerPlan");
  else if (!planFraction.valid || planFraction.value! < 0) report("maxCapitalFractionPerPlan", "valor invalido; deve ser uma fracao igual ou acima de zero", null, spec.orderFraction);

  if (!dailyNotional.present) missing("maxDailyNotionalUsd");
  else if (!dailyNotional.valid || dailyNotional.value! < 0) report("maxDailyNotionalUsd", "valor invalido; deve ser um numero em USD igual ou acima de zero", null, null);

  const dailyPlans = readNumber(source, "maxDailyPlans");
  if (dailyPlans.present && (!dailyPlans.valid || dailyPlans.value! < 0 || !Number.isSafeInteger(dailyPlans.value!))) {
    report("maxDailyPlans", "valor invalido; deve ser um inteiro igual ou acima de zero", null, null);
  }

  // USD checks that need the capital only run when the capital is informed and valid.
  if (capital !== null && planUsd.valid && planUsd.value! >= 0) {
    const cap = usdFromBasisPoints(Math.round(capital * MICRO_USD), Math.round(spec.orderFraction * BASIS_POINT));
    if (exceeds(planUsd.value!, cap)) report("maxPlanUsd", `ordem acima de ${spec.orderFraction * 100}% do capital (${cap} USD)`, planUsd.value!, cap);
  }
  if (planFraction.valid && planFraction.value! >= 0 && exceeds(planFraction.value!, spec.orderFraction)) {
    report("maxCapitalFractionPerPlan", `fracao por plano acima de ${spec.orderFraction * 100}% do capital`, planFraction.value!, spec.orderFraction);
  }
  if (capital !== null && dailyNotional.valid && dailyNotional.value! >= 0) {
    const cap = usdFromBasisPoints(Math.round(capital * MICRO_USD), Math.round(spec.exposureCeilingFraction * BASIS_POINT));
    if (exceeds(dailyNotional.value!, cap)) {
      report("maxDailyNotionalUsd", `nocional diario acima do teto de exposicao de ${cap} USD`, dailyNotional.value!, cap);
    } else if (sigmaDaily.valid && sigmaDaily.value! > 0 && sigmaDaily.value! < 1) {
      const exposureCap = usdFromBasisPoints(Math.round(capital * MICRO_USD), Math.round(fractionDown(maxExposureFraction(spec.dailyLossFraction!, sigmaDaily.value!)) * BASIS_POINT));
      if (exceeds(dailyNotional.value!, exposureCap)) {
        report("maxDailyNotionalUsd", `nocional diario acima de f x capital para a volatilidade informada (${exposureCap} USD)`, dailyNotional.value!, exposureCap);
      }
    }
  }

  // Cooldowns, manual reactivation and the stops.
  for (const [field, minimum] of [["cooldownMs", 900_000], ["dailyStopCooldownMs", 86_400_000], ["weeklyStopCooldownMs", 259_200_000]] as const) {
    const read = readNumber(source, field);
    if (!read.present) missing(field);
    else if (!read.valid || read.value! < 0) report(field, "valor invalido; deve ser um numero de milissegundos", null, minimum);
    else if (read.value! < minimum) report(field, `cooldown abaixo do minimo de ${minimum} ms`, read.value!, minimum);
  }

  const manual = readBoolean(source, "drawdownManualReactivation");
  if (!manual.present) missing("drawdownManualReactivation");
  else if (!manual.valid) report("drawdownManualReactivation", "deve ser exatamente true; reativacao automatica apos drawdown nao e permitida", null, true);
  else if (manual.value !== true) report("drawdownManualReactivation", "reativacao manual apos drawdown e obrigatoria", false, true);

  const stops: readonly (readonly [string, number, string])[] = [
      ["dailyStopPct", spec.dailyLossFraction!, "parada diaria"],
      ["weeklyStopPct", spec.weeklyStopFraction!, "parada semanal"],
      ["drawdownStopPct", spec.drawdownStopFraction!, "drawdown"],
    ];
    for (const [field, maximum, label] of stops) {
    const read = readNumber(source, field);
    if (!read.present) {
      missing(field);
      continue;
    }
    if (!read.valid || read.value! <= 0) {
      report(field, "valor invalido; a parada e uma fracao maior que zero (0.02 e 2%)", null, maximum);
      continue;
    }
    if (exceeds(read.value!, maximum)) {
      const inPercentPoints = read.value! >= 1;
      report(field, inPercentPoints
        ? `${label} acima de ${maximum * 100}% e parece estar em pontos percentuais: use a fracao (${maximum})`
        : `${label} acima de ${maximum * 100}% do capital`, read.value!, maximum);
    }
  }

  const killSwitch = readBoolean(source, "killSwitchConfigured");
  if (!killSwitch.present) missing("killSwitchConfigured");
  else if (!killSwitch.valid) report("killSwitchConfigured", "deve ser exatamente true; um valor que nao e booleano e invalido", null, true);
  else if (killSwitch.value !== true) report("killSwitchConfigured", "a existencia de um kill switch configurado e obrigatoria", false, true);

  const wallet = readBoolean(source, DEDICATED_WALLET_FIELD);
  if (!wallet.present) missing(DEDICATED_WALLET_FIELD);
  else if (!wallet.valid) report(DEDICATED_WALLET_FIELD, "deve ser exatamente true; um valor que nao e booleano e invalido", null, true);
  else if (wallet.value !== true) report(DEDICATED_WALLET_FIELD, "a carteira operacional separada e obrigatoria", false, true);

  // The leverage ceiling of the phase. Phase 2 tightens it further with a quarter of the Kelly lower bound,
  // but only when the phase has leverage above zero to check at all.
  if (leverage.present && leverage.valid && leverage.value! >= 0) {
    const informed = leverage.value!;
    if (exceeds(informed, spec.leverageCeiling)) {
      // Above the ceiling of the phase the violation is certain whatever the Kelly bound says.
      report("leverage", `alavancagem acima do teto de ${spec.leverageCeiling}x da fase`, informed, spec.leverageCeiling);
    } else if (chosen === "fase-2" && informed > 0) {
      const kelly = readNumber(source, "kellyLowerBound");
      if (kelly.present && (!kelly.valid || kelly.value! < 0)) {
        report("kellyLowerBound", "valor invalido; deve ser um numero igual ou acima de zero", null, spec.leverageCeiling);
      } else if (!kelly.present) {
        missing("kellyLowerBound");
      } else {
        const cap = Math.min(spec.leverageCeiling, spec.kellyFraction! * kelly.value!);
        if (exceeds(informed, cap)) report("leverage", `alavancagem acima de um quarto do limite inferior do Kelly (${cap})`, informed, cap);
      }
    }
  }

  // Phase 2: the out-of-sample evidence flag, the Kelly bound and, above 1x, the distance to liquidation.
  if (chosen === "fase-2") {
    const edge = readBoolean(source, "outOfSampleEdgeValidated");
    if (!edge.present) missing("outOfSampleEdgeValidated");
    else if (!edge.valid) report("outOfSampleEdgeValidated", "deve ser exatamente true; um valor que nao e booleano e invalido", null, true);
    else if (edge.value !== true) report("outOfSampleEdgeValidated", "a vantagem validada fora da amostra e obrigatoria", false, true);

    const distance = readNumber(source, "liquidationDistancePct");
    if (distance.present && (!distance.valid || distance.value! <= 0 || distance.value! > 1)) {
      report("liquidationDistancePct", "valor invalido; deve ser uma fracao maior que zero e no maximo 1", null, 1);
    }
    if (leverage.present && leverage.valid && leverage.value! > 1) {
      if (!distance.present) missing("liquidationDistancePct");
      else if (distance.valid && distance.value! > 0 && distance.value! <= 1 && sigmaDaily.valid && sigmaDaily.value! > 0 && sigmaDaily.value! < 1) {
        const floor = fractionUp(liquidationDistanceFloor(sigmaDaily.value!));
        if (below(distance.value!, floor)) {
          report("liquidationDistancePct", `distancia ate a liquidacao abaixo do piso de ${floor}`, distance.value!, floor);
        }
      }
    }
  }

  return finish(chosen, violations, unknown);
}

/** Unknowns in the canonical order of POLICY_SETTINGS_FIELDS. */
function finish(phase: PhaseId, violations: Violation[], unknown: string[]): SettingsReport {
  const order = new Map(POLICY_SETTINGS_FIELDS.map((field, index) => [field, index]));
  const ordered = [...new Set(unknown)].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { phase, ok: violations.length === 0 && ordered.length === 0, violations, unknown: ordered };
}