/**
 * The agent's own risk discipline (AUT-31). The person does not supervise: the agent trades as soon as the money side is ready, and it is the agent that holds itself back. What pauses its NEW purchases for a day is
 * what the wallet REALLY lost, read from its value over time with the orders and the flows around it (`equity.ts`: the value of the day, the fall from the week's peak); the exits, the stops and the management of what it
 * holds go on, and the pause ends by itself. Every number is a CHOICE of this code, conservative and not calibrated. Pure: the wire reads the facts and applies the pause.
 *
 * The Placar is NOT a trigger. It measures decisions against an alternative that never happened: a purchase against keeping dollars at the end of a window, a sale against keeping the token. A position the agent bought and
 * then sold is still priced at four hours after the buy, so a fall after the exit shows up as a "loss" the wallet never had, and a token that rose after it was sold shows up as one too. Those numbers are facts for the
 * model and for the study of the decisions (its record in the Brief, the page), never dollars lost. An earlier version of this rule paused the purchases for a day from them (reasons `disjuntor_de_perda` and
 * `evidencia_perdida`); the pauses it left behind are looked at again by the agent itself (`lapsedPause`), with the event on the record.
 */

export const DISCIPLINE = {
  /** The measurement of the trading is read over this many days: only for the aggressive stance of a free profile (wire.ts), never for a pause. */
  evidenceDays: 7,
  /** How long new purchases stay paused. */
  pauseMs: 24 * 3_600_000,
} as const;

/** The pauses that the first version of this rule wrote from the Placar (a measurement against an alternative), not from the money. They are looked at again with the rule as it is now. */
export const LEGACY_PAUSE_REASONS: readonly string[] = ["disjuntor_de_perda", "evidencia_perdida"];

/**
 * Whether a pause already in force no longer stands: its reason is one of the legacy ones (written from a counterfactual) and the agent is trading. Nothing the rule reads now (the value of the wallet) is in that reason,
 * so such a pause is lifted by the agent itself (`resume`, which leaves the event on the record with the reason `pausa_reavaliada`); a pause for another reason, such as the value of the wallet falling, is never touched by
 * this, and one the agent is not trading under is left for the connection to decide.
 */
export function lapsedPause(reason: string | null, trading: boolean): boolean {
  return trading && reason !== null && LEGACY_PAUSE_REASONS.includes(reason);
}
