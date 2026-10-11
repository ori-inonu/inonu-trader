import { describe, expect, test } from "bun:test";
import { OnchainosError } from "./errors.ts";
import { collectPages, type PageResult } from "./paging.ts";

function scripted(pages: Array<PageResult<number>>): { fetchPage: (cursor: string | null, page: number) => Promise<PageResult<number>>; cursors: Array<string | null> } {
  const cursors: Array<string | null> = [];
  return {
    cursors,
    fetchPage: async (cursor, page) => {
      cursors.push(cursor);
      const next = pages[page];
      if (next === undefined) throw new Error(`página ${page} não prevista`);
      return next;
    },
  };
}

describe("paging", () => {
  test("D19: stops when the provider has no next cursor and reports the page count", async () => {
    const source = scripted([{ rows: [1, 2], nextCursor: "a" }, { rows: [3], nextCursor: null }]);
    const result = await collectPages(source.fetchPage, { maxPages: 5, maxRows: 100 });
    expect(result.rows).toEqual([1, 2, 3]);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.stopReason).toBe("exhausted");
    expect(source.cursors).toEqual([null, "a"]);
  });

  test("D19: the page cap is a hard ceiling and the result says it was truncated", async () => {
    const source = scripted([{ rows: [1], nextCursor: "a" }, { rows: [2], nextCursor: "b" }, { rows: [3], nextCursor: "c" }]);
    const result = await collectPages(source.fetchPage, { maxPages: 2, maxRows: 100 });
    expect(result.rows).toEqual([1, 2]);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.stopReason).toBe("max_pages");
    expect(source.cursors.length).toBe(2);
  });

  test("D19: the row cap trims the last page and marks the truncation", async () => {
    const source = scripted([{ rows: [1, 2, 3], nextCursor: "a" }, { rows: [4, 5, 6], nextCursor: "b" }]);
    const result = await collectPages(source.fetchPage, { maxPages: 9, maxRows: 4 });
    expect(result.rows).toEqual([1, 2, 3, 4]);
    expect(result.truncated).toBe(true);
    expect(result.stopReason).toBe("max_rows");
  });

  test("D19: a repeated cursor stops the walk instead of looping forever", async () => {
    const source = scripted([{ rows: [1], nextCursor: "same" }, { rows: [2], nextCursor: "same" }, { rows: [3], nextCursor: "other" }]);
    const result = await collectPages(source.fetchPage, { maxPages: 10, maxRows: 100 });
    expect(result.rows).toEqual([1, 2]);
    expect(result.truncated).toBe(true);
    expect(result.stopReason).toBe("repeated_cursor");
  });

  test("D19: an empty page with a cursor is no progress and stops", async () => {
    const source = scripted([{ rows: [1], nextCursor: "a" }, { rows: [], nextCursor: "b" }, { rows: [9], nextCursor: null }]);
    const result = await collectPages(source.fetchPage, { maxPages: 10, maxRows: 100 });
    expect(result.rows).toEqual([1]);
    expect(result.stopReason).toBe("no_progress");
    expect(result.truncated).toBe(true);
  });

  test("D19: an empty first page with no cursor is simply exhausted", async () => {
    const source = scripted([{ rows: [], nextCursor: null }]);
    const result = await collectPages(source.fetchPage, { maxPages: 3, maxRows: 10 });
    expect(result.rows).toEqual([]);
    expect(result.stopReason).toBe("exhausted");
    expect(result.truncated).toBe(false);
  });

  test("D19: invalid caps are rejected before any request", async () => {
    const source = scripted([]);
    for (const options of [{ maxPages: 0, maxRows: 10 }, { maxPages: 3, maxRows: 0 }, { maxPages: 1.5, maxRows: 10 }, { maxPages: 1000, maxRows: 10 }, { maxPages: 3, maxRows: 10_000_000 }]) {
      await expect(collectPages(source.fetchPage, options)).rejects.toBeInstanceOf(OnchainosError);
    }
    expect(source.cursors.length).toBe(0);
  });

  test("D19: an error from a page propagates and keeps nothing half done", async () => {
    const failing = async (_cursor: string | null, page: number): Promise<PageResult<number>> => {
      if (page === 1) throw new OnchainosError("http", "falha de teste", { httpStatus: 500 });
      return { rows: [1], nextCursor: "a" };
    };
    await expect(collectPages(failing, { maxPages: 3, maxRows: 10 })).rejects.toMatchObject({ kind: "http" });
  });
});
