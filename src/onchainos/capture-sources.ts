/**
 * Capture sources: they turn reads of the clients into records of the Jev Decision Lab capture format
 * (docs/JEV-LABORATORIO-DE-DECISAO.md section 3.4). Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 10.
 *
 * A source only READS (through an injected client) and returns records plus what it left out and why. It never writes a
 * file; the recorder (capture.ts) validates and writes. Rules kept here:
 *  - `t` of every record is the LOCAL RECEIPT (`receivedAtMs` of the read), never a provider timestamp.
 *  - A candle is recorded only when the provider confirms it AND the local clock agrees it has closed (start plus bar
 *    plus a safety margin), only once (cursor derived from the data file) and never from a duplicated answer row.
 *  - A funding announcement is recorded only before its settlement; settled values come from the history, with the
 *    interval taken from the distance to the previous settlement, so an interval the format cannot carry (anything but
 *    1, 2, 4 or 8 hours) is reported and skipped, never invented.
 *  - A value that is unknown is NEVER replaced: a record that cannot be built from known values is skipped with a reason,
 *    or the epoch stops when the provider answer is malformed.
 *  - `mark` of the onchainos source is the aggregated price of the Onchain OS (quote currency NOT declared) with the
 *    index as `index`. It is not an exchange mark price.
 */

import { CAPTURE_KINDS, type CaptureKind, type CaptureRecord } from "../lab/capture-format.ts";
import { CaptureError, type CaptureSource, type EpochCollection, type EpochContext, type PlannedCall, type SkipNote } from "./capture-types.ts";
import { endpoint } from "./endpoints.ts";
import { BAR_MS, BARS, MAX_CANDLES_PER_CALL, type Bar, type CandleRow, type MarketPriceClient } from "./market-price.ts";
import { PUBLIC_BAR_MS, toNumber, type PublicBar, type PublicCandleRow, type PublicOkxClient } from "./public-okx.ts";
import { readChainIndex, readTokenAddress, type TokenRef } from "./values.ts";

const INST = /^[A-Z0-9]{1,20}(?:-[A-Z0-9]{1,20}){1,3}$/;
const MAX_INST_LENGTH = 48;
const ALLOWED_INTERVALS_MS = [3_600_000, 7_200_000, 14_400_000, 28_800_000] as const;

export const PUBLIC_OKX_KINDS: readonly CaptureKind[] = Object.freeze(["ticker", "funding", "mark", "candle", "book", "oi"] as const);
export const ONCHAINOS_KINDS: readonly CaptureKind[] = Object.freeze(["mark", "candle"] as const);

function usage(message: string): never {
  throw new CaptureError("usage", message);
}

function canonicalKinds(kinds: readonly CaptureKind[] | undefined, allowed: readonly CaptureKind[]): CaptureKind[] {
  if (kinds === undefined) return [...allowed];
  if (!Array.isArray(kinds) || kinds.length === 0) return usage("kinds não pode ser vazio");
  const seen = new Set<string>();
  for (const kind of kinds) {
    if (!(allowed as readonly string[]).includes(kind)) return usage(`kinds aceita só ${allowed.join(", ")} nesta fonte`);
    if (seen.has(kind)) return usage(`espécie repetida em kinds: ${kind}`);
    seen.add(kind);
  }
  return CAPTURE_KINDS.filter((kind) => seen.has(kind));
}

function integerOption(value: number | undefined, fallback: number, name: string, minimum: number, maximum: number): number {
  const chosen = value ?? fallback;
  if (!Number.isInteger(chosen) || chosen < minimum || chosen > maximum) return usage(`${name} deve ser um inteiro de ${minimum} a ${maximum}`);
  return chosen;
}

function sameCandle(a: PublicCandleRow | CandleRow, b: PublicCandleRow | CandleRow): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Candles to request: the configured amount on the first epoch, then just enough to cover the grid step. */
function candlesToRequest(context: EpochContext, barMs: number, first: number, ceiling: number): number {
  return context.firstEpoch ? first : Math.min(ceiling, Math.ceil(context.epochMs / barMs) + 3);
}

// ---------------------------------------------------------------------------
// public-okx
// ---------------------------------------------------------------------------

export interface PublicOkxSourceInput {
  /** 1 to 4 instruments, SPOT (BTC-USDT) or SWAP (BTC-USDT-SWAP). */
  instruments?: readonly string[];
  kinds?: readonly CaptureKind[];
  bar?: PublicBar;
  /** Levels per side, 1 to 50 (the lab format limit). */
  bookDepth?: number;
  /** Candles requested on the first epoch, 1 to 300. */
  candlesLimit?: number;
  /** A candle must have closed this long ago on the local clock. */
  candleSafetyMs?: number;
  /** Settlements requested when the history is read, 2 to 100. */
  fundingHistoryLimit?: number;
}

export interface ResolvedPublicOkxConfig {
  readonly instruments: string[];
  readonly kinds: CaptureKind[];
  readonly bar: PublicBar;
  readonly barMs: number;
  readonly bookDepth: number;
  readonly candlesLimit: number;
  readonly candleSafetyMs: number;
  readonly fundingHistoryLimit: number;
}

export function resolvePublicOkxConfig(input: PublicOkxSourceInput = {}): ResolvedPublicOkxConfig {
  const instruments = [...(input.instruments ?? ["BTC-USDT", "BTC-USDT-SWAP"])];
  if (instruments.length < 1 || instruments.length > 4) usage("instruments deve ter de 1 a 4 itens");
  const seen = new Set<string>();
  for (const inst of instruments) {
    if (typeof inst !== "string" || inst.length > MAX_INST_LENGTH || !INST.test(inst)) usage("instrumento inválido: use o formato da OKX, por exemplo BTC-USDT ou BTC-USDT-SWAP");
    if (seen.has(inst)) usage("instrumento repetido em instruments");
    seen.add(inst);
  }
  const bar = input.bar ?? "1m";
  const barMs = (PUBLIC_BAR_MS as Record<string, number | null | undefined>)[bar];
  if (barMs === undefined || bar === "1s") usage("bar não suportado pela captura (a vela de 1 s só existe no histórico)");
  if (barMs === null || barMs === undefined) usage("bar sem duração fixa (meses de calendário) não pode ser gravado: o formato exige barMs");
  return {
    instruments,
    kinds: canonicalKinds(input.kinds, PUBLIC_OKX_KINDS),
    bar,
    barMs: barMs as number,
    bookDepth: integerOption(input.bookDepth, 10, "bookDepth", 1, 50),
    candlesLimit: integerOption(input.candlesLimit, 100, "candlesLimit", 1, 300),
    candleSafetyMs: integerOption(input.candleSafetyMs, 2_000, "candleSafetyMs", 0, 60_000),
    fundingHistoryLimit: integerOption(input.fundingHistoryLimit, 3, "fundingHistoryLimit", 2, 100),
  };
}

export function createPublicOkxCaptureSource(client: PublicOkxClient, config: ResolvedPublicOkxConfig): CaptureSource {
  const wants = (kind: CaptureKind): boolean => config.kinds.includes(kind);
  const ticker = endpoint("public.ticker");
  const mark = endpoint("public.mark-price");
  const funding = endpoint("public.funding-rate");
  const history = endpoint("public.funding-rate-history");
  const openInterest = endpoint("public.open-interest");
  const books = endpoint("public.books");
  const candles = endpoint("public.candles");

  const call = (spec: ReturnType<typeof endpoint>, params: Record<string, string>, frequency: PlannedCall["frequency"], purpose: string): PlannedCall => ({
    endpointId: spec.id,
    method: spec.method,
    path: spec.path,
    params,
    tier: spec.tier,
    frequency,
    purpose,
  });

  async function collectInstrument(inst: string, context: EpochContext, out: { records: CaptureRecord[]; skipped: SkipNote[]; notes: string[] }): Promise<void> {
    const isSwap = inst.endsWith("-SWAP");

    if (wants("ticker")) {
      context.checkDeadline();
      const read = await client.ticker(inst);
      const row = read.value;
      const bid = toNumber(row.bidPx);
      const ask = toNumber(row.askPx);
      const last = toNumber(row.last);
      const missing = [bid === null ? "bid" : null, ask === null ? "ask" : null, last === null ? "last" : null].filter((name) => name !== null);
      if (bid === null || ask === null || last === null) throw new CaptureError("malformed_record", `ticker de ${inst} sem ${missing.join(", ")} legível`);
      const data: { bid: number; ask: number; last: number; bidSize?: number; askSize?: number; vol24h?: number } = { bid, ask, last };
      const bidSize = toNumber(row.bidSz);
      const askSize = toNumber(row.askSz);
      const vol24h = toNumber(row.vol24h);
      if (bidSize !== null) data.bidSize = bidSize;
      if (askSize !== null) data.askSize = askSize;
      if (vol24h !== null) data.vol24h = vol24h;
      out.records.push({ t: read.meta.receivedAtMs, kind: "ticker", inst, data });
    }

    if (isSwap && wants("mark")) {
      context.checkDeadline();
      const read = await client.markPrice(inst);
      const price = toNumber(read.value.markPx);
      if (price === null) throw new CaptureError("malformed_record", `mark de ${inst} sem price legível`);
      out.records.push({ t: read.meta.receivedAtMs, kind: "mark", inst, data: { price } });
    }

    if (isSwap && wants("funding")) {
      context.checkDeadline();
      const read = await client.fundingRate(inst);
      const row = read.value;
      const rate = toNumber(row.fundingRate);
      if (rate === null || row.fundingTimeMs === null) throw new CaptureError("malformed_record", `funding de ${inst} sem fundingRate ou fundingTime legível`);
      const t = read.meta.receivedAtMs;
      if (row.intervalMs === null) {
        out.skipped.push({ kind: "funding", inst, reason: "intervalo de funding fora de 1, 2, 4 ou 8 horas (ou impossível de derivar): o formato do laboratório não o aceita" });
      } else if (t >= row.fundingTimeMs) {
        out.skipped.push({ kind: "funding", inst, reason: "anúncio recebido depois da liquidação: não é gravado como previsão" });
      } else {
        out.records.push({ t, kind: "funding", inst, data: { rate, settleMs: row.fundingTimeMs, intervalMs: row.intervalMs } });
      }

      const cursor = context.cursors.lastSettledFundingMs(inst);
      const needsHistory = cursor === null || row.prevFundingTimeMs === null || row.prevFundingTimeMs > cursor;
      if (needsHistory) {
        context.checkDeadline();
        const past = await client.fundingRateHistory(inst, { limit: config.fundingHistoryLimit });
        const receivedAt = past.meta.receivedAtMs;
        const rows = [...past.value].sort((a, b) => a.fundingTimeMs - b.fundingTimeMs);
        for (let index = 1; index < rows.length; index += 1) {
          const current = rows[index];
          const before = rows[index - 1];
          if (current === undefined || before === undefined) continue;
          if (cursor !== null && current.fundingTimeMs <= cursor) continue;
          if (current.fundingTimeMs > receivedAt) throw new CaptureError("malformed_record", `histórico de funding de ${inst} traz uma liquidação no futuro`);
          const interval = current.fundingTimeMs - before.fundingTimeMs;
          if (!(ALLOWED_INTERVALS_MS as readonly number[]).includes(interval)) {
            out.skipped.push({ kind: "funding", inst, reason: `liquidação ${current.fundingTimeMs}: intervalo de ${interval} ms em relação à anterior não é aceito pelo formato` });
            continue;
          }
          const realized = toNumber(current.realizedRate);
          if (realized === null) {
            out.skipped.push({ kind: "funding", inst, reason: `liquidação ${current.fundingTimeMs}: taxa realizada desconhecida, nada foi gravado` });
            continue;
          }
          out.records.push({ t: receivedAt, kind: "funding", inst, data: { rate: realized, settleMs: current.fundingTimeMs, intervalMs: interval } });
        }
        const oldest = rows[0];
        if (oldest !== undefined && (cursor === null || oldest.fundingTimeMs > cursor)) {
          out.skipped.push({ kind: "funding", inst, reason: `liquidação ${oldest.fundingTimeMs}: sem liquidação anterior na página, o intervalo não pôde ser derivado` });
        }
      }
    }

    if (isSwap && wants("oi")) {
      context.checkDeadline();
      const read = await client.openInterest(inst);
      const oi = toNumber(read.value.oi);
      if (oi === null) throw new CaptureError("malformed_record", `oi de ${inst} sem oi legível`);
      const oiUsd = toNumber(read.value.oiUsd);
      out.records.push({ t: read.meta.receivedAtMs, kind: "oi", inst, data: oiUsd === null ? { oi } : { oi, oiUsd } });
    }

    if (wants("book")) {
      context.checkDeadline();
      const read = await client.books(inst, { sz: config.bookDepth });
      const book = read.value;
      if (book.crossed) throw new CaptureError("malformed_record", `livro cruzado em ${inst}: o melhor bid não está abaixo do melhor ask`);
      const level = (entry: { price: string; size: string }): [number, number] => {
        const price = toNumber(entry.price);
        const size = toNumber(entry.size);
        if (price === null || size === null) throw new CaptureError("malformed_record", `nível ilegível no livro de ${inst}`);
        return [price, size];
      };
      out.records.push({
        t: read.meta.receivedAtMs,
        kind: "book",
        inst,
        data: { bids: book.bids.slice(0, config.bookDepth).map(level), asks: book.asks.slice(0, config.bookDepth).map(level) },
      });
    }

    if (wants("candle")) {
      context.checkDeadline();
      const limit = candlesToRequest(context, config.barMs, config.candlesLimit, 300);
      const read = await client.candles(inst, { bar: config.bar, limit });
      const unique = new Map<number, PublicCandleRow>();
      for (const row of read.value) {
        const earlier = unique.get(row.startMs);
        if (earlier !== undefined && !sameCandle(earlier, row)) throw new CaptureError("malformed_record", `velas repetidas na resposta de ${inst} em ${row.startMs} com conteúdo diferente`);
        unique.set(row.startMs, row);
      }
      const cursor = context.cursors.lastCandleStartMs(inst, config.barMs);
      let firstRecorded: number | null = null;
      for (const row of [...unique.values()].filter((entry) => entry.confirmed).sort((a, b) => a.startMs - b.startMs)) {
        if (cursor !== null && row.startMs <= cursor) continue;
        if (row.startMs + config.barMs + config.candleSafetyMs > read.meta.receivedAtMs) {
          out.skipped.push({ kind: "candle", inst, reason: `vela ${row.startMs} confirmada pelo provedor, mas ainda não fechou pelo relógio local (margem de ${config.candleSafetyMs} ms)` });
          continue;
        }
        const open = toNumber(row.open);
        const high = toNumber(row.high);
        const low = toNumber(row.low);
        const close = toNumber(row.close);
        const missing = [["open", open], ["high", high], ["low", low], ["close", close]].filter(([, value]) => value === null).map(([name]) => name);
        if (open === null || high === null || low === null || close === null) throw new CaptureError("malformed_record", `vela de ${inst} em ${row.startMs}: ${missing.join(", ")} ilegível`);
        const volume = toNumber(row.vol);
        out.records.push({ t: read.meta.receivedAtMs, kind: "candle", inst, data: volume === null ? { startMs: row.startMs, barMs: config.barMs, open, high, low, close } : { startMs: row.startMs, barMs: config.barMs, open, high, low, close, volume } });
        if (firstRecorded === null) firstRecorded = row.startMs;
      }
      if (cursor !== null && firstRecorded !== null && firstRecorded > cursor + config.barMs) {
        const missingBars = Math.round((firstRecorded - cursor) / config.barMs) - 1;
        out.notes.push(`lacuna de ${missingBars} vela(s) em ${inst} entre ${cursor} e ${firstRecorded}: não preenchida`);
      }
    }
  }

  return {
    id: "public-okx",
    describe: () => ({
      instruments: config.instruments,
      kinds: config.kinds,
      bar: config.bar,
      bookDepth: config.bookDepth,
      candlesLimit: config.candlesLimit,
      candleSafetyMs: config.candleSafetyMs,
      fundingHistoryLimit: config.fundingHistoryLimit,
    }),

    plan: () => {
      const plan: PlannedCall[] = [];
      for (const inst of config.instruments) {
        const isSwap = inst.endsWith("-SWAP");
        if (wants("ticker")) plan.push(call(ticker, { instId: inst }, "every_epoch", "melhor bid, melhor ask e último preço"));
        if (isSwap && wants("mark")) plan.push(call(mark, { instType: "SWAP", instId: inst }, "every_epoch", "preço de marcação"));
        if (isSwap && wants("funding")) {
          plan.push(call(funding, { instId: inst }, "every_epoch", "anúncio da taxa de funding da próxima liquidação"));
          plan.push(call(history, { instId: inst, limit: String(config.fundingHistoryLimit) }, "after_settlement", "taxas realizadas das liquidações já ocorridas"));
        }
        if (isSwap && wants("oi")) plan.push(call(openInterest, { instType: "SWAP", instId: inst }, "every_epoch", "interesse em aberto"));
        if (wants("book")) plan.push(call(books, { instId: inst, sz: String(config.bookDepth) }, "every_epoch", "livro de ordens"));
        if (wants("candle")) plan.push(call(candles, { instId: inst, bar: config.bar, limit: String(config.candlesLimit) }, "every_epoch", "velas fechadas"));
      }
      return plan;
    },

    collect: async (context) => {
      const out = { records: [] as CaptureRecord[], skipped: [] as SkipNote[], notes: [] as string[] };
      for (const inst of config.instruments) await collectInstrument(inst, context, out);
      return out satisfies EpochCollection;
    },
  };
}

// ---------------------------------------------------------------------------
// onchainos
// ---------------------------------------------------------------------------

export interface OnchainosTokenInput {
  /** The `inst` of the capture: a label chosen by the operator in the format of the lab (for example WETH-USDC). */
  alias: string;
  chainIndex: string;
  tokenContractAddress: string;
}

export interface OnchainosSourceInput {
  /** 1 to 8 tokens. */
  tokens: readonly OnchainosTokenInput[];
  /** mark (price and index) and candle. */
  kinds?: readonly CaptureKind[];
  bar?: Bar;
  /** Candles requested on the first epoch, 1 to 299. */
  candlesLimit?: number;
  candleSafetyMs?: number;
}

export interface ResolvedOnchainosConfig {
  readonly tokens: Array<TokenRef & { alias: string }>;
  readonly kinds: CaptureKind[];
  readonly bar: Bar;
  readonly barMs: number;
  readonly candlesLimit: number;
  readonly candleSafetyMs: number;
}

export function resolveOnchainosConfig(input: OnchainosSourceInput): ResolvedOnchainosConfig {
  if (!Array.isArray(input.tokens) || input.tokens.length < 1 || input.tokens.length > 8) usage("tokens deve ter de 1 a 8 itens");
  const aliases = new Set<string>();
  const identities = new Set<string>();
  const tokens = input.tokens.map((token) => {
    if (typeof token.alias !== "string" || token.alias.length > MAX_INST_LENGTH || !INST.test(token.alias)) usage("apelido inválido: use o formato do laboratório, por exemplo WETH-USDC (duas partes ou mais, letras maiúsculas e dígitos)");
    const chainIndex = readChainIndex(token.chainIndex);
    if (chainIndex === null) usage("chainIndex inválido em tokens");
    const tokenContractAddress = readTokenAddress(token.tokenContractAddress);
    if (tokenContractAddress === null) usage("tokenContractAddress inválido em tokens");
    const identity = `${chainIndex}|${tokenContractAddress}`;
    if (aliases.has(token.alias)) usage(`apelido repetido: ${token.alias}`);
    if (identities.has(identity)) usage("token repetido em tokens");
    aliases.add(token.alias);
    identities.add(identity);
    return { alias: token.alias, chainIndex: chainIndex as string, tokenContractAddress: tokenContractAddress as string };
  });
  const bar = input.bar ?? "1m";
  if (!(BARS as readonly string[]).includes(bar)) usage("bar não documentado");
  const barMs = BAR_MS[bar];
  if (barMs === null) usage("bar sem duração fixa (meses de calendário) não pode ser gravado: o formato exige barMs");
  return {
    tokens,
    kinds: canonicalKinds(input.kinds, ONCHAINOS_KINDS),
    bar,
    barMs: barMs as number,
    candlesLimit: integerOption(input.candlesLimit, 100, "candlesLimit", 1, MAX_CANDLES_PER_CALL),
    candleSafetyMs: integerOption(input.candleSafetyMs, 2_000, "candleSafetyMs", 0, 60_000),
  };
}

export function createOnchainosCaptureSource(market: MarketPriceClient, config: ResolvedOnchainosConfig): CaptureSource {
  const wants = (kind: CaptureKind): boolean => config.kinds.includes(kind);
  const refs: TokenRef[] = config.tokens.map((token) => ({ chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress }));

  return {
    id: "onchainos",
    describe: () => ({
      tokens: config.tokens.map((token) => ({ alias: token.alias, chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress })),
      kinds: config.kinds,
      bar: config.bar,
      candlesLimit: config.candlesLimit,
      candleSafetyMs: config.candleSafetyMs,
      priceQuote: "unknown",
    }),

    plan: () => {
      const plan: PlannedCall[] = [];
      const candles = endpoint("market.price.candles");
      const price = endpoint("market.price.price");
      const index = endpoint("market.index.current-price");
      if (wants("candle")) {
        for (const token of config.tokens) {
          plan.push({ endpointId: candles.id, method: candles.method, path: candles.path, params: { alias: token.alias, chainIndex: token.chainIndex, bar: config.bar, limit: String(config.candlesLimit) }, tier: candles.tier, frequency: "every_epoch", purpose: "velas fechadas" });
        }
      }
      if (wants("mark")) {
        plan.push({ endpointId: price.id, method: price.method, path: price.path, params: { tokens: String(config.tokens.length) }, tier: price.tier, frequency: "every_epoch", purpose: "preço agregado de todos os tokens em uma chamada" });
        plan.push({ endpointId: index.id, method: index.method, path: index.path, params: { tokens: String(config.tokens.length) }, tier: index.tier, frequency: "every_epoch", purpose: "preço de índice de todos os tokens em uma chamada" });
      }
      return plan;
    },

    collect: async (context) => {
      const records: CaptureRecord[] = [];
      const skipped: SkipNote[] = [];
      const notes: string[] = [];

      if (wants("candle")) {
        for (const token of config.tokens) {
          context.checkDeadline();
          const limit = candlesToRequest(context, config.barMs, config.candlesLimit, MAX_CANDLES_PER_CALL);
          const read = await market.candles({ chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress, bar: config.bar, limit });
          const unique = new Map<number, CandleRow>();
          for (const row of read.value) {
            const earlier = unique.get(row.startMs);
            if (earlier !== undefined && !sameCandle(earlier, row)) throw new CaptureError("malformed_record", `velas repetidas na resposta de ${token.alias} em ${row.startMs} com conteúdo diferente`);
            unique.set(row.startMs, row);
          }
          const cursor = context.cursors.lastCandleStartMs(token.alias, config.barMs);
          let firstRecorded: number | null = null;
          for (const row of [...unique.values()].filter((entry) => entry.confirmed).sort((a, b) => a.startMs - b.startMs)) {
            if (cursor !== null && row.startMs <= cursor) continue;
            if (row.startMs + config.barMs + config.candleSafetyMs > read.meta.receivedAtMs) {
              skipped.push({ kind: "candle", inst: token.alias, reason: `vela ${row.startMs} confirmada pelo provedor, mas ainda não fechou pelo relógio local (margem de ${config.candleSafetyMs} ms)` });
              continue;
            }
            const { open, high, low, close } = row;
            if (open === null || high === null || low === null || close === null) {
              const missing = [["open", open], ["high", high], ["low", low], ["close", close]].filter(([, value]) => value === null).map(([name]) => name);
              throw new CaptureError("malformed_record", `vela de ${token.alias} em ${row.startMs}: ${missing.join(", ")} ilegível`);
            }
            const base = { startMs: row.startMs, barMs: config.barMs, open, high, low, close };
            records.push({ t: read.meta.receivedAtMs, kind: "candle", inst: token.alias, data: row.volumeBase === null ? base : { ...base, volume: row.volumeBase } });
            if (firstRecorded === null) firstRecorded = row.startMs;
          }
          if (cursor !== null && firstRecorded !== null && firstRecorded > cursor + config.barMs) {
            notes.push(`lacuna de ${Math.round((firstRecorded - cursor) / config.barMs) - 1} vela(s) em ${token.alias} entre ${cursor} e ${firstRecorded}: não preenchida`);
          }
        }
      }

      if (wants("mark")) {
        context.checkDeadline();
        const prices = await market.prices(refs);
        context.checkDeadline();
        const indexes = await market.indexPrices(refs);
        const t = Math.max(prices.meta.receivedAtMs, indexes.meta.receivedAtMs);
        for (const token of config.tokens) {
          const key = `${token.chainIndex}|${token.tokenContractAddress}`;
          const price = prices.value.rows.find((row) => `${row.chainIndex}|${row.tokenContractAddress}` === key)?.price ?? null;
          if (price === null) {
            skipped.push({ kind: "mark", inst: token.alias, reason: "preço desconhecido: nenhum registro de mark foi escrito" });
            continue;
          }
          const indexPrice = indexes.value.rows.find((row) => `${row.chainIndex}|${row.tokenContractAddress}` === key)?.price ?? null;
          records.push({ t, kind: "mark", inst: token.alias, data: indexPrice === null ? { price } : { price, index: indexPrice } });
        }
      }
      return { records, skipped, notes };
    },
  };
}
