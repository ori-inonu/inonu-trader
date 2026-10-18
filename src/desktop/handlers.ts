/**
 * The real API handlers behind the desktop core (T1.4), wired exactly like `src/server.ts` wires them but without the
 * Kuru trader (D-U2) and with every path under one data directory (WIN-5). The factories are the existing ones; this file
 * only composes them, so a change in a handler's contract shows up in `handlers.test.ts`.
 *
 * Origins: the handlers need an exact Origin. The core is the only origin of the desktop app, and it supplies it on
 * the browser's same-origin requests (see core.ts), so the allowlist is just that origin.
 */
import { join } from "node:path";
import { createAsker, type AskLimits, type InonuModel, type ScreenerModel } from "../inonu/ask";
import { SourceError } from "../inonu/ask";
import { createInonuHandler } from "../inonu/http";
import { activeDevOrigins } from "./dev-origins";
import { createJevInonuModel, createJevScreenerModel } from "../inonu/jev-model";
import { createChainIconService } from "../inonu/chain-icons";
import { createIconService } from "../inonu/icons";
import { createFileLedger } from "../inonu/ledger";
import { createPriceStore } from "../inonu/prices";
import { createOkxPublic } from "../inonu/okx-public";
import { createCollector } from "../inonu/collector";
import { createDerivatives } from "../inonu/derivatives";
import { createFlowMemory } from "../inonu/flow-memory";
import { createTradeFeed, type SocketLike } from "../inonu/okx-ws";
import { createOkxSource } from "../inonu/source";
import { countSentCalls, withSentCount } from "../inonu/source-count";
import { createDiscoverySource } from "../inonu/source-discovery";
import { createEcosystemSource } from "../inonu/source-ecosystem";
import { createRankingSource } from "../inonu/source-ranking";
import { createOkxDaily } from "../opportunity/okx-daily";
import { createScanner } from "../opportunity/scan";
import { createOnchainSource, routeByMode } from "../inonu/source-onchain";
import { createPortfolioSource } from "../inonu/portfolio";
import { createRateMeter } from "../intel/ingest";
import { createPulse } from "../pulse/pulse";
import { createOutcomes } from "../outcomes/wire";
import { createJevReadHandler } from "../jev-read/http";
import { okxNowMs } from "../okx-clock";
import { createBudget } from "../onchain-read/budget";
import { createOnchainCache } from "../onchain-read/cache";
import { createOnchainClient, okxBudgetIn } from "../onchain-read/client";
import { createOnchainGateway, type OnchainGateway } from "../onchain-read/gateway";
import { createOnchainHandler } from "../onchain-read/http";
import { createProbeOnchainos } from "../onchain-read/probe";
import { createAgentHandler } from "../agent/http";
import type { AgentService } from "../agent/service";
import { createAgentService } from "../agent/wire";
import { createSettingsHandler } from "../settings/http";
import { PROVIDERS } from "../settings/providers";
import { createSettingsStore, type SettingsStore } from "../settings/store";
import { createSystemOneHandler } from "../system-one/http";
import type { CoreHandlers } from "./core";

export interface DesktopHandlersOptions {
  /** The data root (`%LOCALAPPDATA%\InonuTrader\data` in the installed app). Created on first write. */
  readonly dataDir: string;
  /** The core's own origin, `http://127.0.0.1:<port>`. */
  readonly origin: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** The machine's own clock, for what the page stamps (tests set it; the default is Date.now). */
  readonly localNow?: () => number;
  /** The settings store. The installed app passes the vault-backed one; without it the dotenv file store is used. */
  readonly store?: SettingsStore;
  /** Test seam: builds the model for a click from the saved key. The installed app uses the real Jev adapter. */
  readonly inonuModel?: (apiKey: string) => InonuModel;
  /** Test seam for the filter mode of the Rastreador, the same way. */
  readonly screenerModel?: (apiKey: string) => ScreenerModel;
  /** Follow the market live (OKX public WebSocket, free) so the flow engine can learn its thresholds. The launcher turns it on; tests leave it off. */
  readonly liveFeed?: boolean;
  /** Test seam: opens the WebSocket. Default: the runtime's own. */
  readonly webSocket?: (url: string) => SocketLike;
  /** The pulse of the market for the agent (src/pulse, ADENDO-E E1): one extra live connection with minute-level regime of BTC and SOL in the Brief. OFF unless this is true or INONU_AGENT_PULSE=1; it needs the live feed. */
  readonly pulse?: boolean;
  /** Starts the rhythm of the autonomous agent. The launcher turns it on with the live feed; a tick does nothing while the agent is off, which is how it is born. */
  readonly agent?: boolean;
}

/** Instruments followed from the start, so the thresholds are already warm when someone asks. Others are added on the first click. */
const DEFAULT_WATCH: readonly string[] = ["BTC-USDT", "BTC-USDT-SWAP", "ETH-USDT", "ETH-USDT-SWAP"];

const TARGET_WARMUP_CANDLES = 50;
/** How often the open interest of the followed perpetuals is sampled, so its change over an hour can be told. */
const SAMPLE_MS = 5 * 60_000;

/**
 * Caps of "Pedir ao Inonu". The price per token is unknown until the user gives one, so the dollar caps cannot be checked yet
 * and the day is capped by the number of calls; the ledger still records the tokens the provider measured.
 */
const INONU_LIMITS: AskLimits = { cooldownMs: 15_000, reuseTtlMs: 300_000, maxUsdPerRequest: 0.1, maxUsdPerDay: 1, maxCallsPerDay: 20, timeoutMs: 60_000, usdPerMtok: { input: null, output: null } };

/** The handlers plus the two services the Doctor reads (the settings store and the gateway), so nothing is built twice. */
export interface DesktopHandlers extends Required<CoreHandlers> {
  readonly store: SettingsStore;
  readonly gateway: OnchainGateway;
  /** The autonomous agent, for the tests and the Doctor. */
  readonly agentService: AgentService;
  /** Stops the live feed. */
  close(): void;
}

export function createDesktopHandlers(options: DesktopHandlersOptions): DesktopHandlers {
  const { dataDir, origin } = options;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? okxNowMs; // the exchange refuses a signature more than 30 s off its clock (launcher syncs it)
  // this machine's own clock, the one the page stamps what it sends with (a test that injects `now` uses it for both)
  const localNow = options.localNow ?? options.now ?? Date.now;
  // the page of the core itself; the development web (allowed only by src/desktop/dev.ts) is the one other origin ever listed
  const origins = [origin, ...activeDevOrigins()];

  const store = options.store ?? createSettingsStore(dataDir);
  const gateway = createOnchainGateway({
    client: createOnchainClient({ credentials: () => store.credentials().okx, fetch: fetchImpl, now, budget: okxBudgetIn(dataDir, now) }),
    cache: createOnchainCache(now),
    budget: createBudget({
      dir: dataDir,
      now,
      caps: () => {
        const prefs = store.prefs().onchain;
        return { basic: prefs.capBasic, premium: prefs.capPremium };
      },
    }),
    credentialsState: () => store.status().okx.state,
    now,
  });

  // "Pedir ao Inonu": the only door to the model, and nothing runs until a person clicks (ASK-1)
  const ledger = createFileLedger({ dir: join(dataDir, "inonu") });
  const modelKey = () => store.credentials().typesafeAiApiKey;
  const jev = createJevInonuModel({ apiKey: modelKey });
  const jevScreener = createJevScreenerModel({ apiKey: modelKey });
  const rest = createOkxPublic({ fetch: fetchImpl });
  const opportunityScanner = createScanner({ okx: createOkxDaily({ fetch: fetchImpl }), now: options.localNow ?? Date.now });
  const meter = createRateMeter();
  // what the engine learned survives a restart, so the factors of the chart do not wait fifty minutes after every launch (FLX-12)
  const collector = createCollector({ rest, now, memory: createFlowMemory({ dir: join(dataDir, "flow"), now }) });
  const feed = options.liveFeed
    ? createTradeFeed({
        create: options.webSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike),
        schedule: {
          after: (ms, fn) => {
            const timer = setTimeout(fn, ms);
            return () => clearTimeout(timer);
          },
          every: (ms, fn) => {
            const timer = setInterval(fn, ms);
            return () => clearInterval(timer);
          },
        },
        now: Date.now,
        onTrades: (instId, trades) => collector.ingest(instId, trades),
        meter,
      })
    : null;
  /** Load the instrument, then follow it on the live feed. A failed load is retried by the next click. */
  const follow = (instId: string): void => {
    void collector.watch(instId).then((result) => {
      if (result.ok) feed?.subscribe(instId);
    });
  };
  if (feed) for (const instId of DEFAULT_WATCH) follow(instId);
  // the funding rate and open interest of the perpetuals (T5.10): free public reads, sampled so the open interest change can be told
  const derivatives = createDerivatives({ rest, now });
  const source = createOkxSource({ rest, now, collector, derivatives, onWatch: follow });
  const sampleSwaps = (): void => {
    for (const instId of DEFAULT_WATCH) if (instId.endsWith("-SWAP")) void derivatives.read(instId, AbortSignal.timeout(10_000)).catch(() => undefined);
  };
  if (options.liveFeed) sampleSwaps(); // the hour of the open interest starts when the app does
  const sampling = options.liveFeed ? setInterval(sampleSwaps, SAMPLE_MS) : null;
  if (sampling !== null) (sampling as { unref?: () => void }).unref?.();
  // the price per million tokens: given by the person while the app runs, kept in the data folder, read at every call
  const priceStore = createPriceStore({ file: join(dataDir, "inonu", "prices.json") });
  const limits: { -readonly [K in keyof AskLimits]: AskLimits[K] } = { ...INONU_LIMITS, usdPerMtok: priceStore.read() };
  // each click goes to the source of its mode: the exchange for an instrument, the OnchainOS gateway for a token or a whole network (a mode nobody serves is refused)
  // The calls that really left are counted by the gateway the two on-chain sources read through, so a click that read and then refused still says how many it spent.
  const counted = countSentCalls(gateway);
  const askSource = routeByMode({
    ativo: source,
    token: withSentCount(createOnchainSource({ gateway: counted.gateway, now }), counted),
    descoberta: withSentCount(createDiscoverySource({ gateway: counted.gateway, now }), counted),
    // the rows chosen in the Rastreador: read from the exchange like a click on each instrument, one Brief for all of them (RAS-6)
    ranking: createRankingSource({ okx: source, now }),
    // a reading of the wallet is stamped by the page, on this machine's clock: its age is judged on that clock, not on the one corrected for the exchange signature
    carteira: withSentCount(createPortfolioSource({ token: createOnchainSource({ gateway: counted.gateway, now }), now: localNow }), counted),
    // the best opportunities across the networks (RAS-8): the tokens that have support, with the ceiling of what the balance allows for each; the balance is judged on this machine's clock by the asker
    ecossistema: withSentCount(createEcosystemSource({ gateway: counted.gateway, now }), counted),
  });
  // what the market did after each answer is measured (Placar): the recorder and the decision log run only with the live feed
  const outcomes = createOutcomes({ dataDir, fetch: fetchImpl, now, source, derivatives, instruments: () => collector.instruments(), live: options.liveFeed === true });
  const asker = outcomes.wrapAsker(createAsker({
    source: askSource,
    model: () => {
      const key = modelKey();
      if (key === null) return null;
      return options.inonuModel ? options.inonuModel(key) : jev;
    },
    screener: () => {
      const key = modelKey();
      if (key === null) return null;
      return options.screenerModel ? options.screenerModel(key) : jevScreener;
    },
    ledger,
    limits,
    now,
    localNow,
    newId: () => crypto.randomUUID(),
  }));

  // the pulse of the market for the agent: one connection of its own to the public feed (free, no key), only when asked for and only with the live feed on
  const pulse =
    options.liveFeed && (options.pulse ?? process.env.INONU_AGENT_PULSE === "1")
      ? createPulse({
          create: options.webSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike),
          schedule: {
            after: (ms, fn) => {
              const timer = setTimeout(fn, ms);
              return () => clearTimeout(timer);
            },
            every: (ms, fn) => {
              const timer = setInterval(fn, ms);
              return () => clearInterval(timer);
            },
          },
          now: Date.now,
          meter,
        })
      : null;
  pulse?.start();
  // the autonomous agent: born off, it reads, decides and measures only after the person raises its mode
  const agentService = createAgentService({
    dataDir,
    ...(pulse === null ? {} : { pulse }),
    store,
    gateway,
    source: createEcosystemSource({ gateway, now }),
    now,
    fetch: fetchImpl,
    start: options.agent === true,
  });

  return {
    store,
    gateway,
    agentService,
    agent: createAgentHandler({ service: agentService, origins }),
    close: () => {
      // the agent waits for the work in flight before it lets go of its folder and says close_timeout when that takes too long: the rest of the shutdown goes on, and the folder is freed when the process exits
      // (only the cloud server, which never idles out, is meant to run unattended: a window that closes ends the app and, with it, the agent)
      agentService.close().catch(() => undefined);
      outcomes.close();
      feed?.close();
      pulse?.close();
      if (sampling !== null) clearInterval(sampling);
    },
    inonu: createInonuHandler({
      asker,
      origins,
      // the opportunity engine: free public exchange reads, run in the background when someone looks at the board, cached ten minutes
      opportunities: () => opportunityScanner.look(),
      icons: createIconService({ dir: join(dataDir, "icons"), fetch: fetchImpl }),
      // the logo of each network: the provider's own list (free, kept a day by the gateway) names the URL, and this process fetches it
      chainIcons: createChainIconService({
        dir: join(dataDir, "icons"),
        fetch: fetchImpl,
        logoOf: async (chainIndex) => {
          const list = await gateway.call("/onchain/networks", {}, "user");
          if (!list.ok || !Array.isArray(list.data)) return null;
          const row = (list.data as Array<{ chainIndex?: unknown; logoUrl?: unknown }>).find((r) => r.chainIndex === chainIndex);
          return typeof row?.logoUrl === "string" ? row.logoUrl : null;
        },
      }),
      overlay: async (instId) => {
        try {
          return await source.overlay(instId, AbortSignal.timeout(15_000));
        } catch (error) {
          return { ok: false as const, code: error instanceof SourceError ? error.code : "coleta_falhou" };
        }
      },
      preview: async (instId) => {
        try {
          const built = await source.build({ modo: "ativo", alvo: { instId } }, { signal: AbortSignal.timeout(20_000), maxOnchainosCalls: 15 });
          return { ok: true, brief: built.brief, bytes: new TextEncoder().encode(JSON.stringify(built.brief)).length, candidates: built.candidates.map((c) => c.id) };
        } catch (error) {
          return { ok: false, code: error instanceof SourceError ? error.code : "coleta_falhou" };
        }
      },
      engine: () => ({
        feed: feed?.status() ?? null,
        messagesPerSecond: Math.round(meter.perSecond("okx-ws-trades", Date.now()) * 100) / 100,
        instruments: collector.instruments().map((instId) => {
          const snapshot = collector.snapshot(instId)!;
          return { instId, closedCandles: snapshot.closedCandles, needed: TARGET_WARMUP_CANDLES, lastTradeAgeMs: snapshot.lastTradeTs === null ? null : Math.max(0, now() - snapshot.lastTradeTs) };
        }),
      }),
      providers: () => PROVIDERS,
      placar: outcomes.placar,
      perfil: { read: () => outcomes.perfil.read(), write: (value) => outcomes.perfil.write(value as never) },
      usage: () => {
        const summary = ledger.summary(now());
        return {
          today: summary.today,
          month: summary.month,
          recent: ledger.entries().slice(-10).reverse().map((e) => ({
            atMs: e.atMs, modo: e.modo, modelo: e.modelo, resultado: e.resultado, latenciaMs: e.latenciaMs, usd: e.usd, chamadasOnchainos: e.chamadasOnchainos,
            tokens: e.tokensEntrada !== null && e.tokensSaida !== null ? e.tokensEntrada + e.tokensSaida : null,
          })),
          prices: limits.usdPerMtok,
        };
      },
      setPrices: (prices) => {
        if (!priceStore.write(prices)) return false;
        limits.usdPerMtok = prices;
        return true;
      },
      modelConfigured: () => modelKey() !== null,
      today: () => {
        const { calls, usd } = ledger.summary(now()).today;
        return { calls, usd };
      },
    }),
    settings: createSettingsHandler({ store, origins, probeOnchainos: createProbeOnchainos({ fetch: fetchImpl, now }) }),
    onchain: createOnchainHandler({ gateway, origins }),
    jevRead: createJevReadHandler(join(dataDir, "jev-read", "latest.json"), origins, null),
    systemOne: createSystemOneHandler(join(dataDir, "system-one", "latest.json"), origins, null),
  };
}
