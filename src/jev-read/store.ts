/**
 * Local persistence of the Jev reads. The board (latest read per instrument and a short recent list) is written
 * atomically so the HTTP side never serves a half written file, and every read is appended to a journal.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { JEV_READ_SCHEMA_VERSION, type JevRead, type JevReadBoard } from "./types";

export interface StoreOptions {
  readonly statePath: string;
  readonly journalPath: string;
  readonly now?: () => number;
  readonly recentLimit?: number;
  /** The journal rotates to a single `.1` backup past this size, so it cannot grow without bound. */
  readonly journalMaxBytes?: number;
}

const DEFAULT_JOURNAL_MAX_BYTES = 20_000_000;

export class JevReadStore {
  private readonly reads = new Map<string, JevRead>();
  private recent: JevRead[] = [];
  private readonly now: () => number;
  private readonly recentLimit: number;

  constructor(private readonly options: StoreOptions) {
    this.now = options.now ?? Date.now;
    this.recentLimit = Math.max(1, Math.min(options.recentLimit ?? 40, 60));
  }

  board(): JevReadBoard {
    return {
      schemaVersion: JEV_READ_SCHEMA_VERSION,
      updatedAtMs: this.now(),
      reads: Object.fromEntries(this.reads),
      recent: this.recent,
    };
  }

  record(read: JevRead): void {
    this.reads.set(read.instId, read);
    this.recent = [read, ...this.recent].slice(0, this.recentLimit);
    mkdirSync(dirname(this.options.statePath), { recursive: true });
    mkdirSync(dirname(this.options.journalPath), { recursive: true });
    const temporary = `${this.options.statePath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(this.board(), null, 2), { flag: "wx" });
      renameSync(temporary, this.options.statePath);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.rotateJournal();
    appendFileSync(this.options.journalPath, `${JSON.stringify(read)}\n`);
  }

  private rotateJournal(): void {
    const path = this.options.journalPath;
    const max = this.options.journalMaxBytes ?? DEFAULT_JOURNAL_MAX_BYTES;
    try {
      if (existsSync(path) && statSync(path).size > max) {
        rmSync(`${path}.1`, { force: true });
        renameSync(path, `${path}.1`);
      }
    } catch {
      // A rotation that cannot happen must not lose the read being recorded.
    }
  }
}
