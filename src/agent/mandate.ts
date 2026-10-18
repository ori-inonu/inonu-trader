/**
 * The mandate: the standing choices the agent's own strategy rests on, made by the model (Jev) with System One's reading in front of it, among closed options. Nobody types them. The person connects a wallet;
 * the mandate says how much risk to take, how much cash never to spend, how big a single bet may be and how often to look again. The code turns each word into numbers inside the app's ceilings (autopilot.ts), so
 * the model never writes a number, and it moves at most one step per cycle in each choice, so a single answer cannot swing the agent from careful to aggressive. Pure apart from the injected store.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const RISKS = ["cauteloso", "moderado", "agressivo"] as const;
export const RESERVES = ["baixa", "media", "alta"] as const;
export const CONCENTRATIONS = ["pequena", "media", "grande"] as const;
export const LOOKS = ["rapido", "normal", "calmo"] as const;

export type Risk = (typeof RISKS)[number];
export type Reserve = (typeof RESERVES)[number];
export type Concentration = (typeof CONCENTRATIONS)[number];
export type Look = (typeof LOOKS)[number];

export interface Mandate {
  /** How much of the portfolio one operation may put at risk. */
  readonly risk: Risk;
  /** The cash that is never spent. */
  readonly reserve: Reserve;
  /** How big one purchase may be, against the portfolio. */
  readonly concentration: Concentration;
  /** How soon the agent looks again. */
  readonly look: Look;
}

/** Where the agent starts, before the model has chosen anything: the middle of every choice. */
export const DEFAULT_MANDATE: Mandate = { risk: "moderado", reserve: "media", concentration: "media", look: "normal" };

export const MANDATE_OPTIONS: { readonly [K in keyof Mandate]: readonly Mandate[K][] } = { risk: RISKS, reserve: RESERVES, concentration: CONCENTRATIONS, look: LOOKS };

/** The mandate in an answer of the model, or null when any choice is missing or is not one of the options. */
export function parseMandate(raw: unknown): Mandate | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== 4) return null;
  const { risk, reserve, concentration, look } = o;
  if (!(RISKS as readonly unknown[]).includes(risk) || !(RESERVES as readonly unknown[]).includes(reserve) || !(CONCENTRATIONS as readonly unknown[]).includes(concentration) || !(LOOKS as readonly unknown[]).includes(look)) return null;
  return { risk, reserve, concentration, look } as Mandate;
}

const stepOf = <T extends string>(options: readonly T[], current: T, wanted: T): T => {
  const from = options.indexOf(current);
  const to = options.indexOf(wanted);
  if (from < 0) return wanted;
  if (to < 0 || to === from) return current;
  return options[from + Math.sign(to - from)]!;
};

/** One step per choice toward what the model wants: a single answer never swings the agent from careful to aggressive. */
export function stepToward(current: Mandate, wanted: Mandate): Mandate {
  return {
    risk: stepOf(RISKS, current.risk, wanted.risk),
    reserve: stepOf(RESERVES, current.reserve, wanted.reserve),
    concentration: stepOf(CONCENTRATIONS, current.concentration, wanted.concentration),
    look: stepOf(LOOKS, current.look, wanted.look),
  };
}

export interface MandateRecord {
  readonly mandate: Mandate;
  /** When the model last changed it; null while it is still the starting one. */
  readonly changedAtMs: number | null;
}

export interface MandateStore {
  get(): MandateRecord;
  /** The model's wish for the next cycles; the stored mandate moves one step toward it. Returns the mandate in force afterwards. */
  apply(wanted: Mandate, nowMs: number): MandateRecord;
  health(): { readonly ok: boolean };
}

export interface MandateIo {
  readonly read: () => unknown;
  readonly write: (value: { readonly version: 1; readonly mandate: Mandate; readonly changedAtMs: number | null }) => void;
}

export function createMandateStore(io: MandateIo): MandateStore {
  let record: MandateRecord = { mandate: DEFAULT_MANDATE, changedAtMs: null };
  let healthy = true;
  try {
    const raw = io.read();
    if (raw !== null) {
      const o = raw as { version?: unknown; mandate?: unknown; changedAtMs?: unknown };
      const mandate = parseMandate(o?.mandate);
      if (o === null || typeof o !== "object" || o.version !== 1 || mandate === null || (o.changedAtMs !== null && !(typeof o.changedAtMs === "number" && Number.isSafeInteger(o.changedAtMs) && o.changedAtMs >= 0))) throw new Error("shape");
      record = { mandate, changedAtMs: o.changedAtMs as number | null };
    }
  } catch {
    // a mandate that cannot be read is the starting one, never a guess
    healthy = false;
    record = { mandate: DEFAULT_MANDATE, changedAtMs: null };
  }
  return {
    get: () => record,
    health: () => ({ ok: healthy }),
    apply(wanted, nowMs) {
      const next = stepToward(record.mandate, wanted);
      if (JSON.stringify(next) === JSON.stringify(record.mandate)) return record;
      const updated: MandateRecord = { mandate: next, changedAtMs: nowMs };
      try {
        io.write({ version: 1, mandate: next, changedAtMs: nowMs });
      } catch {
        // not saved, not changed: the next cycle tries again from the same place
        return record;
      }
      record = updated;
      healthy = true;
      return record;
    },
  };
}

export function mandateFileStore(path: string): MandateIo {
  return {
    read: () => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as unknown) : null),
    write: (value) => {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(value)}\n`);
      renameSync(tmp, path);
    },
  };
}
