"use client";

/**
 * The Doctor screen (WIN-8, AC-WIN-5): eight checks of the installed app, each with its status in words, what it found
 * and what to do. The report comes from the desktop core (`/__inonu/doctor`); in a dev server there is none and the
 * screen says so. The drawing part is a pure component so every state is rendered in tests without a server.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDoctor, STATUS_TEXT, type DoctorReport, type DoctorResult } from "@/lib/doctor/client";
import styles from "./DoctorView.module.css";

export type DoctorViewState =
  | { readonly phase: "loading" }
  | { readonly phase: "error"; readonly error: Extract<DoctorResult, { ok: false }>["error"] }
  | { readonly phase: "ready"; readonly report: DoctorReport };

const ERROR_TEXT: Record<Extract<DoctorResult, { ok: false }>["error"], string> = {
  not_in_app: "O diagnostico so existe no aplicativo instalado. Abra o Inonu Trader pelo atalho do menu Iniciar.",
  unreachable: "O servidor local nao respondeu. Feche o Inonu Trader e abra de novo.",
  schema: "O servidor local respondeu algo inesperado. Atualize o aplicativo.",
};

function summaryOf(report: DoctorReport): string {
  const count = (status: string) => report.items.filter((item) => item.status === status).length;
  return `${count("ok")} ok, ${count("atencao")} atencao, ${count("falha")} falha, ${count("nao_verificado")} nao verificado`;
}

export function DoctorScreen({ state, busy, onRetry }: { state: DoctorViewState; busy: boolean; onRetry: () => void }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>INONU TRADER</p>
          <h1 className={styles.title}>Diagnostico</h1>
          <p className={styles.subtitle}>O que esta funcionando nesta maquina</p>
        </div>
        <a className={styles.backLink} href="/">Voltar a mesa</a>
      </header>

      {state.phase === "loading" ? <p className={styles.notice}>Verificando</p> : null}
      {state.phase === "error" ? <p className={styles.notice} role="alert">{ERROR_TEXT[state.error]}</p> : null}

      {state.phase === "ready" ? (
        <>
          <p className={styles.summary}>
            {summaryOf(state.report)}. Verificado as {new Date(state.report.checkedAtMs).toLocaleTimeString("pt-BR")}.
          </p>
          <ul className={styles.list}>
            {state.report.items.map((item) => (
              <li key={item.id} className={styles.item} data-status={item.status}>
                <div className={styles.itemHead}>
                  <h2 className={styles.itemLabel}>{item.label}</h2>
                  <span className={styles.badge} data-status={item.status}>{STATUS_TEXT[item.status]}</span>
                </div>
                <p className={styles.message}>{item.message}</p>
                {item.action ? <p className={styles.action}><strong>O que fazer:</strong> {item.action}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <button type="button" className={styles.button} onClick={onRetry} disabled={busy}>Verificar de novo</button>
    </main>
  );
}

export default function DoctorView() {
  const [state, setState] = useState<DoctorViewState>({ phase: "loading" });
  const [busy, setBusy] = useState(true);
  const alive = useRef(true);

  const check = useCallback(async () => {
    setBusy(true);
    const result = await fetchDoctor();
    if (!alive.current) return;
    setState(result.ok ? { phase: "ready", report: result.report } : { phase: "error", error: result.error });
    setBusy(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    void check();
    return () => {
      alive.current = false;
    };
  }, [check]);

  return <DoctorScreen state={state} busy={busy} onRetry={() => void check()} />;
}
