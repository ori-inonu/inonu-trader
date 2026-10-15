/**
 * Puts the recorder, the decision log and the Placar together for the desktop core (INT-0.8 to INT-0.10), so that
 * `src/desktop/handlers.ts` only needs a few lines to use them. Everything here is free and local: public OKX reads, the flow
 * engine the app already runs and files under `<data>/outcomes`.
 *
 * It is a LIVE feature: the recorder and the decision log run only when the core follows the market (the same switch as the
 * live feed), so a test or a self-test that does not open a socket neither records nor reads the exchange. `INONU_RECORDER=off`
 * stops both without a restart.
 */
import { join } from "node:path";
import type { Derivatives } from "../inonu/derivatives";
import type { Asker } from "../inonu/ask";
import type { OkxSource } from "../inonu/source";
import { COST_TABLE } from "./live-costs";
import { createInsightBox, type InsightBox } from "../verdict/judge";
import { createProfileStore, type ProfileStore } from "../verdict/profile-store";
import { withDecisionLog } from "./decision-log";
import { createOkxBars } from "./okx-bars";
import { createRecorder, startRecorder, type Recorder, type Scheduler } from "./recorder";
import { buildPlacar } from "./scoreboard";
import { createOutcomeStore, type OutcomeStore } from "./store";

const PLACAR_WINDOW_MS = 30 * 86_400_000;
const PLACAR_REUSE_MS = 10_000;

export interface OutcomesOptions {
  readonly dataDir: string;
  readonly fetch: typeof fetch;
  readonly now: () => number;
  readonly source: Pick<OkxSource, "analysis">;
  readonly derivatives: Derivatives;
  readonly instruments: () => readonly string[];
  /** Whether the core follows the market. Without it nothing is recorded. */
  readonly live: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Test seam; the default uses the runtime's timers, unreferenced so they never keep the process alive. */
  readonly schedule?: Scheduler;
}

export interface Outcomes {
  readonly store: OutcomeStore;
  readonly recorder: Recorder;
  /** What the person chose to risk (capital and the share they accept to lose), kept on this machine. */
  readonly perfil: ProfileStore;
  /** Where the model call leaves what it learned about its own answers, for the Veredito to take (nothing puts into it until the model adapter is wired to). */
  readonly insights: InsightBox;
  wrapAsker(asker: Asker): Asker;
  placar(): { readonly placar: ReturnType<typeof buildPlacar>; readonly gravador: Record<string, unknown> };
  close(): void;
}

const timers: Scheduler = {
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    (timer as { unref?: () => void }).unref?.();
    return () => clearTimeout(timer);
  },
  every: (ms, fn) => {
    const timer = setInterval(fn, ms);
    (timer as { unref?: () => void }).unref?.();
    return () => clearInterval(timer);
  },
};

/** Round-trip taker fees and slippage in bps from the lab's table of conservative costs: two legs of a fee and of slippage. */
export const feeAndSlippageRoundTripBps = (market: "spot" | "perp"): number => 2 * COST_TABLE.feeTakerBps[market] + 2 * COST_TABLE.slippageBpsPerSide;

export function createOutcomes(options: OutcomesOptions): Outcomes {
  const env = options.env ?? process.env;
  const enabled = (): boolean => options.live && env.INONU_RECORDER !== "off";
  const store = createOutcomeStore({ dir: join(options.dataDir, "outcomes"), now: options.now });
  const recorder = createRecorder({
    store,
    bars: createOkxBars({ fetch: options.fetch }),
    analysis: async (instId, signal) => {
      const reading = await options.source.analysis(instId, signal);
      return { analysis: reading.analysis, nowMs: reading.nowMs };
    },
    regime: async (instId, signal) => (await options.derivatives.read(instId, signal))?.regime ?? null,
    instruments: options.instruments,
    now: options.now,
    newId: () => crypto.randomUUID(),
    feeAndSlippageRoundTripBps: { spot: feeAndSlippageRoundTripBps("spot"), perp: feeAndSlippageRoundTripBps("perp") },
    enabled,
  });
  const perfil = createProfileStore({ file: join(options.dataDir, "inonu", "perfil.json") });
  const insights = createInsightBox({ now: options.now });
  const stop = options.live ? startRecorder(recorder, options.schedule ?? timers, options.now) : () => undefined;

  let cached: { readonly at: number; readonly value: ReturnType<Outcomes["placar"]> } | null = null;
  const self: Outcomes = {
    store,
    recorder,
    perfil,
    insights,
    wrapAsker: (asker) =>
      options.live
        ? withDecisionLog(asker, { recorder, store, now: options.now, enabled, profile: () => perfil.read(), insights, placarMeasured: () => self.placar().placar.estado === "medido" })
        : asker,
    placar() {
      const now = options.now();
      if (cached !== null && now - cached.at < PLACAR_REUSE_MS) return cached.value;
      const since = now - PLACAR_WINDOW_MS;
      const value = {
        placar: buildPlacar({ decisions: store.decisions(), snapshots: store.snapshots(since), labels: store.labels(since) }),
        gravador: { ...recorder.status(), ...store.stats() },
      };
      cached = { at: now, value };
      return value;
    },
    close: stop,
  };
  return self;
}
