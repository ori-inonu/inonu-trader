"use client";

import type { ReactNode } from "react";
import type { ChartDetail } from "@/lib/desk/chart/detail";
import { useChartDetail } from "@/lib/desk/chart/detail-store";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import styles from "./DockInonu.module.css";
import { DockWallet } from "./DockTabs";
import HoldingsPanel from "./HoldingsPanel";
import OrderPanel from "./OrderPanel";
import TicketPanel from "./TicketPanel";
import type { OnchainFocus } from "@/lib/onchain/focus";

/**
 * The Carteira tab: the connected wallet and the Agentic Wallet note as they were, and under them the network switch (T9.2) and the order ticket (T9.6), which only shows quotes. Kept
 * apart so the file of the older tabs is not edited for it.
 */
/** What belongs to one view of the desk only: the tab itself stays a plain function of its props, and this small gate reads the choice. */
function OnlyIn({ detail, children }: { readonly detail: ChartDetail; readonly children: ReactNode }) {
  const [chosen] = useChartDetail();
  return chosen === detail ? <>{children}</> : null;
}

export default function DockWalletTab({ wallet, withSwitch = true, candidate = null }: { readonly wallet: UseOkxWalletResult; readonly candidate?: OnchainFocus | null; /** Only the copy of the dock that is on screen holds the switch: two copies would each look for the wallet. */ readonly withSwitch?: boolean }) {
  // the simple desk has ONE card (connect, read what is held on every network, ask the Inonu what to do) and the ticket only when an answer left one; the cards of the
  // specialist (the consultation of Monad and X Layer, the wallet states, the Agentic Wallet note, the network switch) are in the complete one
  return (
    <div className={styles.root}>
      <OnlyIn detail="completo">
        <DockWallet wallet={wallet} />
      </OnlyIn>
      {withSwitch ? <HoldingsPanel wallet={wallet} candidate={candidate} /> : null}
      {withSwitch ? <TicketPanel /> : null}
      {withSwitch ? <OrderPanel wallet={wallet} /> : null}
    </div>
  );
}
