/**
 * The risk profile of the person (INT-1.7, VER-4): the capital they decided to trade with and the share of it they accept to
 * lose in one operation. The Veredito needs both to turn the distance to the invalidation into a size; without them it shows no
 * size at all. One small file in the data folder, read strictly and written atomically, like the price per token: anything that is
 * not exactly two sensible numbers, or two nulls, is "no profile". It is the person's own number and never leaves this machine.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RiskProfile } from "./types";

export const MAX_CAPITAL_USD = 1_000_000_000;
/** Above this share of the capital per operation it is a bet, not a risk: refused as a typing mistake. */
export const MAX_RISK_PCT = 10;

const NONE: RiskProfile = { capitalUsd: null, riskPct: null };

const capital = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_CAPITAL_USD;
const risk = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_RISK_PCT;

/** Whether a value is a profile that can be stored: two sensible numbers, or two nulls (to clear). */
export function validProfile(v: unknown): v is RiskProfile {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== 2 || !("capitalUsd" in o) || !("riskPct" in o)) return false;
  return (o.capitalUsd === null && o.riskPct === null) || (capital(o.capitalUsd) && risk(o.riskPct));
}

export function createProfileStore(options: { readonly file: string }) {
  return {
    read(): RiskProfile {
      try {
        const raw: unknown = JSON.parse(readFileSync(options.file, "utf8"));
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return NONE;
        const o = raw as Record<string, unknown>;
        return o.v === 1 && capital(o.capitalUsd) && risk(o.riskPct) ? { capitalUsd: o.capitalUsd, riskPct: o.riskPct } : NONE;
      } catch {
        return NONE;
      }
    },
    /** False when the profile is not storable or the file could not be written. */
    write(profile: RiskProfile): boolean {
      if (!validProfile(profile)) return false;
      try {
        mkdirSync(dirname(options.file), { recursive: true });
        const temp = `${options.file}.tmp`;
        writeFileSync(temp, JSON.stringify({ v: 1, capitalUsd: profile.capitalUsd, riskPct: profile.riskPct }));
        renameSync(temp, options.file);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type ProfileStore = ReturnType<typeof createProfileStore>;
