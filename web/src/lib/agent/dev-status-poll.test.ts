import { describe, expect, test } from "bun:test";
import { devStatusPollFailed, devStatusPollSucceeded } from "./dev-status-poll";
import type { DevAgentStatus } from "./dev-status";

describe("cached status polling state", () => {
 test("a failed poll retains the last snapshot and marks it unavailable", () => {
  const snapshot: DevAgentStatus = { atMs: 10, connected: true, book: null };
  const state = devStatusPollFailed(devStatusPollSucceeded(snapshot));
  expect(state).toEqual({ status: snapshot, unavailable: true });
 });

 test("failure without a snapshot remains unknown, and success clears failure", () => {
  expect(devStatusPollFailed({ status: null, unavailable: false })).toEqual({ status: null, unavailable: true });
  const snapshot: DevAgentStatus = { atMs: 11, connected: false, book: null };
  expect(devStatusPollSucceeded(snapshot)).toEqual({ status: snapshot, unavailable: false });
 });
});
