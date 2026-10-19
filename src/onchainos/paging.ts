/**
 * Bounded pagination for cursor style endpoints. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md criterion D19.
 *
 * The walk stops at the first of: no next cursor, an empty page, a cursor already seen, the page cap or the row cap.
 * It never loops and never asks for more than `maxPages` pages. The result says whether anything was left behind.
 */

import { OnchainosError } from "./errors.ts";

export interface PageResult<R> {
  rows: readonly R[];
  nextCursor: string | null;
}

export interface CollectOptions {
  maxPages: number;
  maxRows: number;
}

export type StopReason = "exhausted" | "max_pages" | "max_rows" | "no_progress" | "repeated_cursor";

export interface Collected<R> {
  rows: R[];
  pages: number;
  truncated: boolean;
  stopReason: StopReason;
}

const PAGING_CEILINGS = Object.freeze({ maxPages: 50, maxRows: 100_000 });

function checkInteger(value: number, name: string, maximum: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new OnchainosError("invalid_request", `${name} deve ser um inteiro de 1 a ${maximum}`);
}

export async function collectPages<R>(
  fetchPage: (cursor: string | null, page: number) => Promise<PageResult<R>>,
  options: CollectOptions,
): Promise<Collected<R>> {
  checkInteger(options.maxPages, "maxPages", PAGING_CEILINGS.maxPages);
  checkInteger(options.maxRows, "maxRows", PAGING_CEILINGS.maxRows);
  const rows: R[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  for (;;) {
    const page: PageResult<R> = await fetchPage(cursor, pages);
    pages += 1;
    const room = options.maxRows - rows.length;
    if (page.rows.length > room) {
      rows.push(...page.rows.slice(0, room));
      return { rows, pages, truncated: true, stopReason: "max_rows" };
    }
    rows.push(...page.rows);
    if (page.nextCursor === null) return { rows, pages, truncated: false, stopReason: "exhausted" };
    if (page.rows.length === 0) return { rows, pages, truncated: true, stopReason: "no_progress" };
    if (seen.has(page.nextCursor) || page.nextCursor === cursor) return { rows, pages, truncated: true, stopReason: "repeated_cursor" };
    if (pages >= options.maxPages) return { rows, pages, truncated: true, stopReason: "max_pages" };
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
