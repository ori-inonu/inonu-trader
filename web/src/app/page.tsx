"use client";

import DecisionPanel from "@/components/DecisionPanel/DecisionPanel";
import Feed from "@/components/Feed/Feed";
import FlowChart from "@/components/FlowChart/FlowChart";
import Header from "@/components/Header/Header";
import StatsRow from "@/components/StatsRow/StatsRow";
import WalletPanel from "@/components/WalletPanel/WalletPanel";
import { useFeed } from "@/lib/useFeed";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

export default function Page() {
  const feed = useFeed(API_URL);

  return (
    <main className="card">
      <Header meta={feed.meta} latest={feed.latest} connection={feed.connection} />
      <StatsRow latest={feed.latest} avgLatencyMs={feed.avgLatencyMs} meta={feed.meta} />
      <div className={styles.main}>
        <div className={styles.chartWrap}>
          <FlowChart
            events={feed.events}
            latest={feed.latest}
            market={feed.meta?.market ?? ""}
          />
        </div>
        <div className={styles.decision}><DecisionPanel latest={feed.latest} /></div>
        <div className={styles.wallet}><WalletPanel /></div>
        <div className={styles.feed}><Feed events={feed.events} /></div>
      </div>
    </main>
  );
}
