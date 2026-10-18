"use client";

import { useEffect, useMemo, useState } from "react";
import { createVereditoClient } from "@/lib/veredito/client";
import type { Medicao } from "@/lib/veredito/parse";
import styles from "./Veredito.module.css";

const REFRESH_MS = 60_000;

/** What is being measured: the honest Placar of the answers and the state of the recorder that feeds it. Pure drawing. */
export function MedicaoView({ medicao }: { readonly medicao: Medicao | null }) {
  if (medicao === null) return null;
  const g = medicao.gravador;
  return (
    <section className={styles.medicao} aria-label="O que esta sendo medido" data-estado={medicao.placar.estado}>
      <h3 className={styles.title}>Medicao</h3>
      <p className={styles.text}>{medicao.placar.texto}</p>
      {g === null ? null : g.ligado ? (
        <p className={styles.text}>Gravador ligado: {g.fotos} fotos do mercado, {g.resultados} resultados medidos e {g.respostas} respostas guardadas, nesta maquina.</p>
      ) : (
        <p className={styles.text}>Gravador desligado. Nada esta sendo medido.</p>
      )}
      {g !== null && g.falhasDeGravacao > 0 ? <p className={styles.text}>Atencao: {g.falhasDeGravacao} falhas ao gravar. Confira o espaco em disco.</p> : null}
    </section>
  );
}

/** Reads the core once a minute. It never calls the model. */
export default function MedicaoPanel() {
  const client = useMemo(() => createVereditoClient(), []);
  const [medicao, setMedicao] = useState<Medicao | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => void client.medicao().then((m) => alive && setMedicao(m));
    read();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") read();
    }, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client]);
  return <MedicaoView medicao={medicao} />;
}
