"use client";

import type { ReactNode } from "react";
import type { ChartDetail } from "@/lib/desk/chart/detail";
import { useChartDetail } from "@/lib/desk/chart/detail-store";
import { type AskSubject, subjectKey, subjectLabel } from "@/lib/inonu/ask-target";
import MedicaoPanel from "@/components/Veredito/MedicaoPanel";
import InonuAsk from "../InonuAsk";
import styles from "./DockInonu.module.css";
import InonuLedgerTail from "./InonuLedgerTail";

/** What belongs to one view of the desk only: the tab itself stays a plain function of its props, and this small gate reads the choice. */
function InDetail({ detail, children }: { readonly detail: ChartDetail; readonly children: ReactNode }) {
  const [chosen] = useChartDetail();
  return chosen === detail ? <>{children}</> : null;
}

/**
 * The bottom panel tab of Inonu (ASK-9, T4.5): the button that asks, the state of the request and the answer, then the latest
 * requests of the ledger with the totals of the day. It replaces the
 * old "Diario do Inonu" tab and the System One sentence of the stage. The reads of the old Jev producer, when there are any, stay
 * below as `legacy`; the installed app has none and shows nothing there.
 *
 * The simple desk opens with what the code already read for free (`preRead`, three lines) and keeps the button and the answer; the proof of what each request cost and the measurement
 * of the answers are for whoever wants them, in the complete desk.
 *
 * Two zones: the radar of opportunities (`radar`, where to look first among the pairs of the market, with the ranking and the
 * network discovery in it) and the consultation of what the chart is on. The radar is the people's way to widen the question
 * beyond the one asset in focus; both ask the model only on a click.
 */
export default function DockInonu({ instId, subject, legacy = null, preRead = null, radar = null }: { readonly instId: string; readonly subject?: AskSubject; readonly legacy?: ReactNode; readonly preRead?: ReactNode; readonly radar?: ReactNode }) {
  const focus: AskSubject = subject ?? { kind: "okx", instId };
  return (
    <div className={styles.root}>
      <div className={styles.main} data-radar={radar === null ? "false" : "true"}>
        {radar === null ? null : <div className={styles.radarZone}>{radar}</div>}
        <div className={styles.askZone}>
          <p className={styles.zoneHead}>
            <span className={styles.zoneEyebrow}>Ativo em foco</span>
            <span className={styles.zoneName}>{subjectLabel(focus)}</span>
          </p>
          {preRead === null ? null : <InDetail detail="simples">{preRead}</InDetail>}
          {/* keyed by the subject: another instrument, token or network is another panel, so an answer in flight cannot land under it */}
          <InonuAsk key={subjectKey(focus)} instId={instId} {...(subject ? { subject } : {})} />
        </div>
      </div>
      {/* the ledger is the proof of what each request cost: it does not change with the subject, so it is not keyed by it */}
      <InDetail detail="completo">
        <InonuLedgerTail />
      </InDetail>
      {/* what the market did after each answer, measured here (Placar) and the recorder that feeds it: nothing here asks the model */}
      <InDetail detail="completo">
        <MedicaoPanel />
      </InDetail>
      {legacy !== null ? <div className={styles.legacy}>{legacy}</div> : null}
    </div>
  );
}
