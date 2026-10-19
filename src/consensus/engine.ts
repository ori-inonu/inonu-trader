/**
 * Sequential DECISIONS with the Jev as the judge, until the answers agree (the owner's request of 2026-10-15: adapt sequential thinking to the Jev, so that something is implemented only after a common consensus).
 * Sequential thinking records steps of reasoning; this records steps of JUDGMENT. Code owns the workflow and every gate; the Jev supplies narrow judgments (System One Choice questions over the same state), and nothing it
 * says authorizes anything: a consensus is a recommendation with a receipt, and the receipt says so.
 *
 * One round asks, over the same state: (1) the same question in several FRAMINGS, each showing the options in a different order (so a bias for the first option cannot win), and (2) once per option, whether it crosses
 * one of the rails (limits that must not be crossed). The answers are aggregated by the code, not by the model. There is consensus only when, in two consecutive rounds, the same option leads with enough probability,
 * enough margin over the next, agreement across the framings, a low probability of crossing a rail and a low probability that "none fits". Between rounds the options clearly behind are dropped, so the rounds narrow.
 * Without consensus the Jev is asked which missing fact would most change the choice, and that question goes to the person: the code never implements on its own. Every number is a registered CHOICE, not calibrated.
 * Pure but for the judge handed in: no clock, no network, no storage, no environment.
 */
import { createHash } from "node:crypto";

export interface Option {
  readonly id: string;
  readonly label: string;
  readonly what: string;
}

export interface DecisionSpec {
  readonly id: string;
  /** What is to be achieved, in plain words. Sanitized: no address, key or secret. */
  readonly goal: string;
  /** The facts the judge may use. Sanitized. Anything not here, the judge does not know. */
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
  /** Limits that must not be crossed, in words. The judge is asked about each option against them; the code gates stay in the options. */
  readonly rails: readonly string[];
  readonly options: readonly Option[];
  /** Option ids the CODE removes before asking anything (what is forbidden is not a matter of opinion). */
  readonly forbidden?: readonly string[];
  /** Facts that would change the answer, for the question to the person when there is no consensus. */
  readonly unknowns?: readonly { readonly id: string; readonly ask: string }[];
}

export type QuestionKind = "pick" | "rail" | "unknown";

export interface JudgeQuestion {
  readonly kind: QuestionKind;
  readonly id: string;
  /** The answer keys, in the order shown to the judge. */
  readonly keys: readonly string[];
  readonly optionId?: string;
  readonly state: Readonly<Record<string, unknown>>;
  readonly instructions: { readonly question: string; readonly goal: string; readonly inputs: string };
  readonly criteria: Readonly<Record<string, string>>;
}

export interface JudgeAnswer {
  readonly probabilities: Readonly<Record<string, number>>;
}

/** The judge: null when the question could not be answered (never an exception, never a guess). */
export interface Judge {
  ask(question: JudgeQuestion): Promise<JudgeAnswer | null>;
}

export const CONSENSUS_POLICY = {
  /** Framings of the same question per round: the options are rotated so each is shown first once. */
  framings: 3,
  rounds: 3,
  /** The leader needs at least this mean probability, this margin over the next option and this share of the framings. */
  minMean: 0.5,
  minMargin: 0.2,
  minAgreement: 2 / 3,
  /** The highest probability that the leader crosses a rail, and that "none fits". */
  maxRail: 0.2,
  maxNoneFits: 0.3,
  /** An option under this mean is dropped for the next round, unless it is one of the two in front. */
  pruneBelow: 0.1,
  /** The same leader must hold in this many consecutive rounds. */
  stableRounds: 2,
} as const;

export type Status = "consenso" | "sem_consenso" | "sem_opcoes" | "juiz_falhou";

export interface RoundRecord {
  readonly round: number;
  readonly options: readonly string[];
  readonly framings: readonly { readonly order: readonly string[]; readonly probs: Readonly<Record<string, number>> | null }[];
  readonly means: Readonly<Record<string, number>>;
  readonly noneFits: number;
  readonly agreement: number;
  readonly margin: number;
  readonly leader: string | null;
  readonly railProb: Readonly<Record<string, number | null>>;
  readonly consensusHere: boolean;
}

export interface Receipt {
  readonly v: 1;
  readonly specId: string;
  readonly specHash: string;
  readonly status: Status;
  readonly leader: string | null;
  /** True only on consensus: the recommendation may go on to the gates of the code and of the owner. It never implements anything itself. */
  readonly implement: boolean;
  readonly removedByCode: readonly string[];
  readonly rounds: readonly RoundRecord[];
  /** The question to the person when there is no consensus, from the missing fact the judge found most decisive; null when none. */
  readonly askUser: string | null;
  readonly calls: { readonly asked: number; readonly failed: number };
  readonly policy: typeof CONSENSUS_POLICY;
  readonly disclaimer: string;
}

export const DISCLAIMER = "A recommendation of the judge, with a receipt: it does not authorize an order, a restart or any change to the live agent; implementation only follows through the gates of the code and the decision of the owner. It does not prove profit.";

// ---- what may be sent -------------------------------------------------------------------------------------------------------------------------------------------------------------

const SENSITIVE: readonly [RegExp, string][] = [
  [/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/, "endereco"],
  [/\b0x[0-9a-fA-F]{40}\b/, "endereco"],
  [/\b(api[_ -]?key|secret|password|private[_ -]?key|seed phrase|mnemonic)\b\s*[:=]/i, "segredo"],
  [/\bTYPESAFE[A-Z_]*\s*=/i, "segredo"],
  [/\bsk-[A-Za-z0-9]{8,}\b/, "segredo"],
];

export const assertNoSensitiveText = (text: string, where: string): void => {
  for (const [pattern, kind] of SENSITIVE) if (pattern.test(text)) throw new Error(`spec_com_dado_sensivel: ${kind} em ${where}`);
};

/** Refuses a spec that carries an address, a key or a secret, or whose options cannot be told apart. Returns the spec when it is fit to be sent. */
export function sanitizeSpec(spec: DecisionSpec): DecisionSpec {
  assertNoSensitiveText(spec.id, "id");
  assertNoSensitiveText(spec.goal, "goal");
  for (const [k, v] of Object.entries(spec.facts)) assertNoSensitiveText(`${k} ${typeof v === "string" ? v : ""}`, `facts.${k}`);
  spec.rails.forEach((r, i) => assertNoSensitiveText(r, `rails[${i}]`));
  spec.options.forEach((o) => assertNoSensitiveText(`${o.id} ${o.label} ${o.what}`, `options.${o.id}`));
  (spec.unknowns ?? []).forEach((u) => assertNoSensitiveText(`${u.id} ${u.ask}`, `unknowns.${u.id}`));
  if (new Set(spec.options.map((o) => o.id)).size !== spec.options.length) throw new Error("opcoes_repetidas");
  if (spec.options.some((o) => o.id === "none_fits" || o.id === "none")) throw new Error("opcao_com_nome_reservado");
  return spec;
}

const stable = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};
const hashOf = (value: unknown): string => createHash("sha256").update(stable(value)).digest("hex");

/** The canonical identity used by receipts and matching plan/run requests. */
export function specFingerprint(raw: DecisionSpec): string {
  const spec = sanitizeSpec(raw);
  return hashOf({ ...spec, forbidden: [...new Set(spec.forbidden ?? [])].sort() });
}

/** The most questions the procedure can ask: its rounds times its framings, one rail question per option and, with unknowns, the question of the missing fact. Known before any question is asked. */
export function plannedCalls(spec: DecisionSpec, policy: typeof CONSENSUS_POLICY = CONSENSUS_POLICY): number {
  const left = spec.options.filter((o) => !(spec.forbidden ?? []).includes(o.id)).length;
  return policy.rounds * policy.framings + left + ((spec.unknowns ?? []).length > 0 ? 1 : 0);
}

// ---- the questions ----------------------------------------------------------------------------------------------------------------------------------------------------------------

const rotate = <T>(xs: readonly T[], by: number): T[] => xs.map((_, i) => xs[(i + by) % xs.length]!);

const stateOf = (spec: DecisionSpec, options: readonly Option[]): Record<string, unknown> => ({ goal: spec.goal, facts: spec.facts, rails: spec.rails, options: options.map((o) => ({ id: o.id, label: o.label, what: o.what })) });

function pickQuestion(spec: DecisionSpec, round: number, framing: number, options: readonly Option[]): JudgeQuestion {
  const ordered = rotate(options, framing);
  const keys = [...ordered.map((o) => o.id), "none_fits"];
  return {
    kind: "pick",
    id: `pick:r${round}:f${framing}`,
    keys,
    state: stateOf(spec, ordered),
    instructions: {
      question: "Which option best serves the goal, given the facts and without crossing any rail? Choose none_fits only if no option serves the goal without crossing a rail.",
      goal: "Choose what a careful engineer would implement now. The rails are limits that must not be crossed; the facts are all that is known.",
      inputs: "state.goal is the aim, state.facts what is known, state.rails the limits, state.options the candidates with an id, a label and what each does.",
    },
    criteria: { ...Object.fromEntries(ordered.map((o) => [o.id, `Choose ${o.id}: ${o.label}. ${o.what}`])), none_fits: "No option serves the goal without crossing a rail." },
  };
}

function railQuestion(spec: DecisionSpec, option: Option): JudgeQuestion {
  return {
    kind: "rail",
    id: `rail:${option.id}`,
    optionId: option.id,
    keys: ["violates", "compatible"],
    state: { goal: spec.goal, facts: spec.facts, rails: spec.rails, option: { id: option.id, label: option.label, what: option.what } },
    instructions: {
      question: "Does this option, as described, cross any of the rails?",
      goal: "Check the one option against every rail. A rail is crossed if the option does it or needs an action that the rail forbids.",
      inputs: "state.option is the candidate, state.rails the limits, state.facts what is known.",
    },
    criteria: { violates: "The option crosses at least one rail, or needs an action a rail forbids.", compatible: "The option stays inside every rail." },
  };
}

function unknownQuestion(spec: DecisionSpec, round: number, options: readonly Option[]): JudgeQuestion {
  const unknowns = spec.unknowns ?? [];
  return {
    kind: "unknown",
    id: `unknown:r${round}`,
    keys: [...unknowns.map((u) => u.id), "none"],
    state: stateOf(spec, options),
    instructions: {
      question: "Which single missing fact, if it were known, would most change the choice between the options?",
      goal: "Name the one unknown that the choice depends on the most, or none if no unknown would change it.",
      inputs: "state.options are the candidates still open; the criteria list the unknowns.",
    },
    criteria: { ...Object.fromEntries(unknowns.map((u) => [u.id, `The missing fact: ${u.ask}`])), none: "No missing fact would change the choice." },
  };
}

// ---- the procedure ----------------------------------------------------------------------------------------------------------------------------------------------------------------

const valid = (probs: Readonly<Record<string, number>>, keys: readonly string[]): boolean => keys.every((k) => typeof probs[k] === "number" && Number.isFinite(probs[k]!) && probs[k]! >= 0 && probs[k]! <= 1);
const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

export async function decide(rawSpec: DecisionSpec, judge: Judge, policy: typeof CONSENSUS_POLICY = CONSENSUS_POLICY): Promise<Receipt> {
  const spec = sanitizeSpec(rawSpec);
  const forbidden = new Set(spec.forbidden ?? []);
  const removedByCode = spec.options.filter((o) => forbidden.has(o.id)).map((o) => o.id);
  let open = spec.options.filter((o) => !forbidden.has(o.id));
  const base = { v: 1 as const, specId: spec.id, specHash: specFingerprint(spec), removedByCode, policy, disclaimer: DISCLAIMER };
  let asked = 0;
  let failed = 0;
  const ask = async (q: JudgeQuestion): Promise<Readonly<Record<string, number>> | null> => {
    asked++;
    let answer: JudgeAnswer | null = null;
    try {
      answer = await judge.ask(q);
    } catch {
      answer = null;
    }
    if (answer === null || !valid(answer.probabilities, q.keys)) {
      failed++;
      return null;
    }
    return answer.probabilities;
  };
  const done = (status: Status, leader: string | null, rounds: RoundRecord[], askUser: string | null): Receipt => ({ ...base, status, leader, implement: status === "consenso", rounds, askUser, calls: { asked, failed } });

  if (open.length < 2) return done("sem_opcoes", null, [], null);

  const rails = new Map<string, number | null>();
  const rounds: RoundRecord[] = [];
  let streak = 0;
  let streakLeader: string | null = null;

  for (let r = 1; r <= policy.rounds; r++) {
    const framings: { order: string[]; probs: Record<string, number> | null }[] = [];
    for (let f = 0; f < policy.framings; f++) {
      const q = pickQuestion(spec, r, f, open);
      const probs = await ask(q);
      framings.push({ order: q.keys.filter((k) => k !== "none_fits"), probs: probs === null ? null : { ...probs } });
    }
    for (const o of open) {
      if (rails.has(o.id)) continue;
      const probs = await ask(railQuestion(spec, o));
      rails.set(o.id, probs === null ? null : round4(probs.violates!));
    }
    const ok = framings.filter((f) => f.probs !== null);
    if (ok.length < Math.ceil(policy.framings / 2)) {
      rounds.push({ round: r, options: open.map((o) => o.id), framings, means: {}, noneFits: 0, agreement: 0, margin: 0, leader: null, railProb: Object.fromEntries(open.map((o) => [o.id, rails.get(o.id) ?? null])), consensusHere: false });
      return done("juiz_falhou", null, rounds, null);
    }
    const means: Record<string, number> = {};
    for (const o of open) means[o.id] = round4(ok.reduce((s, f) => s + f.probs![o.id]!, 0) / ok.length);
    const noneFits = round4(ok.reduce((s, f) => s + f.probs!.none_fits!, 0) / ok.length);
    const ranked = [...open].sort((a, b) => means[b.id]! - means[a.id]! || (a.id < b.id ? -1 : 1));
    const leader = ranked[0]!.id;
    const second = ranked[1];
    const margin = round4(means[leader]! - (second === undefined ? 0 : means[second.id]!));
    const wins = ok.filter((f) => open.every((o) => f.probs![leader]! >= f.probs![o.id]!)).length;
    const agreement = round4(wins / ok.length);
    const railOfLeader = rails.get(leader) ?? null;
    const consensusHere = means[leader]! >= policy.minMean && margin >= policy.minMargin && agreement >= policy.minAgreement - 1e-9 && railOfLeader !== null && railOfLeader <= policy.maxRail && noneFits <= policy.maxNoneFits;
    rounds.push({ round: r, options: open.map((o) => o.id), framings, means, noneFits, agreement, margin, leader, railProb: Object.fromEntries(open.map((o) => [o.id, rails.get(o.id) ?? null])), consensusHere });

    if (consensusHere) {
      streak = streakLeader === leader ? streak + 1 : 1;
      streakLeader = leader;
      if (streak >= policy.stableRounds) return done("consenso", leader, rounds, null);
    } else {
      streak = 0;
      streakLeader = null;
      const keep = new Set([ranked[0]!.id, second?.id].filter((x): x is string => x !== undefined));
      const narrowed = open.filter((o) => means[o.id]! >= policy.pruneBelow || keep.has(o.id));
      if (narrowed.length >= 2) open = narrowed;
    }
  }

  // no consensus: the question that goes to the person is the missing fact the judge finds most decisive
  let askUser: string | null = null;
  const unknowns = spec.unknowns ?? [];
  if (unknowns.length > 0) {
    const probs = await ask(unknownQuestion(spec, policy.rounds + 1, open));
    if (probs !== null) {
      const best = [...unknowns].sort((a, b) => probs[b.id]! - probs[a.id]!)[0]!;
      if (probs[best.id]! >= (probs.none ?? 0) && probs[best.id]! >= 0.3) askUser = best.ask;
    }
  }
  return done("sem_consenso", null, rounds, askUser);
}
