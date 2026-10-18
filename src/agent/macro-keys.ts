/**
 * The keys of the macro market context (ADENDO-E, E1): the legend the model is told, and the two helpers that know which keys mean "a macro projection is here" and which change with the clock alone. No imports: the Brief
 * (`model.ts`) and the host (`macro-context.ts`) both use it without pulling each other in.
 */

/** What the model is told about the macro keys. Added to `chaves` only when the context carries them. */
export const MACRO_LEGEND =
  "the minute regime of the reference markets (<p> is the prefix: btc, sol): <p>_1m <p>_5m percent move of the last 1 and 5 closed minutes; <p>_fl balance of aggressor volume over 5 minutes, from -1 (sellers) to 1 (buyers); <p>_rv realized volatility in percent per minute over 15 minutes; <p>_fh hash of the observation (equal numbers with another hash are another observation); <p>_age_ms how old the observation was when this context was made; <p>_asof_ms the time this context was made; <p>_bars closed minutes in the series; <p>_gaps minutes missing among the last 15; <p>_gen reconnects of the feed; all ten are null when the market is missing or too old: that is unknown, not calm";

const AGE_OR_ASOF = /_(age_ms|asof_ms)$/;

/** True when a context carries a macro projection (the hash of an observation is its mark). */
export const hasMacroKeys = (context: Readonly<Record<string, unknown>> | null): boolean => context !== null && Object.keys(context).some((key) => key.endsWith("_fh"));

/** The context without the keys that change with the clock alone: what decides whether the Brief is materially the same as the last one asked (the full Brief, with everything, is what the proof recomputes). */
export function materialContext<T extends Readonly<Record<string, unknown>>>(context: T | null): Readonly<Record<string, unknown>> | null {
  return context === null ? null : Object.fromEntries(Object.entries(context).filter(([key]) => !AGE_OR_ASOF.test(key)));
}

