/**
 * How much of the balance may go into one opportunity, decided by CODE from the facts of the balance and of the market, so that the model never writes an amount: it chooses one of three
 * fractions of the ceiling this module computes (`FRACTIONS`), and this module turns the fraction into dollars, scaled down so that nothing spends more than the balance allows.
 *
 * The ceiling of one candidate is the smallest of:
 *  - the cash of the candidate's own network (a token on one network is bought with what the wallet holds on that network; bridging is out of scope), after a reserve that is never spent;
 *  - the risk ceiling: the share of the portfolio the person accepts to lose in one operation divided by the loss one assumes the position can take (half of it when nothing gives pause, all of
 *    it when a mark of care is on the candidate: a token with concentrated holders can go to zero), minus what the person already holds of it;
 *  - the liquidity ceiling: a small share of the pool's liquidity, so the order itself does not move the price;
 *  - the volume ceiling: a small share of the day's volume.
 * Under the minimum order the candidate cannot be bought and the model is not offered a size for it.
 *
 * Every number here is a CHOICE of this code, conservative and not calibrated: the project measured no edge in prices (see the evidence RAS-7), so the only thing sizing can honestly do is
 * limit the damage of being wrong. Pure: no clock, no network, no storage.
 */

export const SIZING = {
  /** Under this a swap costs more in fees than it is worth, and the candidate gets no size. */
  minOrderUsd: 10,
  /** The default share of the portfolio the person accepts to lose in one operation, when they did not choose one (a fraction). */
  defaultRiskPct: 0.01,
  /** The loss assumed on a position: half when nothing gives pause, all of it when a mark of care is on the candidate. */
  assumedLoss: { clean: 0.5, marked: 1 },
  /**
   * A clean token in a deep pool that the agent can WATCH (it holds a stop the guard checks every few seconds) is ASSUMED to lose twice the distance of that stop, never less than 3 percent and never more than
   * the half above. That is a HYPOTHESIS, not a worst case: it does not hold when the pool cannot be left during a fall, a pause of the network or of the provider, or a gap, and a nominal depth of 100 thousand dollars
   * proves nothing about the exit. Because a shorter assumed loss lets the same risk fraction buy a bigger position (up to sixteen times at the floor), a position sized this way is also held to `maxPositionShare` of
   * the portfolio, whatever the stop says. A token with a mark of care, or in a shallow pool, keeps the old assumption.
   */
  stopSizing: { gap: 2, minLoss: 0.03, minLiquidityUsd: 100_000, maxPositionShare: 0.1 },
  /** At most this share of the cash of a network goes in one decision. */
  chainSpendShare: 0.8,
  /** The cash that is never spent, as a share of the portfolio. */
  reserveShare: 0.2,
  /** At most this share of the pool liquidity, and of the day's volume, in one order. */
  liquidityShare: 0.01,
  volumeShare: 0.02,
} as const;

/** The three sizes the model may choose, as fractions of the ceiling. */
export const FRACTIONS = { buy_third: 1 / 3, buy_two_thirds: 2 / 3, buy_full: 1 } as const;
export type BuySize = keyof typeof FRACTIONS;
export const BUY_SIZES: readonly BuySize[] = ["buy_third", "buy_two_thirds", "buy_full"];

export type Binding = "caixa" | "reserva" | "risco" | "liquidez" | "volume" | "concentracao" | "sem_saldo" | "sem_dado" | "minimo";

export interface SizingInput {
  /** The portfolio counted, in dollars (cash included). Null when the balance was not read. */
  readonly portfolioUsd: number | null;
  /** Stable coins held on the candidate's network. */
  readonly cashOnChainUsd: number | null;
  /** Stable coins held on every network: the reserve is kept out of THIS total, not out of one network. */
  readonly totalCashUsd: number | null;
  /** What the person already holds of this candidate. */
  readonly heldUsd: number;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  /** A mark of care is on the candidate (concentrated holders, risk level, little liquidity...). */
  readonly marked: boolean;
  /** The share of the portfolio the person accepts to lose in one operation, a fraction; null for the default. */
  readonly riskPct: number | null;
  /** The cash that is never spent, as a share of the portfolio; absent or null for the default. */
  readonly reserveShare?: number | null;
  /** The distance of the stop the position would be entered with, in percent (the profile the model picks); absent when there is none to size by. */
  readonly stopPct?: number | null;
  /** A wider multiple of the stop to assume lost than the usual two (a token with little history); one smaller than the usual is not accepted. */
  readonly stopGap?: number | null;
}

/** A reserve outside what makes sense (nothing kept, or almost everything) is the default one. */
export const reserveOf = (reserveShare: number | null | undefined): number => (typeof reserveShare === "number" && Number.isFinite(reserveShare) && reserveShare >= 0.05 && reserveShare <= 0.6 ? reserveShare : SIZING.reserveShare);

export interface SizingCap {
  /** The ceiling in dollars, whole dollars, zero when the candidate cannot be bought. */
  readonly maxUsd: number;
  /** Which of the limits was the smallest, so the screen can say why the ceiling is what it is. */
  readonly binding: Binding;
  /** The ceiling as a share of the portfolio (a fraction), null when the portfolio is unknown. */
  readonly sharePct: number | null;
}

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v) && v >= 0;

/** The loss assumed on a position, as a fraction of it (see `SIZING.stopSizing`). */
function stopSized(input: SizingInput): boolean {
  const stop = input.stopPct;
  return !input.marked && typeof stop === "number" && Number.isFinite(stop) && stop > 0 && stop <= 100 && finite(input.liquidityUsd) && input.liquidityUsd >= SIZING.stopSizing.minLiquidityUsd;
}

function lossAssumed(input: SizingInput): number {
  const S = SIZING;
  if (input.marked) return S.assumedLoss.marked;
  const stop = input.stopPct;
  const watched = typeof stop === "number" && Number.isFinite(stop) && stop > 0 && stop <= 100 && finite(input.liquidityUsd) && input.liquidityUsd >= S.stopSizing.minLiquidityUsd;
  if (!watched) return S.assumedLoss.clean;
  const gap = typeof input.stopGap === "number" && Number.isFinite(input.stopGap) && input.stopGap > S.stopSizing.gap ? input.stopGap : S.stopSizing.gap;
  return Math.min(S.assumedLoss.clean, Math.max(S.stopSizing.minLoss, (stop / 100) * gap));
}

/** The limits a ceiling is the smallest of, or the reason there is no ceiling to compute (no data, no cash on the network, nothing above the reserve). */
function limitsOf(input: SizingInput): { readonly limits: readonly { readonly binding: Binding; readonly usd: number }[]; readonly portfolio: number } | { readonly none: SizingCap } {
  const S = SIZING;
  if (!finite(input.portfolioUsd) || input.portfolioUsd <= 0 || !finite(input.cashOnChainUsd) || !finite(input.totalCashUsd)) return { none: { maxUsd: 0, binding: "sem_dado", sharePct: null } };
  // a market with no liquidity or volume figure at all cannot be sized: unknown is never "plenty"
  if (!finite(input.liquidityUsd) && !finite(input.volume24hUsd)) return { none: { maxUsd: 0, binding: "sem_dado", sharePct: null } };
  const portfolio = input.portfolioUsd;
  if (input.cashOnChainUsd <= 0) return { none: { maxUsd: 0, binding: "sem_saldo", sharePct: 0 } };
  // the reserve is never spent, whichever network holds the cash
  const spendable = input.totalCashUsd - reserveOf(input.reserveShare) * portfolio;
  if (spendable <= 0) return { none: { maxUsd: 0, binding: "reserva", sharePct: 0 } };
  const limits: { readonly binding: Binding; readonly usd: number }[] = [{ binding: "caixa", usd: Math.min(input.cashOnChainUsd * S.chainSpendShare, spendable) }];
  const risk = finite(input.riskPct) && input.riskPct > 0 && input.riskPct <= 0.2 ? input.riskPct : S.defaultRiskPct;
  const loss = lossAssumed(input);
  limits.push({ binding: "risco", usd: Math.max(0, (risk / loss) * portfolio - Math.max(0, input.heldUsd)) });
  if (finite(input.liquidityUsd)) limits.push({ binding: "liquidez", usd: input.liquidityUsd * S.liquidityShare });
  if (finite(input.volume24hUsd)) limits.push({ binding: "volume", usd: input.volume24hUsd * S.volumeShare });
  // a position sized by the stop (a hypothesis of loss, see SIZING.stopSizing) is also never more than a tenth of the portfolio
  if (stopSized(input)) limits.push({ binding: "concentracao", usd: portfolio * S.stopSizing.maxPositionShare });
  return { limits, portfolio };
}

const smallest = (limits: readonly { readonly binding: Binding; readonly usd: number }[]) => limits.reduce((a, b) => (b.usd < a.usd ? b : a));

/**
 * Which limit held a ceiling down and how many dollars it allowed, BEFORE the minimum order is applied: a ceiling under the minimum is reported as zero with the reason `minimo`, which hides what
 * was actually short (the risk the person accepts, the pool, the day's volume). Null where there are no limits to compare. For the study of why a purchase was not on offer; it decides nothing.
 */
export function tightestLimit(input: SizingInput): { readonly binding: Binding; readonly usd: number } | null {
  const l = limitsOf(input);
  return "none" in l ? null : smallest(l.limits);
}

export function capFor(input: SizingInput): SizingCap {
  const S = SIZING;
  const l = limitsOf(input);
  if ("none" in l) return l.none;
  const portfolio = l.portfolio;
  const tight = smallest(l.limits);
  const maxUsd = Math.floor(tight.usd);
  if (maxUsd < S.minOrderUsd) return { maxUsd: 0, binding: "minimo", sharePct: 0 };
  return { maxUsd, binding: tight.binding, sharePct: maxUsd / portfolio };
}

export interface Chosen {
  readonly candidateId: string;
  readonly chainIndex: string;
  readonly capUsd: number;
  readonly size: BuySize;
}

export interface Allocation extends Chosen {
  /** Dollars to put in, whole dollars, scaled down when the cash of the network would not cover the picks together. */
  readonly usd: number;
  readonly scaled: boolean;
}

/**
 * The picks in the order the model ranked them, as dollars. The cash of each network is spent in rank order: what the first pick takes is not there for the second, and a pick that the cash
 * cannot cover at the minimum order drops to zero. The total across networks never passes the total cash after its reserve, so one click cannot spend the whole balance.
 */
export function allocate(picks: readonly Chosen[], cashByChain: Readonly<Record<string, number>>, totalCashUsd: number, portfolioUsd: number, reserveShare?: number | null): Allocation[] {
  const S = SIZING;
  const left = new Map(Object.entries(cashByChain).map(([chain, usd]) => [chain, Math.max(0, usd * S.chainSpendShare)]));
  let budget = Math.max(0, Math.min(totalCashUsd * S.chainSpendShare, totalCashUsd - reserveOf(reserveShare) * portfolioUsd));
  return picks.map((pick): Allocation => {
    const wanted = Math.floor(pick.capUsd * FRACTIONS[pick.size]);
    const room = Math.min(left.get(pick.chainIndex) ?? 0, budget);
    const usd = Math.floor(Math.min(wanted, room));
    const spend = usd >= S.minOrderUsd ? usd : 0;
    left.set(pick.chainIndex, (left.get(pick.chainIndex) ?? 0) - spend);
    budget -= spend;
    return { ...pick, usd: spend, scaled: spend < wanted };
  });
}
