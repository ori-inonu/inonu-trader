import { describe, expect, test, vi } from "bun:test";
import { requestAnalysis, type AnalysisRequestState } from "./analysis-poll";

describe("analysis request selection", () => {
 test("a slow same-page request is reused across polls and eventually publishes", async () => {
  vi.useFakeTimers();
  try {
   const active: AnalysisRequestState = { current: null };
   const first = Promise.withResolvers<string>();
   const second = Promise.withResolvers<string>();
   const shown: string[] = [];
   let reads = 0;
   let generation = 0;
   const poll = () => requestAnalysis(active, 1, generation, () => ++reads === 1 ? first.promise : second.promise, (page, selected) => page === 1 && selected === generation, (value) => shown.push(value));

   const initial = poll();
   const interval = setInterval(() => { void poll(); }, 6_000);
   vi.advanceTimersByTime(18_000);
   await Promise.resolve();
   expect(reads).toBe(1);
   expect(shown).toEqual([]);

   first.resolve("first analysis");
   await initial;
   expect(shown).toEqual(["first analysis"]);
   vi.advanceTimersByTime(6_000);
   await Promise.resolve();
   expect(reads).toBe(2);
   second.resolve("refreshed analysis");
   await Promise.resolve();
   expect(shown).toEqual(["first analysis", "refreshed analysis"]);
   clearInterval(interval);
  } finally {
   vi.useRealTimers();
  }
 });

 test("responses from earlier selections cannot replace the selected page", async () => {
  const active: AnalysisRequestState = { current: null };
  const oldPage = Promise.withResolvers<string>();
  const selectedPage = Promise.withResolvers<string>();
  const returnedPage = Promise.withResolvers<string>();
  const shown: string[] = [];
  let page = 1;
  let generation = 0;
  const ask = (requestedPage: number, result: Promise<string>) => requestAnalysis(
   active,
   requestedPage,
   generation,
   () => result,
   (requested, selected) => requested === page && selected === generation,
   (value) => shown.push(value),
  );

  const first = ask(1, oldPage.promise);
  page = 2;
  generation++;
  const second = ask(2, selectedPage.promise);
  page = 1;
  generation++;
  const third = ask(1, returnedPage.promise);
  returnedPage.resolve("returned page");
  await third;
  oldPage.resolve("stale original page");
  selectedPage.resolve("stale other page");
  await Promise.all([first, second]);
  expect(shown).toEqual(["returned page"]);
 });
});
