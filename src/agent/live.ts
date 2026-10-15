/**
 * The real data of the agent (AUT-2, AUT-11): the wallets, the facts of what is held, the hourly history for the quality of an entry, the ecosystem's candidates, the market context (BTC and ETH, and the
 * latest reading of System One) and the price at the end of a Placar window. Every read goes through something injected (the signed balance client, the OnchainOS gateway, the public candles), so the
 * tests run on fakes. Costs are kept inside the monthly OnchainOS quota by caching: the ecosystem scan every 30 minutes, the facts of a holding every 30 minutes, its risk every 6 hours, the hourly history
 * every 10 minutes. A read that fails gives a null or an older value marked as such, never a zero.
 */
import type { RawTokenAsset } from "../okx-wallet/portfolio";
import { buildOnchainDigest } from "../intel/onchain-digest";
import type { GatewayLike } from "../intel/onchain-nulos";
import type { InternalGatewayResult, OnchainGatewayInternal } from "../onchain-read/gateway";
import { candidateOf, type EcoContext, type EcoFacts, type Saldo } from "../opportunity/ecosystem";
import { bearishFlags, bullishFlags } from "../opportunity/risk-tags";
import { regimeOf as volatilityRegime } from "../quant/volatility";
import type { Candle } from "../quant/types";
import { bookFromAssets, type WalletRead } from "./book";
import { fundingBps, OI_MAX_SAMPLES, oiVariationPct, type OiSample } from "../intel/derivatives";
import { SIZING } from "../opportunity/sizing";
import { priceOnlyFacts } from "./candidates";
import type { AgentConfig } from "./config";
import type { DecisionMark } from "./scoreboard";
import { planKey, type PlanStore } from "./plans";
import { agedMomentum, momentumFacts, type MomentumFacts } from "./momentum";
import { timingFacts, type TimingFacts } from "./timing";
import type { Book, HoldingFacts, Position } from "./types";
import type { MarketContext } from "./model";
import type { BriefSource } from "../inonu/ask";

type Gateway = Pick<OnchainGatewayInternal, "callInternal">;

const HOUR_MS = 3_600_000;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const like = (result: InternalGatewayResult): GatewayLike => (result.ok ? { ok: true, data: result.data, meta: { ageMs: result.meta.ageMs, stale: result.meta.stale } } : { ok: false, error: result.error });

/* ---------------------------------------------------------------- the wallets */

export interface BalanceSource {
  balances(address: string, chains: readonly string[]): Promise<readonly RawTokenAsset[]>;
}

export interface BookReadInfo {
  readonly atMs: number;
  readonly managedOk: boolean;
  readonly watchFailed: number;
  readonly flagged: number;
  readonly unpriced: number;
  readonly positions: number;
}

export interface BookReader {
  read(signal: AbortSignal): Promise<Book | null>;
  last(): BookReadInfo | null;
}

/**
 * The wallets the agent sees. The managed wallet (the person's own, or an Agentic Wallet sub-wallet) is the one it acts on, read on the EVM networks of the configuration and on Solana when it has an
 * account there; the watched wallets are only read, for the picture of the whole portfolio. When the managed wallet cannot be read the answer is null: the agent does not decide on half a picture of it.
 */
/** How many times the managed wallet is asked before the read is given up, and the pause between them: a passing hiccup of the provider must not cost a whole cycle. */
const BOOK_ATTEMPTS = 3;
const BOOK_RETRY_MS = 2000;

export function createBookReader(deps: { readonly config: () => AgentConfig; readonly source: BalanceSource; readonly now: () => number; readonly sleep?: (ms: number) => Promise<void> }): BookReader {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last: BookReadInfo | null = null;
  return {
    last: () => last,
    async read(signal) {
      const config = deps.config();
      const jobs: { readonly wallet: "agente" | "principal"; readonly address: string; readonly chains: readonly string[] }[] = [];
      if (config.managed.evm !== null) jobs.push({ wallet: "agente", address: config.managed.evm, chains: config.chains });
      if (config.managed.solana !== null) jobs.push({ wallet: "agente", address: config.managed.solana, chains: ["501"] });
      if (config.watch.evm !== null && config.watch.evm.toLowerCase() !== config.managed.evm?.toLowerCase()) jobs.push({ wallet: "principal", address: config.watch.evm, chains: config.chains });
      if (config.watch.solana !== null && config.watch.solana !== config.managed.solana) jobs.push({ wallet: "principal", address: config.watch.solana, chains: ["501"] });
      if (!jobs.some((j) => j.wallet === "agente")) return null;
      let reads: WalletRead[] = [];
      let managedOk = true;
      let watchFailed = 0;
      for (let attempt = 1; attempt <= BOOK_ATTEMPTS; attempt++) {
        const settled = await Promise.allSettled(jobs.map((j) => deps.source.balances(j.address, j.chains)));
        if (signal.aborted) return null;
        reads = [];
        managedOk = true;
        watchFailed = 0;
        settled.forEach((result, i) => {
          const job = jobs[i]!;
          if (result.status === "fulfilled") reads.push({ wallet: job.wallet, assets: result.value });
          else if (job.wallet === "agente") managedOk = false;
          else watchFailed++;
        });
        if (managedOk || attempt === BOOK_ATTEMPTS) break;
        // the managed wallet did not answer: a short pause and again (a watched wallet that failed is not worth waiting for)
        await sleep(BOOK_RETRY_MS);
        if (signal.aborted) return null;
      }
      const atMs = deps.now();
      if (!managedOk) {
        last = { atMs, managedOk: false, watchFailed, flagged: 0, unpriced: 0, positions: 0 };
        return null;
      }
      const built = bookFromAssets(reads, atMs);
      last = { atMs, managedOk: true, watchFailed, flagged: built.flagged, unpriced: built.unpriced, positions: built.book.positions.length };
      return built.book;
    },
  };
}

/* ---------------------------------------------------------------- the hourly history */

const toCandles = (data: unknown): Candle[] | null => {
  if (!Array.isArray(data)) return null;
  const out: Candle[] = [];
  for (const raw of data) {
    const r = rec(raw);
    const ts = num(r?.ts), open = num(r?.open), high = num(r?.high), low = num(r?.low), close = num(r?.close);
    if (r === null || ts === null || open === null || high === null || low === null || close === null) return null;
    out.push({ startMs: ts, open, high, low, close, volume: num(r.volume), confirmed: r.confirmed === true });
  }
  return out;
};

export interface TimingReader {
  read(facts: Pick<EcoFacts, "chainIndex" | "address" | "candidateId">, signal: AbortSignal): Promise<TimingFacts | null>;
}

/** The facts of an entry from the last 60 hourly bars of a token. Cached ten minutes, and a failure is remembered for two so a down provider is not hammered. */
export function createTimingReader(deps: { readonly gateway: Gateway; readonly now: () => number; readonly ttlMs?: number }): TimingReader {
  const ttl = deps.ttlMs ?? 10 * 60_000;
  const cache = new Map<string, { readonly atMs: number; readonly value: TimingFacts | null; readonly failed: boolean }>();
  return {
    async read(facts, signal) {
      const key = facts.candidateId;
      const hit = cache.get(key);
      if (hit !== undefined && deps.now() - hit.atMs < (hit.failed ? 120_000 : ttl)) return hit.value;
      if (signal.aborted) return null;
      const result = await deps.gateway.callInternal("/onchain/candles", { chainIndex: facts.chainIndex, token: facts.address, bar: "1H", limit: "60" }, "background");
      const candles = result.ok ? toCandles(result.data) : null;
      const value = candles === null ? null : timingFacts(candles, deps.now());
      cache.set(key, { atMs: deps.now(), value, failed: candles === null });
      return value;
    },
  };
}

/* ---------------------------------------------------------------- the last hour in five-minute bars */

export interface MomentumReader {
  read(facts: Pick<EcoFacts, "chainIndex" | "address" | "candidateId">, signal: AbortSignal): Promise<MomentumFacts | null>;
}

/** What a token is doing now, from the last two hours of five-minute bars. Cached five minutes, and a failure is remembered for one so a down provider is not hammered. */
export function createMomentumReader(deps: { readonly gateway: Gateway; readonly now: () => number; readonly ttlMs?: number }): MomentumReader {
  const ttl = deps.ttlMs ?? 5 * 60_000;
  const cache = new Map<string, { readonly atMs: number; readonly value: MomentumFacts | null; readonly failed: boolean }>();
  return {
    async read(facts, signal) {
      const key = facts.candidateId;
      const hit = cache.get(key);
      // a cache hit is the same reading a little older: the age of its last bar goes on with the clock (and past the data window it is unknown), it is never handed out as if it were just read
      if (hit !== undefined && deps.now() - hit.atMs < (hit.failed ? 60_000 : ttl)) return hit.value === null ? null : agedMomentum(hit.value, deps.now() - hit.atMs);
      if (signal.aborted) return null;
      const result = await deps.gateway.callInternal("/onchain/candles", { chainIndex: facts.chainIndex, token: facts.address, bar: "5m", limit: "24" }, "background");
      const candles = result.ok ? toCandles(result.data) : null;
      const value = candles === null ? null : momentumFacts(candles, deps.now());
      cache.set(key, { atMs: deps.now(), value, failed: candles === null });
      return value;
    },
  };
}

/* ---------------------------------------------------------------- what is held */

export interface HoldingFactsReader {
  read(book: Book, signal: AbortSignal): Promise<(position: Position) => HoldingFacts | null>;
}

interface Info {
  readonly priceUsd: number | null;
  readonly change24Pct: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24Usd: number | null;
  /** The last five minutes and the last hour, as the provider reports them. */
  readonly change5Pct: number | null;
  readonly change1hPct: number | null;
  readonly volume5Usd: number | null;
  readonly txs5: number | null;
  readonly txs1h: number | null;
  /** When the provider stamped this data; null when it did not. */
  readonly tsMs: number | null;
  /** How old the gateway said the answer already was when it served it (its own cache), in ms. */
  readonly servedAgeMs: number;
}
interface Risk {
  readonly level: number | null;
  readonly flags: readonly string[];
}

const FLAG = /^[a-zA-Z0-9_.-]{1,40}$/;
/** The range of claimed values whose market facts are read. */
const READ_MIN_USD = 5;
const READ_MAX_USD = 1_000_000;

/**
 * The facts of the positions that matter: the biggest ones and every one that has a plan. The market facts of a token are read at most every 30 minutes and its risk every 6 hours, the entry and the hours
 * held come from the plan, and the price comes with the balance. What cannot be read is null.
 */
export function createHoldingFactsReader(deps: {
  readonly gateway: Gateway;
  readonly plans: PlanStore;
  readonly now: () => number;
  readonly max?: number;
  readonly infoTtlMs?: number;
  readonly riskTtlMs?: number;
}): HoldingFactsReader {
  const max = deps.max ?? 20;
  const infoTtl = deps.infoTtlMs ?? 10 * 60_000;
  const planInfoTtl = Math.min(infoTtl, 2 * 60_000);
  const dustTtl = Math.max(infoTtl, 60 * 60_000);
  const riskTtl = deps.riskTtlMs ?? 6 * HOUR_MS;
  const infos = new Map<string, { readonly atMs: number; readonly value: Info | null }>();
  const risks = new Map<string, { readonly atMs: number; readonly value: Risk | null }>();

  async function info(p: Position, hasPlan: boolean): Promise<Info | null> {
    const hit = infos.get(p.id);
    // a position with an active plan is refreshed every two minutes (matching the hot cycle); other actionable positions every ten minutes; dust, rarely
    const ttl = hasPlan ? planInfoTtl : p.usd !== null && p.usd >= SIZING.minOrderUsd ? infoTtl : dustTtl;
    if (hit !== undefined && deps.now() - hit.atMs < ttl) return hit.value;
    const result = await deps.gateway.callInternal("/onchain/price-info", { chainIndex: p.chainIndex, token: p.address }, "background");
    const row = result.ok && Array.isArray(result.data) ? rec(result.data[0]) : null;
    const value: Info | null =
      row === null
        ? null
        : {
            priceUsd: num(row.price),
            change24Pct: num(rec(row.change)?.h24),
            liquidityUsd: num(row.liquidityUsd),
            volume24Usd: num(rec(row.volume)?.h24),
            change5Pct: num(rec(row.change)?.m5),
            change1hPct: num(rec(row.change)?.h1),
            volume5Usd: num(rec(row.volume)?.m5),
            txs5: num(rec(row.txs)?.m5),
            txs1h: num(rec(row.txs)?.h1),
            tsMs: num(row.tsMs),
            servedAgeMs: result.ok && Number.isFinite(result.meta?.ageMs) && (result.meta?.ageMs ?? 0) > 0 ? (result.meta?.ageMs as number) : 0,
          };
    infos.set(p.id, { atMs: deps.now(), value });
    return value;
  }

  async function risk(p: Position): Promise<Risk | null> {
    const hit = risks.get(p.id);
    if (hit !== undefined && deps.now() - hit.atMs < riskTtl) return hit.value;
    const result = await deps.gateway.callInternal("/onchain/token-risk", { chainIndex: p.chainIndex, token: p.address }, "background");
    let value: Risk | null = null;
    if (result.ok) {
      const digest = buildOnchainDigest({ sources: { risk: like(result) }, sets: { netUnsoldUsd: [], liquidityUsd: [] }, quality: null, symbol: { origin: "onchain_token", communityRecognized: null, sameSymbolMatches: 0 } });
      const valid = (digest.risco?.flags ?? []).filter((f) => FLAG.test(f));
      const flags = digest.honeypot === true ? ["honeypot"] : [...bearishFlags(valid).slice(0, 3), ...bullishFlags(valid).slice(0, 3)];
      value = { level: num(rec(result.data)?.riskLevel), flags };
    }
    risks.set(p.id, { atMs: deps.now(), value });
    return value;
  }

  return {
    async read(book, signal) {
      const planned = new Set(deps.plans.all().map((pl) => pl.key));
      // the dust under five dollars is not worth a read, and a value over a million is far likelier a scam token's claim than a retail position: it would crowd the real holdings out of the biggest ones.
      // Both stay unverified (and so out of the totals) unless the agent itself opened the position.
      // a position with a plan is always read, whatever its value (even none): its stop depends on its price
      const candidates = book.positions.filter((p) => !p.isCash && p.address !== "native" && ((p.usd !== null && p.usd >= READ_MIN_USD && p.usd <= READ_MAX_USD) || planned.has(planKey(p.chainIndex, p.address))));
      const chosen = [...candidates].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)).filter((p, i) => i < max || planned.has(planKey(p.chainIndex, p.address)));
      const facts = new Map<string, HoldingFacts>();
      for (const p of chosen) {
        if (signal.aborted) break;
        const isPlanned = planned.has(planKey(p.chainIndex, p.address));
        const [i, r] = await Promise.all([info(p, isPlanned).catch(() => null), risk(p).catch(() => null)]);
        const plan = deps.plans.get(planKey(p.chainIndex, p.address));
        const price = p.priceUsd ?? i?.priceUsd ?? null;
        const liquidity = i?.liquidityUsd ?? null;
        facts.set(`${p.id}|${p.wallet}`, {
          priceUsd: price,
          sinceEntryPct: plan !== undefined && price !== null && plan.entryPriceUsd > 0 ? (price / plan.entryPriceUsd - 1) * 100 : null,
          changeH24Pct: i?.change24Pct ?? null,
          liquidityUsd: liquidity,
          exitImpactPct: liquidity !== null && liquidity > 0 && p.usd !== null ? (p.usd / liquidity) * 100 : null,
          volumeH24Usd: i?.volume24Usd ?? null,
          change5mPct: i?.change5Pct ?? null,
          change1hPct: i?.change1hPct ?? null,
          volume5mUsd: i?.volume5Usd ?? null,
          txs5m: i?.txs5 ?? null,
          txs1h: i?.txs1h ?? null,
          // how old what was read is: the older of the provider's own stamp and of what the gateway's cache said, and the time since this app read it; a cached answer never looks younger than it is
          dataAgeMin:
            i === null || i === undefined
              ? null
              : Math.max(i.tsMs === null ? 0 : deps.now() - i.tsMs, i.servedAgeMs + Math.max(0, deps.now() - (infos.get(p.id)?.atMs ?? deps.now())), 0) / 60_000,
          soldPct: null,
          riskLevel: r?.level ?? null,
          riskFlags: r?.flags ?? [],
          heldHours: plan === undefined ? null : Math.max(0, deps.now() - plan.entryAtMs) / HOUR_MS,
        });
      }
      return (p) => facts.get(`${p.id}|${p.wallet}`) ?? (p.priceUsd != null ? priceOnlyFacts(p.priceUsd) : null);
    },
  };
}

/* ---------------------------------------------------------------- the ecosystem */

export interface EcosystemReader {
  read(saldo: Saldo | null, signal: AbortSignal): Promise<EcoContext>;
}

/**
 * The tokens the ecosystem puts forward, from the same source "Pedir ao Inonu" uses. The scan costs up to fifteen provider reads, so it runs at most every 30 minutes; in between, the same candidates are
 * sized again against the balance of the moment. A scan that fails serves the last one, no older than two hours, and then nothing.
 */
/** How many candidates the agent asks the ecosystem scan for: the code then leaves most of the hot tokens closed (extended, no history), and the model needs real choices. */
const AGENT_POOL = 10;

/** The least time between two scans when only the networks with cash changed: a flapping balance must not make the scan thrash (it costs calls of the provider). */
const REFRESH_ON_NEW_CHAINS_MS = 2 * 60_000;

/** The scan while the market has something to offer: it costs the calls of the provider, so it is read more often only where there is a chance. */
const HOT_TTL_MS = 10 * 60_000;

export function createEcosystemReader(deps: { readonly source: BriefSource; readonly now: () => number; readonly ttlMs?: number; readonly maxStaleMs?: number; /** True while a purchase is open or a higher level of risk would open one: the scan is then read at the hot interval. */ readonly hot?: () => boolean }): EcosystemReader {
  const baseTtl = deps.ttlMs ?? 30 * 60_000;
  const isHot = (): boolean => {
    try {
      return deps.hot?.() === true;
    } catch {
      return false;
    }
  };
  const maxStale = deps.maxStaleMs ?? 2 * HOUR_MS;
  let scan: { readonly atMs: number; readonly key: string; readonly facts: readonly EcoFacts[]; readonly excluded: Readonly<Record<string, number>> } | null = null;
  // the networks where the agent holds cash decide which networks are read: when that set changes the candidates must follow the money, not wait for the half hour
  const cashChains = (saldo: Saldo | null): string => (saldo === null ? "" : saldo.chains.filter((c) => c.cashUsd > 0).map((c) => c.chainIndex).sort().join(","));
  const context = (saldo: Saldo | null): EcoContext => ({
    observedAtMs: scan?.atMs ?? deps.now(),
    saldo,
    candidates: (scan?.facts ?? []).map((f) => candidateOf(f, saldo)),
    excluded: scan?.excluded ?? {},
  });
  return {
    async read(saldo, signal) {
      const key = cashChains(saldo);
      const ttl = isHot() ? Math.min(baseTtl, HOT_TTL_MS) : baseTtl;
      if (scan === null || deps.now() - scan.atMs >= ttl || (scan.key !== key && deps.now() - scan.atMs >= REFRESH_ON_NEW_CHAINS_MS)) {
        try {
          const built = await deps.source.build({ modo: "ecossistema", ...(saldo === null ? {} : { saldo }) }, { signal, maxOnchainosCalls: 15, candidates: AGENT_POOL });
          if (built.ecosystem !== undefined) scan = { atMs: deps.now(), key, facts: built.ecosystem.candidates.map((c) => c.facts), excluded: built.ecosystem.excluded };
        } catch {
          if (scan !== null && deps.now() - scan.atMs > maxStale) scan = null;
        }
      }
      return context(saldo);
    },
  };
}

/* ---------------------------------------------------------------- the market around the portfolio */

export type PublicCandles = (instId: string, bar: "1H", limit: number, signal: AbortSignal) => Promise<readonly Candle[] | null>;

/** What the exchange says about the leverage in the market, from its free public data: the funding rate of a perpetual (one interval, as a fraction) and its open interest in dollars. Null when not read. */
export interface PublicDerivatives {
  funding(instId: string, signal: AbortSignal): Promise<number | null>;
  openInterestUsd(instId: string, signal: AbortSignal): Promise<number | null>;
}

export interface MarketContextReader {
  refresh(signal: AbortSignal): Promise<void>;
  get(): MarketContext | null;
}

const logReturns = (closes: readonly number[]): number[] => closes.slice(1).map((c, i) => Math.log(c / closes[i]!));
const stdev = (xs: readonly number[]): number | null => {
  if (xs.length < 3) return null;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return v > 0 ? Math.sqrt(v) : null;
};
const VOL_CODE = { calm: "calma", normal: "normal", stressed: "estressada" } as const;
const SYSTEM_ONE_MAX_AGE_MS = 30 * 60_000;

/**
 * What surrounds the portfolio, as short codes and numbers: how BTC and ETH did in a day, whether the market is trending, whether volatility is calm or stressed (recent twelve hours against the last two days),
 * and what the latest reading of System One said, when it is fresh. System One's own choice is never an order; it is one more piece of context for the model to weigh.
 */
export function createMarketContext(deps: { readonly candles: PublicCandles; readonly systemOne: () => unknown; readonly now: () => number; readonly derivatives?: PublicDerivatives }): MarketContextReader {
  let current: MarketContext | null = null;
  // the open interest is sampled at every refresh: its change over an hour needs two samples an hour apart, so it appears once the agent has been looking for that long
  const oiSamples: OiSample[] = [];
  const ret24 = (candles: readonly Candle[] | null): number | null => {
    if (candles === null || candles.length < 25) return null;
    const last = candles[candles.length - 1]!.close;
    const before = candles[candles.length - 25]!.close;
    return before > 0 ? Math.round((last / before - 1) * 1000) / 10 : null;
  };
  return {
    get: () => current,
    async refresh(signal) {
      const [btc, eth] = await Promise.all([deps.candles("BTC-USDT", "1H", 72, signal).catch(() => null), deps.candles("ETH-USDT", "1H", 72, signal).catch(() => null)]);
      const btc24 = ret24(btc);
      const eth24 = ret24(eth);
      let vol: string | null = null;
      if (btc !== null && btc.length >= 49) {
        const returns = logReturns(btc.slice(-49).map((c) => c.close));
        const long = stdev(returns);
        const recent = stdev(returns.slice(-12));
        const regime = long !== null && recent !== null ? volatilityRegime(recent / long) : null;
        vol = regime === null ? null : VOL_CODE[regime];
      }
      const s1 = rec(deps.systemOne());
      const completed = num(s1?.completedAtMs);
      const fresh = completed !== null && deps.now() - completed >= 0 && deps.now() - completed <= SYSTEM_ONE_MAX_AGE_MS;
      const decision = rec(s1?.decision);
      const choice = typeof decision?.choice === "string" ? decision.choice : null;
      const s1Choice = !fresh || choice === null ? null : choice === "hold" ? "manter" : /^long-/.test(choice) ? "comprado" : /^short-/.test(choice) ? "vendido" : null;
      const quant = rec(rec(s1?.brief)?.quant);
      const sigma = rec(quant?.sigma);
      const s1Regime = !fresh || typeof sigma?.regime !== "string" || !(sigma.regime in VOL_CODE) ? null : VOL_CODE[sigma.regime as keyof typeof VOL_CODE];
      const trend = btc24 === null ? null : btc24 >= 2 ? "alta" : btc24 <= -2 ? "queda" : "lateral";
      // the leverage in the market: who pays whom (funding) and whether the open positions are building (open interest), BTC being the market's own thermometer of it
      let fundBps: number | null = null;
      let oiVar: number | null = null;
      if (deps.derivatives !== undefined) {
        const [rate, oi] = await Promise.all([deps.derivatives.funding("BTC-USDT-SWAP", signal).catch(() => null), deps.derivatives.openInterestUsd("BTC-USDT-SWAP", signal).catch(() => null)]);
        fundBps = rate === null ? null : fundingBps(rate);
        if (oi !== null && Number.isFinite(oi) && oi > 0) {
          oiSamples.push({ ts: deps.now(), oiUsd: oi });
          if (oiSamples.length > OI_MAX_SAMPLES) oiSamples.splice(0, oiSamples.length - OI_MAX_SAMPLES);
        }
        const variation = oiVariationPct(oiSamples);
        oiVar = variation === null ? null : Math.round(variation * 10) / 10;
      }
      const next: MarketContext = { btc_24h: btc24, eth_24h: eth24, tendencia: trend, vol_btc: vol, fund_btc_bps: fundBps === null ? null : Math.round(fundBps * 100) / 100, oi_btc_1h: oiVar, s1_escolha: s1Choice, s1_regime: s1Regime, s1_idade_min: fresh && completed !== null ? Math.round((deps.now() - completed) / 60_000) : null };
      current = Object.values(next).every((v) => v === null) ? null : next;
    },
  };
}

/* ---------------------------------------------------------------- the price at the end of a window */

/** A thin token has no bar where nobody traded: its price at the end of a window is then the close of its last bar, as long as that bar is not older than this many bars (more is a hole in the data, not a quiet market). */
const PRICE_HOLE_BARS = { "5m": 6, "1H": 3 } as const;
/** The candles of a token are read once for every window of every decision on it that ended after the read, and kept this long at most. */
const PRICE_CANDLES_TTL_MS = 30 * 60_000;
const PRICE_CANDLES_KEPT = 64;

/**
 * The price of a token at the end of a Placar window: the close of the last hourly (or five-minute) bar that had already closed by then. Null when the bar is not there yet, is a hole of the data, or cannot be read.
 * The candles of one token serve all its windows (a decision is measured in four), so they are read once and kept: a read made before the end of a window is not used for it, and a failed read is never kept.
 */
export function createPriceLookup(deps: { readonly gateway: Gateway; readonly now?: () => number }): (decision: DecisionMark, atMs: number) => Promise<number | null> {
  const now = deps.now ?? Date.now;
  const kept = new Map<string, { readonly readAtMs: number; readonly candles: readonly Candle[] }>();
  return async (decision, atMs) => {
    const span = atMs - decision.atMs;
    const bar = span <= HOUR_MS ? "5m" : "1H";
    const barMs = bar === "5m" ? 300_000 : HOUR_MS;
    const key = `${decision.chainIndex}|${decision.address}|${bar}`;
    let entry = kept.get(key);
    // the read has to be newer than the end of the window by a whole bar, or the bar that closed at its end may not be in it yet
    if (entry === undefined || entry.readAtMs < atMs + barMs || now() - entry.readAtMs > PRICE_CANDLES_TTL_MS) {
      const result = await deps.gateway.callInternal("/onchain/candles", { chainIndex: decision.chainIndex, token: decision.address, bar, limit: "299" }, "background");
      const candles = result.ok ? toCandles(result.data) : null;
      if (candles === null) return null;
      entry = { readAtMs: now(), candles };
      if (kept.size >= PRICE_CANDLES_KEPT) kept.delete(kept.keys().next().value as string);
      kept.set(key, entry);
    }
    let found: Candle | null = null;
    for (const c of entry.candles) if (c.confirmed && c.startMs + barMs <= atMs && (found === null || c.startMs > found.startMs)) found = c;
    return found !== null && atMs - (found.startMs + barMs) < PRICE_HOLE_BARS[bar] * barMs ? found.close : null;
  };
}

/** Funding and open interest of a perpetual from the exchange's free public endpoints. Null when the answer is not what the documentation promises. */
export function okxPublicDerivatives(fetchImpl: typeof fetch): PublicDerivatives {
  const get = async (url: string, signal: AbortSignal): Promise<Record<string, unknown> | null> => {
    const response = await fetchImpl(url, { signal, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const body = rec(await response.json().catch(() => null));
    if (body === null || body.code !== "0" || !Array.isArray(body.data)) return null;
    return rec(body.data[0]);
  };
  const valid = (instId: string): boolean => /^[A-Z0-9-]{3,30}$/.test(instId);
  const number = (v: unknown): number | null => (typeof v === "string" && /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v) ? Number(v) : null);
  return {
    async funding(instId, signal) {
      if (!valid(instId)) return null;
      const row = await get(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`, signal);
      return row === null ? null : number(row.fundingRate);
    },
    async openInterestUsd(instId, signal) {
      if (!valid(instId)) return null;
      const row = await get(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`, signal);
      return row === null ? null : number(row.oiUsd);
    },
  };
}

/* ---------------------------------------------------------------- public hourly candles */

/** Hourly bars from the exchange's free public endpoint, oldest first. Null when the answer is not what the documentation promises. */
export function okxPublicCandles(fetchImpl: typeof fetch): PublicCandles {
  return async (instId, bar, limit, signal) => {
    if (!/^[A-Z0-9-]{3,30}$/.test(instId) || !Number.isInteger(limit) || limit < 1 || limit > 300) return null;
    const response = await fetchImpl(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`, { signal, headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const body = rec(await response.json().catch(() => null));
    if (body === null || body.code !== "0" || !Array.isArray(body.data)) return null;
    const out: Candle[] = [];
    for (const row of body.data) {
      if (!Array.isArray(row) || row.length < 9) return null;
      const [ts, open, high, low, close, volume] = row.slice(0, 6).map((v) => (typeof v === "string" && /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v) ? Number(v) : Number.NaN));
      if (![ts, open, high, low, close].every(Number.isFinite)) return null;
      out.push({ startMs: ts!, open: open!, high: high!, low: low!, close: close!, volume: Number.isFinite(volume) ? volume! : null, confirmed: row[8] === "1" });
    }
    return out.sort((a, b) => a.startMs - b.startMs);
  };
}
