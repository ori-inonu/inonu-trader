import { createPublicOkxClient, createPublicOkxHttp, type FundingRateRow, type InstrumentRow, type MarkPriceRow } from "../onchainos/public-okx.ts";
import { OnchainosError } from "../onchainos/errors.ts";
import type { GetPort } from "../onchainos/http.ts";
import { createPublicClock, type PublicClockProof } from './public-clock';

const SOURCE = "okx-public-v5" as const;
const INSTRUMENT = "BTC-USDT-SWAP";
const TTL_MS = 60_000;
type Status = "ready" | "blocked" | "error";

export interface PublicMarketRequest {
  method: "GET";
  endpoint: string;
  httpStatus: number | null;
  code: string | null;
  requestedAtMs: number;
  receivedAtMs: number;
}
export interface PublicMarketSnapshot {
  source: typeof SOURCE;
  mode: "real" | "unverified";
  status: Status;
  observedAtMs: number;
  expiresAtMs: number;
  instrument: InstrumentRow | null;
  funding: FundingRateRow | null;
  mark: MarkPriceRow | null;
  capability: {
    id: "funding.public-btc";
    family: "funding";
    source: typeof SOURCE;
    documented: true;
    implemented: true;
    exercisedReal: boolean;
    integrated: false;
    financiallyQualified: false;
    status: Status;
    reason: string | null;
    nextRequirement: string | null;
  };
  dependencies: string[];
  requests: PublicMarketRequest[];
  clock?: PublicClockProof;
}
export interface PublicMarketOptions {
  /** Injected HTTP is a deterministic seam and never establishes real exercise. */
  http?: GetPort;
  now?: () => number;
  clock?: ReturnType<typeof createPublicClock>;
}

/** Fixed, keyless Exchange reads. No wallet, account, credentials, signing or orders. */
export function createPublicMarket(options: PublicMarketOptions = {}) {
  const now = options.now ?? Date.now;
  const production = options.http === undefined && options.clock === undefined;
  const clock = options.clock ?? (options.http === undefined ? createPublicClock({ now }) : undefined);
  const http = options.http ?? createPublicOkxHttp({
    fetch: (url, init) => globalThis.fetch(url, init),
    now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    allowNetwork: true,
    timeoutMs: 8_000,
    maxRetries: 0,
    requestsPerSecond: 1,
    burst: 1,
    maxResponseChars: 65_536,
  });

  return {
    async read(): Promise<PublicMarketSnapshot> {
      const requests: PublicMarketRequest[] = [];
      const dependencies: string[] = [];
      const reference = await clock?.observe();
      const traced: GetPort = {
        async get(endpoint, query) {
          const requestedAtMs = now();
          try {
            const result = await http.get(endpoint, query);
            if (result.meta.source !== SOURCE) throw new OnchainosError("schema", "origem pública incompatível", { endpoint: endpoint.path, httpStatus: result.meta.httpStatus, apiCode: "0" });
            requests.push({ method: "GET", endpoint: endpoint.path, httpStatus: result.meta.httpStatus, code: "0", requestedAtMs: result.meta.requestedAtMs, receivedAtMs: result.meta.receivedAtMs });
            return result;
          } catch (error) {
            const known = error instanceof OnchainosError ? error : null;
            const code = known?.apiCode;
            requests.push({ method: "GET", endpoint: endpoint.path, httpStatus: known?.httpStatus ?? null, code: typeof code === "string" && /^-?[0-9]{1,12}$/.test(code) ? code : null, requestedAtMs, receivedAtMs: now() });
            throw error;
          }
        },
      };
      const client = createPublicOkxClient(traced);
      let failed = false;
      async function capture<T>(label: string, read: () => Promise<{ value: T }>): Promise<T | null> {
        try { return (await read()).value; }
        catch { failed = true; dependencies.push(`Repetir a leitura pública de ${label}; a resposta não foi validada.`); return null; }
      }
      const rows = await capture("instrumento", () => client.instruments({ instType: "SWAP", instId: INSTRUMENT }));
      const instrument = rows?.[0] ?? null;
      const funding = await capture("funding", () => client.fundingRate(INSTRUMENT));
      const mark = await capture("mark", () => client.markPrice(INSTRUMENT));
      const observedAtMs = now();
      if (instrument === null || instrument.instType !== "SWAP" || instrument.state !== "live" || instrument.ctType !== "linear" || instrument.settleCcy !== "USDT" || instrument.ctValCcy !== "BTC" || instrument.ctVal === null) {
        dependencies.push("Confirmar no endpoint de instrumentos um SWAP linear BTC/USDT ativo, com valor contratual e liquidação em USDT.");
      }
      if (funding !== null && funding.method !== "current_period") {
        dependencies.push(funding.method === "next_period" ? "next_period não é mais suportado na documentação atual; confirmar um mecanismo de funding vigente." : "Confirmar o mecanismo de funding; método desconhecido.");
      }
      if (funding !== null && (funding.fundingRate === null || funding.fundingTimeMs === null)) {
        dependencies.push("Obter taxa e instante de funding válidos; valores ausentes permanecem desconhecidos.");
      }
      if (mark !== null && mark.markPx === null) {
        dependencies.push("Obter mark válido para interpretar o preço público do instrumento.");
      }
      let expiresAtMs = observedAtMs + TTL_MS;
      if (reference) {
        expiresAtMs = Math.min(expiresAtMs, reference.proof.expiresAtMs);
        if (!reference.valid()) {
          dependencies.push('Obter referência pública de tempo válida e estável antes de interpretar os dados.');
          expiresAtMs = Math.min(expiresAtMs, observedAtMs);
        }
      }
      for (const [label, row] of [["funding", funding], ["mark", mark]] as const) {
        if (row === null) continue;
        const bounds = row.tsMs === null ? null : reference ? reference.localBounds(row.tsMs) : { earliestLocalMs: row.tsMs, latestLocalMs: row.tsMs };
        if (bounds === null || bounds.latestLocalMs > observedAtMs + 5_000) {
          dependencies.push(`Obter timestamp de ${label} válido e compatível com o relógio de coleta.`);
          expiresAtMs = Math.min(expiresAtMs, observedAtMs);
        } else {
          expiresAtMs = Math.min(expiresAtMs, bounds.earliestLocalMs + TTL_MS);
          if (bounds.earliestLocalMs + TTL_MS <= observedAtMs) dependencies.push(`Atualizar ${label} vencido; TTL de 60 segundos.`);
        }
      }
      const status: Status = failed ? "error" : dependencies.length ? "blocked" : "ready";
      // Provenance and usable freshness are separate: a real successful read can remain on hold.
      const exercisedReal = production && !failed && instrument !== null && funding !== null && mark !== null && requests.length === 3 && requests.every((request) => request.httpStatus !== null && request.httpStatus >= 200 && request.httpStatus < 300 && request.code === "0");
      return {
        source: SOURCE, mode: exercisedReal ? "real" : "unverified", status,
        observedAtMs, expiresAtMs, instrument, funding, mark,
        capability: { id: "funding.public-btc", family: "funding", source: SOURCE, documented: true, implemented: true, exercisedReal, integrated: false, financiallyQualified: false, status, reason: dependencies[0] ?? null, nextRequirement: dependencies[0] ?? "Qualificar acesso Exchange, taxas, margem e liquidação antes de qualquer elegibilidade financeira." },
        dependencies, requests, ...(reference ? { clock: reference.proof } : {}),
      };
    },
  };
}
