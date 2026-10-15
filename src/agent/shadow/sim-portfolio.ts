/**
 * The simulated portfolio of variant B (ADENDO-G, rule 1): cash and positions that evolve ONLY by the choices B makes, applied through a read only quote for the size asked. PURE: no I/O, no network, no model, no executor,
 * no signature and no write to the financial journal; it is not imported by the live agent. It applies what a quote says and never invents a number: a missing quote refuses the order, a cost that is unknown (null) is
 * counted as unknown and takes the run out of the primary measure (rule 4), and a position without a mark makes the equity unknown instead of being dropped. It does not evaluate a hypothesis, build the evidence frame
 * of the decision review (minor units, marks, receipts) or promote anything: those are the qualified evaluator's. Amounts are in dollars as the agent's journals keep them; the mapping to exact units is that evaluator's.
 */

/** A read only quote for the size asked. `out` is the quantity received on a buy and the dollars received on a sell. A cost is `null` when unknown and 0 only when known to be zero. */
export interface SimQuote {
  readonly atMs: number;
  readonly out: number | null;
  readonly networkFeeUsd: number | null;
  readonly tradeFeeUsd: number | null;
  /** The cost of opening the account of a token never held; 0 for a token already held and for any sell. */
  readonly accountOpenUsd: number | null;
}

export type SimOrder =
  | { readonly side: "buy"; readonly atMs: number; readonly id: string; readonly usd: number; readonly quote: SimQuote | null }
  | { readonly side: "sell"; readonly atMs: number; readonly id: string; readonly qty: number; readonly quote: SimQuote | null };

export interface SimPosition {
  readonly qty: number;
  /** Dollars paid for what is still held, fees included. */
  readonly costUsd: number;
}

export interface SimState {
  readonly cashUsd: number;
  readonly positions: Readonly<Record<string, SimPosition>>;
  /** Sum of the fees that were KNOWN when the orders were applied. */
  readonly feesUsd: number;
  /** Applied orders with at least one cost that was unknown. */
  readonly unknownCostOrders: number;
  readonly applied: number;
  readonly refused: number;
}

/** The property that failed. These words are this module's own: the live executor names its refusals differently (`saldo_insuficiente`, `taxa_sem_saldo`, `impacto_alto` in `cli.ts`), so mapping one vocabulary to the other is the evaluator's job. */
export type Refusal = "caixa" | "posicao" | "sem_cotacao" | "valor_invalido";

export type SimResult = { readonly ok: true; readonly state: SimState } | { readonly ok: false; readonly refusedBy: Refusal; readonly state: SimState };

export const newSim = (cashUsd: number): SimState => ({ cashUsd, positions: {}, feesUsd: 0, unknownCostOrders: 0, applied: 0, refused: 0 });

const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
const known = (n: number | null): n is number => n !== null && Number.isFinite(n) && n >= 0;

const refuse = (state: SimState, refusedBy: Refusal): SimResult => ({ ok: false, refusedBy, state: { ...state, refused: state.refused + 1 } });

/** The known part of the fees of a quote and whether any component is unknown. */
const feesOf = (q: SimQuote): { readonly knownUsd: number; readonly anyUnknown: boolean } => {
  const parts = [q.networkFeeUsd, q.tradeFeeUsd, q.accountOpenUsd];
  return { knownUsd: parts.reduce<number>((sum, p) => sum + (known(p) ? p : 0), 0), anyUnknown: parts.some((p) => !known(p)) };
};

export const applyOrder = (state: SimState, order: SimOrder): SimResult => {
  const quote = order.quote;
  if (order.side === "buy") {
    if (!positive(order.usd)) return refuse(state, "valor_invalido");
    if (quote === null || quote.out === null || !positive(quote.out)) return refuse(state, "sem_cotacao");
    const fees = feesOf(quote);
    if (state.cashUsd < order.usd + fees.knownUsd) return refuse(state, "caixa");
    const held = state.positions[order.id];
    return {
      ok: true,
      state: {
        cashUsd: state.cashUsd - order.usd - fees.knownUsd,
        positions: { ...state.positions, [order.id]: { qty: (held?.qty ?? 0) + quote.out, costUsd: (held?.costUsd ?? 0) + order.usd + fees.knownUsd } },
        feesUsd: state.feesUsd + fees.knownUsd,
        unknownCostOrders: state.unknownCostOrders + (fees.anyUnknown ? 1 : 0),
        applied: state.applied + 1,
        refused: state.refused,
      },
    };
  }
  if (!positive(order.qty)) return refuse(state, "valor_invalido");
  const held = state.positions[order.id];
  if (held === undefined || held.qty < order.qty) return refuse(state, "posicao");
  if (quote === null || quote.out === null || !Number.isFinite(quote.out) || quote.out < 0) return refuse(state, "sem_cotacao");
  const fees = feesOf(quote);
  const cashUsd = state.cashUsd + quote.out - fees.knownUsd;
  if (cashUsd < 0) return refuse(state, "caixa");
  const left = held.qty - order.qty;
  const { [order.id]: _gone, ...others } = state.positions;
  return {
    ok: true,
    state: {
      cashUsd,
      positions: left > 0 ? { ...others, [order.id]: { qty: left, costUsd: held.costUsd * (left / held.qty) } } : others,
      feesUsd: state.feesUsd + fees.knownUsd,
      unknownCostOrders: state.unknownCostOrders + (fees.anyUnknown ? 1 : 0),
      applied: state.applied + 1,
      refused: state.refused,
    },
  };
};

/** Cash plus every position at its mark. `usd` is null when any held position has no usable mark: the list says which, and no position is dropped. */
export const equityUsd = (state: SimState, marks: Readonly<Record<string, number | null>>): { readonly usd: number | null; readonly unmarked: readonly string[] } => {
  const unmarked: string[] = [];
  let total = state.cashUsd;
  for (const [id, p] of Object.entries(state.positions)) {
    const mark = marks[id];
    if (mark === null || mark === undefined || !Number.isFinite(mark) || mark < 0) unmarked.push(id);
    else total += p.qty * mark;
  }
  return { usd: unmarked.length === 0 ? total : null, unmarked };
};

/** Percent change of the equity over the start, with no external cash flow in the simulation. Null when the start is not positive, the end is unknown, or any applied order had an unknown cost. */
export const unitizedReturnPct = (startUsd: number | null, endUsd: number | null, state: SimState): number | null => {
  if (startUsd === null || endUsd === null || !positive(startUsd) || !Number.isFinite(endUsd) || state.unknownCostOrders > 0) return null;
  return (endUsd / startUsd - 1) * 100;
};
