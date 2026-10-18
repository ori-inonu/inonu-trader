/**
 * The regime of a perpetual for the Evidence Brief (T5.10, E7): the exchange's public funding rate and open interest, read at
 * most once a minute per instrument, with the open interest remembered so its change over an hour can be told. Both reads are
 * free and unsigned. A failure of one read leaves the other and says why in a constant code; nothing of the failure's message
 * travels, and a failed read is never cached as an answer. A click that is cancelled is told so.
 */
import { OI_MAX_SAMPLES, OI_WINDOW_MS, oiVariationPct, regimeOf, type OiSample, type Regime } from "../intel/derivatives";
import { OkxPublicError, instTypeOf, type OkxPublic } from "./okx-public";

const REUSE_MS = 60_000;
/** Samples older than this are of no use to an hour window and are dropped. */
const KEEP_MS = 3 * OI_WINDOW_MS;
const MIN_GAP_MS = 30_000;

export interface DerivativesReading {
  readonly regime: Regime;
  /** Why each null is null, by constant code. */
  readonly nulos: Record<string, string>;
  readonly atMs: number;
}

export interface Derivatives {
  /** The regime of a perpetual, or null for anything else. Throws only when the click was cancelled. */
  read(instId: string, signal?: AbortSignal): Promise<DerivativesReading | null>;
}

export function createDerivatives(deps: { readonly rest: Pick<OkxPublic, "fundingRate" | "openInterest">; readonly now: () => number }): Derivatives {
  const samples = new Map<string, OiSample[]>();
  const cache = new Map<string, { readonly at: number; readonly reading: DerivativesReading }>();
  const inflight = new Map<string, Promise<DerivativesReading>>();

  const remember = (instId: string, sample: OiSample): OiSample[] => {
    const list = (samples.get(instId) ?? []).filter((s) => sample.ts - s.ts <= KEEP_MS);
    const last = list[list.length - 1];
    if (last === undefined || sample.ts - last.ts >= MIN_GAP_MS) list.push(sample);
    while (list.length > OI_MAX_SAMPLES) list.shift();
    samples.set(instId, list);
    return list;
  };

  async function fetchOne(instId: string, signal?: AbortSignal): Promise<DerivativesReading> {
    const nulos: Record<string, string> = { "regime.btcBeta": "nao coletado" };
    const [funding, oi] = await Promise.allSettled([deps.rest.fundingRate!(instId, signal), deps.rest.openInterest!(instId, signal)]);
    if (signal?.aborted) throw new OkxPublicError("aborted");

    let rate: number | null = null;
    if (funding.status === "fulfilled") rate = funding.value.rate;
    else nulos["regime.funding"] = funding.reason instanceof OkxPublicError ? `okx_${funding.reason.code}` : "indisponivel";

    let oiVar: number | null = null;
    if (oi.status === "fulfilled") {
      oiVar = oiVariationPct(remember(instId, { ts: deps.now(), oiUsd: oi.value.oiUsd }));
      if (oiVar === null) nulos["regime.oiVar"] = "aquecimento";
    } else {
      nulos["regime.oiVar"] = "indisponivel";
    }
    return { regime: regimeOf({ funding: rate, oiVar }), nulos, atMs: deps.now() };
  }

  return {
    async read(instId, signal) {
      if (instTypeOf(instId) !== "SWAP" || deps.rest.fundingRate === undefined || deps.rest.openInterest === undefined) return null;
      const hit = cache.get(instId);
      if (hit !== undefined && deps.now() - hit.at < REUSE_MS) return hit.reading;
      const running = inflight.get(instId);
      if (running !== undefined) return running;
      const started = fetchOne(instId, signal)
        .then((reading) => {
          // only an answer with both parts is worth keeping for a minute; a failure is asked again at the next click
          if (!("regime.funding" in reading.nulos) && reading.nulos["regime.oiVar"] !== "indisponivel") cache.set(instId, { at: deps.now(), reading });
          return reading;
        })
        .finally(() => inflight.delete(instId));
      inflight.set(instId, started);
      return started;
    },
  };
}
