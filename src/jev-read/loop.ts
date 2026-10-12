/**
 * The testable parts of the producer loop: the clock keeper, one read round that never throws, and the persisted
 * count of paid model reads. The script only wires them to timers and to the network.
 */

import { existsSync, readFileSync } from "node:fs";
import { correctedClock, type ClockSample } from "../system-one/clock";
import type { TapeModel } from "./decide";
import type { OkxTapeFeed } from "./feed";
import { runJevRead } from "./read";
import type { JevReadStore } from "./store";
import type { JevRead } from "./types";

/** A sample that keeps failing to refresh is not trusted forever: past this age the clock is unknown again. */
export const MAX_SAMPLE_AGE_MS = 30 * 60_000;
/** A quiet market pushes nothing for a while: past these ages a REST snapshot is taken before the read. */
export const BOOK_REFRESH_AFTER_MS = 3_000;
export const TICKER_REFRESH_AFTER_MS = 10_000;

export interface ClockKeeperDeps {
  readonly measure: () => Promise<ClockSample | null>;
  /** Monotonic milliseconds. */
  readonly mono?: () => number;
  /** Local wall clock. */
  readonly wall?: () => number;
}

/**
 * Holds the exchange offset. The exchange clock advances with the monotonic clock, so a wall clock that is stepped
 * cannot drag it behind the exchange. A failed re-measure keeps the last good sample until it is too old to trust.
 */
export class ClockKeeper {
  private sample: ClockSample | null = null;
  private clock: (() => number) | null = null;
  private sampledAtMono = 0;
  private readonly mono: () => number;
  private readonly wall: () => number;

  constructor(private readonly deps: ClockKeeperDeps) {
    this.mono = deps.mono ?? (() => performance.now());
    this.wall = deps.wall ?? Date.now;
  }

  async refresh(): Promise<void> {
    let next: ClockSample | null = null;
    try {
      next = await this.deps.measure();
    } catch {
      next = null;
    }
    if (next !== null) {
      this.sample = next;
      this.clock = correctedClock(next, this.wall, this.mono);
      this.sampledAtMono = this.mono();
      return;
    }
    if (this.sample !== null && this.mono() - this.sampledAtMono > MAX_SAMPLE_AGE_MS) {
      this.sample = null;
      this.clock = null;
    }
  }

  offsetMs(): number | null {
    return this.sample === null ? null : this.sample.offsetMs;
  }

  /** The exchange clock now, null while the offset is unknown. */
  exchangeNow(): number | null {
    return this.clock === null ? null : this.clock();
  }

  /** The clock reads and files are stamped with: the exchange clock when known, the local clock otherwise. */
  stamp(): number {
    return this.exchangeNow() ?? this.wall();
  }
}

export type ReaderFeed = Pick<OkxTapeFeed, "ages" | "refreshBook" | "refreshTicker" | "snapshot">;

export interface RoundDeps {
  readonly feed: ReaderFeed;
  readonly keeper: ClockKeeper;
  /** null observes only. */
  readonly model: TapeModel | null;
  readonly store: JevReadStore;
  readonly instId: string;
  readonly localNow?: () => number;
  readonly timeoutMs?: number;
}

export interface RoundResult {
  readonly read: JevRead | null;
  /** A fixed code when something other than the market went wrong, null otherwise. */
  readonly error: "store_failed" | "round_failed" | null;
}

/** One read of one instrument. Nothing it does can throw into the caller's loop. */
export async function readRound(deps: RoundDeps): Promise<RoundResult> {
  let read: JevRead;
  try {
    const localNow = deps.localNow ?? Date.now;
    let ages = deps.feed.ages(deps.instId, localNow(), deps.keeper.exchangeNow());
    if (ages.bookAgeMs === null || ages.bookAgeMs > BOOK_REFRESH_AFTER_MS) {
      await deps.feed.refreshBook(deps.instId);
      ages = deps.feed.ages(deps.instId, localNow(), deps.keeper.exchangeNow());
    }
    if (ages.tickerAgeMs === null || ages.tickerAgeMs > TICKER_REFRESH_AFTER_MS) await deps.feed.refreshTicker(deps.instId);
    read = await runJevRead(deps.feed.snapshot(deps.instId, localNow(), deps.keeper.exchangeNow()), {
      model: deps.model,
      now: () => deps.keeper.stamp(),
      clockOffsetMs: deps.keeper.offsetMs(),
      timeoutMs: deps.timeoutMs,
    });
  } catch {
    return { read: null, error: "round_failed" };
  }
  try {
    deps.store.record(read);
  } catch {
    return { read, error: "store_failed" };
  }
  return { read, error: null };
}

/** Paid model reads recorded since `sinceMs` in the journal and its single rotated backup. Garbage lines are ignored. */
export function countRecentModelReads(journalPath: string, sinceMs: number): number {
  let count = 0;
  for (const path of [journalPath, `${journalPath}.1`]) {
    if (!existsSync(path)) continue;
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (line.length === 0) continue;
      try {
        const row: unknown = JSON.parse(line);
        if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
        const { atMs, decision } = row as { atMs?: unknown; decision?: unknown };
        if (decision !== null && decision !== undefined && typeof atMs === "number" && atMs >= sinceMs) count += 1;
      } catch {
        // Not a journal line.
      }
    }
  }
  return count;
}
