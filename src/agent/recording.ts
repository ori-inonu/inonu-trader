/**
 * The two durable records the laboratory of the autoevolution needs from the PRODUCER (ADENDO-G, section 5), written by the agent itself and never read by anything that decides:
 *
 *  - `answers.jsonl`: what the Jev answered at each look, one line per consultation: the probability of every option of every candidate, what it asked for and what was carried out, the options the code had offered, the
 *    marks and facets, the clocks the cycle measured and the short hash of the Brief (the whole Brief stays where it is). `briefs.jsonl` already keeps the same probabilities, but only for the last 120 consultations (about
 *    four hours) and then overwrites them; this one is append only.
 *  - `prices.jsonl`: the price path of what the agent holds and of the candidates of the ecosystem, taken ONLY from reads the cycle already makes (the guard book every few seconds, the book of each look, the ecosystem of
 *    each look): no new request, no new quota. The sources give NO observation time for a price: the book and the ecosystem are stamped with the time the cycle READ them, and the ecosystem comes from a hot list kept
 *    for minutes (5 to 30 according to ADENDO-E), so a price can be older than the row that carries it. A row therefore says only when it was read (`atMs`), says `obsAtMs: null`, and says how many of its prices changed
 *    since the previous row of the same source (`changed`): a read of the same cached value is a row with `changed: 0`, and the first row where a value changes is a change that happened at or BEFORE that read. The
 *    resolution is the one of those reads, and a token that leaves the hot list has no path after it leaves: a coverage limit, not a price of zero.
 *
 * Both are derived, separate, reconstructable and best effort: a record that could not be kept costs that record, is counted in `recording-status.json`, and never reaches the cycle as an error. Nothing here changes
 * a Brief, a stance, an order or the record that is hashed. Sizes (8 MB a segment, 5 segments) are CHOICES, not calibrated.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { isEcoSourceFresh, type EcoContext } from "../opportunity/ecosystem";
import type { ConsultMeta, ConsultRecord } from "./cycle";
import { planKey } from "./plans";
import type { Book } from "./types";

export interface AnswerItem {
 readonly id: string;
 readonly kind: "holding" | "buy";
 /** The stances the code offered for the candidate. */
 readonly offered: readonly string[];
 /** What the Jev asked for, before any rule of the code; null when the answer did not name the candidate. */
 readonly requested: string | null;
 /** What was carried on; null when the cycle decided nothing about it. */
 readonly applied: string | null;
 /** The probability of every option, rounded to two places by the cycle; null when the provider sent none (never zero). */
 readonly probs: Readonly<Record<string, number>> | null;
 readonly facets: Readonly<Record<string, number>> | null;
 readonly marks: readonly string[];
 readonly triggers: readonly string[];
 readonly families: readonly string[];
 readonly cap: unknown;
}

export interface AnswerRecord {
 readonly v: 1;
 readonly cycleId: string;
 /** The start of the cycle. */
 readonly atMs: number;
 readonly recordedAtMs: number;
 /** The clocks the cycle measured around the call of the model; null when it did not hand them over. */
 readonly askedAtMs: number | null;
 readonly answeredAtMs: number | null;
 readonly mode: string;
 /** The first 16 characters of the hash of the Brief the model read: the whole Brief is kept apart. */
 readonly briefHash: string;
 readonly valid: boolean;
 readonly invalidReason: string | null;
 readonly posture: string;
 readonly postureProbs: Readonly<Record<string, number>> | null;
 readonly notes: readonly string[];
 readonly items: readonly AnswerItem[];
}

/** One consultation as the laboratory needs it. Pure. */
export function answerRecord(entry: ConsultRecord, meta: ConsultMeta | undefined, recordedAtMs: number): AnswerRecord {
 return {
  v: 1,
  cycleId: entry.cycleId,
  atMs: entry.atMs,
  recordedAtMs,
  askedAtMs: meta?.askedAtMs ?? null,
  answeredAtMs: meta?.answeredAtMs ?? null,
  mode: entry.mode,
  briefHash: entry.briefHash,
  valid: entry.valid,
  invalidReason: entry.invalidReason,
  posture: entry.posture,
  postureProbs: entry.postureProbs ?? null,
  notes: entry.notes,
  items: entry.candidates.map((c) => {
   const probs = entry.verdicts[c.id];
   const facets = entry.facets[c.id];
   return {
    id: c.id,
    kind: c.kind,
    offered: c.stances,
    requested: entry.requested[c.id] ?? null,
    applied: entry.stances[c.id] ?? null,
    probs: probs === undefined || Object.keys(probs).length === 0 ? null : probs,
    facets: facets === undefined || Object.keys(facets).length === 0 ? null : facets,
    marks: c.marks,
    triggers: c.triggers,
    families: c.families,
    cap: (c as { cap?: unknown }).cap ?? null,
   };
  }),
 };
}

export type PriceSource = "guard" | "look" | "eco";

export interface PriceRow {
 readonly v: 1;
 /** When the cycle had this read in hand: the only time the sources give. A price may be older than this. */
 readonly atMs: number;
 /** When the source observed the price. ALWAYS null today: neither the book nor the ecosystem carries one. */
 readonly obsAtMs: null;
 readonly src: PriceSource;
 /** How many prices the row carries, and how many of them are new or different from the previous row of the same source (filled in when it is recorded). */
 readonly n: number;
 readonly changed: number;
 /** Dollars per unit, by plan key (`501:<mint>`). */
 readonly prices: Readonly<Record<string, number>>;
}

const priced = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** The price of each token the agent holds in a book (cash, the other wallet and a token with no price are left out); null when nothing is priced. Pure. */
export function priceRowFromBook(book: Book, atMs: number, src: "guard" | "look"): PriceRow | null {
 const prices: Record<string, number> = {};
 for (const p of book.positions) if (p.wallet === "agente" && !p.isCash && priced(p.priceUsd)) prices[planKey(p.chainIndex, p.address)] = p.priceUsd;
 return Object.keys(prices).length === 0 ? null : { v: 1, atMs, obsAtMs: null, src, n: Object.keys(prices).length, changed: Object.keys(prices).length, prices };
}

/** The price of each candidate of the ecosystem read at a look; null when none has one. Pure. */
export function priceRowFromEco(eco: EcoContext, atMs: number): PriceRow | null {
 if (!isEcoSourceFresh(eco)) return null;
 const prices: Record<string, number> = {};
 for (const c of eco.candidates) if (priced(c.facts.priceUsd)) prices[planKey(c.facts.chainIndex, c.facts.address)] = c.facts.priceUsd;
 return Object.keys(prices).length === 0 ? null : { v: 1, atMs, obsAtMs: null, src: "eco", n: Object.keys(prices).length, changed: Object.keys(prices).length, prices };
}

export interface JournalStatus {
 readonly written: number;
 readonly dropped: number;
 readonly bytes: number;
 readonly lastAtMs: number | null;
 readonly lastError: string | null;
}

export interface Journal {
 /** Appends one line; false (counted, never thrown) when it could not be kept. */
 append(record: unknown): boolean;
 status(): JournalStatus;
}

/** An append-only JSONL journal that moves to the next numbered segment past `maxBytes` and keeps the newest `keep` segments besides the current one. */
export function createJournal(opts: { readonly dir: string; readonly name: string; readonly maxBytes: number; readonly keep: number; readonly now: () => number }): Journal {
 const current = join(opts.dir, `${opts.name}.jsonl`);
 const segment = (n: number): string => join(opts.dir, `${opts.name}.${n}.jsonl`);
 let written = 0;
 let dropped = 0;
 let bytes = 0;
 let lastAtMs: number | null = null;
 let lastError: string | null = null;
 const rotate = (): void => {
  rmSync(segment(opts.keep), { force: true });
  for (let n = opts.keep - 1; n >= 1; n--) if (existsSync(segment(n))) renameSync(segment(n), segment(n + 1));
  renameSync(current, segment(1));
 };
 return {
  append(record) {
   try {
    mkdirSync(opts.dir, { recursive: true });
    const line = `${JSON.stringify(record)}\n`;
    const size = existsSync(current) ? statSync(current).size : 0;
    if (size > 0 && size + Buffer.byteLength(line) > opts.maxBytes) rotate();
    appendFileSync(current, line);
    written++;
    bytes += Buffer.byteLength(line);
    lastAtMs = opts.now();
    return true;
   } catch (error) {
    dropped++;
    lastAtMs = opts.now();
    lastError = error instanceof Error ? error.message.slice(0, 160) : "erro";
    return false;
   }
  },
  status: () => ({ written, dropped, bytes, lastAtMs, lastError }),
 };
}

/** What one segment of either journal may weigh and how many are kept: about 48 MB of each in all. */
const RECORDING_LIMITS = { maxBytes: 8 * 1024 * 1024, keep: 5 } as const;
const STATUS_EVERY_MS = 60_000;

export interface Recorders {
 answers(record: AnswerRecord | null): void;
 /** A price row, with `changed` counted against the previous row of the same source. Every read is recorded: a cache read again shows as `changed: 0`, never as a fresh price. */
 price(row: PriceRow | null): void;
 /** The three below are what the agent calls: each builds its record and keeps it, and none of them can throw. */
 recordConsult(entry: ConsultRecord, meta: ConsultMeta | undefined): void;
 recordBook(book: Book, src: "guard" | "look"): void;
 recordEco(eco: EcoContext): void;
 status(): { readonly answers: JournalStatus; readonly prices: JournalStatus };
 /** Writes `recording-status.json` now (otherwise at most once a minute, with a write). */
 flushStatus(): void;
}

export function createRecorders(opts: { readonly dir: string; readonly now: () => number }): Recorders {
 const answers = createJournal({ dir: opts.dir, name: "answers", ...RECORDING_LIMITS, now: opts.now });
 const prices = createJournal({ dir: opts.dir, name: "prices", ...RECORDING_LIMITS, now: opts.now });
 const lastPrices = new Map<PriceSource, Readonly<Record<string, number>>>();
 let statusAtMs = 0;
 const status = () => ({ answers: answers.status(), prices: prices.status() });
 const flushStatus = (): void => {
  try {
   mkdirSync(opts.dir, { recursive: true });
   writeFileSync(join(opts.dir, "recording-status.json"), `${JSON.stringify({ v: 1, atMs: opts.now(), ...status() })}\n`);
   statusAtMs = opts.now();
  } catch {
   // the status of the recording is itself best effort
  }
 };
 const maybeFlush = (): void => {
  if (opts.now() - statusAtMs >= STATUS_EVERY_MS) flushStatus();
 };
 return {
  answers(record) {
   if (record === null) return;
   answers.append(record);
   maybeFlush();
  },
  price(row) {
   if (row === null) return;
   const before = lastPrices.get(row.src) ?? {};
   const changed = Object.entries(row.prices).filter(([k, v]) => before[k] !== v).length;
   if (prices.append({ ...row, n: Object.keys(row.prices).length, changed })) lastPrices.set(row.src, row.prices);
   maybeFlush();
  },
  recordConsult(entry, meta) {
   try {
    this.answers(answerRecord(entry, meta, opts.now()));
   } catch {
    // a record that could not be built costs that record
   }
  },
  recordBook(book, src) {
   try {
    this.price(priceRowFromBook(book, opts.now(), src));
   } catch {
    // a path that could not be read costs that point
   }
  },
  recordEco(eco) {
   try {
    this.price(priceRowFromEco(eco, opts.now()));
   } catch {
    // a path that could not be read costs that point
   }
  },
  status,
  flushStatus,
 };
}

/** Lists the segments of a journal, newest first: the current file, then 1, 2, and so on. For readers of the laboratory. */
export function journalSegments(dir: string, name: string): string[] {
 if (!existsSync(dir)) return [];
 const own = readdirSync(dir).filter((f) => f === `${name}.jsonl` || new RegExp(`^${name}\\.\\d+\\.jsonl$`).test(f));
 const rank = (f: string): number => (f === `${name}.jsonl` ? 0 : Number(f.split(".")[1]));
 return own.sort((a, b) => rank(a) - rank(b)).map((f) => join(dir, f));
}
