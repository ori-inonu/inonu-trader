"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import CommandCenter from "@/components/CommandCenter/CommandCenter";
import ConsoleBackdrop, { type BackdropTone } from "@/components/ConsoleBackdrop/ConsoleBackdrop";
import { DecisionCenterView } from "@/components/DecisionCenter/DecisionCenter";
import DepthLadder from "@/components/DepthLadder/DepthLadder";
import DexReportPanel from "@/components/DexReportPanel/DexReportPanel";
import Disclosure from "@/components/Disclosure/Disclosure";
import FlowChart from "@/components/FlowChart/FlowChart";
import GrowthDeck from "@/components/GrowthDeck/GrowthDeck";
import GevPilotPanel from "@/components/GevPilotPanel/GevPilotPanel";
import InstrumentRow, { type InstrumentItem } from "@/components/InstrumentRow/InstrumentRow";
import JevCore from "@/components/JevCore/JevCore";
import KpiSurface from "@/components/KpiSurface/KpiSurface";
import MultichainPanel from "@/components/MultichainPanel/MultichainPanel";
import Rail from "@/components/Rail/Rail";
import { RealPipeline } from "@/components/RealPipeline/RealPipeline";
import PublicMarket from "@/components/RealPipeline/PublicMarket";
import SystemOneView from "@/components/SystemOne/SystemOne";
import TelemetryStream from "@/components/TelemetryStream/TelemetryStream";
import WalletPanel from "@/components/WalletPanel/WalletPanel";
import { buildKpiCells } from "@/lib/kpi";
import { feedFrameState } from "@/lib/feed-frame";
import { useFeed } from "@/lib/useFeed";
import { useOperatorCenter } from "@/lib/operator-center";
import { useSystemOne } from "@/lib/system-one";
import { useReducedMotion } from "@/lib/motion";
import { useUptime } from "@/lib/useUptime";
import { useOkxWallet } from "@/lib/useOkxWallet";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";
const UNAVAILABLE = "Indisponivel";

function feedRate(events: { ts: number }[]): string {
  if (events.length < 2) return UNAVAILABLE;
  const first = events[0];
  const last = events[events.length - 1];
  const span = (last.ts - first.ts) / 1000;
  if (!Number.isFinite(span) || span <= 0) return UNAVAILABLE;
  return `${((events.length - 1) / span).toFixed(1)} bl/s`;
}

export default function Page() {
  const [legacyOpen, setLegacyOpen] = useState(false);
  return <>
    <ConsoleBackdrop tone="neutral" />
    <main className={styles.primary}>
      <header className={styles.primaryHeader}>
        <div><Link className={styles.backLink} href="/">Voltar para Mesa</Link><p>Central de observação</p><h1>INONU TRADER</h1><span>OKX Wallet, OnchainOS, Jev</span></div>
        <strong>Paper, execução financeira desativada</strong>
      </header>
      <section id="pipeline" aria-label="Integração real OKX e Jev"><RealPipeline apiBase={API_URL} /></section>
      <PublicMarket apiBase={API_URL} />
      <details className={styles.legacy} onToggle={event => setLegacyOpen(event.currentTarget.open)}>
        <summary>Console Kuru e análises complementares</summary>
        <p>O feed, os blocos e o executor Kuru precisam do backend legado e de sua configuração própria. O servidor independente do pipeline não fornece esse feed. As análises locais continuam disponíveis nesta seção.</p>
        {legacyOpen && <LegacyConsole />}
      </details>
    </main>
  </>;
}

function LegacyConsole() {
  const wallet = useOkxWallet();
  const feed = useFeed(API_URL);
  const operator = useOperatorCenter(API_URL);
  const systemOne = useSystemOne(API_URL);
  const reducedMotion = useReducedMotion();
  const uptimeText = useUptime(feed.meta?.startedAt);
  const latest = feed.latest;
  const frame = feedFrameState(feed.connection);
  const stale = frame.held;
  const connecting = frame.empty;

  const cells = useMemo(
    () => buildKpiCells(connecting ? null : latest, feed.avgLatencyMs, connecting ? null : uptimeText),
    [connecting, latest, feed.avgLatencyMs, uptimeText],
  );

  const tone: BackdropTone = !latest
    ? "neutral"
    : latest.decision?.late
      ? "late"
      : latest.decision?.action === "buy"
        ? "buy"
        : latest.decision?.action === "sell"
          ? "sell"
          : latest.decision?.action === "hold"
            ? "hold"
            : "neutral";

  const instruments = useMemo<InstrumentItem[]>(() => {
    const decision = latest?.decision ?? null;
    const latency = decision && !decision.late && Number.isFinite(decision.latencyMs)
      ? `${Math.round(decision.latencyMs)} ms`
      : UNAVAILABLE;
    const spread = latest && Number.isFinite(latest.spreadBps) ? `${latest.spreadBps.toFixed(2)} bps` : UNAVAILABLE;
    return [
      {
        id: "latencia",
        label: "Latencia da decisao",
        value: latency,
        tone: !latest ? "unknown" : decision?.late ? "late" : "neutral",
      },
      {
        id: "cadencia",
        label: "Cadencia do feed",
        value: feedRate(feed.events),
        tone: feed.events.length < 2 ? "unknown" : "neutral",
      },
      {
        id: "spread",
        label: "Spread informado",
        value: spread,
        tone: !latest ? "unknown" : "neutral",
      },
    ];
  }, [latest, feed.events]);

  return (
    <>
      <ConsoleBackdrop tone={tone} />

      <div className={styles.console}>
        <header className={styles.rail}>
          <Rail
            meta={feed.meta}
            latest={latest}
            connection={feed.connection}
            uptimeText={uptimeText}
            reducedMotion={reducedMotion}
          />
        </header>

        <section className={styles.command}>
          <GevPilotPanel snapshot={wallet.snapshot} />
          <CommandCenter
            meta={feed.meta}
            latest={connecting ? null : latest}
            events={feed.events}
            connection={feed.connection}
            operatorCycle={operator.cycle}
            reducedMotion={reducedMotion}
          />
          <SystemOneView state={systemOne} reducedMotion={reducedMotion} />
        </section>

        <section className={styles.kpi}>
          <KpiSurface cells={cells} reducedMotion={reducedMotion} connection={feed.connection} />
        </section>

        <section className={styles.core}>
          <JevCore
            latest={connecting ? null : latest}
            connection={feed.connection}
            model={feed.meta?.model ?? null}
            reducedMotion={reducedMotion}
          />
          <InstrumentRow items={instruments} />
        </section>

        <section className={`${styles.stage} ${stale ? styles.stale : ""}`}>
          <div className={styles.stageChart}>
            <FlowChart
              events={feed.events}
              latest={latest}
              market={feed.meta?.market ?? ""}
            />
          </div>
          <div className={styles.ladder}>
            <DepthLadder latest={latest} reducedMotion={reducedMotion} />
          </div>
          <div className={styles.stream}>
            <TelemetryStream
              events={feed.events}
              connection={feed.connection}
              reducedMotion={reducedMotion}
            />
          </div>
        </section>

        <section className={styles.growth}>
          <GrowthDeck reducedMotion={reducedMotion} />
        </section>

        <section className={styles.dock}>
          <div className={styles.dockDecision}><DecisionCenterView state={operator} /></div>
          <div className={styles.dockWallet}><WalletPanel /></div>
          <div className={styles.dockMultichain}><MultichainPanel /></div>
        </section>

        <section className={styles.reveal}>
          <Disclosure summary="Relatorio DEX" badge="Evidencia">
            <DexReportPanel />
          </Disclosure>
        </section>
      </div>
    </>
  );
}
