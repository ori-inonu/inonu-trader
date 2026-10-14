"use client";

/**
 * "Pedir ao Inonu" for a whole network, from the top bar (ASK-12): the best entries now. The menu holds the same panel as the Inonu tab,
 * with the network as the subject; opening it asks nothing, and the one button inside is the only thing that does. The click reads at
 * most 15 OnchainOS calls of that one network, builds the Evidence Brief, and the model chooses among the ids the code produced.
 * Consultive: it never sends an order.
 */
import { type AskSubject, subjectKey } from "@/lib/inonu/ask-target";
import InonuAsk from "./InonuAsk";
import TopbarPopover from "./TopbarPopover";
import styles from "./DeskRail.module.css";

export function DiscoveryMenu({ chainIndex, chainName }: { readonly chainIndex: string; readonly chainName: string }) {
  const subject: AskSubject = { kind: "descoberta", chainIndex, chainName };
  return (
    <TopbarPopover
      label="Descobrir entradas"
      tool="discovery"
      face={
        <>
          <svg className={styles.sparkle} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
            <path d="M8 1.5l1.5 4.2 4.2 1.5-4.2 1.5L8 12.9 6.5 8.7 2.3 7.2l4.2-1.5z" />
            <path d="M12.8 10.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
          </svg>
          <span className={styles.chipText}>
            <span className={styles.chipLabel}>Descobrir</span>
          </span>
        </>
      }
    >
      <p className={styles.panelText}>
        Os melhores tokens com carteiras rastreadas comprando, na rede {chainName}. Nada roda antes do clique: ele usa ate 15 leituras da OKX OnchainOS e uma consulta ao modelo.
      </p>
      <InonuAsk key={subjectKey(subject)} instId={`descoberta:${chainIndex}`} subject={subject} />
      <p className={styles.panelNote}>Consultivo: nenhuma ordem e enviada. A rede vem da escolha do painel de carteiras.</p>
    </TopbarPopover>
  );
}
