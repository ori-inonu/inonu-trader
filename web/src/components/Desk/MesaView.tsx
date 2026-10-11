"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConsoleBackdrop from "@/components/ConsoleBackdrop/ConsoleBackdrop";
import { useDesk } from "@/lib/desk/useDesk";
import { DESK_DEFAULT_WATCHLIST, type DeskBar } from "@/lib/desk/types";
import { useJevRead } from "@/lib/jev-read";
import { capabilityRows, feedChips, jevStageModel, journalRows, newestReadAgeMs, systemOneLine } from "@/lib/mesa/mesa-model";
import { useReducedMotion } from "@/lib/motion";
import { useOperatorCenter } from "@/lib/operator-center";
import { useSystemOne } from "@/lib/system-one";
import { useOkxWallet } from "@/lib/useOkxWallet";
import DeskDock from "./DeskDock";
import DeskRail, { FeedChipList } from "./DeskRail";
import JevStage from "./JevStage";
import { DerivativesStrip, FlowGauge, LiquiditySurface, OrderBookLadder, PriceChart, TimeAndSales, Watchlist } from "./panels";
import styles from "./MesaView.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
const JEV_URL = process.env.NEXT_PUBLIC_JEV_READ_URL ?? API_URL;

type Tab = "jev" | "grafico" | "livro" | "fluxo" | "fontes";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "jev", label: "Jev" },
  { id: "grafico", label: "Grafico" },
  { id: "livro", label: "Livro" },
  { id: "fluxo", label: "Fluxo" },
  { id: "fontes", label: "Fontes" },
];

export default function MesaView() {
  const reducedMotion = useReducedMotion();
  const [focus, setFocus] = useState("BTC-USDT");
  const [bar, setBar] = useState<DeskBar>("1m");
  const [tab, setTab] = useState<Tab>("jev");
  const [nowMs, setNowMs] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { state: desk } = useDesk({ focus, bar, watchlist: DESK_DEFAULT_WATCHLIST });
  const jevBoard = useJevRead(JEV_URL);
  const systemOne = useSystemOne(API_URL);
  const operator = useOperatorCenter(API_URL);
  const wallet = useOkxWallet();

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // Pointer parallax: written straight to custom properties so a mouse move never re-renders React.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion || typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--px", String(((event.clientX / window.innerWidth) * 2 - 1).toFixed(3)));
        root.style.setProperty("--py", String(((event.clientY / window.innerHeight) * 2 - 1).toFixed(3)));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  const skewMs = desk.clockSkewMs;
  const jevAgeMs = newestReadAgeMs(jevBoard.board, nowMs, skewMs);
  const stage = useMemo(
    () => jevStageModel({ status: jevBoard.status, board: jevBoard.board, focus, nowMs, browserSkewMs: skewMs }),
    [jevBoard.status, jevBoard.board, focus, nowMs, skewMs],
  );
  const chips = useMemo(
    () => feedChips({ desk: desk.feeds, jev: { status: jevBoard.status, ageMs: jevAgeMs }, wallet: { status: wallet.snapshot.status, available: wallet.available }, operator: { status: operator.status } }),
    [desk.feeds, jevBoard.status, jevAgeMs, wallet.snapshot.status, wallet.available, operator.status],
  );
  const capabilities = useMemo(
    () =>
      capabilityRows({
        desk: desk.feeds,
        jev: { status: jevBoard.status, ageMs: jevAgeMs },
        systemOne: { status: systemOne.status, execution: systemOne.cycle?.execution.status ?? null, reasons: systemOne.cycle?.execution.reasons ?? [] },
        wallet: { status: wallet.snapshot.status, available: wallet.available },
        operator: { status: operator.status },
        hasDerivatives: desk.derivatives !== null,
      }),
    [desk.feeds, desk.derivatives, jevBoard.status, jevAgeMs, systemOne.status, systemOne.cycle, wallet.snapshot.status, wallet.available, operator.status],
  );
  const journal = useMemo(() => journalRows(jevBoard.board?.recent ?? [], 5), [jevBoard.board]);

  const wsState = desk.feeds.find((feed) => feed.id === "okx-public-ws")?.state ?? "idle";
  const bizState = desk.feeds.find((feed) => feed.id === "okx-business-ws")?.state ?? "idle";
  const wsStale = wsState === "stale" || wsState === "reconnecting" || wsState === "failed";
  const bizStale = bizState === "stale" || bizState === "reconnecting" || bizState === "failed";

  return (
    <>
      <ConsoleBackdrop tone={stage.tone} />
      <div ref={rootRef} className={styles.root} data-tab={tab}>
        <div className={styles.rail}>
          <DeskRail chips={chips} skewMs={skewMs} nowMs={nowMs} />
        </div>

        <main className={styles.deck}>
          <div className={`${styles.wing} ${styles.wingL}`} data-slot="livro">
            <div className={styles.cell} style={{ flex: "1.25 1 0" }}>
              <OrderBookLadder book={desk.book} instrument={desk.instrument} metrics={desk.metrics} stale={wsStale && desk.book !== null} reducedMotion={reducedMotion} />
            </div>
            <div className={styles.cell} style={{ flex: "1 1 0" }}>
              <TimeAndSales trades={desk.trades} instrument={desk.instrument} stale={wsStale && desk.trades.length > 0} reducedMotion={reducedMotion} />
            </div>
          </div>

          <div className={styles.center}>
            <div className={styles.jev} data-slot="jev">
              <JevStage
                model={stage}
                last={desk.ticker?.last ?? null}
                tickSz={desk.instrument?.tickSz ?? null}
                change24hPct={desk.metrics.change24hPct}
                systemOneLine={systemOneLine({ status: systemOne.status, cycle: systemOne.cycle })}
              />
            </div>
            <div className={styles.graph} data-slot="grafico">
              <div className={styles.cell} style={{ flex: "1.4 1 0" }}>
                <PriceChart candles={desk.candles} bar={desk.bar} metrics={desk.metrics} ticker={desk.ticker} instrument={desk.instrument} onBarChange={setBar} stale={bizStale && desk.candles.length > 0} reducedMotion={reducedMotion} />
              </div>
              <div className={styles.cell} style={{ flex: "1 1 0" }}>
                <LiquiditySurface liquidity={desk.liquidity} midPx={desk.metrics.midPx} instrument={desk.instrument} stale={wsStale && desk.liquidity.length > 0} reducedMotion={reducedMotion} />
              </div>
            </div>
          </div>

          <div className={`${styles.wing} ${styles.wingR}`} data-slot="fluxo">
            <div className={styles.cell} style={{ flex: "1.1 1 0" }}>
              <Watchlist rows={desk.watchlist} focus={focus} onSelect={setFocus} stale={wsStale && desk.watchlist.length > 0} reducedMotion={reducedMotion} />
            </div>
            <div className={styles.cell} style={{ flex: "1 1 0" }}>
              <FlowGauge metrics={desk.metrics} flow={desk.flow} instrument={desk.instrument} stale={wsStale && desk.flow.length > 0} reducedMotion={reducedMotion} />
            </div>
            <div className={styles.cell} style={{ flex: "0.7 1 0" }}>
              <DerivativesStrip derivatives={desk.derivatives} metrics={desk.metrics} instrument={desk.instrument} nowMs={nowMs > 0 ? nowMs + (skewMs ?? 0) : undefined} stale={wsStale && desk.derivatives !== null} reducedMotion={reducedMotion} />
            </div>
          </div>
        </main>

        <div className={styles.dock} data-slot="fontes">
          <div className={styles.mobileChips}>
            <FeedChipList chips={chips} />
          </div>
          <DeskDock wallet={wallet} capabilities={capabilities} journal={journal} />
        </div>

        <nav className={styles.tabs} aria-label="Secoes da mesa">
          {TABS.map((item) => (
            <button key={item.id} type="button" className={styles.tab} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
