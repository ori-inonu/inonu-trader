import type { ClosingRecord } from "../agent/closing";

/** Fixture de testes: fechamentos no formato real com valores inventados. Sem I/O. */
export const T0 = 1_792_000_000_000;

/** Um fechamento no formato real, com valores inventados: compra de US$ 10, 5% da carteira, pool de US$ 800 mil. */
export function closing(patch: { quote?: Partial<NonNullable<ClosingRecord["quote"]>> | null; cand?: Record<string, unknown>; plano?: { alvo: number; stop: number } | null; tam?: { cart: number | null; liq: number | null }; first?: number | null; answer?: { buy: number; skip: number } | null; brief?: null; facts?: Record<string, unknown> } = {}): ClosingRecord {
  const quote =
    patch.quote === null
      ? null
      : ({
          version: 1, source: "okx_cli_v4_6_4_quote_v6", cycleId: "cy-1", candidateId: "buy:token:501:AAA", requestId: "r", chainIndex: "501", fromAssetKey: "usdc", toAssetKey: "aaa",
          fromAmountMinor: "10000000", toAmountRaw: "123", outputUnit: "unverified", fromDecimals: 6, toDecimals: 6, startedAtMs: T0, receivedAtMs: T0 + 900, reviewedAtMs: T0 + 900, expiresAtMs: T0 + 15_000,
          ageMs: 900, timeBasis: "request_started_local_clock", disposition: "ok",
          facts: { atMs: T0 + 900, action: "ok", impactPct: -0.1, tradeFee: 0.0005, gasEstimate: 352000, slot: 1, taxFromPct: 0, taxToPct: 0, fromAmountMinor: "10000000", feeUnit: "usd", gasUnit: "native_minor", present: [], toAmountRaw: "123", outputUnit: "unverified", ...patch.facts },
          honeypot: { from: false, to: false }, execution: "not_inferred", fingerprint: "f", ...patch.quote,
        } as unknown as NonNullable<ClosingRecord["quote"]>);
  const brief =
    patch.brief === null
      ? null
      : ({
          v: 1, c: "closing-v1", cob: "parcial", sua: { p: 0.5, f: {} },
          cand: { s: "AAA", l: 800, r: 2, y: 0, ...patch.cand },
          cot: null, tam: patch.tam ?? { cart: 5, liq: 1 },
          plano: patch.plano === null ? undefined : (patch.plano ?? { alvo: 5, stop: 1.5 }), min: true, voltas: null, chaves: {},
        } as unknown as NonNullable<ClosingRecord["brief"]>);
  return {
    v: 1, phase: "closing", criteria: "closing-v1", cycleId: "cy-1", candidateId: "buy:token:501:AAA", requestId: "r", atMs: T0, mode: "shadow",
    first: { pBuy: patch.first === undefined ? 0.6 : patch.first, appliedByGate: "buy_tenth" }, quote, quoteFailure: null, refusal: null, brief, briefHash: null, briefBytes: null,
    answer: patch.answer === undefined ? { buy: 0.9, skip: 0.1 } : patch.answer, would: "buy", wouldReason: "resposta_do_jev", applied: "buy_tenth", placed: "antes", phaseStartedAtMs: T0, askedAtMs: T0, answeredAtMs: T0 + 300,
  } as ClosingRecord;
}
