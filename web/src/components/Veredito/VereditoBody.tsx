import { confidenceLine, planRows, SEAL_WORD, zoneLine } from "@/lib/veredito/lines";
import type { Veredito } from "@/lib/veredito/types";
import { baseSymbol } from "@/lib/desk/ui/format";
import { Anotado } from "./Anotado";
import styles from "./Veredito.module.css";

export interface VereditoBodyProps {
  readonly veredito: Veredito;
  readonly instId: string;
  /** Slots for the two small stateful pieces (the person's profile and the Placar), so this body stays a pure drawing. */
  readonly perfilSlot?: React.ReactNode;
  readonly placarSlot?: React.ReactNode;
}

/**
 * The Veredito (VER-1): the seal, the sentence, up to three reasons in plain words, what can go wrong, the plan of risk and the
 * warnings, always with the line that says nothing was sent. The seal is a word, not only a colour. When a gate forced "esperar"
 * the sentence says which one in its own words. The plan is shown as a calculation over the risk the person chose, never as a
 * forecast; where a number depends on a measurement that has not been made, the card says it is not measured.
 */
export function VereditoBody({ veredito: v, instId, perfilSlot, placarSlot }: VereditoBodyProps) {
  const rows = v.plano === null ? [] : planRows(v.plano, baseSymbol(instId));
  const zone = zoneLine(v.notaZona);
  return (
    <div className={styles.root} role="group" aria-label="Veredito do Inonu" data-selo={v.selo} data-gate={v.forcadoPor ?? "nenhum"}>
      <div className={styles.head}>
        <span className={styles.seal} data-selo={v.selo}>{SEAL_WORD[v.selo]}</span>
        <p className={styles.message}>{v.mensagem}</p>
      </div>

      {v.motivos.length > 0 ? (
        <section className={styles.block} aria-label={v.selo === "esperar" ? "Por que esperar" : "Por que"}>
          <h4 className={styles.title}>{v.selo === "esperar" ? "Por que esperar" : "Por que"}</h4>
          <ul className={styles.list}>
            {v.motivos.map((m) => (
              <li key={m}><Anotado texto={m} /></li>
            ))}
          </ul>
        </section>
      ) : null}

      {v.risco !== null ? (
        <section className={styles.block} aria-label="O que pode dar errado">
          <h4 className={styles.title}>O que pode dar errado</h4>
          <p className={styles.text}><Anotado texto={v.risco} /></p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className={styles.block} aria-label="Plano de risco">
          <h4 className={styles.title}>Plano de risco, calculo e nao previsao</h4>
          <dl className={styles.plan}>
            {rows.map((r) => (
              <div key={r.rotulo} className={styles.row}>
                <dt><Anotado texto={r.rotulo} /></dt>
                <dd>
                  <span className={styles.value}>{r.valor}</span>
                  {r.dica === null ? null : <span className={styles.hint}>{r.dica}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {v.plano !== null && v.plano.tamanho === null ? perfilSlot ?? null : null}
        </section>
      ) : null}

      <p className={styles.meta}>
        {confidenceLine(v.confianca)}
        {zone === null ? null : <> <Anotado texto={zone} /></>}
      </p>

      {v.avisos.length > 0 ? (
        <ul className={styles.warnings} aria-label="Avisos">
          {v.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}

      {placarSlot ?? null}
      <p className={styles.consultive}>{v.consultivo}</p>
    </div>
  );
}
