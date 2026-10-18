import { describe, expect, test, vi } from "bun:test";
import { sampleStatus } from "./fixtures";
import { coalesceStatusRequest, STATUS_REQUEST_TIMEOUT_MS, statusPollFailed, statusPollSucceeded } from "./status-poll";

describe("status poll freshness", () => {
 test("a failed newest poll retains the displayed snapshot and marks it stale", () => {
  const snapshot = sampleStatus();
  const current = statusPollSucceeded(snapshot);
  const failed = statusPollFailed(current);
  expect(failed.status).toBe(snapshot);
  expect(failed.stale).toBe(true);
 });

 test("a timed-out request is released and its late response cannot replace a newer result", async () => {
  vi.useFakeTimers();
  try {
   const active: { current: Promise<string> | null } = { current: null };
   const firstRequest = Promise.withResolvers<string>();
   const secondRequest = Promise.withResolvers<string>();
   const snapshot = statusPollSucceeded(sampleStatus());
   let shown: string | null = null;
   let state = snapshot;
   let requests = 0;
   const start = (): Promise<string> => {
    requests++;
    return requests === 1 ? firstRequest.promise : secondRequest.promise;
   };

   const first = coalesceStatusRequest(active, start);
   const firstObserved = first.then(
    (value) => { shown = value; },
    (error: unknown) => {
     state = statusPollFailed(state);
     throw error;
    },
   );
   await Promise.resolve();
   expect(coalesceStatusRequest(active, start)).toBe(first);
   expect(requests).toBe(1);
   vi.advanceTimersByTime(STATUS_REQUEST_TIMEOUT_MS);
   await expect(firstObserved).rejects.toThrow("status_request_timeout");

   expect(state).toEqual({ status: snapshot.status, stale: true });
   expect(active.current).toBeNull();

   const newer = coalesceStatusRequest(active, start);
   void newer.then((value) => { shown = value; });
   await Promise.resolve();
   expect(requests).toBe(2);
   secondRequest.resolve("new-response");
   await expect(newer).resolves.toBe("new-response");
   firstRequest.resolve("late-response");
   await Promise.resolve();
   expect(await newer).toBe("new-response");
   expect(shown).toBe("new-response");
   expect(active.current).toBeNull();
  } finally {
   vi.useRealTimers();
  }
 });
});
