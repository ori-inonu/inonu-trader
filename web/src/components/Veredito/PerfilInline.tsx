"use client";

import { useMemo, useState } from "react";
import { parseNumberInput } from "@/lib/veredito/lines";
import { createVereditoClient } from "@/lib/veredito/client";
import styles from "./Veredito.module.css";

export interface PerfilFormProps {
  readonly capital: string;
  readonly risco: string;
  readonly nota: string | null;
  readonly ocupado: boolean;
  readonly onCapital: (value: string) => void;
  readonly onRisco: (value: string) => void;
  readonly onSalvar: () => void;
}

/** The two numbers the size needs: the capital the person trades with and the share of it they accept to lose in one operation. */
export function PerfilForm(p: PerfilFormProps) {
  return (
    <form
      className={styles.form}
      aria-label="Seu risco"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSalvar();
      }}
    >
      <p className={styles.formNote}>Para ver o tamanho, diga com quanto voce opera e quanto aceita perder em uma operacao.</p>
      <div className={styles.formRow}>
        <label className={styles.label}>
          Capital em dolares
          <input className={styles.input} inputMode="decimal" autoComplete="off" value={p.capital} onChange={(e) => p.onCapital(e.target.value)} placeholder="1000" />
        </label>
        <label className={styles.label}>
          Risco por operacao em %
          <input className={styles.input} inputMode="decimal" autoComplete="off" value={p.risco} onChange={(e) => p.onRisco(e.target.value)} placeholder="0,5" />
        </label>
        <button type="submit" className={styles.save} disabled={p.ocupado}>Salvar</button>
      </div>
      {p.nota === null ? null : <p className={styles.formNote} role="status">{p.nota}</p>}
    </form>
  );
}

const REASON: Readonly<Record<string, string>> = {
  perfil_invalido: "Use um capital maior que zero e um risco de ate 10%.",
  servidor_sem_rota: "O servidor local desta janela e antigo. Feche o Inonu Trader e abra de novo.",
  sem_conexao: "Sem conexao com o servidor local.",
};

/** Saves the profile in the core, on this machine. The size appears at the next answer: the one on screen was composed without it. */
export default function PerfilInline() {
  const client = useMemo(() => createVereditoClient(), []);
  const [capital, setCapital] = useState("");
  const [risco, setRisco] = useState("");
  const [nota, setNota] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const salvar = () => {
    const c = parseNumberInput(capital);
    const r = parseNumberInput(risco);
    if (c === null || r === null || !(c > 0) || !(r > 0) || r > 10) {
      setNota(REASON.perfil_invalido!);
      return;
    }
    setOcupado(true);
    void client.salvarPerfil({ capitalUsd: c, riskPct: r }).then((result) => {
      setOcupado(false);
      setNota(result.ok ? "Salvo. Na proxima resposta o tamanho aparece." : (REASON[result.reason] ?? "Nao foi possivel salvar agora."));
    });
  };

  return <PerfilForm capital={capital} risco={risco} nota={nota} ocupado={ocupado} onCapital={setCapital} onRisco={setRisco} onSalvar={salvar} />;
}
