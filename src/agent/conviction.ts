/**
 * How sure the model is, and what that allows (ZC-10, docs/sdd/agente-autonomo/ADENDO-A-zero-configuracao.md). A TypeSafe Choice answers with the option it picked, a probability for every option and a confidence for the pick; "the answer tells you what, the
 * confidence tells you whether to act" (docs.typesafe.ai/patterns/confidence-routing). The agent used to read only the pick. Here the bar rises with the risk an action adds: a purchase needs conviction, and the
 * bigger the purchase the more of it; a purchase the model is only moderately sure of is made smaller, a weak one is not made, and not knowing how sure it is never buys. Doing nothing is not gated here; a sale is only moderated to the median of the model's own spread (`moderateSale`). Every number is a CHOICE of this code, conservative and not calibrated: the Placar says whether they are right. Pure.
 */
import { BUY_STANCES, type BuyStance } from "./types";

/** One answer of the model to one Choice, as the provider returns it. Probabilities and confidence are null when the adapter did not carry them. */
export interface Verdict {
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>> | null;
  readonly confidence: number | null;
}

/** The least conviction (0 to 1, the documented Choice confidence) each purchase size needs. Larger sizes need more. */
export const BUY_CONVICTION: Readonly<Record<Exclude<BuyStance, "skip">, number>> = { buy_tenth: 0.4, buy_third: 0.5, buy_two_thirds: 0.6, buy_full: 0.7 };

/**
 * The bars of the owner's bold profile, by the RANK of a size among the sizes on offer, smallest first (not by its name): the smallest purchase the code can carry out needs only a lean (a 60 percent choice between
 * buying and skipping is a confidence of 0.2), the next more, the biggest the most. By name, a wallet whose ceiling is a little over the minimum order is offered a single size called `buy_full` and the bar for the whole
 * risk budget would ask for 85 percent of a model that was only asked a yes or no. CHOICES of this code, not calibrated: the Placar measures what the purchases they let through earn.
 */
export const BUY_CONVICTION_BOLD = [0.2, 0.35, 0.5] as const;

/** From the largest purchase to the smallest: the order in which a purchase is made smaller. */
const LADDER = ["buy_full", "buy_two_thirds", "buy_third"] as const;

/**
 * The confidence of a Choice from its probabilities, by the formula the provider documents: how far the top probability stands above an even split, 0 for an even split and 1 for a certain answer. Null when the
 * numbers are not a distribution (a value outside 0 to 1, a sum that is not 1, fewer than two options).
 */
export function choiceConfidence(probabilities: Readonly<Record<string, number>>): number | null {
  const values = Object.values(probabilities);
  const n = values.length;
  if (n < 2 || !values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return null;
  if (Math.abs(values.reduce((s, v) => s + v, 0) - 1) > 0.02) return null;
  const peak = Math.max(...values);
  return Math.min(1, Math.max(0, (n * peak - 1) / (n - 1)));
}

/** The conviction behind an answer: the confidence the provider reported, else the one its probabilities give; null when neither is trustworthy or the probabilities do not back the pick. */
export function convictionOf(v: Verdict): number | null {
  const p = v.probabilities;
  if (p !== null) {
    // probabilities that are given must be a distribution as a whole, whatever confidence comes with them: a confidence is a summary of them, and cannot stand in for numbers that do not add up
    if (choiceConfidence(p) === null) return null;
    const own = Object.hasOwn(p, v.choice) ? p[v.choice] : undefined;
    // an answer whose own probabilities put another option on top is not an answer to act on
    if (own === undefined || !Number.isFinite(own) || own < Math.max(...Object.values(p))) return null;
  }
  if (v.confidence !== null) return Number.isFinite(v.confidence) && v.confidence >= 0 && v.confidence <= 1 ? v.confidence : null;
  return p === null ? null : choiceConfidence(p);
}

/** The steps of a holding from selling nothing to selling all: an ORDER, which a Choice does not know (its options come in no particular order) and the reading of the whole spread can use. */
const SALE_LADDER = ["hold", "trim_third", "trim_half", "exit_all"] as const;

/** The least number of measured sales before their record is believed: under this it says nothing (the Placar's own rule for a hit rate). */
const SELL_RECORD_MIN_N = 5;

/**
 * Where on the ladder a sale is read. One half (the median) is the neutral reading. Once the model's own sales have been measured (the Placar, one hour after each: how often selling beat keeping, in percent) and
 * kept losing to holding, the reading moves toward keeping: the lower the hit rate, the lower the quantile, down to a fifth at a hit rate of zero, so a sale needs the model to show far less doubt about it. At a hit
 * rate of one half or better, or while the sample is too small to say, it stays the median. A heuristic of this code, not a calibrated number: the Placar says whether the sales then improve.
 */
export function sellQuantile(record: { readonly n: number; readonly acerto: number | null } | null | undefined): number {
  if (record === null || record === undefined || record.acerto === null || !Number.isFinite(record.acerto) || record.n < SELL_RECORD_MIN_N) return 0.5;
  const bar = Math.min(0.3, Math.max(0, (0.6 * (50 - record.acerto)) / 100));
  return Math.round((0.5 - bar) * 1e6) / 1e6;
}

/**
 * The step a sale should take, read from everything the model spread over the ladder: the first step at which the probability gathered from "sell nothing" upward reaches one half (the median). The single top option can
 * be a coin flip (42 percent sell all, 23 sell half, 35 keep: the top option sells everything while 58 percent of the mass would stop at half or less), and a sale is not undone for free. It only ever moderates:
 * the step returned is never larger than the one asked for, a keep is never turned into a sale, and an answer whose probabilities are not a distribution, or do not back its pick, passes as it came. Pure.
 */
export function moderateSale(v: Verdict, offered: readonly string[], quantile = 0.5): string {
  const asked = SALE_LADDER.indexOf(v.choice as (typeof SALE_LADDER)[number]);
  if (asked <= 0 || v.probabilities === null || convictionOf(v) === null) return v.choice;
  const steps = SALE_LADDER.filter((s) => offered.includes(s) && Object.hasOwn(v.probabilities!, s));
  // the offered steps have to carry the whole distribution: mass on a step that was not offered cannot be placed on the ladder
  if (Math.abs(steps.reduce((sum, s) => sum + v.probabilities![s]!, 0) - 1) > 0.02) return v.choice;
  let gathered = 0;
  for (const step of steps) {
    gathered += v.probabilities[step]!;
    if (gathered >= quantile) return SALE_LADDER.indexOf(step) < asked ? step : v.choice;
  }
  return v.choice;
}

export type BuyGateReason = "opcao_invalida" | "sem_conviccao" | "abaixo_do_limiar";

export interface BuyGate {
  /** What the code lets through: the size asked for, a smaller one, or skip. */
  readonly stance: BuyStance;
  /** What the model asked for, as it came. */
  readonly requested: string;
  readonly conviction: number | null;
  /** The stance is not the one asked for. */
  readonly gated: boolean;
  readonly reason: BuyGateReason | null;
  /** The bar the answer was held against: the one of the size that was kept, or, when nothing was kept, the lowest one tried (the bar of the smallest size the answer could have fallen to); null when no bar was reached. */
  readonly bar: number | null;
}

/**
 * The purchase the conviction allows. `offered` are the stances the code put forward for this candidate: the result is always one of them, never larger than the one asked for, and `skip` when none fits.
 */
export function gateBuy(v: Verdict, offered: readonly string[], bold = false): BuyGate {
  const requested = v.choice;
  const refuse = (reason: BuyGateReason, conviction: number | null, bar: number | null = null): BuyGate => ({ stance: "skip", requested, conviction, gated: true, reason, bar });
  if (!(BUY_STANCES as readonly string[]).includes(requested)) return refuse("opcao_invalida", null);
  const conviction = convictionOf(v);
  if (requested === "skip") return { stance: "skip", requested, conviction, gated: false, reason: null, bar: null };
  if (conviction === null) return refuse("sem_conviccao", null);
  const asked = LADDER.indexOf(requested as (typeof LADDER)[number]);
  const sizes = [...LADDER].reverse().filter((s) => offered.includes(s));
  const bar = (s: (typeof LADDER)[number]): number => (bold ? BUY_CONVICTION_BOLD[Math.min(BUY_CONVICTION_BOLD.length - 1, sizes.indexOf(s))]! : BUY_CONVICTION[s]);
  // a confidence is a float: 0.6 between two options is 0.19999999999999996, and must clear a bar of 0.2
  const tried = LADDER.slice(asked).filter((s) => offered.includes(s));
  const pick = tried.find((s) => conviction + 1e-9 >= bar(s));
  if (pick === undefined) return refuse("abaixo_do_limiar", conviction, tried.length === 0 ? null : bar(tried[tried.length - 1]!));
  return { stance: pick, requested, conviction, gated: pick !== requested, reason: pick === requested ? null : "abaixo_do_limiar", bar: bar(pick) };
}

/** What the answer of the model needs for the conviction to be applied: its stances and, per candidate, the verdict it came with. */
export interface ConvictionInput {
  readonly stances: Readonly<Record<string, string>>;
  /** Per candidate id; absent for a candidate whose answer carried no probabilities (a provider that did not send them, or a fake). */
  readonly verdicts?: Readonly<Record<string, Verdict>>;
  /** How the model's own sales measured against keeping (see `sellQuantile`); absent or null when there is no record. */
  readonly sellRecord?: { readonly n: number; readonly acerto: number | null } | null;
  /** The owner's bold profile: the bars of a purchase are the lower ones, by rank of the size on offer (see `BUY_CONVICTION_BOLD`). */
  readonly bold?: boolean;
  /** The narrow yes or no judgments of the model per candidate id (facets.ts), each a probability. Read for the entries marked as stretched, parabolic or falling (see `CHASE_GATE`). */
  readonly facets?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** What the gate did to one purchase, with the raw numbers (the probabilities of a record are rounded to two places; these are not): the size asked, the one carried on, the conviction (six places) and the bar it was held against. */
export interface GateDetail {
  readonly asked: string;
  readonly applied: string;
  readonly conviction: number | null;
  readonly bar: number | null;
  /** Why the size changed: `abaixo_do_limiar`, `conviccao_desconhecida`, or the model's own view of the entry (`topo_*`, `queda_*`); null when the purchase went on as asked. */
  readonly reason: string | null;
}

const six = (x: number | null): number | null => (x === null ? null : Math.round(x * 1e6) / 1e6);

export interface ConvictionResult {
  readonly stances: Readonly<Record<string, string>>;
  /** Per purchase the answer asked for (a skip, a holding and an unoffered stance have none). */
  readonly gates: Readonly<Record<string, GateDetail>>;
  /** Constant codes, once each: `conviccao_reduziu`, `conviccao_recusou`, `conviccao_desconhecida`, `conviccao_moderou` (a sale taken down to the median step), and the model's own view of the top or of the fall: `topo_visto_pelo_jev`, `topo_sem_resposta`, `queda_vista_pelo_jev`, `queda_sem_resposta`. */
  readonly notes: readonly string[];
}

/**
 * The entries the code only MARKS (a price that is stretched, parabolic or falling fast) are not closed by the code: the model is asked two narrow questions about them (facets), and its answer is what lets the
 * purchase through. A high probability that the entry is late (a local top) or that the price is still falling skips the purchase; no answer is never read as calm, so a marked entry the model did not answer about
 * is skipped too. The numbers are CHOICES of this code, not calibrated: the Placar measures the skipped purchases against what the price did, and that is what says whether they are right.
 */
export const CHASE_GATE = { lateEntry: 0.7, stillFalling: 0.7 } as const;
const CHASING_MARKS = ["esticado", "parabolico"] as const;

/** Why the model's own answers about the moment of the entry refuse it, or null when they do not. A missing answer refuses: the marks are the risk the owner asked to avoid, and unknown is never calm. */
function chaseRefusal(marks: readonly string[], facets: Readonly<Record<string, number>> | undefined): "topo_visto_pelo_jev" | "topo_sem_resposta" | "queda_vista_pelo_jev" | "queda_sem_resposta" | null {
  if (CHASING_MARKS.some((m) => marks.includes(m))) {
    const late = facets?.late_entry;
    if (late === undefined || !Number.isFinite(late)) return "topo_sem_resposta";
    if (late >= CHASE_GATE.lateEntry) return "topo_visto_pelo_jev";
  }
  if (marks.includes("caindo")) {
    const falling = facets?.still_falling;
    if (falling === undefined || !Number.isFinite(falling)) return "queda_sem_resposta";
    if (falling >= CHASE_GATE.stillFalling) return "queda_vista_pelo_jev";
  }
  return null;
}

/**
 * What the model's answer says about how sure it was, WITHOUT changing anything: the owner decided on 2026-10-14 that the Jev decides, and that no bar, size reduction or veto of the code stands between its choice
 * and the order (docs/sdd/agente-autonomo/ADENDO-B-autonomia-economica.md AEC-12). The preference of a Choice is not a calibrated probability of profit; it is recorded, per purchase, next to what was asked, so the
 * study of the decisions can still see it. `applied` is always what the model asked for and `bar` is null: nothing was held against anything. Pure.
 */
export function describeAnswer(
  stances: Readonly<Record<string, string>>,
  verdicts: Readonly<Record<string, Verdict>> | undefined,
  candidates: readonly { readonly id: string; readonly kind: "buy" | "holding"; readonly stances: readonly string[] }[],
): Record<string, GateDetail> {
  const out: Record<string, GateDetail> = {};
  for (const c of candidates) {
    if (c.kind !== "buy") continue;
    const asked = stances[c.id];
    if (asked === undefined || asked === "skip" || !c.stances.includes(asked)) continue;
    const verdict = verdicts?.[c.id];
    out[c.id] = { asked, applied: asked, conviction: verdict === undefined ? null : six(convictionOf({ ...verdict, choice: asked })), bar: null, reason: null };
  }
  return out;
}

/**
 * NOT in the decision path any more (the owner's decision of 2026-10-14): `applyConviction`, `gateBuy`, `moderateSale` and the chase refusal below stay only because the study of the decisions and the review tests
 * characterize them. The cycle no longer calls them: what the Jev chose is what is carried on.
 *
 * The conviction applied to every purchase of an answer. A purchase is made smaller, or refused, by how sure the model was; one whose answer carried NO probabilities has an unknown conviction, which is never
 * invented: it may buy the smallest size offered and nothing more. A holding, a skip and a candidate the answer did not mention pass through, and the input is not changed. Pure.
 */
export function applyConviction(input: ConvictionInput, candidates: readonly { readonly id: string; readonly kind: "buy" | "holding"; readonly stances: readonly string[]; readonly marks?: readonly string[] }[]): ConvictionResult {
  const stances: Record<string, string> = { ...input.stances };
  const notes = new Set<string>();
  const gates: Record<string, GateDetail> = {};
  for (const c of candidates) {
    if (c.kind === "holding") {
      const sale = stances[c.id];
      const spread = input.verdicts?.[c.id];
      if (sale === undefined || spread === undefined || !c.stances.includes(sale)) continue;
      const moderated = moderateSale({ ...spread, choice: sale }, c.stances, sellQuantile(input.sellRecord));
      if (moderated !== sale) {
        stances[c.id] = moderated;
        notes.add("conviccao_moderou");
      }
      continue;
    }
    if (c.kind !== "buy") continue;
    const asked = stances[c.id];
    if (asked === undefined || asked === "skip") continue;
    // only a purchase size the code offered for this candidate is gated; anything else (a holding stance, an invented word, a size that was not offered) is left for the validation after this to refuse
    if (!(BUY_STANCES as readonly string[]).includes(asked) || !c.stances.includes(asked)) continue;
    const verdict = input.verdicts?.[c.id];
    let detail: { conviction: number | null; bar: number | null; reason: string | null };
    if (verdict === undefined) {
      // unknown: the smallest size, never more
      if (asked !== "buy_third") {
        stances[c.id] = c.stances.includes("buy_third") ? "buy_third" : "skip";
        notes.add("conviccao_desconhecida");
      } else notes.add("conviccao_desconhecida");
      detail = { conviction: null, bar: null, reason: "conviccao_desconhecida" };
    } else {
      const gate = gateBuy({ ...verdict, choice: asked }, c.stances, input.bold === true);
      if (gate.stance !== asked) {
        stances[c.id] = gate.stance;
        notes.add(gate.stance === "skip" ? "conviccao_recusou" : "conviccao_reduziu");
      }
      detail = { conviction: six(gate.conviction), bar: gate.bar, reason: gate.reason };
    }
    gates[c.id] = { asked, applied: stances[c.id]!, ...detail };
    if (stances[c.id] === "skip") continue;
    // the marks of the moment are facts the code gives and the model judges: a purchase that survived its conviction is still skipped when the model itself says the entry is late or the fall goes on
    const refusal = chaseRefusal(c.marks ?? [], input.facets?.[c.id]);
    if (refusal !== null) {
      stances[c.id] = "skip";
      notes.add(refusal);
      gates[c.id] = { ...gates[c.id]!, applied: "skip", reason: refusal };
    }
  }
  return { stances, notes: [...notes], gates };
}
