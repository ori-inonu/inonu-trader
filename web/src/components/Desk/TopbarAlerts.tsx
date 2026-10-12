"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { fmtPctSigned } from "@/lib/desk/ui/format";
import { alertProblemText, alertState, describeAlert, fmtLevel, levelPreview, type LevelPreview } from "@/lib/mesa/alerts";
import { useAlerts } from "@/lib/mesa/useAlerts";
import TopbarPopover from "./TopbarPopover";
import styles from "./TopbarAlerts.module.css";

const ICON = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, focusable: "false", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function previewText(preview: LevelPreview): string {
  switch (preview.kind) {
    case "empty":
      return "Digite o preco. Use virgula para os decimais.";
    case "invalido":
      return alertProblemText("nivel-invalido");
    case "sem-preco":
      return alertProblemText("preco-indisponivel");
    case "igual":
      return alertProblemText("nivel-igual");
    case "ok":
      return `${preview.direction === "above" ? "Acima" : "Abaixo"} do preco atual (${fmtPctSigned(preview.distancePct, Math.abs(preview.distancePct ?? 0) < 0.1 ? 3 : 2)}).${preview.far ? " Longe do preco atual, confira o valor." : ""}`;
  }
}

export interface AlertsMenuProps {
  /** The instrument in focus: new alerts are for it. */
  instId?: string | null;
  /** Last price by instrument, null when unknown. The menu never invents one. */
  prices?: Readonly<Record<string, number | null>>;
  /** Exchange time in ms, 0 until measured. */
  nowMs?: number;
}

/**
 * Price alerts, the bell of a charting platform. A notice the user sets for a level: it fires once while this tab is
 * open, shows a still badge with the number of unseen fires, and never sends anything nor creates an order.
 */
export function AlertsMenu({ instId = null, prices, nowMs = 0 }: AlertsMenuProps) {
  const { alerts, unseen, create, remove, clearFired, markSeen } = useAlerts(prices, nowMs);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [created, setCreated] = useState("");
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && unseen > 0) markSeen();
  }, [open, unseen, markSeen]);

  // Opening the panel, by click or by the "A" key, puts the cursor in the field, as a trading platform does.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const last = instId ? (prices?.[instId] ?? null) : null;
  const preview = levelPreview(text, last);
  const canCreate = instId !== null && preview.kind === "ok";
  const hasFired = alerts.some((alert) => alert.firedAtMs !== null);
  const firedPhrase = unseen === 1 ? "1 alerta disparou" : `${unseen} alertas dispararam`;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!instId) return;
    const result = create(instId, text, last);
    if (result.ok) {
      setText("");
      setRefusal(null);
      setCreated(`Alerta criado: ${describeAlert(result.alert)}`);
    } else {
      setCreated("");
      setRefusal(alertProblemText(result.problem));
    }
  };

  return (
    <>
    <TopbarPopover
      label="Alertas de preco"
      variant="icon"
      tool="alerts"
      onOpenChange={setOpen}
      face={
        <>
          <svg {...ICON}>
            <path d="M8 2.2a3.8 3.8 0 0 0-3.8 3.8c0 3-1.2 4-1.7 4.6h11c-.5-.6-1.7-1.6-1.7-4.6A3.8 3.8 0 0 0 8 2.2Z" />
            <path d="M6.6 13a1.5 1.5 0 0 0 2.8 0" />
          </svg>
          <span className={styles.srOnly}>{unseen > 0 ? `Alertas de preco, ${firedPhrase}` : "Alertas de preco"}</span>
          {unseen > 0 ? <span className={styles.badge} data-badge="" aria-hidden="true">{unseen}</span> : null}
        </>
      }
    >
      <h2 className={styles.heading}>Alertas de preco</h2>

      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label} htmlFor={fieldId}>
          Avisar quando {instId ?? "o ativo"} chegar a
        </label>
        <div className={styles.row}>
          <input
            ref={inputRef}
            id={fieldId}
            className={styles.input}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder={last !== null ? fmtLevel(last) : "Preco indisponivel"}
            value={text}
            disabled={last === null}
            onChange={(event) => {
              setText(event.target.value);
              setRefusal(null);
            }}
          />
          <button className={styles.create} type="submit" disabled={!canCreate}>
            Criar alerta
          </button>
        </div>
        <p className={styles.preview} data-kind={refusal ? "invalido" : preview.kind}>{refusal ?? previewText(preview)}</p>
        <span className={styles.srOnly} role="status" aria-live="polite">{created}</span>
      </form>

      {alerts.length === 0 ? (
        <p className={styles.empty}>Nenhum alerta ainda.</p>
      ) : (
        <ul className={styles.list} aria-label="Alertas">
          {alerts.map((alert) => (
            <li key={alert.id} className={styles.item} data-state={alert.firedAtMs === null ? "waiting" : "fired"}>
              <span className={styles.itemText}>
                <span className={styles.itemTitle}>{`${alert.instId} ${alert.direction === "above" ? "acima" : "abaixo"} de ${fmtLevel(alert.level)}`}</span>
                <span className={styles.itemState}>{alertState(alert, prices?.[alert.instId])}</span>
              </span>
              <button type="button" className={styles.remove} aria-label={`Remover alerta: ${describeAlert(alert)}`} title="Remover" onClick={() => remove(alert.id)}>
                <svg {...ICON}>
                  <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasFired ? (
        <button type="button" className={styles.clear} onClick={clearFired}>
          Limpar os disparados
        </button>
      ) : null}

      <p className={styles.note}>Valem so com esta aba aberta. Nada e enviado e nenhuma ordem e criada.</p>
    </TopbarPopover>
    <span className={styles.srOnly} role="status" aria-live="polite">{unseen > 0 ? firedPhrase : ""}</span>
    </>
  );
}
