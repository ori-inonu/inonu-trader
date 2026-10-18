// Leverage and risk arithmetic for the /central page. Pure functions, no dependencies, no I/O.
//
// Model (docs/research/R3-estrategias-e-alavancagem.md section 4.1): geometric Brownian motion without jumps,
//   dS/S = mu*dt + sigma*dW   (mu and sigma per day, t in days),
// constant leverage L with continuous rebalancing, continuous monitoring of the liquidation level, no maintenance margin
// unless stated and no costs. It underestimates tails. The results are arithmetic, not a forecast and not advice.

/** Leverages compared side by side in the page (R3 tables A, C and D use the same set). */
export const COMPARISON_LEVERAGES: readonly number[] = [1, 2, 3, 5, 10, 20];

/** Floor of the liquidation distance in phase 2 (R3 section 6): max(35%, 2.5 * sigma * sqrt(7)). */
export const LIQUIDATION_FLOOR_MIN = 0.35;
export const LIQUIDATION_FLOOR_SIGMA_MULTIPLE = 2.5;
export const LIQUIDATION_FLOOR_HORIZON_DAYS = 7;

/**
 * Standard normal cumulative distribution function.
 *
 * Hart's algorithm 5666 in the double precision form published by Graeme West ("Better approximations to cumulative normal
 * functions", 2005): a rational approximation of the upper tail for |x| < 7.07 and a continued fraction beyond it. The
 * relative error is about 1e-15, including the far tails, which matters because the touch probabilities are small.
 */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  const abs = Math.abs(x);
  let upperTail: number; // P(Z > |x|)
  if (abs > 37) {
    upperTail = 0;
  } else {
    const exponential = Math.exp((-abs * abs) / 2);
    if (abs < 7.07106781186547) {
      let numerator = 3.52624965998911e-2 * abs + 0.700383064443688;
      numerator = numerator * abs + 6.37396220353165;
      numerator = numerator * abs + 33.912866078383;
      numerator = numerator * abs + 112.079291497871;
      numerator = numerator * abs + 221.213596169931;
      numerator = numerator * abs + 220.206867912376;
      let denominator = 8.83883476483184e-2 * abs + 1.75566716318264;
      denominator = denominator * abs + 16.064177579207;
      denominator = denominator * abs + 86.7807322029461;
      denominator = denominator * abs + 296.564248779674;
      denominator = denominator * abs + 637.333633378831;
      denominator = denominator * abs + 793.826512519948;
      denominator = denominator * abs + 440.413735824752;
      upperTail = (exponential * numerator) / denominator;
    } else {
      let fraction = abs + 0.65;
      fraction = abs + 4 / fraction;
      fraction = abs + 3 / fraction;
      fraction = abs + 2 / fraction;
      fraction = abs + 1 / fraction;
      upperTail = exponential / fraction / 2.506628274631;
    }
  }
  return x > 0 ? 1 - upperTail : upperTail;
}

/** Volatility drag per day: 0.5*(L*sigma)^2. */
export function volatilityDragPerDay(leverage: number, sigma: number): number {
  return 0.5 * (leverage * sigma) ** 2;
}

/** Log growth per day: g(L) = L*mu - 0.5*L^2*sigma^2. */
export function logGrowthPerDay(leverage: number, mu: number, sigma: number): number {
  return leverage * mu - 0.5 * leverage * leverage * sigma * sigma;
}

/** Median wealth multiple after `days`: exp(T*g(L)). */
export function medianWealthMultiple(leverage: number, mu: number, sigma: number, days: number): number {
  return Math.exp(days * logGrowthPerDay(leverage, mu, sigma));
}

/** Mean wealth multiple after `days`: exp(T*L*mu). It is exactly 1 when mu is 0, before costs. */
export function meanWealthMultiple(leverage: number, mu: number, days: number): number {
  return Math.exp(days * leverage * mu);
}

/** Kelly leverage mu/sigma^2, or null ("indefinido") when there is no positive edge. */
export function kellyLeverage(mu: number, sigma: number): number | null {
  if (!(Number.isFinite(mu) && mu > 0) || !(Number.isFinite(sigma) && sigma > 0)) return null;
  return mu / (sigma * sigma);
}

/**
 * Probability that the price touches the liquidation level at distance 1/L (minus a maintenance margin) within `days`, by
 * the reflection principle for a driftless process: 2*Phi(-d/(sigma*sqrt(T))). The drift is ignored, as in R3 tables C.
 */
export function liquidationTouchProbability(leverage: number, sigma: number, days: number, maintenanceMargin = 0): number {
  if (![leverage, sigma, days, maintenanceMargin].every(Number.isFinite)) return Number.NaN;
  const distance = 1 / leverage - maintenanceMargin;
  if (!(distance > 0)) return 1; // already at or past the liquidation level when the position opens
  const scale = sigma * Math.sqrt(days);
  if (!(scale > 0)) return 0;
  return Math.min(1, 2 * normalCdf(-distance / scale));
}

/**
 * Largest constant leverage whose touch probability stays at or below `budget` (for example 0.05), or null for a budget
 * outside (0, 1) or invalid inputs. Solves 2*Phi(-z) = budget for z by bisection, then L = 1/(maintenanceMargin + z*sigma*sqrt(T)).
 */
export function maxLeverageForTouchProbability(budget: number, sigma: number, days: number, maintenanceMargin = 0): number | null {
  if (!(budget > 0 && budget < 1) || !(sigma > 0) || !(days > 0) || !Number.isFinite(maintenanceMargin)) return null;
  let low = 0;
  let high = 40;
  for (let step = 0; step < 200; step += 1) {
    const middle = (low + high) / 2;
    if (2 * normalCdf(-middle) > budget) low = middle;
    else high = middle;
  }
  const z = (low + high) / 2;
  const denominator = maintenanceMargin + z * sigma * Math.sqrt(days);
  return denominator > 0 ? 1 / denominator : null;
}

/** Largest position fraction for a daily loss limit: f_max = DLL/(2*sigma). The 25% cap is applied by the phase profile. */
export function maxExposureFraction(dailyLossLimit: number, sigma: number): number {
  return dailyLossLimit / (2 * sigma);
}

/** Minimum distance to liquidation in phase 2: max(35%, 2.5*sigma*sqrt(7)). */
export function liquidationDistanceFloor(sigma: number, horizonDays = LIQUIDATION_FLOOR_HORIZON_DAYS): number {
  return Math.max(LIQUIDATION_FLOOR_MIN, LIQUIDATION_FLOOR_SIGMA_MULTIPLE * sigma * Math.sqrt(horizonDays));
}

/**
 * Maximal inequality for a nonnegative martingale (no edge): P(max W >= c*W0) <= 1/c. With costs the process is a
 * supermartingale and the bound still holds. Returns 1 for c <= 1.
 */
export function maximalInequalityBound(multiple: number): number {
  if (Number.isNaN(multiple)) return Number.NaN;
  return multiple <= 1 ? 1 : 1 / multiple;
}

export interface ComparisonParams {
  sigma: number;
  mu: number;
  days: number;
}

export interface ComparisonRow {
  leverage: number;
  dragPerDay: number;
  logGrowthPerDay: number;
  medianMultiple: number;
  meanMultiple: number;
  touchProbability: number;
}

/** One row per leverage, for the chosen volatility, horizon and assumed daily edge. */
export function leverageComparison(params: ComparisonParams, leverages: readonly number[] = COMPARISON_LEVERAGES): ComparisonRow[] {
  return leverages.map((leverage) => ({
    leverage,
    dragPerDay: volatilityDragPerDay(leverage, params.sigma),
    logGrowthPerDay: logGrowthPerDay(leverage, params.mu, params.sigma),
    medianMultiple: medianWealthMultiple(leverage, params.mu, params.sigma, params.days),
    meanMultiple: meanWealthMultiple(leverage, params.mu, params.days),
    touchProbability: liquidationTouchProbability(leverage, params.sigma, params.days),
  }));
}

export type RiskVerdict = "no-edge" | "edge-assumed-growth" | "edge-assumed-over-kelly";

/**
 * Which plain sentence the page shows. Without a positive assumed edge, every leverage above zero shrinks the median.
 * With an assumed edge, growth is positive only below twice the Kelly leverage.
 */
export function riskVerdict(mu: number, leverage: number, sigma: number): RiskVerdict {
  const kelly = kellyLeverage(mu, sigma);
  if (kelly === null) return "no-edge";
  return leverage < 2 * kelly * (1 - 1e-12) ? "edge-assumed-growth" : "edge-assumed-over-kelly";
}
