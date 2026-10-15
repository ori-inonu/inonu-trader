"use client";

import { type CSSProperties, type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import ConsoleBackdrop from "@/components/ConsoleBackdrop/ConsoleBackdrop";
import { useAssetCatalog } from "@/lib/desk/useAssetCatalog";
import { useDecisionHistory } from "@/lib/desk/chart/useDecisionHistory";
import { useDesk } from "@/lib/desk/useDesk";
import { DESK_DEFAULT_WATCHLIST, type DeskBar } from "@/lib/desk/types";
import { useJevRead } from "@/lib/jev-read";
import { DOCK_TABS } from "@/lib/mesa/dock";
import { NARROW_QUERY, bodyPlan, visibleTabIds, watchNarrow, type BodyPlan, type DockCopy } from "@/lib/mesa/dock-layout";
import { DOCK_SUBVIEWS } from "@/lib/mesa/dock-subviews";
import { subjectFromFocus } from "@/lib/inonu/ask-target";
import { sharedAskTrigger } from "@/lib/inonu/ask-trigger";
import { alertsForDesk, type EngineAlert } from "@/lib/inonu/engine-alerts";
import { useEngineAlerts } from "@/lib/inonu/useEngineAlerts";
import { quoteMultiplierOf } from "@/lib/desk/desk-model";
import { marketRead } from "@/lib/desk/market-read";
import { useThermometerModel } from "@/lib/desk/useThermometerModel";
import { guardTrades } from "@/lib/desk/thermometer";
import { exchangeNowMs } from "@/lib/mesa/clock";
import { flowTab, zonesTab } from "@/lib/mesa/flow-tab-model";
import { viewSource } from "@/lib/mesa/view-source";
import { marketInputsFor } from "@/lib/mesa/market-inputs";
import type { OverlayFeedState } from "@/lib/inonu/overlay-feed";
import { useOverlayReading } from "@/lib/inonu/useOverlayReading";
import { createOnchainClient } from "@/lib/onchain/client";
import { CHAIN_ORDER } from "@/lib/onchain/chains";
import { parseOnchainFocus, type OnchainFocus } from "@/lib/onchain/focus";
import { onchainInstrumentFor, onchainMetricsFor, onchainTickerFor, useOnchainCandles } from "@/lib/onchain/useOnchainCandles";
import { useOnchainWalletMarks, walletMarksByIndex } from "@/lib/onchain/wallet-marks";
import { BAR_MS } from "@/lib/desk/okx-parse";
import { useOnchainResource } from "@/lib/onchain/useOnchainResource";
import { useWatchPins, watchExtras } from "@/lib/mesa/watch-pins";
import { focusFromSearch } from "@/lib/rastreador/open";
import { resolveChainIndex, useOnchainView } from "@/lib/mesa/onchain-view";
import { createSettingsClient } from "@/lib/settings/client";
import { feedChips, hasModelDecision, jevStageModel, journalRows, newestReadAgeMs } from "@/lib/mesa/mesa-model";
import { applyCoreChips, coreChips, useCoreStatus } from "@/lib/mesa/core-status";
import { useChartDetail } from "@/lib/desk/chart/detail-store";
import { priceMap } from "@/lib/mesa/alerts";
import { feedAges } from "@/lib/mesa/topbar-model";
import { useReducedMotion } from "@/lib/motion";
import { useOperatorCenter } from "@/lib/operator-center";
import { useOkxWallet } from "@/lib/useOkxWallet";
import DeskRail, { FeedChipList } from "./DeskRail";
import { DockPanel, useDockState, type DockTabView } from "./Dock/DockPanel";
import { DiscoveryMenu } from "./TopbarDiscovery";
import { DockComposite, DockFlowBody, DockNews, DockZonesBody } from "./Dock/DockComposite";
import MarketCard from "./Dock/MarketCard";
import { EcosystemTab } from "./Dock/EcosystemTab";
import { MemepumpTab } from "./Dock/MemepumpTab";
import { DockBook, DockJournal, DockTape } from "./Dock/DockTabs";
import DockWalletTab from "./Dock/DockWalletTab";
import { EcoNewsSection, OnchainLiquidityTab, OnchainTapeTab } from "./Dock/OnchainDeskTabs";
import { HoldersTab, SmartMoneyTab, TradersTab, type SelectedToken } from "./Dock/OnchainTabs";
import { feedStateOf, type PanelFeedState } from "./panels/PanelFrame";
import { AssetPicker } from "./panels/AssetPicker";
import DockInonu from "./Dock/DockInonu";
import EngineRadar from "./Dock/EngineRadar";
import JevPicks from "./Dock/JevPicks";
import type { TokenCard } from "@/lib/opportunity/picks";
import InonuPreRead from "./Dock/InonuPreRead";
import { ChartLegend } from "./panels/ChartLegend";
import JevStage from "./JevStage";
import { LayoutButton } from "./TopbarTools";
import { MESA_TAB_ICONS } from "./MesaTabIcons";
import { applyLayout } from "@/lib/mesa/layout";
import { DerivativesStrip, FlowGauge, JevIndicators, LiquiditySurface, PriceChart, Watchlist } from "./panels";
import Thermometer from "./panels/Thermometer";
import type { PriceChartOnchain } from "./panels/PriceChart";
import styles from "./MesaView.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
const JEV_URL = process.env.NEXT_PUBLIC_JEV_READ_URL ?? API_URL;

/** What the Zonas view and the Fluxo tab show in the first instant, before the shared reading of the engine has answered. */
const ENGINE_LOADING: OverlayFeedState = { status: "loading", overlay: null, reason: null };

type Tab = "jev" | "grafico" | "livro" | "fluxo" | "fontes";

/** A tab reports its feed state up so the dock chip can mirror it. */
function useFeedReporter(id: string, setFeeds: Dispatch<SetStateAction<Partial<Record<string, PanelFeedState>>>>) {
  return useCallback((s: PanelFeedState) => setFeeds((f) => (f[id] === s ? f : { ...f, [id]: s })), [id, setFeeds]);
}
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "jev", label: "Inonu" },
  { id: "grafico", label: "Grafico" },
  { id: "livro", label: "Livro" },
  { id: "fluxo", label: "Fluxo" },
  { id: "fontes", label: "Fontes" },
];

export default function MesaView() {
  const reducedMotion = useReducedMotion();
  const [focus, setFocus] = useState("BTC-USDT");
  // The Rastreador opens an asset here through /mesa?ativo=SYMBOL: read once, and only a plain OKX instrument id is accepted.
  useEffect(() => {
    const id = focusFromSearch(window.location.search);
    if (id !== null) setFocus(id);
  }, []);
  const [bar, setBar] = useState<DeskBar>("1m");
  const [tab, setTab] = useState<Tab>("grafico");
  const [nowMs, setNowMs] = useState(0);

  // On-chain chart focus (session only): set by the Smart money rows or the asset picker,
  // cleared by any OKX instrument pick. The desk itself always follows the last OKX instrument.
  const [onchainFocus, setOnchainFocus] = useState<OnchainFocus | null>(null);
  const selectOkx = useCallback((instId: string) => {
    setFocus(instId);
    setOnchainFocus(null);
  }, []);
  const watchPins = useWatchPins(DESK_DEFAULT_WATCHLIST);
  const watchIds = useMemo(
    () => [...DESK_DEFAULT_WATCHLIST, ...watchPins.pins.filter((p) => !DESK_DEFAULT_WATCHLIST.includes(p))],
    [watchPins.pins],
  );

  const { state: desk } = useDesk({ focus, bar, watchlist: watchIds });
  const jevBoard = useJevRead(JEV_URL);
  const jevHistory = useDecisionHistory(jevBoard.board);
  const assetCatalog = useAssetCatalog();
  const operator = useOperatorCenter(API_URL);
  const wallet = useOkxWallet();

  // Onchain dock tabs: shared selection (persisted), shared token pick (session only), the API
  // client, the settings default network and which of the two mounted dock panels is on screen.
  const onchainView = useOnchainView();
  const [defaultChainIndex, setDefaultChainIndex] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<SelectedToken | null>(null);
  const [onchainFeeds, setOnchainFeeds] = useState<Partial<Record<string, PanelFeedState>>>({});
  // null until measured: the onchain bodies stay placeholders so a phone never mounts the
  // desktop copy first (both dock panels mount; only one is on screen).
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const onchainClient = useMemo(() => createOnchainClient(), []);
  const dock = useDockState();

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => watchNarrow(window.matchMedia(NARROW_QUERY), setNarrow), []);

  // The configured default network is a local settings read, once per mount.
  useEffect(() => {
    let disposed = false;
    createSettingsClient()
      .get()
      .then((s) => {
        if (!disposed) setDefaultChainIndex(s.prefs.onchain.defaultChainIndex);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  const reportSmart = useFeedReporter("smart", setOnchainFeeds);
  const reportTraders = useFeedReporter("traders", setOnchainFeeds);
  const reportHolders = useFeedReporter("holders", setOnchainFeeds);
  const reportLancamentos = useFeedReporter("lancamentos", setOnchainFeeds);
  const reportOportunidades = useFeedReporter("oportunidades", setOnchainFeeds);
  const reportFita = useFeedReporter("fita", setOnchainFeeds);
  const reportLiquidez = useFeedReporter("liquidez", setOnchainFeeds);
  const reportEco = useFeedReporter("ecossistema", setOnchainFeeds);

  // Chart focus resources: candles poll on the bar TTL, tracked-wallet marks once per token.
  const ocCandles = useOnchainCandles(onchainFocus, bar, onchainClient);
  const ocMarks = useOnchainWalletMarks(onchainFocus, onchainClient);
  const ocChains = useOnchainResource(onchainFocus !== null ? "chart-chains" : null, (user) => onchainClient.chains(user ? "user" : "background"));

  const pickToken = (t: SelectedToken | null) => {
    setSelectedToken(t);
    if (t !== null) {
      // A token picked on the desk becomes the chart focus too (SMC-10/CHN-3).
      const f = parseOnchainFocus({ chainIndex: t.chainIndex, address: t.address, symbol: t.symbol, name: null });
      if (f !== null) setOnchainFocus(f);
      dock.select("radar");
      dock.selectSub("radar", "holders");
    }
  };
  const selectOnchain = (t: OnchainFocus) => {
    setOnchainFocus(t);
    setSelectedToken({ chainIndex: t.chainIndex, address: t.address, symbol: t.symbol });
  };

  const skewMs = desk.clockSkewMs;
  const jevAgeMs = newestReadAgeMs(jevBoard.board, nowMs, skewMs);
  const jevDecided = useMemo(() => hasModelDecision(jevBoard.board), [jevBoard.board]);
  const jevReadSet = useMemo(() => new Set(Object.keys(jevBoard.board?.reads ?? {})), [jevBoard.board]);
  const railAges = useMemo(() => feedAges(desk.feeds, nowMs), [desk.feeds, nowMs]);
  const railPrices = useMemo(() => priceMap(desk.watchlist, focus, desk.ticker?.last), [desk.watchlist, desk.ticker, focus]);
  const stage = useMemo(
    () => jevStageModel({ status: jevBoard.status, board: jevBoard.board, focus, nowMs, browserSkewMs: skewMs }),
    [jevBoard.status, jevBoard.board, focus, nowMs, skewMs],
  );
  // the Inonu and OnchainOS chips read the core itself (it answers a click, it does not run a producer); where it does not answer they keep the old reading
  const coreStatus = useCoreStatus();
  // one choice for the whole desk: the simple screen has the chart and ONE thermometer; the complete one keeps the flow gauge, the derivatives and the old indicators
  const [detail] = useChartDetail();
  const simple = detail === "simples";
  const chips = useMemo(
    () => applyCoreChips(
      feedChips({ desk: desk.feeds, jev: { status: jevBoard.status, ageMs: jevAgeMs, decided: jevDecided }, wallet: { status: wallet.snapshot.status, available: wallet.available }, operator: { status: operator.status } }),
      coreChips(coreStatus, nowMs),
    ),
    [desk.feeds, jevBoard.status, jevAgeMs, jevDecided, wallet.snapshot.status, wallet.available, operator.status, coreStatus, nowMs],
  );
  const journal = useMemo(() => journalRows(jevBoard.board?.recent ?? [], 40), [jevBoard.board]);

  const wsState = desk.feeds.find((feed) => feed.id === "okx-public-ws")?.state ?? "idle";
  const bizState = desk.feeds.find((feed) => feed.id === "okx-business-ws")?.state ?? "idle";
  const wsStale = wsState === "stale" || wsState === "reconnecting" || wsState === "failed";
  const bizStale = bizState === "stale" || bizState === "reconnecting" || bizState === "failed";

  const walletFeed = feedStateOf(
    wallet.snapshot.status === "error",
    wallet.snapshot.account === null && wallet.snapshot.status !== "connecting" && wallet.snapshot.status !== "reading",
  );
  const chainIndex = resolveChainIndex(onchainView.view, defaultChainIndex);

  // The onchain prop of PriceChart: null in the normal OKX mode. Wallet marks are grouped by
  // candle index here so the chart gets a ready lookup; an errored signals read is not fatal.
  const chartOnchain = useMemo<PriceChartOnchain | null>(() => {
    if (onchainFocus === null) return null;
    const apiName = ocChains.state.data?.find((c) => c.chainIndex === onchainFocus.chainIndex)?.name;
    const staticName = CHAIN_ORDER.find((c) => c.chainIndex === onchainFocus.chainIndex)?.name;
    const ocCandleRows = ocCandles.state.data ?? [];
    return {
      focus: onchainFocus,
      chainName: apiName ?? staticName ?? `Rede ${onchainFocus.chainIndex}`,
      status: ocCandles.state.status,
      error: ocCandles.state.error,
      meta: ocCandles.state.meta,
      wallets: ocMarks.state.data !== null ? walletMarksByIndex(ocMarks.state.data, ocCandleRows, BAR_MS[bar]) : null,
      onBack: () => setOnchainFocus(null),
      picker: {
        client: onchainClient,
        chainIndex: onchainView.view.chainIndex,
        onChainSelect: (c: string) => onchainView.patch({ chainIndex: c }),
        onSelectToken: selectOnchain,
      },
    };
  }, [onchainFocus, ocChains.state.data, ocCandles.state, ocMarks.state.data, onchainClient, chainIndex, bar]); // eslint-disable-line react-hooks/exhaustive-deps

  const extras = useMemo(
    () => watchExtras(assetCatalog.status === "ready" ? assetCatalog.spot : [], watchIds),
    [assetCatalog, watchIds],
  );

  // Chart inputs under an on-chain focus: candles from the gateway, ticker, metrics and the
  // instrument synthesized from them (last close, 24h window when covered, nothing invented).
  const ocInputs = useMemo(() => {
    if (onchainFocus === null) return null;
    const candles = ocCandles.state.data ?? [];
    const last = candles[candles.length - 1]?.close ?? null;
    return {
      candles,
      ticker: onchainTickerFor(candles, onchainFocus),
      metrics: onchainMetricsFor(candles),
      instrument: last !== null ? onchainInstrumentFor(onchainFocus, last) : null,
    };
  }, [onchainFocus, ocCandles.state.data]);

  // The alerts of the flow and the zones (ASK-13): computed here from the reading the page already polls, never from the model. The button of
  // an alert leaves a request for the Inonu panel of that instrument, opens its tab, and that panel asks once.
  const engineAlertsAll = useEngineAlerts(focus, onchainFocus === null);
  // the simple desk tells only the zones: the runs of the flow are for whoever reads it level by level
  const engineAlerts = { ...engineAlertsAll, ...alertsForDesk(engineAlertsAll.alerts, engineAlertsAll.unseen, simple) };
  const askAboutAlert = (alert: EngineAlert): void => {
    if (alert.instId !== focus) selectOkx(alert.instId);
    sharedAskTrigger().request(alert.instId);
    revealDock("diario");
    if (narrow === true) setTab("fontes");
  };

  // The engine reading behind the Zonas view and the Fluxo tab: the very poll the chart uses (one per instrument, shared), turned on
  // only while one of those two is on screen and the chart follows an OKX instrument. It is free and never asks the model.
  const onScreenTabs = visibleTabIds({ narrow, active: dock.state.tab, open: dock.state.open });
  const wantsEngine = onchainFocus === null && (onScreenTabs.includes("fluxo") || (onScreenTabs.includes("radar") && dock.subs.radar === "zonas"));
  const engineReading = useOverlayReading(focus, wantsEngine);
  const engineFeed: OverlayFeedState | null = !wantsEngine ? null : (engineReading ?? ENGINE_LOADING);
  const engineClock = Math.floor(nowMs / 5_000); // the ages on those two move every few seconds, not on every tick
  // the engine stamps its readings with the exchange clock, so their ages are counted against it, not against the Windows clock
  const exchangeNow = exchangeNowMs(nowMs, skewMs);
  // the cost of moving money through the book, read once for the thermometer and the Inonu tab (the Mercado card reads it again with the plan of the Inonu)
  const marketForScenario = useMemo(
    () => (simple && onchainFocus === null ? marketRead({ book: desk.book, quoteMultiplier: quoteMultiplierOf(focus), nowMs: exchangeNow, stale: wsStale && desk.book !== null, plan: null }) : null),
    [simple, onchainFocus, desk.book, focus, exchangeNow, wsStale],
  );
  // the reading of the moment for the legend of the chart: the same hook as the thermometer panel (one steady hand, one saved answer), so the chart and the panel never disagree
  const thermoRead = useThermometerModel({ instId: focus, metrics: desk.metrics, price: desk.ticker?.last ?? null, market: marketForScenario });
  const flowModel = useMemo(() => flowTab(engineFeed, exchangeNow), [engineFeed, engineClock]); // eslint-disable-line react-hooks/exhaustive-deps
  const zonesModel = useMemo(() => zonesTab(engineFeed, exchangeNow), [engineFeed, engineClock]); // eslint-disable-line react-hooks/exhaustive-deps

  // DAT-2: where each view's data comes from and how old it is. The ages move every few seconds, not every tick, so the dock is not rebuilt each second.
  const sourceClock = Math.floor(nowMs / 5_000);
  const sourceOf = (view: "zonas" | "fita" | "livro" | "liquidez"): string | null => {
    const overlay = engineFeed?.overlay ?? null;
    return viewSource({
      view,
      onchain: onchainFocus !== null,
      feedAgeMs: railAges["okx-public-ws"],
      engine: overlay === null ? null : { asOfMs: overlay.asOfMs, fonte: overlay.fonte },
      nowMs: exchangeNow,
      stale: view === "zonas" ? zonesModel.state === "stale" : wsStale,
    });
  };
  const radarSource = useMemo(() => (dock.subs.radar === "zonas" ? sourceOf("zonas") : null), [dock.subs.radar, zonesModel, sourceClock]); // eslint-disable-line react-hooks/exhaustive-deps
  const marketSource = useMemo(() => sourceOf(dock.subs.mercado as "fita" | "livro" | "liquidez"), [dock.subs.mercado, onchainFocus, wsStale, sourceClock]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadingOrHidden = (plan: BodyPlan) => (plan.mount === "carregando" ? <div role="status">Carregando</div> : <div role="status" />);
  // Both dock copies mount; only the one on screen gets the real body of a view that reads data (a second mount would be a second
  // provider call). plan.mount is "carregando" until the width is measured.
  const onchainBody = (id: "oportunidades" | "smart" | "traders" | "holders" | "lancamentos", plan: BodyPlan) => {
    if (plan.mount !== "montar") return loadingOrHidden(plan);
    const props = { view: onchainView.view, patch: onchainView.patch, chainIndex, client: onchainClient };
    if (id === "smart") return <SmartMoneyTab {...props} onPickToken={pickToken} onFeedState={reportSmart} onReloadExtra={ocMarks.reload} />;
    if (id === "traders") return <TradersTab {...props} onFeedState={reportTraders} />;
    if (id === "lancamentos") return <MemepumpTab {...props} onPickToken={pickToken} onFeedState={reportLancamentos} />;
    if (id === "oportunidades") return <EcosystemTab {...props} onPickToken={pickToken} onFeedState={reportOportunidades} />;
    return <HoldersTab {...props} selectedToken={selectedToken} onPickToken={pickToken} onFeedState={reportHolders} />;
  };
  // The tape and the liquidity view switch to the on-chain surface while an on-chain focus is set; like the other data views, only the
  // on-screen dock copy mounts the real body.
  const ocShared = (id: "fita" | "liquidez", plan: BodyPlan) => {
    if (plan.mount !== "montar") return loadingOrHidden(plan);
    if (id === "fita") return <OnchainTapeTab focus={onchainFocus!} client={onchainClient} onFeedState={reportFita} nowMs={nowMs} />;
    return <OnchainLiquidityTab focus={onchainFocus!} client={onchainClient} onFeedState={reportLiquidez} nowMs={nowMs} />;
  };
  // News and sentiment: the on-chain token symbol when the chart follows a token, the instrument base otherwise.
  const ecoSymbol = onchainFocus?.symbol ?? focus.split("-")[0] ?? focus;
  const newsBody = (plan: BodyPlan) =>
    plan.mount !== "montar" ? (
      loadingOrHidden(plan)
    ) : (
      <DockNews>
        <EcoNewsSection symbol={ecoSymbol} focus={onchainFocus} client={onchainClient} onFeedState={reportEco} nowMs={nowMs} />
      </DockNews>
    );
  // The best opportunities of the ecosystem (RAS-8): one panel for the Inonu tab and for the first view of the Radar. Only the on-screen dock copy mounts it (a second mount is a second balance read).
  const openPick = (card: TokenCard) => {
    const f = parseOnchainFocus({ chainIndex: card.chainIndex, address: card.address, symbol: card.symbol, name: null });
    if (f !== null) selectOnchain(f);
    // on a phone the chart is another section: the token opens where it can be seen
    if (narrow === true) setTab("grafico");
  };
  const picksPanel = <JevPicks wallet={wallet} onOpen={openPick} onPrepared={() => dock.select("carteira")} />;
  const picksBody = (plan: BodyPlan) => (plan.mount !== "montar" ? loadingOrHidden(plan) : picksPanel);
  // The pairs of the exchange, ordered by how far out of the ordinary each is: where to look, never what to buy. It left the Inonu tab for the Radar, which is where lists live.
  const pairsBody = (plan: BodyPlan) =>
    plan.mount !== "montar" ? (
      loadingOrHidden(plan)
    ) : (
      <EngineRadar
        catalog={assetCatalog}
        focus={focus}
        onOpen={(id) => {
          selectOkx(id);
          // on a phone the chart is another section: the pair opens where it can be seen
          if (narrow === true) setTab("grafico");
        }}
        network={{ chainName: CHAIN_ORDER.find((c) => c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`, onOpen: () => { dock.select("radar"); dock.selectSub("radar", "oportunidades"); } }}
      />
    );
  const buildDockTabs = (copy: DockCopy): readonly DockTabView[] => {
    const plan = bodyPlan({ narrow, copy, onchainFocus });
    const onchain = plan.surface === "onchain";
    const subs = dock.subs;
    const radarState: PanelFeedState = subs.radar === "zonas" ? zonesModel.state : subs.radar === "noticias" ? (onchainFeeds.ecossistema ?? "empty") : (onchainFeeds[subs.radar] ?? "empty");
    const marketState: PanelFeedState =
      subs.mercado === "fita"
        ? onchain
          ? (onchainFeeds.fita ?? "empty")
          : feedStateOf(wsStale && desk.trades.length > 0, desk.trades.length === 0)
        : subs.mercado === "livro"
          ? feedStateOf(wsStale && desk.book !== null, desk.book === null)
          : onchain
            ? (onchainFeeds.liquidez ?? "empty")
            : feedStateOf(wsStale && desk.liquidity.length > 0, desk.liquidity.length === 0);
    const stateOf: Record<string, PanelFeedState> = {
      diario: feedStateOf(jevBoard.status !== "ready" && journal.length > 0, journal.length === 0),
      radar: radarState,
      fluxo: flowModel.state,
      carteira: walletFeed,
      mercado: marketState,
    };

    const radarBody =
      subs.radar === "zonas" ? (
        <DockZonesBody model={zonesModel} />
      ) : subs.radar === "noticias" ? (
        newsBody(plan)
      ) : subs.radar === "melhores" ? (
        picksBody(plan)
      ) : subs.radar === "pares" ? (
        pairsBody(plan)
      ) : (
        onchainBody(subs.radar as "oportunidades" | "smart" | "traders" | "holders" | "lancamentos", plan)
      );
    const marketBody =
      subs.mercado === "fita" ? (
        onchain ? (
          ocShared("fita", plan)
        ) : (
          <DockTape trades={desk.trades} instrument={desk.instrument} stale={wsStale && desk.trades.length > 0} />
        )
      ) : subs.mercado === "livro" ? (
        <DockBook
          book={desk.book}
          instrument={desk.instrument}
          metrics={desk.metrics}
          stale={wsStale && desk.book !== null}
          note={onchain ? `Ativo on-chain em foco. Ultimo ativo OKX: ${focus}` : null}
        />
      ) : onchain ? (
        ocShared("liquidez", plan)
      ) : (
        <LiquiditySurface liquidity={desk.liquidity} midPx={desk.metrics.midPx} instrument={desk.instrument} stale={wsStale && desk.liquidity.length > 0} reducedMotion={reducedMotion} />
      );

    return DOCK_TABS.map((def) => ({
      ...def,
      state: stateOf[def.id] ?? "empty",
      body:
        def.id === "diario" ? (
          // the Inonu tab: only the on-screen copy mounts it (one set of polls), and the old Jev reads stay below when there are any
          plan.mount === "montar" ? (
            <DockInonu
              instId={focus}
              subject={subjectFromFocus(focus, onchainFocus)}
              legacy={journal.length > 0 ? <DockJournal rows={journal} /> : null}
              radar={picksPanel}
              preRead={onchainFocus === null ? <InonuPreRead instId={focus} price={desk.ticker?.last ?? null} imbalance={desk.metrics.flowImbalance60s} trades={guardTrades(desk.metrics)} market={marketForScenario} /> : null}
            />
          ) : (
            loadingOrHidden(plan)
          )
        ) : def.id === "radar" ? (
          <DockComposite label="Vistas do Radar" views={DOCK_SUBVIEWS.radar} active={subs.radar} onSelect={(id) => dock.selectSub("radar", id)} source={radarSource}>
            {radarBody}
          </DockComposite>
        ) : def.id === "fluxo" ? (
          <DockFlowBody model={flowModel} />
        ) : def.id === "carteira" ? (
          <DockWalletTab wallet={wallet} withSwitch={plan.mount === "montar"} candidate={onchainFocus} />
        ) : simple && !onchain ? (
          // the simple desk reads the raw market for the person: what it costs to move an amount, how thick it is, where the big queues wait; the tape, the book and the liquidity are in the complete one
          plan.mount === "montar" ? (
            <MarketCard instId={focus} book={desk.book} quoteMultiplier={quoteMultiplierOf(focus)} stale={wsStale && desk.book !== null} exchangeNowMs={exchangeNow} source={marketSource} />
          ) : (
            loadingOrHidden(plan)
          )
        ) : (
          <DockComposite label="Vistas do mercado bruto" views={DOCK_SUBVIEWS.mercado} active={subs.mercado} onSelect={(id) => dock.selectSub("mercado", id)} source={marketSource}>
            {marketBody}
          </DockComposite>
        ),
    }));
  };
  const dockTabs = useMemo<readonly DockTabView[]>(() => buildDockTabs("wide"), [
    desk.trades, desk.book, desk.liquidity, desk.instrument, desk.metrics, wsStale, walletFeed, wallet, journal,
    jevBoard.status, reducedMotion, narrow, onchainView.view, chainIndex, selectedToken, onchainFeeds, onchainFocus, focus,
    dock.subs, flowModel, zonesModel, radarSource, marketSource, sourceClock, simple, assetCatalog, // the on-chain tape, liquidity and news tell their age: rebuilt every few seconds
  ]); // eslint-disable-line react-hooks/exhaustive-deps
  const dockTabsMobile = useMemo<readonly DockTabView[]>(() => buildDockTabs("phone"), [
    desk.trades, desk.book, desk.liquidity, desk.instrument, desk.metrics, wsStale, walletFeed, wallet, journal,
    jevBoard.status, reducedMotion, narrow, onchainView.view, chainIndex, selectedToken, onchainFeeds, onchainFocus, focus,
    dock.subs, flowModel, zonesModel, radarSource, marketSource, sourceClock, simple, assetCatalog, // the on-chain tape, liquidity and news tell their age: rebuilt every few seconds
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const openConsultation = (view: "diario" | "carteira") => {
    applyLayout("completo");
    dock.select(view);
    setTab("fontes");
  };

  const revealDock = (id: string) => {
    applyLayout("completo");
    dock.select(id);
  };

  // The instrument header reads the very slices the chart draws, so the hero price, the chart and its legend never disagree.
  const marketInputs = marketInputsFor(desk, ocInputs);
  const headerProps = {
    ...marketInputs,
    stale: ocInputs === null ? wsStale && desk.ticker !== null : ocCandles.state.meta?.stale === true,
  };

  return (
    <>
      <ConsoleBackdrop tone={stage.tone} />
      <div
        className={styles.root}
        data-tab={tab}
        style={{ "--dock-h": dock.state.open ? `clamp(190px, ${dock.state.heightPct}vh, 55vh)` : "34px" } as CSSProperties}
      >
        <div className={styles.rail}>
          <DeskRail
            chips={chips}
            skewMs={skewMs}
            nowMs={nowMs}
            symbolPicker={
              <AssetPicker
                focus={focus}
                catalog={assetCatalog}
                jevReads={jevReadSet}
                onSelect={selectOkx}
                onchainFocus={onchainFocus}
                onchain={{
                  client: onchainClient,
                  chainIndex: onchainView.view.chainIndex,
                  onChainSelect: (c) => onchainView.patch({ chainIndex: c }),
                  onSelectToken: selectOnchain,
                }}
              />
            }
            instId={focus}
            engineAlerts={engineAlerts.alerts}
            engineUnseen={engineAlerts.unseen}
            onEngineAsk={askAboutAlert}
            onEngineSeen={engineAlerts.markSeen}
            discovery={<DiscoveryMenu chainIndex={chainIndex} chainName={CHAIN_ORDER.find((c) => c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`} />}
            ages={railAges}
            account={wallet.snapshot.account}
            prices={railPrices}
          />
        </div>

        <main className={styles.deck}>
          <div className={styles.center}>
            <div className={styles.jev} data-slot="jev">
              <JevStage
                model={stage}
                last={desk.ticker?.last ?? null}
                tickSz={desk.instrument?.tickSz ?? null}
                change24hPct={desk.metrics.change24hPct}
                systemOneLine={null} // the old System One sentence is gone: the state of a request lives in the Inonu tab (ASK-9)
              />
            </div>
            {simple ? null : (
              <div className={styles.indicators}>
                <JevIndicators read={jevBoard.board?.reads[focus] ?? null} nowMs={nowMs} browserSkewMs={skewMs} boardReady={jevBoard.status === "ready"} />
              </div>
            )}
            <div className={styles.graph} data-slot="grafico">
              <div className={`${styles.mobileActions} ${styles.decisionActions}`}>
                <LayoutButton labelled />
                <button type="button" onClick={() => openConsultation("diario")}>Consultar ativo</button>
                <button type="button" className={styles.primaryAction} onClick={() => openConsultation("carteira")}>Analisar carteira</button>
              </div>
              <div className={styles.cell} style={{ flex: "1 1 0" }}>
                <PriceChart
                  candles={marketInputs.candles}
                  bar={desk.bar}
                  metrics={marketInputs.metrics}
                  ticker={marketInputs.ticker}
                  instrument={marketInputs.instrument}
                  onBarChange={setBar}
                  stale={ocInputs === null ? bizStale && desk.candles.length > 0 : ocCandles.state.meta?.stale === true}
                  reducedMotion={reducedMotion}
                  focus={focus}
                  onAssetSelect={selectOkx}
                  catalog={assetCatalog}
                  onchain={chartOnchain}
                  legend={<ChartLegend header={headerProps} read={simple && onchainFocus === null ? thermoRead.model : null} onAsk={() => openConsultation("diario")} onPortfolio={() => openConsultation("carteira")} />}
                  onchainPicker={{
                    client: onchainClient,
                    chainIndex: onchainView.view.chainIndex,
                    onChainSelect: (c) => onchainView.patch({ chainIndex: c }),
                    onSelectToken: selectOnchain,
                  }}
                  jev={{
                    status: jevBoard.status,
                    board: jevBoard.board,
                    browserSkewMs: skewMs,
                    nowExchangeMs: nowMs > 0 && skewMs !== null ? nowMs + skewMs : null,
                    history: jevHistory,
                  }}
                />
              </div>
            </div>
          </div>

          <div className={`${styles.wing} ${styles.wingR}`} data-slot="fluxo">
            <div className={styles.cell} style={{ flex: simple && onchainFocus === null ? "0.8 1 0" : "1.1 1 0" }}>
              <Watchlist rows={desk.watchlist} focus={focus} onSelect={selectOkx} stale={wsStale && desk.watchlist.length > 0} reducedMotion={reducedMotion} pins={watchPins} extras={extras} />
            </div>
            {simple && onchainFocus === null ? (
              <div className={styles.cell} style={{ flex: "1.9 1 0" }}>
                <Thermometer instId={focus} metrics={desk.metrics} price={desk.ticker?.last ?? null} stale={wsStale && desk.flow.length > 0} market={marketForScenario} onAsk={() => openConsultation("diario")} />
              </div>
            ) : (
              <>
              <div className={styles.cell} style={{ flex: "1 1 0" }}>
                <FlowGauge metrics={desk.metrics} flow={desk.flow} instrument={desk.instrument} stale={wsStale && desk.flow.length > 0} reducedMotion={reducedMotion} />
              </div>
              <div className={styles.cell} style={{ flex: "0.7 1 0" }}>
                <DerivativesStrip derivatives={desk.derivatives} metrics={desk.metrics} instrument={desk.instrument} nowMs={nowMs > 0 ? nowMs + (skewMs ?? 0) : undefined} stale={wsStale && desk.derivatives !== null} reducedMotion={reducedMotion} />
              </div>
              </>
            )}
          </div>
        </main>

        <div className={styles.dock} data-slot="fontes">
          <div className={styles.mobileChips}>
            <FeedChipList chips={chips} />
          </div>
          <DockPanel
            className={styles.dockMain}
            tabs={dockTabs}
            active={dock.state.tab}
            onSelect={revealDock}
            open={dock.state.open}
            onToggle={dock.toggle}
            heightPct={dock.state.heightPct}
            onHeightPct={dock.setHeightPct}
          />
          <DockPanel
            className={styles.dockMobile}
            group="livro"
            tabs={dockTabsMobile.filter((t) => DOCK_TABS.find((d) => d.id === t.id)?.group === "livro")}
            active={dock.state.tab}
            onSelect={revealDock}
            open
            onToggle={dock.toggle}
            heightPct={dock.state.heightPct}
            onHeightPct={dock.setHeightPct}
            resizable={false}
          />
          <DockPanel
            className={styles.dockMobile}
            group="fontes"
            tabs={dockTabsMobile.filter((t) => DOCK_TABS.find((d) => d.id === t.id)?.group === "fontes")}
            active={dock.state.tab}
            onSelect={revealDock}
            open
            onToggle={dock.toggle}
            heightPct={dock.state.heightPct}
            onHeightPct={dock.setHeightPct}
            resizable={false}
          />
        </div>

        <nav className={styles.tabs} aria-label="Secoes da mesa">
          {TABS.map((item) => (
            <button key={item.id} type="button" className={styles.tab} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
              {MESA_TAB_ICONS[item.id]}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
