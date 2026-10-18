// T5.7, T6.4: the chart reads what the engine measured every few seconds. Reading is free (it never touches the model), but it
// still must not hammer a core that is down: it backs off, pauses while the page is hidden, cancels what is in flight when the
// instrument changes, and never shows a reading that is too old as if it were fresh.
import { describe, expect, test } from "bun:test";
import { OVERLAY_STALE_MS, createOverlayFeed, type OverlayFeedState } from "./overlay-feed";
import type { ChartOverlay, OverlayOutcome } from "./overlay";

const NOW = 1_800_000_000_000;
const overlay = (over: Partial<ChartOverlay> = {}): ChartOverlay => ({
  instId: "BTC-USDT", asOfMs: NOW, fonte: "okx_ws_trades", price: 101, atr14: 2, tickSz: "0.5", step: 0.5, binTicks: 1,
  aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 }, niveis: [], corridas: { sequencial: [], progressao: [], exaustao: [] },
  perfil: { poc: null, val: null, vah: null, hvn: [], lvn: [] }, absorcao: null, zonas: [], ...over,
});

/** A manual scheduler: timers fire only when the test says so. */
function harness(outcomes: Array<OverlayOutcome | (() => Promise<OverlayOutcome>)>, extra: { visible?: () => boolean } = {}) {
  let clock = NOW;
  const timers = new Map<number, { at: number; run: () => void }>();
  let nextId = 1;
  const states: OverlayFeedState[] = [];
  const asked: Array<{ instId: string; signal?: AbortSignal }> = [];
  let call = 0;
  const feed = createOverlayFeed({
    client: {
      fetch: async (instId, signal) => {
        asked.push({ instId, signal });
        const next = outcomes[Math.min(call, outcomes.length - 1)]!;
        call += 1;
        return typeof next === "function" ? next() : next;
      },
    },
    instId: "BTC-USDT",
    onChange: (state) => states.push(state),
    now: () => clock,
    setTimer: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: clock + ms, run });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id as number);
    },
    isVisible: extra.visible ?? (() => true),
    intervalMs: 5000,
  });
  const flush = async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };
  const advance = async (ms: number) => {
    clock += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= clock) {
        timers.delete(id);
        timer.run();
      }
    }
    await flush();
  };
  return { feed, states, asked, timers, advance, flush, setClock: (t: number) => (clock = t) };
}

describe("polling", () => {
  test("reads at once, then again every interval", async () => {
    const h = harness([{ ok: true, overlay: overlay() }]);
    h.feed.start();
    await h.flush();
    expect(h.asked).toHaveLength(1);
    expect(h.states[h.states.length - 1]!.status).toBe("ok");
    expect(h.states[h.states.length - 1]!.overlay?.instId).toBe("BTC-USDT");
    await h.advance(4000);
    expect(h.asked).toHaveLength(1);
    await h.advance(1500);
    expect(h.asked).toHaveLength(2);
  });

  test("the first state says it is loading", async () => {
    const h = harness([{ ok: true, overlay: overlay() }]);
    h.feed.start();
    expect(h.states[0]).toMatchObject({ status: "loading", overlay: null, reason: null });
  });

  test("stop cancels what is in flight and the next timer", async () => {
    let release: (o: OverlayOutcome) => void = () => {};
    const h = harness([() => new Promise<OverlayOutcome>((resolve) => (release = resolve))]);
    h.feed.start();
    await h.flush();
    h.feed.stop();
    expect(h.asked[0]!.signal?.aborted).toBe(true);
    release({ ok: true, overlay: overlay() });
    await h.flush();
    expect(h.states.some((s) => s.status === "ok")).toBe(false);
    expect(h.timers.size).toBe(0);
  });
});

describe("failures", () => {
  test("a failure keeps the last good reading for a while, names the reason, and backs off", async () => {
    const h = harness([{ ok: true, overlay: overlay() }, { ok: false, reason: "sem_conexao" }]);
    h.feed.start();
    await h.flush();
    await h.advance(5000);
    const failed = h.states[h.states.length - 1]!;
    expect(failed.status).toBe("erro");
    expect(failed.reason).toBe("sem_conexao");
    expect(failed.overlay).not.toBeNull();
    const [timer] = [...h.timers.values()];
    expect(timer!.at - NOW).toBeGreaterThan(5000 + 5000 - 1);
  });

  test("a reading older than the staleness window is dropped instead of drawn as fresh", async () => {
    const h = harness([{ ok: true, overlay: overlay({ asOfMs: NOW }) }, { ok: false, reason: "sem_conexao" }]);
    h.feed.start();
    await h.flush();
    await h.advance(OVERLAY_STALE_MS + 1000);
    expect(h.states[h.states.length - 1]!.overlay).toBeNull();
  });

  test("the age of a kept reading is counted from when it ARRIVED, so a Windows clock that is 90 s off does not drop it or keep it too long", async () => {
    // the reading is stamped with the exchange clock; the browser clock here is 90 s ahead of it, the case the Doctor warns about
    const h = harness([{ ok: true, overlay: overlay({ asOfMs: NOW - 90_000 }) }, { ok: false, reason: "sem_conexao" }]);
    h.feed.start();
    await h.flush();
    await h.advance(10_000);
    expect(h.states[h.states.length - 1]!.overlay).not.toBeNull(); // 10 s after it arrived is fresh, whatever its stamp says
    await h.advance(OVERLAY_STALE_MS + 1000);
    expect(h.states[h.states.length - 1]!.overlay).toBeNull(); // a minute after it arrived is old, whatever its stamp says
  });

  test("the wait grows with the failures and is capped, and a success resets it", async () => {
    const h = harness([{ ok: false, reason: "servidor_sem_rota" }]);
    h.feed.start();
    await h.flush();
    const gaps: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const [timer] = [...h.timers.values()];
      const wait = timer!.at - (NOW + gaps.reduce((a, b) => a + b, 0));
      gaps.push(wait);
      await h.advance(wait);
    }
    expect(gaps[0]).toBeLessThan(gaps[2]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(60_000);
  });

  test("a read that throws is a named failure, never an unhandled rejection", async () => {
    const h = harness([
      async () => {
        throw new Error("boom");
      },
    ]);
    h.feed.start();
    await h.flush();
    expect(h.states[h.states.length - 1]).toMatchObject({ status: "erro", reason: "resposta_invalida" });
  });
});

describe("visibility", () => {
  test("while the page is hidden nothing is read, and the clock keeps ticking so it resumes by itself", async () => {
    let visible = false;
    const h = harness([{ ok: true, overlay: overlay() }], { visible: () => visible });
    h.feed.start();
    await h.flush();
    expect(h.asked).toHaveLength(0);
    expect(h.timers.size).toBe(1);
    visible = true;
    await h.advance(5000);
    expect(h.asked).toHaveLength(1);
  });

  test("poke reads now, once, even when a timer is waiting", async () => {
    const h = harness([{ ok: true, overlay: overlay() }]);
    h.feed.start();
    await h.flush();
    h.feed.poke();
    await h.flush();
    expect(h.asked).toHaveLength(2);
    expect(h.timers.size).toBe(1);
  });
});
