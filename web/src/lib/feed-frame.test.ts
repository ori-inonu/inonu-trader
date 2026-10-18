import { describe, expect, test } from "bun:test";
import { feedFrameState } from "./feed-frame";

describe("feedFrameState", () => {
  test("holds the frame only while reconnecting", () => {
    expect(feedFrameState("reconnecting").held).toBe(true);
    expect(feedFrameState("live").held).toBe(false);
    expect(feedFrameState("connecting").held).toBe(false);
  });

  test("reports no prior state only on the first connection", () => {
    expect(feedFrameState("connecting").empty).toBe(true);
    expect(feedFrameState("reconnecting").empty).toBe(false);
    expect(feedFrameState("live").empty).toBe(false);
  });

  test("shows a static reconnect notice only while reconnecting", () => {
    expect(feedFrameState("reconnecting").notice).toBe("Reconectando ao feed");
    expect(feedFrameState("live").notice).toBeNull();
    expect(feedFrameState("connecting").notice).toBeNull();
  });

  test("the notice is plain text with no indicator of its own", () => {
    const notice = feedFrameState("reconnecting").notice ?? "";
    expect(notice).not.toContain("•");
    expect(notice).not.toContain("·");
  });

  test("recovers fully once the feed returns to live", () => {
    expect(feedFrameState("live")).toEqual({ held: false, empty: false, notice: null });
  });
});