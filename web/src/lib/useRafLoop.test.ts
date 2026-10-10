import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRafLoop } from "./useRafLoop";

const g = globalThis as Record<string, unknown>;

let pending: Array<{ handle: number; callback: FrameRequestCallback }> = [];
let cancelled: number[] = [];
let nextHandle = 1;
let visible = true;

beforeEach(() => {
  pending = [];
  cancelled = [];
  nextHandle = 1;
  visible = true;
  g.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const handle = nextHandle++;
    pending.push({ handle, callback });
    return handle;
  };
  g.cancelAnimationFrame = (handle: number) => {
    cancelled.push(handle);
    pending = pending.filter((item) => item.handle !== handle);
  };
});

afterEach(() => {
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
});

function runFrame(time: number): void {
  const callbacks = pending;
  pending = [];
  for (const item of callbacks) item.callback(time);
}

describe("createRafLoop", () => {
  test("runs once per frame while visible and re-arms each frame", () => {
    const times: number[] = [];
    const loop = createRafLoop((now) => times.push(now), () => visible);

    loop.start();
    runFrame(16);
    runFrame(32);

    expect(times).toEqual([16, 32]);
  });

  test("never starts while the tab is hidden", () => {
    const times: number[] = [];
    visible = false;
    const loop = createRafLoop((now) => times.push(now), () => visible);

    loop.start();
    runFrame(16);

    expect(times).toEqual([]);
    expect(pending).toHaveLength(0);
  });

  test("stops within one frame of the tab being hidden", () => {
    const times: number[] = [];
    const loop = createRafLoop((now) => times.push(now), () => visible);

    loop.start();
    runFrame(16);
    visible = false;
    runFrame(32);

    expect(times).toEqual([16]);
    expect(pending).toHaveLength(0);
  });

  test("start is idempotent while a frame is already pending", () => {
    const loop = createRafLoop(() => {}, () => visible);

    loop.start();
    loop.start();

    expect(pending).toHaveLength(1);
  });

  test("stop cancels the pending frame and makes the loop restartable", () => {
    const times: number[] = [];
    const loop = createRafLoop((now) => times.push(now), () => visible);

    loop.start();
    const pendingHandle = nextHandle - 1;
    loop.stop();

    expect(cancelled).toEqual([pendingHandle]);
    runFrame(16);
    expect(times).toEqual([]);

    loop.start();
    runFrame(48);
    expect(times).toEqual([48]);
  });

  test("stop without a pending frame cancels nothing", () => {
    const loop = createRafLoop(() => {}, () => visible);

    loop.stop();
    loop.start();
    loop.stop();
    loop.stop();

    expect(cancelled).toHaveLength(1);
  });
});