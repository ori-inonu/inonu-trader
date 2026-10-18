"use client";

/**
 * The Settings section about the Inonu (T7.4, CFG-5, CFG-8): what it used (calls that reached the model, tokens the provider
 * measured, dollars only when the person gave a price), the form for that price, and the addresses the app talks to, read from
 * the versioned manifest of the core. The drawing part is pure so each state is rendered in tests without a server.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createInonuClient } from "@/lib/inonu/client";
import { priceLine, recentLine, totalsLine, type ProviderRow, type Usage } from "@/lib/inonu/usage";
import styles from "./SettingsView.module.css";

export interface InonuUsagePanelProps {
  /** Null when the core did not answer. */
  readonly usage: Usage | null;
  readonly providers: readonly ProviderRow[] | null;
  readonly nowMs: number;
  /** The result of the last save, in words; null before any. */
  readonly saved: string | null;
  readonly onSavePrices: (input: number, output: number) => void;
  readonly onClearPrices: () => void;
  readonly onRefresh: () => void;
}

const parsePrice = (text: string): number | null => {
  const value = Number(text.trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function InonuUsagePanel({ usage, providers, nowMs, saved, onSavePrices, onClearPrices, onRefresh }: InonuUsagePanelProps) {
  const [input, setInput] = useState(usage?.prices.input === null || usage === null ? "" : String(usage.prices.input));
  const [output, setOutput] = useState(usage?.prices.output === null || usage === null ? "" : String(usage.prices.output));
  const [formError, setFormError] = useState<string | null>(null);
  // the fields follow the price in force when it changes (after a save or a reload)
  useEffect(() => {
    setInput(usage === null || usage.prices.input === null ? "" : String(usage.prices.input));
    setOutput(usage === null || usage.prices.output === null ? "" : String(usage.prices.output));
  }, [usage?.prices.input, usage?.prices.output]); // eslint-disable-line react-hooks/exhaustive-deps -- only the two numbers matter
  const hasPrice = usage !== null && usage.prices.input !== null;

  return (
    <>
      <section className={styles.section} aria-label="Uso do Inonu">
        <p className={styles.eyebrow}>03 / MODELO E CUSTOS</p><h2 className={styles.heading}>Uso do Inonu</h2>
        {usage === null ? (
          <p className={styles.sectionNote}>Leitura do uso indisponivel: o nucleo local nao respondeu</p>
        ) : (
          <>
            <div className={styles.usageTotals}><p>Hoje: {totalsLine(usage.today)}</p><p>No mes: {totalsLine(usage.month)}</p></div>
            <p className={styles.fieldNote}>{priceLine(usage.prices)}</p>
            {usage.recent.length === 0 ? (
              <p className={styles.fieldNote}>Nenhum pedido ao modelo ainda</p>
            ) : (
              <ul className={styles.privacyList}>
                {usage.recent.map((call) => (
                  <li key={`${call.atMs}-${call.modo}`}>{recentLine(call, nowMs)}</li>
                ))}
              </ul>
            )}
            <div className={styles.priceFields}>
              <label className={styles.inlineField}>
                <span>Entrada (USD / milhao de tokens)</span>
                <input className={styles.inputSmall} type="text" inputMode="decimal" aria-label="Dolares por milhao de tokens de entrada" value={input} onChange={(e) => setInput(e.target.value)} />
              </label>
              <label className={styles.inlineField}>
                <span>Saida (USD / milhao de tokens)</span>
                <input className={styles.inputSmall} type="text" inputMode="decimal" aria-label="Dolares por milhao de tokens de saida" value={output} onChange={(e) => setOutput(e.target.value)} />
              </label>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  const a = parsePrice(input);
                  const b = parsePrice(output);
                  if (a === null || b === null) {
                    setFormError("Informe os dois precos como numeros positivos");
                    return;
                  }
                  setFormError(null);
                  onSavePrices(a, b);
                }}
              >
                Salvar precos
              </button>
              {hasPrice ? (
                <button type="button" className={styles.buttonGhost} onClick={onClearPrices}>
                  Limpar precos
                </button>
              ) : null}
              <button type="button" className={styles.buttonGhost} onClick={onRefresh}>
                Atualizar
              </button>
            </div>
            {formError !== null ? <p className={styles.result}>{formError}</p> : null}
            {saved !== null ? <p className={styles.result}>{saved}</p> : null}
            <p className={styles.sectionNote}>O preco e o do seu contrato com o provedor do modelo; o app nao o conhece. Sem preco, so a contagem de pedidos limita o dia.</p>
          </>
        )}
      </section>

      <section className={styles.section} aria-label="Enderecos que o app usa">
        <h2 className={styles.heading}>Enderecos que o app usa</h2>
        {providers === null ? (
          <p className={styles.sectionNote}>Lista de enderecos indisponivel</p>
        ) : (
          <ul className={styles.providers}>
            {providers.map((p) => (
              <li key={p.id}>
                <strong>{p.label}</strong><div><code>{p.url}</code><span>{p.uso}. Custo: {p.custo}. Quem fala: {p.quemFala}.</span></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

const SAVE_REASON: Readonly<Record<string, string>> = {
  precos_invalidos: "Precos invalidos",
  nao_foi_possivel_salvar: "Nao foi possivel salvar na pasta de dados",
  servidor_sem_rota: "O servidor local desta janela e antigo e nao tem esta rota",
  sem_conexao: "Sem conexao com o servidor local",
};

export default function InonuUsage() {
  const client = useMemo(() => createInonuClient(), []);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [providers, setProviders] = useState<readonly ProviderRow[] | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(() => {
    void client.usage().then(setUsage);
    setNowMs(Date.now());
  }, [client]);
  useEffect(() => {
    refresh();
    void client.providers().then(setProviders);
  }, [client, refresh]);

  const save = (input: number | null, output: number | null) =>
    void client.setPrices(input, output).then((result) => {
      setSaved(result.ok ? (input === null ? "Precos removidos" : "Precos salvos") : (SAVE_REASON[result.reason] ?? "Nao foi possivel salvar"));
      refresh();
    });

  return <InonuUsagePanel usage={usage} providers={providers} nowMs={nowMs} saved={saved} onSavePrices={(a, b) => save(a, b)} onClearPrices={() => save(null, null)} onRefresh={refresh} />;
}
